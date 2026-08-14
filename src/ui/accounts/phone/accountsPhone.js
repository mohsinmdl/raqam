// Pure derivations for the phone Accounts screen. balanceOf is injected so
// these stay testable without a ledger fixture; the component supplies
// accountBalance at balanceMonth (the future-month clamp lives there).
import { kindLabel } from '../../../lib/calc.js';
import { instName } from '../../../lib/txRow.js';

export function accountGroupsFor(S, balanceOf) {
  const groups = [];
  const byLabel = new Map();
  for (const a of S.accounts) {
    if (a.status !== 'active') continue;
    const inst = S.institutions.find(i => i.id === a.instId) || null;
    const label = inst ? kindLabel(inst.kind) : 'Other';
    let g = byLabel.get(label);
    if (!g) { g = { label, total: 0, rows: [] }; byLabel.set(label, g); groups.push(g); }
    const raw = balanceOf(a);
    g.total += raw;
    g.rows.push({ acct: a, inst, raw });
  }
  return groups;
}

export function archivedRowsFor(S) {
  return S.accounts
    .filter(a => a.status !== 'active')
    .map(a => ({ acct: a, instLabel: instName(S, a.instId), statusLabel: a.status === 'closed' ? 'closed' : 'archived' }));
}
