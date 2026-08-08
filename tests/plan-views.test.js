import { describe, it, expect } from 'vitest';
import {
  BUILTIN_VIEWS, isBuiltin, countFor, matchesView, visibleSections,
  normalizeViews, reorderViews, newView,
} from '../src/lib/planViews.js';

const cat = (id, name) => ({ id, name, type: 'expense', status: 'active' });
const CATS = [cat('a', 'Groceries'), cat('b', 'Fuel'), cat('c', 'Rent')];
const env = {
  rows: new Map([
    ['a', { assigned: 100, activity: -20, available: 80, carryIn: 0 }],   // money available
    ['b', { assigned: 100, activity: -150, available: -50, carryIn: 0 }], // overspent
    ['c', { assigned: 100, activity: -100, available: 0, carryIn: 0 }],   // exactly zero
  ]),
};
const SECTIONS = [
  { group: { id: 'g1', name: 'Needs' }, key: 'g1', cats: [CATS[0], CATS[1]], totals: { assigned: 200, activity: -170, available: 30 } },
  { group: { id: 'g2', name: 'Bills' }, key: 'g2', cats: [CATS[2]], totals: { assigned: 100, activity: -100, available: 0 } },
];
const view = id => BUILTIN_VIEWS.find(v => v.id === id);

describe('built-in views', () => {
  it('exposes exactly All, Overspent and Money Available', () => {
    expect(BUILTIN_VIEWS.map(v => v.id)).toEqual(['all', 'overspent', 'available']);
    expect(BUILTIN_VIEWS.map(v => v.label)).toEqual(['All', 'Overspent', 'Money Available']);
    expect(isBuiltin('all')).toBe(true);
    expect(isBuiltin('v_custom')).toBe(false);
  });
  it('treats available === 0 as neither overspent nor available', () => {
    expect(matchesView(view('overspent'), CATS[2], env)).toBe(false);
    expect(matchesView(view('available'), CATS[2], env)).toBe(false);
    expect(matchesView(view('all'), CATS[2], env)).toBe(true);
  });
  it('matches on the sign of available', () => {
    expect(matchesView(view('overspent'), CATS[1], env)).toBe(true);
    expect(matchesView(view('available'), CATS[0], env)).toBe(true);
    expect(matchesView(view('available'), CATS[1], env)).toBe(false);
  });
  it('counts only for overspent (badge); all/available report 0', () => {
    const ids = CATS.map(c => c.id);
    expect(countFor('overspent', env, ids)).toBe(1);
    expect(countFor('all', env, ids)).toBe(0);
    expect(countFor('available', env, ids)).toBe(0);
  });
});

describe('custom views', () => {
  it('matches by explicit category id set', () => {
    const v = { id: 'v1', name: 'Fixed', categoryIds: ['c'], sortOrder: 1 };
    expect(matchesView(v, CATS[2], env)).toBe(true);
    expect(matchesView(v, CATS[0], env)).toBe(false);
  });
  it('newView assigns a unique id and appends after existing views', () => {
    const a = newView('Fixed', ['c'], []);
    expect(a.sortOrder).toBe(0);
    expect(a.categoryIds).toEqual(['c']);
    const b = newView('Fun', ['a'], [a]);
    expect(b.sortOrder).toBe(1);
    expect(b.id).not.toBe(a.id);
  });
});

describe('visibleSections', () => {
  it('returns sections untouched for All', () => {
    expect(visibleSections(SECTIONS, view('all'), env)).toEqual(SECTIONS);
  });
  it('drops groups with no matching child but keeps TRUE group totals', () => {
    const out = visibleSections(SECTIONS, view('overspent'), env);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('g1');
    expect(out[0].cats.map(c => c.id)).toEqual(['b']);
    expect(out[0].totals).toEqual(SECTIONS[0].totals); // NOT recomputed for the filtered subset
  });
  it('returns an empty array when nothing matches', () => {
    const v = { id: 'v2', name: 'None', categoryIds: [], sortOrder: 0 };
    expect(visibleSections(SECTIONS, v, env)).toEqual([]);
  });
});

