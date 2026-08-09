import { describe, it, expect } from 'vitest';
import {
  normalizeBuiltins, reorderBuiltins, toggleBuiltinHidden,
  orderedBuiltinViews, builtinRows, isHiddenBuiltin, TOGGLEABLE_BUILTINS,
} from '../src/lib/planViews.js';

const CANON = ['overspent', 'underfunded', 'overfunded', 'available'];

describe('built-in view show/hide + reorder pref', () => {
  it('TOGGLEABLE_BUILTINS excludes All', () => {
    expect(TOGGLEABLE_BUILTINS.map(v => v.id)).toEqual(CANON);
  });

  it('normalizeBuiltins repairs junk to the four ids, all visible, canonical order', () => {
    expect(normalizeBuiltins(undefined).map(v => v.id)).toEqual(CANON);
    expect(normalizeBuiltins(undefined).every(v => v.hidden === false)).toBe(true);
    expect(normalizeBuiltins('nope').map(v => v.id)).toEqual(CANON);
  });

  it('drops unknown/duplicate ids and appends any missing in canonical order', () => {
    const raw = [{ id: 'bogus' }, { id: 'available', hidden: true }, { id: 'available' }, { id: 'overspent' }];
    const out = normalizeBuiltins(raw);
    expect(out.map(v => v.id)).toEqual(['available', 'overspent', 'underfunded', 'overfunded']);
    expect(out.find(v => v.id === 'available').hidden).toBe(true);
    expect(out.filter(v => v.id === 'available')).toHaveLength(1);
  });

  it('coerces hidden to a boolean', () => {
    const out = normalizeBuiltins([{ id: 'overspent', hidden: 1 }]);
    expect(out.find(v => v.id === 'overspent').hidden).toBe(true);
  });

  it('toggleBuiltinHidden flips exactly one id', () => {
    const p0 = normalizeBuiltins(undefined);
    const p1 = toggleBuiltinHidden(p0, 'underfunded');
    expect(p1.find(v => v.id === 'underfunded').hidden).toBe(true);
    expect(p1.filter(v => v.hidden)).toHaveLength(1);
    expect(toggleBuiltinHidden(p1, 'underfunded').find(v => v.id === 'underfunded').hidden).toBe(false);
  });

  it('reorderBuiltins moves an id to the target position; no-ops on same id', () => {
    const p0 = normalizeBuiltins(undefined); // overspent, underfunded, overfunded, available
    const p1 = reorderBuiltins(p0, 'available', 'overspent');
    expect(p1.map(v => v.id)).toEqual(['available', 'overspent', 'underfunded', 'overfunded']);
    expect(reorderBuiltins(p0, 'overspent', 'overspent')).toBe(p0);
  });

  it('orderedBuiltinViews pins All first and drops hidden ones, preserving order', () => {
    const pref = reorderBuiltins(toggleBuiltinHidden(normalizeBuiltins(undefined), 'underfunded'), 'available', 'overspent');
    const ids = orderedBuiltinViews(pref).map(v => v.id);
    expect(ids[0]).toBe('all');
    expect(ids).toEqual(['all', 'available', 'overspent', 'overfunded']); // underfunded hidden
  });

  it('builtinRows lists all four (including hidden) with labels', () => {
    const rows = builtinRows(toggleBuiltinHidden(normalizeBuiltins(undefined), 'overfunded'));
    expect(rows.map(r => r.id)).toEqual(CANON);
    expect(rows.find(r => r.id === 'overfunded')).toMatchObject({ hidden: true, label: 'Overfunded' });
    expect(rows.find(r => r.id === 'overspent').label).toBe('Overspent');
  });

  it('isHiddenBuiltin is true only for a hidden built-in id', () => {
    const pref = toggleBuiltinHidden(normalizeBuiltins(undefined), 'overspent');
    expect(isHiddenBuiltin(pref, 'overspent')).toBe(true);
    expect(isHiddenBuiltin(pref, 'available')).toBe(false);
    expect(isHiddenBuiltin(pref, 'all')).toBe(false);
    expect(isHiddenBuiltin(pref, 'v_custom123')).toBe(false);
  });
});
