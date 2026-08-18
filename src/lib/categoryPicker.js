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
