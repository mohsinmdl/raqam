# Inline Transaction Editor (YNAB-style register row) — Design

**Date:** 2026-08-20
**Status:** Approved design, awaiting implementation plan
**Scope:** Spec 1 of 2. Spec 2 (Payee management: `payees` entity, Manage Payees
modal, auto-categorize, rename rules, visibility, combine/bulk mode) is designed
separately and builds on the payee combobox section model defined here.

## Goal

Replace the desktop right-side drawer with a YNAB-style inline editor row in the
transactions register: **Add Transaction** opens an editable row pinned at the
top of the table; clicking an already-selected row a second time opens it as the
same editor in place. The phone TxSheet path is untouched.

## Decisions (locked with user)

1. **Scope**: inline add **and** inline edit (click-select, click-again-to-edit).
2. **Sub-features in**: splits, transfers, repeating/scheduled, amount calculator.
3. **Drawer fate**: fully replaced on desktop; drawer survives only as the phone
   TxSheet form definition.
4. **Type mapping**: inferred YNAB-style, no type pills (see §Type inference).
5. **Architecture**: Approach A — the row is a **third shell** over the existing
   `DrawerProvider` form machinery (desktop drawer / phone TxSheet / inline row),
   sharing one form object and one `useSubmit()` pipeline.
6. **Columns**: the register display switches from one signed AMOUNT column to
   separate **OUTFLOW / INFLOW** columns; sorting merges them into one signed
   order under the hood.
7. **Payees (this spec)**: suggestions derived from distinct past `merchant`
   values + a synthesized "Payments and Transfers" section. No payee entity yet.
8. **Deferred**: transfer `fee` entry, `time` entry (defaults via `stampFor`),
   adjustment creation (reconcile-only), Manage Payees (Spec 2).

## Section 1 — Interaction model

- **Add**: toolbar "Add Transaction", `Shift+N`, or the empty-state button open
  the add row directly under `<thead>`, above the Scheduled group. Defaults:
  current account (last-used in All Accounts), today's date, checkbox ticked,
  first empty cell focused. Buttons beneath the row: **Cancel / Save / Save and
  add another**. "Save and add another" keeps account + date, clears the rest,
  refocuses payee. On desktop, `Shift+N` from any route navigates to the
  register and opens the row.
- **Edit**: first click selects the row (existing selection Set + cursor; cells
  get a text-cursor hover affordance). A second click on the selected row
  converts it in place into the editor (double-click works in one motion).
  Buttons: Cancel / Save.
- **Rules**: one editor at a time. Opening another add/edit closes a *clean*
  editor silently; a *dirty* editor is never silently discarded — Save, Cancel,
  or Esc first. `Esc` closes an open popover first, then cancels the row.
  `Enter` saves from any cell unless a dropdown list is open (then it picks).
  `Tab`/`Shift+Tab` walk the cells. Register chord shortcuts and the row-cursor
  listener stay suspended while the editor is open.
- **Save feedback**: unchanged — `flashRows` highlight, undo entry with a human
  label via the existing audit path, no toast.

## Section 2 — Row anatomy, columns & primitives

Cells align to table columns:
`☑ | ACCOUNT | DATE | PAYEE | CATEGORY | MEMO | OUTFLOW | INFLOW | ©`.

Register change: `COLUMNS`' single `size`/AMOUNT column becomes `outflow` +
`inflow` (right-aligned). Display rows render the magnitude in the matching
column; sorting on either column compares the signed value so the pair behaves
as one monotonic order. Exports/reports are unaffected (they read the store,
not the table).

Cell editors — each a module-scope component (structural test), composed from
`src/ui/primitives/` per the Base UI convention:

