// Record card payment drawer — template 695-708, submitPay script 1332-1341.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { accountBalance, cardOutstanding } from '../lib/calc.js';
import { currentMonth } from '../lib/dates.js';
import { payCard } from '../store/actions.js';
import { Label, FieldError, AmountField, TextField, SelectField, grid2, noteBox } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const month = currentMonth();
  const card = S.cards.find(x => x.id === f.cardId);
  const bankOpts = S.accounts.filter(a => a.status === 'active').map(a => ({ id: 'acc:' + a.id, label: a.nickname + ' — ' + money(accountBalance(a, S, month)) }));

  return (
    <>
      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--elev)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{card ? card.nickname + ' ••' + card.last4 : ''}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
          Outstanding: <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>{card ? money(cardOutstanding(card, S, month)) : ''}</span>
        </div>
      </div>
      <div>
        <Label htmlFor="p-from" required>Pay from account</Label>
        <SelectField id="p-from" field="from">
          <option value="">Choose…</option>
          {bankOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </SelectField>
        <FieldError msg={errors.from} />
      </div>
      <div style={grid2}>
        <div>
          <Label htmlFor="p-amount" required>Amount</Label>
          <AmountField id="p-amount" field="amount" />
          <FieldError msg={errors.amount} />
        </div>
        <div>
          <Label htmlFor="p-date">Date</Label>
          <TextField id="p-date" field="date" type="date" />
        </div>
      </div>
      <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px', lineHeight: 1.55 }}>
        <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>How this is recorded: </span>
        a Credit Card Payment transfer — it reduces your bank balance and the card's outstanding amount. It is not counted as an expense (the purchases already were).
      </div>
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form, errs = {};
    const amt = parseAmt(f.amount);
    if (!f.from) errs.from = 'Choose the account you paid from.';
    if (!(amt > 0)) errs.amount = 'Enter an amount greater than zero.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    const card = S.cards.find(c => c.id === f.cardId);
    applyData(data => payCard(data, { cardId: f.cardId, cardName: card?.nickname, from: f.from, amt, date: f.date }));
    closeDrawer();
    notify('Payment recorded — card outstanding and bank balance updated.');
  };
}

export const payCardFormDef = {
  title: () => 'Record card payment',
  sub: () => 'A transfer — not a second expense',
  cta: () => 'Record payment',
  Body,
  useSubmit,
};
