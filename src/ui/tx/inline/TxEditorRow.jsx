// The inline editor — the third shell over the drawer form (desktop drawer /
// phone TxSheet / this). Two <tr>s: the cells row aligned to the register's
// columns, and an action row (errors, dup warning, Cancel/Save/Save-and-add-
// another). All state lives in the drawer context; all translation lives in
// txEditorState. Enter saves (unless a popover consumed it), Escape is handled
// by DrawerProvider's session listener.
import { useEffect, useRef, useState } from 'react';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { txFormDef } from '../../../drawers/TxForm.jsx';
import { txDefaults } from '../../../drawers/openers.js';
import { ruleFromTx } from '../../../lib/schedule.js';
import { cellsFromForm, editorPatch, editableCells, errorCells, firstEmptyCell, keepForNext, sourceRef, tabCells, tabTarget } from '../../../lib/txEditorState.js';
import { blankLine, splitHalves } from '../../../lib/splitTx.js';
import { autoCategoryPatchArgs } from '../../../lib/payees.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import { CheckIcon } from '../../icons.jsx';
import AccountCell from './AccountCell.jsx';
import DateCell from './DateCell.jsx';
import PayeeCell from './PayeeCell.jsx';
import CategoryCell from './CategoryCell.jsx';
import AmountCell from './AmountCell.jsx';
import SplitRows from './SplitRows.jsx';

const cellTd = { padding: '4px 4px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', background: 'var(--soft)' };
const btn = accent => ({ height: 30, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: accent ? 'none' : '1px solid var(--border)', background: accent ? 'var(--accent)' : 'var(--surface)', color: accent ? 'var(--on-accent)' : 'var(--text)' });

