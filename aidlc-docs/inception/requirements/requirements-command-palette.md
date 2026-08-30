# Requirements — Command Palette (⌘K / Ctrl+K)

**Cycle**: 3 · **Date**: 2026-08-30 · **Status**: Approved

## Intent Analysis
- **User request**: "add ctrl + k feature for the whole app" with a UI modelled on the Cloudflare dashboard command palette (sidebar "Quick search… ⌘K" field + centered modal with Recents, fuzzy search, keyboard nav, search tips).
- **Request type**: New Feature (user-facing).
- **Scope estimate**: System-wide (a global overlay reachable from every screen; indexes the whole navigation surface, store data, and app actions).
- **Complexity estimate**: Moderate (single client-side feature, no backend, but touches routing, store, drawers/actions, sidebar, and mobile shell; needs a solid ranking function and full keyboard/a11y support).
- **Depth**: Standard.

## Context (Brownfield)
- React 18 + Vite SPA, HashRouter, Supabase backend, pnpm@10.33.4. Interactive primitives are built on **Base UI** (`@base-ui/react`) under `src/ui/primitives/` (repo convention).
- **Navigation surface** (from `src/App.jsx` + `src/components/Sidebar.jsx`):
  - Budget (`/budget`) → Plan (index), Recurring (`/budget/recurring`)
  - Reflect (`/reflect`) → Overview (index), Spending (`spending`), Trends (`trends`), Net Worth (`net-worth`), Income vs Expense (`income-expense`), Age of Money (`age-of-money`)
  - All Accounts / Transactions (`/transactions`, `/transactions/:accountId`)
  - Accounts (`/accounts`), Settings (`/settings`), Dev Tools (`/dev-tools`)
- **Data entities** (from `src/store`): accounts, categories (+ groups), payees, transactions, plans (multi-plan).
- **Actions**: add transaction (drawer), create category/group, switch plan, toggle theme, etc.

## Functional Requirements

