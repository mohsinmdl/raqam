// Shared transaction-row and account-freshness presenters, ported from the
// prototype's txRowOf (script 894-927) and freshInfo (928-933).
import { accountDelta, dayLabel, daysAgo, daysUntil, lastActivity, relTime, timeLabel } from './calc.js';
import { nowIso } from './dates.js';
import { ruleDueLabel, ruleFromTx, scheduledRules, sourceLabel } from './schedule.js';

// fmt = { money, moneyS } from useMoney(). forAccountId flips amounts to the
// perspective of one account (account-detail activity list).
export function txRowOf(t, S, fmt, forAccountId) {
  const cat = t.category ? S.categories.find(c => c.id === t.category) : null;
  const acc = t.accountId ? S.accounts.find(a => a.id === t.accountId) : null;
  const card = t.cardId ? S.cards.find(c => c.id === t.cardId) : null;
  const toAcc = t.toAccountId ? S.accounts.find(a => a.id === t.toAccountId) : null;
  const toCard = t.toCardId ? S.cards.find(c => c.id === t.toCardId) : null;
  let chip = null, chipBg = 'var(--elev)', chipFg = 'var(--muted)';
  // A card payment is a transfer to a card, so both carry the transfer glyph
  // and the same tint — they are one family, not two.
  let chipIcon = null;
  if (t.type === 'transfer') {
    chip = t.isCardPayment ? 'Card payment' : 'Transfer';
    chipBg = 'var(--info-soft)'; chipFg = 'var(--info)'; chipIcon = 'transfer';
  }
  else if (t.type === 'refund') { chip = 'Refund'; chipBg = 'var(--info-soft)'; chipFg = 'var(--info)'; }
  else if (t.type === 'adjustment') { chip = 'Adjustment'; chipBg = 'var(--warn-soft)'; chipFg = 'var(--warn)'; }
  else if (t.type === 'cardAdjustment') { chip = 'Card correction'; chipBg = 'var(--warn-soft)'; chipFg = 'var(--warn)'; }
  let amtLabel, amtColor;
  if (forAccountId) {
    const d = t.status === 'pending' ? (t.accountId === forAccountId ? -t.amount : t.amount) : accountDelta(t, forAccountId);
    amtLabel = fmt.moneyS(d); amtColor = t.type === 'transfer' ? 'var(--muted)' : d > 0 ? 'var(--pos)' : 'var(--text)';
  } else if (t.type === 'expense') { amtLabel = fmt.money(-t.amount); amtColor = 'var(--text)'; }
  else if (t.type === 'income' || t.type === 'refund') { amtLabel = fmt.moneyS(t.amount); amtColor = 'var(--pos)'; }
  else if (t.type === 'transfer') { amtLabel = fmt.money(t.amount); amtColor = 'var(--muted)'; }
  else { amtLabel = fmt.moneyS(t.amount); amtColor = t.amount >= 0 ? 'var(--pos)' : 'var(--text)'; }
  let acctLabel = '—';
  if (t.type === 'transfer') acctLabel = (acc ? acc.nickname : '?') + ' → ' + (toCard ? toCard.nickname + ' ••' + toCard.last4 : toAcc ? toAcc.nickname : '?');
  else if (card) acctLabel = card.nickname + ' ••' + card.last4;
  else if (acc) acctLabel = acc.nickname;
  return {
    id: t.id, dateLabel: dayLabel(t.date), timeLabel: timeLabel(t.date),
    merchant: t.merchant || (t.type === 'transfer' ? 'Own-account transfer' : '—'), notes: t.notes || '', hasNotes: !!t.notes,
    hasChip: !!chip, chip, chipBg, chipFg, chipIcon,
    // The other end of a transfer, from THIS account's point of view. acctLabel
    // is always source → destination and never flips, so it can't answer
    // "where did this come from" on the receiving account's page.
    transferOther: t.type === 'transfer' && forAccountId
      ? (t.accountId === forAccountId
        ? { dir: 'to', name: toCard ? toCard.nickname + ' ••' + toCard.last4 : (toAcc ? toAcc.nickname : '?') }
        : { dir: 'from', name: acc ? acc.nickname : '?' })
      : null,
    // Belongs to a recurring rule — including the transaction that seeded it.
    isRepeating: !!ruleFromTx(S, t.id),
    catName: cat ? cat.name : (t.type === 'transfer' ? 'Transfer' : '—'), catColor: cat ? cat.color : 'var(--border)',
    acctLabel, amtLabel, amtColor,
    stLabel: t.status === 'pending' ? 'Pending' : 'Cleared', stBg: t.status === 'pending' ? 'var(--warn-soft)' : 'var(--elev)', stFg: t.status === 'pending' ? 'var(--warn)' : 'var(--muted)',
    rowOpacity: t.status === 'pending' ? '.62' : '1', isPending: t.status === 'pending',
    canEdit: t.type !== 'cardAdjustment',
    // Only money in/out can become a series — transfers and adjustments cannot.
    canRepeat: t.type === 'expense' || t.type === 'income',
    edited: !!t.editedAt,
    editedLabel: t.editedAt ? 'Edited ' + relTime(t.editedAt) + (t.editCount > 1 ? ' · ' + t.editCount + ' edits' : '') : '',
    // Recoverable-spending indicator — the money moved, it just isn't budget spending.
    excluded: (t.type === 'expense' || t.type === 'refund') && !!(cat && cat.excludeFromBudget),
    excludedLabel: 'Excluded from budgets',
  };
}

