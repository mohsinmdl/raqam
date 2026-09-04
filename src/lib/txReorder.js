// Pure drop policy for drag-to-reorder on the transactions register.
//
// Rows are date-DESC, and a transaction's order IS its `date` — so reordering
// means writing a new timestamp. This module answers one question, with no DOM
// and no store: given the two rows a dragged row (or group) was dropped between, should we
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
// visible row (`below`) per row, which only holds while the newest of them
// (`below` + count seconds) is still inside that day. Instants are compared
// as epochs, so a minute-precision neighbour and a seconds-precision stamp of
// the same moment count as equal (no room), and an unreadable neighbour
// refuses rather than stamping empty strings.
function topStamps(below, now, nowInView, count) {
  const belowMs = toEpochMs(below.date);
  if (!Number.isFinite(belowMs)) return null;
  if (nowInView) {
    const dates = secondsDown(toEpochMs(now), count);
    return toEpochMs(dates[count - 1]) > belowMs ? dates : null;
  }
  const endOfDay = toEpochMs(below.date.slice(0, 10) + 'T23:59:59');
  const top = belowMs + count * 1000;   // the newest of the group, one second per row above `below`
  return top <= endOfDay ? secondsDown(top, count) : null;
}

// The picker fallback for a group: the instant the user picked is the group's
// newest row, the rest sit one second earlier each — so a blind confirm keeps
// the order they were dragged in. Newest first, like every `dates` here.
//
// `bounds` — the gap the picker was opened for ({ above, below } neighbour
// dates, either null). The picker is minute-granular and is usually SEEDED
// from a neighbour, so a blind confirm lands in that neighbour's minute; taken
// verbatim it would tie the neighbour to the second, and the register's
// merchant tie-breaker then decides who is on top — a bottom drop could put
// the dragged row straight back above the last row ("only one row moved").
// A pick in the same minute as the row above therefore stays strictly older
// than it, and one in the same minute as the row below lifts the WHOLE group
// strictly above it. A pick in any other minute is an explicit choice and is
// honoured as is. When both clauses fire on a gap narrower than the group
// (only reachable once makeRoom has given up on it), the row-above bound wins
// and a tie below is unavoidable. `now` caps the top so the store never has
// to flatten the group into a tie at the clock.
const sameMinute = (a, b) => String(a).slice(0, 16) === String(b).slice(0, 16);
export function groupFromPick(iso, count, bounds, now) {
  const { above = null, below = null } = bounds || {};
  let top = toEpochMs(iso);
  if (below && sameMinute(iso, below)) top = Math.max(top, toEpochMs(below) + count * 1000);
  if (above && sameMinute(iso, above)) top = Math.min(top, toEpochMs(above) - 1000);
  if (now) top = Math.min(top, toEpochMs(now));
  return secondsDown(top, count);
}

// The newest row already on `day` that a landing can sit AFTER, plus the cap
// no landing may pass — both in epoch ms. On TODAY the cap is `now` (the app
// rule against future-dated rows): a row later than now is unposted and is not
// a "top" to land on, so it is ignored. Any other day is capped at its own
// last second, so a future day's rows land on that day and never back on
// today. `exclude` lists rows that must not anchor a landing — typically the
// rows being moved, so a row already sitting on the day can't anchor its own
// move. `latest` is -Infinity when the day holds no such row.
//
// Exported alongside landAfterLatest so the bulk Move-to-Date path can ask
// "is this selection already the top of the day?" against exactly the row
// landAfterLatest would have anchored on, instead of re-deriving the rule.
export function latestOnDay({ transactions, day, exclude, now }) {
  const skip = new Set(exclude || []);
  const endOfDay = toEpochMs(day + 'T23:59:59');
  const nowMs = now ? toEpochMs(now) : NaN;
  const isToday = Number.isFinite(nowMs) && nowMs >= toEpochMs(day) && nowMs <= endOfDay;
  const cap = isToday ? nowMs : endOfDay;
  let latest = -Infinity;
  for (const t of transactions) {
    if (skip.has(t.id) || String(t.date).slice(0, 10) !== day) continue;
    const ms = toEpochMs(t.date);
    if (ms > latest && ms <= cap) latest = ms;
  }
  return { latest, cap };
}

