# Requirements — YNAB-Style Multi-Plan System

## Intent Analysis

- **User request**: Add a YNAB-style multi-Plan system: plan switcher, New Plan modal (name, currency, currency placement, number format, date format), Open Plan, per-plan data scoping. 8 YNAB reference screenshots provided (fresh empty plan, New Plan modal, all option dropdowns).
- **Request type**: New Feature
- **Scope estimate**: System-wide — database schema + backfill migration, sync/data layer, formatting layer, app shell UI (desktop + phone), new plan-management UI
- **Complexity estimate**: Complex
- **Requirements depth**: Comprehensive

## Decisions from Verification Questions

| # | Topic | Decision |
|---|---|---|
| Q1 | Existing data | Auto-migrate everything into a first plan named **"My Plan"**, renameable later |
| Q2 | Schema strategy | New **`plans` table + `plan_id` column** (NOT NULL, FK, backfilled) on every per-user table; PKs stay `(user_id, id)`; RLS stays user_id-based |
| Q3 | Runtime loading | **Fetch only the open plan's rows**; switching plans refetches |
| Q4 | Currency semantics | **Display-only** formatting; amounts remain plain integers; no conversion |
| Q5 | Settings storage | Plan settings as **columns on `plans`** (portable across devices) |
| Q6 | Option sets | **Full YNAB parity** (complete ISO currency list, 8 number formats, 7 date formats, 3 placements) |
| Q7 | New plan contents | **Checkbox in New Plan modal**: "Start with default categories" (accounts always start empty) |
| Q8 | Switcher placement | **YNAB-style sidebar-top** (plan name + email, dropdown) with a phone-shell equivalent |
| Q9 | Management v1 | **Rename + delete** (type-name-to-confirm; deleting the last plan blocked) |
| Q10 | Format reach | **All user-facing dates and numbers** flow through per-plan format settings |
| Q11–13 | Extensions | Security **ON**; Resiliency **OFF**; PBT **Partial** (PBT-02/03/07/08/09) |

## Functional Requirements

### FR-1: Plans entity and migration
- FR-1.1: A `plans` table exists with per-user rows: `(user_id, id)` PK, `name`, `currency` (ISO code), `currency_placement` (`before` / `after` / `none`), `number_format`, `date_format`, `created_at`.
- FR-1.2: A SQL migration backfills a plan named **"My Plan"** for every existing user with data, adds `plan_id` to all 13 per-user tables, assigns all existing rows to that plan, then enforces `NOT NULL`.
- FR-1.3: `plan_id` on every per-user table carries a composite FK `(user_id, plan_id) → plans(user_id, id)` so a row can never reference another user's plan (DB-level ownership integrity; SECURITY-08).
- FR-1.4: A user with zero plans (fresh signup) gets a first plan created through the existing first-use flow.

