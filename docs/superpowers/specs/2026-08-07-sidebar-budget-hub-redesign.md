# Sidebar + Budget Hub Redesign — Design Spec

**Date:** 2026-08-07
**Status:** Approved for planning
**Screens/areas touched:** `Sidebar.jsx`, `Header.jsx`, routing (`App.jsx`), a new `BudgetHub`, and the existing `Budgets` / `Categories` / `Recurring` / `AccountDetail` screens (re-homed, not rewritten).

---

## 1. Goal

Turn the left sidebar into the primary way to see and reach money in Raqam: a **trimmed 3-item nav**, a **live list of accounts with balances** under All Accounts, and a **bottom identity block** whose menu consolidates the settings currently scattered across the app. In the same effort, give the trimmed nav a safe home for the demoted screens by turning Budgets into a **Budget hub** with Categories and Recurring as tabs.

This is one cohesive redesign (the user chose a single combined spec). It has three coupled pieces:

1. **Account list in the sidebar** under All Accounts.
2. **Budget hub** — prerequisite for trimming the nav (otherwise Categories/Recurring become unreachable).
3. **Bottom user menu** consolidating identity + theme + hide-amounts + sign out + reset.

## 2. Non-goals (YAGNI)

- **Sidebar collapse-to-icons** (the chevron in the reference screenshot). Possible follow-up, not built now.
- **A full Settings screen.** The menu's "Settings" links to the existing `/settings` placeholder, which stays a stub.
- **Account/category/type filters on Transactions.** These were deliberately removed earlier; not reinstated. Clicking an account goes to its detail screen, not a Transactions filter.
- **Grouping the account list** (by kind or type). Explicitly chosen flat.
- **Credit cards in the sidebar list.** The list and its total are accounts-only.

## 3. Current state (grounding)

- **Sidebar** — `src/components/Sidebar.jsx`, mounted in `src/App.jsx` grid (`236px` column). Nav = two arrays: `MAIN` (`dashboard`→"Dashboard", `transactions`→"All Accounts", `accounts`→"Accounts", `budgets`→"Budgets", `recurring`→"Recurring", `categories`→"Categories") and `PLANNED` (`reports`, `settings`, rendered small). Items are `react-router` `NavLink`s via `NavButton`. Active style = `background: var(--soft)`, `color: var(--text)`, `fontWeight: 600`, 6×6 accent dot; inactive = `--muted`, weight 500. Brand block at top; a `footer` prop renders `<DataControls/>`.
- **Accounts model** — `data.accounts`; shape `{ id, instId, nickname, type, currency:'PKR', last4, status, notes, createdAt }`. Grouping "kind" comes from the linked institution (`instId` → `INSTITUTIONS`, `kind ∈ Conventional/Islamic/Foreign/Microfinance/Digital/Custom`). Status ∈ `active`/`archived`/`closed`; Accounts screen shows `active`.
- **Balances** — `src/lib/calc.js`: `accountBalance(acc, store, month, now)` = opening snapshot + month deltas. `monthMetrics(store, month, now)` → `totalBank` (Σ active `accountBalance`), `cardLiability`, `netWorth`. The sidebar shows **no** balances today.
- **Identity/auth** — Supabase (`src/auth/AuthProvider.jsx`); `useAuth()` → `user.email`, `signOut`. **No display name / plan name exists.** Footer `DataControls` shows "ACCOUNT" + email, plus Sign out and Reset-all-data.
- **Prefs** — device prefs (localStorage `raqam.prefs.v1`) `{ theme, masked }` via `PrefsProvider`; per-user prefs (`raqam.prefs.u.${uid}`, currently `skippedSetup`) via `StoreProvider`. `useStore()` exposes merged `prefs` + `setPrefs` (routes `theme`/`masked` → device, rest → user). Theme + Hide-amounts toggles currently live in `Header.jsx`, not a menu.
- **Sidebar account list** — does not exist; "All Accounts" is only the label of `/transactions`. Per-account views go through the Accounts screen → `/accounts/:id` (`AccountDetail`).
- **Styling** — `src/styles/theme.css` tokens (`--bg`, `--surface`, `--elev`, `--text`, `--muted`, `--accent`, `--accent-h`, `--on-accent`, `--soft`, `--border`, `--neg`, `--pos`, `--warn`, `--info` + `-soft`/`--on-*`), inline `style={{}}` objects, `IBM Plex Sans`. Helper classes `.hv-elev`, `.tnum`, etc.

