// Category create/edit drawer — design v2 template 892-929 + submitCategory.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { parseAmt } from '../lib/format.js';
import { catRefs } from '../lib/calc.js';
import { validate } from '../lib/validate.js';
import { upsertCategory } from '../store/actions.js';
import { ICONS, CATEGORY_COLORS, iconStyle } from '../lib/catIcon.js';
import { Label, FieldError, Hint, AmountField, TextField, SelectField, TextAreaField, grid2 } from './fields.jsx';

function Body() {
  const { drawer, setField } = useDrawer();
  const { data: S } = useStore();
  const f = drawer.form, errors = drawer.errors;
  const editing = !!f.editId;
  const refs = editing ? catRefs(S, f.editId) : null;
  const typeLocked = editing && refs && (refs.transactions || refs.budgets || refs.recurring);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--elev)', border: '1px solid var(--border)' }}>
        <span aria-hidden="true" style={iconStyle(f.icon || 'square', f.color || '#0F766E', 16)} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{(f.name || '').trim() || 'New category'}</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{f.type === 'income' ? 'Income' : 'Expense'}</span>
      </div>

      <div style={grid2}>
        <div>
          <Label htmlFor="cat-name" required>Name</Label>
          <TextField id="cat-name" field="name" placeholder="e.g. Gifts" maxLength={40} />
          <FieldError msg={errors.name} />
        </div>
        <div>
          <Label htmlFor="cat-type" required>Type</Label>
          <SelectField id="cat-type" field="type" disabled={!!typeLocked}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </SelectField>
          {typeLocked ? <Hint>Type is locked — this category is already in use.</Hint> : null}
          <FieldError msg={errors.type} />
        </div>
      </div>

      <div>
        <Label>Icon</Label>
        <div role="group" aria-label="Icon" style={{ display: 'flex', gap: 8 }}>
          {ICONS.map(ic => (
            <button
              key={ic}
              onClick={() => setField('icon', ic)}
              aria-pressed={String((f.icon || 'square') === ic)}
              aria-label={ic}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${(f.icon || 'square') === ic ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}
            >
              <span style={iconStyle(ic, f.color || '#0F766E', 14)} />
            </button>
          ))}
        </div>
        <FieldError msg={errors.icon} />
      </div>

      <div>
        <Label>Colour</Label>
        <div role="group" aria-label="Colour" style={{ display: 'flex', gap: 8 }}>
          {CATEGORY_COLORS.map(col => (
            <button
              key={col}
              onClick={() => setField('color', col)}
              aria-pressed={String((f.color || '#0F766E') === col)}
              aria-label={'Colour ' + col}
              style={{ width: 30, height: 30, borderRadius: 999, background: col, border: `3px solid ${(f.color || '#0F766E') === col ? 'var(--text)' : 'transparent'}`, cursor: 'pointer' }}
            />
          ))}
        </div>
        <Hint>Colour is never the only signal — the icon shape varies too.</Hint>
        <FieldError msg={errors.color} />
      </div>

      <div>
        <Label htmlFor="cat-desc" optional>Description</Label>
        <TextAreaField id="cat-desc" field="description" />
        <FieldError msg={errors.description} />
      </div>

      <div style={grid2}>
        <div>
          <Label htmlFor="cat-budget" optional>Monthly budget</Label>
          <AmountField id="cat-budget" field="budget" big={false} placeholder="No budget" />
          <Hint>Leave empty to track without a budget.</Hint>
        </div>
        <div>
          <Label htmlFor="cat-sort">Sort order</Label>
          <TextField id="cat-sort" field="sortOrder" inputMode="numeric" placeholder="99" />
        </div>
      </div>

      {editing && refs && refs.transactions > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 12px', borderRadius: 8, background: 'var(--elev)' }}>
          {refs.transactions} transaction{refs.transactions === 1 ? '' : 's'} use{refs.transactions === 1 ? 's' : ''} this category. Renaming or recolouring changes how they are displayed — never their amounts.
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
    const errs = validate.category(S, f, { id: f.editId || undefined, originalType: f.originalType || undefined });
    const budgetAmt = String(f.budget || '').trim() === '' ? 0 : parseAmt(f.budget);
    if (String(f.budget || '').trim() !== '' && !(budgetAmt >= 0)) errs.budget = 'The budget must be zero or more.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => upsertCategory(data, { form: f, budgetAmt }));
    closeDrawer();
    notify(f.editId ? 'Category updated.' : 'Category created.');
  };
}

export const categoryFormDef = {
  title: s => (s.form.editId ? 'Edit category' : 'Add category'),
  sub: () => 'Categories organise transactions, budgets, and charts',
  cta: s => (s.form.editId ? 'Save changes' : 'Add category'),
  Body,
  useSubmit,
};
