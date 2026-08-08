// Envelope math: per-category monthly assignments with YNAB-faithful carryover.
// One fold from the earliest data month to the viewed month. Pure — no React.
import { hasOccurred, txBudgetImpact } from './calc.js';
import { addMonths } from './dates.js';

export function assignedFor(store, catId, month) {
  const a = (store.assignments || []).find(x => x.category === catId && x.month === month);
  return a ? a.amount : 0;
}

const monthOf = t => String(t.date || '').slice(0, 7);

// Earliest month that matters: first assignment or first counted transaction.
function earliestMonth(store, viewed) {
  let m = viewed;
  (store.assignments || []).forEach(a => { if (a.month < m) m = a.month; });
  (store.transactions || []).forEach(t => { const tm = monthOf(t); if (tm && tm < m) m = tm; });
  return m;
}

export function envelopeFor(store, month, now) {
  const cats = (store.categories || []).filter(c => c.type === 'expense' && c.status === 'active');
  const catIds = new Set(cats.map(c => c.id));

  // Bucket by month once: activity per cat, income total.
  const activityByMonth = new Map(); // month -> Map(cat -> signed activity)
  const incomeByMonth = new Map();
  (store.transactions || []).forEach(t => {
    if (t.status === 'pending' || !hasOccurred(t, now)) return;
    const m = monthOf(t);
    if (!m) return;
    if (t.type === 'income') { incomeByMonth.set(m, (incomeByMonth.get(m) || 0) + t.amount); return; }
    if (!t.category || !catIds.has(t.category)) return;
    const impact = txBudgetImpact(store, t, { includeExcluded: true });
    if (!impact) return;
    let byCat = activityByMonth.get(m);
    if (!byCat) { byCat = new Map(); activityByMonth.set(m, byCat); }
    byCat.set(t.category, (byCat.get(t.category) || 0) - impact); // spending is negative activity
  });
  const assignedBy = new Map(); // month -> Map(cat -> amount)
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
  let income = 0, assignedTotal = 0;
  let m = earliestMonth(store, month);
  for (let guard = 0; guard < 600; guard++) {
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
    rta = rta + monthIncome - monthAssigned - prevOverspend;
    if (m === month) { income = monthIncome; assignedTotal = monthAssigned; break; }
    prevOverspend = overspend;
    avail = next;
    m = addMonths(m, 1);
  }

  const groupTotals = new Map();
  cats.forEach(c => {
    const key = c.groupId || 'other';
    const r = rows.get(c.id);
    const g = groupTotals.get(key) || { assigned: 0, activity: 0, available: 0 };
    g.assigned += r.assigned; g.activity += r.activity; g.available += r.available;
    groupTotals.set(key, g);
  });
  return { rows, groupTotals, rta, income, assignedTotal };
}
