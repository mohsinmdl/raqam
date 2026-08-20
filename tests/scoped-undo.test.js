import { describe, it, expect } from 'vitest';
import { openScope, transition, canUndoScoped, canRedoScoped } from '../src/lib/scopedUndo.js';
import { UNDO_CAP, emptyStacks, recordChange, applyUndo, applyRedo, topSeq } from '../src/lib/undo.js';

// openScope(seq, depth): the boundary is the seq of the newest change at open;
// depth is only the bookkeeping input for the redo window.
describe('scoped undo window', () => {
  it('cannot undo past the modal-open boundary', () => {
    const s = openScope(5, 5); // 5 changes existed before the modal opened
    expect(canUndoScoped(s, 5)).toBe(false);
    const after = transition(s, 6, false); // one modal action
    expect(canUndoScoped(after, 6)).toBe(true);
  });
  it('undo raises redoable; a new change kills it', () => {
    let s = openScope(0, 0);
    s = transition(s, 1, false); // action
    s = transition(s, 2, false); // action
    s = transition(s, 1, false); // undo (depth fell)
    expect(canRedoScoped(s)).toBe(true);
    expect(canUndoScoped(s, 1)).toBe(true);
    s = transition(s, 2, false); // NEW action (not redo) — redo dies
    expect(canRedoScoped(s)).toBe(false);
  });
  it('redo consumes redoable', () => {
    let s = openScope(0, 0);
    s = transition(s, 1, false);
    s = transition(s, 0, false); // undo
    expect(canRedoScoped(s)).toBe(true);
    s = transition(s, 1, true);  // redo (wasRedo)
    expect(canRedoScoped(s)).toBe(false);
    expect(canUndoScoped(s, 1)).toBe(true);
  });
  it('a multi-step depth fall counts every undo', () => {
    let s = openScope(0, 0);
    s = transition(s, 3, false); s = transition(s, 4, false);
    s = transition(s, 1, false); // three undos landed in one observation
    expect(s.redoable).toBe(3);
  });
  // A8: the mirror case is deliberately NOT symmetric. A multi-step RISE can
  // only be a redo plus at least one action (the modal has no multi-redo
  // button), and an action clears the redo window anyway — so one decrement is
  // the honest count. Pinned here so a future symmetry "fix" has to argue with
  // a test rather than with a comment.
  it('a multi-step depth rise decrements redoable once, not by the delta', () => {
    let s = openScope(0, 0);
    s = transition(s, 3, false);
    s = transition(s, 0, false); // three undos
    expect(s.redoable).toBe(3);
    s = transition(s, 2, true);  // observed as one redo, delta 2
    expect(s.redoable).toBe(2);
  });
});

// A6: the boundary is a seq, not a depth, and this is the case that proves it.
// At UNDO_CAP recordChange drops from the front, so past.length stops moving —
// a depth-marked boundary would never again see "something of mine to undo".
describe('the window survives UNDO_CAP', () => {
  const step = (stacks, i) => recordChange(stacks, { audit: [], n: i }, 'step' + i);

  it('a modal action at the cap is still undoable, down to the boundary', () => {
    let stacks = emptyStacks();
    for (let i = 0; i < UNDO_CAP; i++) stacks = step(stacks, i);
    expect(stacks.past).toHaveLength(UNDO_CAP);

    const scope = openScope(topSeq(stacks), stacks.past.length); // modal opens
    expect(canUndoScoped(scope, topSeq(stacks))).toBe(false);

    stacks = step(stacks, 100); // one modal action — depth unchanged at the cap
    expect(stacks.past).toHaveLength(UNDO_CAP);
    expect(canUndoScoped(scope, topSeq(stacks))).toBe(true);

    const undone = applyUndo({ data: { audit: [] }, ...stacks }, { id: 'u', summary: 'Undid' });
    expect(canUndoScoped(scope, topSeq(undone))).toBe(false); // back at the boundary
  });

  it('a redone change returns with the seq it was recorded with', () => {
    let stacks = emptyStacks();
    for (let i = 0; i < 3; i++) stacks = step(stacks, i);
    const scope = openScope(topSeq(stacks), stacks.past.length);
    stacks = step(stacks, 9);
    const seqOfAction = topSeq(stacks);
    const undone = applyUndo({ data: { audit: [] }, ...stacks }, { id: 'u', summary: 'Undid' });
    expect(canUndoScoped(scope, topSeq(undone))).toBe(false);
    const redone = applyRedo(undone, { id: 'r', summary: 'Redid' });
    expect(topSeq(redone)).toBe(seqOfAction);
    expect(canUndoScoped(scope, topSeq(redone))).toBe(true);
  });

  it('a system reset (empty stacks) disables the window, and the next action re-arms it', () => {
    let stacks = emptyStacks();
    for (let i = 0; i < 3; i++) stacks = step(stacks, i);
    const scope = openScope(topSeq(stacks), stacks.past.length);
    // Month rollover / hydrate: past and future are emptied, the counter is not.
    const reset = { ...stacks, ...emptyStacks() };
    expect(canUndoScoped(scope, topSeq(reset))).toBe(false);
    const after = step(reset, 4);
    expect(after.past).toHaveLength(1);
    expect(canUndoScoped(scope, topSeq(after))).toBe(true);   // the new change is the modal's
    expect(topSeq(after)).toBeGreaterThan(scope.mark);        // no seq is ever reused
  });
});
