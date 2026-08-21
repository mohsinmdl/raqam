// Row-owned Tab order for the inline editor (strict column-to-column).
// tabCells derives which cells participate from the same inputs the row
// renders from (hidden columns + editableCells); tabTarget walks it.
import { describe, it, expect } from 'vitest';
import { tabCells, tabTarget, editableCells } from '../src/lib/txEditorState.js';

const ALL = ['account', 'date', 'payee', 'category', 'memo', 'outflow', 'inflow', 'cleared'];

describe('tabCells', () => {
  it('lists every column for a plain expense row', () => {
    const can = editableCells({ type: 'expense' });
    expect(tabCells({ hideAccount: false, hideMemo: false, can })).toEqual(ALL);
  });
  it('drops hidden columns (scoped register hides account, narrow hides memo)', () => {
    const can = editableCells({ type: 'expense' });
    expect(tabCells({ hideAccount: true, hideMemo: true, can }))
      .toEqual(['date', 'payee', 'category', 'outflow', 'inflow', 'cleared']);
  });
  it('drops non-editable cells: a transfer has no category', () => {
    const can = editableCells({ type: 'transfer' });
    expect(tabCells({ hideAccount: false, hideMemo: false, can }))
      .toEqual(['account', 'date', 'payee', 'memo', 'outflow', 'inflow', 'cleared']);
  });
  it('drops non-editable cells: an adjustment fixes account/payee/category', () => {
    const can = editableCells({ type: 'adjustment' });
    expect(tabCells({ hideAccount: false, hideMemo: false, can }))
      .toEqual(['date', 'memo', 'outflow', 'inflow', 'cleared']);
  });
});

describe('tabTarget', () => {
  const cells = ['date', 'payee', 'category', 'outflow'];
  it('steps forward to the next cell', () => {
    expect(tabTarget(cells, 'date', false)).toBe('payee');
    expect(tabTarget(cells, 'category', false)).toBe('outflow');
  });
  it('steps backward on Shift+Tab', () => {
    expect(tabTarget(cells, 'payee', true)).toBe('date');
  });
  it('returns null off either end — the row hands Tab back to the browser', () => {
    expect(tabTarget(cells, 'outflow', false)).toBeNull();
    expect(tabTarget(cells, 'date', true)).toBeNull();
  });
  it('returns null for an unknown cell (focus was outside the walked set)', () => {
    expect(tabTarget(cells, 'cleared', false)).toBeNull();
  });
});
