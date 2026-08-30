# Build & Test — Cycle 3: Command Palette (⌘K)

## Build
- `pnpm build` → **green** (Vite; pre-existing chunk-size advisory only, unchanged by this feature).

## Unit / property tests
- `pnpm test` (full suite) → **1618 passed / 113 files** (baseline 1595 + 23 new).
- New: `src/ui/command/matchRank.test.js` (15 — 9 example + 6 property, fast-check) and `src/ui/command/buildItems.test.js` (8).
- Property tests P1–P6 (results ⊆ input & no dupes; empty query → all; substring always present; ordered by non-increasing score; recents boost monotonic; never throws & deterministic).

## Live browser verification (Playwright, stubbed Vite harness)
The app has a Supabase auth wall + no jsdom, so verification used a throwaway harness mounting `<CommandPalette/>`/`<SidebarSearch/>` under the real HashRouter + UIProvider with StoreProvider/PlanProvider/DrawerProvider stubbed via a Vite `resolveId`/`load` plugin. **All 8 checks PASS, no source fixes:**
1. Ctrl+K opens; combobox focused. 2. Empty-open shows "Jump to" pages. 3. Ranking: `spend`→Spending#1, `din`→Dining (Categories/"Food"), `theme`→Toggle light/dark, `hbl`→HBL Current ("Current · ••1234"); `switch`→only the *other* plan. 4. ↑/↓ cross group boundaries; active row bg = `--soft`; one `aria-selected`; `aria-activedescendant` tracks. 5. Enter on a page → hash `#/reflect/spending` + close; Enter on Toggle theme → `setPrefs {theme:dark}` + close. 6. Esc closes. 7. Sidebar "Quick search… ⌘K" opens it, input focused. 8. No palette-caused console errors.

Screenshots: `scratchpad/cmdk-empty.png`, `scratchpad/cmdk-query-spend.png`.

Note: `Ctrl K` label branch is a pure `navigator` check (mac test machine showed `⌘K`); not exercised live but trivially correct.

## Story acceptance
US-1…US-10 all satisfied (see stories-command-palette.md; live checks 1–8 map to US-1/3/4/5/6/7/8 + engine tests to US-9/10).

## Extension compliance (final)
- **Security**: SECURITY-05 ✅ (query as text), SECURITY-08 ✅ (no new data path — index is RLS-gated store data only), SECURITY-15 ✅ (storage fail-safe). Remaining SECURITY rules **N/A** (client-only UI; no data store/network/auth/IaC surface changed).
- **PBT** (partial): PBT-03/07/08 ✅ enforced on `matchRank.js`; PBT-09 ✅ fast-check; PBT-10 ✅ example+property coexist; PBT-02 N/A. Non-enforced PBT rules advisory.
- **Resiliency**: disabled.