### FR-1 — Global open/close
- FR-1.1 The palette opens from anywhere via `⌘K` (macOS) / `Ctrl+K` (Windows/Linux). `/` is a secondary open trigger when focus is not in a text input.
- FR-1.2 `Esc` closes the palette; closing returns focus to the element that had it before opening.
- FR-1.3 The shortcut must not fire while the user is typing in an input/textarea/contenteditable (except the palette's own input).
- FR-1.4 Opening is idempotent (pressing the shortcut while open does not stack overlays).

### FR-2 — Entry points (Q2=B)
- FR-2.1 A visible "Quick search… ⌘K" field in the **desktop sidebar** opens the same palette on click.
- FR-2.2 On **mobile** (Q5=A), a search affordance (search icon, e.g. in the header/tab shell) opens the palette as a full-screen sheet.
- FR-2.3 The displayed shortcut hint adapts to platform (`⌘K` on mac, `Ctrl K` elsewhere).

### FR-3 — Searchable content (Q1=C)
The index spans three result kinds:
- FR-3.1 **Pages** — every navigable route/tab listed above, with human labels and synonyms (e.g. "reports" → Reflect, "budget"/"plan").
- FR-3.2 **Data entities** — accounts, categories, payees (and plans). Selecting one navigates to its most relevant filtered view (e.g. an account → `/transactions/:accountId`).
- FR-3.3 **Actions/commands** — e.g. "Add transaction", "New category", "Switch plan → {plan}", "Toggle theme", "Go to Settings". Data-scoped actions may be parameterized (e.g. one entry per plan for "Switch plan").

### FR-4 — Result behaviour (Q4=A)
- FR-4.1 Selecting a **page/entity** result navigates (via router) and closes the palette.
- FR-4.2 Selecting an **action** performs it in place — opening the relevant drawer/modal (e.g. Add-Transaction drawer) or running the command directly — then closes the palette.
- FR-4.3 Every result exposes a stable `perform()` behaviour so keyboard `Enter` and mouse click are equivalent.

### FR-5 — Recents (Q3=A)
- FR-5.1 When opened with an empty query, show a **Recents** group of recently selected destinations/commands (most-recent first, capped, e.g. 5–7).
- FR-5.2 Recents persist per device (localStorage) and are resilient to unavailable/blocked storage (feature degrades to "no recents", never throws).
- FR-5.3 Recents are keyed to still-valid targets; stale entries (deleted account/category) are filtered out at read time.

### FR-6 — Matching & ranking (Q6=A)
- FR-6.1 Matching is **fuzzy, client-side** (subsequence/typo-tolerant) over an in-memory index — no network calls.
- FR-6.2 Ranking order: exact label match > prefix match > word-boundary match > fuzzy subsequence; ties broken by a recents/priority boost. Non-matches are excluded.
- FR-6.3 The match/rank logic is a **pure function** (input: query + index → ordered results) so it is unit- and property-testable independently of React.
- FR-6.4 Search is responsive on the app's realistic dataset (hundreds–low-thousands of entries) with no perceptible lag; the index is built/memoized, not recomputed per keystroke.

### FR-7 — Results UX & keyboard nav (Q7=A)
- FR-7.1 Results are **grouped by kind** (Pages, Accounts, Categories, Payees, Actions; Recents when empty).
- FR-7.2 Full keyboard nav: `↑`/`↓` move the active item across groups, `Enter` selects, `Esc` closes; the active item scrolls into view.
- FR-7.3 A footer hint bar shows "↑↓ navigate · ↵ select · esc close".
- FR-7.4 Each result shows an icon, primary label, and a secondary context label (e.g. "Application security" style — group/section it belongs to).
- FR-7.5 Empty-query state shows Recents (+ optionally a short "jump to" set); no-match state shows a clear "No results" message.

### FR-8 — Scope (v1 exclusions)
- FR-8.1 **No scoping prefixes** (`>`/`@`/`#`/`ask:`) in v1 (Q8=B) — one unified fuzzy search. (Deferred; the grouped index makes prefixes cheap to add later.)
- FR-8.2 No AI / natural-language "ask" integration in this cycle.
- FR-8.3 No server-side or cross-device search history.

## Non-Functional Requirements
- NFR-1 **Performance**: open latency and per-keystroke filtering feel instant (<~50ms typical) on the target dataset; index construction memoized.
- NFR-2 **Accessibility**: dialog uses proper ARIA roles/labels, focus trap, `aria-activedescendant` (or roving tabindex) for the active option, screen-reader-announced results count; fully operable by keyboard alone. (Built on Base UI Dialog which provides focus management.)
- NFR-3 **Responsive**: centered modal on desktop; full-screen sheet on mobile; respects existing theme tokens (light/dark) and 16px-radius conventions.
- NFR-4 **Offline-safe**: works with no network; localStorage access wrapped in try/catch (per app conventions).
- NFR-5 **Maintainability**: the index is declarative and derived from a single source of truth for routes/actions so new pages/actions are trivial to register; palette is a self-contained module.
- NFR-6 **Consistency**: overlay built on `@base-ui/react` via `src/ui/primitives/`, matching every other interactive primitive.
- NFR-7 **i18n/copy**: English-only (app convention); labels centralized for future localization.

## Extension Compliance (posture for later stages)
- **Security Baseline = ENABLED (blocking).** Most rules concern backend/infra/auth and will be **N/A** for a client-only, no-new-endpoint feature. Applicable ones to honor: **SECURITY-05** (treat any user-typed query as untrusted — no injection into `dangerouslySetInnerHTML`, render as text), **SECURITY-08** (the palette must never surface data the signed-in user can't already access — it indexes only in-memory store data already gated by Supabase RLS; no new data path), **SECURITY-15** (fail-safe: storage/index errors degrade gracefully, never crash the app or leak internals). No secrets, no PII in any logging.
- **PBT = PARTIAL** (PBT-02/03/07/08/09). Primary target: the pure **match/rank function** (FR-6.3) — invariants (PBT-03: results are a subset of the index; ranking is a total order / stable; a query that is a substring of a label always matches it), generator quality (PBT-07: realistic label/query generators), reproducibility (PBT-08), framework already present (**fast-check**, PBT-09).
- **Resiliency = DISABLED** (no new backend/infra).

## Success Criteria
- `⌘K`/`Ctrl+K` (and the sidebar field / mobile icon) open a palette from any screen.
- Typing fuzzily finds pages, accounts, categories, payees, and actions; `Enter` navigates or performs the action; `Esc` closes.
- Recents appear on empty open and persist per device.
- Fully keyboard-operable and accessible; works in light/dark and on phone.
- Match/rank function covered by example-based **and** property-based tests; full suite + build green.

## Out of Scope (this cycle)
- Scoping prefixes, AI "ask", server-side history, command palette for admin-only/back-office tooling beyond existing routes.
