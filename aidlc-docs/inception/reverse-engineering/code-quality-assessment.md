# Code Quality Assessment

## Test Coverage
- **Overall**: Good for domain logic; none (automated) for rendered UI.
- **Unit Tests**: **90 vitest files** — 80 in `tests/`, 10 colocated in `src/` — covering the layers where money can go wrong: store actions (transactions, envelope moves, category/group CRUD, recurring, payees, undo), envelope/RTA math (`envelope.test.js`, `envelope.rta.test.js`, `rtaBreakdown`, `left-to-spend`, `targets`), sync contracts (`sync-envelope`, `sync-payees`, `sync-recurring`, `audit-fetch`, `hydrate-retry` — asserting mapper column sets and queue behavior against `COLLECTIONS`), reports/exports, schedule engine, date/amount parsing, and pure UI state machines (tx editor, keypad, pickers, row cursor, shortcuts). There is even a meta-test (`no-inline-components.test.js`) enforcing a code-structure rule.
- **Integration Tests**: none automated against a real Supabase instance; sync is tested at the contract/mapper level. Live-browser verification is done manually via Playwright harness sessions (project convention), not a committed E2E suite.
- **CI**: `pnpm test` gates every production deploy (`deploy.yml` runs vitest before build).
- **Deliberate constraint**: no jsdom — logic that needs testing is extracted into pure modules first (`txEditorState.js`, `keypadState.js`, `accountsPhone.js`, `txSheetState.js`...), which is both the coverage strategy and a design discipline.

## Code Quality Indicators
- **Linting**: **Not configured** — no ESLint/Prettier/EditorConfig files in the repo. Consistency is maintained by convention and review.
- **Code Style**: Consistent — plain JS + JSX, 2-space, single quotes; pure functions for logic, hooks only at the edge; inline styles + `theme.css` tokens; every non-trivial file opens with a design-rationale comment block (unusually good "why" documentation).
- **Documentation**: Good — `PRODUCT.md`, `DESIGN.md` (the "Trusted Ledger" design system), `README.md`, `docs/`, migration files that read like ADRs (each explains its own trade-offs, e.g. 0009's jsonb-vs-child-table analysis, 0016's deliberate missing FK).

## Technical Debt
- **Hardcoded currency/locale**: `'Rs '` prefix and `en-PK` `Intl.NumberFormat` are baked into `src/lib/calc.js` (`fmtPKR`, `fmtSigned`, `fmtPKRCompact`); `accounts.currency` defaults to `'PKR'` and nothing reads it for formatting. Month/day names hardcoded English (`MN` array). Internationalizing means touching one module but many call sites assume "Rs".
- **user_id-only scoping — no multi-plan**: every table is scoped solely by `user_id` (composite PK `(user_id, id)`); there is **no plan/budget-book entity anywhere** (schema, sync collections, or store shape). A multi-Plan feature therefore needs a new scoping dimension across: 11 per-user tables + RLS, all 13 `COLLECTIONS` mappers/conflict keys in `sync.js`, the unfiltered `fetchAll`, `assignments`' unique key, `snapshots`' PK, seed logic, and the audit trail.
- **No settings table**: prefs (theme, mask, decimals, app lock, skipped setup, Plan custom views) live only in localStorage (`prefsStore.js`) — they don't roam across devices, and Plan views would likely need server residence in a multi-plan world.
- **Orphaned files**: `src/screens/Budgets.jsx` and `src/screens/Cards.jsx` are imported by no route or module (legacy design iterations superseded by Plan/Accounts); `src/store/persistence.js` survives only for the one-shot legacy import. The `budgets` table + `BudgetForm.jsx` remain live but are a legacy module alongside envelope `assignments`.
- **Naive-local text datetimes**: `'YYYY-MM-DDTHH:mm'` strings assume Asia/Karachi wall-clock (documented, deliberate — timestamptz would month-shift near-midnight rows), but it's a contract every new feature must know about.
- **Name-keyed payee linkage**: payees↔transactions join on case-insensitive `merchant` text with client-owned integrity sweeps (no FK, documented trade-off in 0016) — correctness depends on actions remembering the sweep.
- **Single-flight sync without server conflict resolution**: last-write-wins upserts; two devices editing the same row concurrently silently lose one side (mitigated only for snapshots via `addIgnoreDuplicates`).
- **Audit fetch cap**: only the newest 300 audit rows hydrate (`AUDIT_FETCH_LIMIT`); older history is server-only with no UI to page it.

## Patterns and Anti-patterns
- **Good Patterns**:
  - Pure-action store + reducer with undo/redo and audit as data — trivially testable, optimistic by construction.
  - Diff-based write-behind sync with FK-ordered pushes, baseline-on-success, and per-collection identity keys (composite keys where the DB identity is composite).
  - RLS as the single authorization layer; client never sends `user_id` (DB defaults it) — no filter can be forgotten.
  - Base UI primitives layer (`src/ui/primitives/`) — one accessible foundation, token-styled.
  - Migrations as ADRs; client seed data mirrored explicitly in SQL (0002/0004) with the sync contract in mind.
  - Extract-pure-state-machine pattern for testability without jsdom.
  - Injectable localStorage persistence with surfaced write failures.
- **Anti-patterns**:
  - No linter/formatter config — style consistency is unenforced (`package.json`, repo root).
  - Dead screens kept in-tree (`src/screens/Budgets.jsx`, `src/screens/Cards.jsx`) — modification-candidate noise for brownfield work.
  - Two overlapping budget models live simultaneously (legacy `budgets` table/screens vs envelope `assignments`) — conceptual duplication in `calc.js` (budget* functions) vs `envelope.js`.
  - Heavy inline styles in JSX alongside `theme.css` — theming works via tokens, but style reuse depends on copy-paste of style objects.
  - `fetchAll` loads the entire ledger into memory at login — fine today (audit capped at 300), but transactions are unbounded; a years-heavy ledger grows hydration linearly.