| Cell | Editor | Built from |
|---|---|---|
| Account | grouped select: "Selected" section on top, then Cash Accounts / Cards, balance-annotated labels (`acc:`/`card:` ids from `useTxOpts`) | **new `Select` primitive** (Base UI) |
| Date | calendar popover with month grid, Today/Yesterday chips, plus **Repeat** dropdown (Never, Daily, Weekly, Every other week, Twice a month, Every 4 weeks, Monthly, Every other month, Every 3 months, Every 4 months, Twice a year, Yearly) | **new `Calendar` component** — month-grid logic extracted from `WhenField` (currently drawer-coupled) rendered in the existing `Popover` primitive |
| Payee | combobox: type-to-filter, sections "Payments and Transfers" (To/From per account) then suggestions from distinct past merchants; free text allowed | **new `Combobox` primitive** (Base UI part if available in our `@base-ui/react` version, else Popover + listbox composition à la `PlanCategoryPicker`) |
| Category | combobox with per-category **available balances**, "＋ New Category" action, footer buttons **Split** and **Payment/Transfer** | extends `categoryPickerSections` + `PlanCategoryPicker` behavior |
| Memo | plain input → `notes` | — |
| Outflow / Inflow | amount inputs with ＋−×÷ **calculator popover**; mutually exclusive (typing in one clears the other) | reuses the merged calc-expr engine |
| © | cleared/uncleared toggle → `status` | — |

The payee combobox's section model is designed so Spec 2 can add "Saved Payees"
and a "Manage Payees" footer link additively.

## Section 3 — State wiring & type inference (Approach A)

- `DrawerProvider` gains a third shell branch: on desktop with
  `name === 'addTx'`, no aside renders; `Transactions.jsx` reads `useDrawer()`
  and renders `TxEditorRow` under `<thead>` (add) or in place of the matching
  `<tr>` (edit). Same `form`, `setField`, `useSubmit()` — validation, duplicate
  guard (two-step "Save anyway"), undo, audit, and flash inherited unchanged.
- **Type inference** in a new pure module `src/lib/txEditorState.js`:
  `deriveType({outflowAmt, inflowAmt, payeeKind, categoryId})` →
  - outflow → `expense`
  - inflow + category → `refund`
  - inflow + no category (Ready to Assign) → `income`
  - To/From payee → `transfer` (sets `toAccountId`, disables category cell)

  On edit, the original type is preserved unless the amount moves to the
  opposite column, which re-infers. The module also owns tab order, the
  one-editor/dirty-guard rules, and the mapping from cell values onto the
  existing drawer form shape (`txDefaults()` fields) — all unit-testable
  without jsdom.
- **Adjustments**: editing an adjustment row is limited to date/memo/amount
  (sign preserved via its column; `adjustmentReason` retained); `cardAdjustment`
  stays non-editable. Existing `fee`/`time` values are preserved on edit even
  though the row doesn't expose them.

## Section 4 — Splits, transfers, repeat & drawer retirement

- **Split**: the category footer's Split button expands indented sub-rows
  (category + memo + amount each) with a running remainder; Save disabled until
  the remainder is zero → existing `addSplitTransaction`. Editing an existing
  split re-opens its sub-rows.
- **Transfer**: a To/From payee flips the row to transfer mode — category cell
  shows "Payment/Transfer", outflow/inflow decides direction. Existing
  `type: 'transfer'` + `toAccountId`. Fee entry deferred.
- **Repeat**: the date popover's Repeat value maps to the existing `repeat`
  form field → current recurring-rules subsystem. A repeating save lands in the
  Scheduled group at the top of the register, not the posted list.
- **Retirement**: desktop drawer rendering for `addTx` is removed. `TxForm.jsx`
  survives solely as the phone TxSheet's form definition (guarded by the
  `fieldsFor` truth-table tests). BulkBar Edit, `E`/`Shift+E`, and the
  needs-category pill repoint to the inline editor.

## Section 5 — Testing & verification

- Pure Vitest modules (repo convention, no jsdom): `txEditorState` (inference,
  tab flow, dirty rules, payload build), calendar-grid extraction, payee
  section builder, split remainder math, signed-sort merge for the new columns.
- Extend existing suites whose inputs change: `optional-category`, `split-tx`,
  `sort-rows`, `tx-sheet-state`, `shortcuts`.
- Live verification by a Playwright subagent pass: add, edit-second-click,
  transfer, split, repeat→scheduled, save-and-add-another, Esc/dirty rules,
  undo — with the subagent fixing what it finds.

## Out of scope (this spec)

- Payee entity, Manage Payees modal, auto-categorize, rename rules, hide,
  combine/bulk operations → Spec 2.
- Transfer fees, explicit time entry, adjustment creation, scheduled-rule
  editing UI beyond what exists today.
