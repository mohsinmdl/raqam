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

export function envelopeFor(store, month, now) {
  const cats = (store.categories || []).filter(c => c.type === 'expense');
  const catIds = new Set(cats.map(c => c.id));

  const openingSnapshots = earliestOpeningSnapshots(store);
  const openingByMonth = new Map(); // month -> total opening balance seeded that month
  openingSnapshots.forEach(s => { openingByMonth.set(s.month, (openingByMonth.get(s.month) || 0) + s.amount); });

  // Bucket by month once: per-category activity, income total, and the two
  // kinds of outflow that never had an envelope to absorb them at all —
  // uncategorized/unknown-category expenses and transfer fees. Both come
  // straight off Ready to Assign rather than through a category's activity.
  // cardAdjustment is deliberately excluded from all three buckets: it moves
  // card liability, not cash, so it never touches envelope money or RTA.
  const activityByMonth = new Map();      // month -> Map(cat -> signed activity)
  const incomeByMonth = new Map();
  const uncategorizedByMonth = new Map(); // month -> amount that reduces RTA directly
  (store.transactions || []).forEach(t => {
    if (t.status === 'pending') return;
    const m = monthOf(t);
    if (!m) return; // a dateless row is skipped before hasOccurred ever gets to parse its date
    if (!hasOccurred(t, now)) return;

    if (t.type === 'income') {
      incomeByMonth.set(m, (incomeByMonth.get(m) || 0) + t.amount);
      return;
    }
    if (t.type === 'transfer') {
      const fee = txBudgetImpact(store, t, { includeExcluded: true }); // transfers have no category; this is just the fee
      if (fee) uncategorizedByMonth.set(m, (uncategorizedByMonth.get(m) || 0) + fee);
      return;
    }
    if (t.type !== 'expense' && t.type !== 'refund') return; // adjustment/cardAdjustment: not envelope money

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
  let income = 0, assignedTotal = 0, uncategorized = 0, openingTotal = 0;
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
    rta = rta + monthIncome + monthOpening - monthAssigned - monthUncategorized - prevOverspend;
    if (m === month) {
      income = monthIncome; assignedTotal = monthAssigned;
      uncategorized = monthUncategorized; openingTotal = monthOpening;
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
  return { rows, groupTotals, rta, income, assignedTotal, uncategorized, openingTotal };
}
