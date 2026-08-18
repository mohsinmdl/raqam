// Envelope math: per-category monthly assignments with YNAB-faithful carryover.
// One fold from the earliest data month (transactions, assignments, or the
// earliest confirmed opening snapshot) to the viewed month. Pure — no React.
//
// The fold runs over EVERY expense category regardless of status (active,
// archived, ...): an archived category's historical "assigned" still reduced
// Ready to Assign when it was assigned, and dropping it from the math the
// moment a category is archived would silently inflate RTA. `rows` may
// therefore include archived categories — filtering the display down to
// "active only" is the plan screen's job, not this module's.
//
// Opening snapshots vs. pre-seed activity: an account's earliest CONFIRMED
// snapshot is dropped into RTA/openingTotal as a lump sum in its month — it
// stands in for every transaction that moved that account's money before the
// snapshot was taken. Bucketing those same pre-snapshot transactions as flows
// too would double-count them (once as the flow, once embedded in the balance),
// so any transaction dated before its account's seed month is skipped entirely
// — not folded into a category's activity, not folded into RTA (as uncategorized
// or as an adjustment) — consistently, wherever an accountId is available.
// Card-funded rows (cardId,
// no accountId) have no seed month to compare against and are never skipped.
// Accounts with no confirmed snapshot are never skipped either.
import { hasOccurred, txBudgetImpact } from './calc.js';
import { addMonths } from './dates.js';

const isMonth = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
const monthOf = t => String(t.date || '').slice(0, 7);

// Last (category, month) match wins — mirrors the fold below, which walks
// assignments in array order and overwrites same-key rows via Map.set. A
// first-match read here would disagree with the fold whenever a category was
// re-assigned twice for the same month.
export function assignedFor(store, catId, month) {
  const list = store.assignments || [];
  let amount = 0, found = false;
  for (const a of list) {
    if (a.category === catId && a.month === month) { amount = a.amount; found = true; }
  }
  return found ? amount : 0;
}

// Earliest CONFIRMED snapshot per account, regardless of the account's own
// status (open/closed/archived — I4 seeds RTA from history, not from what's
// still active today). Later confirmed snapshots for the same account
// restate the same money and must not be added again.
function earliestOpeningSnapshots(store) {
  const byAccount = new Map();
  (store.snapshots || []).forEach(s => {
    if (s.status !== 'confirmed' || !isMonth(s.month)) return;
    const cur = byAccount.get(s.accountId);
    if (!cur || s.month < cur.month) byAccount.set(s.accountId, s);
  });
  return byAccount;
}

// Earliest month that matters: first assignment, first counted transaction,
// or the earliest opening-balance snapshot — whichever is soonest. Rows with
// an unparseable month are skipped rather than allowed to poison the string
// comparison (a malformed date must never masquerade as "earlier than
// everything"). The result is also clamped to at most 600 months before the
// viewed month, so a corrupt or runaway history can never make the fold
// below loop unboundedly.
function earliestMonth(store, viewed, openingSnapshots) {
  let m = viewed;
  (store.assignments || []).forEach(a => { if (isMonth(a.month) && a.month < m) m = a.month; });
  (store.transactions || []).forEach(t => { const tm = monthOf(t); if (isMonth(tm) && tm < m) m = tm; });
  openingSnapshots.forEach(s => { if (s.month < m) m = s.month; });
  const floor = addMonths(viewed, -600);
  return m < floor ? floor : m;
}

// The transactions that make up ONE category's activity for a month, and their
// signed total (negative = spending). Same predicate as the fold below, so the
// Activity popover can never disagree with the ACTIVITY cell: not
// pending, occurred, expense/refund, category match, and NOT dated before the
// account's opening-snapshot seed month. Amount is txBudgetImpact, not t.amount.
export function categoryActivityRows(store, catId, month, now) {
  // The single-category case — the drill-down behind one ACTIVITY cell.
  return categoryActivityRowsFor(store, [catId], month, now);
}

