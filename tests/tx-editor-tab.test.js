// Row-owned Tab order for the inline editor (strict column-to-column).
// tabCells derives which cells participate from the same inputs the row
// renders from (hidden columns + editableCells); tabTarget walks it.
import { readFileSync } from 'node:fs';
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
  it('treats a missing `can` key as editable — only an explicit false drops a cell', () => {
    // The filter is `can[k] !== false` on purpose: editableCells always spells
    // out every key today, but a future caller omitting one must not silently
    // lose that cell from the walk (a truthy check would).
    expect(tabCells({ hideAccount: false, hideMemo: false, can: {} })).toEqual(ALL);
  });
});

// Drift guard (source-scan, same style as no-inline-components.test.js): the
// walk is only as good as the row's wiring — every walkable cell must have an
// onTab(<key>) handler on its td and an entry in cellRefs, or tabTarget can
// name a destination focus() can't reach (the class of bug where a cell's
// input silently drops out of the keyboard path).
describe('TxEditorRow wiring matches the walk', () => {
  const src = readFileSync(new URL('../src/ui/tx/inline/TxEditorRow.jsx', import.meta.url), 'utf8');
  it('every walkable cell has an onTab handler and a cellRefs entry', () => {
    for (const k of ALL) {
      expect(src, `missing onTab('${k}')`).toContain(`onTab('${k}')`);
      expect(src, `missing cellRefs.${k}`).toContain(`${k}: useRef(null)`);
    }
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
