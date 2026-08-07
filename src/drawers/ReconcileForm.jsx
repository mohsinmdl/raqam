// Reconcile drawer: confirm one account's balance. You type the balance the
// bank actually shows; if it differs from Raqam's figure a labelled adjustment
// is recorded, then the month's opening snapshot is marked confirmed (stamping
// "Reconciled …"). Reuses adjustBalance + confirmSnapshots.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { fmtSigned, openingOf } from '../lib/calc.js';
import { currentMonth, todayStr } from '../lib/dates.js';
import { adjustBalance, confirmSnapshots } from '../store/actions.js';
import { instName } from '../lib/txRow.js';
import { Label, FieldError, AmountField, noteBox } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const a = S.accounts.find(x => x.id === f.accountId);
  const cur = f.currentBalance ?? 0;
  const target = parseAmt(f.balance);
  const delta = isFinite(target) ? target - cur : null;

  return (
    <>
      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--elev)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{a ? a.nickname + ' · ' + instName(S, a.instId) : ''}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
          Balance in Raqam: <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{money(cur)}</span>
        </div>
      </div>
      <div>
        <Label htmlFor="r-bal" required>Balance at your bank</Label>
        <AmountField id="r-bal" field="balance" />
        <FieldError msg={errors.balance} />
      </div>
      {delta != null && delta !== 0 && (
        <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px' }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>Difference: </span>
          <span className="tnum" style={{ fontWeight: 600, color: delta < 0 ? 'var(--neg)' : 'var(--pos)' }}>{fmtSigned(delta, false)}</span>
          {' '}— recorded as a labelled “Balance adjustment”, then the account is marked reconciled.
        </div>
      )}
      {delta === 0 && (
        <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px', fontSize: 12.5, color: 'var(--muted)' }}>
          Matches — reconciling confirms this month’s opening balance.
        </div>
      )}
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form, errs = {};
    const cur = f.currentBalance ?? 0;
    const target = parseAmt(f.balance);
    if (!isFinite(target)) errs.balance = 'Enter your bank balance in rupees.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    const delta = target - cur;
    const month = currentMonth();
    const a = S.accounts.find(x => x.id === f.accountId);
    const openingAmount = a ? openingOf(a, S.snapshots, month) : 0;
    applyData(data => {
      const corrected = delta !== 0
        ? adjustBalance(data, { accountId: f.accountId, delta, reason: 'Reconciled', date: todayStr(), currentBalance: cur })
        : data;
      return confirmSnapshots(corrected, { values: { [f.accountId]: openingAmount } });
    });
    closeDrawer();
    notify(delta !== 0 ? 'Reconciled — balance adjusted.' : 'Reconciled.');
  };
}

export const reconcileFormDef = {
  title: () => 'Reconcile',
  sub: () => 'Confirm your account balance',
  cta: () => 'Reconcile',
  Body,
  useSubmit,
};