// The transactions behind one OR MORE categories' activity for a month (a single
// category cell, or a group total's whole category set), newest first, with their
// signed total. Same predicate as categoryActivityRows above, applied to the set:
// only expense categories fold into activity, so any non-expense or dangling id
// is dropped — the rows/total then match the ACTIVITY figure that opened the
// popover (a group total is the sum of its categories' activity).
export function categoryActivityRowsFor(store, catIds, month, now) {
  const wanted = new Set(catIds);
  const expense = new Set((store.categories || [])
    .filter(c => c.type === 'expense' && wanted.has(c.id)).map(c => c.id));
  if (expense.size === 0) return { rows: [], total: 0 };
  const seed = earliestOpeningSnapshots(store); // accountId -> earliest confirmed snapshot
  const seededAfter = (accountId, m) => { const s = seed.get(accountId); return !!s && s.month > m; };
  const out = [];
  let total = 0;
  (store.transactions || []).forEach(t => {
    if (t.status === 'pending') return;
    if (monthOf(t) !== month) return;
    if (!hasOccurred(t, now)) return;
    if (t.type !== 'expense' && t.type !== 'refund') return;
    if (!expense.has(t.category)) return;
    if (seededAfter(t.accountId, month)) return;
    const impact = txBudgetImpact(store, t, { includeExcluded: true });
    if (!impact) return;
    out.push({ t, impact: -impact }); // spending is negative activity, matching the fold
    total -= impact;
  });
  out.sort((a, b) => (a.t.date < b.t.date ? 1 : a.t.date > b.t.date ? -1 : 0));
  return { rows: out, total };
}

