import { describe, it, expect } from 'vitest';
import { cellsFromForm, editorPatch, sourceRef, editableCells, firstEmptyCell, keepForNext, errorCells, isMeaningfulDraft } from '../src/lib/txEditorState.js';
import { txDefaults, formFromTx } from '../src/drawers/openers.js';

const base = (over = {}) => ({ ...txDefaults('expense'), ...over });
// c9 is EXPENSE-typed, c5 is INCOME-typed — the ctx editorPatch/inflowType
// need to tell a refund-eligible category from one that would fail
// validate.transaction's type check (FIX 1).
const ctx = { catTypeOf: id => ({ c9: 'expense', c5: 'income' }[id] || null) };

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
  it('inflow with an EXPENSE-typed category → refund (source stays in payWith)', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', category: 'c9' });
    expect(editorPatch(f, 'inflow', '500', ctx)).toEqual(
      { type: 'refund', amount: '500', payWith: 'acc:a1', account: '' });
  });
  it('inflow with an INCOME-typed category stays income, category kept (FIX 1: a refund needs an EXPENSE category)', () => {
    const f = base({ type: 'expense', payWith: 'acc:a1', category: 'c5' });
    const patch = editorPatch(f, 'inflow', '500', ctx);
    expect(patch).toEqual({ type: 'income', amount: '500', account: 'acc:a1', payWith: '' });
    expect({ ...f, ...patch }.category).toBe('c5');
  });
  it('inflow onto a CARD source → refund regardless of category (income cannot land on a card)', () => {
    const f = base({ type: 'expense', payWith: 'card:k1', category: '' });
    expect(editorPatch(f, 'inflow', '500', ctx).type).toBe('refund');
  });
  it('outflow/inflow on a transfer never touch from/to — direction never flips from an amount edit, a re-edit must not reverse a transfer', () => {
    const f = base({ type: 'transfer', from: 'acc:a1', to: 'acc:a2' });
    expect(editorPatch(f, 'inflow', '900')).toEqual({ amount: '900' });
    expect(editorPatch(f, 'outflow', '900')).toEqual({ amount: '900' });
  });
  it('clearing outflow/inflow clears the amount only, never retypes the row', () => {
    const income = base({ type: 'income', account: 'acc:a1', amount: '500' });
    expect(editorPatch(income, 'inflow', '')).toEqual({ amount: '' });
    expect(editorPatch(income, 'inflow', '   ')).toEqual({ amount: '' });
    const expense = base({ type: 'expense', payWith: 'acc:a1', amount: '500' });
    expect(editorPatch(expense, 'outflow', '')).toEqual({ amount: '' });
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
  it('picking an EXPENSE-typed category on an income flips to refund', () => {
    const f = base({ type: 'income', account: 'acc:a1', amount: '500' });
    expect(editorPatch(f, 'category', 'c9', ctx)).toEqual(
      { category: 'c9', type: 'refund', payWith: 'acc:a1', account: '' });
  });
  // FIX 1 (data-corruption class): a blind flip to refund on ANY category
  // pick would let an income-typed category — or any category, with no ctx
  // at all — silently retype the row, and validate.transaction requires a
  // refund's category to be EXPENSE-typed, so that save would then fail.
  it('picking an INCOME-typed category on an income stays income', () => {
    const f = base({ type: 'income', account: 'acc:a1', amount: '500' });
    expect(editorPatch(f, 'category', 'c5', ctx)).toEqual({ category: 'c5' });
  });
  it('picking a category on an income with no ctx (or an unknown category) stays income too', () => {
    const f = base({ type: 'income', account: 'acc:a1', amount: '500' });
    expect(editorPatch(f, 'category', 'c9')).toEqual({ category: 'c9' });
    expect(editorPatch(f, 'category', 'unknown', ctx)).toEqual({ category: 'unknown' });
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
  // direction never flips from an amount edit — a re-edit must not reverse a
  // transfer (FIX 2). from/to are untouched, so the cells still anchor on the
  // original source account exactly as they did before the inflow edit.
  it('an inflow edit on a transfer leaves from/to untouched', () => {
    const f = { type: 'transfer', from: 'acc:a1', to: 'acc:a2' };
    const patch = editorPatch(f, 'inflow', '900');
    const merged = { ...f, ...patch };
    expect(cellsFromForm(merged)).toMatchObject({ account: 'acc:a1', transferTo: 'acc:a2', outflow: '900', inflow: '' });
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
  it('is account when shown and empty, otherwise payee (date is always seeded by txDefaults)', () => {
    expect(firstEmptyCell({ account: '', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, false)).toBe('account');
    expect(firstEmptyCell({ account: 'acc:a1', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, false)).toBe('payee');
    expect(firstEmptyCell({ account: '', date: '2026-08-20', payee: '', outflow: '', inflow: '' }, true)).toBe('payee');
  });
  it('keepForNext keeps source + date, drops the rest', () => {
    const f = base({ payWith: 'acc:a1', date: '2026-08-17', merchant: 'Subway', amount: '5', notes: 'x' });
    expect(keepForNext(f)).toEqual({ payWith: 'acc:a1', date: '2026-08-17' });
  });
});

describe('errorCells: maps validate.transaction keys onto editor cells', () => {
  it('empty submit — no account/amount picked at all', () => {
    expect(errorCells({ payWith: 'Choose the account or card you paid with.', amount: 'Enter an amount greater than zero.', date: 'Choose a valid date.' }, base())).toEqual({
      account: 'Choose the account or card you paid with.',
      date: 'Choose a valid date.',
      outflow: 'Enter an amount greater than zero.',
    });
  });
  it('account/payWith/transfer all land on the account cell (payWith wins when more than one is set)', () => {
    expect(errorCells({ account: 'That account is not available.' }, base({ type: 'income' })).account).toBe('That account is not available.');
    expect(errorCells({ transfer: 'From and To must be different accounts.' }, base({ type: 'transfer' })).account).toBe('From and To must be different accounts.');
    expect(errorCells({ payWith: 'x', account: 'y' }, base()).account).toBe('x');
  });
  it('date → date, merchant → payee, category/split → category', () => {
    expect(errorCells({ date: 'Choose a valid date.' }, base())).toEqual({ date: 'Choose a valid date.' });
    expect(errorCells({ merchant: 'Keep this under 240 characters.' }, base())).toEqual({ payee: 'Keep this under 240 characters.' });
    expect(errorCells({ category: 'That category no longer exists.' }, base())).toEqual({ category: 'That category no longer exists.' });
    expect(errorCells({ split: 'A split needs at least two lines.' }, base())).toEqual({ category: 'A split needs at least two lines.' });
  });
  it('amount lands on outflow for expense/transfer/adjustment-decrease, inflow for income/refund/adjustment-increase', () => {
    expect(errorCells({ amount: 'e' }, base({ type: 'expense' }))).toEqual({ outflow: 'e' });
    expect(errorCells({ amount: 'e' }, base({ type: 'transfer' }))).toEqual({ outflow: 'e' });
    expect(errorCells({ amount: 'e' }, base({ type: 'adjustment', direction: 'decrease' }))).toEqual({ outflow: 'e' });
    expect(errorCells({ amount: 'e' }, base({ type: 'income' }))).toEqual({ inflow: 'e' });
    expect(errorCells({ amount: 'e' }, base({ type: 'refund' }))).toEqual({ inflow: 'e' });
    expect(errorCells({ amount: 'e' }, base({ type: 'adjustment', direction: 'increase' }))).toEqual({ inflow: 'e' });
  });
  it('no errors → empty object', () => {
    expect(errorCells({}, base())).toEqual({});
    expect(errorCells(null, base())).toEqual({});
  });
});

describe('isMeaningfulDraft: what the Escape discard-guard is allowed to skip', () => {
  it('payee/memo text alone is not meaningful', () => {
    expect(isMeaningfulDraft(base({ merchant: 'S' }))).toBe(false);
    expect(isMeaningfulDraft(base({ notes: 'a note' }))).toBe(false);
    expect(isMeaningfulDraft(base({ merchant: 'S', notes: 'a note' }))).toBe(false);
  });
  it('an amount makes it meaningful', () => {
    expect(isMeaningfulDraft(base({ amount: '500' }))).toBe(true);
    expect(isMeaningfulDraft(base({ amount: '' }))).toBe(false);
    expect(isMeaningfulDraft(base({ amount: '   ' }))).toBe(false);
  });
  it('a category pick makes it meaningful', () => {
    expect(isMeaningfulDraft(base({ category: 'c9' }))).toBe(true);
  });
  it('a split with at least one line makes it meaningful', () => {
    expect(isMeaningfulDraft(base({ splitOn: true, splits: [{ category: '' }] }))).toBe(true);
    expect(isMeaningfulDraft(base({ splitOn: true, splits: [] }))).toBe(false);
    expect(isMeaningfulDraft(base({ splitOn: false, splits: [{ category: 'c9' }] }))).toBe(false);
  });
  it('a transfer only becomes meaningful once To is chosen', () => {
    expect(isMeaningfulDraft(base({ type: 'transfer', from: 'acc:a1', to: '' }))).toBe(false);
    expect(isMeaningfulDraft(base({ type: 'transfer', from: 'acc:a1', to: 'acc:a2' }))).toBe(true);
  });
  it('a totally blank draft is not meaningful', () => {
    expect(isMeaningfulDraft(base())).toBe(false);
    expect(isMeaningfulDraft(null)).toBe(false);
  });
});
