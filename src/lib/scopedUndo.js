// The Manage Payees modal's Undo/Redo is a WINDOW over the global undo stack:
// a boundary is marked at open, and the modal's buttons cannot cross it. No
// second history — Done leaves everything in normal app history. While the
// modal is open it is the only undo/redo control (the app is scrimmed), so
// depth (past.length) moves for exactly three reasons: a modal action
// (depth+1, clears redo), a modal Undo (depth−1, redo+1 per step), a modal
// Redo (also depth+1 — applyRedo pushes back onto past — distinguished by
// the caller passing wasRedo).
export const openScope = depth => ({ mark: depth, depth, redoable: 0 });

export function transition(scope, depth, wasRedo = false) {
  if (depth < scope.depth) return { ...scope, depth, redoable: scope.redoable + (scope.depth - depth) };
  if (depth > scope.depth) return { ...scope, depth, redoable: wasRedo ? Math.max(0, scope.redoable - 1) : 0 };
  return scope;
}

export const canUndoScoped = (scope, depth) => depth > scope.mark;
export const canRedoScoped = scope => scope.redoable > 0;
