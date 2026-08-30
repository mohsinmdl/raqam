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
import { dayGapAbs, fmtIsoSec, midpointIso, toEpochMs } from './dates.js';

// Two whole seconds is the minimum room for a floored-second midpoint to differ
// from both neighbors; any tighter and there is no distinct moment to assign.
const MIN_ROOM_MS = 2000;

// The moment a TOP-of-list drop should take. When the view still contains now
// (the current month, All dates, Today) the top means the real clock. But when
// the register is scoped to a PAST date or month, `now` lies outside the view —
// stamping it would yank the row out of sight and into today. There the top
// means "the latest txn ON the date you're looking at": just after the newest
// visible row (`below`), capped to the end of its day.
function topAnchor(below, now, nowInView) {
  if (nowInView) return now;
  const endOfDay = below.date.slice(0, 10) + 'T23:59:59';
  const plus1 = fmtIsoSec(toEpochMs(below.date) + 1000);
  return plus1 <= endOfDay ? plus1 : endOfDay;
}

// above  — the more-recent neighbor (row displayed above the drop gap), or null
//          when dropping at the very top.
// below  — the older neighbor (row displayed below the gap), or null at the
//          very bottom.
// now    — current wall clock, seconds ISO (injected; nothing here reads it).
// nowInView — is `now` inside the register's current date/month filter? When
//          false (viewing a past date or month), a top drop anchors to that
//          date's latest moment instead of the real clock (see topAnchor).
// Returns { mode:'auto', date } to assign `date`, or { mode:'picker', seed } to
// open the picker pre-filled from `seed`.
export function planDrop({ above, below, now, windowDays = 3, nowInView = true }) {
  // Top of the list: the row becomes the most recent in view. The anchor is the
  // real clock in a live view, or the viewed date's latest moment in a scoped
  // one — and either way only holds when there's room below it.
  if (!above) {
    if (!below) return { mode: 'auto', date: now };          // empty list
    const anchor = topAnchor(below, now, nowInView);
    return anchor > below.date
      ? { mode: 'auto', date: anchor }
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
  // Open the picker. When there IS room (neighbours just span more than the
  // window), seed the midpoint — it sorts strictly between them, so a blind
  // confirm keeps the order. When they're under two seconds apart there is no
  // such moment: seed the upper neighbour as a starting point and rely on the
  // user to choose (the picker is minute-granular, so a blind confirm here can
  // tie a neighbour — acceptable for a sub-2-second gap that never arises from
  // hand-entered data).
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
//   nowInView — forwarded to planDrop; governs a top drop's anchor (see above).
//
// Returns null when the row was dropped back into its own gap (a no-op), else
// the planDrop result tagged with the dragged row's id.
export function resolveDrop({ ids, rowDate, dragId, beforeId, now, windowDays, nowInView }) {
  const dragIdx = ids.indexOf(dragId);
  const currentBeforeId = dragIdx >= 0 ? (ids[dragIdx + 1] ?? null) : null;
  if (beforeId === dragId || beforeId === currentBeforeId) return null;

  const order = ids.filter(id => id !== dragId);
  const insertIdx = beforeId == null ? order.length : order.indexOf(beforeId);
  const aboveId = insertIdx > 0 ? order[insertIdx - 1] : null;
  const above = aboveId ? { id: aboveId, date: rowDate(aboveId) } : null;
  const below = beforeId != null ? { id: beforeId, date: rowDate(beforeId) } : null;
  return { id: dragId, ...planDrop({ above, below, now, windowDays, nowInView }) };
}
