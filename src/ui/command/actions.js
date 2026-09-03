// Action catalog. Each action's perform(ctx) delegates to the app's existing
// `openers` / prefs / nav so the palette never re-implements behaviour — it is a
// second front door onto the same doors GlobalShortcuts and the toolbars use.
import { openers } from '../../drawers/openers.js';

// ctx shape (supplied by CommandPalette.jsx at call time):
//   { navigate, openDrawer, setPrefs, prefs, phone, pathname, openPayees, switchPlan }
export function buildActions({ plans = [], openPlanId } = {}) {
  const items = [
    {
      id: 'action:addTx', kind: 'action', group: 'Actions',
      label: 'Add transaction', sublabel: 'New expense, income, or transfer',
      keywords: ['new transaction', 'create', 'add expense', 'add income', 'spend', 'transfer'],
      priority: 30,
      // Mirrors GlobalShortcuts' Shift+N: desktop addTx renders inline in the
      // register, so get onto /transactions first (preserving a scoped account).
      perform: ctx => {
        const seed = ctx.addSeed || {};   // a single-day register seeds its day (TxViewContext)
        if (ctx.phone) { openers.addTx(ctx.openDrawer, 'expense', seed); return; }
        const m = ctx.pathname && ctx.pathname.match(/^\/transactions\/([^/]+)$/);
        if (m) { openers.addTx(ctx.openDrawer, 'expense', { ...seed, payWith: 'acc:' + m[1] }); return; }
        if (ctx.pathname !== '/transactions') ctx.navigate('/transactions');
        openers.addTx(ctx.openDrawer, 'expense', seed);
      },
    },
    {
      id: 'action:addAccount', kind: 'action', group: 'Actions',
      label: 'New account', keywords: ['add account', 'create account', 'bank'],
      priority: 16, perform: ctx => openers.addAccount(ctx.openDrawer),
    },
    {
      id: 'action:addCategory', kind: 'action', group: 'Actions',
      label: 'New category', keywords: ['add category', 'create category'],
      priority: 16, perform: ctx => openers.addCategory(ctx.openDrawer),
    },
    {
      id: 'action:managePayees', kind: 'action', group: 'Actions',
      label: 'Manage payees', keywords: ['payees', 'rename payee', 'merge payee'],
      priority: 10, perform: ctx => ctx.openPayees(),
    },
    {
      id: 'action:toggleTheme', kind: 'action', group: 'Actions',
      label: 'Toggle light / dark mode', keywords: ['theme', 'dark mode', 'light mode', 'appearance'],
      priority: 10, perform: ctx => ctx.setPrefs({ theme: ctx.prefs.theme === 'light' ? 'dark' : 'light' }),
    },
    {
      id: 'action:toggleMask', kind: 'action', group: 'Actions',
      label: 'Hide / show amounts', keywords: ['mask', 'privacy', 'hide balances', 'blur'],
      priority: 8, perform: ctx => ctx.setPrefs({ masked: !ctx.prefs.masked }),
    },
  ];

  // BR-10: only offer "switch plan" for plans other than the open one.
  for (const p of plans) {
    if (p.id === openPlanId) continue;
    items.push({
      id: 'action:switchPlan:' + p.id, kind: 'action', group: 'Actions',
      label: 'Switch to plan: ' + p.name,
      keywords: ['switch plan', 'change plan', 'ledger', p.name],
      priority: 6, perform: ctx => ctx.switchPlan(p.id),
    });
  }

  return items;
}
