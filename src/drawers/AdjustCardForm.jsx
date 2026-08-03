// "Correct outstanding" drawer (design v2): target-value entry for a credit
// card's outstanding; the signed delta becomes a cardAdjustment transaction that
// moves liability but never income/expense. Negative targets are allowed
// (overpayment leaves a credit balance).
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { availableCredit, fmtSigned } from '../lib/calc.js';
import { adjustCardOutstanding } from '../store/actions.js';
import { Label, FieldError, Hint, AmountField, TextField, grid2, noteBox } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const card = S.cards.find(x => x.id === f.cardId);
  const cur = f.currentOutstanding ?? 0;
  const target = parseAmt(f.newOutstanding);
  const delta = isFinite(target) ? target - cur : null;
  const after = card && delta != null ? availableCredit(card, cur + delta, money) : null;

  return (
    <>
      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--elev)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{card ? card.nickname + ' ••' + card.last4 : ''}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
          Outstanding recorded now: <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{money(cur)}</span>
        </div>
      </div>
      <div style={grid2}>
        <div>
          <Label htmlFor="ac-target" required>Corrected outstanding</Label>
          <AmountField id="ac-target" field="newOutstanding" />
          <Hint>A negative value is allowed after an overpayment.</Hint>
          <FieldError msg={errors.newOutstanding} />
        </div>
        <div>
          <Label htmlFor="ac-date" required>Effective date</Label>
          <TextField id="ac-date" field="date" type="date" />
          <FieldError msg={errors.date} />
        </div>
      </div>
      <div>
        <Label htmlFor="ac-reason" required>Reason</Label>
        <TextField id="ac-reason" field="reason" placeholder="e.g. Interest charge not recorded" />
        <FieldError msg={errors.reason} />
      </div>
      {delta != null && delta !== 0 && (
        <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px' }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>Difference: </span>
          <span className="tnum" style={{ fontWeight: 600, color: delta > 0 ? 'var(--neg)' : 'var(--pos)' }}>{fmtSigned(delta, false)}</span>
          {' '}— recorded as a labelled “Card correction”, excluded from income and expenses.
          {after && <div style={{ marginTop: 4 }}>Available credit after correction: <span className="tnum" style={{ fontWeight: 600 }}>{after.label}</span>{after.note ? ' · ' + after.note : ''}</div>}
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
    const target = parseAmt(f.newOutstanding);
    const delta = isFinite(target) ? target - (f.currentOutstanding ?? 0) : NaN;
    if (!isFinite(target)) errs.newOutstanding = 'Enter the corrected outstanding in rupees.';
    else if (delta === 0) errs.newOutstanding = 'That is already the recorded outstanding amount.';
    if (!String(f.reason || '').trim()) errs.reason = 'Add a short reason — corrections are kept in history.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || ''))) errs.date = 'Choose an effective date.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => adjustCardOutstanding(data, { cardId: f.cardId, delta, reason: f.reason, date: f.date, currentOutstanding: f.currentOutstanding ?? 0 }));
    closeDrawer();
    notify('Outstanding correction recorded and labelled.');
  };
}

export const adjustCardFormDef = {
  title: () => 'Correct outstanding',
  sub: () => 'A labelled correction to the card’s liability',
  cta: () => 'Record correction',
  Body,
  useSubmit,
};
