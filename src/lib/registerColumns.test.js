import { describe, expect, it } from 'vitest';
import { ACCOUNT_MIN_WIDTH, BALANCE_MIN_WIDTH, MEMO_MIN_WIDTH, visibleColumns } from './registerColumns.js';

const COLUMNS = [
  { key: 'account' }, { key: 'date' }, { key: 'details' }, { key: 'category' },
  { key: 'notes' }, { key: 'outflow' }, { key: 'inflow' }, { key: 'status' },
];
const keys = (containerWidth, accountScoped) => visibleColumns(COLUMNS, containerWidth, accountScoped).map(c => c.key);

describe('visibleColumns', () => {
  it('shows every column when unmeasured (null width) and unscoped', () => {
    expect(keys(null, false)).toEqual(['account', 'date', 'details', 'category', 'notes', 'outflow', 'inflow', 'status']);
  });
  it('shows every column at a wide container width', () => {
    expect(keys(1400, false)).toContain('account');
    expect(keys(1400, false)).toContain('notes');
  });
  it('drops MEMO just under its threshold, keeps it just at/above', () => {
    expect(keys(MEMO_MIN_WIDTH - 1, false)).not.toContain('notes');
    expect(keys(MEMO_MIN_WIDTH, false)).toContain('notes');
  });
  it('drops ACCOUNT just under its threshold, keeps it just at/above', () => {
    expect(keys(ACCOUNT_MIN_WIDTH - 1, false)).not.toContain('account');
    expect(keys(ACCOUNT_MIN_WIDTH, false)).toContain('account');
  });
  it('drops both MEMO and ACCOUNT once narrow enough', () => {
    const ks = keys(800, false);
    expect(ks).not.toContain('notes');
    expect(ks).not.toContain('account');
    expect(ks).toEqual(['date', 'details', 'category', 'outflow', 'inflow', 'status']);
  });
  it('account-scoped register hides ACCOUNT regardless of width', () => {
    expect(keys(1400, true)).not.toContain('account');
    expect(keys(null, true)).not.toContain('account');
  });
  it('never drops the non-foldable columns (date, details, category, outflow, inflow, status)', () => {
    const ks = keys(1, true);
    expect(ks).toEqual(['date', 'details', 'category', 'outflow', 'inflow', 'status']);
  });
});

// BALANCE is opt-in twice over: the caller must vouch that a running balance
// is TRUE here (account-scoped, date sort, month-aligned range, unfiltered),
// and the container must be wide enough to read three money columns.
// Mirrors the real COLUMNS order (Transactions.jsx): BALANCE closes the money
// run, and the narrow STATUS badge stays the trailing column it has always been.
const WITH_BAL = [
  { key: 'account' }, { key: 'date' }, { key: 'details' }, { key: 'category' },
  { key: 'notes' }, { key: 'outflow' }, { key: 'inflow' }, { key: 'balance' }, { key: 'status' },
];
const balKeys = (w, scoped, eligible) => visibleColumns(WITH_BAL, w, scoped, eligible).map(c => c.key);

describe('visibleColumns — BALANCE', () => {
  it('shows on a wide, account-scoped, eligible register', () => {
    expect(balKeys(1400, true, true)).toContain('balance');
  });
  it('hides when the caller says it would not be a true number', () => {
    expect(balKeys(1400, true, false)).not.toContain('balance');
    expect(balKeys(1400, true, undefined)).not.toContain('balance');
  });
  it('hides on the all-accounts register even when eligible and wide', () => {
    expect(balKeys(1400, false, true)).not.toContain('balance');
  });
  it('drops just under its threshold, keeps it just at/above', () => {
    expect(balKeys(BALANCE_MIN_WIDTH - 1, true, true)).not.toContain('balance');
    expect(balKeys(BALANCE_MIN_WIDTH, true, true)).toContain('balance');
  });
  it('folds before MEMO does — it is the widest column to earn its place', () => {
    expect(BALANCE_MIN_WIDTH).toBeGreaterThan(MEMO_MIN_WIDTH);
  });
  it('shows on an unmeasured container (first paint) rather than flashing in', () => {
    expect(balKeys(null, true, true)).toContain('balance');
  });
  it('sits between INFLOW and STATUS wherever it survives', () => {
    expect(balKeys(1400, true, true)).toEqual(['date', 'details', 'category', 'notes', 'outflow', 'inflow', 'balance', 'status']);
  });
});
