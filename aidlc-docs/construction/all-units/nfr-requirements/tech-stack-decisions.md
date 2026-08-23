# Tech Stack Decisions — Consolidated (U1–U4)

Brownfield: stack is inherited, not chosen. One new dependency.

| Area | Decision | Status |
|---|---|---|
| Frontend | React 18 + Vite, plain CSS (theme.css), Base UI (`@base-ui/react`) for all new interactive primitives | Existing (project rule) |
| Data | Supabase (Postgres + RLS + PostgREST + Auth); migrations in `supabase/migrations/` | Existing |
| State | In-memory store + pure actions + diff-sync queue (`src/store/`) | Existing |
| Build/deploy | pnpm 10.33.4, Vite build, GitHub Actions → Cloudflare Pages | Existing |
| Unit tests | vitest (`pnpm test` = `vitest run`) | Existing |
| **Property-based testing** | **fast-check** (new devDependency), integrated with vitest — supports custom arbitraries (domain generators), automatic shrinking, seed-based reproducibility (`fc.configureGlobal`/reporter logs seed on failure) | **NEW — satisfies PBT-09** |
| Live verification | Playwright MCP harness (existing project practice; no jsdom) | Existing |

## PBT-09 verification checklist
- Framework selected and documented here ✅
- Added to `package.json` devDependencies during U3 code generation ✅ (planned)
- Custom generators, shrinking, seed reproducibility supported ✅ (fast-check natively)
- Single-language project (JavaScript) — one framework suffices ✅
