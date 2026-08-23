# Technology Stack

## Programming Languages
- JavaScript (ESM, JSX) - ES2022+ - entire app (`"type": "module"`; no TypeScript, no tsconfig).
- SQL (Postgres dialect) - Supabase migrations (`supabase/migrations/0001`–`0016`), incl. RLS policies and DO blocks.
- CSS - plain CSS custom-property tokens in `src/styles/theme.css` (no preprocessor, no Tailwind; heavy inline styles in JSX).
- Bash / Node scripts - `scripts/backup-db.sh`, `raqam-dump.sh`, `ynab-load.mjs`.

## Frameworks
- React - ^18.3.1 (`react`, `react-dom`) - UI, StrictMode; hooks + context, no external state library.
- react-router-dom - ^6.30.0 - HashRouter client routing with nested Reflect/Budget routes.
- @base-ui/react - ^1.7.0 - headless accessible primitives; **project rule: all new interactive primitives wrap Base UI via `src/ui/primitives/`** (Floating UI comes transitively).
- @supabase/supabase-js - ^2.111.0 - Auth sessions + PostgREST data access (the only backend SDK).
- echarts - ^6.1.0 - the Spending Breakdown donut only (tree-shaken); other charts are dependency-free divs.

## Infrastructure
- Supabase (managed) - Postgres database (13 tables, RLS as the sole authorization layer) + GoTrue email auth (signups disabled at project level). Config baked at build via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Cloudflare Pages - static hosting of the built bundle at `raqam.pages.dev`; response headers via `public/_headers`.
- GitHub Actions - `.github/workflows/deploy.yml`: on push to `main` (or manual dispatch) run pnpm install → vitest → vite build → `wrangler pages deploy` (cloudflare/wrangler-action@v3, Node 22).
- PWA - `public/manifest.webmanifest` + icons; deliberately **no service worker** (online-only app).
- No IaC (no CDK/Terraform/CloudFormation); Supabase schema managed by SQL migration files.

## Build Tools
- pnpm - 10.33.4 (pinned via `packageManager`; `onlyBuiltDependencies: @swc/core`) - package management; worktrees self-provision via post-checkout hook.
- Vite - ^8.2.1 - dev server + build; `base: './'`; rolldown `advancedChunks` vendor splitting (react / supabase / base-ui).
- @vitejs/plugin-react-swc - ^3.11.0 - SWC-based React fast refresh/compile.

## Testing Tools
- Vitest - ^4.1.10 - `pnpm test` = `vitest run`; 90 test files (80 in `tests/`, 10 colocated in `src/`). Pure-function tests only — **no jsdom**; component logic is extracted into pure modules to stay testable.
- Playwright (via MCP harness, not a repo dependency) - live-browser UI verification during development; no committed E2E suite.
- CI gate - vitest runs in `deploy.yml` before every production build.
