# Mobile Plan: YNAB-style phone experience on Base UI

Date: 2026-08-14 · Status: validated design, implementation pending
Request: make the budget page (/budget "Plan") work like YNAB's mobile Plan on phones (user supplied 10 reference screenshots), built on Base UI per the project convention.

## Problem

The Plan screen has **zero phone-specific code**. The desktop six-track grid
(`Plan.jsx:50` — `20px 22px minmax(0,2.2fr) 1fr 1fr 1.1fr`) fluid-squeezes onto a
~390px screen: four columns of numbers compress until unreadable, the inline
ASSIGNED editor pops the OS keyboard (the reverted #100–#108 drawer-vs-keyboard
saga), and the desktop popovers are finger-hostile. The Plan tab is one of the
five phone tabs, so this is a first-class mobile surface rendering a desktop
spreadsheet.

## Decisions (user-validated)

- **Structure only** from the YNAB screenshots: layout and interactions are
  copied; every pixel renders in Raqam's "Trusted Ledger" tokens (warm paper,
  flat surfaces, 1px hairlines, single `--shadow` on overlays, teal only on
  actions, pos/neg pill tints). Not YNAB's purple/lime identity.
- **V1 scope = four pieces** (the rest of the screenshots — Assign-Money
  screen with progress bars, Edit-Plan/targets mode — are follow-up specs):
  ① two-column list, ② keypad assign sheet, ③ Cover/Move/Assign sheets,
  ④ month-grid picker + overflow menu.
