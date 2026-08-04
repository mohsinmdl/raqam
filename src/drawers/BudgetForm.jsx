// Budget drawer — design iteration 002 (template 1014-1041, submitBudget).
// One drawer for overall and per-category budgets; a budget is one standing
// monthly amount, with an opt-in rollover of last month's unspent.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney, parseAmt } from '../lib/format.js';
import { budgetSpent, catById, listCats, monthLabel } from '../lib/calc.js';
import { currentMonth } from '../lib/dates.js';
import { validate } from '../lib/validate.js';
import { upsertBudget, deleteBudget } from '../store/actions.js';
import { Label, FieldError, Hint, AmountField, noteBox } from './fields.jsx';

function Body() {
  const { drawer, setField } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const overall = !!f.overall;
  const fixedCat = !!f.fixedCat || (!!f.editId && !overall);
  const cat = f.category ? catById(S, f.category) : null;

  // Active expense categories that don't already have a budget (plus the current one when editing).
  const budgeted = S.budgets.filter(b => b.category && b.id !== f.editId).map(b => b.category);
  const catOpts = listCats(S, 'expense').filter(c => !budgeted.includes(c.id));
  const noCatsLeft = !fixedCat && !overall && catOpts.length === 0;

  const on = !!f.rollover;
  const spentNow = f.editId ? budgetSpent(S, { category: overall ? null : f.category, amount: 0 }, currentMonth()) : null;

  return (
    <>
      {overall && (
        <div style={{ ...noteBox('var(--soft)'), padding: '11px 14px', lineHeight: 1.55 }}>
          The overall budget covers every expense in a month — card purchases and transfer fees included. Category budgets sit inside it and are tracked separately.
        </div>
      )}

      {!overall && !fixedCat && (
        <div>
          <Label htmlFor="b-cat" required>Category</Label>
          <select id="b-cat" value={f.category ?? ''} onChange={e => setField('category', e.target.value)} className="field" style={{ padding: '0 10px' }}>
            <option value="">Choose a category…</option>
            {catOpts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <FieldError msg={errors.category} />
          {noCatsLeft && <Hint>Every active expense category already has a budget.</Hint>}
        </div>
      )}

      {!overall && fixedCat && cat && (
        <div>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Category</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--elev)', fontSize: 13.5 }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, flex: 'none', background: cat.color, borderRadius: 3 }} />
            {cat.name}
          </div>
          <Hint>A budget stays with its category. To budget something else, add a new one.</Hint>
        </div>
      )}

      <div>
        <Label htmlFor="b-amt" required>Monthly amount</Label>
        <AmountField id="b-amt" field="amount" />
        <FieldError msg={errors.amount} />
        <Hint>Applies to every month, not just this one.</Hint>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
        <button
          onClick={() => setField('rollover', !on)}
          role="switch"
          aria-checked={String(on)}
          aria-label="Roll over what is left"
          style={{ width: 44, height: 26, flex: 'none', padding: 2, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--track)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start' }}
        >
          <span aria-hidden="true" style={{ display: 'block', width: 20, height: 20, borderRadius: 999, background: on ? 'var(--on-accent)' : 'var(--surface)' }} />
        </button>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Roll over what’s left</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>
            Anything unspent last month is added to this month’s amount. Overspending never carries forward as debt.
          </div>
        </div>
      </div>

      {f.editId && spentNow != null && (
        <div style={{ padding: '11px 14px', borderRadius: 10, background: 'var(--elev)', border: '1px solid var(--border)', fontSize: 12.5, lineHeight: 1.55 }}>
          Spent so far in {monthLabel(currentMonth())}: <span className="tnum" style={{ fontWeight: 600 }}>{money(spentNow)}</span>. Changing the amount never changes recorded spending.
        </div>
      )}
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  const { money } = useMoney();
  return () => {
    const f = drawer.form;
    const errs = validate.budget(S, f, { id: f.editId || undefined, overall: !!f.overall });
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    const amt = parseAmt(f.amount);
    const cat = f.overall ? null : catById(S, f.category);
    const name = f.overall ? 'Overall monthly budget' : (cat ? cat.name : 'Budget');
    const editing = !!f.editId;
    applyData(data => upsertBudget(data, { form: f, amt }));
    closeDrawer();
    notify(editing ? '“' + name + '” budget updated.' : '“' + name + '” budget set at ' + money(amt) + ' a month.');
  };
}

// Remove budget from the drawer footer when editing a category budget.
function useDanger() {
  const { drawer, closeDrawer } = useDrawer();
  const { data: S, applyData } = useStore();
  const { ask, notify } = useUI();
  const f = drawer.form;
  if (!f.editId || f.overall) return null;
  return {
    label: 'Remove',
    onClick: async () => {
      const cat = catById(S, f.category);
      const name = cat ? '“' + cat.name + '”' : 'this budget';
      const ok = await ask({
        title: 'Remove this budget?',
        body: 'The budget on ' + name + ' is removed. No transaction, amount, or category is touched — that spending simply stops being measured against a limit.',
        action: 'Remove budget',
      });
      if (!ok) return;
      applyData(data => deleteBudget(data, { id: f.editId }));
      closeDrawer();
      notify('Budget removed.');
    },
  };
}

export const budgetFormDef = {
  title: s => (s.form.overall ? (s.form.editId ? 'Edit overall budget' : 'Set overall budget') : s.form.editId ? 'Edit budget' : 'Add budget'),
  sub: () => 'One monthly amount, applied to every month',
  cta: s => (s.form.editId ? 'Save changes' : s.form.overall ? 'Set overall budget' : 'Add budget'),
  Body,
  useSubmit,
  useDanger,
};
