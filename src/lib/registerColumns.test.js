import { describe, expect, it } from 'vitest';
import { ACCOUNT_MIN_WIDTH, MEMO_MIN_WIDTH, visibleColumns } from './registerColumns.js';

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
