// Add account drawer — template 609-645, submitAccount script 1294-1311.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { parseAmt } from '../lib/format.js';
import { ACCOUNT_TYPES } from '../store/seed.js';
import { addAccount } from '../store/actions.js';
import { Label, FieldError, Hint, AmountField, TextField, SelectField, TextAreaField, Pill, grid2 } from './fields.jsx';

const INST_KINDS = ['Conventional', 'Islamic', 'Foreign', 'Microfinance', 'Digital', 'Custom'];

export function useInstGroups() {
  const { data: S } = useStore();
  return INST_KINDS
    .map(kind => ({ kind: kind + (kind === 'Custom' ? '' : ' banks'), items: S.institutions.filter(i => i.kind === kind) }))
    .filter(g => g.items.length > 0);
}

function Body() {
  const { drawer, setField } = useDrawer();
  const instGroups = useInstGroups();
  const f = drawer.form, errors = drawer.errors;
  const isl = f.islamic === 'islamic';

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
  const { applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form, errs = {};
    if (!f.inst) errs.inst = 'Choose an institution.';
    if (f.inst === '__custom' && !String(f.customInst || '').trim()) errs.inst = 'Name the custom institution.';
    if (!String(f.nickname || '').trim()) errs.nickname = 'Give the account a nickname.';
    const bal = parseAmt(f.balance);
    if (!isFinite(bal)) errs.balance = 'Enter the current balance in rupees.';
    if (f.last4 && !/^\d{4}$/.test(f.last4)) errs.last4 = 'Exactly 4 digits, or leave it blank.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => addAccount(data, { form: f, bal }));
    closeDrawer();
    notify('Account added — confirm your opening balance when you’re ready.');
  };
}

export const accountFormDef = {
  title: () => 'Add account',
  sub: () => 'No full account numbers — ever',
  cta: () => 'Add account',
  Body,
  useSubmit,
};
