// Add account drawer — template 609-645, submitAccount script 1294-1311.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { parseAmt } from '../lib/format.js';
import { accountBalance, INST_KINDS } from '../lib/calc.js';
import BankKindField, { KindOptions } from './BankKindField.jsx';
import { currentMonth, nowIso, todayStr } from '../lib/dates.js';
import { ACCOUNT_TYPES } from '../store/seed.js';
import { addAccount, adjustBalance, updateAccount } from '../store/actions.js';
import { validate } from '../lib/validate.js';
import { Label, FieldError, Hint, AmountField, TextField, SelectField, TextAreaField, grid2 } from './fields.jsx';
import { useCloseAccount } from './useCloseAccount.jsx';

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
  const editing = !!f.editId;
  const runClose = useCloseAccount();

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
        {f.inst === '__custom' && (
          <div style={{ ...grid2, marginTop: 8 }}>
            <TextField field="customInst" ariaLabel="Institution name" placeholder="Institution name" />
            <SelectField id="a-instkind" field="customInstKind" ariaLabel="Type of bank">
              <KindOptions />
            </SelectField>
          </div>
        )}
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
        <div>
          <Label htmlFor="a-wbal">Working Balance</Label>
          <AmountField id="a-wbal" field="workingBalance" />
          <Hint>An adjustment transaction is created automatically if you change this amount.</Hint>
        </div>
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

      {/* The one destructive action, isolated at the very bottom past every
          editable field so it never interrupts the form flow. Closing is
          reversible (history kept, restorable), so it stays calm — a divider
          and a red-outlined button, no shouting. */}
      {editing && (
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>Removes it from your totals and the sidebar. History is kept — you can restore it later from Accounts.</span>
          <button type="button" onClick={() => runClose(f.editId)} className="hv-neg-soft rq-btn-outline"
            style={{ flex: 'none', height: 36, padding: '0 14px', border: '1px solid var(--neg)', borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Close account
          </button>
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
    const f = drawer.form;
    const editing = !!f.editId;
    const errs = validate.account(S, f, { skipBalance: editing });
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    if (editing) {
      // Metadata via updateAccount; if the Working Balance field changed, chain
      // an adjustment in the same reducer so both land as one undo step.
      const acct = S.accounts.find(a => a.id === f.editId);
      const cur = acct ? accountBalance(acct, S, currentMonth(), nowIso()) : 0;
      const target = parseAmt(f.workingBalance);
      const delta = Number.isFinite(target) ? target - cur : 0;
      applyData(data => {
        const updated = updateAccount(data, { form: f });
        return delta !== 0
          ? adjustBalance(updated, { accountId: f.editId, delta, reason: 'Balance reconciled from Edit account', date: todayStr(), currentBalance: cur })
          : updated;
      });
      closeDrawer();
      notify(delta !== 0 ? 'Account updated — balance adjusted.' : 'Account updated.');
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
