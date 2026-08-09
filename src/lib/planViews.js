// Plan-screen filter views (Phase 4). Two kinds share one shape so the pill bar
// and the filter path never branch on kind: BUILT-INS carry a `match` predicate
// over the envelope row; CUSTOM views carry an explicit `categoryIds` set.
// Spec: docs/superpowers/specs/2026-08-09-envelope-budget-phase4-views-design.md
//
// Snoozed is deliberately absent: it needs snoozing support, not yet built.
// Underfunded = a target shortfall OR overspend (targets.js's underfundedNeed,
// the same figure the Auto-Assign "Underfunded" action funds) — deliberately a
// SUPERSET of Overspent, not merely equal to it when no targets exist. Verified
// live against YNAB.
import { hasTarget, targetNeeded, isOverTarget, underfundedNeed } from './targets.js';

const availOf = (env, id) => (env.rows.get(id) || { available: 0 }).available;

// Over target and not also short — guards the edge where a set-aside category
// can read both "over target" (assigned > target) and still owe money for the
// month's overspend (negative available): that category is Underfunded, not
// Overfunded.
function overfundedMatch(cat, env) {
  const r = env.rows.get(cat.id) || {};
  return hasTarget(cat) && targetNeeded(r, cat) === 0 && isOverTarget(r, cat);
}

export const BUILTIN_VIEWS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All', match: null }),
  Object.freeze({ id: 'overspent', label: 'Overspent', match: (cat, env) => availOf(env, cat.id) < 0 }),
  Object.freeze({ id: 'underfunded', label: 'Underfunded', match: (cat, env) => underfundedNeed(env.rows.get(cat.id) || {}, cat) > 0 }),
  Object.freeze({ id: 'overfunded', label: 'Overfunded', match: overfundedMatch }),
  Object.freeze({ id: 'available', label: 'Money Available', match: (cat, env) => availOf(env, cat.id) > 0 }),
]);

export const isBuiltin = id => BUILTIN_VIEWS.some(v => v.id === id);

// "All" is the reset filter — always first, always visible, never hidden or
// reordered. Only these four built-ins carry a user-editable order + hidden
// flag (persisted in prefs.builtinViews).
export const TOGGLEABLE_BUILTINS = Object.freeze(BUILTIN_VIEWS.filter(v => v.id !== 'all'));
const TOGGLEABLE_IDS = Object.freeze(TOGGLEABLE_BUILTINS.map(v => v.id));

// prefs.builtinViews is a hand-editable localStorage value, so every read is
// repaired: exactly the four toggleable ids, in the stored order, unknown ids
// and duplicates dropped, any missing appended in canonical order, hidden
// coerced to boolean. Result shape: [{ id, hidden }].
export function normalizeBuiltins(raw) {
  const seen = new Set();
  const kept = (Array.isArray(raw) ? raw : [])
    .filter(v => v && TOGGLEABLE_IDS.includes(v.id) && !seen.has(v.id) && seen.add(v.id) !== false)
    .map(v => ({ id: v.id, hidden: !!v.hidden }));
  for (const id of TOGGLEABLE_IDS) if (!seen.has(id)) kept.push({ id, hidden: false });
  return kept;
}

// Reorder within the toggleable-built-ins pref, same splice-then-insert
// semantics as reorderViews.
export function reorderBuiltins(pref, fromId, toId) {
  if (fromId === toId) return pref;
  const from = pref.findIndex(v => v.id === fromId);
  const to = pref.findIndex(v => v.id === toId);
  if (from < 0 || to < 0) return pref;
  const next = [...pref];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Flip one built-in's hidden flag.
export function toggleBuiltinHidden(pref, id) {
  return pref.map(v => (v.id === id ? { ...v, hidden: !v.hidden } : v));
}

const viewById = id => BUILTIN_VIEWS.find(v => v.id === id);

// For the pill bar: All (pinned) followed by the visible toggleable built-ins
// in the user's order — full view objects, ready to render.
export function orderedBuiltinViews(pref) {
  return [viewById('all'), ...normalizeBuiltins(pref).filter(v => !v.hidden).map(v => viewById(v.id))];
}

// For Manage Views: the four toggleable built-ins in order, each paired with
// its label and hidden flag (All is shown separately as a pinned row).
export function builtinRows(pref) {
  return normalizeBuiltins(pref).map(v => ({ id: v.id, label: viewById(v.id).label, hidden: v.hidden }));
}

// A view id that resolves to a hidden built-in must not filter invisibly — the
// caller treats it as "All". Custom and visible built-in ids pass through.
export function isHiddenBuiltin(pref, id) {
  return normalizeBuiltins(pref).some(v => v.id === id && v.hidden);
}

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

export const MAX_NAME = 40;

// prefs live in localStorage: user-editable, and they outlive the categories
// they reference. Every read is repaired rather than trusted.
export function normalizeViews(raw, cats) {
  if (!Array.isArray(raw)) return [];
  const live = new Set((cats || []).map(c => c.id));
  const seen = new Set();
  return raw
    // Drop a pref whose id collides with a built-in (localStorage is
    // hand-editable): it would give two pills the same React key and let a
    // custom view render the built-in's badge count.
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