// A recurring rule presented as a table row, deliberately field-for-field
// compatible with txRowOf so the Scheduled group reuses the same cells instead
// of forking the table. The Dashboard's rule shape ({id, name, when, amt}) is
// too thin for this — it would leave category, account and status blank.
//
// The row key is namespaced ('rule:…') because rule ids and transaction ids come
// from different tables and are only unique within their own. Rules carry no
// checkbox, so this key never reaches the selection Set — the namespace is a
// guard against a later change quietly making it possible.
export function ruleRowOf(r, S, fmt, now) {
  const cat = r.category ? S.categories.find(c => c.id === r.category) : null;
  const overdue = daysUntil(r.nextDate, now) < 0;
  return {
    key: 'rule:' + r.id, ruleId: r.id, isRule: true, isOverdue: overdue, sortKey: r.nextDate,
    dateLabel: dayLabel(r.nextDate), timeLabel: ruleDueLabel(r, now),
    merchant: r.name, notes: '', hasNotes: false,
    hasChip: false, chip: null, chipBg: '', chipFg: '', chipIcon: null, transferOther: null,
    isRepeating: true,
    catName: cat ? cat.name : '—', catColor: cat ? cat.color : 'var(--border)',
    acctLabel: sourceLabel(S, r),
    // Estimated amounts keep the ~ they carry on the Recurring screen: this is
    // a forecast, and rounding it into a hard figure would be a small lie.
    amtLabel: (r.estimated ? '~' : '') + fmt.money(r.type === 'income' ? r.amount : -r.amount),
    amtColor: r.type === 'income' ? 'var(--pos)' : 'var(--text)',
    stLabel: overdue ? 'Overdue' : 'Scheduled',
    stBg: overdue ? 'var(--neg-soft)' : 'var(--info-soft)',
    stFg: overdue ? 'var(--neg)' : 'var(--info)',
    rowOpacity: '1', isPending: false, canEdit: false, canRepeat: false,
    edited: false, editedLabel: '', excluded: false, excludedLabel: '',
  };
}

// The two groups the transactions table renders, from one filtered list.
//
// A transaction dated ahead of `now` has not happened yet, so it moves out of
// the posted rows entirely rather than being greyed out — money that has not
// left yet should not read as money spent. Recurring rules join it, giving one
// forward-looking group ordered soonest-first, which puts anything overdue at
// the top.
//
// anyFilter suppresses the rules: a rule has no status, type or merchant, so it
// cannot honour "Pending" or a search term, and showing rows that contradict an
// active filter is worse than briefly hiding them. Future-dated transactions are
// real rows and stay filtered like any other.
export function txGroups(list, S, fmt, now, range, anyFilter) {
  const futureTx = list.filter(t => t.date > now);
  const postedTx = list.filter(t => t.date <= now);
  const ruleRows = anyFilter ? [] : scheduledRules(S, range.from, range.to, now).map(r => ruleRowOf(r, S, fmt, now));
  const scheduled = ruleRows
    .map(row => ({ row, at: row.sortKey }))
    .concat(futureTx.map(t => ({ row: txRowOf(t, S, fmt), at: t.date, selId: t.id })))
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    scheduled, futureTx, postedTx,
    postedRows: postedTx.map(t => txRowOf(t, S, fmt)),
    overdueCount: scheduled.filter(x => x.row.isOverdue).length,
  };
}

export function freshInfo(acc, S) {
  const days = daysAgo(lastActivity(acc, S), nowIso());
  if (days <= 3) return { dot: 'var(--pos)', label: 'Up to date', tip: 'Activity recorded in the last 3 days' };
  if (days <= 14) return { dot: 'var(--warn)', label: days + ' days ago', tip: 'Last activity ' + days + ' days ago' };
  return { dot: 'var(--neg)', label: days + ' days ago', tip: 'No activity for ' + days + ' days — consider confirming the balance' };
}

export function instName(S, id) {
  const i = S.institutions.find(x => x.id === id);
  return i ? i.name : '—';
}

// Setup progress for first-use. Unlike the prototype (which checked the frozen current
// month), "confirmed" means ANY confirmed snapshot — otherwise a month rollover would
// resurrect the onboarding screen for an established user.
export function setupState(S) {
  const hasAccount = S.accounts.some(a => a.status === 'active');
  const snapConfirmed = S.snapshots.some(s => s.status === 'confirmed');
  const hasTx = S.transactions.length > 0;
  const hasCard = S.cards.length > 0;
  return { hasAccount, snapConfirmed, hasTx, hasCard, complete: hasAccount && snapConfirmed && hasTx };
}
