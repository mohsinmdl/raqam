// The inline editor — the third shell over the drawer form (desktop drawer /
// phone TxSheet / this). Two <tr>s: the cells row aligned to the register's
// columns, and an action row (errors, dup warning, Cancel/Save/Save-and-add-
// another). All state lives in the drawer context; all translation lives in
// txEditorState. Enter saves (unless a popover consumed it), Escape is handled
// by DrawerProvider's session listener.
import { useState } from 'react';
import { useDrawer } from '../../DrawerProvider.jsx';
import { useStore } from '../../../store/StoreProvider.jsx';
import { txFormDef } from '../../../drawers/TxForm.jsx';
import { txDefaults } from '../../../drawers/openers.js';
import { ruleFromTx } from '../../../lib/schedule.js';
import { cellsFromForm, editorPatch, editableCells, firstEmptyCell, keepForNext, sourceRef } from '../../../lib/txEditorState.js';
import { blankLine, splitHalves } from '../../../lib/splitTx.js';
import { formatAmountInput } from '../../../lib/amountInput.js';
import AccountCell from './AccountCell.jsx';
import DateCell from './DateCell.jsx';
import PayeeCell from './PayeeCell.jsx';
import CategoryCell from './CategoryCell.jsx';
import AmountCell from './AmountCell.jsx';
import SplitRows from './SplitRows.jsx';
import Checkbox from '../../Checkbox.jsx';

const cellTd = { padding: '4px 4px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', background: 'var(--soft)' };
const btn = accent => ({ height: 30, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: accent ? 'none' : '1px solid var(--border)', background: accent ? 'var(--accent)' : 'var(--surface)', color: accent ? 'var(--on-accent)' : 'var(--text)' });

export default function TxEditorRow({ hideAccount, colSpan, scopeRef }) {
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
    if (await submit()) openDrawer('addTx', { ...txDefaults('expense'), ...keep });
  };
  const onRowKey = e => {
    if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') submit();
  };

  return (
    <>
      <tr onKeyDown={onRowKey} style={{ height: '2.5rem' }}>
        <td style={{ ...cellTd, padding: 0, position: 'relative', minWidth: 34 }}>
          <Checkbox fill checked readOnly label="Editing this transaction" onChange={() => {}} />
        </td>
        {!hideAccount && (
          <td style={cellTd}>
            <AccountCell value={cells.account} disabled={!can.account} onChange={v => patch('account', v)} autoFocus={focusKey === 'account'} />
          </td>
        )}
        <td style={cellTd}>
          <DateCell value={cells.date} onChange={v => patch('date', v)} repeat={cells.repeat} onRepeat={v => patch('repeat', v)} showRepeat={showRepeat} disabled={!can.date} />
        </td>
        <td style={cellTd}>
          <PayeeCell payee={cells.payee} transferTo={cells.transferTo} sourceRef={sourceRef(f)}
            onPickPayee={v => patch('payee', v)} onPickTransfer={ref => patch('transfer', ref)}
            disabled={!can.payee} autoFocus={focusKey === 'payee'} />
        </td>
        <td style={cellTd}>
          {splitOn
            ? <button type="button" className="field hv-soft" onClick={() => setForm({ splitOn: false, splits: undefined, category: (f.splits || [])[0]?.category || '', newCat: (f.splits || [])[0]?.newCat || '', newCatGroup: (f.splits || [])[0]?.newCatGroup || '' })}
                style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', fontSize: 13, color: 'var(--muted)', cursor: 'pointer', width: '100%' }}>
                Split ({(f.splits || []).length}) — un-split
              </button>
            : <CategoryCell value={cells.category} catType={catType} isTransfer={isTransfer} disabled={!can.category}
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
        <td style={cellTd}>
          <input className="field" placeholder="memo" aria-label="Memo" disabled={!can.memo} value={cells.memo}
            onChange={e => patch('memo', e.target.value)}
            style={{ width: '100%', height: 28, padding: '0 8px', fontSize: 13 }} />
        </td>
        <td style={cellTd}>
          <AmountCell value={cells.outflow} onCommit={v => patch('outflow', v)} placeholder="outflow" ariaLabel="Outflow" disabled={!can.outflow} />
        </td>
        <td style={cellTd}>
          <AmountCell value={cells.inflow} onCommit={v => patch('inflow', v)} placeholder="inflow" ariaLabel="Inflow" disabled={!can.inflow} />
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
        <td colSpan={colSpan} style={{ padding: '6px 12px 10px', borderBottom: '1px solid var(--border)', background: 'var(--soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {drawer.errList.length > 0 && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--neg)', marginRight: 'auto' }}>{drawer.errList.join(' ')}</span>
            )}
            {drawer.dupMsg && (
              <span role="alert" style={{ fontSize: 12.5, color: 'var(--warn)', marginRight: 'auto' }}>
                <b>Possible duplicate — </b>{drawer.dupMsg}
              </span>
            )}
            <button type="button" onClick={requestClose} className="hv-elev" style={btn(false)}>Cancel</button>
            <button type="button" onClick={submit} className="hv-accent" style={btn(true)}>{txFormDef.cta(drawer)}</button>
            {!isEdit && (
              <button type="button" onClick={saveAndAdd} className="hv-accent" style={btn(true)}>Save and add another</button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}