## 4. Design

### 4.1 Sidebar nav (top)

Three items, keeping the existing `NavButton` styling (active = `--soft` + accent dot):

| Label | Route | Notes |
|-------|-------|-------|
| **Budget** | `/budget` | The hub (§4.4). Active on `/budget` and its sub-tabs. |
| **Dashboard** | `/dashboard` | Unchanged. |
| **All Accounts** | `/transactions` | Route + label unchanged. Active on `/transactions`. |

Removed from nav: the standalone **Accounts** item (folded into the account list), and **Budgets/Recurring/Categories** as separate items (folded into the Budget hub). `PLANNED` (Reports/Settings) is removed from the nav; Settings is reachable from the user menu.

### 4.2 Account list (sidebar body, under All Accounts)

- Always visible beneath the nav. **Flat**, sorted by balance descending.
- **Section header row:** `ACCOUNTS` label (left) + **grand total** (right) = `monthMetrics(store, currentMonth, now).totalBank` over active accounts. Total reconciles with the visible rows (accounts-only, excludes card liability).
- **One row per active account** (`status==='active'`): truncated `nickname` (left) + live balance (right). Balance = `accountBalance(acc, store, currentMonth, now)`. Negative balances use `--neg`, weight 600. Amounts use `.tnum` + the app's money formatter.
- **Row click →** `/accounts/:id` (`AccountDetail`). A row shows the active highlight when its detail is open (match on `/accounts/:id`).
- **`+ Add account`** as the final row → reuses the existing add-account flow used by the Accounts screen. *(Assumption to confirm in planning: the exact opener — a drawer opener in `src/drawers/openers.js` or navigation to the Accounts add form.)*
- **Scroll:** the list is the only vertical-scrolling region; nav (above) and user block (below) stay pinned. On overflow the list gets its own `overflow-y:auto`.
- **Masking:** balances and the total render as `₨•••` when `prefs.masked` is true.

### 4.3 Identity + user menu (sidebar bottom)

Replaces the current `DataControls` footer.

**Pinned identity row:** avatar (first letter of the display name, uppercased) + display name + email + up-caret. Click toggles the menu.

**Display name** — new per-user pref **`prefs.displayName`** (string), stored with the per-user prefs (`raqam.prefs.u.${uid}`, alongside `skippedSetup`), routed through `StoreProvider`'s `setPrefs` (non-device key → user prefs). Resolution order for the shown name: `prefs.displayName` → email local-part title-cased → email. Editable from the menu (a small inline field or a lightweight edit row).

**Menu** — an upward popover (anchored to the identity row), consolidating today's scattered controls:

| Item | Action |
|------|--------|
| Display name (edit) | Sets `prefs.displayName`. |
| **Appearance** | Toggles `prefs.theme` (light/dark). **Moved out of `Header.jsx`.** |
| **Hide amounts** | Toggles `prefs.masked`. **Moved out of `Header.jsx`.** |
| **Settings** | Links to `/settings` (existing placeholder; stays a stub). |
| — divider — | |
| **Sign out** | `signOut()` from `useAuth` (moved from `DataControls`). |
| **Reset all data** | Destructive (red); keeps its existing confirm dialog (moved from `DataControls`). |

**Consequence — `Header.jsx` change:** the theme and hide-amounts buttons are **removed** from the Header and now live only in this menu.

### 4.4 Budget hub

