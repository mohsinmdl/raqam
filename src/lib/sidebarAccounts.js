// Live account rows for the sidebar: active accounts only, each with its
// balance as of `now` within `month`, sorted alphabetically by nickname
// (case-insensitive). `total` is the sum of the listed balances — equal to
// monthMetrics().totalBank by construction (order-independent), so the section
// total always reconciles with the rows beneath.
import { accountBalance } from './calc.js';

export function accountRows(store, month, now) {
  const rows = store.accounts
    .filter(a => a.status === 'active')
    .map(a => ({ id: a.id, nickname: a.nickname, balance: accountBalance(a, store, month, now) }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' }));
  const total = rows.reduce((s, r) => s + r.balance, 0);
  return { rows, total };
}
