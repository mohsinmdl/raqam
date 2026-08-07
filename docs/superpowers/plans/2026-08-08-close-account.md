# Close Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the per-account ledger a discoverable "Close account" action that zeroes the balance with an adjustment (YNAB-style) and marks the account closed, replacing the buried Status dropdown.

**Architecture:** A pure `closeAccount` store reducer (one undo step) does the work; a `useCloseAccount` hook renders the confirmation via the existing `ask()` dialog and applies the reducer; the Edit Account drawer gains the button and loses the Status `<select>`.

**Tech Stack:** React 18, react-router-dom (HashRouter), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-close-account-design.md`

## Global Constraints

- **Reuse, don't reinvent:** `adjustBalance` and `setAccountStatus` (`src/store/actions.js`), `accountBalance` (`src/lib/calc.js`), `ask` (`src/ui/UIProvider.jsx`, accepts a JSX `body` and `tone: 'neg'|'accent'`), `useMoney` (`src/lib/format.js`). Do not add new dialog components or audit plumbing.
- **One undo step:** the balance-zeroing adjustment and the status flip must happen inside a single reducer, so `closeAccount` returns them together and callers apply it in one `applyData(data => …)`.
- **Zero epsilon:** money is 2-dp PKR — treat `Math.abs(balance) <= 0.005` as zero (no adjustment).
- **Module-scope components only:** `tests/no-inline-components.test.js` fails any React component defined inside another function. `CloseAccountBody` must be declared at module scope.
- **Reversible, keeps history:** closing sets `status: 'closed'` (never deletes). Restore/Delete in Accounts → ARCHIVED are unchanged.
- **Purity:** reducers must not mutate their input store (spread, don't assign). Verified by a test.
- Keep the full vitest suite green and `npx vite build` clean after every task.

---

### Task 1: `closeAccount` pure store reducer

**Files:**
- Modify: `src/store/actions.js` (add `closeAccount` near `setAccountStatus`, ~line 345)
- Test: `tests/close-account.test.js` (create)

**Interfaces:**
- Consumes: `adjustBalance(data, { accountId, delta, reason, date, currentBalance })`, `setAccountStatus(data, { accountId, status })` — both already exported in `actions.js`. `todayStr` is already imported in `actions.js` (from `../lib/dates.js`).
- Produces: `closeAccount(data, { accountId, currentBalance }) → data` — returns a new store with (a) a `-currentBalance` adjustment transaction when the balance is non-zero, and (b) the account's `status` set to `'closed'`.

- [ ] **Step 1: Write the failing test**

Create `tests/close-account.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { closeAccount } from '../src/store/actions.js';

function store(over) {
  return {
    institutions: [{ id: 'u1', name: 'Cash', kind: 'Custom', own: true }],
    accounts: [{ id: 'a1', instId: 'u1', nickname: 'Cash', type: 'Cash', status: 'active' }],
    cards: [], cardProducts: [], categories: [], snapshots: [], transactions: [],
    budgets: [], recurring: [], audit: [],
    ...(over || {}),
  };
}

