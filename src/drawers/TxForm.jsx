// Add transaction drawer — 5 types with per-type field groups.
// Ported from the prototype template 529-608 + drawerVals script 1157-1183 + submitTx 1250-1292.
// Deviation from prototype (bug fix): the prototype validated an account for type
// "adjustment" but never rendered a selector for it — here the account picker also
// shows for adjustments ("Account to adjust").
import { useState } from 'react';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { accountBalance, cardOutstanding, dayLabel, findDuplicate, monthLabel, relTime } from '../lib/calc.js';
import { currentMonth, nowIso, todayStr } from '../lib/dates.js';
import { addTransaction, updateTransaction, deleteTransaction } from '../store/actions.js';
import { validate } from '../lib/validate.js';
import { PRESETS, ruleFromTx } from '../lib/schedule.js';
import WhenField from './WhenField.jsx';
import PlanCategoryPicker from '../ui/PlanCategoryPicker.jsx';
import { envelopeFor } from '../lib/envelope.js';
import { Label, FieldError, Hint, AmountField, TextField, SelectField, TextAreaField, Pill, grid2, noteBox } from './fields.jsx';

const TYPES = ['expense', 'income', 'transfer', 'refund', 'adjustment'];
const HINTS = {
  expense: 'Money spent from an account or card.',
  income: 'Money received into an account.',
  transfer: 'Between your own accounts — never counted as income or an expense.',
  refund: 'Money returned to you — offsets the original category; distinct from income.',
};  // adjustment has no hint: the note under its fields already says more
const CTAS = { expense: 'Record expense', income: 'Record income', transfer: 'Record transfer', refund: 'Record refund', adjustment: 'Record adjustment' };

function useOpts() {
  const { data: S } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  const activeAccts = S.accounts.filter(a => a.status === 'active');
  const bankOpts = activeAccts.map(a => ({ id: 'acc:' + a.id, label: a.nickname + ' — ' + money(accountBalance(a, S, month, nowIso())) }));
  const credit = S.cards.filter(c => c.type === 'credit' && c.status === 'active');
  const creditOpts = credit.map(c => ({ id: 'card:' + c.id, label: c.nickname + ' ••' + c.last4 + ' — ' + money(Math.max((c.limit || 0) - cardOutstanding(c, S, month, nowIso()), 0)) + ' available' }));
  return { S, activeAccts, bankOpts, creditOpts };
}