### FR-2: New Plan modal
- FR-2.1: Modal fields exactly per YNAB reference: Plan Name (text, required, non-empty after trim), Currency (searchable select, full ISO list), Currency Placement (Before amount `Rs123,456.78` / After amount `123,456.78Rs` / Don't show `123,456.78`), Number Format (8 options incl. `1,23,456.78` lakh style), Date Format (7 options).
- FR-2.2: Defaults: PKR, Don't show, `123,456.78`, `30/12/2026` (dd/mm/yyyy) — Raqam's current effective behavior.
- FR-2.3: "Start with default categories" checkbox (default checked); when checked the new plan is seeded with Raqam's default category groups/catalogues; accounts always start empty.
- FR-2.4: Create Plan shows an in-progress state ("Creating plan…"), then switches the app into the new plan.
- FR-2.5: Built on Base UI primitives via `src/ui/primitives/` (project convention).

### FR-3: Plan switcher
- FR-3.1: Desktop sidebar top shows current plan name + account email with a dropdown: plan list (current plan marked), **New Plan**, and plan management entry points.
- FR-3.2: Selecting another plan switches into it (FR-5.4). The chosen plan persists per device (localStorage) and is restored on next launch; a missing/deleted persisted plan falls back to the first available plan.
- FR-3.3: Phone shell exposes an equivalent switcher entry point with the same capabilities.

### FR-4: Open Plan
- FR-4.1: The switcher's plan list serves as "Open Plan": all of the user's plans, ordered by name, with the open one indicated.

### FR-5: Per-plan data scoping
- FR-5.1: Every per-user collection fetch in `src/store/sync.js` filters by the open `plan_id`; the in-memory store holds exactly one plan's data at a time (store shape otherwise unchanged).
- FR-5.2: Every create path stamps the open `plan_id`; the optimistic write-behind queue carries `plan_id` through upserts/deletes unchanged in ordering semantics.
- FR-5.3: Undo history, audit log view, RTA/envelope math, reports, recurring schedules, and payee integrity sweeps all operate on (and only on) the open plan's data.
- FR-5.4: Switching plans tears down the current store state (incl. undo stack) after pending syncs flush, then refetches the target plan's data; the register/plan screens re-render in the new plan's context.
- FR-5.5: The `plans` collection itself is always fetched (it drives the switcher) regardless of the open plan.

### FR-6: Per-plan formatting
- FR-6.1: A single formatting module derives currency symbol, placement, number grouping/decimal separators, and date format from the open plan's settings; the hardcoded `'Rs '`/`en-PK` in `src/lib/calc.js` / `src/lib/format.js` is replaced by it.
- FR-6.2: All user-facing amounts (register, Plan screen, RTA, reports, keypads, exports) and dates (register, pickers, reports) render via these settings.
- FR-6.3: Number-format options define grouping char, decimal char, and grouping pattern (3-digit vs lakh `1,23,456.78`); amount input parsing accepts the plan's decimal separator.
- FR-6.4: The migrated "My Plan" uses the FR-2.2 defaults so existing users see zero visual change.

### FR-7: Plan management
- FR-7.1: Rename plan (inline or small dialog) — updates everywhere immediately.
- FR-7.2: Delete plan requires typing the plan's exact name to confirm; deletion cascades all of the plan's data server-side; deleting the last remaining plan is blocked (UI + guard).
- FR-7.3: Deleting the open plan switches to another remaining plan first.

## Non-Functional Requirements

### NFR-1: Security (Security Baseline ON)
- NFR-1.1: Authorization stays server-enforced: RLS `user_id = auth.uid()` on `plans` and all scoped tables; composite FK (FR-1.3) prevents cross-user `plan_id` forgery; client `plan_id` filters are a scoping convenience, never the security boundary (SECURITY-08).
- NFR-1.2: The migration is transactional and idempotent-safe to re-run checks (guards against partial application); no data loss for existing users (SECURITY-13: change is auditable via migration file + audit_log continuity).
- NFR-1.3: Plan name and all settings values are validated: name trimmed/non-empty/max length; currency/placement/number/date values constrained to the known option sets (CHECK constraints or validated at write) (SECURITY-05).
- NFR-1.4: No secrets, no new endpoints, no new logging of PII; existing append-only `audit_log` gains plan scoping like every other table (SECURITY-03/14 unchanged posture).
- NFR-1.5: Delete-plan is fail-closed: confirmation mismatch or sync failure leaves data intact (SECURITY-15).

### NFR-2: Performance
- NFR-2.1: Initial load fetches one plan's rows only — no regression vs today for single-plan users.
- NFR-2.2: Plan switch completes with a visible loading state; target comparable to current app cold data load.

### NFR-3: Compatibility & data integrity
- NFR-3.1: Existing users land in "My Plan" with identical balances, budgets, reports, and rendering after migration.
- NFR-3.2: Naive-local text dates and bigint integer amounts remain unchanged in storage.
- NFR-3.3: Reconciliation snapshot and assignment composite identities (`account/month`, `category/month`) remain unique **within a plan**.

### NFR-4: Testing (PBT Partial — PBT-02/03/07/08/09)
- NFR-4.1: Framework: **fast-check** with vitest (PBT-09).
- NFR-4.2: Round-trip properties (PBT-02): amount format ↔ parse round-trips across all 8 number formats × 3 placements; date format ↔ parse across all 7 date formats (lossy cases documented with tolerance).
- NFR-4.3: Invariant properties (PBT-03): plan-scoping filters preserve row counts (scoped ∪ other-plans = all); formatting never changes numeric value; seeded catalogues always yield the same structure.
- NFR-4.4: Domain generators for amounts (bigint range, negatives), dates, and format-setting combos, centralized and reusable (PBT-07); shrinking + seed logging in CI (PBT-08).
- NFR-4.5: Example-based vitest tests continue to pin business-critical scenarios (migration mapping, switcher fallback, delete guard).

## Out of Scope (v1)
- Real multi-currency conversion/exchange rates (Q4=B rejected)
- Plan archive/unarchive (Q9)
- Plan sharing / "Add Member" (visible in YNAB screenshots, explicitly not requested)
- Resiliency baseline (extension opted out)
- Cross-plan reporting or transfers between plans

## Security Compliance (Requirements stage)
- **Addressed in requirements**: SECURITY-05 (NFR-1.3), SECURITY-08 (FR-1.3, NFR-1.1), SECURITY-13 (NFR-1.2), SECURITY-15 (NFR-1.5).
- **Unchanged existing posture, re-verified at design/code stages**: SECURITY-03, SECURITY-09, SECURITY-10, SECURITY-11, SECURITY-12, SECURITY-14.
- **N/A (managed platform: Supabase + Cloudflare Pages, no self-managed infra in this feature)**: SECURITY-01 (at-rest encryption is Supabase-managed; TLS enforced), SECURITY-02, SECURITY-04 (static host headers unchanged by this feature), SECURITY-06, SECURITY-07.
- No blocking findings at this stage.
