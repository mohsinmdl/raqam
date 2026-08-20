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

// What the cursor's live region says after it moves. The arrow-key cursor is
// drawn as an accent bar on the row — visible, and silent to a screen reader,
// since nothing about a styled <tr> announces that a cursor landed on it. This
// is the spoken half: where the cursor is, in a list of what length, on which
// row, and whether that row is selected (which is what Space toggles).
// Pure: takes the presented rows, not the DOM. '' means "say nothing" — no
// cursor, or a cursor on a row that is no longer in the list.
export function cursorStatusLabel(rows, cursorId, selected) {
  if (!cursorId || !rows || rows.length === 0) return '';
  const i = rows.findIndex(r => r.id === cursorId);
  if (i === -1) return '';
  const r = rows[i];
  const name = r.a11yName || r.merchant || 'transaction';
  const where = 'Row ' + (i + 1) + ' of ' + rows.length + ': ' + name + ', ' + r.dateLabel;
  return where + ((selected && selected.has(cursorId)) ? ' — selected' : '');
}

// The inclusive id slice between two ids, in list order (either argument order).
// Returns [] if either id is absent.
export function rangeBetween(ids, anchorId, cursorId) {
  const a = ids.indexOf(anchorId);
  const b = ids.indexOf(cursorId);
  if (a === -1 || b === -1) return [];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}
