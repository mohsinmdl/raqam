import { describe, it, expect } from 'vitest';
import { accountUsageCounts, byUsage } from '../src/lib/accountUsage.js';

const tx = over => ({ id: 'x', date: '2026-08-01T12:00', status: 'cleared', type: 'expense', amount: 100, ...over });

describe('accountUsageCounts', () => {
  it('counts a bank expense against its accountId', () => {
    const counts = accountUsageCounts([tx({ accountId: 'a1' })]);
    expect(counts.get('acc:a1')).toBe(1);
  });
  it('counts a card expense against its cardId, not accountId', () => {
    const counts = accountUsageCounts([tx({ cardId: 'c1' })]);
    expect(counts.get('card:c1')).toBe(1);
    expect(counts.has('acc:c1')).toBe(false);
  });
  it('counts a transfer against BOTH source and destination', () => {
    const counts = accountUsageCounts([tx({ type: 'transfer', accountId: 'a1', toAccountId: 'a2' })]);
    expect(counts.get('acc:a1')).toBe(1);
    expect(counts.get('acc:a2')).toBe(1);
  });
  it('counts a card-payment transfer (bank → card) against both sides', () => {
    const counts = accountUsageCounts([tx({ type: 'transfer', accountId: 'a1', toCardId: 'c1' })]);
    expect(counts.get('acc:a1')).toBe(1);
    expect(counts.get('card:c1')).toBe(1);
  });
  it('accumulates across many transactions', () => {
    const counts = accountUsageCounts([
      tx({ accountId: 'a1' }), tx({ accountId: 'a1' }), tx({ accountId: 'a2' }),
    ]);
    expect(counts.get('acc:a1')).toBe(2);
    expect(counts.get('acc:a2')).toBe(1);
  });
  it('returns an empty map for no transactions', () => {
    expect(accountUsageCounts([]).size).toBe(0);
    expect(accountUsageCounts(undefined).size).toBe(0);
  });
});

describe('byUsage', () => {
  const opts = [{ id: 'acc:a1' }, { id: 'acc:a2' }, { id: 'acc:a3' }];

  it('sorts most-used first', () => {
    const counts = new Map([['acc:a1', 1], ['acc:a2', 5], ['acc:a3', 3]]);
    expect(byUsage(opts, counts).map(o => o.id)).toEqual(['acc:a2', 'acc:a3', 'acc:a1']);
  });
  it('keeps equally-used (including never-used) options in their original order', () => {
    const counts = new Map([['acc:a2', 4]]);
    expect(byUsage(opts, counts).map(o => o.id)).toEqual(['acc:a2', 'acc:a1', 'acc:a3']);
  });
  it('does not mutate the input array', () => {
    const original = [...opts];
    byUsage(opts, new Map([['acc:a3', 9]]));
    expect(opts).toEqual(original);
  });
});
