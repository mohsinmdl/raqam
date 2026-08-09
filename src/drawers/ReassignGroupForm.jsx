// Delete-a-whole-group-with-reassignment drawer (YNAB "Delete Category Group").
// Shown when a group's categories still carry references: pick one replacement
// category (outside the group) and everything the group's categories own —
// transactions, budgets, recurring, assigned + available amounts — is moved
// there, the categories are deleted, and the group is removed. One store
// transition via reassignDeleteCategoryGroup.
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useMoney } from '../lib/format.js';
import { catRefs } from '../lib/calc.js';
import { envelopeFor } from '../lib/envelope.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { reassignDeleteCategoryGroup } from '../store/actions.js';
import PlanCategoryPicker from '../ui/PlanCategoryPicker.jsx';
import { Label, FieldError, noteBox } from './fields.jsx';

function groupCats(S, groupId) {
  return S.categories.filter(c => c.groupId === groupId && c.status === 'active');
}

function Body() {
  const { drawer, setField } = useDrawer();
  const { data: S } = useStore();
  const { money } = useMoney();
  const f = drawer.form, errors = drawer.errors;
  const group = (S.categoryGroups || []).find(g => g.id === f.groupId);
  if (!group) return null;
  const cats = groupCats(S, group.id);
  const txCount = cats.reduce((n, c) => n + catRefs(S, c.id).transactions, 0);
  const month = currentMonth();
  const env = envelopeFor(S, month, nowIso());
  // Replacement: any active expense category outside this group.
  const excludeIds = S.categories.filter(c => c.groupId === group.id).map(c => c.id);

  return (
    <>
      <div style={{ lineHeight: 1.55 }}>
        All <strong>[{cats.length}]</strong> categories in the group <strong>{group.name}</strong> will be reassigned to the selected category.
      </div>
      <div>
        <Label required>Select category</Label>
        <PlanCategoryPicker
          env={env} S={S} month={month} money={money}
          excludeRta excludeIds={excludeIds}
          value={f.replacement || null} onChange={id => setField('replacement', id)}
        />
        <FieldError msg={errors.replacement} />
      </div>
      <div style={{ ...noteBox('var(--soft)'), lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent-h)', marginBottom: 4 }}>Here’s what will be reassigned to the new category:</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>All transactions <strong>[{txCount}]</strong></li>
          <li>All assigned amounts</li>
          <li>Any remaining available amount</li>
        </ul>
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
    const group = (S.categoryGroups || []).find(g => g.id === f.groupId);
    const inGroup = new Set(groupCats(S, f.groupId).map(c => c.id));
    if (!f.replacement) errs.replacement = 'Choose the replacement category.';
    else if (inGroup.has(f.replacement)) errs.replacement = 'Choose a category outside this group.';
    if (Object.keys(errs).length) { fail(errs, Object.values(errs)); return; }
    applyData(data => reassignDeleteCategoryGroup(data, { id: f.groupId, replacementId: f.replacement }));
    closeDrawer();
    notify('Group “' + (group?.name || '') + '” deleted — its categories moved to the replacement.');
  };
}

export const reassignGroupFormDef = {
  title: () => 'Delete Category Group',
  sub: () => 'Categories are reassigned first — amounts never change',
  cta: () => 'Delete',
  Body,
  useSubmit,
};
