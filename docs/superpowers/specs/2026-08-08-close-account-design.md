# Close Account — a discoverable, YNAB-style close flow

**Date:** 2026-08-08
**Status:** Approved design (pending spec review)
**Branch:** `worktree-account-ledger` (continues the per-account ledger work)

## Problem

After folding the account detail page into the scoped Transactions ledger, there is **no discoverable way to close/delete an account**. The only path is a buried `Active / Archived / Closed` `<select>` inside the Edit Account drawer — and that path does not even zero the balance, so a "closed" account can still be holding money. Users can't find it, and it does the wrong thing when found.

## Goal

A clear **"Close account"** action that stops tracking an account while keeping its history, matching YNAB's close flow: warn that the balance must be zeroed, create the zeroing adjustment on confirm, and note that the money leaves the plan unless transferred first. Closing is reversible.

## Decisions locked in brainstorming

- **Intent:** "Stop tracking, keep history." Closing hides the account from totals and the sidebar but preserves every transaction. Reversible.
- **Trigger:** A danger-styled **"Close account"** button at the bottom of the **Edit Account drawer** (pencil → Edit → Close account). Matches YNAB; keeps the ledger header clean.
- **Fold Archived into Closed (user-facing):** Remove the `Active / Archived / Closed` `<select>`. "Close account" is the only user-facing hide action. The `archived` status value stays in the data model so any already-archived accounts still restore correctly.
- **Reuse the existing confirm dialog:** `ConfirmDialog` renders `{confirm.body}` as a raw child, so `ask({ title, body: <JSX>, action, tone: 'accent' })` reproduces the mockup (centered modal, info callout, blue confirm button) without a new component.

## The modal (matches the provided mockup)

Built via `useUI().ask(...)`:

- **Title:** "Close Account"
- **Body (balance ≠ 0):** "Before you can close this account, the balance will have to be zeroed out. An adjustment transaction will be created for **{money(−balance)}**." followed by the info callout: "The money in this account will be removed from your plan. If you'd like to keep it, transfer it to another account before closing this one."
- **Body (balance = 0):** "This account will be closed and removed from your totals. Its history is kept." No adjustment sentence, no callout.
- **Buttons:** `Cancel` / **`Adjust Balance & Close`** (`tone: 'accent'`). When the balance is already 0, the confirm button reads **`Close Account`**.

`money()` comes from `useMoney()` (`src/lib/format.js`); a negative amount already renders with a leading `−Rs`. Balance epsilon: treat `Math.abs(balance) <= 0.005` as zero (money is 2-dp PKR).

## Approach

### 1. Pure store action — `src/store/actions.js`

Add a single reducer so close is one undo step and is unit-testable without React:

```js
// Close an account: zero its balance (if any) with an adjustment, then mark it
// closed. One reducer → one undo step. `currentBalance` is passed in by the
// caller (already computed for the modal copy) so this stays pure.
export function closeAccount(data, { accountId, currentBalance }) {
  const hasBal = Math.abs(currentBalance) > 0.005;
  const zeroed = hasBal
    ? adjustBalance(data, { accountId, delta: -currentBalance, reason: 'Balance zeroed on account close', date: todayStr(), currentBalance })
    : data;
  return setAccountStatus(zeroed, { accountId, status: 'closed' });
}
```

Reuses `adjustBalance` and `setAccountStatus` (already in `actions.js`). No new audit plumbing — both helpers already stamp audit entries.

### 2. Hook + modal body — `src/drawers/useCloseAccount.jsx` (new)

