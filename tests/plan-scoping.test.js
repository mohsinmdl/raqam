import { describe, it, expect, beforeEach } from 'vitest';

// Plan scoping (U2): the sync layer's isolation spine (L7). Every ledger
// collection is stamped with the active plan on push and filtered by it on
// fetch; the store itself never carries plan_id. The client mock follows
// audit-fetch.test.js: the builder is the resolved value fetchAll awaits and
// records which filters each table's chain received.
import { vi } from 'vitest';
vi.mock('../src/lib/supabase.js', () => {
  const calls = [];
  const makeBuilder = table => {
    const builder = {
      data: [], error: null,
      select: () => builder,
      eq: (col, val) => { calls.push([table, 'eq', col, val]); return builder; },
      order: () => builder,
      limit: () => builder,
    };
    return builder;
  };
  return { supabase: { from: table => makeBuilder(table) }, __calls: calls };
});

import { COLLECTIONS, diffStores, fetchAll, fetchPlans, pushRow, setActivePlanId } from '../src/store/sync.js';
import { __calls as fetchCalls } from '../src/lib/supabase.js';
import { createPlan, deletePlan, renamePlan, seedPlanCategories } from '../src/store/actions.js';
import { CATEGORIES } from '../src/store/seed.js';
import { migrateFlatViewPrefs, planPrefs } from '../src/lib/prefsStore.js';

const col = n => COLLECTIONS.find(c => c.name === n);
const SCOPED = ['categoryGroups', 'categories', 'accounts', 'snapshots', 'cards', 'transactions', 'budgets', 'assignments', 'recurring', 'payees', 'audit'];
const UNSCOPED = ['plans', 'institutions', 'cardProducts'];

beforeEach(() => {
  setActivePlanId('p1');
  fetchCalls.length = 0;
});

describe('plans collection descriptor', () => {
  it('comes first, so a new plan is pushed before any row that references it', () => {
    expect(COLLECTIONS[0].name).toBe('plans');
  });

  it('round-trips the camelCase settings fields', () => {
    const p = { id: 'p1', name: 'My Plan', currency: 'PKR', currencyPlacement: 'none', numberFormat: 'comma-dot', dateFormat: 'DD/MM/YYYY' };
    const c = col('plans');
    expect(c.toRow(p)).toEqual({ id: 'p1', name: 'My Plan', currency: 'PKR', currency_placement: 'none', number_format: 'comma-dot', date_format: 'DD/MM/YYYY' });
    expect(c.fromRow(c.toRow(p))).toEqual(p);
  });

  it('fetches created_at but never pushes it back', () => {
    const c = col('plans');
    const server = { id: 'p1', name: 'My Plan', currency: 'PKR', currency_placement: 'none', number_format: 'comma-dot', date_format: 'DD/MM/YYYY', created_at: '2026-08-01T00:00:00Z' };
    const local = c.fromRow(server);
    expect(local.createdAt).toBe('2026-08-01T00:00:00Z');
    expect(Object.keys(c.toRow(local))).not.toContain('created_at');
  });

  it('is itself unscoped and writable through the differ', () => {
    const c = col('plans');
    expect(c.planScoped).toBeFalsy();
    expect(c.toRow).toBeTypeOf('function');
    expect(c.writable).toBeUndefined(); // default: all rows writable
  });
});

describe('planScoped flags (L7)', () => {
  it('exactly the 11 ledger collections are scoped', () => {
    expect(COLLECTIONS.filter(c => c.planScoped).map(c => c.name).sort()).toEqual([...SCOPED].sort());
  });

  it.each(UNSCOPED)('%s stays unscoped (shared reference data / the plans list itself)', n => {
    expect(col(n).planScoped).toBeFalsy();
  });
});

