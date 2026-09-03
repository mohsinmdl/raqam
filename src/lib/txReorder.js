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

// `count` stamps counting DOWN one second at a time from `topMs` — newest
// first, so they align with a group's ids in register order.
const secondsDown = (topMs, count) => Array.from({ length: count }, (_, i) => fmtIsoSec(topMs - i * 1000));

// The moments a TOP-of-list drop should take, newest first, or null when the
// group cannot fit. When the view still contains now (the current month, All
// dates, Today) the top means the real clock: the group's newest row takes
// now and the rest sit one second earlier each — which only holds while the
// oldest of them is still after the row below. But when the register is
// scoped to a PAST date or month, `now` lies outside the view — stamping it
// would yank the rows out of sight and into today. There the top means "the
// latest txns ON the date you're looking at": one second after the newest
// visible row (`below`) per row, which only holds while the last of them is
// still inside that day.
function topStamps(below, now, nowInView, count) {
  if (nowInView) {
    const dates = secondsDown(toEpochMs(now), count);
    return dates[count - 1] > below.date ? dates : null;
  }
  const endOfDay = below.date.slice(0, 10) + 'T23:59:59';
  const base = toEpochMs(below.date);
  const dates = secondsDown(base + count * 1000, count);
  return dates[0] <= endOfDay ? dates : null;
}

// The picker fallback for a group: the instant the user picked is the group's
// newest row, the rest sit one second earlier each — so a blind confirm keeps
// the order they were dragged in. Newest first, like every `dates` here.
export function groupFromPick(iso, count) {
  return secondsDown(toEpochMs(iso), count);
}

// The moments `count` rows take when they are told to land ON a day, after
// everything already there. Rows are date-DESC and order IS the date, so
// "put these on the 20th" means "on top of the 20th": one second after that
// day's newest row, then two, … — ascending, so the caller hands them out in
// register order (its oldest row gets +1s, its newest +Ns) and the group reads
// the same way after the move. Capped at the day's last second (a move onto a
// day must stay on that day) and clamped to `now` (the app rule against
// future-dated rows). `exclude` lists the moved rows themselves, so a row
// already sitting on the day can't anchor its own move. Returns null when
// nothing else sits on the day — there is no "top" to land on, and the caller
// keeps whatever it did before (own time-of-day, a flat noon, …).
//
// Shared by bulk Move to Date, a back-dated add, and a top drop in a past-day
// view; keeping it here (not in the store) keeps the register's timestamp
// policy in one pure module.
export function landAfterLatest({ transactions, day, count, exclude, now }) {
  const skip = new Set(exclude || []);
  let latest = null;
  for (const t of transactions) {
    if (skip.has(t.id) || String(t.date).slice(0, 10) !== day) continue;
    if (latest == null || t.date > latest) latest = t.date;
  }
  if (latest == null) return null;
  const endOfDay = day + 'T23:59:59';
  const cap = now && now < endOfDay ? now : endOfDay;
  const base = toEpochMs(latest);
  return Array.from({ length: count }, (_, i) => {
    const s = fmtIsoSec(base + (i + 1) * 1000);
    return s > cap ? cap : s;
  });
}

// above  — the more-recent neighbor (row displayed above the drop gap), or null
//          when dropping at the very top.
// below  — the older neighbor (row displayed below the gap), or null at the
//          very bottom.
// now    — current wall clock, seconds ISO (injected; nothing here reads it).
// nowInView — is `now` inside the register's current date/month filter? When
//          false (viewing a past date or month), a top drop anchors to that
//          date's latest moment instead of the real clock (see topStamps).
// count  — how many rows are moving together (a multi-selection dragged as
//          one). They keep their order among themselves.
// Returns { mode:'auto', dates } — `count` stamps, NEWEST FIRST, aligned with
// the group's ids in register order — or { mode:'picker', seed } to open the
// picker pre-filled from `seed` (the group then fans out from the pick via
// groupFromPick).
export function planDrop({ above, below, now, windowDays = 3, nowInView = true, count = 1 }) {
  // Top of the list: the rows become the most recent in view. The anchor is
  // the real clock in a live view, or the viewed date's latest moment in a
  // scoped one — and either way only holds when the whole group fits.
  if (!above) {
    if (!below) return { mode: 'auto', dates: secondsDown(toEpochMs(now), count) };   // empty list
    const dates = topStamps(below, now, nowInView, count);
    return dates ? { mode: 'auto', dates } : { mode: 'picker', seed: below.date };
  }

  // Bottom of the list: no lower bound to interpolate against. An older date is
  // a real decision, not a midpoint — always ask.
  if (!below) return { mode: 'picker', seed: above.date };

  // Between two neighbors: interpolate only inside the window, and only when
  // there is a distinct second for every row. One row takes the midpoint; a
  // group is spread evenly across the gap (count+1 equal steps, each at least
  // a whole second), newest nearest the row above.
  const room = toEpochMs(above.date) - toEpochMs(below.date);
  const withinWindow = dayGapAbs(above.date, below.date) <= windowDays;
  if (withinWindow && room >= Math.max(MIN_ROOM_MS, (count + 1) * 1000)) {
    if (count === 1) return { mode: 'auto', dates: [midpointIso(above.date, below.date)] };
    const lo = toEpochMs(below.date);
    const step = Math.floor(room / (count + 1) / 1000) * 1000;
    return { mode: 'auto', dates: Array.from({ length: count }, (_, i) => fmtIsoSec(lo + step * (count - i))) };
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
//   dragIds   — the rows being moved: the dragged row alone, or the whole
//               selection when the dragged row is part of it. Any order.
//   beforeId  — the row the insertion line sits ABOVE, or null for the very end.
//   nowInView — forwarded to planDrop; governs a top drop's anchor (see above).
//
// Returns null when the drop would leave the register in the order it already
// has (dropped onto a member, or back into its own gap), else the planDrop
// result tagged with the group's `ids` in register order — so `dates[i]`
// (newest first) belongs to `ids[i]`.
export function resolveDrop({ ids, rowDate, dragIds, beforeId, now, windowDays, nowInView }) {
  const moving = new Set(dragIds);
  const group = ids.filter(id => moving.has(id));
  if (group.length === 0 || (beforeId != null && moving.has(beforeId))) return null;

  const order = ids.filter(id => !moving.has(id));
  const insertIdx = beforeId == null ? order.length : order.indexOf(beforeId);
  // The register after the drop; if that is the register as it stands, the
  // gesture changes nothing (this covers "back into its own gap" for a single
  // row AND a contiguous group; a scattered group always gathers, so it moves).
  const next = [...order.slice(0, insertIdx), ...group, ...order.slice(insertIdx)];
  if (next.every((id, i) => id === ids[i])) return null;

  const aboveId = insertIdx > 0 ? order[insertIdx - 1] : null;
  const above = aboveId ? { id: aboveId, date: rowDate(aboveId) } : null;
  const below = beforeId != null ? { id: beforeId, date: rowDate(beforeId) } : null;
  return { ids: group, ...planDrop({ above, below, now, windowDays, nowInView, count: group.length }) };
}