- **Base UI everywhere** per the standing convention: reuse
  `src/ui/primitives/{Popover,BottomSheet}.jsx` (in main since PR #121); add a
  `Menu` primitive for ④.
- **Dedicated phone render path**; desktop Plan untouched.
- **Delivery: a 4-PR gh-stack** in dependency order (list → keypad → sheets →
  picker/menu), SDD execution, accessibility audit + phone-viewport Playwright
  verification at the end.

## Architecture

`Plan.jsx` gates at the top: `const phone = useIsPhone(); if (phone) return
<PlanPhone …/>`. New components live in `src/ui/plan/phone/`:

- `PlanPhone.jsx` — screen composition (banners + list) and shared state
  (month, env, collapsed groups, selected category, open sheet).
- `PhoneGroupRow.jsx` / `PhoneCategoryRow.jsx` — list rows.
- `KeypadSheet.jsx` — the custom numeric keypad bottom sheet.
- `CoverSheet.jsx`, `MoveSheet.jsx`, `AssignSheet.jsx`, `OverspentSheet.jsx` —
  money-move sheets.
- `MonthGridPopover.jsx`, `PlanOverflowMenu.jsx` — header controls (④).

**No new business logic.** Everything imports the existing engine:
`setAssigned`/`moveAssigned` (`src/store/actions.js:1053/1078`), `applyCalcExpr`
(`src/lib/calcExpr.js` — the merged left-to-right infix calculator),
`autoAssignAmount`/`AUTO_ASSIGN_KINDS` (`src/lib/inspector.js`),
`PlanCategoryPicker` (`src/ui/PlanCategoryPicker.jsx`), targets math
(`src/lib/targets.js`), amount grouping (`src/lib/amountInput.js`), the
`collapsed` Set + `toggleGroup/toggleAllGroups` state (`Plan.jsx:1038-1197`,
lifted so both paths share it), and `envelopeFor` via the existing `env`.

## ① Two-column list (foundation)

Top to bottom, matching the screenshot anatomy in ledger tokens:

1. **RTA banner** — full-width rounded pill: amount left, "Ready to Assign ›"
   right. Tint: `--pos-soft`/`--pos` when RTA ≥ 0, `--neg-soft`/`--neg` when
   negative. Tap → Assign sheet (③). (YNAB's lime pill, re-toned.)
2. **Overspent banner** — only when overspent categories exist: count badge +
   "Overspent categories" + **Cover** button → Overspent sheet (③).
3. **Groups** — group header row: collapse chevron, group name, and a stacked
   two-column block right-aligned: small muted "Assigned"/"Available" labels
   over the group totals. Tap anywhere toggles collapse (`toggleGroup`).
   Ground: `--track`, matching desktop's group tint.
4. **Category rows** — emoji + name (truncating), assigned amount (tap →
   keypad sheet, ②), and the **Available pill** (`--pos-soft` positive,
   `--neg-soft` negative, `--track`/muted zero). Tap pill → Cover sheet when
   negative, Move sheet when positive (③); zero pill is inert. Row height
   ≥44px; hairline dividers; `.tnum` numerals.
5. **Hidden categories** — one "N hidden categories ›" row at the bottom
   (renders the archived list read-only in a sheet; unhide stays desktop-only
   in v1).

Dropped on phone: the ACTIVITY column (YNAB does the same), checkboxes/bulk
selection, hover affordances, drag-reorder, and the desktop Inspector.
ACTIVITY stays reachable on desktop; a phone activity view is a follow-up.
The month stepper/label stays in the global app header (top), as today.

## ② Keypad assign sheet (new — nothing like it exists)

Tapping a category row's assigned amount opens a **non-modal** bottom sheet
(Base UI Dialog `modal={false}`, no scrim/backdrop, list still scrollable) and
highlights the row (`--soft` tint). The amount cell becomes a live display of
the draft (`formatAmountInput` grouping; caret not needed — display only). The
**OS keyboard never opens** — the display is not a focused text input
(`inputMode="none"`/read-only), which retires the #100–#108 bug class by
construction.

Sheet contents, top to bottom:
1. **Action row** — pill buttons: ⚡ **Auto-Assign** (fills the draft with
   `autoAssignAmount` for the category — target/underfunded amount; disabled
   when nothing to suggest) and ➡ **Move Money** (closes keypad, opens Move
   sheet ③ for the category). *Details is deferred* (needs the category-detail
   sheet, a follow-up).
2. **Hint chip** — when the category is overspent: "Assign N more to cover
   overspending"; tapping fills the draft with assigned+N (teal text chip,
   YNAB's purple hint re-toned).
3. **Key grid** — 4 columns × 4 rows, digits on the left 3 columns and the
   operator column on the right (YNAB's anatomy, extended with our shipped
   ops): `7 8 9 | −`, `4 5 6 | +`, `1 2 3 | ×`, `⨯clear 0 ⌫ | ÷`, with a
   full-width **=** above Done (or in the Done row). Digits/ops append to the
   draft string; **=** evaluates via `applyCalcExpr` (left-to-right, the
   shipped semantics) and leaves the result as the new draft; an invalid
   expression keeps the draft unchanged (same stay-editing UX as desktop).
   Exact key placement is an implementation detail the plan may tune — the
   contract is: all ten digits, backspace, clear, − + × ÷, =, Done.
4. **Done** — evaluates the draft (`applyCalcExpr(current, draft)`), commits
   via `setAssigned({categoryId, month, amount})`, closes the sheet.
   Tapping another category's amount while open re-targets the keypad to that
   row (commit-then-switch, YNAB behavior). Closing by tapping Done on an
   unchanged draft is a no-op (`setAssigned` already skips no-change writes).

Keypad state is a small pure reducer (digits/backspace/clear/op/evaluate on a
draft string) in `src/ui/plan/phone/keypadState.js` — unit-tested; rendering
stays dumb. The sheet is bottom-pinned above the MobileTabBar zone: it covers
the tab bar area (zIndex 60 > tab bar 40) like the existing drawer sheets do,
with `env(safe-area-inset-bottom)` padding.

## ③ Cover / Move / Assign / Overspent sheets

All are `BottomSheetPanel`s (Base UI Dialog, modal, `.drawer-panel` styling)
hosting the SAME internals as the desktop popovers — thin re-hosts, not
rewrites:

- **Cover sheet** (overspent category): "Cover overspending from" + fixed
  amount + `PlanCategoryPicker` (excluding self) + Cancel/OK →
  `moveAssigned(from, to: cat, month, amount)`. (Desktop `CoverPopover`
  logic, `Plan.jsx:729`.)
- **Move sheet** (positive category): editable amount (defaults to available)
  + picker + Cancel/OK → `moveAssigned(from: cat, to, …)`. (`MovePopover`,
  `Plan.jsx:775`.)
- **Assign sheet** (RTA banner tap): amount + picker → `moveAssigned(from:
  'rta', …)`, plus the RTA breakdown lines above it. (`AssignPopover` +
  `RtaBreakdown`, `Plan.jsx:263/200`.)
- **Overspent sheet** (banner Cover button): title + "Select a category to
  cover its overspending" + the negative categories with their red pills; tap
  one → its Cover sheet. (New, trivial — list is `env.rows` filtered
  `available < 0`.)

`PlanCategoryPicker` renders inside sheets as-is (its dropUp logic is
overflow-aware); if its panel misbehaves inside a sheet, v1 constrains it to
plain in-flow list mode rather than migrating it (its Base UI migration is a
separate follow-up).

## ④ Month-grid picker + overflow menu

- **Month picker**: on phone, the app header's month label becomes an
  "Aug 2026 ▾" trigger opening a Base UI **Popover** with a year header
  (‹ 2026 ›) and a 4×3 month grid. Enabled months come from
  `monthsFor(data, {lookahead: 3})` via MonthContext — the grid respects the
  same range as the stepper (past history + 3 ahead); the selected month is a
  teal pill. Desktop keeps the ‹ › stepper unchanged. This lives in the
  header (`Header.jsx`) and therefore benefits Dashboard/Reflect too — same
  global-month semantics as today.
- **Overflow ⋯ menu**: phone-only button on the Plan screen (top-right of the
  screen content) using a new `src/ui/primitives/Menu.jsx` (Base UI Menu,
  tokened like the other primitives). Items, all wiring existing actions:
  Recent Moves (existing `RecentMoves` content in a sheet), Undo last move
  (existing undo action), Collapse/Expand all (`toggleAllGroups`), Progress
  bars on/off (the `ViewToggle` pref), Hide amounts (existing masking pref).

## Error handling

No new failure modes: all writes go through the existing store actions with
their no-op guards; invalid keypad expressions keep the draft (stay-editing);
sheets are dismissible (Escape/back/scrim where modal). Sync failures surface
through the existing "Not saved — retrying" header pill.

## Testing

- Unit: `keypadState` reducer (digit entry, grouping display, backspace,
  clear, operator append, `=` evaluation incl. invalid-expression retention);
  month-grid enabled-range derivation. Vitest, node env (no jsdom — per repo
  convention components are verified live).
- Live: Playwright at 390×780 through the real app — list renders without
  horizontal overflow; keypad assign round-trip (digits → done → Supabase row,
  then reset); calculator path (`500+40=`); Auto-Assign fill; Cover flow moves
  money; month grid respects the +3 horizon; menu actions fire; light + dark.
- `/accessibility` audit on the new surfaces before the stack is marked ready.

## Delivery

gh-stack, four PRs, bottom → top:
1. `feat/mobile-plan-list` — ① list + this spec (largest visual diff, zero
   overlays).
2. `feat/mobile-plan-keypad` — ② keypad sheet + reducer tests.
3. `feat/mobile-plan-sheets` — ③ Cover/Move/Assign/Overspent sheets.
4. `feat/mobile-plan-monthmenu` — ④ month grid + Menu primitive + ⋯ menu.

Follow-up specs (explicitly out of v1): Assign-Money screen with per-category
progress bars & "Auto-Assign by…", Edit-Plan mode (targets editing, reorder,
new group on phone), category Details sheet, phone activity view, unhide on
phone, PlanCategoryPicker's own Base UI migration.
