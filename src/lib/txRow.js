// Shared transaction-row and account-freshness presenters, ported from the
// prototype's txRowOf (script 894-927) and freshInfo (928-933).
import { accountDelta, dayLabel, daysAgo, lastActivity, timeLabel } from './calc.js';
import { nowIso } from './dates.js';

// fmt = { money, moneyS } from useMoney(). forAccountId flips amounts to the
// perspective of one account (account-detail activity list).
export function txRowOf(t, S, fmt, forAccountId) {
  const cat = t.category ? S.categories.find(c => c.id === t.category) : null;
  const acc = t.accountId ? S.accounts.find(a => a.id === t.accountId) : null;
  const card = t.cardId ? S.cards.find(c => c.id === t.cardId) : null;
  const toAcc = t.toAccountId ? S.accounts.find(a => a.id === t.toAccountId) : null;
  const toCard = t.toCardId ? S.cards.find(c => c.id === t.toCardId) : null;
  let chip = null, chipBg = 'var(--elev)', chipFg = 'var(--muted)';
  if (t.type === 'transfer' && t.isCardPayment) { chip = 'Card payment'; chipBg = 'var(--info-soft)'; chipFg = 'var(--info)'; }
  else if (t.type === 'transfer') { chip = 'Transfer'; }
  else if (t.type === 'refund') { chip = 'Refund'; chipBg = 'var(--info-soft)'; chipFg = 'var(--info)'; }
  else if (t.type === 'adjustment') { chip = 'Adjustment'; chipBg = 'var(--warn-soft)'; chipFg = 'var(--warn)'; }
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
    hasChip: !!chip, chip, chipBg, chipFg,
    catName: cat ? cat.name : (t.type === 'transfer' ? 'Transfer' : '—'), catColor: cat ? cat.color : 'var(--border)',
    acctLabel, amtLabel, amtColor,
    stLabel: t.status === 'pending' ? 'Pending' : 'Cleared', stBg: t.status === 'pending' ? 'var(--warn-soft)' : 'var(--elev)', stFg: t.status === 'pending' ? 'var(--warn)' : 'var(--muted)',
    rowOpacity: t.status === 'pending' ? '.62' : '1', isPending: t.status === 'pending',
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