describe('pushRow stamping (BR-U2-3)', () => {
  it('stamps the active plan onto every scoped row and leaves mappers pure', () => {
    const g = { id: 'g1', name: 'Bills', sortOrder: 1 };
    expect(pushRow(col('categoryGroups'), g).plan_id).toBe('p1');
    expect(col('categoryGroups').toRow(g).plan_id).toBeUndefined(); // mapper untouched
    setActivePlanId('p2');
    expect(pushRow(col('categoryGroups'), g).plan_id).toBe('p2');
  });

  it('does not stamp unscoped rows', () => {
    expect(pushRow(col('plans'), { id: 'p1', name: 'My Plan' }).plan_id).toBeUndefined();
    expect(pushRow(col('institutions'), { id: 'hbl', name: 'HBL', kind: 'Conventional', own: true }).plan_id).toBeUndefined();
  });

  it('fromRow never surfaces plan_id into the store', () => {
    for (const name of SCOPED) {
      const c = col(name);
      // Minimal rows per collection: only the fields each fromRow reads.
      const row = { id: 'x', plan_id: 'p9', name: 'n', amount: 0, history: [], occurrences: [], rename_rules: [] };
      expect(c.fromRow(row).plan_id).toBeUndefined();
      expect(c.fromRow(row).planId).toBeUndefined();
    }
  });

  it('diffing a hydrated store against itself writes nothing (stamping is symmetric)', () => {
    const store = { categoryGroups: [{ id: 'g1', name: 'Bills', sortOrder: 1 }], transactions: [] };
    expect(diffStores(store, store)).toEqual([]);
  });

  it('diff payloads carry the stamp', () => {
    const prev = { transactions: [] };
    const next = { transactions: [{ id: 't1', date: '2026-08-23T12:00', type: 'expense', amount: 500, accountId: 'a1', status: 'cleared' }] };
    const d = diffStores(prev, next).find(x => x.collection.name === 'transactions');
    expect(d.added[0].plan_id).toBe('p1');
  });
});

describe('fetch filters (US-11/12)', () => {
  it('fetchAll(planId) filters every scoped table by plan and no unscoped one', async () => {
    fetchCalls.length = 0;
    await fetchAll('p1');
    const planFilters = fetchCalls.filter(c => c[1] === 'eq' && c[2] === 'plan_id');
    expect(new Set(planFilters.map(c => c[0]))).toEqual(new Set(SCOPED.map(n => col(n).table)));
    expect(planFilters.every(c => c[3] === 'p1')).toBe(true);
  });

  it('fetchAll returns the plans list as a store collection', async () => {
    const store = await fetchAll('p1');
    expect(store.plans).toEqual([]);
  });

  it('fetchPlans hits only the plans table, unfiltered', async () => {
    fetchCalls.length = 0;
    const plans = await fetchPlans();
    expect(plans).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });
});

