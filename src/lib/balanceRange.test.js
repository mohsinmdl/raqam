// Gate for the register's running balance: which viewed ranges can seed an
// honest walk. The rule is "whole months, first month has a snapshot".
import { describe, expect, it } from 'vitest';
import { balanceRange } from './balanceRange.js';

const ACC = 'acc1';
const snaps = [
  { accountId: ACC, month: '2026-07', amount: 1000, status: 'confirmed' },
  { accountId: ACC, month: '2026-08', amount: 900, status: 'pending' },
  { accountId: 'other', month: '2026-06', amount: 5, status: 'confirmed' },
];

describe('balanceRange', () => {
  it('accepts a single month whose snapshot exists', () => {
    expect(balanceRange({ from: '2026-08', to: '2026-08' }, snaps, ACC)).toEqual({ from: '2026-08', to: '2026-08' });
  });
  it('accepts a multi-month range seeded by its FIRST month (later snapshots are irrelevant)', () => {
    expect(balanceRange({ from: '2026-07', to: '2026-09' }, snaps, ACC)).toEqual({ from: '2026-07', to: '2026-09' });
  });
  it('rejects day-precise bounds (Today / Yesterday) — no per-day opening exists', () => {
    expect(balanceRange({ from: '2026-08-05', to: '2026-08-05' }, snaps, ACC)).toBeNull();
    expect(balanceRange({ from: '2026-08-01', to: '2026-08' }, snaps, ACC)).toBeNull();
  });
  it('rejects All Dates (unbounded)', () => {
    expect(balanceRange({ from: null, to: null }, snaps, ACC)).toBeNull();
    expect(balanceRange({ from: '2026-08', to: null }, snaps, ACC)).toBeNull();
    expect(balanceRange({ from: null, to: '2026-08' }, snaps, ACC)).toBeNull();
  });
  it('rejects a range whose first month has no snapshot for this account', () => {
    expect(balanceRange({ from: '2026-06', to: '2026-08' }, snaps, ACC)).toBeNull();
    // 'other' has June, but the gate is per account.
    expect(balanceRange({ from: '2026-06', to: '2026-06' }, snaps, ACC)).toBeNull();
  });
  it('rejects a reversed range', () => {
    expect(balanceRange({ from: '2026-08', to: '2026-07' }, snaps, ACC)).toBeNull();
  });
  it('rejects a missing account', () => {
    expect(balanceRange({ from: '2026-08', to: '2026-08' }, snaps, null)).toBeNull();
    expect(balanceRange({ from: '2026-08', to: '2026-08' }, snaps, undefined)).toBeNull();
  });
  it('tolerates a missing snapshots list and a missing range', () => {
    expect(balanceRange({ from: '2026-08', to: '2026-08' }, undefined, ACC)).toBeNull();
    expect(balanceRange(null, snaps, ACC)).toBeNull();
  });
});
