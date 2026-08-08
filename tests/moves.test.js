import { describe, it, expect } from 'vitest';
import { recentMoves } from '../src/lib/moves.js';

const NOW = '2026-08-09T12:00:00.000Z';
const S = {
  categories: [
    { id: 'groc', name: 'Groceries', type: 'expense', status: 'active' },
    { id: 'fuel', name: 'Fuel', type: 'expense', status: 'active' },
  ],
  audit: [
    { id: '1', entityType: 'assignment', action: 'move', entityId: 'groc>fuel|2026-08', after: { from: 'groc', to: 'fuel', amount: 2700, month: '2026-08' }, at: '2026-08-09T09:00:00.000Z' },
    { id: '2', entityType: 'assignment', action: 'update', entityId: 'groc|2026-08', after: { amount: 5000 }, at: '2026-08-08T09:00:00.000Z' },
    { id: '3', entityType: 'assignment', action: 'move', entityId: 'rta>groc|2026-08', after: { from: 'rta', to: 'groc', amount: 100, month: '2026-08' }, at: '2026-08-06T09:00:00.000Z' },
    { id: '4', entityType: 'assignment', action: 'delete', entityId: 'fuel|2026-08', after: { amount: 0 }, at: '2026-08-06T08:00:00.000Z' },
    { id: '5', entityType: 'assignment', action: 'move', entityId: 'gone>groc|2026-08', after: { from: 'gone', to: 'groc', amount: 42, month: '2026-08' }, at: '2026-08-06T07:00:00.000Z' },
    { id: '6', entityType: 'transaction', action: 'create', entityId: 't1', at: '2026-08-09T10:00:00.000Z' },
    { id: '7', entityType: 'assignment', action: 'update', entityId: 'groc|2026-07', after: { amount: 10 }, at: '2026-06-01T09:00:00.000Z' },
  ],
};

describe('recentMoves', () => {
  it('groups by day, newest first, with relative labels', () => {
    const g = recentMoves(S, { now: NOW });
    expect(g.map(x => x.relLabel)).toEqual(['Today', 'Yesterday', '3 days ago']);
    expect(g[0].dateLabel).toBe('09 Aug 2026');
    expect(g[0].rows.map(r => r.id)).toEqual(['1']);
  });
  it('ignores non-assignment audit rows', () => {
    const ids = recentMoves(S, { now: NOW }).flatMap(g => g.rows.map(r => r.id));
    expect(ids).not.toContain('6');
  });
  it('drops rows older than the window', () => {
    const ids = recentMoves(S, { now: NOW, days: 34 }).flatMap(g => g.rows.map(r => r.id));
    expect(ids).not.toContain('7');
  });
  it('resolves rta and deleted categories to display names', () => {
    const rows = recentMoves(S, { now: NOW }).flatMap(g => g.rows);
    const rta = rows.find(r => r.id === '3');
    expect(rta).toMatchObject({ verb: 'moved', from: 'Ready to Assign', to: 'Groceries', amount: 100 });
    expect(rows.find(r => r.id === '5').from).toBe('(deleted category)');
  });
  it('reads set rows: month and category come from entityId, verb from action', () => {
    const rows = recentMoves(S, { now: NOW }).flatMap(g => g.rows);
    expect(rows.find(r => r.id === '2')).toMatchObject({ verb: 'assigned', to: 'Groceries', amount: 5000, month: '2026-08' });
    expect(rows.find(r => r.id === '4')).toMatchObject({ verb: 'removed', to: 'Fuel' });
  });
  it('filters by kind', () => {
    const moved = recentMoves(S, { now: NOW, kind: 'moved' }).flatMap(g => g.rows.map(r => r.id));
    expect(moved).toEqual(['1', '3', '5']);
    const assigned = recentMoves(S, { now: NOW, kind: 'assigned' }).flatMap(g => g.rows.map(r => r.id));
    expect(assigned).toEqual(['2', '4']);
  });
  it('handles an empty/absent audit log', () => {
    expect(recentMoves({ categories: [], audit: [] }, { now: NOW })).toEqual([]);
    expect(recentMoves({ categories: [] }, { now: NOW })).toEqual([]);
  });
});