export default function TxEditorRow({ hideAccount, hideMemo, showBalance, colSpan, scopeRef }) {
  const { drawer, setForm, setField, openDrawer, requestClose } = useDrawer();
  const { data: S } = useStore();
  const submit = txFormDef.useSubmit();
  const f = drawer.form;
  const cells = cellsFromForm(f);
  const can = editableCells(f);
  const isEdit = !!f.editId;
  const type = f.type || 'expense';
  const isTransfer = type === 'transfer';
  // Same visibility rules the drawer used (TxForm.jsx fx* truth table).
  const canSplit = type === 'expense' && !f.editId && !f.fromRecurring;
  const splitOn = canSplit && !!f.splitOn;
  const showRepeat = (type === 'expense' || type === 'income') && !f.fromRecurring && !ruleFromTx(S, f.editId) && !splitOn;
  const catType = type === 'income' ? 'income' : 'expense';
  // Computed once per session: which cell greets the keyboard.
  const [focusKey] = useState(() => firstEmptyCell(cellsFromForm(f), hideAccount));

  // Field-attributed validation (Wave H): which cells a failed submit's
  // errors belong to, in the row's own left-to-right column order — the
  // order a failed submit moves focus through below.
  const cellErrors = errorCells(drawer.errors, f);
  const CELL_ORDER = ['account', 'date', 'payee', 'category', 'outflow', 'inflow'];
  const cellRefs = {
    account: useRef(null), date: useRef(null), payee: useRef(null),
    category: useRef(null), memo: useRef(null), outflow: useRef(null),
    inflow: useRef(null), cleared: useRef(null),
  };
  // The row owns Tab: strict column-to-column, never into an open popup's
  // internals (the calendar alone contributes ~45 native stops). Each td
  // carries onTab(key); a keydown inside a PORTALLED popup still bubbles here
  // because React portals propagate through the React tree, so Tab pressed on
  // a highlighted account option or a calendar day walks the same path. The
  // cells' own commit-on-Tab handlers run first (target-outward order) and
  // leave preventDefault to this handler — a cell that DOES preventDefault
  // (the account cell's Shift+Tab-while-open) opts out of the row move.
  const tabWalk = tabCells({ hideAccount, hideMemo, can });
  // Always-fresh mirror of the walk: a cell's Tab-commit can change the form
  // — and so the walk — INSIDE the same keystroke (committing a To/From payee
  // turns the row into a transfer, whose walk has no category cell). React
  // flushes that update synchronously at the end of the event dispatch, so by
  // the time the microtask below runs this ref holds the post-commit walk.
  const tabWalkRef = useRef(tabWalk);
  tabWalkRef.current = tabWalk;
  const onTab = key => e => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    // The amount cells' ⌗ trigger sits before its input INSIDE the td; from
    // it, native Tab already lands on that same cell's input — jumping a
    // whole column from there would skip the field the trigger serves.
    if (e.target.closest && e.target.closest('[data-calc-trigger]')) return;
    if (!tabTarget(tabWalk, key, e.shiftKey)) return; // off either end: the browser takes over
    // preventDefault only once the walk has said there IS somewhere to go —
    // a swallowed keystroke that moves nothing is the worst failure mode.
    e.preventDefault();
    const backward = e.shiftKey;
    queueMicrotask(() => {
      // Re-derive from the post-flush walk, then take the first target that
      // still has a mounted element: a cell can vanish between the two reads
      // (the transfer case above unmounts the category picker), and focus
      // sent to an unmounting node falls to <body>, stranding the keyboard.
      const walk = tabWalkRef.current;
      let next = tabTarget(walk, key, backward);
      while (next && !(cellRefs[next] && cellRefs[next].current)) next = tabTarget(walk, next, backward);
      if (next) cellRefs[next].current.focus();
    });
  };
  // The summary sentence under the row, ordered the way the row reads.
  // drawer.errList arrives in whatever order validate.transaction happened to
  // append its messages — which is neither the column order nor the order the
  // failed-submit focus walk (above) visits the cells, so "Pick a category.
  // Enter an amount. Choose an account." described a left-to-right row from
  // the middle, then the end, then the start. Attributed messages come first,
  // in CELL_ORDER; anything errList carries that belongs to no single cell
  // (a whole-form message, e.g. a split that doesn't sum) keeps its own order
  // at the end rather than being dropped.
  const errSummary = (() => {
    const attributed = CELL_ORDER.map(k => cellErrors[k]).filter(Boolean);
    const rest = drawer.errList.filter(m => !attributed.includes(m));
    return [...attributed, ...rest].join(' ');
  })();
  // The store lookup editorPatch/inflowType need but can't reach themselves:
  // whether a category is income- or expense-typed, to decide an income+
  // category pick or an inflow's type inference (see FIX 1 — a blind flip to
  // refund on any category was a data-corruption bug).
  const catTypeOf = id => (S.categories.find(c => c.id === id) || {}).type || null;
  const patch = (key, value) => setForm(editorPatch(f, key, value, { catTypeOf }));
  const saveAndAdd = async () => {
    const keep = keepForNext(f);
    // On a scoped register (a single account's page) the next row always
    // seeds that account, regardless of which side the finished row's ref
    // landed on (e.g. an inflow-direction transfer swaps from/to) — mirrors
    // the toolbar's own seeding and keeps the new row visible in this register.
    if (scopeRef) keep.payWith = scopeRef;
    if (await attemptSubmit()) openDrawer('addTx', { ...txDefaults('expense'), ...keep });
  };
  // Every submit trigger in the row (Enter, Save, Save-and-add-another) goes
  // through this one path — kept as a named wrapper around submit() so the
  // intent (attempting a save, which the effect below reacts to) reads clearly
  // at each call site.
  const attemptSubmit = () => submit();
  // drawer.errors only ever gets a NEW reference from fail() (a failed
  // submit), setDup(), or a fresh openDrawer() — never from setForm (typing),
  // which carries the existing errors object through unchanged. So reacting
  // to it here is exactly "a submit just failed" with no separate flag to
  // race against React's state batching (submit() calls fail() synchronously
  // before its own promise resolves, so a flag set after `await submit()`
  // can lose the race with the render this effect depends on).
  useEffect(() => {
    for (const key of CELL_ORDER) {
      if (cellErrors[key] && cellRefs[key].current) { cellRefs[key].current.focus(); break; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer.errors]);
  const pickPayee = name => {
    const payeePatch = editorPatch(f, 'payee', name, { catTypeOf });
    const auto = autoCategoryPatchArgs(S, name, f.category);
    if (!auto) { setForm(payeePatch); return; }
    // One setForm: category inference runs against the payee-patched form.
    const f2 = { ...f, ...payeePatch };
    setForm({ ...payeePatch, ...editorPatch(f2, 'category', auto, { catTypeOf }) });
  };
  const onRowKey = e => {
    if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') attemptSubmit();
  };

  return (
    <>
      <tr onKeyDown={onRowKey} style={{ height: '2.5rem' }}>
        {/* Not a checkbox: this cell used to hold a permanently-checked, readOnly
            one whose only job was to line the editor up with the selection
            column. It offered a keyboard stop and an accessible name for a
            control that could never do anything. It is a MARKER — same
            13px footprint, same accent fill, no semantics. The row already
            announces itself as the editor through its fields. */}
        <td style={{ ...cellTd, padding: 0, position: 'relative', minWidth: 34 }}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 18 }}>
            {/* CheckIcon (icons.jsx) is this shape, lifted out so the category
                picker's "Selected" tick draws the same path instead of a ✓
                text glyph. currentColor, hence the colour on the wrapper. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: 3, background: 'var(--accent)', color: 'var(--on-accent)', flex: 'none' }}>
              <CheckIcon size={9} />
            </span>
          </span>
        </td>
        {!hideAccount && (
          <td style={cellTd} onKeyDown={onTab('account')}>
            <AccountCell ref={cellRefs.account} value={cells.account} disabled={!can.account} onChange={v => patch('account', v)} autoFocus={focusKey === 'account'}
              autoOpen={focusKey === 'account'}
              invalid={!!cellErrors.account} errorMsg={cellErrors.account} />
          </td>
        )}
        <td style={cellTd} onKeyDown={onTab('date')}>
          <DateCell ref={cellRefs.date} value={cells.date} onChange={v => patch('date', v)} repeat={cells.repeat} onRepeat={v => patch('repeat', v)} showRepeat={showRepeat} disabled={!can.date}
            invalid={!!cellErrors.date} errorMsg={cellErrors.date} />
        </td>
        <td style={cellTd} onKeyDown={onTab('payee')}>
          <PayeeCell ref={cellRefs.payee} payee={cells.payee} transferTo={cells.transferTo} sourceRef={sourceRef(f)}
            onPickPayee={pickPayee} onPickTransfer={ref => patch('transfer', ref)}
            disabled={!can.payee} autoFocus={focusKey === 'payee'}
            invalid={!!cellErrors.payee} errorMsg={cellErrors.payee} />
        </td>
        <td style={cellTd} onKeyDown={onTab('category')}>
          {splitOn
            ? <button type="button" ref={cellRefs.category} className="field hv-soft" onClick={() => setForm({ splitOn: false, splits: undefined, category: (f.splits || [])[0]?.category || '', newCat: (f.splits || [])[0]?.newCat || '', newCatGroup: (f.splits || [])[0]?.newCatGroup || '' })}
                style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', width: '100%' }}>
                Split ({(f.splits || []).length}) — un-split
              </button>
            : <CategoryCell ref={cellRefs.category} value={cells.category} catType={catType} isTransfer={isTransfer} disabled={!can.category}
                invalid={!!cellErrors.category} errorMsg={cellErrors.category}
                onChange={id => patch('category', id)}
                onCreate={({ name, groupId }) => setForm({ category: '__new', newCat: name, newCatGroup: groupId || '' })}
                canSplit={canSplit} onSplit={() => {
                  // Seed a 50/50 prefill from the total (the common shared-purchase
                  // case); with no total yet the lines start empty as before.
                  // Mirrors TxForm.jsx's footer "Split across categories" button
                  // exactly, so the two entry paths cannot drift.
                  const halves = splitHalves(f.amount);
                  setForm({
                    splitOn: true, newCat: '', newCatGroup: '',
                    splits: [
                      { ...blankLine(), category: f.category === '__new' ? '' : (f.category || ''), amount: halves ? formatAmountInput(String(halves[0])) : '' },
                      { ...blankLine(), amount: halves ? formatAmountInput(String(halves[1])) : '' },
                    ],
                  });
                }} />}
        </td>
        {/* MEMO column folds away under ~1000px container width (registerColumns.js) —
            same fold as the register's own MEMO cell, driven by the same
            filtered `columns` the caller passed colSpan from. A hidden memo
            field keeps whatever value it already held (no data loss, just
            not editable while folded — matches how a folded ACCOUNT column
            already works here). */}
        {!hideMemo && (
          <td style={cellTd} onKeyDown={onTab('memo')}>
            <input ref={cellRefs.memo} className="field" placeholder="Memo" aria-label="Memo" disabled={!can.memo} value={cells.memo}
              onChange={e => patch('memo', e.target.value)}
              style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13 }} />
          </td>
        )}
        <td style={cellTd} onKeyDown={onTab('outflow')}>
          <AmountCell ref={cellRefs.outflow} value={cells.outflow} onCommit={v => patch('outflow', v)} placeholder="Outflow" ariaLabel="Outflow" disabled={!can.outflow}
            invalid={!!cellErrors.outflow} errorMsg={cellErrors.outflow} />
        </td>
        <td style={cellTd} onKeyDown={onTab('inflow')}>
          <AmountCell ref={cellRefs.inflow} value={cells.inflow} onCommit={v => patch('inflow', v)} placeholder="Inflow" ariaLabel="Inflow" disabled={!can.inflow}
            invalid={!!cellErrors.inflow} errorMsg={cellErrors.inflow} />
        </td>
        {/* BALANCE: a spacer, deliberately empty. The column only appears on an
            account-scoped, date-sorted register (registerColumns.js), and this
            row is not saved yet — it has no place in the running balance until
            it does. The cell still has to EXIST or every cell after it shifts
            one column left of its header. */}
        {showBalance && <td style={cellTd} />}
        <td style={{ ...cellTd, textAlign: 'center' }} onKeyDown={onTab('cleared')}>
          <button type="button" ref={cellRefs.cleared} onClick={() => patch('cleared', !cells.cleared)} aria-pressed={cells.cleared}
            aria-label={cells.cleared ? 'Cleared — click to unclear' : 'Uncleared — click to clear'} className="hv-soft"
            style={{ width: 22, height: 22, borderRadius: 999, cursor: 'pointer', fontSize: 10, fontWeight: 700,
              border: cells.cleared ? 'none' : '1.25px solid var(--muted)',
              background: cells.cleared ? 'var(--pos)' : 'transparent',
              color: cells.cleared ? 'var(--on-pos)' : 'var(--muted)' }}>C</button>
        </td>
      </tr>
      {splitOn && <SplitRows colSpan={colSpan} showBalance={showBalance} hideMemo={hideMemo} />}
      <tr>
        {/* The register's table wrapper can scroll horizontally on a narrow
            container (tx-table-wrap in Transactions.jsx, via a Base UI
            ScrollArea — src/ui/primitives/ScrollArea.jsx) — colSpan makes
            this td as wide as the whole scrollable row, so the
            actions would otherwise sit past the visible edge until the user
            scrolled all the way over.
            The td holds a full-width flex row that pushes its single child to
            the END, and that child — the shrink-to-fit action group — is
            sticky to right: 0. Unscrolled, the buttons sit under the amount
            columns they commit, which is where a ledger's confirm belongs and
            where the eye already is after typing the amount; scrolled, the
            same group pins to the right edge instead of drifting off it.
            (It was pinned LEFT before, which parked Save under the checkbox
            column — the far side of the row from the last field touched.)
            Messages come BEFORE the buttons in DOM order so a long error
            string grows leftwards into the empty span of the row rather than
            pushing the buttons out of the pinned box. When the table isn't
            actually overflowing (the common case at 1024/1366+) sticky has
            nothing to do and this renders as a plain right-aligned row. */}
        <td colSpan={colSpan} style={{ padding: '6px 12px 10px', borderBottom: '1px solid var(--border)', background: 'var(--soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, width: '100%', flexWrap: 'wrap' }}>
            {/* The messages sit in the full-width wrapper, BEFORE the buttons,
                but OUTSIDE the sticky group — deliberately. Inside it, a long
                sentence made the group itself wider than the scrollport, and
                sticky cannot move an element past its own containing block, so
                the pin gave out and the CTA hung off the right edge. Out here
                they shrink (minWidth 0) and wrap instead, and the group stays
                shrink-to-fit, which is what sticky needs to work at all.
                Not role="alert" on the summary. Every message in it is ALREADY
                announced by the sr-only alert on the cell it belongs to
                (AccountCell/DateCell/PayeeCell/CategoryCell/AmountCell), and
                focus moves to the first failing cell on the same render — so a
                second live region here read the whole failure out twice, the
                second time detached from any field. This is the SIGHTED
                summary of that same failure; 13/600 in --neg-strong carries it
                (--neg alone measures 4.40:1 on the row's --soft ground, just
                under the floor). */}
            {/* flex-basis 240 with grow AND shrink: on a roomy row the message
                shares the line with the buttons; on a row too narrow for both
                it takes a line of its own rather than being slid under the
                sticky group when that pins itself leftwards. */}
            {errSummary && (
              <span style={{ flex: '1 1 240px', minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--neg-strong)' }}>{errSummary}</span>
            )}
            {drawer.dupMsg && (
              <span role="alert" style={{ flex: '1 1 240px', minWidth: 0, fontSize: 12.5, color: 'var(--warn)' }}>
                <b>Possible duplicate — </b>{drawer.dupMsg}
              </span>
            )}
            <div style={{ position: 'sticky', right: 0, display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <button type="button" onClick={requestClose} className="hv-elev rq-btn-outline" style={btn(false)}>Cancel</button>
              {/* Secondary, not a second filled accent button: two identical
                  primaries side by side made the row ask which one is THE
                  save. The CTA is the only filled control here. */}
              {!isEdit && (
                <button type="button" onClick={saveAndAdd} className="hv-elev rq-btn-outline" style={btn(false)}>Save and add another</button>
              )}
              <button type="button" onClick={attemptSubmit} className="hv-accent rq-btn-solid" style={btn(true)}>{txFormDef.cta(drawer)}</button>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
