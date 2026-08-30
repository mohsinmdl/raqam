# Requirements — Structured Transaction Search (Cycle 4)

**Status**: Approved (autonomous /goal run — recommended answers accepted by user directive "get it done end to end", 2026-08-30)
**Depth**: Standard (single-screen, client-only, no schema/infra change)

## 1. Intent

Raqam's register search box (Transactions screen) is a plain free-text filter: it
matches a substring across merchant, notes, category, and account/card names.
The user wants it to become a **structured search with suggestions**, mirroring
YNAB's register search shown in the reference screenshots: as you type, a
dropdown offers typed interpretations of the query, and picking one filters the
visible rows to that facet.

## 2. Functional requirements

- **FR-1** — As the user types a non-empty query, a suggestion dropdown appears
  under the field offering interpretations of that query.
- **FR-2** — Suggestion families (each, when the query is relevant to it):
  - **Account** — accounts/cards whose name contains the query → filter to rows
    touching that account (either side of a transfer).
  - **Category** — categories whose name contains the query → filter to that
    category (exact).
  - **Is: status** — Cleared / Uncleared. *(Adaptation: Raqam's schema stores no
    "reconciled" state, only cleared vs pending; the honest facet is
    Cleared/Uncleared, not YNAB's Reconciled/Unreconciled.)*
  - **Is: Needs Category** — the real uncategorised-money flag.
  - **Date** — On / On-or-before / On-or-after a parsed date. A bare day (e.g.
    "02") resolves within the currently viewed month (DD/MM/YYYY).
  - **Amount** — Outflow / Inflow, equals / ≥ / ≤ a numeric value. A numeric
    query fixes the value; typing "outflow"/"inflow" surfaces the facet at 0.00.
  - **Field text** — Find "q" in any field (the default), the Payee, the
    Category, or the Memo.
- **FR-3** — Picking a suggestion applies its filter and narrows the rows;
  an in-field chip names the active facet, with a ✕ to remove it.
- **FR-4** — One structured facet is active at a time. Typing returns to
  free-text mode (clears the facet); the field's ✕ clears everything.
- **FR-5** — Full keyboard support: arrow keys move the highlight, Enter takes
  the highlighted suggestion, Enter with no highlight keeps free text, Escape
  closes the dropdown.
- **FR-6** — Back-compatible: typing a query and pressing Enter without picking
  behaves exactly as today (free-text substring over any field).
- **FR-7** — Available on both the desktop toolbar field and the phone search row.

## 3. Non-functional requirements

- **NFR-1 (correctness)** — The predicate a picked suggestion applies must match
  the suggestion it came from; outflow/inflow derivation must mirror the
  register's two columns (txRowOf). Pure, unit-tested.
- **NFR-2 (no regression)** — Existing free-text search, the scheduled-group
  suppression under an active filter, running-balance eligibility, and the
  "reveal a linked row" jump must all keep working. Full suite stays green.
- **NFR-3 (a11y)** — The dropdown is a proper combobox listbox (built on the
  project's Base UI Combobox primitive); options are reachable and announced.
- **NFR-4 (perf)** — Suggestion generation is O(accounts+categories) per
  keystroke over an in-memory store; memoised on (query, term, store).

## 4. Out of scope (follow-ups)

- Stacking multiple facets as several chips (YNAB allows AND-ed filters). This
  cycle ships a single active facet; the model (`term`) is shaped so a future
  `terms[]` is a small extension.
- YNAB's "Income: <month>" budget-month facet (a budgeting concept without a
  direct Raqam analogue).
- Reconciliation status (the schema has no reconciled state).

## 5. Extension compliance

- **Security Baseline (enabled)** — N/A-to-mostly: no new I/O, network, auth, or
  persistence; input is in-memory query text, no injection surface. Compliant.
- **Resiliency Baseline (disabled)** — skipped per state config.
- **Property-Based Testing (partial)** — the pure predicate/suggestion functions
  are covered by example-based unit tests; PBT optional here (advisory tier).
