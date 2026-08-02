// Add card drawer — template 646-694, submitCard script 1312-1331.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { accountBalance } from '../lib/calc.js';
import { currentMonth } from '../lib/dates.js';
import { addCard } from '../store/actions.js';
import { useInstGroups } from './AccountForm.jsx';
import { Label, FieldError, Hint, TextField, SelectField, grid2, grid3, noteBox } from './fields.jsx';

function Body() {
  const { drawer } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const instGroups = useInstGroups().filter(g => g.kind !== 'Custom'); // card banks come from the catalogue
  const f = drawer.form, errors = drawer.errors;

  const productOpts = S.cardProducts.filter(p => p.instId === f.inst).map(p => ({ id: p.id, label: p.name + ' · ' + p.type + ' · ' + p.network }));
  const showCustom = !f.product || f.product === '__custom';
  const prod = S.cardProducts.find(p => p.id === f.product);
  const resolvedType = prod ? prod.type : (f.ctype || 'debit');
  const isCredit = resolvedType === 'credit';
  const month = currentMonth();
  const bankOpts = S.accounts.filter(a => a.status === 'active').map(a => ({ id: 'acc:' + a.id, label: a.nickname + ' — ' + money(accountBalance(a, S, month)) }));

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
        </SelectField>
        <FieldError msg={errors.inst} />
      </div>

      <div>
        <Label htmlFor="c-prod">Card product</Label>
        <SelectField id="c-prod" field="product">
          <option value="__custom">Custom card</option>
          {productOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </SelectField>
        <Hint>Demo catalogue — product names are placeholders, not verified offers.</Hint>
      </div>

      {showCustom && (
        <div style={grid3}>
          <div>
            <Label htmlFor="c-type">Type</Label>
            <SelectField id="c-type" field="ctype">
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
              <option value="prepaid">Prepaid</option>
              <option value="virtual">Virtual</option>
            </SelectField>
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
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form, errs = {};
    if (!f.inst) errs.inst = 'Choose the bank.';
    if (!String(f.nickname || '').trim()) errs.nickname = 'Give the card a nickname.';
    if (f.last4 && !/^\d{4}$/.test(f.last4)) errs.last4 = 'Exactly 4 digits, or leave it blank.';
    const prod = S.cardProducts.find(p => p.id === f.product);
    const ctype = prod ? prod.type : (f.ctype || 'debit');
    const limit = parseAmt(f.limit);
    if (ctype === 'credit' && !(limit > 0)) errs.limit = 'Enter the credit limit.';
    if (ctype === 'debit' && !f.linked) errs.linked = 'Choose the linked account.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => addCard(data, { form: f, prod, ctype, limit }));
    closeDrawer();
    notify('Card added to your wallet.');
  };
}

export const cardFormDef = {
  title: () => 'Add card',
  sub: () => 'Only the last 4 digits are stored',
  cta: () => 'Add card',
  Body,
  useSubmit,
};
