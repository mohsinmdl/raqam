# U4 plan-shell-ui — Code Generation Summary

Verification: `pnpm test` = 95 files / 1363 tests passing; `pnpm build` succeeds. No commits yet.

## Created (`src/ui/plans/`)
- `planShellLogic.js` — pure helpers (name validation mirroring createPlan, exact-name delete predicate, switcher ordering/marking, date example, FirstPlanSetup insert payload builder with catalogue clamp)
- `PlanForm.jsx` — shared fieldset (modal + first-run): name, searchable currency Combobox, placement/number/date Selects with worked-example labels (placement examples via `symbolFor(selected currency)`), live `makeFormatter(candidate)` preview (never rebinding the singleton), seed checkbox default ON
- `NewPlanModal.jsx` — create flow: `createPlan` system-dispatch → pendingSeed pref → `switchPlan`; "Creating plan…" busy; drain-abort inline notice
- `ManagePlansModal.jsx` — undoable inline rename; typed-exact-name delete with last-plan guard; L6 open-plan fallback-switch flow
- `PlanSwitcher.jsx` — YNAB-style top-of-sidebar block + Base UI Menu (plans by name, check + sr-only "(open)", New Plan / Manage Plans)
- `PlanSwitcherPhone.jsx` — phone trigger + BottomSheet reusing the same modals
- `FirstPlanSetup.jsx` — first-run page over `insertPlan` (store not alive), retryable error
- `tests/plan-shell.test.js` — 16 pure-logic tests

## Modified
- `PlanProvider.jsx` (FirstPlanSetup wired via `completeFirstPlan` → provider re-enters loading → normal boot resolves the new plan; context exposes `drain()`), `StoreProvider.jsx` (`applyData(fn, opts)` forwards `opts.system` — same reducer path as rolloverMonth), `sync.js` (`insertPlan` via plans toRow + skew retry), `actions.js` (`resetAll` fresh ids), `ImportLegacy.jsx` (fresh ids on the normalizer base), `Sidebar.jsx` (switcher on top), `Plan.jsx` (phone header hosts `PlanSwitcherPhone`), `primitives/Modal.jsx` (`height` prop, default preserved), `primitives/Select.jsx` (`popupZIndex` + `testId` passthrough)

## Notable mechanisms
- **Create/delete drain timing**: draining synchronously after `applyData` would flush the queue over the pre-commit store; both modals park a pending state and continue in an effect gated on `usePlan().plans` reflecting the change — the flush provably includes the plans-row change before reload.
- **Phone entry deviation (accepted)**: PlanPhone renders no title; the real phone Budget header is Plan.jsx's phone branch, so the trigger lives there as a self-contained component.

## Stories
US-3 ✅ US-4 ✅ US-7 ✅ US-10 ✅ US-16 ✅ US-17 ✅ (client implementation; live AC verification in Build & Test)

## Deferred to Build & Test
Playwright verification of all 17 stories' ACs (desktop + phone), Base UI Dialog initial-focus check, real drain-abort UX, and the 0017 apply-time DB proofs.