export function envelopeFor(store, month, now) {
  const cats = (store.categories || []).filter(c => c.type === 'expense');
  const catIds = new Set(cats.map(c => c.id));

  const openingSnapshots = earliestOpeningSnapshots(store);
  const openingByMonth = new Map(); // month -> total opening balance seeded that month
  openingSnapshots.forEach(s => { openingByMonth.set(s.month, (openingByMonth.get(s.month) || 0) + s.amount); });

  // accountId -> earliest confirmed snapshot month. A transaction dated before
  // its account's seed month is already embedded in that lump-sum balance —
  // see the module comment above.
  const seedMonthByAccount = new Map();
  openingSnapshots.forEach((s, accountId) => seedMonthByAccount.set(accountId, s.month));
  const seededAfter = (accountId, m) => {
    const seed = seedMonthByAccount.get(accountId);
    return !!seed && seed > m;
  };

  // Bucket by month once: per-category activity, income total, the two kinds of
  // outflow that never had an envelope to absorb them at all (uncategorized/
  // unknown-category expenses and transfer fees), and signed cash adjustments.
  // All three of the latter come straight off (or onto) Ready to Assign rather
  // than through a category's activity. cardAdjustment is deliberately excluded
  // from every bucket: it moves card liability, not cash, so it never touches
  // envelope money or RTA.
  const activityByMonth = new Map();      // month -> Map(cat -> signed activity)
  const incomeByMonth = new Map();
  const uncategorizedByMonth = new Map(); // month -> amount that reduces RTA directly
  const adjustmentByMonth = new Map();    // month -> signed cash adjustment that moves RTA (+found / −lost)
  (store.transactions || []).forEach(t => {
    if (t.status === 'pending') return;
    const m = monthOf(t);
    if (!m) return; // a dateless row is skipped before hasOccurred ever gets to parse its date
    if (!hasOccurred(t, now)) return;

    if (t.type === 'income') {
      if (seededAfter(t.accountId, m)) return; // already inside the opening balance
      incomeByMonth.set(m, (incomeByMonth.get(m) || 0) + t.amount);
      return;
    }
    if (t.type === 'transfer') {
      if (seededAfter(t.accountId, m)) return; // fee is scoped to the SOURCE account's seed
      const fee = txBudgetImpact(store, t, { includeExcluded: true }); // transfers have no category; this is just the fee
      if (fee) uncategorizedByMonth.set(m, (uncategorizedByMonth.get(m) || 0) + fee);
      return;
    }
    if (t.type === 'adjustment') {
      // A cash balance adjustment moves real money into or out of an account with
      // no envelope to absorb it, so it comes straight off (or onto) Ready to
      // Assign — exactly like income (+) or an uncategorized outflow (−). amount is
      // signed: +found money raises RTA, −lost/closed money lowers it. This is what
      // keeps RTA tied to the real bank balance through reconciles and account
      // closes; without it a closed account's opening lingered in RTA as phantom.
      // (cardAdjustment is NOT cash — it moves card liability — and is excluded below.)
      if (seededAfter(t.accountId, m)) return; // already inside the opening balance
      adjustmentByMonth.set(m, (adjustmentByMonth.get(m) || 0) + t.amount); // signed: +raises RTA, −lowers it
      return;
    }
    if (t.type !== 'expense' && t.type !== 'refund') return; // cardAdjustment etc.: not cash/envelope money
    // Card-funded rows carry cardId, not accountId — seededAfter(undefined, m)
    // is always false, so they are never skipped here.
    if (seededAfter(t.accountId, m)) return;

    const known = t.category && catIds.has(t.category);
    if (!known) {
      // An expense with no category (or a dangling/unknown id) never had an
      // envelope either — it comes straight off RTA. A refund with no
      // category has nothing to reverse, so it's simply ignored.
      if (t.type === 'expense') {
        const impact = txBudgetImpact(store, t, { includeExcluded: true });
        if (impact) uncategorizedByMonth.set(m, (uncategorizedByMonth.get(m) || 0) + impact);
      }
      return;
    }

    // includeExcluded:true is deliberate — excluded (recoverable/advance)
    // categories still need to show their gross activity on the plan table.
    const impact = txBudgetImpact(store, t, { includeExcluded: true });
    if (!impact) return;
    let byCat = activityByMonth.get(m);
    if (!byCat) { byCat = new Map(); activityByMonth.set(m, byCat); }
    byCat.set(t.category, (byCat.get(t.category) || 0) - impact); // spending is negative activity
  });
  const assignedBy = new Map(); // month -> Map(cat -> amount); last assignment per (cat, month) wins
  (store.assignments || []).forEach(a => {
    if (!catIds.has(a.category)) return;
    let byCat = assignedBy.get(a.month);
    if (!byCat) { byCat = new Map(); assignedBy.set(a.month, byCat); }
    byCat.set(a.category, a.amount);
  });

  // Fold months.
  let avail = new Map();        // cat -> available at end of previous month
  let rta = 0;
  let prevOverspend = 0;
  let rows = new Map();
  let income = 0, assignedTotal = 0, uncategorized = 0, openingTotal = 0, adjustments = 0;
  let m = earliestMonth(store, month, openingSnapshots);
  let reached = false;
  const MAX_STEPS = 601; // the clamp in earliestMonth guarantees this is always enough
  for (let guard = 0; guard <= MAX_STEPS; guard++) {
    const act = activityByMonth.get(m) || new Map();
    const asg = assignedBy.get(m) || new Map();
    const next = new Map();
    rows = new Map();
    let overspend = 0;
    let monthAssigned = 0;
    cats.forEach(c => {
      const carryIn = Math.max(0, avail.get(c.id) || 0);
      const assigned = asg.get(c.id) || 0;
      const activity = act.get(c.id) || 0;
      const available = carryIn + assigned + activity;
      next.set(c.id, available);
      rows.set(c.id, { assigned, activity, available, carryIn });
      if (available < 0) overspend += -available;
      monthAssigned += assigned;
    });
    const monthIncome = incomeByMonth.get(m) || 0;
    const monthOpening = openingByMonth.get(m) || 0;
    const monthUncategorized = uncategorizedByMonth.get(m) || 0;
    const monthAdjustment = adjustmentByMonth.get(m) || 0;
    rta = rta + monthIncome + monthOpening + monthAdjustment - monthAssigned - monthUncategorized - prevOverspend;
    if (m === month) {
      income = monthIncome; assignedTotal = monthAssigned;
      uncategorized = monthUncategorized; openingTotal = monthOpening;
      adjustments = monthAdjustment;
      reached = true;
      break;
    }
    prevOverspend = overspend;
    avail = next;
    m = addMonths(m, 1);
  }
  // Should be unreachable given the earliestMonth clamp above — a defensive
  // guard against ever handing back a partial/wrong-month fold silently.
  if (!reached) throw new Error(`envelopeFor: fold did not reach viewed month ${month}`);

  const groupTotals = new Map();
  cats.forEach(c => {
    const key = c.groupId || 'other';
    const r = rows.get(c.id);
    const g = groupTotals.get(key) || { assigned: 0, activity: 0, available: 0 };
    g.assigned += r.assigned; g.activity += r.activity; g.available += r.available;
    groupTotals.set(key, g);
  });
  return { rows, groupTotals, rta, income, assignedTotal, uncategorized, openingTotal, adjustments };
}
