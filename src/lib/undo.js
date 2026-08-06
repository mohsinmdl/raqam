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

export function recordChange(stacks, prevData, label) {
  const past = [...stacks.past, { snapshot: prevData, label }];
  // Drop from the front so the most recent UNDO_CAP steps survive.
  return { past: past.length > UNDO_CAP ? past.slice(past.length - UNDO_CAP) : past, future: [] };
}
