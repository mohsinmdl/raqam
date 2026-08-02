// Adjust balance drawer — template 727-740, drawerVals adjust section script
// 1229-1236, submitAdjust script 1359-1367.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { accountBalance } from '../lib/calc.js';
import { currentMonth } from '../lib/dates.js';
import { adjustBalance } from '../store/actions.js';
import { instName } from '../lib/txRow.js';
import { Label, FieldError, AmountField, TextField, SelectField, grid2, noteBox } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const a = S.accounts.find(x => x.id === f.accountId);
  const cur = a ? accountBalance(a, S, currentMonth()) : 0;
  const n = parseAmt(f.amount);
  const hasPreview = isFinite(n) && n > 0;

  return (
    <>
      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--elev)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{a ? a.nickname + ' · ' + instName(S, a.instId) : ''}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
          Current balance: <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{money(cur)}</span>
        </div>
      </div>
      <div style={grid2}>
        <div>
          <Label htmlFor="j-dir">Direction</Label>
          <SelectField id="j-dir" field="direction">
            <option value="increase">Increase balance</option>
            <option value="decrease">Decrease balance</option>
          </SelectField>
        </div>
        <div>
          <Label htmlFor="j-amount" required>Amount</Label>
          <AmountField id="j-amount" field="amount" />
          <FieldError msg={errors.amount} />
        </div>
      </div>
      <div>
        <Label htmlFor="j-reason" required>Reason</Label>
        <TextField id="j-reason" field="reason" placeholder="e.g. Missed ATM withdrawal" />
        <FieldError msg={errors.reason} />
      </div>
      {hasPreview && (
        <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px' }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>New balance: </span>
          <span className="tnum" style={{ fontWeight: 600 }}>{money(cur + (f.direction === 'decrease' ? -n : n))}</span>
          {' '}— recorded as a labelled adjustment, excluded from income and expenses.
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
    const amt = parseAmt(f.amount);
    if (!(amt > 0)) errs.amount = 'Enter an amount greater than zero.';
    if (!String(f.reason || '').trim()) errs.reason = 'Add a short reason for the adjustment.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => adjustBalance(data, { accountId: f.accountId, direction: f.direction, amt, reason: f.reason, date: f.date }));
    closeDrawer();
    notify('Balance adjustment recorded and labelled.');
  };
}

export const adjustFormDef = {
  title: () => 'Adjust balance',
  sub: () => 'A labelled correction, kept in history',
  cta: () => 'Record adjustment',
  Body,
  useSubmit,
};