- `CloseAccountBody({ money, balance })` — returns the JSX body (heading sentence conditional on `balance`, plus the info callout when `balance ≠ 0`). Styling copied from the existing callout pattern (`var(--info-soft)` box, matching the mockup).
- `useCloseAccount()` — returns `async (accountId) => { … }`:
  1. `const acc = S.accounts.find(a => a.id === accountId); if (!acc) return;`
  2. `const cur = accountBalance(acc, S, currentMonth(), nowIso());`
  3. `const ok = await ask({ title: 'Close Account', body: <CloseAccountBody money={money} balance={cur} />, action: Math.abs(cur) > 0.005 ? 'Adjust Balance & Close' : 'Close Account', tone: 'accent' });`
  4. `if (!ok) return;`
  5. `applyData(data => closeAccount(data, { accountId, currentBalance: cur }));`
  6. `closeDrawer();`
  7. If currently on that account's scoped ledger (`pathname === '/transactions/' + accountId`) → `nav('/transactions')`; otherwise stay put (the Accounts list re-renders the row into ARCHIVED).
  8. `notify('“' + acc.nickname + '” closed.');`

  Hooks used: `useStore` (`S`, `applyData`), `useUI` (`ask`, `notify`), `useMoney` (`money`), `useDrawer` (`closeDrawer`), `useLocation` + `useNavigate`.

The confirm dialog opens over the still-open edit drawer (confirm `zIndex: 50`); on Cancel the user returns to the edit form. Verify the drawer's z-index is below 50 during implementation.

### 3. Edit drawer — `src/drawers/AccountForm.jsx`

- Remove the Status `<select>` block (the `Active / Archived / Closed` field) and the now-unused `statusWarn` / `refs` / `accountRefs` computation tied to it.
- Keep the Working Balance field.
- At the bottom of the `editing` branch, add a danger-styled **"Close account"** button:

```jsx
<button type="button" onClick={() => runClose(f.editId)}
  className="hv-neg-soft"
  style={{ height: 36, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
  Close account
</button>
```

where `const runClose = useCloseAccount();` (named `runClose` locally to avoid colliding with the `closeAccount` store action and the drawer's `closeDrawer`). The hook itself calls `closeDrawer` on success.

## Reversibility (unchanged, already built)

A closed account leaves the sidebar and totals and appears in **Accounts → ARCHIVED**, where **Restore** (`setAccountStatus(..., 'active')`) brings it back and **Delete** appears only once `accountDeletePolicy` reports nothing references it. Cmd+Z immediately after closing reverses the whole close (adjustment + status) as one step.

## Out of scope (YAGNI)

- No transfer-to-another-account flow — the callout is advisory copy only.
- No change to permanent-delete gating (`accountDeletePolicy`) or the ARCHIVED section.
- No "still in use" warning in the close modal — closing is reversible and history is always kept.

## Files

- **Create:** `src/drawers/useCloseAccount.jsx`
- **Modify:** `src/store/actions.js` (add `closeAccount`), `src/drawers/AccountForm.jsx` (drop Status select, add Close button)
- **Test:** `tests/close-account.test.js` (new)

## Reused functions (do not reinvent)

- `accountBalance`, `accountDeletePolicy` — `src/lib/calc.js`
- `adjustBalance`, `setAccountStatus` — `src/store/actions.js`
- `ask` (accepts JSX `body`, `tone`) — `src/ui/UIProvider.jsx` / `ConfirmDialog.jsx`
- `useMoney` — `src/lib/format.js`

## Verification

**Unit (vitest), `tests/close-account.test.js`:**
- `closeAccount(data, { accountId, currentBalance: 10660 })` → account status `closed`, and exactly one new `adjustment` transaction for that account with `amount === -10660` (net balance now 0).
- `closeAccount(data, { accountId, currentBalance: 0 })` → status `closed`, **no** adjustment transaction created.
- Negative balance (e.g. −360, an overdraft/credit): adjustment `amount === 360`, balance nets to 0.
- Keep the full suite green; `vite build` clean.

**Manual (dev server, branch):**
- Open an account's ledger → pencil → Edit → **Close account** button is visible (Status dropdown is gone).
- Click it: modal titled "Close Account" shows the `−Rs{balance}` adjustment line + info callout; confirm button reads "Adjust Balance & Close".
- Confirm → a zeroing adjustment appears in the ledger/Recent Moves, the account drops out of the sidebar, and the view returns to All Accounts. Toast "…closed."
- Account with a zero balance → modal omits the adjustment line/callout, button reads "Close Account", no adjustment is created.
- Cmd+Z reverses the close in one step. The closed account shows under Accounts → ARCHIVED with Restore.
