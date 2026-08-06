import { describe, it, expect } from 'vitest';
import { MOVE_FILTERS, filterMoves, groupMovesByDay, moveCount } from '../src/lib/moves.js';

const NOW = '2026-08-07T10:00';
const row = (id, over) => ({
  id, at: '2026-08-07T09:00', entityType: 'transaction', entityId: 'x',
  action: 'create', summary: 'Recorded expense', before: null, after: null, ...(over || {}),
});

describe('MOVE_FILTERS', () => {
  it('offers exactly All, Money, Plans and Setup', () => {
    expect(MOVE_FILTERS.map(f => f.id)).toEqual(['all', 'money', 'plans', 'setup']);
    expect(MOVE_FILTERS.map(f => f.label)).toEqual(['All', 'Money', 'Plans', 'Setup']);
  });
});

describe('filterMoves', () => {
  it('always drops undo and redo — they are navigation, not change', () => {
    const rows = [
      row('a'),
      row('u', { action: 'undo', entityType: 'app' }),
      row('r', { action: 'redo', entityType: 'app' }),
    ];
    expect(filterMoves(rows, 'all').map(r => r.id)).toEqual(['a']);
  });

  it('Money is transactions', () => {
    const rows = [row('t', { entityType: 'transaction' }), row('b', { entityType: 'budget' })];
    expect(filterMoves(rows, 'money').map(r => r.id)).toEqual(['t']);
  });

  it('Plans is recurring rules and budgets', () => {
    const rows = [
      row('r', { entityType: 'recurring' }), row('b', { entityType: 'budget' }),
      row('t', { entityType: 'transaction' }),
    ];
    expect(filterMoves(rows, 'plans').map(r => r.id).sort()).toEqual(['b', 'r']);
  });

  it('Setup is accounts, categories and cards', () => {
    const rows = [
      row('a', { entityType: 'account' }), row('c', { entityType: 'category' }),
      row('k', { entityType: 'card' }), row('t', { entityType: 'transaction' }),
    ];
    expect(filterMoves(rows, 'setup').map(r => r.id).sort()).toEqual(['a', 'c', 'k']);
  });

  it('shows an unrecognised entity type under All only, never a named chip', () => {
    const rows = [row('x', { entityType: 'investment' })];
    expect(filterMoves(rows, 'all').map(r => r.id)).toEqual(['x']);
    for (const f of ['money', 'plans', 'setup']) {
      expect(filterMoves(rows, f)).toEqual([]);
    }
  });

  it('falls back to All for an unknown filter id', () => {
    expect(filterMoves([row('a')], 'nonsense').map(r => r.id)).toEqual(['a']);
  });

  it('returns newest first regardless of input order', () => {
    const rows = [
      row('old', { at: '2026-08-01T09:00' }),
      row('new', { at: '2026-08-07T09:00' }),
      row('mid', { at: '2026-08-04T09:00' }),
    ];
    expect(filterMoves(rows, 'all').map(r => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('tolerates a missing audit array', () => {
    expect(filterMoves(undefined, 'all')).toEqual([]);
    expect(filterMoves(null, 'all')).toEqual([]);
  });

  it('leaves the array it was given untouched — the caller passes live store state', () => {
    const rows = [
      row('old', { at: '2026-08-01T09:00' }),
      row('new', { at: '2026-08-07T09:00' }),
    ];
    const before = rows.map(r => r.id);
    filterMoves(rows, 'all');
    expect(rows.map(r => r.id)).toEqual(before);
  });
});

describe('moveCount', () => {
  it('counts what the filter would show', () => {
    const rows = [
      row('t', { entityType: 'transaction' }),
      row('b', { entityType: 'budget' }),
      row('u', { action: 'undo', entityType: 'app' }),
    ];
    expect(moveCount(rows, 'all')).toBe(2);
    expect(moveCount(rows, 'money')).toBe(1);
    expect(moveCount(rows, 'setup')).toBe(0);
  });
});

describe('groupMovesByDay', () => {
  it('groups by calendar day, newest day first', () => {
    const rows = [
      row('a', { at: '2026-08-07T09:00' }),
      row('b', { at: '2026-08-06T09:00' }),
      row('c', { at: '2026-08-07T08:00' }),
    ];
    const g = groupMovesByDay(rows, NOW);
    expect(g.map(x => x.day)).toEqual(['2026-08-07', '2026-08-06']);
    expect(g[0].rows.map(r => r.id)).toEqual(['a', 'c']);
  });

  it('labels today, yesterday and further back', () => {
    const rows = [
      row('a', { at: '2026-08-07T09:00' }),
      row('b', { at: '2026-08-06T09:00' }),
      row('c', { at: '2026-08-04T09:00' }),
    ];
    expect(groupMovesByDay(rows, NOW).map(x => x.relLabel))
      .toEqual(['Today', 'Yesterday', '3 days ago']);
  });

  it('crosses a month boundary correctly', () => {
    const rows = [row('a', { at: '2026-07-31T09:00' })];
    expect(groupMovesByDay(rows, '2026-08-01T10:00')[0].relLabel).toBe('Yesterday');
  });

  it('gives each day an absolute label too', () => {
    expect(groupMovesByDay([row('a', { at: '2026-08-07T09:00' })], NOW)[0].dayLabel)
      .toBe('7 Aug 2026');
  });

  it('orders rows newest first inside a day', () => {
    const rows = [
      row('early', { at: '2026-08-07T02:02' }),
      row('late', { at: '2026-08-07T17:30' }),
    ];
    expect(groupMovesByDay(rows, NOW)[0].rows.map(r => r.id)).toEqual(['late', 'early']);
  });

  it('skips a row with a missing or malformed timestamp rather than heading it Invalid Date', () => {
    const rows = [row('good'), row('bad', { at: null }), row('worse', { at: 'nonsense' })];
    const g = groupMovesByDay(rows, NOW);
    expect(g).toHaveLength(1);
    expect(g[0].rows.map(r => r.id)).toEqual(['good']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupMovesByDay([], NOW)).toEqual([]);
  });
});
