// Delete-with-reassignment drawer — design v2 template 930-949 + submitReassign.
// Everything that points at the category is repointed to the replacement, then
// the category is removed — one store transition, all-or-nothing client-side.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { catRefs } from '../lib/calc.js';
import { envelopeFor } from '../lib/envelope.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { reassignDeleteCategory } from '../store/actions.js';
import PlanCategoryPicker from '../ui/PlanCategoryPicker.jsx';
import { Label, FieldError, noteBox } from './fields.jsx';

function Body() {
  const { drawer, setField } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const cat = S.categories.find(c => c.id === f.catId);
  if (!cat) return null;
  const refs = catRefs(S, cat.id);
  const usedBits = [
    refs.transactions ? refs.transactions + ' transaction' + (refs.transactions === 1 ? '' : 's') : null,
    refs.budgets ? refs.budgets + ' budget' + (refs.budgets === 1 ? '' : 's') : null,
    refs.recurring ? refs.recurring + ' recurring item' + (refs.recurring === 1 ? '' : 's') : null,
    refs.assignments ? refs.assignments + ' assignment' + (refs.assignments === 1 ? '' : 's') : null,
  ].filter(Boolean).join(', ');
  const month = currentMonth();
  const env = envelopeFor(S, month, nowIso());

  return (
    <>
      <div role="alert" style={{ ...noteBox('var(--warn-soft)'), border: '1px solid var(--warn)' }}>
        <span style={{ fontWeight: 700, color: 'var(--warn)' }}>“{cat.name}” is still in use — </span>
        {usedBits} point at it. Choose where they should go before it can be deleted.
      </div>
      <div>
        <Label required>Move everything to</Label>
        <PlanCategoryPicker
          env={env} S={S} month={month} money={money}
          catType={cat.type} showAmounts={cat.type === 'expense'} excludeRta excludeId={cat.id} heading={null}
          value={f.replacement || null} onChange={id => setField('replacement', id)}
        />
        <FieldError msg={errors.replacement} />
      </div>
      <div style={{ ...noteBox('var(--soft)'), lineHeight: 1.55 }}>
        <span style={{ fontWeight: 700, color: 'var(--accent-h)' }}>What happens: </span>
        every reference is moved to the replacement and “{cat.name}” is deleted — amounts never change, and the whole step is recorded in history.
      </div>
    </>
  );
}

function useSubmit() {
  const { drawer, closeDrawer, fail } = useDrawer();
  const { data: S, applyData } = useStore();
  const { notify } = useUI();
  return () => {
    const f = drawer.form, errs = {};
    if (!f.replacement) errs.replacement = 'Choose the replacement category.';
    else if (f.replacement === f.catId) errs.replacement = 'Choose a different category.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    const cat = S.categories.find(c => c.id === f.catId);
    applyData(data => reassignDeleteCategory(data, { id: f.catId, replacementId: f.replacement }));
    closeDrawer();
    notify('“' + (cat?.name || 'Category') + '” deleted — everything moved to the replacement.');
  };
}

export const reassignFormDef = {
  title: () => 'Delete and reassign',
  sub: () => 'References move first — amounts never change',
  cta: () => 'Move references and delete',
  Body,
  useSubmit,
};