describe('closeAccount', () => {
  it('zeroes a positive balance with an adjustment and marks the account closed', () => {
    const next = closeAccount(store(), { accountId: 'a1', currentBalance: 10660 });
    expect(next.accounts.find(a => a.id === 'a1').status).toBe('closed');
    const adj = next.transactions.filter(t => t.type === 'adjustment' && t.accountId === 'a1');
    expect(adj).toHaveLength(1);
    expect(adj[0].amount).toBe(-10660);
  });

  it('closes a zero-balance account without creating an adjustment', () => {
    const next = closeAccount(store(), { accountId: 'a1', currentBalance: 0 });
    expect(next.accounts.find(a => a.id === 'a1').status).toBe('closed');
    expect(next.transactions.filter(t => t.type === 'adjustment')).toHaveLength(0);
  });

  it('offsets a negative balance with a positive adjustment', () => {
    const next = closeAccount(store(), { accountId: 'a1', currentBalance: -360 });
    const adj = next.transactions.find(t => t.type === 'adjustment' && t.accountId === 'a1');
    expect(adj.amount).toBe(360);
    expect(next.accounts.find(a => a.id === 'a1').status).toBe('closed');
  });

  it('is a no-op-safe on an unknown account id', () => {
    const S = store();
    expect(closeAccount(S, { accountId: 'nope', currentBalance: 100 }).accounts).toEqual(S.accounts);
  });

  it('does not mutate the input store', () => {
    const S = store();
    closeAccount(S, { accountId: 'a1', currentBalance: 500 });
    expect(S.transactions).toEqual([]);
    expect(S.accounts[0].status).toBe('active');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/close-account.test.js`
Expected: FAIL — `closeAccount` is not exported from `actions.js`.

- [ ] **Step 3: Implement `closeAccount`**

Add to `src/store/actions.js` (immediately after `setAccountStatus`):

```js
// Close an account: zero its balance (when non-zero) with an adjustment, then
// mark it closed. One reducer → one undo step. `currentBalance` is supplied by
// the caller (already computed for the modal copy) so this stays pure.
export function closeAccount(data, { accountId, currentBalance }) {
  const hasBal = Math.abs(currentBalance) > 0.005;
  const zeroed = hasBal
    ? adjustBalance(data, { accountId, delta: -currentBalance, reason: 'Balance zeroed on account close', date: todayStr(), currentBalance })
    : data;
  return setAccountStatus(zeroed, { accountId, status: 'closed' });
}
```

Note: an unknown `accountId` makes both `adjustBalance` and `setAccountStatus` no-op (each returns `data` when the account isn't found), so the reducer is safe.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/close-account.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run --exclude '**/.claude/**'` — Expected: all green (480+).
Run: `npx vite build` — Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/store/actions.js tests/close-account.test.js
git commit -m "Close account: add closeAccount reducer (zero balance + mark closed) with tests"
```

---

### Task 2: `useCloseAccount` hook + `CloseAccountBody` modal

**Files:**
- Create: `src/drawers/useCloseAccount.jsx`

**Interfaces:**
- Consumes: `closeAccount` (Task 1); `useStore` → `{ data, applyData }`; `useUI` → `{ ask, notify }`; `useDrawer` → `{ closeDrawer }`; `useMoney` → `{ money }`; `useNavigate`, `useLocation` (react-router-dom); `accountBalance` (`src/lib/calc.js`); `currentMonth`, `nowIso` (`src/lib/dates.js`).
- Produces: `useCloseAccount() → (accountId: string) => Promise<void>` — confirms via `ask`, applies `closeAccount`, closes the drawer, navigates to `/transactions` only when currently on that account's scoped ledger, and toasts. Also exports module-scope `CloseAccountBody({ money, balance })`.

- [ ] **Step 1: Create the hook and modal body**

Create `src/drawers/useCloseAccount.jsx`:

```jsx
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useMoney } from '../lib/format.js';
import { accountBalance } from '../lib/calc.js';
import { currentMonth, nowIso } from '../lib/dates.js';
import { closeAccount } from '../store/actions.js';

// Confirm-dialog body for closing an account. Module scope (never defined
// inside the hook) so it keeps a stable identity and satisfies the
// no-inline-components guard.
export function CloseAccountBody({ money, balance }) {
  const hasBal = Math.abs(balance) > 0.005;
  return (
    <>
      <div>
        {hasBal
          ? <>Before you can close this account, the balance will have to be zeroed out. An adjustment transaction will be created for <strong style={{ color: 'var(--text)' }}>{money(-balance)}</strong>.</>
          : <>This account will be closed and removed from your totals. Its history is kept.</>}
      </div>
      {hasBal && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--info-soft)', color: 'var(--text)' }}>
          <span aria-hidden="true" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, background: 'var(--info)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, fontStyle: 'italic' }}>i</span>
          <span>The money in this account will be removed from your plan. If you would like to keep it in your plan, you can transfer it to another account before closing this one.</span>
        </div>
      )}
    </>
  );
}

export function useCloseAccount() {
  const { data: S, applyData } = useStore();
  const { ask, notify } = useUI();
  const { money } = useMoney();
  const { closeDrawer } = useDrawer();
  const nav = useNavigate();
  const { pathname } = useLocation();

  return async accountId => {
    const acc = S.accounts.find(a => a.id === accountId);
    if (!acc) return;
    const cur = accountBalance(acc, S, currentMonth(), nowIso());
    const hasBal = Math.abs(cur) > 0.005;
    const ok = await ask({
      title: 'Close Account',
      body: <CloseAccountBody money={money} balance={cur} />,
      action: hasBal ? 'Adjust Balance & Close' : 'Close Account',
      tone: 'accent',
    });
    if (!ok) return;
    applyData(data => closeAccount(data, { accountId, currentBalance: cur }));
    closeDrawer();
    if (pathname === '/transactions/' + accountId) nav('/transactions');
    notify('“' + acc.nickname + '” closed.');
  };
}
```

- [ ] **Step 2: Verify the no-inline-components guard still passes**

Run: `npx vitest run tests/no-inline-components.test.js`
Expected: PASS (`CloseAccountBody` is module-scope).

- [ ] **Step 3: Verify the build compiles the new module**

Run: `npx vite build`
Expected: clean (the hook is imported in Task 3, but the module must parse now).

- [ ] **Step 4: Commit**

```bash
git add src/drawers/useCloseAccount.jsx
git commit -m "Close account: useCloseAccount hook + CloseAccountBody confirm modal"
```

---

### Task 3: Wire the button into the Edit Account drawer; remove the Status dropdown

**Files:**
- Modify: `src/drawers/AccountForm.jsx`

**Interfaces:**
- Consumes: `useCloseAccount` (Task 2).
- Produces: no new exports — the Edit Account drawer's editing branch now shows a "Close account" button instead of the `Active/Archived/Closed` select.

- [ ] **Step 1: Import the hook**

In `src/drawers/AccountForm.jsx`, add near the other drawer imports:

```jsx
import { useCloseAccount } from './useCloseAccount.jsx';
```

- [ ] **Step 2: Drop the Status-select machinery**

In `Body()`:
- Remove the `refs` line (`const refs = editing ? accountRefs(...) : null;`) and the whole `const statusWarn = …;` block (they existed only for the Status select).
- Change the calc import from `import { accountBalance, accountRefs, INST_KINDS } from '../lib/calc.js';` to `import { accountBalance, INST_KINDS } from '../lib/calc.js';` (drop `accountRefs`).
- Add `const runClose = useCloseAccount();` inside `Body()` (alongside the existing `useDrawer`/`useStore` hooks).

- [ ] **Step 3: Replace the editing branch body**

Replace the entire `{editing && ( … )}` block (the Status `<div>` + Working Balance `<div>`) with:

```jsx
{editing && (
  <>
    <div>
      <Label htmlFor="a-wbal">Working Balance</Label>
      <AmountField id="a-wbal" field="workingBalance" />
      <Hint>An adjustment transaction is created automatically if you change this amount.</Hint>
    </div>
    <div style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <button type="button" onClick={() => runClose(f.editId)} className="hv-neg-soft"
        style={{ height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Close account
      </button>
      <Hint>Removes it from your totals and the sidebar. History is kept — you can restore it later from Accounts.</Hint>
    </div>
  </>
)}
```

(The `status` field still rides along in the form and is written unchanged by `updateAccount` on a normal Save — no code change needed there.)

- [ ] **Step 4: Run the full suite and build**

Run: `npx vitest run --exclude '**/.claude/**'` — Expected: all green.
Run: `npx vite build` — Expected: clean (no unused-import or reference errors for `accountRefs`/`statusWarn`).

- [ ] **Step 5: Manual verification (dev server on 5207)**

- Open an account's ledger → pencil → Edit: the **Close account** button shows under Working Balance; the `Active/Archived/Closed` dropdown is gone.
- Click it → modal titled **"Close Account"** with the `−Rs{balance}` adjustment line and the info callout; confirm button reads **"Adjust Balance & Close"**.
- Confirm → a zeroing adjustment appears in the ledger/Recent Moves, the account leaves the sidebar, the view returns to All Accounts, toast "…closed."
- A zero-balance account → modal omits the adjustment line + callout, button reads **"Close Account"**, no adjustment created.
- Cmd+Z reverses the whole close in one step. The closed account appears under Accounts → **ARCHIVED** with Restore.
- On Cancel, the edit drawer is still there.

- [ ] **Step 6: Commit**

```bash
git add src/drawers/AccountForm.jsx
git commit -m "Close account: replace Status dropdown with a Close account button in the edit drawer"
```

---

## Self-Review notes

- **Spec coverage:** discoverable trigger (Task 3), balance-zeroing modal (Tasks 1–2), reversible close via existing Restore (unchanged), Archived folded out of the UI (Task 3 removes the select; the enum still restores). All covered.
- **Type consistency:** `closeAccount(data, { accountId, currentBalance })` is defined in Task 1 and consumed identically in Task 2; `useCloseAccount()` returns `(accountId) => Promise<void>`, called as `runClose(f.editId)` in Task 3.
- **No placeholders:** every code step contains the actual code.
- **Z-index note for the reviewer/implementer:** the confirm dialog (`zIndex: 50`) opens over the still-open edit drawer; if the drawer paints above it, close the drawer *before* awaiting `ask` instead. Verify during Task 3 Step 5.
