# Sidebar + Budget Hub Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the left sidebar into Budget / Dashboard / All Accounts with a live account list and a bottom identity menu, and fold Budgets/Categories/Recurring into one tabbed Budget hub.

**Architecture:** Two pure helpers (`accountRows`, `resolveDisplayName`) carry the testable logic; thin React components (`AccountList`, `SidebarUser`, `UserMenu`, `BudgetHub`) consume them using the app's existing hooks (`useStore`, `useMoney`, `useDrawer`, `useAuth`, `useUI`) and inline `var(--token)` styles. Routing moves Budgets/Categories/Recurring under nested `/budget` routes with redirects from the old paths; detail routes (`/accounts/:id`, `/recurring/:id`) stay put.

**Tech Stack:** React 18, react-router-dom (HashRouter), Vitest (pure logic only — the project has no jsdom), Vite. No new dependencies.

## Global Constraints

- **Money always goes through `useMoney()`** from `src/lib/format.js`: `money(n)` → `fmtPKR(n, masked)`, which renders `Rs ••••••` when `prefs.masked` is on. Never hand-format currency.
- **Sidebar balances are live "as of today"** — derive with `currentMonth()` + `nowIso()` from `src/lib/dates.js`, NEVER `useMonth().month` (that is the selected reporting month and must not move the sidebar).
- **The account list and its total are accounts-only** (exclude credit cards). The total equals the sum of the listed active-account balances.
- **Styling:** inline `style={{}}` objects using `var(--token)` from `src/styles/theme.css`; reuse helper classes `hv-elev` / `hv-neg-soft` / `tnum` / `field`. Font (`IBM Plex Sans`) is inherited from the shell — do not re-declare it.
- **Vitest, no jsdom:** only pure functions get CI unit tests. Components are verified by `npx vite build` (compiles + imports resolve) and, for the final assembly, a throwaway Vite harness + Playwright (per the project's established "verify UI without jsdom" pattern). React-Router redirects are verified via that harness, not a CI unit test.
- **Keep the whole suite green** (`npx vitest run --exclude '**/.claude/**'`) and the build clean at every commit.
- **Non-goals (do not build):** sidebar collapse-to-icons; a real Settings screen (link to the existing `/settings` placeholder); any account/category filter on Transactions; account grouping (flat list only).

---

## File Structure

**Create:**
- `src/lib/sidebarAccounts.js` — `accountRows(store, month, now)` → `{ rows, total }`. Pure derivation.
- `src/lib/identity.js` — `resolveDisplayName(displayName, email)`, `initialOf(name)`. Pure.
- `src/components/AccountList.jsx` — the ACCOUNTS section (label + total + rows + Add account).
- `src/components/SidebarUser.jsx` — bottom identity row + menu open/close state.
- `src/components/UserMenu.jsx` — the upward popover (display name, Appearance, Hide amounts, Settings, Sign out, Reset).
- `src/screens/BudgetHub.jsx` — tab shell (Budget · Categories · Recurring) with an `<Outlet/>`.
- `tests/sidebar-accounts.test.js`, `tests/identity.test.js`.

**Modify:**
- `src/App.jsx` — nested `/budget` routes + redirects; drop `DataControls` from the shell; `<Sidebar/>` without a `footer` prop.
- `src/components/Sidebar.jsx` — rewrite: 3 nav items + `<AccountList/>` + `<SidebarUser/>`.
- `src/components/Header.jsx` — remove the theme + hide-amounts buttons; `showMonthSel` covers `/budget`; title for `budget`.
- `src/screens/RecurringDetail.jsx` — back-links `/recurring` → `/budget/recurring`.

**Delete (usage, not necessarily the file):**
- `src/components/DataControls.jsx` — its sign-out/reset logic moves into `UserMenu`; it is no longer rendered. Leave the file in place (unreferenced) unless Task 6's reviewer prefers deletion.

---

## Task 1: `accountRows` derivation helper

**Files:**
- Create: `src/lib/sidebarAccounts.js`
- Test: `tests/sidebar-accounts.test.js`

**Interfaces:**
- Consumes: `accountBalance(acc, store, month, now)` from `src/lib/calc.js`.
- Produces: `accountRows(store, month, now)` → `{ rows: Array<{ id: string, nickname: string, balance: number }>, total: number }`. Active accounts only, sorted by `balance` descending; `total` is the sum of `rows[].balance`.

- [ ] **Step 1: Write the failing test** — `tests/sidebar-accounts.test.js`

```js
import { describe, it, expect } from 'vitest';
import { accountRows } from '../src/lib/sidebarAccounts.js';

const MONTH = '2026-08';
const NOW = '2026-08-15T12:00:00';
const snap = (id, amount) => ({ accountId: id, month: MONTH, amount });
const store = (accounts, snapshots = [], transactions = []) => ({ accounts, snapshots, transactions, cards: [] });

describe('accountRows', () => {
  it('includes only active accounts', () => {
    const s = store(
      [{ id: 'a', nickname: 'A', status: 'active' }, { id: 'b', nickname: 'B', status: 'archived' }, { id: 'c', nickname: 'C', status: 'closed' }],
      [snap('a', 100), snap('b', 200), snap('c', 300)],
    );
    expect(accountRows(s, MONTH, NOW).rows.map(r => r.id)).toEqual(['a']);
  });

  it('sorts by balance descending', () => {
    const s = store(
      [{ id: 'a', nickname: 'A', status: 'active' }, { id: 'b', nickname: 'B', status: 'active' }, { id: 'c', nickname: 'C', status: 'active' }],
      [snap('a', 100), snap('b', 5000), snap('c', 750)],
    );
    const { rows } = accountRows(s, MONTH, NOW);
    expect(rows.map(r => r.nickname)).toEqual(['B', 'C', 'A']);
    expect(rows.map(r => r.balance)).toEqual([5000, 750, 100]);
  });

  it('total equals the sum of the listed balances', () => {
    const s = store(
      [{ id: 'a', nickname: 'A', status: 'active' }, { id: 'b', nickname: 'B', status: 'active' }],
      [snap('a', 100), snap('b', 250)],
    );
    expect(accountRows(s, MONTH, NOW).total).toBe(350);
  });

  it('reflects the month\'s transactions in each balance', () => {
    const s = store(
      [{ id: 'a', nickname: 'A', status: 'active' }],
      [snap('a', 1000)],
      [{ id: 't1', date: '2026-08-10', type: 'expense', amount: 300, accountId: 'a', status: 'cleared' }],
    );
    const { rows, total } = accountRows(s, MONTH, NOW);
    expect(rows[0].balance).toBe(700);
    expect(total).toBe(700);
  });

  it('returns empty rows and zero total when there are no active accounts', () => {
    const { rows, total } = accountRows(store([]), MONTH, NOW);
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/sidebar-accounts.test.js`
Expected: FAIL — `Failed to resolve import '../src/lib/sidebarAccounts.js'`.

- [ ] **Step 3: Implement** — `src/lib/sidebarAccounts.js`

```js
// Live account rows for the sidebar: active accounts only, each with its
// balance as of `now` within `month`, sorted by balance descending. `total`
// is the sum of the listed balances — equal to monthMetrics().totalBank by
// construction, so the section total always reconciles with the rows beneath.
import { accountBalance } from './calc.js';

export function accountRows(store, month, now) {
  const rows = store.accounts
    .filter(a => a.status === 'active')
    .map(a => ({ id: a.id, nickname: a.nickname, balance: accountBalance(a, store, month, now) }))
    .sort((a, b) => b.balance - a.balance);
  const total = rows.reduce((s, r) => s + r.balance, 0);
  return { rows, total };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run tests/sidebar-accounts.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sidebarAccounts.js tests/sidebar-accounts.test.js
git commit -m "Sidebar: accountRows() derivation helper (active-only, sorted, total)"
```

---

## Task 2: `resolveDisplayName` + `initialOf` identity helpers

**Files:**
- Create: `src/lib/identity.js`
- Test: `tests/identity.test.js`

**Interfaces:**
- Produces:
  - `resolveDisplayName(displayName, email)` → string. Trimmed non-empty `displayName` wins; else the email local-part with its first letter capitalised; else `'Account'`.
  - `initialOf(name)` → single uppercase character, or `'?'` when empty.

- [ ] **Step 1: Write the failing test** — `tests/identity.test.js`

```js
import { describe, it, expect } from 'vitest';
import { resolveDisplayName, initialOf } from '../src/lib/identity.js';

describe('resolveDisplayName', () => {
  it('uses the display name when set', () => {
    expect(resolveDisplayName('Mohsin', 'x@y.com')).toBe('Mohsin');
  });
  it('ignores a whitespace-only name and falls back to the email local part', () => {
    expect(resolveDisplayName('   ', 'mohsin@example.com')).toBe('Mohsin');
  });
  it('capitalises the email local part when there is no display name', () => {
    expect(resolveDisplayName('', 'daisy.khan@example.com')).toBe('Daisy.khan');
  });
  it('falls back to "Account" when neither is present', () => {
    expect(resolveDisplayName('', '')).toBe('Account');
  });
});

describe('initialOf', () => {
  it('returns the uppercased first character', () => {
    expect(initialOf('mohsin')).toBe('M');
  });
  it('returns "?" for an empty name', () => {
    expect(initialOf('')).toBe('?');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/identity.test.js`
Expected: FAIL — cannot resolve `../src/lib/identity.js`.

- [ ] **Step 3: Implement** — `src/lib/identity.js`

```js
// The sidebar shows a friendly name where the app only stores an email.
// Order: an explicit displayName pref, else the email's local part with its
// first letter capitalised, else a neutral fallback.
export function resolveDisplayName(displayName, email) {
  const dn = (displayName || '').trim();
  if (dn) return dn;
  const local = (email || '').split('@')[0];
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return 'Account';
}

export function initialOf(name) {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run tests/identity.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity.js tests/identity.test.js
git commit -m "Sidebar: resolveDisplayName() + initialOf() identity helpers"
```

---

## Task 3: Budget hub (tabs + nested routes + redirects)

**Files:**
- Create: `src/screens/BudgetHub.jsx`
- Modify: `src/App.jsx` (routes), `src/components/Header.jsx` (title + month selector), `src/screens/RecurringDetail.jsx` (back-links)

**Interfaces:**
- Consumes: existing zero-prop default-export screens `Budgets`, `Categories`, `Recurring` (rendered via `<Outlet/>`).
- Produces: routes `/budget` (index → Budgets), `/budget/categories`, `/budget/recurring`; redirects from `/budgets`, `/categories`, `/recurring`.

- [ ] **Step 1: Create the tab shell** — `src/screens/BudgetHub.jsx`

```jsx
// Budget hub: one screen hosting Budget, Categories, and Recurring as tabs.
// The three panels are the existing screens, rendered through <Outlet/>.
import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/budget', label: 'Budget', end: true },
  { to: '/budget/categories', label: 'Categories' },
  { to: '/budget/recurring', label: 'Recurring' },
];

export default function BudgetHub() {
  return (
    <div>
      <div role="tablist" aria-label="Budget sections" style={{ display: 'flex', gap: 4, padding: '0 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            role="tab"
            className="hv-accent-fg"
            style={({ isActive }) => ({
              padding: '12px 4px', margin: '0 8px', fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
              color: isActive ? 'var(--text)' : 'var(--muted)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2: Wire the routes** — `src/App.jsx`

Add the import near the other screen imports (line ~22):
```jsx
import BudgetHub from './screens/BudgetHub.jsx';
```
Replace the three standalone routes (`/budgets`, `/recurring`, `/categories`) inside `<Routes>` with the nested hub + redirects. Concretely, remove:
```jsx
<Route path="/budgets" element={<Budgets />} />
<Route path="/recurring" element={<Recurring />} />
...
<Route path="/categories" element={<Categories />} />
```
and add (keep `/recurring/:id` exactly as-is):
```jsx
<Route path="/budget" element={<BudgetHub />}>
  <Route index element={<Budgets />} />
  <Route path="categories" element={<Categories />} />
  <Route path="recurring" element={<Recurring />} />
</Route>
<Route path="/budgets" element={<Navigate to="/budget" replace />} />
<Route path="/categories" element={<Navigate to="/budget/categories" replace />} />
<Route path="/recurring" element={<Navigate to="/budget/recurring" replace />} />
```
`Navigate` is already imported in `App.jsx`. Leave `/recurring/:id`, `/accounts`, `/accounts/:id`, `/dashboard`, `/transactions`, `/reports`, `/settings`, and the `*` fallback unchanged.

- [ ] **Step 3: Update the Header title + month selector** — `src/components/Header.jsx`

In `TITLES` (line ~12) add `budget: 'Budget'` (keep the existing keys; the old ones are harmless once their routes redirect):
```jsx
const TITLES = {
  dashboard: 'Dashboard', transactions: 'All Accounts', accounts: 'Accounts',
  budget: 'Budget', budgets: 'Budgets', recurring: 'Recurring', reports: 'Reports', categories: 'Categories', settings: 'Settings',
};
```
Change the month-selector guard (line ~79) so it shows on the Budget tab only (not its sub-tabs):
```jsx
const showMonthSel = seg === 'dashboard' || pathname === '/budget';
```

- [ ] **Step 4: Fix RecurringDetail back-links** — `src/screens/RecurringDetail.jsx`

Replace the two `<Link to="/recurring">` back-links (lines ~55 and ~104) and the `navigate('/recurring')` after delete (line ~98) to point at `/budget/recurring`:
```jsx
<Link to="/budget/recurring" ...>‹ All recurring rules</Link>
```
```jsx
navigate('/budget/recurring');
```
(Leave `navigate('/recurring/' + r.id)` in `Recurring.jsx` unchanged — the detail route did not move.)

- [ ] **Step 5: Verify build + suite, then harness-check routing**

Run: `npx vite build` → clean.
Run: `npx vitest run --exclude '**/.claude/**'` → all green (Tasks 1–2 included).
Harness check (no jsdom in CI): using the project's throwaway-Vite-harness pattern, load the app shell and confirm: visiting `#/budgets` lands on `#/budget` with the Budget tab active; `#/categories` → `#/budget/categories`; `#/recurring` → `#/budget/recurring`; the three tabs switch panels; a recurring rule opens `#/recurring/:id` and its "‹ All recurring rules" returns to `#/budget/recurring`. Capture one Playwright screenshot of the hub for the reviewer.

- [ ] **Step 6: Commit**

```bash
git add src/screens/BudgetHub.jsx src/App.jsx src/components/Header.jsx src/screens/RecurringDetail.jsx
git commit -m "Budget hub: Categories + Recurring as tabs under /budget, redirects from old routes"
```

---

## Task 4: `AccountList` component

**Files:**
- Create: `src/components/AccountList.jsx`

**Interfaces:**
- Consumes: `accountRows` (Task 1); `useStore().data`; `useMoney()` → `{ money, masked }`; `useDrawer().openDrawer`; `openers.addAccount` from `src/drawers/openers.js`; `currentMonth`/`nowIso` from `src/lib/dates.js`; `useNavigate`, `useLocation`.
- Produces: default-export `<AccountList/>`. Its root is a flex column (`flex: 1, minHeight: 0`) whose row area scrolls, so a parent can pin content above and below it.

- [ ] **Step 1: Implement** — `src/components/AccountList.jsx`

```jsx
// The ACCOUNTS section of the sidebar: a live, flat list of active accounts
// with balances as of today (NOT the selected reporting month), a reconciling
// total, and an Add-account row. A row opens that account's detail screen.
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney } from '../lib/format.js';
import { openers } from '../drawers/openers.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { accountRows } from '../lib/sidebarAccounts.js';

export default function AccountList() {
  const { data } = useStore();
  const { money, masked } = useMoney();
  const { openDrawer } = useDrawer();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { rows, total } = accountRows(data, currentMonth(), nowIso());
  const activeId = pathname.startsWith('/accounts/') ? decodeURIComponent(pathname.split('/')[2]) : null;

  const rowBtn = active => ({
    display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 12px',
    border: 'none', borderRadius: 8, background: active ? 'var(--soft)' : 'transparent',
    cursor: 'pointer', width: '100%', textAlign: 'left',
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 6px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.09em', color: 'var(--muted)' }}>ACCOUNTS</span>
        {rows.length > 0 && <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>{money(total)}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.length === 0 && (
          <div style={{ padding: '6px 12px', fontSize: 12.5, color: 'var(--muted)' }}>No accounts yet</div>
        )}
        {rows.map(r => {
          const active = r.id === activeId;
          const neg = !masked && r.balance < 0;
          return (
            <button key={r.id} onClick={() => navigate('/accounts/' + r.id)} className="hv-elev" style={rowBtn(active)}>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13.5, color: 'var(--text)', fontWeight: active ? 600 : 500 }}>{r.nickname}</span>
              <span className="tnum" style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: neg ? 'var(--neg)' : 'var(--muted)', fontWeight: neg ? 600 : 500 }}>{money(r.balance)}</span>
            </button>
          );
        })}
        <button onClick={() => openers.addAccount(openDrawer)} className="hv-elev" style={{ ...rowBtn(false), color: 'var(--accent)', fontWeight: 600, fontSize: 13.5, marginTop: 2 }}>
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>＋</span> Add account
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx vite build`
Expected: clean build (imports resolve, JSX valid). Full visual verification happens in Task 6's integrated harness; do not mount `AccountList` yet.

- [ ] **Step 3: Confirm the suite is still green**

Run: `npx vitest run --exclude '**/.claude/**'`
Expected: unchanged pass count.

- [ ] **Step 4: Commit**

```bash
git add src/components/AccountList.jsx
git commit -m "Sidebar: AccountList component (live balances, total, Add account)"
```

---

## Task 5: `UserMenu` + `SidebarUser` components

**Files:**
- Create: `src/components/UserMenu.jsx`, `src/components/SidebarUser.jsx`

**Interfaces:**
- Consumes: `resolveDisplayName`, `initialOf` (Task 2); `useAuth()` → `{ user, signOut }`; `useStore()` → `{ data, prefs, setPrefs, replaceData }`; `useUI()` → `{ ask, notify }`; `resetAll` from `src/store/actions.js`; `useNavigate`.
- Produces: default-export `<SidebarUser/>` (identity row that toggles the menu) and `<UserMenu name email onClose/>` (the popover).

- [ ] **Step 1: Implement the popover** — `src/components/UserMenu.jsx`

```jsx
// The account menu that opens upward from the sidebar identity row. Holds
// everything that is not day-to-day navigation: a display-name field, the two
// device toggles (moved out of the Header), Settings, Sign out, and the
// destructive Reset (moved out of DataControls, confirm dialog preserved).
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { resetAll } from '../store/actions.js';

const row = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px',
  border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer',
  textAlign: 'left', fontSize: 13, color: 'var(--text)',
};
const rightNote = { marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 };
const sep = <div aria-hidden="true" style={{ borderTop: '1px solid var(--border)', margin: '4px 8px' }} />;

export default function UserMenu({ name, email, onClose }) {
  const { signOut } = useAuth();
  const { data, prefs, setPrefs, replaceData } = useStore();
  const { ask, notify } = useUI();
  const navigate = useNavigate();
  const hasUserData = data && (data.accounts.length > 0 || data.transactions.length > 0 || data.cards.length > 0);

  const onReset = async () => {
    onClose();
    const ok = await ask({
      title: 'Reset all data?',
      body: 'This removes every account, card, and transaction from your Raqam account and starts fresh. This cannot be undone.',
      action: 'Reset all data',
    });
    if (!ok) return;
    replaceData(resetAll());
    notify('All data cleared — starting fresh.');
  };

  return (
    <div role="menu" aria-label="Account menu" onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(100% + 8px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 6, zIndex: 20 }}>
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
        <div title={email} style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
      </div>
      <label style={{ display: 'block', padding: '0 10px 8px' }}>
        <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>DISPLAY NAME</span>
        <input
          defaultValue={prefs.displayName || ''}
          placeholder="Your name"
          onBlur={e => setPrefs({ displayName: e.target.value.trim() })}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="field" style={{ height: 32 }}
        />
      </label>
      {sep}
      <button role="menuitem" className="hv-elev" style={row} onClick={() => setPrefs({ theme: prefs.theme === 'light' ? 'dark' : 'light' })}>
        <span aria-hidden="true">◐</span> Appearance <span style={rightNote}>{prefs.theme === 'light' ? 'Light' : 'Dark'}</span>
      </button>
      <button role="menuitem" className="hv-elev" style={row} aria-pressed={String(prefs.masked)} onClick={() => setPrefs({ masked: !prefs.masked })}>
        <span aria-hidden="true">◔</span> Hide amounts <span style={rightNote}>{prefs.masked ? 'On' : 'Off'}</span>
      </button>
      <button role="menuitem" className="hv-elev" style={row} onClick={() => { onClose(); navigate('/settings'); }}>
        <span aria-hidden="true">⚙</span> Settings
      </button>
      {sep}
      <button role="menuitem" className="hv-elev" style={row} onClick={() => { onClose(); signOut(); }}>
        <span aria-hidden="true">⇥</span> Sign out
      </button>
      {hasUserData && (
        <button role="menuitem" className="hv-neg-soft" style={{ ...row, color: 'var(--neg)' }} onClick={onReset}>
          <span aria-hidden="true">⌫</span> Reset all data
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement the identity row** — `src/components/SidebarUser.jsx`

```jsx
// Pinned bottom identity row. Shows the resolved display name + email, and
// opens the account menu upward. Dismisses on outside-click or Escape.
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { resolveDisplayName, initialOf } from '../lib/identity.js';
import UserMenu from './UserMenu.jsx';

export default function SidebarUser() {
  const { user } = useAuth();
  const { prefs } = useStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const email = user?.email || '';
  const name = resolveDisplayName(prefs.displayName, email);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', borderTop: '1px solid var(--border)' }}>
      {open && <UserMenu name={name} email={email} onClose={() => setOpen(false)} />}
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={String(open)} className="hv-elev"
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600, fontSize: 13 }}>{initialOf(name)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
        </span>
        <span aria-hidden="true" style={{ color: 'var(--muted)', flex: 'none' }}>▴</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles + suite green**

Run: `npx vite build` → clean.
Run: `npx vitest run --exclude '**/.claude/**'` → unchanged pass count.
(Do not mount yet — Task 6 wires it in and simultaneously removes the Header/DataControls duplicates so there is never a window with two sets of toggles.)

- [ ] **Step 4: Commit**

```bash
git add src/components/UserMenu.jsx src/components/SidebarUser.jsx
git commit -m "Sidebar: SidebarUser + UserMenu (identity, display-name, toggles, sign out, reset)"
```

---

## Task 6: Assemble the sidebar + remove the old homes

**Files:**
- Modify: `src/components/Sidebar.jsx` (rewrite), `src/App.jsx` (drop DataControls + footer prop), `src/components/Header.jsx` (remove the two toggles)

**Interfaces:**
- Consumes: `<AccountList/>` (Task 4), `<SidebarUser/>` (Task 5).
- Produces: the final 3-item sidebar. `Sidebar` takes no props.

- [ ] **Step 1: Rewrite the sidebar** — `src/components/Sidebar.jsx` (replace the whole file)

```jsx
import { NavLink, useLocation } from 'react-router-dom';
import AccountList from './AccountList.jsx';
import SidebarUser from './SidebarUser.jsx';

const NAV = [
  { to: '/budget', label: 'Budget' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/transactions', label: 'All Accounts' },
];

function NavButton({ to, label, active }) {
  return (
    <NavLink
      to={to}
      aria-current={active ? 'page' : undefined}
      className="hv-elev"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 12px',
        border: 'none', borderRadius: 8, background: active ? 'var(--soft)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)', fontSize: 14,
        fontWeight: active ? 600 : 500, cursor: 'pointer', textAlign: 'left', width: '100%', textDecoration: 'none',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 2, background: active ? 'var(--accent)' : 'transparent', flex: 'none' }} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { pathname } = useLocation();
  // Budget stays lit across its tabs; All Accounts stays lit while browsing an
  // account's detail (the list rows live under it).
  const isActive = to =>
    pathname === to
    || (to === '/budget' && pathname.startsWith('/budget'))
    || (to === '/transactions' && pathname.startsWith('/accounts'));

  return (
    <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 14px' }}>
        <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>₨</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>Raqam</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Personal finance · PKR</div>
        </div>
      </div>
      <nav aria-label="Main" style={{ padding: '6px 12px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(n => <NavButton key={n.to} {...n} active={isActive(n.to)} />)}
      </nav>
      <AccountList />
      <SidebarUser />
    </aside>
  );
}
```

- [ ] **Step 2: Drop DataControls from the shell** — `src/App.jsx`

Remove the import `import DataControls from './components/DataControls.jsx';` (line ~15) and change the shell render from `<Sidebar footer={<DataControls />} />` to:
```jsx
<Sidebar />
```

- [ ] **Step 3: Remove the Header toggles** — `src/components/Header.jsx`

Delete the two `<button>`s that toggle Hide-amounts and theme (the block at lines ~114–119). Then remove the now-unused values from the `useStore()` destructure (line ~45): drop `prefs` and `setPrefs`. Delete `const theme = prefs.theme;` (line ~84). Leave everything else (undo/redo, RecentMoves, month nav, Add transaction) intact.

- [ ] **Step 4: Verify build + suite**

Run: `npx vite build` → clean (confirms no dangling references to the removed `prefs`/`setPrefs`/`DataControls`).
Run: `npx vitest run --exclude '**/.claude/**'` → all green.

- [ ] **Step 5: Integrated harness verification (no jsdom)**

Build a throwaway Vite harness (per the project's established pattern: stub `StoreProvider`, `AuthProvider`, `MonthContext`, `DrawerProvider`, `UIProvider` via a `resolveId` plugin so the real `Sidebar` mounts with fixture accounts) and drive it with Playwright. Confirm and screenshot:
1. Three nav items (Budget / Dashboard / All Accounts); Budget lit on `/budget` + tabs; All Accounts lit on `/transactions` and `/accounts/:id`.
2. Account rows show live balances + a reconciling total; a negative balance renders in `--neg`; long names truncate.
3. `Hide amounts` in the menu masks the sidebar balances (`Rs ••••••`); `Appearance` flips the theme; both are gone from the Header.
4. Empty-accounts fixture shows "No accounts yet" + the Add-account row; total hidden.
5. Menu opens upward, closes on outside-click/Escape; the display-name field updates the identity row after blur.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.jsx src/App.jsx src/components/Header.jsx
git commit -m "Sidebar: assemble 3-item nav + account list + user menu; retire DataControls and Header toggles"
```

---

## Self-Review

**Spec coverage:**
- §4.1 trimmed nav → Task 6. §4.2 account list (flat, total, click→detail, Add account, scroll, masking) → Tasks 1+4. §4.3 identity + menu (display name, Appearance, Hide amounts, Settings, Sign out, Reset; Header toggles removed) → Tasks 2+5+6. §4.4 Budget hub (tabs, nested routes, redirects) → Task 3. §5 data (live as-of-today, totalBank reconciliation, displayName pref, masking) → Tasks 1+4+5. §6 edge cases (empty, scroll, truncate, negative, active states, reset confirm, name fallback, masked) → Tasks 4+5+6. §7 component structure → Tasks 3–6. §8 testing → Tasks 1–2 (CI) + harness verification (Tasks 3,6). §9 open items resolved: add-account opener = `openers.addAccount(openDrawer)` (Task 4); redirects = `<Navigate>` in `App.jsx` (Task 3); name-edit = inline `field` input in the menu (Task 5).
- **Deviation (noted):** the spec's "route redirects + default tab" test moves from CI to the harness in Tasks 3/6, because the project has no jsdom and React-Router redirects are not pure-logic-testable. Pure-logic CI tests are `accountRows` and `resolveDisplayName`/`initialOf`.

**Placeholder scan:** none — every code step carries full source; no "TBD"/"handle edge cases"/"similar to".

**Type consistency:** `accountRows(store, month, now) → { rows:[{id,nickname,balance}], total }` used identically in Task 4. `resolveDisplayName(displayName, email)` / `initialOf(name)` used identically in Task 5. `useMoney()` destructured as `{ money, masked }` (matches `format.js`). `openers.addAccount(openDrawer)`, `useDrawer().openDrawer`, `useUI().{ask,notify}`, `useStore().{data,prefs,setPrefs,replaceData}`, `useAuth().{user,signOut}` all match the current source read during planning.
