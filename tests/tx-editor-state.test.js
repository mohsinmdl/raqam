import { describe, it, expect } from 'vitest';
import { cellsFromForm, editorPatch, sourceRef, editableCells, firstEmptyCell, keepForNext } from '../src/lib/txEditorState.js';
import { txDefaults, formFromTx } from '../src/drawers/openers.js';

const base = (over = {}) => ({ ...txDefaults('expense'), ...over });

describe('sourceRef', () => {
  it('reads the field the current type stores its source in', () => {
    expect(sourceRef(base({ type: 'expense', payWith: 'acc:a1' }))).toBe('acc:a1');
    expect(sourceRef(base({ type: 'income', account: 'acc:a1' }))).toBe('acc:a1');
    expect(sourceRef(base({ type: 'transfer', from: 'acc:a1' }))).toBe('acc:a1');
    expect(sourceRef(base({ type: 'adjustment', account: 'acc:a1' }))).toBe('acc:a1');
  });
});

describe('editorPatch: amounts drive the type (spec §3)', () => {
  it('outflow → expense, source lands in payWith, inflow cleared', () => {
    const f = base({ type: 'income', account: 'acc:a1', amount: '700' });
    expect(editorPatch(f, 'outflow', '1,024')).toEqual(
      { type: 'expense', amount: '1,024', payWith: 'acc:a1', account: '' });
  });
  it('inflow with no category → income (bank source moves to account)', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', category: '' });
    expect(editorPatch(f, 'inflow', '500')).toEqual(
      { type: 'income', amount: '500', account: 'acc:a1', payWith: '' });
  });
  it('inflow with a category → refund (source stays in payWith)', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', category: 'c9' });
    expect(editorPatch(f, 'inflow', '500')).toEqual(
      { type: 'refund', amount: '500', payWith: 'acc:a1', account: '' });
  });
  it('inflow onto a CARD source → refund regardless of category (income cannot land on a card)', () => {
    const f = base({ type: 'expense', payWith: 'card:k1', category: '' });
    expect(editorPatch(f, 'inflow', '500').type).toBe('refund');
  });
  it('outflow/inflow on a transfer only swaps direction, never the type', () => {
    const f = base({ type: 'transfer', from: 'acc:a1', to: 'acc:a2' });
    expect(editorPatch(f, 'inflow', '900')).toEqual(
      { amount: '900', from: 'acc:a2', to: 'acc:a1' });
    expect(editorPatch(f, 'outflow', '900')).toEqual({ amount: '900' });
  });
  it('outflow/inflow on an adjustment maps to direction, type untouched', () => {
    const f = base({ type: 'adjustment', account: 'acc:a1' });
    expect(editorPatch(f, 'outflow', '45')).toEqual({ amount: '45', direction: 'decrease' });
    expect(editorPatch(f, 'inflow', '45')).toEqual({ amount: '45', direction: 'increase' });
  });
});

describe('editorPatch: payee and transfer', () => {
  it('picking a To/From payee flips to transfer and clears category/merchant', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', merchant: 'Subway', category: 'c9' });
    expect(editorPatch(f, 'transfer', 'acc:a2')).toEqual({
      type: 'transfer', from: 'acc:a1', to: 'acc:a2',
      merchant: '', category: '', splitOn: false, splits: undefined, repeat: 'never',
    });
  });
  it('typing a plain payee on a transfer converts back to expense', () => {
    const f = base({ type: 'transfer', from: 'acc:a1', to: 'acc:a2', amount: '900' });
    expect(editorPatch(f, 'payee', 'Subway')).toEqual(
      { merchant: 'Subway', type: 'expense', payWith: 'acc:a1', from: '', to: '' });
  });
  it('typing a payee on a non-transfer just sets merchant', () => {
    expect(editorPatch(base({ payWith: 'acc:a1' }), 'payee', 'Subway')).toEqual({ merchant: 'Subway' });
  });
});

describe('editorPatch: category re-infers income vs refund while inflowing', () => {
  it('picking a category on an income flips to refund', () => {
    const f = base({ type: 'income', account: 'acc:a1', amount: '500' });
    expect(editorPatch(f, 'category', 'c9')).toEqual(
      { category: 'c9', type: 'refund', payWith: 'acc:a1', account: '' });
  });
  it('clearing the category on a refund flips to income', () => {
    const f = base({ type: 'refund', payWith: 'acc:a1', category: 'c9', amount: '500' });
    expect(editorPatch(f, 'category', '')).toEqual(
      { category: '', type: 'income', account: 'acc:a1', payWith: '' });
  });
  it('on an expense it is a plain category set', () => {
    expect(editorPatch(base({ payWith: 'acc:a1' }), 'category', 'c9')).toEqual({ category: 'c9' });
  });
});