// The moments `count` rows take when they are told to land ON a day, after
// everything already there. Rows are date-DESC and order IS the date, so
// "put these on the 20th" means "on top of the 20th": one second after that
// day's newest row (latestOnDay), then two, … — ascending, so the caller hands
// them out in register order (its oldest row gets +1s, its newest +Ns) and the
// group reads the same way after the move. Returns null when nothing else sits
// on the day — there is no "top" to land on — OR when the group cannot fit
// between that newest row and the cap (the day is full up to its cap); either
// way the caller keeps whatever it did before (own time-of-day, a flat noon,
// …) rather than tying rows to one second.
//
// Shared by bulk Move to Date, a back-dated add, and a top drop in a past-day
// view; keeping it here (not in the store) keeps the register's timestamp
// policy in one pure module.
export function landAfterLatest({ transactions, day, count, exclude, now }) {
  const { latest, cap } = latestOnDay({ transactions, day, exclude, now });
  if (!Number.isFinite(latest) || latest + count * 1000 > cap) return null;
  return Array.from({ length: count }, (_, i) => fmtIsoSec(latest + (i + 1) * 1000));
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
// Returns { mode:'auto', dates } — `count` stamps, NEWEST FIRST (resolveDrop
// pairs them with the group's ids in register order) — or { mode:'picker',
// seed } to open the picker pre-filled from `seed` (the group then fans out
// from the pick via groupFromPick).
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
  // group is spread over count+1 whole-second steps up from the row below
  // (the top step absorbs the remainder), newest nearest the row above.
  const room = toEpochMs(above.date) - toEpochMs(below.date);
  const withinWindow = dayGapAbs(above.date, below.date) <= windowDays;
  if (withinWindow && room >= Math.max(MIN_ROOM_MS, (count + 1) * 1000)) {
    if (count === 1) return { mode: 'auto', dates: [midpointIso(above.date, below.date)] };
    const lo = toEpochMs(below.date);
    const step = Math.floor(room / (count + 1) / 1000) * 1000;
    return { mode: 'auto', dates: Array.from({ length: count }, (_, i) => fmtIsoSec(lo + step * (count - i))) };
  }
  // Open the picker. With room but a span wider than the window, seed the
  // midpoint — a single row then sorts strictly between them on a blind
  // confirm. With less room than the group needs there is no such moment
  // (resolveDrop reaches this only after makeRoom could not respread the day):
  // seed the upper neighbour as a starting point; groupFromPick keeps a blind
  // confirm inside the gap wherever the gap has room for it.
  const seed = room >= MIN_ROOM_MS ? midpointIso(above.date, below.date) : above.date;
  return { mode: 'picker', seed };
}

// Make room in a gap that has no whole second to land on. Rows entered or
// imported together sit TIED at the same minute, so "between these two" names
// no instant — but the register only shows the day, so seconds within it are
// ours to assign. The tight neighbourhood around the gap (starting with the
// two neighbours, widening a row at a time, never past the day's edges or
// now) is respread evenly across the seconds available between the adjacent
// rows outside the run, the dragged group inserted at the drop, display order
// kept. When the two neighbours share a minute, that minute is tried first so
// tied rows keep the minute they had where it has room; otherwise they may
// leave it. The nudged neighbours are re-stamped in the same batch (flagged
// so they carry no "Edited" mark — the user did not edit them). Returns the
// respread run split around the drop — { above, below } (the nudged ids, in
// display order) and `dates`, newest-first for `above` ++ the moving group ++
// `below` — or null when no room can be made inside the day (rows never change
// day) — the caller then asks.
//
//   order     — rendered ids WITHOUT the moving group, date-DESC.
//   insertIdx — index in `order` the group lands before (the row below).
function makeRoom({ order, rowDate, insertIdx, count, now }) {
  if (insertIdx <= 0 || insertIdx >= order.length) return null;
  const at = i => toEpochMs(rowDate(order[i]));
  const dayOf = i => String(rowDate(order[i])).slice(0, 10);
  const day = dayOf(insertIdx - 1);
  if (dayOf(insertIdx) !== day) return null;
  // Is there another row of this same day just outside the run? It answers
  // both questions asked below: where the run's bounds are, and whether the
  // run can still widen that way.
  const onDay = i => i >= 0 && i < order.length && dayOf(i) === day;
  const dayStart = toEpochMs(day);
  const dayEnd = toEpochMs(day + 'T23:59:59');
  const cap = Math.min(dayEnd, toEpochMs(now) || dayEnd);
  // The minute the two neighbours share, if they share one (epoch ms, else
  // null): tried first, so tied rows keep the minute they had.
  const aboveDate = rowDate(order[insertIdx - 1]);
  const tiedMinute = sameMinute(aboveDate, rowDate(order[insertIdx])) ? toEpochMs(String(aboveDate).slice(0, 16)) : null;

  // `runLen` existing rows plus the moving group, evenly spaced on whole
  // seconds strictly inside [lo, hi]; null when they don't all fit.
  const spread = (runLen, lo, hi) => {
    const n = runLen + count;
    if (hi - lo < (n + 1) * 1000) return null;
    const step = Math.floor((hi - lo) / (n + 1) / 1000) * 1000;
    return Array.from({ length: n }, (_, i) => fmtIsoSec(lo + step * (n - i)));
  };
  let hiIdx = insertIdx - 1, loIdx = insertIdx;
  for (;;) {
    const canUp = onDay(hiIdx - 1);
    const canDown = onDay(loIdx + 1);
    // Inclusive bounds: one second inside the adjacent row on either side, or
    // the day's edge when there is none on this day — and never past now.
    const lo = canDown ? at(loIdx + 1) + 1000 : dayStart;
    const hi = canUp ? Math.min(cap, at(hiIdx - 1) - 1000) : cap;
    const runLen = loIdx - hiIdx + 1;
    // The tied minute is only on offer on the first pass, where the run IS the
    // two neighbours; once widened, the run spans rows outside that minute.
    const firstPass = runLen === 2;
    let dates = null;
    if (firstPass && tiedMinute !== null) dates = spread(runLen, Math.max(lo, tiedMinute), Math.min(hi, tiedMinute + 59000));
    if (!dates) dates = spread(runLen, lo, hi);
    if (dates) return { above: order.slice(hiIdx, insertIdx), below: order.slice(insertIdx, loIdx + 1), dates };
    // Widen towards whichever neighbour is nearer in time; stop at the day's edges.
    if (!canUp && !canDown) return null;
    if (canUp && (!canDown || at(hiIdx - 1) - at(hiIdx) <= at(loIdx) - at(loIdx + 1))) hiIdx -= 1;
    else loIdx += 1;
  }
}

