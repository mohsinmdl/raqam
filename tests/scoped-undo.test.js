import { describe, it, expect } from 'vitest';
import { openScope, transition, canUndoScoped, canRedoScoped } from '../src/lib/scopedUndo.js';

describe('scoped undo window', () => {
  it('cannot undo past the modal-open boundary', () => {
    const s = openScope(5); // 5 changes existed before the modal opened
    expect(canUndoScoped(s, 5)).toBe(false);
    const after = transition(s, 6, false); // one modal action
    expect(canUndoScoped(after, 6)).toBe(true);
  });
  it('undo raises redoable; a new change kills it', () => {
    let s = openScope(0);
    s = transition(s, 1, false); // action
    s = transition(s, 2, false); // action
    s = transition(s, 1, false); // undo (depth fell)
    expect(canRedoScoped(s)).toBe(true);
    expect(canUndoScoped(s, 1)).toBe(true);
    s = transition(s, 2, false); // NEW action (not redo) — redo dies
    expect(canRedoScoped(s)).toBe(false);
  });
  it('redo consumes redoable', () => {
    let s = openScope(0);
    s = transition(s, 1, false);
    s = transition(s, 0, false); // undo
    expect(canRedoScoped(s)).toBe(true);
    s = transition(s, 1, true);  // redo (wasRedo)
    expect(canRedoScoped(s)).toBe(false);
    expect(canUndoScoped(s, 1)).toBe(true);
  });
  it('a multi-step depth fall counts every undo', () => {
    let s = openScope(0);
    s = transition(s, 3, false); s = transition(s, 4, false);
    s = transition(s, 1, false); // three undos landed in one observation
    expect(s.redoable).toBe(3);
  });
});
