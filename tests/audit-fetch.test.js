import { describe, it, expect } from 'vitest';
import { AUDIT_FETCH_LIMIT, COLLECTIONS, diffStores } from '../src/store/sync.js';

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