describe('normalizeViews', () => {
  it('drops category ids that no longer exist and views left empty', () => {
    const raw = [
      { id: 'v1', name: 'Mixed', categoryIds: ['a', 'gone'], sortOrder: 0 },
      { id: 'v2', name: 'Dead', categoryIds: ['gone'], sortOrder: 1 },
    ];
    const out = normalizeViews(raw, CATS);
    expect(out).toHaveLength(1);
    expect(out[0].categoryIds).toEqual(['a']);
  });
  it('repairs junk: non-array input, missing fields, duplicate ids, long names, bad order', () => {
    expect(normalizeViews(null, CATS)).toEqual([]);
    expect(normalizeViews('nope', CATS)).toEqual([]);
    const out = normalizeViews([
      { id: 'v2', name: 'Second', categoryIds: ['a', 'a'], sortOrder: 5 },
      { id: 'v1', name: 'x'.repeat(80), categoryIds: ['b'] },
      { id: 'v2', name: 'Duplicate id', categoryIds: ['b'], sortOrder: 9 },
      { name: 'No id', categoryIds: ['a'] },
    ], CATS);
    // v1 carries no sortOrder (-> 999), so it sorts AFTER v2 (5); the
    // duplicate id and the id-less entry are both dropped.
    expect(out.map(v => v.id)).toEqual(['v2', 'v1']);
    expect(out[0].categoryIds).toEqual(['a']);              // de-duped
    expect(out[1].name).toHaveLength(40);                   // truncated
    expect(out.map(v => v.sortOrder)).toEqual([0, 1]);      // resequenced
  });
  it('drops a hand-edited pref whose id collides with a builtin', () => {
    const raw = [
      { id: 'overspent', name: 'X', categoryIds: ['a'] },
      { id: 'v1', name: 'Valid', categoryIds: ['b'] },
    ];
    const out = normalizeViews(raw, CATS);
    expect(out.map(v => v.id)).toEqual(['v1']);
  });
});

describe('reorderViews', () => {
  const V = [
    { id: 'v1', name: 'A', categoryIds: ['a'], sortOrder: 0 },
    { id: 'v2', name: 'B', categoryIds: ['b'], sortOrder: 1 },
    { id: 'v3', name: 'C', categoryIds: ['c'], sortOrder: 2 },
  ];
  it('moves first to last and resequences', () => {
    const out = reorderViews(V, 'v1', 'v3');
    expect(out.map(v => v.id)).toEqual(['v2', 'v3', 'v1']);
    expect(out.map(v => v.sortOrder)).toEqual([0, 1, 2]);
  });
  it('moves last before first', () => {
    expect(reorderViews(V, 'v3', 'v1').map(v => v.id)).toEqual(['v3', 'v1', 'v2']);
  });
  it('no-ops for same/unknown ids', () => {
    expect(reorderViews(V, 'v2', 'v2')).toEqual(V);
    expect(reorderViews(V, 'nope', 'v1')).toEqual(V);
  });

  it('moves a middle item across multiple positions (splice-then-insert, not a pairwise swap)', () => {
    const FIVE = [
      { id: 'v1', name: 'A', categoryIds: ['a'], sortOrder: 0 },
      { id: 'v2', name: 'B', categoryIds: ['b'], sortOrder: 1 },
      { id: 'v3', name: 'C', categoryIds: ['c'], sortOrder: 2 },
      { id: 'v4', name: 'D', categoryIds: ['a'], sortOrder: 3 },
      { id: 'v5', name: 'E', categoryIds: ['b'], sortOrder: 4 },
    ];
    // Hand-derived: [v1,v2,v3,v4,v5] with v2 removed -> [v1,v3,v4,v5]; then v2
    // spliced back in at index 3 (v4's original index) -> [v1,v3,v4,v2,v5].
    // This is NOT a pairwise swap of v2 and v4 (that would give
    // [v1,v4,v3,v2,v5]) — splice-then-insert shifts v3 and v4 down by one.
    const out = reorderViews(FIVE, 'v2', 'v4');
    expect(out.map(v => v.id)).toEqual(['v1', 'v3', 'v4', 'v2', 'v5']);
    expect(out.map(v => v.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  });
});
