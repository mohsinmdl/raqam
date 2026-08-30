# User Stories — Command Palette (Cycle 3)

INVEST stories with Given/When/Then acceptance criteria. Feature-based breakdown, medium granularity. Traceability tags map to `requirements-command-palette.md` (FR-*/NFR-*).

---

## US-1 — Open and close from anywhere · (FR-1)
**As** any user, **I want** to open the command palette with a keystroke from any screen, **so that** I can act without hunting through the UI.

- **AC1** — Given I am on any screen, When I press `⌘K` (mac) or `Ctrl+K` (win/linux), Then the palette opens focused on its input.
- **AC2** — Given the palette is open, When I press `Esc`, Then it closes and focus returns to where it was.
- **AC3** — Given focus is in a normal text field, When I press `⌘K`/`Ctrl+K`, Then the palette still opens (the shortcut is global). `/` opens the palette only when I am *not* typing in a field.
- **AC4** — Given the palette is already open, When I press the open shortcut again, Then no second overlay stacks.

## US-2 — Sidebar & mobile entry points · (FR-2, NFR-3)
**As** a mouse/touch user, **I want** a visible way to open the palette, **so that** I don't have to know the shortcut.

- **AC1** — Given I'm on desktop, When I look at the sidebar, Then I see a "Quick search… ⌘K" field; clicking it opens the palette.
- **AC2** — Given I'm on a phone, When I tap the header search icon, Then the palette opens as a full-screen sheet.
- **AC3** — Given a non-mac platform, Then the hint reads "Ctrl K" rather than "⌘K".

## US-3 — Find and open any page · (FR-3.1, FR-4.1)
**As** a user, **I want** to fuzzy-search pages and tabs, **so that** I can jump to them instantly.

- **AC1** — Given the palette is open, When I type "spend", Then "Spending" (Reflect) ranks at/near the top.
- **AC2** — When I type a synonym like "reports", Then "Reflect" appears (synonym match).
- **AC3** — When I press Enter on a page result, Then the app navigates there and the palette closes.

## US-4 — Find my data · (FR-3.2, FR-4.1)
**As** the Existing Budgeter, **I want** to search my accounts, categories, payees, and plans, **so that** I can jump straight to one.

- **AC1** — Given I type part of an account nickname, Then that account appears under an "Accounts" group; Enter navigates to its register (`/transactions/:id`).
- **AC2** — Given I type a category name, Then it appears under "Categories"; Enter navigates to the Budget screen (its home).
- **AC3** — Given a payee name, Then it appears under "Payees".
- **AC4** — Deleted/hidden entities (hidden payees, archived categories, transfer-mirror payees) never appear.

## US-5 — Run actions · (FR-3.3, FR-4.2)
**As** the Power User, **I want** to trigger app actions from the palette, **so that** I never reach for a menu.

- **AC1** — Given I type "add", Then "Add transaction" appears; Enter opens the Add-Transaction flow (desktop inline / phone sheet, same as `Shift+N`).
- **AC2** — Given I type "theme", Then "Toggle light / dark mode" appears; Enter flips the theme and closes.
- **AC3** — Given I have multiple plans, When I type "switch", Then one "Switch plan → {name}" entry per *other* plan appears; Enter switches.
- **AC4** — Actions include at least: Add transaction, New category, New account, Manage payees, Toggle theme, Hide/Show amounts, plus per-plan switch.

## US-6 — Recents · (FR-5)
**As** a returning user, **I want** the palette to remember where I've been, **so that** repeat trips are one keystroke.

- **AC1** — Given I have selected results before, When I open the palette with an empty query, Then a "Recents" group shows my most-recent selections (newest first, capped).
- **AC2** — Given a recent target no longer exists, Then it is silently omitted.
- **AC3** — Given device storage is unavailable/blocked, Then the palette still opens and works (Recents simply empty) — no crash.

## US-7 — Grouped results & keyboard navigation · (FR-7)
**As** the Power User, **I want** grouped, keyboard-drivable results, **so that** I can operate entirely by keyboard.

- **AC1** — Results are grouped by kind (Recents when empty; else Pages, Accounts, Categories, Payees, Actions).
- **AC2** — `↑`/`↓` move a single highlighted item across group boundaries; the active item scrolls into view; `Enter` activates it.
- **AC3** — A footer shows "↑↓ navigate · ↵ select · esc close".
- **AC4** — An empty query shows Recents (or a short default set); a query with no matches shows a clear "No results" message.

## US-8 — Accessibility · (NFR-2)
**As** a screen-reader / keyboard-only user, **I want** the palette to be fully accessible, **so that** I can use it like everyone else.

- **AC1** — The overlay is a dialog with an accessible name, focus is trapped inside, and focus restores on close.
- **AC2** — The input exposes the active option (aria-activedescendant or equivalent) and a live results count.
- **AC3** — Every result is reachable and activatable by keyboard alone.

## US-9 — Instant feel / performance · (NFR-1, FR-6.4)
**As** any user, **I want** the palette to feel instant, **so that** it never gets in my way.

- **AC1** — Given a realistic dataset (hundreds–low-thousands of items), When I type, Then filtering updates with no perceptible lag.
- **AC2** — The index is built/memoized, not rebuilt on every keystroke.

## US-10 — Match/rank engine (quality) · (FR-6.3, PBT-02/03/07/08/09)
**As** the team, **I want** the fuzzy match/rank logic to be a pure, well-tested function, **so that** ranking is correct and regressions are caught.

- **AC1** — `rankItems(query, items)` is pure (no React/DOM/store), deterministic, and returns a subset of the input items ordered by relevance.
- **AC2** — Ranking order honors exact > prefix > word-boundary > subsequence, with a recents/priority boost; non-matches excluded.
- **AC3** — Covered by example-based tests **and** property-based tests (fast-check): results ⊆ input; empty query → all/curated; a substring of a label always matches that label; ordering is a stable total order; no throw on odd input (unicode, empty, very long).
