// Add account drawer — template 609-645, submitAccount script 1294-1311.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { parseAmt } from '../lib/format.js';
import { accountRefs, INST_KINDS } from '../lib/calc.js';
import BankKindField from './BankKindField.jsx';
import { currentMonth } from '../lib/dates.js';
import { ACCOUNT_TYPES } from '../store/seed.js';
import { addAccount, updateAccount } from '../store/actions.js';
import { validate } from '../lib/validate.js';
import { Label, FieldError, Hint, AmountField, TextField, SelectField, TextAreaField, Pill, grid2 } from './fields.jsx';

export function useInstGroups() {
  const { data: S } = useStore();
  return INST_KINDS
    // 'Custom' is the catch-all for things that aren't banks (cash, a wallet app).
    .map(kind => ({ kind: kind === 'Custom' ? 'Other' : kind + ' banks', items: S.institutions.filter(i => i.kind === kind) }))
    .filter(g => g.items.length > 0);
}

function Body() {
  const { drawer, setField } = useDrawer();
  const { data: S } = useStore();
  const instGroups = useInstGroups();
  const f = drawer.form, errors = drawer.errors;
  const isl = f.islamic === 'islamic';
  const editing = !!f.editId;
  const refs = editing ? accountRefs(S, f.editId, currentMonth()) : null;
  const statusWarn = editing && f.status && f.status !== 'active'
    ? [refs.cards ? refs.cards + ' linked card' + (refs.cards === 1 ? '' : 's') : null,
       refs.recurring ? refs.recurring + ' active recurring rule' + (refs.recurring === 1 ? '' : 's') : null,
       refs.pending ? refs.pending + ' pending transaction' + (refs.pending === 1 ? '' : 's') : null,
      ].filter(Boolean).join(', ')
    : '';

  return (
    <>
      <div>
        <Label htmlFor="a-inst" required>Financial institution</Label>
        <SelectField id="a-inst" field="inst">
          <option value="">Choose…</option>
          {instGroups.map(g => (
            <optgroup key={g.kind} label={g.kind}>
              {g.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </optgroup>
          ))}
          <option value="__custom">＋ Custom institution…</option>
        </SelectField>
        <Hint>Demo institution list — replaceable with a researched catalogue.</Hint>
        {f.inst === '__custom' && <TextField field="customInst" ariaLabel="Institution name" placeholder="Institution name" accent />}
        <FieldError msg={errors.inst} />
        <BankKindField />
      </div>

      <div style={grid2}>
        <div>
          <Label htmlFor="a-type">Account type</Label>
          <SelectField id="a-type" field="type">
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </SelectField>
        </div>
        <div>
          <Label htmlFor="a-nick" required>Nickname</Label>
          <TextField id="a-nick" field="nickname" placeholder="e.g. Salary account" />
          <FieldError msg={errors.nickname} />
        </div>
      </div>

      <div role="group" aria-label="Classification" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Classification:</span>
        <Pill on={!isl} onClick={() => setField('islamic', 'conventional')}>Conventional</Pill>
        <Pill on={isl} onClick={() => setField('islamic', 'islamic')}>Islamic</Pill>
      </div>

      {!editing && (
        <div style={grid2}>
          <div>
            <Label htmlFor="a-bal" required>Current balance</Label>
            <AmountField id="a-bal" field="balance" />
            <Hint>Used as this month's opening balance until you confirm it.</Hint>
            <FieldError msg={errors.balance} />
          </div>
          <div>
            <Label htmlFor="a-asof" required>Balance as of</Label>
            <TextField id="a-asof" field="asof" type="date" />
          </div>
        </div>
      )}

      {editing && (
        <>
          <div>
            <Label htmlFor="a-status">Status</Label>
            <SelectField id="a-status" field="status">
              <option value="active">Active — counts towards totals</option>
              <option value="archived">Archived — kept in history, excluded from totals</option>
              <option value="closed">Closed — no longer exists at the bank</option>
            </SelectField>
            {statusWarn && (
              <div role="alert" style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--warn-soft)', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--warn)' }}>Still in use — </span>{statusWarn}. History is always kept.
              </div>
            )}
          </div>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--soft)', fontSize: 12.5, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>Balance is not edited here. </span>
            Corrections go through “Adjust balance” on the account page, so every change stays labelled in history.
          </div>
        </>
      )}

      <div>
        <Label htmlFor="a-last4" optional>Last 4 digits</Label>
        <TextField id="a-last4" field="last4" inputMode="numeric" maxLength={4} placeholder="e.g. 4821" width={140} />
        <div style={{ fontSize: 11.5, color: 'var(--accent-h)', marginTop: 4, fontWeight: 500 }}>Privacy: only the last 4 digits — never enter a full account number or IBAN.</div>
        <FieldError msg={errors.last4} />
      </div>

      <div>
        <Label htmlFor="a-notes" optional>Notes</Label>
        <TextAreaField id="a-notes" field="notes" />
      </div>
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
    const errs = validate.account(S, f, { skipBalance: editing });
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    if (editing) {
      applyData(data => updateAccount(data, { form: f }));
      closeDrawer();
      notify('Account updated.');
      return;
    }
    const bal = parseAmt(f.balance);
    applyData(data => addAccount(data, { form: f, bal }));
    closeDrawer();
    notify('Account added — confirm your opening balance when you’re ready.');
  };
}

export const accountFormDef = {
  title: s => (s.form.editId ? 'Edit account' : 'Add account'),
  sub: s => (s.form.editId ? 'Balance is corrected separately — changes are kept in history' : 'No full account numbers — ever'),
  cta: s => (s.form.editId ? 'Save changes' : 'Add account'),
  Body,
  useSubmit,
};
