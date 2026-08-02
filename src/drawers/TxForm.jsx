// Add transaction drawer — 5 types with per-type field groups.
// Ported from the prototype template 529-608 + drawerVals script 1157-1183 + submitTx 1250-1292.
// Deviation from prototype (bug fix): the prototype validated an account for type
// "adjustment" but never rendered a selector for it — here the account picker also
// shows for adjustments ("Account to adjust").
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { accountBalance, cardOutstanding, dayLabel, findDuplicate, monthLabel } from '../lib/calc.js';
import { currentMonth, todayStr } from '../lib/dates.js';
import { addTransaction } from '../store/actions.js';
import { Label, FieldError, Hint, AmountField, TextField, SelectField, TextAreaField, Pill, grid2, noteBox } from './fields.jsx';

const TYPES = ['expense', 'income', 'transfer', 'refund', 'adjustment'];
const HINTS = {
  expense: 'Money spent from an account or card.',
  income: 'Money received into an account.',
  transfer: 'Between your own accounts — never counted as income or an expense.',
  refund: 'Money returned to you — offsets the original category; distinct from income.',
  adjustment: 'Correct a balance with a clearly labelled entry.',
};
const CTAS = { expense: 'Record expense', income: 'Record income', transfer: 'Record transfer', refund: 'Record refund', adjustment: 'Record adjustment' };

function useOpts() {
  const { data: S } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  const activeAccts = S.accounts.filter(a => a.status === 'active');
  const bankOpts = activeAccts.map(a => ({ id: 'acc:' + a.id, label: a.nickname + ' — ' + money(accountBalance(a, S, month)) }));
  const credit = S.cards.filter(c => c.type === 'credit' && c.status === 'active');
  const creditOpts = credit.map(c => ({ id: 'card:' + c.id, label: c.nickname + ' ••' + c.last4 + ' — ' + money(Math.max((c.limit || 0) - cardOutstanding(c, S, month), 0)) + ' available' }));
  return { S, activeAccts, bankOpts, creditOpts };
}

