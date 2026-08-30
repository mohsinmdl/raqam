// Pure projection of the app's navigation surface + store data into flat palette
// items. No React/DOM: `perform(ctx)` receives its dependencies at call time
// (see CommandPalette.jsx), so this stays testable with a plain data snapshot.

// Static page catalog, derived from the router in App.jsx. `keywords` carry
// synonyms (e.g. "reports" -> Reflect) so search finds pages by intent, not
// just by their exact label.
export const PAGES = [
  { slug: 'budget', to: '/budget', label: 'Budget', sub: 'Plan', keywords: ['plan', 'categories', 'assign', 'budgeting'] },
  { slug: 'budget-recurring', to: '/budget/recurring', label: 'Recurring', sub: 'Budget', keywords: ['scheduled', 'repeating', 'bills', 'subscriptions'] },
  { slug: 'reflect', to: '/reflect', label: 'Reflect', sub: 'Overview', keywords: ['reports', 'dashboard', 'overview', 'insights'] },
  { slug: 'spending', to: '/reflect/spending', label: 'Spending', sub: 'Reflect', keywords: ['breakdown', 'reports', 'where money went'] },
  { slug: 'trends', to: '/reflect/trends', label: 'Trends', sub: 'Reflect', keywords: ['spending trends', 'over time'] },
  { slug: 'net-worth', to: '/reflect/net-worth', label: 'Net Worth', sub: 'Reflect', keywords: ['assets', 'wealth'] },
  { slug: 'income-expense', to: '/reflect/income-expense', label: 'Income vs Expense', sub: 'Reflect', keywords: ['cash flow', 'in out'] },
  { slug: 'age-of-money', to: '/reflect/age-of-money', label: 'Age of Money', sub: 'Reflect', keywords: ['aom'] },
  { slug: 'transactions', to: '/transactions', label: 'All Accounts', sub: 'Transactions', keywords: ['register', 'ledger', 'transactions'] },
  { slug: 'accounts', to: '/accounts', label: 'Accounts', sub: 'Manage', keywords: ['banks', 'cards', 'manage accounts'] },
  { slug: 'settings', to: '/settings', label: 'Settings', sub: 'App', keywords: ['preferences', 'options'] },
];

// Base rank boosts so kinds order sensibly when scores tie (pages first).
const PRIORITY = { page: 40, account: 20, category: 10, payee: 5 };

export function buildItems({ data } = {}) {
  const items = [];
  for (const p of PAGES) {
    items.push({
      id: 'page:' + p.slug, kind: 'page', group: 'Pages',
      label: p.label, sublabel: p.sub, keywords: p.keywords, priority: PRIORITY.page,
      perform: ctx => ctx.navigate(p.to),
    });
  }

  const S = data || {};

  for (const a of (S.accounts || [])) {
    if (a.status && a.status !== 'active') continue; // BR-5: active only
    const sub = [a.type, a.last4 ? '••' + a.last4 : null].filter(Boolean).join(' · ');
    items.push({
      id: 'account:' + a.id, kind: 'account', group: 'Accounts',
      label: a.nickname || 'Account', sublabel: sub || 'Account',
      keywords: a.last4 ? [a.last4] : undefined, priority: PRIORITY.account,
      perform: ctx => ctx.navigate('/transactions/' + a.id),
    });
  }

  const groupName = {};
  for (const g of (S.categoryGroups || [])) groupName[g.id] = g.name;
  for (const c of (S.categories || [])) {
    if (c.status && c.status !== 'active') continue; // BR-5
    items.push({
      id: 'category:' + c.id, kind: 'category', group: 'Categories',
      label: c.name, sublabel: (c.groupId && groupName[c.groupId]) || 'Category',
      priority: PRIORITY.category,
      perform: ctx => ctx.navigate('/budget'),
    });
  }

  for (const p of (S.payees || [])) {
    if (p.transferRef || p.hidden) continue; // BR-5: no transfer mirrors / hidden
    items.push({
      id: 'payee:' + p.id, kind: 'payee', group: 'Payees',
      label: p.name, sublabel: 'Payee', priority: PRIORITY.payee,
      perform: ctx => ctx.openPayees(),
    });
  }

  return items;
}