// Turn a drop gesture into a plan. Kept pure (no DOM, no store) so the hook is
// just event plumbing over it and the neighbour math is unit-tested.
//
//   ids       — rendered row ids, date-DESC.
//   rowDate   — id -> that row's timestamp string.
//   dragIds   — the rows being moved: the dragged row alone, or the whole
//               selection when the dragged row is part of it. Any order.
//   beforeId  — the row the insertion line sits ABOVE, or null for the very end.
//   now       — wall clock, seconds ISO (see planDrop).
//   windowDays — forwarded to planDrop.
//   nowInView — forwarded to planDrop; governs a top drop's anchor (see above).
//
// Returns null when the drop would leave the register in the order it already
// has (dropped onto a member, or back into its own gap) or when the target row
// is no longer in the list, else the planDrop result tagged with the group's
// `ids` in register order — so `dates[i]` (newest first) belongs to `ids[i]`.
// A gap too tight for the group is first widened by respreading its tied
// neighbourhood (makeRoom), in which case `ids` also carries the nudged
// neighbours and `nudged` lists them. A picker plan also carries `bounds`,
// the gap's neighbour dates, for groupFromPick to keep the pick inside the
// gap.
export function resolveDrop({ ids, rowDate, dragIds, beforeId, now, windowDays, nowInView }) {
  const moving = new Set(dragIds);
  const group = ids.filter(id => moving.has(id));
  if (group.length === 0 || (beforeId != null && moving.has(beforeId))) return null;

  const order = ids.filter(id => !moving.has(id));
  const insertIdx = beforeId == null ? order.length : order.indexOf(beforeId);
  if (insertIdx < 0) return null;   // the target vanished between hover and drop
  // The register after the drop; if that is the register as it stands, the
  // gesture changes nothing (this covers "back into its own gap" for a single
  // row AND a contiguous group; a scattered group always gathers, so it moves).
  const next = [...order.slice(0, insertIdx), ...group, ...order.slice(insertIdx)];
  if (next.every((id, i) => id === ids[i])) return null;

  const aboveId = insertIdx > 0 ? order[insertIdx - 1] : null;
  const above = aboveId ? { id: aboveId, date: rowDate(aboveId) } : null;
  const below = beforeId != null ? { id: beforeId, date: rowDate(beforeId) } : null;
  const plan = planDrop({ above, below, now, windowDays, nowInView, count: group.length });
  if (plan.mode === 'picker') {
    // Between two neighbours with no room: make some before asking. (Wider
    // than the window is a different refusal — a real gap needs a real date.)
    const tight = above && below && toEpochMs(above.date) - toEpochMs(below.date) < Math.max(MIN_ROOM_MS, (group.length + 1) * 1000);
    const room = tight ? makeRoom({ order, rowDate, insertIdx, count: group.length, now }) : null;
    if (room) {
      return {
        ids: [...room.above, ...group, ...room.below],
        mode: 'auto', dates: room.dates, nudged: [...room.above, ...room.below],
      };
    }
    return { ids: group, ...plan, bounds: { above: above ? above.date : null, below: below ? below.date : null } };
  }
  return { ids: group, ...plan };
}
