// The Manage Payees modal's Undo/Redo is a WINDOW over the global undo stack:
// a boundary is marked at open, and the modal's buttons cannot cross it. No
// second history — Done leaves everything in normal app history.
//
// The boundary is a SEQUENCE, not a depth. past.length is not an identity:
// at UNDO_CAP recordChange drops from the front, so an action taken while the
// stack is full leaves the depth unchanged and a depth-marked boundary would
// declare "nothing of mine to undo" for the rest of the session. Each entry
// carries a monotonic `seq` (src/lib/undo.js), so the honest question is
// "is the newest entry newer than the one that was on top when I opened?" —
// canUndoScoped compares seqs and the cap becomes invisible.
//
// Two invariants hold, and nothing else is assumed:
//   1. seq only ever grows, and is never reused — including across a system
//      reset (month rollover, hydrate, replaceData), which empties both
//      stacks without rewinding the counter. topSeq then reads 0, the modal's
//      Undo disables (correct: those snapshots are gone), and the next modal
//      action re-arms it with a seq above the mark. The scope needs no
//      invalidation event; the comparison is already right.
//   2. While the modal is open it is the only undo/redo control (the app is
//      scrimmed), so depth (past.length) moves for exactly three reasons: a
//      modal action (+1, or +0 at the cap; clears redo), a modal Undo (−1 per
//      step, redoable +1 per step), a modal Redo (+1 — applyRedo pushes back
//      onto past — distinguished by the caller passing wasRedo).
// Redoable is still counted from depth deltas under invariant 2. The one case
// where a depth delta lies is an action at the cap (+0), and there redoable
// is necessarily already 0: it can only be non-zero after an Undo, which
// leaves depth below the cap, so the following action does move it.
export const openScope = (seq, depth) => ({ mark: seq, depth, redoable: 0 });

export function transition(scope, depth, wasRedo = false) {
  if (depth < scope.depth) return { ...scope, depth, redoable: scope.redoable + (scope.depth - depth) };
  if (depth > scope.depth) return { ...scope, depth, redoable: wasRedo ? Math.max(0, scope.redoable - 1) : 0 };
  return scope;
}

export const canUndoScoped = (scope, seq) => seq > scope.mark;
export const canRedoScoped = scope => scope.redoable > 0;
