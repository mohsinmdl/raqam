// Pure drop policy for drag-to-reorder on the transactions register.
//
// Rows are date-DESC, and a transaction's order IS its `date` — so reordering
// means writing a new timestamp. This module answers one question, with no DOM
// and no store: given the two rows a dragged row was dropped between, should we
// silently interpolate a moment between them, or open the date/time picker and
// let the user say when it actually happened?
//
// The line between the two is the app's standing rule against inventing false
// precision (see actions.stampFor): a midpoint inside a tight window is a fair
// guess; a midpoint dropped into a multi-day empty stretch is a fabrication, so
// we ask instead.
import { dayGapAbs, midpointIso, toEpochMs } from './dates.js';

// Two whole seconds is the minimum room for a floored-second midpoint to differ
// from both neighbors; any tighter and there is no distinct moment to assign.
const MIN_ROOM_MS = 2000;

// above  — the more-recent neighbor (row displayed above the drop gap), or null
//          when dropping at the very top.
// below  — the older neighbor (row displayed below the gap), or null at the
//          very bottom.
// now    — current wall clock, seconds ISO (injected; nothing here reads it).
// Returns { mode:'auto', date } to assign `date`, or { mode:'picker', seed } to
// open the picker pre-filled from `seed`.
export function planDrop({ above, below, now, windowDays = 3 }) {
  // Top of the list: the row becomes the most recent. It can't sit in the
  // future, so `now` is the answer only when there's room below it.
  if (!above) {
    if (!below) return { mode: 'auto', date: now };          // empty list
    return now > below.date
      ? { mode: 'auto', date: now }
      : { mode: 'picker', seed: below.date };
  }

  // Bottom of the list: no lower bound to interpolate against. An older date is
  // a real decision, not a midpoint — always ask.
  if (!below) return { mode: 'picker', seed: above.date };

  // Between two neighbors: interpolate only inside the window, and only when
  // there is a distinct second to land on.
  const room = toEpochMs(above.date) - toEpochMs(below.date);
  const withinWindow = dayGapAbs(above.date, below.date) <= windowDays;
  if (withinWindow && room >= MIN_ROOM_MS) {
    return { mode: 'auto', date: midpointIso(above.date, below.date) };
  }
  // Too far apart, or too tight to split: seed the picker with a moment that
  // still sorts between the neighbors so a blind confirm keeps the order.
  const seed = room >= MIN_ROOM_MS ? midpointIso(above.date, below.date) : above.date;
  return { mode: 'picker', seed };
}

// Turn a drop gesture into a plan. Kept pure (no DOM, no store) so the hook is
// just event plumbing over it and the neighbour math is unit-tested.
//
//   ids       — rendered row ids, date-DESC.
//   rowDate   — id -> that row's timestamp string.
//   dragId    — the row being moved.
//   beforeId  — the row the insertion line sits ABOVE, or null for the very end.
//
// Returns null when the row was dropped back into its own gap (a no-op), else
// the planDrop result tagged with the dragged row's id.
export function resolveDrop({ ids, rowDate, dragId, beforeId, now, windowDays }) {
  const dragIdx = ids.indexOf(dragId);
  const currentBeforeId = dragIdx >= 0 ? (ids[dragIdx + 1] ?? null) : null;
  if (beforeId === dragId || beforeId === currentBeforeId) return null;

  const order = ids.filter(id => id !== dragId);
  const insertIdx = beforeId == null ? order.length : order.indexOf(beforeId);
  const aboveId = insertIdx > 0 ? order[insertIdx - 1] : null;
  const above = aboveId ? { id: aboveId, date: rowDate(aboveId) } : null;
  const below = beforeId != null ? { id: beforeId, date: rowDate(beforeId) } : null;
  return { id: dragId, ...planDrop({ above, below, now, windowDays }) };
}
