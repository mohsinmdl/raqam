// Cursor math for keyboard row navigation. Pure — operates on an ordered list
// of row ids, no DOM or React, so it is fully unit-testable.

// The id after moving `delta` (±1) from cursorId within `ids`. Seeds to the
// first row when the cursor is null or no longer present; clamps at both ends;
// null for an empty list.
export function stepCursor(ids, cursorId, delta) {
  if (ids.length === 0) return null;
  const i = ids.indexOf(cursorId);
  if (i === -1) return ids[0];
  const next = Math.min(ids.length - 1, Math.max(0, i + delta));
  return ids[next];
}

// The inclusive id slice between two ids, in list order (either argument order).
// Returns [] if either id is absent.
export function rangeBetween(ids, anchorId, cursorId) {
  const a = ids.indexOf(anchorId);
  const b = ids.indexOf(cursorId);
  if (a === -1 || b === -1) return [];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}
