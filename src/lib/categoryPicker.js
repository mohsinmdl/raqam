import { sortGroups, byOrderThenName } from './categoryOrder.js';

// Active categories of one type, grouped and ordered for a picker and filtered by
// a search string — shared by the phone CategoryPickerSheet and the desktop
// CategoryPickerPopover so both list the same rows in the same order. Empty
// groups are dropped. RTA is never a real category, so type-filtering excludes it.
export function categoryPickerSections(S, catType, q) {
  const ql = (q || '').trim().toLowerCase();
  const cats = (S.categories || []).filter(c => c.type === catType && c.status === 'active'
    && (!ql || c.name.toLowerCase().includes(ql)));
  const groups = sortGroups(S.categoryGroups);
  const ids = new Set(groups.map(g => g.id));
  const byGroup = key => cats.filter(c => ((c.groupId && ids.has(c.groupId)) ? c.groupId : 'other') === key)
    .sort(byOrderThenName);
  return [...groups.map(g => ({ id: g.id, name: g.name, cats: byGroup(g.id) })),
    { id: 'other', name: 'Other', cats: byGroup('other') }]
    .filter(s => s.cats.length > 0);
}

// Two-section list for an INFLOW row in the inline tx editor. An inflow is
// income by default, but pointing it at an EXPENSE category makes it a refund
// (the editor's state machine flips income→refund on an expense-typed pick), so
// the picker must offer both: an `Income` section and a `Refund to…` section of
// expense categories. Flat and name-ordered (grouping is dropped in the refund
// context — this is the compact inline picker, and typeahead covers long lists);
// archived + excludeIds filtered out. RTA is the caller's concern (the inline
// editor excludes it). Items use PlanCategoryPicker's row shape so the component
// renders them directly. Empty sections are dropped.
export function inflowPickerSections(S, q, excludeIds) {
  const ql = (q || '').trim().toLowerCase();
  const excl = new Set(excludeIds || []);
  const rows = type => (S.categories || [])
    .filter(c => c.type === type && c.status === 'active' && !excl.has(c.id)
      && (!ql || c.name.toLowerCase().includes(ql)))
    .sort(byOrderThenName)
    .map(c => ({ kind: 'cat', cat: c }));
  const income = rows('income');
  const expense = rows('expense');
  const out = [];
  if (income.length) out.push({ key: 'income', name: 'Income', items: income });
  if (expense.length) out.push({ key: 'refund', name: 'Refund to…', items: expense });
  return out;
}
