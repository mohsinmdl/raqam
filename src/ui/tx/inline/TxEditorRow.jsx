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
import { cellsFromForm, editorPatch, editableCells, errorCells, firstEmptyCell, keepForNext, sourceRef } from '../../../lib/txEditorState.js';
import { blankLine, splitHalves } from '../../../lib/splitTx.js';
import { autoCategoryPatchArgs } from '../../../lib/payees.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import AccountCell from './AccountCell.jsx';
import DateCell from './DateCell.jsx';
import PayeeCell from './PayeeCell.jsx';
import CategoryCell from './CategoryCell.jsx';
import AmountCell from './AmountCell.jsx';
import SplitRows from './SplitRows.jsx';

const cellTd = { padding: '4px 4px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', background: 'var(--soft)' };
const btn = accent => ({ height: 30, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: accent ? 'none' : '1px solid var(--border)', background: accent ? 'var(--accent)' : 'var(--surface)', color: accent ? 'var(--on-accent)' : 'var(--text)' });

export default function TxEditorRow({ hideAccount, hideMemo, colSpan, scopeRef }) {
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
    category: useRef(null), outflow: useRef(null), inflow: useRef(null),
  };
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
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: 3, background: 'var(--accent)', flex: 'none' }}>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" focusable="false">
                <path d="M1.6 5.2 3.9 7.5 8.4 2.7" stroke="var(--on-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </td>
        {!hideAccount && (
          <td style={cellTd}>
            <AccountCell ref={cellRefs.account} value={cells.account} disabled={!can.account} onChange={v => patch('account', v)} autoFocus={focusKey === 'account'}
              invalid={!!cellErrors.account} errorMsg={cellErrors.account} />
          </td>
        )}
        <td style={cellTd}>
          <DateCell ref={cellRefs.date} value={cells.date} onChange={v => patch('date', v)} repeat={cells.repeat} onRepeat={v => patch('repeat', v)} showRepeat={showRepeat} disabled={!can.date}
            invalid={!!cellErrors.date} errorMsg={cellErrors.date} />
        </td>
        <td style={cellTd}>
          <PayeeCell ref={cellRefs.payee} payee={cells.payee} transferTo={cells.transferTo} sourceRef={sourceRef(f)}
            onPickPayee={pickPayee} onPickTransfer={ref => patch('transfer', ref)}
            disabled={!can.payee} autoFocus={focusKey === 'payee'}
            invalid={!!cellErrors.payee} errorMsg={cellErrors.payee} />
        </td>
        <td style={cellTd}>
          {splitOn
            ? <button type="button" className="field hv-soft" onClick={() => setForm({ splitOn: false, splits: undefined, category: (f.splits || [])[0]?.category || '', newCat: (f.splits || [])[0]?.newCat || '', newCatGroup: (f.splits || [])[0]?.newCatGroup || '' })}
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
          <td style={cellTd}>
            <input className="field" placeholder="memo" aria-label="Memo" disabled={!can.memo} value={cells.memo}
              onChange={e => patch('memo', e.target.value)}
              style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13 }} />
          </td>
        )}
        <td style={cellTd}>
          <AmountCell ref={cellRefs.outflow} value={cells.outflow} onCommit={v => patch('outflow', v)} placeholder="outflow" ariaLabel="Outflow" disabled={!can.outflow}
            invalid={!!cellErrors.outflow} errorMsg={cellErrors.outflow} />
        </td>
        <td style={cellTd}>
          <AmountCell ref={cellRefs.inflow} value={cells.inflow} onCommit={v => patch('inflow', v)} placeholder="inflow" ariaLabel="Inflow" disabled={!can.inflow}
            invalid={!!cellErrors.inflow} errorMsg={cellErrors.inflow} />
        </td>
        <td style={{ ...cellTd, textAlign: 'center' }}>
          <button type="button" onClick={() => patch('cleared', !cells.cleared)} aria-pressed={cells.cleared}
            aria-label={cells.cleared ? 'Cleared — click to unclear' : 'Uncleared — click to clear'} className="hv-soft"
            style={{ width: 22, height: 22, borderRadius: 999, cursor: 'pointer', fontSize: 10, fontWeight: 700,
              border: cells.cleared ? 'none' : '1.25px solid var(--muted)',
              background: cells.cleared ? 'var(--pos)' : 'transparent',
              color: cells.cleared ? 'var(--on-pos)' : 'var(--muted)' }}>C</button>
        </td>
      </tr>
      {splitOn && <SplitRows colSpan={colSpan} />}
      <tr>
        {/* The register's table wrapper can scroll horizontally on a narrow
            container (tx-table-wrap, overflow-x: auto in Transactions.jsx) —
            colSpan makes this td as wide as the whole scrollable row, so
            Cancel/Save would otherwise sit past the visible edge until the
            user scrolled all the way over. The action group is its own
            sticky, shrink-to-fit box (not the full-width td) pinned to
            left: 0 of the scroll container, so it's the first thing in view
            at any scroll position — buttons first, messages after, so a long
            error/dup string can't push Save out of the pinned box. When the
            table isn't actually overflowing (the common case at 1024/1366+)
            sticky has nothing to do and this renders exactly as a normal
            flex row. */}
        <td colSpan={colSpan} style={{ padding: '6px 12px 10px', borderBottom: '1px solid var(--border)', background: 'var(--soft)' }}>
          <div style={{ position: 'sticky', left: 0, display: 'flex', alignItems: 'center', gap: 10, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
            <button type="button" onClick={requestClose} className="hv-elev" style={btn(false)}>Cancel</button>
            <button type="button" onClick={attemptSubmit} className="hv-accent" style={btn(true)}>{txFormDef.cta(drawer)}</button>
            {!isEdit && (
              <button type="button" onClick={saveAndAdd} className="hv-accent" style={btn(true)}>Save and add another</button>
            )}
            {drawer.errList.length > 0 && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--neg)' }}>{drawer.errList.join(' ')}</span>
            )}
            {drawer.dupMsg && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--warn)' }}>
                <b>Possible duplicate — </b>{drawer.dupMsg}
              </span>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}
