// Add card drawer — template 646-694, submitCard script 1312-1331.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { accountBalance, cardOutstanding, cardRefs } from '../lib/calc.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { addCard, updateCard } from '../store/actions.js';
import { validate } from '../lib/validate.js';
import { useInstGroups } from './AccountForm.jsx';
import BankKindField, { KindOptions } from './BankKindField.jsx';
import { Label, FieldError, Hint, TextField, SelectField, grid2, grid3, noteBox } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const instGroups = useInstGroups(); // your own banks belong here too, not just the catalogue
  const f = drawer.form, errors = drawer.errors;

  const productOpts = S.cardProducts.filter(p => p.instId === f.inst).map(p => ({ id: p.id, label: p.name + ' · ' + p.type + ' · ' + p.network }));
  const editing = !!f.editId;
  const showCustom = !f.product || f.product === '__custom';
  const prod = !editing ? S.cardProducts.find(p => p.id === f.product) : null;
  const resolvedType = prod ? prod.type : (f.ctype || 'debit');
  const isCredit = resolvedType === 'credit';
  const refs = editing ? cardRefs(S, f.editId, currentMonth()) : null;
  const typeLocked = editing && refs.transactions > 0;
  const statusWarn = editing && f.status === 'closed'
    ? [refs.transactions ? refs.transactions + ' historical transaction' + (refs.transactions === 1 ? '' : 's') : null,
       refs.recurring ? refs.recurring + ' active recurring item' + (refs.recurring === 1 ? '' : 's') : null,
       refs.outstanding ? 'outstanding still recorded' : null,
      ].filter(Boolean).join(', ')
    : '';
  const month = currentMonth();
  const bankOpts = S.accounts.filter(a => a.status === 'active').map(a => ({ id: 'acc:' + a.id, label: a.nickname + ' — ' + money(accountBalance(a, S, month, nowIso())) }));

  return (
    <>
      <div role="note" style={noteBox('var(--neg-soft)')}>
        <span style={{ fontWeight: 700, color: 'var(--neg)' }}>Never enter</span> your full card number, CVV, PIN, banking password, or OTP. Raqam only needs the last 4 digits.
      </div>

      <div>
        <Label htmlFor="c-inst" required>Bank</Label>
        <SelectField id="c-inst" field="inst">
          <option value="">Choose…</option>
          {instGroups.map(g => (
            <optgroup key={g.kind} label={g.kind}>
              {g.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </optgroup>
          ))}
          {!editing && <option value="__custom">＋ Custom institution…</option>}
        </SelectField>
        {f.inst === '__custom' && (
          <div style={{ ...grid2, marginTop: 8 }}>
            <TextField field="customInst" ariaLabel="Institution name" placeholder="Institution name" />
            <SelectField id="c-instkind" field="customInstKind" ariaLabel="Type of bank">
              <KindOptions />
            </SelectField>
          </div>
        )}
        <FieldError msg={errors.inst} />
        <BankKindField />
      </div>

      {!editing && (
        <div>
          <Label htmlFor="c-prod">Card product</Label>
          <SelectField id="c-prod" field="product">
            <option value="__custom">Custom card</option>
            {productOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </SelectField>
          <Hint>Demo catalogue — product names are placeholders, not verified offers.</Hint>
        </div>
      )}

      {(editing || showCustom) && (
        <div style={grid3}>
          <div>
            <Label htmlFor="c-type">Type</Label>
            <SelectField id="c-type" field="ctype" disabled={typeLocked}>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
              <option value="prepaid">Prepaid</option>
              <option value="virtual">Virtual</option>
            </SelectField>
            {typeLocked && <Hint>Type is locked — this card already has recorded transactions.</Hint>}
          </div>
          <div>
            <Label htmlFor="c-net">Network</Label>
            <SelectField id="c-net" field="network">
              <option value="Visa">Visa</option>
              <option value="Mastercard">Mastercard</option>
              <option value="UnionPay">UnionPay</option>
              <option value="PayPak">PayPak</option>
              <option value="Other">Other</option>
            </SelectField>
          </div>
          <div>
            <Label htmlFor="c-tier">Tier</Label>
            <TextField id="c-tier" field="tier" placeholder="e.g. Gold" />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
        <div>
          <Label htmlFor="c-nick" required>Nickname</Label>
          <TextField id="c-nick" field="nickname" placeholder="e.g. Everyday card" />
          <FieldError msg={errors.nickname} />
        </div>
        <div>
          <Label htmlFor="c-last4">Last 4 digits</Label>
          <TextField id="c-last4" field="last4" inputMode="numeric" maxLength={4} placeholder="0000" />
          <FieldError msg={errors.last4} />
        </div>
      </div>

      {isCredit && (
        <div style={grid3}>
          <div>
            <Label htmlFor="c-limit" required>Credit limit</Label>
            <TextField id="c-limit" field="limit" inputMode="decimal" placeholder="Rs" />
            <FieldError msg={errors.limit} />
          </div>
          <div>
            <Label htmlFor="c-stmt">Statement day</Label>
            <TextField id="c-stmt" field="stmtDay" inputMode="numeric" placeholder="25" />
          </div>
          <div>
            <Label htmlFor="c-due">Payment due date</Label>
            <TextField id="c-due" field="due" type="date" />
          </div>
        </div>
      )}

      {!isCredit && (
        <div>
          <Label htmlFor="c-linked" required>Linked account</Label>
          <SelectField id="c-linked" field="linked">
            <option value="">Choose…</option>
            {bankOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </SelectField>
          <FieldError msg={errors.linked} />
        </div>
      )}

      {editing && (
        <>
          <div style={grid3}>
            <div>
              <Label htmlFor="c-fee-month">Annual fee month</Label>
              <TextField id="c-fee-month" field="annualFeeMonth" placeholder="e.g. November" />
            </div>
            <div>
              <Label htmlFor="c-theme">Colour</Label>
              <SelectField id="c-theme" field="theme">
                <option value="teal">Teal</option>
                <option value="ink">Ink</option>
                <option value="warm">Warm</option>
              </SelectField>
            </div>
            <div>
              <Label htmlFor="c-status">Status</Label>
              <SelectField id="c-status" field="status">
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </SelectField>
            </div>
          </div>
          {statusWarn && (
            <div role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--warn-soft)', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--warn)' }}>Still in use — </span>{statusWarn}. History is always kept.
            </div>
          )}
          {isCredit && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--soft)', fontSize: 12.5, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>Outstanding is not edited here. </span>
              Use “Correct outstanding” on the card, so every correction stays labelled in history.
            </div>
          )}
        </>
      )}
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form;
    const editing = !!f.editId;
    const prod = !editing ? S.cardProducts.find(p => p.id === f.product) : null;
    const ctype = prod ? prod.type : (f.ctype || 'debit');
    const errs = validate.card(S, f, { resolvedType: ctype });
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    const limit = parseAmt(f.limit);
    if (editing) {
      applyData(data => updateCard(data, { form: f, ctype, limit }));
      closeDrawer();
      notify('Card updated.');
      return;
    }
    applyData(data => addCard(data, { form: f, prod, ctype, limit }));
    closeDrawer();
    notify('Card added to your wallet.');
  };
}

export const cardFormDef = {
  title: s => (s.form.editId ? 'Edit card' : 'Add card'),
  sub: s => (s.form.editId ? 'Outstanding is corrected separately — changes are kept in history' : 'Only the last 4 digits are stored'),
  cta: s => (s.form.editId ? 'Save changes' : 'Add card'),
  Body,
  useSubmit,
};
