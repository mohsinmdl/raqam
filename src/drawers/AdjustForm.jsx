// Correct balance drawer (reworked, design v2): you type the balance the bank
// actually shows; the signed delta is derived and recorded as a labelled
// adjustment transaction. A confirmed snapshot is never overwritten.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { fmtSigned, monthLabel } from '../lib/calc.js';
import { currentMonth } from '../lib/dates.js';
import { adjustBalance } from '../store/actions.js';
import { instName } from '../lib/txRow.js';
import { Label, FieldError, AmountField, TextField, grid2, noteBox } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const a = S.accounts.find(x => x.id === f.accountId);
  const cur = f.currentBalance ?? 0;
  const target = parseAmt(f.newBalance);
  const delta = isFinite(target) ? target - cur : null;
  const historic = f.date && f.date.slice(0, 7) < currentMonth();

  return (
    <>
      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--elev)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{a ? a.nickname + ' · ' + instName(S, a.instId) : ''}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
          Balance recorded now: <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{money(cur)}</span>
        </div>
      </div>
      <div style={grid2}>
        <div>
          <Label htmlFor="j-target" required>Corrected balance</Label>
          <AmountField id="j-target" field="newBalance" />
          <FieldError msg={errors.newBalance} />
        </div>
        <div>
          <Label htmlFor="j-date" required>Effective date</Label>
          <TextField id="j-date" field="date" type="date" />
          <FieldError msg={errors.date} />
        </div>
      </div>
      <div>
        <Label htmlFor="j-reason" required>Reason</Label>
        <TextField id="j-reason" field="reason" placeholder="e.g. Missed ATM withdrawal" />
        <FieldError msg={errors.reason} />
      </div>
      {delta != null && delta !== 0 && (
        <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px' }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>Difference: </span>
          <span className="tnum" style={{ fontWeight: 600, color: delta < 0 ? 'var(--neg)' : 'var(--pos)' }}>{fmtSigned(delta, false)}</span>
          {' '}— recorded as {delta > 0 ? 'an increase' : 'a decrease'} labelled “Balance adjustment”, excluded from income and expenses.
        </div>
      )}
      {historic && (
        <div role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--warn-soft)', fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: 'var(--warn)' }}>Closed month — </span>
          this correction is dated in {monthLabel(f.date.slice(0, 7))}; that period&apos;s reports will change. The confirmed opening snapshot is never overwritten.
        </div>
      )}
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form, errs = {};
    const target = parseAmt(f.newBalance);
    const delta = isFinite(target) ? target - (f.currentBalance ?? 0) : NaN;
    if (!isFinite(target)) errs.newBalance = 'Enter the corrected balance in rupees.';
    else if (delta === 0) errs.newBalance = 'That is already the recorded balance.';
    if (!String(f.reason || '').trim()) errs.reason = 'Add a short reason — corrections are kept in history.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || ''))) errs.date = 'Choose an effective date.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => adjustBalance(data, { accountId: f.accountId, delta, reason: f.reason, date: f.date, currentBalance: f.currentBalance ?? 0 }));
    closeDrawer();
    notify('Balance correction recorded and labelled.');
  };
}

export const adjustFormDef = {
  title: () => 'Correct balance',
  sub: () => 'A labelled correction, kept in history',
  cta: () => 'Record correction',
  Body,
  useSubmit,
};
