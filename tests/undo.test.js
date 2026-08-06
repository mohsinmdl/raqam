import { describe, it, expect } from 'vitest';
import { UNDO_CAP, emptyStacks, labelFor, recordChange } from '../src/lib/undo.js';

const store = over => ({ transactions: [], recurring: [], audit: [], ...(over || {}) });
const auditRow = summary => ({ id: 'a' + summary, at: '2026-08-06T10:00', summary });

describe('emptyStacks', () => {
  it('starts with nothing to undo or redo', () => {
    expect(emptyStacks()).toEqual({ past: [], future: [] });
  });
});

describe('labelFor', () => {
  it('takes the summary of the audit row the action just prepended', () => {
    const prev = store({ audit: [auditRow('old')] });
    const next = store({ audit: [auditRow('Deleted expense of 5000'), auditRow('old')] });
    expect(labelFor(prev, next)).toBe('Deleted expense of 5000');
  });

  it('falls back when the action wrote no audit row', () => {
    const auditRowOld = auditRow('old');
    const prev = store({ audit: [auditRowOld] });
    const next = store({ audit: [auditRowOld], transactions: [{ id: 't1' }] });
    expect(labelFor(prev, next)).toBe('last change');
  });

  it('falls back when the audit row carries no summary', () => {
    const prev = store();
    const next = store({ audit: [{ id: 'x', at: '2026-08-06T10:00', summary: '' }] });
    expect(labelFor(prev, next)).toBe('last change');
  });

  it('handles a store whose audit is missing entirely', () => {
    expect(labelFor({}, {})).toBe('last change');
  });
});

describe('recordChange', () => {
  it('pushes the previous snapshot with its label', () => {
    const prev = store({ transactions: [{ id: 't1' }] });
    const s = recordChange(emptyStacks(), prev, 'Deleted expense');
    expect(s.past).toHaveLength(1);
    expect(s.past[0].label).toBe('Deleted expense');
    expect(s.past[0].snapshot).toBe(prev);
  });

  it('keeps the snapshot by reference, never a copy', () => {
    const prev = store({ transactions: [{ id: 't1' }] });
    const s = recordChange(emptyStacks(), prev, 'x');
    expect(s.past[0].snapshot.transactions).toBe(prev.transactions);
  });

  it('clears the redo stack — a new action forks history', () => {
    const stacks = { past: [], future: [{ snapshot: store(), label: 'redoable' }] };
    expect(recordChange(stacks, store(), 'new').future).toEqual([]);
  });

  it('caps at UNDO_CAP, dropping the oldest', () => {
    let s = emptyStacks();
    for (let i = 0; i < UNDO_CAP + 10; i++) s = recordChange(s, store({ n: i }), 'step' + i);
    expect(s.past).toHaveLength(UNDO_CAP);
    expect(s.past[0].label).toBe('step10');
    expect(s.past[UNDO_CAP - 1].label).toBe('step' + (UNDO_CAP + 9));
  });

  it('does not mutate the stacks it was given', () => {
    const stacks = emptyStacks();
    recordChange(stacks, store(), 'x');
    expect(stacks.past).toEqual([]);
  });
});
