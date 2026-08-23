import { describe, it, expect, vi } from 'vitest';

// A fake PostgREST builder per table, recording which chain methods were
// called on it. `select('*')` starts the chain; `order`/`limit` (applied only
// by audit's fetchQuery) mutate the same object and record the call against
// its table. The builder itself is the resolved value fetchAll awaits — it
// carries `data`/`error` directly, no `.then` needed for Promise.all to work.
vi.mock('../src/lib/supabase.js', () => {
  const calls = [];
  const makeBuilder = table => {
    const builder = {
      data: [], error: null,
      select: () => builder,
      eq: () => builder, // plan_id scoping (U2) — asserted in plan-scoping.test.js, transparent here
      order: (col, opts) => { calls.push([table, 'order', col, opts]); return builder; },
      limit: n => { calls.push([table, 'limit', n]); return builder; },
    };
    return builder;
  };
  return { supabase: { from: table => makeBuilder(table) }, __calls: calls };
});

import { AUDIT_FETCH_LIMIT, COLLECTIONS, diffStores, fetchAll } from '../src/store/sync.js';
import { __calls as fetchCalls } from '../src/lib/supabase.js';

const audit = COLLECTIONS.find(c => c.name === 'audit');

// A row exactly as PostgREST returns it from audit_log.
const serverRow = over => ({
  id: 'a1', entity_type: 'transaction', entity_id: 't1', action: 'delete',
  summary: 'Deleted adjustment of 3200', before: { amount: 3200 }, after: null,
  at: '2026-08-07T02:29', ...(over || {}),
});
// A row exactly as makeAudit builds it locally.
const localRow = over => ({
  id: 'a1', at: '2026-08-07T02:29', entityType: 'transaction', entityId: 't1',
  action: 'delete', summary: 'Deleted adjustment of 3200',
  before: { amount: 3200 }, after: null, ...(over || {}),
});

const store = auditRows => ({
  institutions: [], cardProducts: [], categories: [], accounts: [], cards: [],
  snapshots: [], transactions: [], budgets: [], recurring: [], audit: auditRows,
});

describe('audit is fetched now, not blanked', () => {
  it('no longer skips the fetch', () => {
    expect(audit.skipFetch).toBeFalsy();
  });

  it('stays append-only, so nothing can delete server rows', () => {
    expect(audit.appendOnly).toBe(true);
  });

  it('bounds the query to the most recent rows, newest first', () => {
    expect(AUDIT_FETCH_LIMIT).toBe(300);
    // fetchQuery is handed a PostgREST builder; record what it asks for.
    const calls = [];
    const fake = {
      order: (col, opts) => { calls.push(['order', col, opts]); return fake; },
      limit: n => { calls.push(['limit', n]); return fake; },
    };
    audit.fetchQuery(fake);
    expect(calls).toEqual([
      ['order', 'at', { ascending: false }],
      ['limit', 300],
    ]);
  });
});

describe('fromRow mirrors toRow', () => {
  it('maps a server row to the shape makeAudit produces', () => {
    expect(audit.fromRow(serverRow())).toEqual(localRow());
  });

  it('round-trips: local -> server -> local is unchanged', () => {
    expect(audit.fromRow(audit.toRow(localRow()))).toEqual(localRow());
  });

  it('normalises a missing summary to an empty string, not undefined', () => {
    expect(audit.fromRow(serverRow({ summary: null })).summary).toBe('');
  });

  it('keeps before/after null rather than dropping the keys', () => {
    const r = audit.fromRow(serverRow({ before: null, after: null }));
    expect(r.before).toBe(null);
    expect(r.after).toBe(null);
  });
});

describe('fetched rows are already in the sync baseline', () => {
  // The property the whole feature rests on: diffStores counts a row absent
  // from the baseline as an add. StoreProvider fetches, then passes that same
  // store as initialBaseline — so history must never be re-pushed.
  it('diffing a hydrated store against itself writes nothing', () => {
    const hydrated = store([localRow({ id: 'a1' }), localRow({ id: 'a2' })]);
    expect(diffStores(hydrated, hydrated)).toEqual([]);
  });

  it('pushes only rows created after hydrate', () => {
    const baseline = store([localRow({ id: 'a1' })]);
    const later = store([localRow({ id: 'a2' }), localRow({ id: 'a1' })]);
    const diff = diffStores(baseline, later);
    const auditDiff = diff.find(d => d.collection.name === 'audit');
    expect(auditDiff.added.map(r => r.id)).toEqual(['a2']);
    expect(auditDiff.deletes).toEqual([]);
  });

  it('never deletes, even when local audit is shorter than the baseline', () => {
    const baseline = store([localRow({ id: 'a1' }), localRow({ id: 'a2' })]);
    const shorter = store([localRow({ id: 'a1' })]);
    const diff = diffStores(baseline, shorter);
    expect(diff.find(d => d.collection.name === 'audit')).toBeUndefined();
  });
});

describe('fetchAll actually applies fetchQuery, not just the hook that defines it', () => {
  // A prior version of this suite only unit-tested audit.fetchQuery in
  // isolation, handing it a fake builder directly. That proved the hook does
  // the right thing if called — it never proved fetchAll calls it. Reverting
  // fetchAll to `fetched.map(c => supabase.from(c.table).select('*'))` (no
  // fetchQuery applied at all) would leave every one of those tests green
  // while every user fetched their whole unbounded audit history, unordered,
  // on every login. This test goes through fetchAll itself against a mocked
  // client and checks the bound is scoped to audit_log specifically.
  it('orders and limits the audit_log query but leaves other tables alone', async () => {
    fetchCalls.length = 0;
    await fetchAll('p1');

    const auditCalls = fetchCalls.filter(c => c[0] === 'audit_log');
    expect(auditCalls).toEqual([
      ['audit_log', 'order', 'at', { ascending: false }],
      ['audit_log', 'limit', AUDIT_FETCH_LIMIT],
    ]);

    const txCalls = fetchCalls.filter(c => c[0] === 'transactions');
    expect(txCalls).toEqual([]);

    // No table other than audit_log saw an order/limit call at all.
    const boundedTables = new Set(
      fetchCalls.filter(c => c[1] === 'order' || c[1] === 'limit').map(c => c[0])
    );
    expect([...boundedTables]).toEqual(['audit_log']);
  });
});