function Body() {
  const { drawer, setForm, setField } = useDrawer();
  const { S, activeAccts, bankOpts, creditOpts } = useOpts();
  const { money, moneyRaw } = useMoney();
  const month = currentMonth();
  // Envelope drives the available amount shown beside each expense category in
  // the picker; income categories have no envelope, so amounts are hidden there.
  const env = envelopeFor(S, month, nowIso());
  const f = drawer.form, errors = drawer.errors;
  const type = f.type || 'expense';
  // Body remounts per drawer (keyed by name), so this resets between opens.
  const [noteOpen, setNoteOpen] = useState(!!f.notes);

  const fxPayWith = type === 'expense' || type === 'refund';
  const fxAccount = type === 'income' || type === 'adjustment';
  const fxTransfer = type === 'transfer';
  const fxAdjust = type === 'adjustment';
  const fxCategory = type === 'expense' || type === 'income' || type === 'refund';
  // An adjustment is not paid to anyone — it reconciles the record to reality,
  // and buildTx labels every one of them 'Balance adjustment' regardless of what
  // is typed here. Asking the question invited a wrong mental model and threw
  // the answer away; the reason field below is where the explanation belongs.
  const fxMerchant = type !== 'adjustment';
  // Money in/out only, and never while recording an occurrence — that transaction
  // already belongs to a rule. Editing IS allowed: that is "Make repeating".
  // Hidden once converted, so one transaction can't spawn two rules.
  const showRepeat = (type === 'expense' || type === 'income') && !f.fromRecurring && !ruleFromTx(S, f.editId);
  const repeatName = showRepeat && f.repeat && f.repeat !== 'never'
    ? (PRESETS.find(p => p.id === f.repeat) || {}).label : null;
  const catType = type === 'income' ? 'income' : 'expense';
  const cardHint = type === 'expense' && String(f.payWith || '').startsWith('card:');
  const amt = parseAmt(f.amount);
  const fee = parseAmt(f.fee);
  const nameOf = ref => {
    const a = activeAccts.find(x => 'acc:' + x.id === ref);
    if (a) return a.nickname;
    const c = S.cards.find(x => 'card:' + x.id === ref);
    return c ? c.nickname + ' ••' + c.last4 : '';
  };
  const hasReview = fxTransfer && amt > 0 && f.from && f.to && f.from !== f.to;

  const prev = f.editId ? S.transactions.find(t => t.id === f.editId) : null;

  return (
    <>
      {prev?.editedAt && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--info-soft)', fontSize: 12, color: 'var(--text)' }}>
          <span style={{ fontWeight: 700, color: 'var(--info)' }}>Edited before — </span>
          last edited {relTime(prev.editedAt)} · {prev.editCount} edit{prev.editCount === 1 ? '' : 's'} recorded in history.
        </div>
      )}
      <div role="group" aria-label="Transaction type" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TYPES.map(id => (
          <Pill key={id} on={type === id} onClick={() => setForm({ type: id, category: '' })}>
            {id.charAt(0).toUpperCase() + id.slice(1)}
          </Pill>
        ))}
      </div>
      {HINTS[type] && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -4 }}>{HINTS[type]}</div>}

      {/* Amount keeps the two-column grid to itself: the empty second track is
          what holds its width steady now that When has moved to its own row. */}
      <div style={grid2}>
        <div>
          <Label htmlFor="f-amount" required>Amount</Label>
          <AmountField id="f-amount" field="amount" autoFocus />
          <FieldError msg={errors.amount} />
        </div>
      </div>

      {fxMerchant && (
        <div>
          <Label htmlFor="f-merchant">{type === 'income' ? 'Payer / source' : 'Paid to'}</Label>
          <TextField id="f-merchant" field="merchant" placeholder="e.g. Imtiaz Super Market" />
        </div>
      )}

      {fxCategory && (
        <div>
          <Label required>Category</Label>
          <PlanCategoryPicker
            env={env} S={S} month={month} money={money}
            catType={catType} showAmounts={catType === 'expense'} excludeRta heading={null}
            allowCreate showSelected
            onCreate={({ name, groupId }) => setForm({ category: '__new', newCat: name, newCatGroup: groupId || '' })}
            value={f.category} onChange={id => setField('category', id)}
          />
          {f.category === '__new' && f.newCat && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              New category “{f.newCat}” will be created when you save.
            </div>
          )}
          <FieldError msg={errors.category} />
        </div>
      )}

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
              <Label htmlFor="f-to" required>To</Label>
              <SelectField id="f-to" field="to">
                <option value="">Choose…</option>
                <optgroup label="Bank accounts">
                  {bankOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </optgroup>
                {creditOpts.length > 0 && (
                  <optgroup label="Credit cards (bill payment)">
                    {creditOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </optgroup>
                )}
              </SelectField>
            </div>
          </div>
          <FieldError msg={errors.transfer} style={{ marginTop: -6 }} />
          {String(f.to || '').startsWith('card:') && (
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text)', marginTop: -4, padding: '8px 10px', background: 'var(--info-soft)', borderRadius: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--info)', flex: 'none' }}>Card payment</span>
              <span style={{ opacity: .85 }}>Recorded as a bill payment — reduces the bank balance and the card's outstanding. Never an expense.</span>
            </div>
          )}
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

      <div>
        <Label required>When</Label>
        <WhenField showRepeat={showRepeat} repeatLabel={f.editId ? 'Make repeating' : 'Repeat'} />
        {/* Repeat lives inside the date popover, so a non-default value would be
            invisible once it closes. The standing timezone hint is gone for
            height, but this line stays: without it nothing says a rule is about
            to be created. */}
        {repeatName && <Hint>Repeats {repeatName.toLowerCase()} — a recurring rule will be created.</Hint>}
        <FieldError msg={errors.date} />
      </div>

      {/* The note is the tallest thing in the form and the least used, so it
          stays folded away until asked for — that is what keeps the drawer
          from scrolling. A transaction that already has one opens expanded, so
          nothing is ever hidden from you. */}
      {noteOpen ? (
        <div>
          <Label htmlFor="f-notes" optional>Notes</Label>
          <TextAreaField id="f-notes" field="notes" autoFocus={!f.notes} />
        </div>
      ) : (
        <div>
          <button
            type="button" onClick={() => setNoteOpen(true)}
            className="hv-soft"
            style={{ height: 30, padding: '0 10px', border: '1px dashed var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >＋ Add note</button>
        </div>
      )}

      <div role="group" aria-label="Status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Status:</span>
        <Pill on={!f.pending} onClick={() => setField('pending', false)}>Cleared</Pill>
        <Pill on={!!f.pending} warn onClick={() => setField('pending', true)}>Uncleared</Pill>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Uncleared amounts are excluded from totals until cleared.</span>
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

const TYPE_CHANGE_NOTES = {
  transfer: ' Leaving a transfer removes its linked destination leg.',
  toTransfer: ' Becoming a transfer stops it counting as income or an expense.',
};

function useSubmit() {
  const { drawer, closeDrawer, fail, setDup } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify, ask } = useUI();
  const { moneyRaw } = useMoney();

  return async () => {
    const f = drawer.form, type = f.type || 'expense';
    const amt = parseAmt(f.amount);
    const errs = validate.transaction(S, f, {
      allowArchivedCategory: !!f.editId && f.originalCategory === f.category,
    });
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }

    if (!f.editId && (type === 'expense' || type === 'income') && !drawer.dupAck) {
      const d = findDuplicate(S, { amount: amt, merchant: f.merchant, date: f.date || todayStr() });
      if (d) {
        setDup(moneyRaw(d.amount) + ' to “' + (d.merchant || 'the same merchant') + '” is already recorded on this date. Save again to keep both.');
        return;
      }
    }

    // Type change rewrites the record's financial effect — confirm it (accent tone).
    if (f.editId && f.originalType && f.originalType !== type) {
      const extra = f.originalType === 'transfer' ? TYPE_CHANGE_NOTES.transfer : type === 'transfer' ? TYPE_CHANGE_NOTES.toTransfer : '';
      const ok = await ask({
        title: 'Change the transaction type?',
        body: `This changes the record from ${f.originalType} to ${type}, rewriting its effect on balances.${extra} The change is recorded in history.`,
        action: 'Change type and save',
        tone: 'accent',
      });
      if (!ok) return;
    }

    const payload = { form: f, type, amt, fee: parseAmt(f.fee) };
    const repeated = f.repeat && f.repeat !== 'never' && !f.fromRecurring
      && (type === 'expense' || type === 'income') && !ruleFromTx(S, f.editId);
    applyData(data => (f.editId ? updateTransaction(data, payload) : addTransaction(data, payload)));
    closeDrawer();
    if (f.editId) {
      notify('Transaction updated — balances recalculated.' + (repeated ? ' It repeats from now on.' : ''));
      return;
    }
    const msgs = {
      expense: 'Expense recorded — balances updated.',
      income: 'Income recorded — balances updated.',
      transfer: 'Transfer recorded — both sides updated, excluded from income and expenses.',
      refund: 'Refund recorded — it offsets the original category.',
      adjustment: 'Balance adjustment recorded and labelled.',
    };
    notify(msgs[type] + (repeated ? ' A recurring rule was created too.' : ''));
  };
}

// Delete lives in the drawer footer, only when editing.
function useDanger() {
  const { drawer, closeDrawer } = useDrawer();
  const { applyData } = useStore();
  const { ask, notify } = useUI();
  const editId = drawer.form.editId;
  if (!editId) return null;
  return {
    label: 'Delete',
    onClick: async () => {
      const ok = await ask({
        title: 'Delete this transaction?',
        body: 'Balances will be recalculated as if it was never recorded. The deletion is kept in history.',
        action: 'Delete transaction',
      });
      if (!ok) return;
      applyData(data => deleteTransaction(data, { id: editId }));
      closeDrawer();
      notify('Transaction deleted — balances recalculated.');
    },
  };
}

export const txFormDef = {
  title: s => (s.form.editId ? 'Edit transaction' : 'Add transaction'),
  sub: s => (s.form.editId ? 'Changes rewrite the record’s financial effect' : 'Manual entry · PKR · ' + monthLabel(currentMonth())),
  cta: state => (state.dupMsg ? 'Save anyway' : state.form.editId ? 'Save changes' : CTAS[state.form.type || 'expense']),
  Body,
  useSubmit,
  useDanger,
};