describe('editorPatch: the simple cells', () => {
  it('account writes into the field the type uses', () => {
    expect(editorPatch(base({ type: 'expense' }), 'account', 'acc:a1')).toEqual({ payWith: 'acc:a1' });
    expect(editorPatch(base({ type: 'transfer', to: 'acc:a2' }), 'account', 'acc:a1')).toEqual({ from: 'acc:a1' });
    expect(editorPatch(base({ type: 'income' }), 'account', 'acc:a1')).toEqual({ account: 'acc:a1' });
  });
  it('date / memo / cleared / repeat are direct', () => {
    expect(editorPatch(base(), 'date', '2026-08-17')).toEqual({ date: '2026-08-17' });
    expect(editorPatch(base(), 'memo', 'hi')).toEqual({ notes: 'hi' });
    expect(editorPatch(base(), 'cleared', false)).toEqual({ pending: true });
    expect(editorPatch(base(), 'repeat', 'monthly')).toEqual({ repeat: 'monthly' });
  });
});

describe('cellsFromForm round-trips formFromTx output', () => {
  it('expense', () => {
    const f = formFromTx({ id: 't1', type: 'expense', amount: 1024, date: '2026-08-17T12:00', status: 'cleared', merchant: 'Subway', category: 'c9', accountId: 'a1' });
    const c = cellsFromForm(f);
    expect(c).toMatchObject({ account: 'acc:a1', date: '2026-08-17', payee: 'Subway', category: 'c9', outflow: '1,024', inflow: '', cleared: true, transferTo: '' });
  });
  it('transfer puts the amount on the outflow side and fills transferTo', () => {
    const f = formFromTx({ id: 't2', type: 'transfer', amount: 900, date: '2026-08-17T12:00', status: 'pending', merchant: '', accountId: 'a1', toAccountId: 'a2' });
    expect(cellsFromForm(f)).toMatchObject({ account: 'acc:a1', transferTo: 'acc:a2', outflow: '900', inflow: '', cleared: false });
  });
  it('inflow-direction transfer: from/to swap in the data (correct), but the cells re-normalize to the outflow side — display still anchors on the source account (a recorded controller ruling; re-anchoring the display to the inflow side is a deferred follow-up, not a bug)', () => {
    const f = { type: 'transfer', from: 'acc:a1', to: 'acc:a2' };
    const patch = editorPatch(f, 'inflow', '900');
    const merged = { ...f, ...patch };
    expect(cellsFromForm(merged)).toMatchObject({ account: 'acc:a2', transferTo: 'acc:a1', outflow: '900', inflow: '' });
  });
  it('income lands on inflow', () => {
    const f = formFromTx({ id: 't3', type: 'income', amount: 700, date: '2026-08-17T12:00', status: 'cleared', merchant: 'Payer', accountId: 'a1' });
    expect(cellsFromForm(f)).toMatchObject({ inflow: '700', outflow: '' });
  });
  it('adjustment: sign decides the side', () => {
    const f = formFromTx({ id: 't4', type: 'adjustment', amount: -45, date: '2026-08-17T12:00', status: 'cleared', adjustmentReason: 'fix', accountId: 'a1' });
    expect(cellsFromForm(f)).toMatchObject({ outflow: '45', inflow: '' });
  });
});

describe('editableCells', () => {
  it('adjustments only expose date/memo/amounts/cleared', () => {
    const e = editableCells(base({ type: 'adjustment' }));
    expect(e).toEqual({ account: false, date: true, payee: false, category: false, memo: true, outflow: true, inflow: true, cleared: true });
  });
  it('transfers disable category, everything else on', () => {
    const e = editableCells(base({ type: 'transfer' }));
    expect(e.category).toBe(false);
    expect(e.payee).toBe(true);
  });
});

describe('firstEmptyCell / keepForNext', () => {
  it('focuses the first empty cell in column order', () => {
    expect(firstEmptyCell({ account: '', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, false)).toBe('account');
    expect(firstEmptyCell({ account: 'acc:a1', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, false)).toBe('payee');
    expect(firstEmptyCell({ account: '', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, true)).toBe('payee');
    expect(firstEmptyCell({ account: 'acc:a1', date: '2026-08-20', payee: 'x', category: 'c9', memo: 'm', outflow: '5', inflow: '' }, false)).toBe('payee');
  });
  it('keepForNext keeps source + date, drops the rest', () => {
    const f = base({ payWith: 'acc:a1', date: '2026-08-17', merchant: 'Subway', amount: '5', notes: 'x' });
    expect(keepForNext(f)).toEqual({ payWith: 'acc:a1', date: '2026-08-17' });
  });
});
