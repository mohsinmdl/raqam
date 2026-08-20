// Shared transaction-row and account-freshness presenters, ported from the
// prototype's txRowOf (script 894-927) and freshInfo (928-933).
import { accountDelta, dayLabel, daysAgo, daysUntil, hasOccurred, lastActivity, relTime, timeLabel } from './calc.js';
import { nowIso } from './dates.js';
import { effectiveNextDate, ruleDueLabel, ruleFromTx, scheduledRules, sourceLabel } from './schedule.js';
import { scheduledSort, sortRows } from './sortRows.js';

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
  // amtValue is the number this cell shows, with its sign — assigned in the
  // same branch that picks the label so the two can never disagree, which is
  // what keeps a sorted Amount column reading monotonically. Note the schema
  // stores an unsigned magnitude and puts direction in `type`
  // (check: type in ('adjustment','cardAdjustment') or amount >= 0), so sorting
  // on t.amount directly would be wrong.
  let amtLabel, amtColor, amtValue;
  if (forAccountId) {
    const d = t.status === 'pending' ? (t.accountId === forAccountId ? -t.amount : t.amount) : accountDelta(t, forAccountId);
    amtLabel = fmt.moneyS(d); amtColor = t.type === 'transfer' ? 'var(--muted)' : d > 0 ? 'var(--pos)' : 'var(--text)'; amtValue = d;
  } else if (t.type === 'expense') { amtLabel = fmt.money(-t.amount); amtColor = 'var(--text)'; amtValue = -t.amount; }
  else if (t.type === 'income' || t.type === 'refund') { amtLabel = fmt.moneyS(t.amount); amtColor = 'var(--pos)'; amtValue = t.amount; }
  else if (t.type === 'transfer') { amtLabel = fmt.money(t.amount); amtColor = 'var(--muted)'; amtValue = t.amount; }
  else { amtLabel = fmt.moneyS(t.amount); amtColor = t.amount >= 0 ? 'var(--pos)' : 'var(--text)'; amtValue = t.amount; }
  // Outflow/Inflow pair (YNAB columns). Derived from the SAME branch results
  // as amtValue so the two presentations can never disagree: money leaving is
  // outflow, money arriving is inflow, and a transfer in the all-accounts view
  // sits on the outflow side (it left the source account; acctLabel already
  // names the destination). Unpopulated side is null so sorting sinks blanks.
  let outflowValue = null, inflowValue = null;
  if (forAccountId) {
    if (amtValue < 0) outflowValue = -amtValue; else if (amtValue > 0) inflowValue = amtValue;
  } else if (t.type === 'transfer') outflowValue = t.amount;
  else if (amtValue < 0) outflowValue = -amtValue;
  else inflowValue = amtValue;
  let acctLabel = '—';
  // acctFrom/acctTo split the transfer pair apart for consumers that must
  // truncate direction-aware (the register's account cell): acctLabel alone
  // truncates end-first under an ellipsis, which hides the destination —
  // the more important half ("where did the money go"). Only set for
  // transfers; other types keep acctFrom/acctTo null and render acctLabel.
  let acctFrom = null, acctTo = null;
  if (t.type === 'transfer') {
    acctFrom = acc ? acc.nickname : '?';
    acctTo = toCard ? toCard.nickname + ' ••' + toCard.last4 : toAcc ? toAcc.nickname : '?';
    acctLabel = acctFrom + ' → ' + acctTo;
  }
  else if (card) acctLabel = card.nickname + ' ••' + card.last4;
  else if (acc) acctLabel = acc.nickname;
  return {
    id: t.id, dateLabel: dayLabel(t.date), dayKey: t.date.slice(0, 10), timeLabel: timeLabel(t.date),
    // Sort keys: the full timestamp (never the truncated display) and a unique
    // id, so the tie-break chain always terminates.
    sortAt: t.date, sortId: t.id,
    // Memo = the adjustment's reason and/or the free-text note, joined. An
    // adjustment stores its explanation in adjustmentReason (never notes) —
    // showing only notes left those rows blank in the ledger.
    merchant: t.merchant || (t.type === 'transfer' ? 'Own-account transfer' : '—'),
    notes: [t.adjustmentReason, t.notes].filter(Boolean).join(' · '), hasNotes: !!(t.adjustmentReason || t.notes),
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
    catName: cat ? cat.name : (t.type === 'transfer' ? 'Transfer' : '—'),
    // Category is optional at entry; categorizable types without one surface a
    // "This needs a category" pill wherever the category cell renders.
    needsCategory: !cat && (t.type === 'expense' || t.type === 'income' || t.type === 'refund'),
    acctLabel, acctFrom, acctTo, amtLabel, amtColor, amtValue,
    outflowValue, inflowValue,
    outflowLabel: outflowValue != null ? fmt.money(outflowValue) : '',
    inflowLabel: inflowValue != null ? fmt.money(inflowValue) : '',
    // Status shows as a one-letter badge (see the Transactions Row): a filled
    // green C when cleared, an outlined C when not — the same pair the balance
    // strip uses. The stored value stays 'pending'; only the wording is
    // "Uncleared". stLabel is the tooltip, the aria-label, and the status-sort
    // key (STATUS_RANK reads it lowercased).
    stLabel: t.status === 'pending' ? 'Uncleared' : 'Cleared',
    stGlyph: 'C',
    stColor: t.status === 'pending' ? 'var(--muted)' : 'var(--pos)',
    stOn: 'var(--on-pos)',
    stOutline: t.status === 'pending',
    rowOpacity: t.status === 'pending' ? '.62' : '1', isPending: t.status === 'pending',
    canEdit: t.type !== 'cardAdjustment',
    // Only money in/out can become a series — transfers and adjustments cannot.
    canRepeat: t.type === 'expense' || t.type === 'income',
    edited: !!t.editedAt,
    editedLabel: t.editedAt ? 'Edited ' + relTime(t.editedAt) + (t.editCount > 1 ? ' · ' + t.editCount + ' edits' : '') : '',
    // Recoverable-spending indicator — the money moved, it just isn't budget spending.
    excluded: (t.type === 'expense' || t.type === 'refund') && !!(cat && cat.excludeFromBudget),
    excludedLabel: 'Excluded from budgets',
    // Split-purchase indicator — this row is one leg of a multi-category entry.
    split: !!t.splitId,
    splitLabel: 'Split purchase',
  };
}

