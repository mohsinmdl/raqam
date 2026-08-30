# Requirements Clarification — Command Palette (Ctrl/Cmd + K)

**Feature**: A global command palette for the whole app, opened with `⌘K` / `Ctrl+K`, modelled on the Cloudflare dashboard (a sidebar "Quick search… ⌘K" field that opens a centered modal with a Recents group, fuzzy search over products/pages/features, and prefix "search tips").

**How to answer**: Each question already has a **recommended answer pre-filled** after `[Answer]:`. Skim them — change any letter you disagree with (or use `X) Other` and type your own). Reply "done" (or "looks good") when you're happy and I'll generate the requirements document.

---

## Question 1 — What should the palette be able to find?
The reference searches "products, pages, and features". For Raqam, what belongs in the results?

A) **Navigation only** — pages/tabs (Budget, Reflect, All Accounts, Spending, Trends, Net Worth, Accounts, Settings…)

B) **Navigation + your data** — the above plus jumping to a specific account, category, or payee

C) **Navigation + data + actions** — all of the above plus commands like "Add transaction", "New category", "Switch plan", "Toggle theme" (the full "do anything from the keyboard" experience)

X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 2 — How do you open it?
The Cloudflare screenshots show two entry points at once.

A) **Keyboard shortcut only** — `⌘K` (mac) / `Ctrl+K` (win/linux), plus `/` as a secondary trigger

B) **Both** — the keyboard shortcut *and* a visible "Quick search… ⌘K" field in the sidebar that opens the same palette on click (matches the reference)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 3 — Recents
The reference shows a "Recents" group at the top of an empty palette.

A) **Yes** — remember recently visited destinations (per device) and show them when the palette opens with no query

B) No — always open to an empty/blank state

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4 — What happens when you pick a result?
For non-navigation results (an action, or a data entity).

A) **Perform it in place** — actions open the relevant drawer/modal (e.g. the Add-Transaction drawer) or run immediately; entities navigate to the right filtered view

B) Navigate only — everything just routes to a page; no drawers/actions triggered from the palette

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5 — Mobile
Raqam has a phone layout (MobileTabBar). Cloudflare's palette is desktop-oriented.

A) **Desktop-first, mobile reachable** — full `⌘K`/`Ctrl+K` on desktop; on phone, a search affordance (e.g. a search icon) opens the same palette as a full-screen sheet

B) **Desktop only** for now — ship `⌘K` on desktop, defer any mobile entry point to a follow-up

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 6 — Matching behaviour
How forgiving should the search be?

A) **Fuzzy, client-side** — subsequence/typo-tolerant matching over an in-memory index (fast, works offline, no backend calls) with sensible ranking (exact > prefix > fuzzy, recents boosted)

B) Simple substring/prefix only — no fuzzy matching

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 7 — Result grouping & keyboard UX
The reference groups results (Recents / results / Search tips) and shows "↑↓ to navigate, ↵ to select, Esc to close".

A) **Grouped + full keyboard nav** — results grouped by type (Pages, Accounts, Categories, Actions…), arrow-key navigation, Enter to select, Esc to close, with the footer hint bar

B) Flat list, keyboard nav, no grouping

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 8 — Prefix "search tips" (scoped search)
Cloudflare offers prefixes like `ask:` and `access:` to scope a search. Do you want scoping prefixes?

A) **Yes, a small set** — e.g. `>` for actions/commands, `@` for accounts, `#` for categories (nice power-user affordance, cheap to add given the index already exists)

B) No prefixes for v1 — one unified fuzzy search is enough; consider prefixes later

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 9 — Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 10 — Resiliency Extensions
Should the resiliency baseline (AWS Well-Architected Reliability directional best practices) be applied?

A) Yes — apply the resiliency baseline as directional design-time guidance

B) No — skip the resiliency baseline (suitable for a client-only UI feature with no new backend/infra)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 11 — Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced?

A) Yes — enforce all PBT rules as blocking constraints

B) Partial — enforce PBT only for pure functions and serialization round-trips (fits this feature: the fuzzy-match/ranking function is a pure function worth property-testing; the rest is UI)

C) No — skip all PBT rules

X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Note on implementation (not a question — FYI)
Per the repo convention, the palette overlay will be built on **Base UI** (`@base-ui/react`) via `src/ui/primitives/` (Dialog primitive), consistent with every other interactive primitive in the app. Nothing here needs a backend — the search index is built client-side from the store you already have.
