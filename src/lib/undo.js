// Undo/redo stacks for the store.
//
// Pure and DOM-free: the reducer in StoreProvider is a thin adapter over these
// functions, so all the reasoning lives here where tests can reach it.
//
// Snapshots are held BY REFERENCE, never cloned. Pure actions return
// `{...data}` with only the changed collections replaced, so fifty entries
// cost fifty spines, not fifty copies of the ledger.

export const UNDO_CAP = 50;

export function emptyStacks() {
  return { past: [], future: [] };
}

// Every mutating action prepends an audit row carrying a human summary
// ("Deleted expense of 5000"), so the label for an undo entry is free — no
// call site has to describe itself.
export function labelFor(prevData, nextData) {
  const prevHead = (prevData && prevData.audit && prevData.audit[0]) || null;
  const nextHead = (nextData && nextData.audit && nextData.audit[0]) || null;
  if (!nextHead || nextHead === prevHead) return 'last change';
  return nextHead.summary || 'last change';
}

// Every entry carries a monotonic `seq`, because past.length is NOT a stable
// identity for "which change is on top": at UNDO_CAP the front-drop below
// keeps the length pinned, so two different changes share a depth. Anything
// comparing "is the top entry newer than the one I saw?" (src/lib/scopedUndo.js)
// has to compare seq. The counter lives on the stacks object and only ever
// grows — emptyStacks() deliberately does NOT reset it, so an entry recorded
// after a hydrate/system reset can never reuse a seq an open scope remembers.
export function recordChange(stacks, prevData, label) {
  const seq = (stacks.seq || 0) + 1;
  const past = [...stacks.past, { snapshot: prevData, label, seq }];
  // Drop from the front so the most recent UNDO_CAP steps survive.
  return { past: past.length > UNDO_CAP ? past.slice(past.length - UNDO_CAP) : past, future: [], seq };
}

// The seq of the newest undoable entry; 0 when there is nothing to undo.
export const topSeq = stacks => (stacks.past.length ? stacks.past[stacks.past.length - 1].seq || 0 : 0);

// Restoring an older snapshot would also restore an older `audit`, which the
// sync engine treats as append-only (sync.js: appendOnly, and the server has
// no delete policy) — rows already pushed would then be missing locally and
// the two would silently diverge for the rest of the session (a reload
// re-fetches history and self-heals, since audit is fetched now rather than
// skipped). So the CURRENT audit is carried across untouched and a new row
// is prepended: history reads "created X, then undid it", never "nothing
// happened".
function restore(currentData, snapshot, auditRow) {
  return { ...snapshot, audit: [auditRow, ...(currentData.audit || [])] };
}

export function applyUndo(state, auditRow) {
  if (state.past.length === 0) return null;
  const entry = state.past[state.past.length - 1];
  return {
    data: restore(state.data, entry.snapshot, auditRow),
    past: state.past.slice(0, -1),
    // The entry keeps its seq on the way to the redo stack and back, so a
    // redone change lands on `past` with the identity it was recorded with.
    future: [...state.future, { snapshot: state.data, label: entry.label, seq: entry.seq }],
  };
}

export function applyRedo(state, auditRow) {
  if (state.future.length === 0) return null;
  const entry = state.future[state.future.length - 1];
  return {
    data: restore(state.data, entry.snapshot, auditRow),
    past: [...state.past, { snapshot: state.data, label: entry.label, seq: entry.seq }],
    future: state.future.slice(0, -1),
  };
}

const topLabel = list => (list.length ? list[list.length - 1].label : null);
export const undoLabel = stacks => topLabel(stacks.past);
export const redoLabel = stacks => topLabel(stacks.future);
