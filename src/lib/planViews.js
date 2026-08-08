// Plan-screen filter views (Phase 4). Two kinds share one shape so the pill bar
// and the filter path never branch on kind: BUILT-INS carry a `match` predicate
// over the envelope row; CUSTOM views carry an explicit `categoryIds` set.
// Spec: docs/superpowers/specs/2026-08-09-envelope-budget-phase4-views-design.md
//
// Underfunded/Overfunded/Snoozed are deliberately absent: they need targets or
// snoozing. Verified live against YNAB that, with no targets, "Underfunded"
// returns exactly the same rows as "Overspent".
const availOf = (env, id) => (env.rows.get(id) || { available: 0 }).available;

export const BUILTIN_VIEWS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All', match: null }),
  Object.freeze({ id: 'overspent', label: 'Overspent', match: (cat, env) => availOf(env, cat.id) < 0 }),
  Object.freeze({ id: 'available', label: 'Money Available', match: (cat, env) => availOf(env, cat.id) > 0 }),
]);

export const isBuiltin = id => BUILTIN_VIEWS.some(v => v.id === id);

// Only Overspent shows a badge (YNAB shows no count on the others).
export function countFor(id, env, catIds) {
  if (id !== 'overspent') return 0;
  return catIds.reduce((n, cid) => n + (availOf(env, cid) < 0 ? 1 : 0), 0);
}

export function matchesView(view, cat, env) {
  if (!view || view.id === 'all') return true;
  if (view.match) return !!view.match(cat, env);
  return (view.categoryIds || []).includes(cat.id);
}

// Hides rows, never numbers: `totals` is carried through untouched so a group's
// figures mean the same thing in every view.
export function visibleSections(sections, view, env) {
  if (!view || view.id === 'all') return sections;
  const out = [];
  for (const s of sections) {
    const cats = s.cats.filter(c => matchesView(view, c, env));
    if (cats.length) out.push({ ...s, cats });
  }
  return out;
}

const MAX_NAME = 40;

// prefs live in localStorage: user-editable, and they outlive the categories
// they reference. Every read is repaired rather than trusted.
export function normalizeViews(raw, cats) {
  if (!Array.isArray(raw)) return [];
  const live = new Set((cats || []).map(c => c.id));
  const seen = new Set();
  return raw
    .filter(v => v && typeof v.id === 'string' && !isBuiltin(v.id) && !seen.has(v.id) && seen.add(v.id) !== false)
    .map(v => ({
      id: v.id,
      name: String(v.name || 'Untitled').slice(0, MAX_NAME),
      categoryIds: [...new Set((Array.isArray(v.categoryIds) ? v.categoryIds : []).filter(id => live.has(id)))],
      sortOrder: Number.isFinite(v.sortOrder) ? v.sortOrder : 999,
    }))
    .filter(v => v.categoryIds.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v, i) => ({ ...v, sortOrder: i }));
}

export function reorderViews(views, fromId, toId) {
  if (fromId === toId) return views;
  const from = views.findIndex(v => v.id === fromId);
  const to = views.findIndex(v => v.id === toId);
  if (from < 0 || to < 0) return views;
  const next = [...views];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((v, i) => ({ ...v, sortOrder: i }));
}

export function newView(name, categoryIds, existing) {
  return {
    id: 'v_' + Math.random().toString(36).slice(2, 10),
    name: String(name || '').slice(0, MAX_NAME),
    categoryIds: [...new Set(categoryIds || [])],
    sortOrder: (existing || []).length,
  };
}