function Body() {
  const { drawer, setForm, setField } = useDrawer();
  const { S, activeAccts, bankOpts, creditOpts } = useOpts();
  const { moneyRaw } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const type = f.type || 'expense';

  const fxPayWith = type === 'expense' || type === 'refund';
  const fxAccount = type === 'income' || type === 'adjustment';
  const fxTransfer = type === 'transfer';
  const fxAdjust = type === 'adjustment';
  const fxCategory = type === 'expense' || type === 'income' || type === 'refund';
  const catOpts = S.categories.filter(c => c.type === (type === 'income' ? 'income' : 'expense')).map(c => ({ id: c.id, label: c.name }));
  const cardHint = type === 'expense' && String(f.payWith || '').startsWith('card:');
  const amt = parseAmt(f.amount);
  const fee = parseAmt(f.fee);
  const nameOf = ref => { const a = activeAccts.find(x => 'acc:' + x.id === ref); return a ? a.nickname : ''; };
  const hasReview = fxTransfer && amt > 0 && f.from && f.to && f.from !== f.to;

  return (
    <>
      <div role="group" aria-label="Transaction type" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TYPES.map(id => (
          <Pill key={id} on={type === id} onClick={() => setForm({ type: id, category: '' })}>
            {id.charAt(0).toUpperCase() + id.slice(1)}
          </Pill>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -4 }}>{HINTS[type]}</div>

      <div style={grid2}>
        <div>
          <Label htmlFor="f-amount" required>Amount</Label>
          <AmountField id="f-amount" field="amount" />
          <FieldError msg={errors.amount} />
        </div>
        <div>
          <Label htmlFor="f-date" required>Date</Label>
          <TextField id="f-date" field="date" type="date" />
        </div>
      </div>

      {fxPayWith && (
        <div>
          <Label htmlFor="f-paywith" required>{type === 'refund' ? 'Refund to' : 'Paid with'}</Label>
          <SelectField id="f-paywith" field="payWith">
            <option value="">Choose…</option>
            <optgroup label="Bank accounts">
              {bankOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </optgroup>
            {creditOpts.length > 0 && (
              <optgroup label="Credit cards">
                {creditOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
            )}
          </SelectField>
          <FieldError msg={errors.payWith} />
          {cardHint && (
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text)', marginTop: 6, padding: '8px 10px', background: 'var(--info-soft)', borderRadius: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--info)', flex: 'none' }}>Card purchase</span>
              <span style={{ opacity: .85 }}>Adds to the card’s outstanding amount. Your bank balance is unchanged until you pay the bill.</span>
            </div>
          )}
        </div>
      )}

      {fxAccount && (
        <div>
          <Label htmlFor="f-account" required>{type === 'income' ? 'Into account' : 'Account to adjust'}</Label>
          <SelectField id="f-account" field="account">
            <option value="">Choose…</option>
            {bankOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </SelectField>
          <FieldError msg={errors.account} />
        </div>
      )}

      {fxTransfer && (
        <>
          <div style={grid2}>
            <div>
              <Label htmlFor="f-from" required>From account</Label>
              <SelectField id="f-from" field="from">
                <option value="">Choose…</option>
                {bankOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </SelectField>
            </div>
            <div>
              <Label htmlFor="f-to" required>To account</Label>
              <SelectField id="f-to" field="to">
                <option value="">Choose…</option>
                {bankOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </SelectField>
            </div>
          </div>
          <FieldError msg={errors.transfer} style={{ marginTop: -6 }} />
          <div>
            <Label htmlFor="f-fee" optional>Transfer fee</Label>
            <TextField id="f-fee" field="fee" inputMode="decimal" placeholder="0" />
            <Hint>A fee is recorded separately as a Bank fees expense.</Hint>
          </div>
          {hasReview && (
            <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px', lineHeight: 1.55 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>Review: </span>
              Move {moneyRaw(amt)} from {nameOf(f.from)} to {nameOf(f.to)} on {dayLabel((f.date || todayStr()) + 'T00:00')}. One linked record — excluded from income and expenses.
              {fee > 0 ? ` The ${moneyRaw(fee)} fee is recorded separately as a Bank fees expense.` : ''}
            </div>
          )}
        </>
      )}

      {fxAdjust && (
        <>
          <div style={grid2}>
            <div>
              <Label htmlFor="f-dir">Direction</Label>
              <SelectField id="f-dir" field="direction">
                <option value="increase">Increase balance</option>
                <option value="decrease">Decrease balance</option>
              </SelectField>
            </div>
            <div>
              <Label htmlFor="f-reason" required>Reason</Label>
              <TextField id="f-reason" field="reason" placeholder="e.g. Bank charges correction" />
              <FieldError msg={errors.reason} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6 }}>Adjustments are clearly labelled in history and excluded from income and expense totals.</div>
        </>
      )}

      {fxCategory && (
        <div>
          <Label htmlFor="f-cat" required>Category</Label>
          <SelectField id="f-cat" field="category">
            <option value="">Choose…</option>
            {catOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            <option value="__new">＋ New category…</option>
          </SelectField>
          {f.category === '__new' && (
            <TextField field="newCat" ariaLabel="New category name" placeholder="New category name" accent />
          )}
          <FieldError msg={errors.category} />
        </div>
      )}

      <div>
        <Label htmlFor="f-merchant">{type === 'income' ? 'Payer / source' : 'Merchant or recipient'}</Label>
        <TextField id="f-merchant" field="merchant" placeholder="e.g. Imtiaz Super Market" />
      </div>
      <div>
        <Label htmlFor="f-notes" optional>Notes</Label>
        <TextAreaField id="f-notes" field="notes" />
      </div>

      <div role="group" aria-label="Status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Status:</span>
        <Pill on={!f.pending} onClick={() => setField('pending', false)}>Cleared</Pill>
        <Pill on={!!f.pending} warn onClick={() => setField('pending', true)}>Pending</Pill>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Pending amounts are excluded from totals until cleared.</span>
      </div>

      {drawer.dupMsg && (
        <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn)' }}>Possible duplicate — </span>
          <span style={{ fontSize: 12.5 }}>{drawer.dupMsg}</span>
        </div>
      )}
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail, setDup } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  const { moneyRaw } = useMoney();

  return () => {
    const f = drawer.form, type = f.type || 'expense', errs = {};
    const amt = parseAmt(f.amount);
    if (!(amt > 0)) errs.amount = 'Enter an amount greater than zero.';
    if (type === 'expense' || type === 'refund') { if (!f.payWith) errs.payWith = type === 'refund' ? 'Choose where the refund landed.' : 'Choose the account or card you paid with.'; }
    if (type === 'income') { if (!f.account) errs.account = 'Choose the account that received it.'; }
    if (type === 'transfer') {
      if (!f.from || !f.to) errs.transfer = 'Choose both the From and To accounts.';
      else if (f.from === f.to) errs.transfer = 'From and To must be different accounts.';
      if (f.fee && !(parseAmt(f.fee) >= 0)) errs.transfer = 'The fee must be a number.';
    }
    if (type === 'adjustment') {
      if (!f.account) errs.account = 'Choose the account to adjust.';
      if (!String(f.reason || '').trim()) errs.reason = 'Add a short reason — adjustments are labelled in history.';
    }
    if (type === 'expense' || type === 'income' || type === 'refund') {
      if (!f.category) errs.category = 'Choose a category.';
      else if (f.category === '__new' && !String(f.newCat || '').trim()) errs.category = 'Name the new category.';
    }
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }

    if ((type === 'expense' || type === 'income') && !drawer.dupAck) {
      const d = findDuplicate(S, { amount: amt, merchant: f.merchant, date: f.date || todayStr() });
      if (d) {
        setDup(moneyRaw(d.amount) + ' to “' + (d.merchant || 'the same merchant') + '” is already recorded on this date. Save again to keep both.');
        return;
      }
    }

    applyData(data => addTransaction(data, { form: f, type, amt, fee: parseAmt(f.fee) }));
    closeDrawer();
    const msgs = {
      expense: 'Expense recorded — balances updated.',
      income: 'Income recorded — balances updated.',
      transfer: 'Transfer recorded — both sides updated, excluded from income and expenses.',
      refund: 'Refund recorded — it offsets the original category.',
      adjustment: 'Balance adjustment recorded and labelled.',
    };
    notify(msgs[type]);
  };
}

export const txFormDef = {
  title: () => 'Add transaction',
  sub: () => 'Manual entry · PKR · ' + monthLabel(currentMonth()),
  cta: state => (state.dupMsg ? 'Save anyway' : CTAS[state.form.type || 'expense']),
  Body,
  useSubmit,
};
