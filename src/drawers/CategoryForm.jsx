// Category create/edit drawer — design v2 template 892-929 + submitCategory.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { catRefs } from '../lib/calc.js';
import { validate } from '../lib/validate.js';
import { upsertCategory } from '../store/actions.js';
import { ICONS, CATEGORY_COLORS, iconStyle } from '../lib/catIcon.js';
import { Label, FieldError, Hint, TextField, SelectField, TextAreaField, grid2 } from './fields.jsx';

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
        {f.type === 'expense' && !!f.excludeFromBudget && (
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--info-soft)', color: 'var(--info)', flex: 'none' }}>Excluded from budgets</span>
        )}
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
          <Label htmlFor="cat-sort">Sort order</Label>
          <TextField id="cat-sort" field="sortOrder" inputMode="numeric" placeholder="99" />
        </div>
        <div />
      </div>

      {f.type === 'expense' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
          <button
            onClick={() => setField('excludeFromBudget', !f.excludeFromBudget)}
            role="switch"
            aria-checked={String(!!f.excludeFromBudget)}
            aria-label="Exclude from budgets"
            style={{ width: 44, height: 26, flex: 'none', padding: 2, border: `1px solid ${f.excludeFromBudget ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 999, background: f.excludeFromBudget ? 'var(--accent)' : 'var(--track)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: f.excludeFromBudget ? 'flex-end' : 'flex-start' }}
          >
            <span aria-hidden="true" style={{ display: 'block', width: 20, height: 20, borderRadius: 999, background: f.excludeFromBudget ? 'var(--on-accent)' : 'var(--surface)' }} />
          </button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Exclude from budgets</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>
              Use for advances or money you expect to receive back. Transactions still affect account and card balances, but they do not count toward monthly budgets.
            </div>
          </div>
        </div>
      )}

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
  const { notify, ask } = useUI();
  return async () => {
    const f = drawer.form;
    const errs = validate.category(S, f, { id: f.editId || undefined, originalType: f.originalType || undefined });
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    // Turning exclusion on while a budget exists removes that budget — confirm first.
    const droppingBudget = !!f.editId && f.type === 'expense' && !!f.excludeFromBudget
      && !S.categories.find(c => c.id === f.editId)?.excludeFromBudget
      && S.budgets.some(b => b.category === f.editId);
    if (droppingBudget) {
      const ok = await ask({
        title: 'Exclude “' + f.name.trim() + '” from budgets?',
        body: 'Its transactions will continue to affect account balances, but they will no longer count as spending. The existing category budget will be removed.',
        action: 'Exclude from budgets',
      });
      if (!ok) return;
    }
    applyData(data => upsertCategory(data, { form: f }));
    closeDrawer();
    notify(droppingBudget ? 'Category updated — its budget was removed.' : f.editId ? 'Category updated.' : 'Category created.');
  };
}

export const categoryFormDef = {
  title: s => (s.form.editId ? 'Edit category' : 'Add category'),
  sub: () => 'Categories organise transactions, budgets, and charts',
  cta: s => (s.form.editId ? 'Save changes' : 'Add category'),
  Body,
  useSubmit,
};