describe('plan actions', () => {
  const base = { plans: [{ id: 'p1', name: 'My Plan', currency: 'PKR', currencyPlacement: 'none', numberFormat: 'comma-dot', dateFormat: 'DD/MM/YYYY' }], categories: [] };

  it('createPlan appends a validated plan and clamps bad settings to the defaults', () => {
    const next = createPlan(base, { id: 'p2', name: '  Family  ', currency: 'usd', currencyPlacement: 'left', numberFormat: 'nope', dateFormat: 'nope' });
    expect(next.plans).toHaveLength(2);
    expect(next.plans[1]).toEqual({ id: 'p2', name: 'Family', currency: 'PKR', currencyPlacement: 'none', numberFormat: 'comma-dot', dateFormat: 'DD/MM/YYYY' });
  });

  it('createPlan keeps catalogue-valid settings as given', () => {
    const next = createPlan(base, { id: 'p2', name: 'US', currency: 'USD', currencyPlacement: 'before', numberFormat: 'dot-comma', dateFormat: 'MM/DD/YYYY' });
    expect(next.plans[1]).toMatchObject({ currency: 'USD', currencyPlacement: 'before', numberFormat: 'dot-comma', dateFormat: 'MM/DD/YYYY' });
  });

  it('createPlan rejects an empty, whitespace, or over-long name unchanged', () => {
    expect(createPlan(base, { name: '' })).toBe(base);
    expect(createPlan(base, { name: '   ' })).toBe(base);
    expect(createPlan(base, { name: 'x'.repeat(81) })).toBe(base);
  });

  it('createPlan rejects a duplicate id unchanged', () => {
    expect(createPlan(base, { id: 'p1', name: 'Dup' })).toBe(base);
  });

  it('renamePlan trims, validates, and no-ops on missing plan or same name', () => {
    expect(renamePlan(base, { id: 'p1', name: ' Household ' }).plans[0].name).toBe('Household');
    expect(renamePlan(base, { id: 'nope', name: 'X' })).toBe(base);
    expect(renamePlan(base, { id: 'p1', name: '' })).toBe(base);
    expect(renamePlan(base, { id: 'p1', name: 'My Plan' })).toBe(base);
  });

  it('deletePlan removes the row but never the last plan (BR-U2-9)', () => {
    const two = createPlan(base, { id: 'p2', name: 'Family' });
    expect(deletePlan(two, { id: 'p2' }).plans.map(p => p.id)).toEqual(['p1']);
    expect(deletePlan(base, { id: 'p1' })).toBe(base); // last-plan guard
    expect(deletePlan(two, { id: 'nope' })).toBe(two);
  });

  it('seedPlanCategories mints fresh ids, preserving everything else', () => {
    const next = seedPlanCategories({ categories: [] });
    expect(next.categories).toHaveLength(CATEGORIES.length);
    next.categories.forEach((c, i) => {
      const { id, ...rest } = c;
      const { id: seedId, ...seedRest } = CATEGORIES[i];
      expect(id).not.toBe(seedId); // never the fixed catalogue id (U1 rule)
      expect(rest).toEqual(seedRest); // name/type/color/icon/sortOrder/isSystem/status/description
    });
    // Fresh every time: two seeded plans never share category ids.
    const again = seedPlanCategories({ categories: [] });
    expect(again.categories[0].id).not.toBe(next.categories[0].id);
  });

  it('seedPlanCategories no-ops when any category exists', () => {
    const populated = { categories: [{ id: 'c1', name: 'X' }] };
    expect(seedPlanCategories(populated)).toBe(populated);
  });
});

describe('per-plan view prefs migration (BR-U2-7)', () => {
  it('folds the flat view keys into the default plan namespace and removes them', () => {
    const flat = { skippedSetup: true, planViews: [{ id: 'v1' }], builtinViews: [{ id: 'overspent', hidden: true }] };
    const out = migrateFlatViewPrefs(flat);
    expect(out.planViews).toBeUndefined();
    expect(out.builtinViews).toBeUndefined();
    expect(out.skippedSetup).toBe(true);
    expect(planPrefs(out, 'default')).toEqual({ customViews: [{ id: 'v1' }], builtinViews: [{ id: 'overspent', hidden: true }] });
  });

  it('is idempotent and never clobbers an existing namespaced value', () => {
    const flat = { planViews: [{ id: 'old' }], plans: { default: { customViews: [{ id: 'kept' }] } } };
    const once = migrateFlatViewPrefs(flat);
    expect(planPrefs(once, 'default').customViews).toEqual([{ id: 'kept' }]);
    expect(migrateFlatViewPrefs(once)).toBe(once); // nothing left to fold
  });

  it('passes already-migrated prefs through untouched', () => {
    const clean = { skippedSetup: false, plans: { p1: { customViews: [] } } };
    expect(migrateFlatViewPrefs(clean)).toBe(clean);
  });

  it('planPrefs returns an empty namespace for an unknown plan', () => {
    expect(planPrefs({ plans: {} }, 'p9')).toEqual({});
    expect(planPrefs({}, 'p9')).toEqual({});
  });
});