// "6 Mar" is unambiguous inside a month view, which is all dayLabel was ever
// asked for. The scheduled group reads forward across years, where a bare
// "6 Mar" is indistinguishable from a date that has already passed — so out-of-
// year dates carry the year.
export function withYear(iso, now) {
  return dayLabel(iso) + (iso.slice(0, 4) === now.slice(0, 4) ? '' : ' ' + iso.slice(0, 4));
}

// The forward-looking counterpart to timeLabel. A clock time answers "when
// today", which is the wrong question for a row that has not happened yet —
// and it was the only cue on a future transaction, leaving it the one row in
// the group with nothing marking it as still to come.
export function untilLabel(iso, now) {
  const d = daysUntil(iso, now);
  if (d <= 0) return 'Later today';
  return d === 1 ? 'Tomorrow' : 'In ' + d + ' days';
}

// A future-dated transaction wearing the scheduled group's clothes. It is a
// real row — selectable, editable, counted — but "Cleared" directly contradicts
// the group heading it sits under, so the pill reports its position in time
// rather than its reconciliation state.
//
// A transaction dated ahead of now. Three overrides make it read as what it
// is: the year (a bare "6 Mar" is indistinguishable from a past date), a
// distance instead of a clock time, and a "Scheduled" pill in place of the
// stored status — "Cleared" answers "did the money move?", which cannot be
// yes for a date still ahead. The stored status is untouched (the schema only
// knows cleared|pending) and the pill reverts to it by itself the day the
// date arrives, when txGroups stops routing the row through here. The real
// distinction the label was hiding moves to the tooltip: cleared counts
// automatically on its date, an uncleared one waits for you. Uncleared rows
// also keep their dim, so the two kinds stay tellable apart at a glance.
export function futureTxRowOf(t, S, fmt, now) {
  return {
    ...txRowOf(t, S, fmt), isFuture: true,
    dateLabel: withYear(t.date, now),
    timeLabel: untilLabel(t.date, now),
    // stOutline reset to false: the underlying uncleared row set it, but the
    // Scheduled badge is a solid pill, not an outline.
    stLabel: 'Scheduled', stGlyph: 'S', stColor: 'var(--info)', stOn: 'var(--on-info)', stOutline: false,
    stTitle: t.status === 'pending'
      ? 'Dated ahead and uncleared — stays out of totals until you mark it cleared.'
      : 'Dated ahead — counts automatically when its date arrives.',
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
  // The effective next due skips dates already recorded/skipped, so a reminder
  // never lands on a day that already carries the transaction.
  const nd = effectiveNextDate(r);
  const overdue = daysUntil(nd, now) < 0;
  return {
    key: 'rule:' + r.id, ruleId: r.id, isRule: true, isOverdue: overdue,
    sortAt: nd, sortId: 'rule:' + r.id,
    dateLabel: withYear(nd, now), timeLabel: ruleDueLabel(r, now),
    merchant: r.name, notes: '', hasNotes: false,
    hasChip: false, chip: null, chipBg: '', chipFg: '', chipIcon: null, transferOther: null,
    isRepeating: true,
    catName: cat ? cat.name : '—',
    acctLabel: sourceLabel(S, r),
    // Estimated amounts keep the ~ they carry on the Recurring screen: this is
    // a forecast, and rounding it into a hard figure would be a small lie.
    amtLabel: (r.estimated ? '~' : '') + fmt.money(r.type === 'income' ? r.amount : -r.amount),
    amtValue: r.type === 'income' ? r.amount : -r.amount,
    amtColor: r.type === 'income' ? 'var(--pos)' : 'var(--text)',
    outflowValue: r.type === 'income' ? null : r.amount,
    inflowValue: r.type === 'income' ? r.amount : null,
    outflowLabel: r.type === 'income' ? '' : (r.estimated ? '~' : '') + fmt.money(r.amount),
    inflowLabel: r.type === 'income' ? (r.estimated ? '~' : '') + fmt.money(r.amount) : '',
    stLabel: overdue ? 'Overdue' : 'Scheduled',
    stGlyph: overdue ? '!' : 'S',
    stColor: overdue ? 'var(--neg)' : 'var(--info)',
    stOn: overdue ? 'var(--on-neg)' : 'var(--on-info)',
    stTitle: overdue ? 'This was due and has not been recorded yet.' : 'A reminder — nothing is recorded until you record it.',
    rowOpacity: '1', isPending: false, canEdit: false, canRepeat: false,
    edited: false, editedLabel: '', excluded: false, excludedLabel: '', split: false,
  };
}

// The two groups the transactions table renders.
//
// Scheduled is everything still ahead: recurring reminders AND future-dated
// transactions, interleaved soonest-first so anything overdue sits at the top.
// The owner tried both arrangements live and settled here (2026-08-06,
// reversing an earlier reminders-only call): a future-dated transaction reads
// better beside the reminders it resembles than among money already spent.
// Correctness never depended on the grouping — hasOccurred() keeps future rows
// out of every balance and budget wherever they are displayed.
//
// The two populations keep their natures: future transactions are real rows
// (selId → checkbox, ⋯ menu, all filters apply); reminders are projections of
// rule.nextDate (no selId, Record/Skip). anyFilter suppresses only the
// reminders — a rule has no status, type or merchant, so it cannot honour
// "Uncleared" or a search term, and showing rows that contradict an active
// filter is worse than briefly hiding them.
export function txGroups(list, S, fmt, now, range, anyFilter, sort, accountId) {
  // One predicate shared with the money math, so a row can never be counted in
  // a balance while being displayed as still to come, or the reverse.
  const futureTx = list.filter(t => !hasOccurred(t, now));
  const postedTx = list.filter(t => hasOccurred(t, now));
  // Future-dated transactions come from `list` (already account-scoped); the
  // recurring rules, though, span all accounts, so scope them here too.
  const ruleRows = anyFilter ? [] : scheduledRules(S, range.from, range.to, now)
    .filter(r => !accountId || r.accountId === accountId)
    .map(r => ruleRowOf(r, S, fmt, now));
  // A rule with money already pencilled in doesn't also nag you. Recording an
  // occurrence that isn't due yet leaves a future-dated transaction AND
  // advances the rule, so the same commitment would appear twice — once as
  // the pencilled-in payment, once as the next reminder.
  //
  // The transaction always wins: it is real money, and it has to stay visible
  // when a filter matches it. Only the reminder folds, and only while the
  // transaction is still ahead — once its date passes it leaves futureTx, the
  // rule drops out of this set, and the reminder returns on its own. No stored
  // state, nothing to clean up.
  const rulesPencilledIn = new Set(futureTx.map(t => (ruleFromTx(S, t.id) || {}).id).filter(Boolean));
  const shownRuleRows = ruleRows.filter(r => !rulesPencilledIn.has(r.ruleId));
  // Each group sorts independently and never merges into the other. Rows are
  // built first and sorted second, so every sort key is the value the cell
  // renders — see sortRows.js.
  const scheduledRowObjs = shownRuleRows.concat(futureTx.map(t => futureTxRowOf(t, S, fmt, now)));
  const scheduled = sortRows(scheduledRowObjs, scheduledSort(sort))
    .map(row => (row.isRule ? { row } : { row, selId: row.id }));
  return {
    scheduled, futureTx, postedTx,
    postedRows: sortRows(postedTx.map(t => txRowOf(t, S, fmt)), sort),
    overdueCount: scheduled.filter(x => x.row.isOverdue).length,
    hiddenRuleCount: ruleRows.length - shownRuleRows.length,
  };
}

// The scheduled-band note ("N overdue · M more later"), shared by the desktop
// GroupHead and the phone list's collapsed band header. Say so rather than
// truncating silently — a folded reminder is a real future obligation.
export function schedNote(overdueCount, hiddenRuleCount) {
  return [
    overdueCount > 0 ? overdueCount + ' overdue' : 'not yet spent',
    hiddenRuleCount > 0 ? hiddenRuleCount + ' more later' : null,
  ].filter(Boolean).join(' · ');
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

// Whether the guided first-use setup should show: setup incomplete AND not
// dismissed. Shared by the Dashboard/Overview page (which renders <FirstUse/>)
// and the Reflect shell (which hides its report tab bar while it's active), so
// the two can't drift out of sync.
export function isFirstUse(S, prefs) {
  return !setupState(S).complete && !prefs.skippedSetup;
}
