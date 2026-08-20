import { describe, it, expect } from 'vitest';
import { UNDO_CAP, emptyStacks, labelFor, recordChange, applyUndo, applyRedo, undoLabel, redoLabel, topSeq } from '../src/lib/undo.js';

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

// A6: depth is not identity — at the cap two different changes share a
// past.length, so every entry carries a monotonic seq instead.
describe('entry sequence', () => {
  it('stamps each entry with the next seq and reports the newest', () => {
    let s = recordChange(emptyStacks(), store(), 'one');
    expect(s.past[0].seq).toBe(1);
    expect(topSeq(s)).toBe(1);
    s = recordChange(s, store(), 'two');
    expect(topSeq(s)).toBe(2);
  });

  it('topSeq is 0 when there is nothing to undo', () => {
    expect(topSeq(emptyStacks())).toBe(0);
  });

  it('keeps climbing past UNDO_CAP even though depth stops', () => {
    let s = emptyStacks();
    for (let i = 0; i < UNDO_CAP + 10; i++) s = recordChange(s, store({ n: i }), 'step' + i);
    expect(s.past).toHaveLength(UNDO_CAP);
    expect(topSeq(s)).toBe(UNDO_CAP + 10);
    expect(s.past[0].seq).toBe(11); // the surviving front entry
  });

  it('never reuses a seq after a system reset empties the stacks', () => {
    const s = recordChange(emptyStacks(), store(), 'one');
    const reset = { ...s, ...emptyStacks() };   // hydrate / rollover / replaceData
    expect(topSeq(reset)).toBe(0);
    expect(recordChange(reset, store(), 'next').past[0].seq).toBe(2);
  });
});

const undoAudit = { id: 'u1', at: '2026-08-06T11:00', entityType: 'app', entityId: 'undo', action: 'undo', summary: 'Undid: Deleted expense' };
const redoAudit = { id: 'r1', at: '2026-08-06T11:01', entityType: 'app', entityId: 'redo', action: 'redo', summary: 'Redid: Deleted expense' };

describe('applyUndo', () => {
  const before = store({ transactions: [{ id: 't1' }], audit: [auditRow('created')] });
  const after = store({ transactions: [], audit: [auditRow('deleted'), auditRow('created')] });
  const state = () => ({ data: after, ...recordChange(emptyStacks(), before, 'Deleted expense') });

  it('restores the previous data', () => {
    expect(applyUndo(state(), undoAudit).data.transactions).toBe(before.transactions);
  });

  it('keeps the CURRENT audit, never the snapshot\'s — the trail is append-only', () => {
    const out = applyUndo(state(), undoAudit);
    expect(out.data.audit).toHaveLength(3);
    expect(out.data.audit[0]).toBe(undoAudit);
    expect(out.data.audit[1].summary).toBe('deleted');
    expect(out.data.audit[2].summary).toBe('created');
  });

  it('moves the current state onto the redo stack', () => {
    const out = applyUndo(state(), undoAudit);
    expect(out.past).toHaveLength(0);
    expect(out.future).toHaveLength(1);
    expect(out.future[0].label).toBe('Deleted expense');
    expect(out.future[0].snapshot).toBe(after);
  });

  it('returns null when there is nothing to undo', () => {
    expect(applyUndo({ data: after, ...emptyStacks() }, undoAudit)).toBe(null);
  });
});

describe('applyRedo', () => {
  const before = store({ transactions: [{ id: 't1' }], audit: [auditRow('created')] });
  const after = store({ transactions: [], audit: [auditRow('deleted'), auditRow('created')] });

  it('reapplies the undone state and keeps the audit growing', () => {
    const undone = applyUndo({ data: after, ...recordChange(emptyStacks(), before, 'Deleted expense') }, undoAudit);
    const out = applyRedo(undone, redoAudit);
    expect(out.data.transactions).toBe(after.transactions);
    expect(out.data.audit).toHaveLength(4);
    expect(out.data.audit[0]).toBe(redoAudit);
    expect(out.past).toHaveLength(1);
    expect(out.future).toHaveLength(0);
  });

  it('returns null when there is nothing to redo', () => {
    expect(applyRedo({ data: after, ...emptyStacks() }, redoAudit)).toBe(null);
  });
});

describe('the audit trail never shrinks', () => {
  it('grows by one on every undo and redo, through any sequence', () => {
    const v0 = store({ transactions: [], audit: [auditRow('a0')] });
    const v1 = store({ transactions: [{ id: 't1' }], audit: [auditRow('a1'), auditRow('a0')] });
    let s = { data: v1, ...recordChange(emptyStacks(), v0, 'added') };
    let len = s.data.audit.length;
    for (let i = 0; i < 6; i++) {
      const step = i % 2 === 0
        ? applyUndo(s, { ...undoAudit, id: 'u' + i })
        : applyRedo(s, { ...redoAudit, id: 'r' + i });
      expect(step).not.toBe(null);
      expect(step.data.audit.length).toBe(len + 1);
      len = step.data.audit.length;
      s = step;
    }
  });
});

describe('labels for the buttons', () => {
  it('names the step each button would take', () => {
    const s = recordChange(emptyStacks(), store(), 'Deleted expense of 5000');
    expect(undoLabel(s)).toBe('Deleted expense of 5000');
    expect(redoLabel(s)).toBe(null);
  });
  it('is null when a stack is empty', () => {
    expect(undoLabel(emptyStacks())).toBe(null);
    expect(redoLabel(emptyStacks())).toBe(null);
  });
});
