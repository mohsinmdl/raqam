# Component Inventory

Raqam is a **single npm package** (`raqam@0.1.0`) — there is no monorepo/workspace split. The inventory below therefore enumerates the package once, then its logical components (directory-level areas that behave like sub-packages) and its test suites.

## Application Packages
- `raqam` (repo root) - The entire SPA: React 18 + Vite app, Supabase-backed zero-based budgeting.

### Logical components within the package
- `src/App.jsx` + `src/main.jsx` + `src/components/` - App shell: providers, routing, header/sidebar/phone chrome.
- `src/auth/` - Supabase Auth gate (session provider + login screen).
- `src/store/` - State core: StoreProvider (reducer + undo/redo), pure actions, audit helpers, seed data, **sync engine** (`sync.js`), legacy localStorage import, prefs providers, month/tx-view contexts.
- `src/lib/` - Pure domain layer (~55 modules): money/balance math (`calc.js`), envelope fold (`envelope.js`), targets, reports, schedule engine, payee overlay, undo stacks, date layer, editor state machines, misc hooks.
- `src/screens/` - Route screens: Plan, Transactions, Accounts, BudgetHub, Recurring(+Detail), Dashboard/FirstUse, DevTools, Planned, Reflect's six tabs (+ two orphaned legacy screens: Budgets.jsx, Cards.jsx).
- `src/drawers/` - Form registry: 15 drawer forms + shared fields + openers.
- `src/ui/` - Reusable UI: **`primitives/` (Base UI wrappers — Menu, Popover, Select, Combobox, Modal, BottomSheet, ScrollArea)**, plan UI (+phone), accounts phone, tx inline editor + phone sheet, payees modal suite, reflect widgets, charts, chrome (toast/confirm/tooltip/focus-trap/shortcut help).
- `src/styles/theme.css` - Token-based design system (plain CSS).

## Infrastructure Packages
- None as code packages. Infrastructure is:
  - `supabase/migrations/` (16 SQL files) - schema + RLS, applied to the managed Supabase project.
  - `.github/workflows/deploy.yml` - CI/CD to Cloudflare Pages (wrangler direct upload). No CDK/Terraform/CloudFormation anywhere.
  - `scripts/` - `backup-db.sh`, `raqam-dump.sh` (DB dumps), `ynab-load.mjs` (YNAB capture loader).

## Shared Packages
- None (no separate models/clients/utilities packages). The shared-code role is played in-package by `src/lib/` (pure domain models/utilities) and `src/ui/primitives/` (shared UI client of Base UI).

## Test Packages
- `tests/` - 80 vitest files - unit/contract tests: store actions, envelope/RTA math, sync mappers & queue contracts, reports, schedule engine, pickers, keyboard/editor state machines, payees, undo.
- `src/**/*.test.js` - 10 colocated vitest files - `src/lib` (9: appLock, calc decimals/mask, dayGroups, envelope RTA, needsCategoryBanner, registerColumns, rtaBreakdown, txRow balance) + `src/store/archiveCategory.test.js`.
- No jsdom/UI test package — live UI verification is done manually via Playwright harness sessions (not committed as a suite).

## Total Count
- **Total Packages**: 1 (npm package `raqam`)
- **Application**: 1 (the SPA; 8 logical component areas listed above)
- **Infrastructure**: 0 packages (16 SQL migrations + 1 GitHub Actions workflow + 3 ops scripts)
- **Shared**: 0 packages (in-package `src/lib` + `src/ui/primitives`)
- **Test**: 2 suites (tests/ = 80 files, colocated = 10 files; 90 test files total)
