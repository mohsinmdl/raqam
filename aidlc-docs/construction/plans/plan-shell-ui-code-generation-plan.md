# U4 plan-shell-ui — Code Generation Plan

**Single source of truth for U4 generation.** Functional Design skipped (approved execution plan) — behavior is pinned by stories US-3/4/7/10/16/17 ACs (`aidlc-docs/inception/user-stories/stories.md`), application design C6/S2–S5, and the U2/U3 handoffs. All interactive primitives on Base UI via `src/ui/primitives/` (project rule); `data-testid` on interactive elements (`plan-switcher-trigger`, `new-plan-name-input`, `new-plan-create-button`, `manage-plans-delete-confirm-input`, …). Visual language per DESIGN.md ("The Trusted Ledger").

## Steps

- [x] **Step 1 — PlanSwitcher (desktop)** (create `src/ui/plans/PlanSwitcher.jsx`; modify `src/components/Sidebar.jsx`): YNAB-style block at the TOP of the sidebar (above nav): open-plan name + account email + chevron; dropdown (Base UI Menu/Popover primitive) listing plans ordered by name with the open one marked, then **New Plan** and **Manage Plans** items. Switch = `usePlan().switchPlan(id)` with its boolean abort surfaced via the existing sync-status affordances. *(US-7, US-8 UI, US-4 entry)*
- [x] **Step 2 — NewPlanModal** (create `src/ui/plans/NewPlanModal.jsx`): Modal primitive; fields per the YNAB reference — Plan Name (trimmed non-empty ≤80, inline validation), Currency (searchable Combobox over `CURRENCIES`, "Pakistan Rupee–PKR" labels), Currency Placement / Number Format / Date Format (Select primitives fed from `planFormatOptions` with worked-example labels; defaults = `PLAN_DEFAULTS`), **"Start with default categories" checkbox (default checked)**, Cancel + Create Plan with "Creating plan…" busy state. Create: `applyData(createPlan(fields), system:true)` → set `pendingSeed` when checked → `await switchPlan(newId)`. *(US-4, US-5, US-6)*
- [x] **Step 3 — ManagePlansModal** (create `src/ui/plans/ManagePlansModal.jsx`): plan list; inline rename (undoable `renamePlan`); delete flow per U2 L6 — type-the-exact-name confirm enabling the button, last-plan guard (delete hidden/disabled with explanation), deleting the open plan = drain → fallback persist → reload; non-open delete refreshes in place. *(US-16, US-17)*
- [x] **Step 4 — FirstPlanSetup** (create `src/ui/plans/FirstPlanSetup.jsx`; modify `src/store/PlanProvider.jsx`): replaces `NoPlansYet`; NewPlanModal's fields rendered as a first-run page (store not yet alive → direct insert helper `insertPlan` added to sync.js, then prefs.openPlanId + optional pendingSeed, then continue boot). Seed checkbox default ON. *(US-3)*
- [x] **Step 5 — Phone entry** (modify the phone Budget shell `src/ui/plan/phone/PlanPhone.jsx` + reuse `BottomSheet` primitive): tappable current-plan title in the phone header opening a bottom sheet with the plan list / New Plan / Manage Plans (the two modals render phone-appropriately via existing responsive modal behavior — verify, don't rebuild). *(US-10)*
- [x] **Step 6 — resetAll / legacy-import seed fix** (U2 handoff; modify `src/store/actions.js` / `src/components/ImportLegacy.jsx` path): fixed-id category seeding switched to fresh `uid()` ids (cross-plan PK collision + re-stamp hazard once multiple plans exist).
- [x] **Step 7 — Tests**: pure-logic tests only (no jsdom — repo rule): name validation, delete-confirm predicate, switcher ordering/marking selectors, FirstPlanSetup insert-payload builder, resetAll fresh-id property (ids unique vs seed ids). Live UI verification belongs to Build & Test (Playwright).
- [x] **Step 8 — Verify**: `pnpm test` all green; `pnpm build` passes.
- [x] **Step 9 — Docs summary**: `aidlc-docs/construction/plan-shell-ui/code/plan-shell-ui-summary.md`.
- [x] **Step 10 — Story checkboxes**: US-3/4/7/10/16/17 implemented; aidlc-state.md updated.

## Execution approach
Steps 1–8 delegated to a subagent in this worktree (SDD convention); parent verifies and runs the gate. Live browser verification (all 17 stories' ACs) follows in Build & Test via the Playwright harness.

## Contracts honored
- Base UI primitives only; no hand-rolled popups (project rule)
- `system:true` for create/delete; rename undoable (U2 Q1=A)
- `pendingSeed` set BEFORE `switchPlan` (U2 L4)
- Formatter binds on reload — the modal shows examples via `makeFormatter(candidate settings)` for previews only, never rebinding the singleton (BR-U2-1/BR-U3-2)