- Nav **Budget** → `/budget`: a parent screen with a tab bar **Budget · Categories · Recurring**.
- **Nested, deep-linkable routes:** `/budget` (Budget tab, default), `/budget/categories`, `/budget/recurring`.
- **Redirects:** old paths `/budgets`, `/categories`, `/recurring` redirect to the new equivalents so existing links/bookmarks keep working.
- The three existing screen components (`Budgets`, `Categories`, `Recurring`) become the tab panels **unchanged** — re-homed under a shared tab header. Label "Budgets" → "Budget". Active-tab styling consistent with the app's existing patterns.

## 5. Data / derivation

- **As-of:** the sidebar always shows **live balances as of today** — current calendar month (from `MonthContext`) + `now` — deliberately independent of any screen's selected date range, because the sidebar is persistent chrome.
- **Account rows:** `data.accounts.filter(a => a.status === 'active')`, each mapped to `{ id, nickname, balance: accountBalance(a, store, month, now) }`, sorted by `balance` desc.
- **Total:** `monthMetrics(store, month, now).totalBank`.
- **Display name:** derivation/fallback as in §4.3.
- **Masking + toggles:** `prefs.masked` gates amount rendering; menu toggles call the existing `setPrefs({ theme })` / `setPrefs({ masked })`.

## 6. States / edge cases

- **No accounts (fresh user):** quiet empty state under `ACCOUNTS` ("No accounts yet") + the Add-account row; total shows `₨0`.
- **Tall list:** list scrolls; nav + user block pinned.
- **Long names:** truncate with ellipsis (existing pattern).
- **Negative balance:** `--neg`.
- **Active highlighting:** All Accounts on `/transactions`; account row on its `/accounts/:id`; Budget on `/budget` + sub-tabs.
- **Reset all data:** retains its existing destructive confirmation.
- **Display name empty/whitespace:** falls back to email local-part, then full email.
- **Masked:** balances + total → `₨•••`.

## 7. Component structure

- `Sidebar.jsx` = 3 nav items (`NavButton`) + `<AccountList/>` + `<SidebarUser/>`.
- **New components:**
  - `AccountList` — derives active accounts + balances + total, renders rows and the Add-account row. One clear job: present accounts in the sidebar.
  - `SidebarUser` — identity row + owns the `UserMenu` open/close state.
  - `UserMenu` — the upward popover: display-name edit, Appearance, Hide amounts, Settings, Sign out, Reset all data.
  - `BudgetHub` — tab shell wrapping the existing `Budgets`/`Categories`/`Recurring` screens; drives the nested routes.
- **Reused/unchanged:** `NavButton`, theme tokens, `monthMetrics`/`accountBalance`, `AccountDetail`, `MonthContext`, existing reset-confirm dialog, `PositionStrip`.
- **Removed:** `DataControls` from the footer (its sign-out/reset logic moves into `UserMenu`); the standalone Accounts nav item; the Header's theme + hide-amounts buttons.

## 8. Testing

- **Pure-logic (vitest, in CI — no jsdom):**
  - Account list derivation: active-only filter; sort by balance desc; total equals the sum of the listed rows; masked formatting produces the masked string.
  - Display-name resolution: `displayName` set → used; unset → email local-part title-cased; empty/whitespace → email.
  - Routing: `/budgets`, `/categories`, `/recurring` redirect to the new paths; `/budget` defaults to the Budget tab.
  - Existing suite stays green.
- **UI/interaction (not in CI):** menu opens/closes, active states, empty state — verified via the throwaway Vite-harness pattern during implementation (auth gate + no jsdom; mount real components, stub providers via a `resolveId` plugin).

## 9. Open items to confirm during planning

1. **Add-account opener** — exact mechanism (drawer opener vs navigate to the Accounts add form).
2. **Route consolidation mechanics** — whether the redirects live in `App.jsx` route config or as `<Navigate>` elements, and whether any in-app links to `/budgets`/`/categories`/`/recurring` need updating alongside the redirects.
3. **Display-name edit affordance** — inline field inside the menu vs a tiny dedicated row; pick during planning based on menu layout.
