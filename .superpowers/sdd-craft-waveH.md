# Wave H — harden (P2)

Field-attributed validation, honest amount errors, quiet-escape, named skips.

## 1. Field attribution
- `src/lib/txEditorState.js`: added `errorCells(errors, f)` — pure map from
  `validate.transaction`/`validateSplit` error keys onto editor cells
  (`payWith`/`account`/`transfer` → `account`; `amount` → `outflow`/`inflow`
  per the same inflow-side truth table `cellsFromForm` uses; `date` → `date`;
  `category`/`split` → `category`; `merchant` → `payee`). Values are the
  original message string. 8 new test cases in `tests/tx-editor-state.test.js`
  incl. the amount-side rule across all six types/directions.
- Every leaf cell (`AccountCell`, `DateCell`, `PayeeCell`, `CategoryCell` →
  `PlanCategoryPicker`, `AmountCell`) is now `forwardRef` and accepts
  `invalid`/`errorMsg`(`/errorId`): a 1px `var(--neg)` inset outline (mirrors
  theme.css's own focus mechanism — `outline` not `border`, so no thickness
  jump), `aria-invalid`, and `aria-describedby` pointing at a visually-hidden
  `role="alert"` span holding the exact message. `src/ui/primitives/Select.jsx`
  gained the same `invalid`/`describedBy` + ref-forwarding (only consumer:
  `AccountCell`).
- `TxEditorRow.jsx` computes `cellErrors = errorCells(drawer.errors, f)` each
  render and holds a ref per cell in column order (`account, date, payee,
  category, outflow, inflow`). A `useEffect` keyed on `drawer.errors`
  (reference only changes via `fail()`/`setDup()`/`openDrawer()`, never
  typing) focuses the first invalid cell in that order. Footer error summary
  (`drawer.errList.join(' ')`) unchanged.

## 2. AmountCell honesty
- Old `commit(fromBlur)` split silently reverted the draft on blur but left it
  open on Enter for the same invalid/negative calc result. Removed the split:
  `commit()` is now identical for both — draft stays visible, cell gets the
  `--neg` ring + `aria-invalid`, describedby carries `"Couldn't compute — check
  the expression."` or `"Result is negative — amounts are magnitudes; use the
  other column for the opposite direction."` No silent revert, no silent
  refusal.
- The calc-error state (`calcErr`) is local and separate from the field's
  submit-time `invalid`/`errorMsg` props (a different failure source
  entirely); either can ring the cell, calc-error wins the message when both
  are present. Cleared on the next `onChange`.

## 3. Quiet escape
- `isMeaningfulDraft(f)` in `txEditorState.js`: true iff amount non-empty, a
  category is set, `splitOn` with at least one line, or a transfer with `to`
  set. Payee/memo text alone is not meaningful. 6 test cases.
- `DrawerProvider.jsx`'s `requestClose` (the one path behind backdrop/×/
  Cancel/Escape) now gates its confirm dialog on `isMeaningfulDraft(form)`
  ONLY for the addTx **inline** session (`!phone && state.name === 'addTx'`);
  phone's `TxSheet` and the classic drawer keep the plain dirty-check
  unchanged.

## 4. Named skips
- `Transactions.jsx`'s `bulkCategorize`: the "Skipped N…" toast now names the
  first two skipped merchants (falling back to "Own-account transfer" for
  transfers, matching `txRowOf`'s convention, or "that item" for a since-
  deleted row) plus `+N more` when there are more than two, e.g. "Skipped 3
  (Netflix, Uber, +1 more) that can't take an expense category." Skip-count
  derivation is unchanged (still `sel` minus the categorizable `ids`).

## Verification
- `pnpm test`: 84 files, 1171 tests, all pass (39 in `tx-editor-state.test.js`
  incl. the 14 new `errorCells`/`isMeaningfulDraft` cases).
- `pnpm build`: succeeds clean (only the pre-existing >500kB chunk-size
  warning).
- Live-checked in a throwaway Vite harness (auth+sync stubbed via
  `resolveId`, empty seed) via a forked subagent, driven with Playwright:
  1. Empty submit → account + outflow cells ringed `var(--neg)`,
     `aria-invalid`/`aria-describedby` correct, focus landed on the account
     trigger, footer summary still visible. PASS.
  2. `500-2000` typed into Outflow, Enter and blur: identical behavior both
     ways (draft kept, ringed, negative-result message, no revert); a new
     keystroke clears the calc-error state immediately. PASS.
  3. One-char payee + Escape → closes silently, no confirm. PASS.
  4. Amount typed (1000) + Escape → "Discard your changes?" confirm appears.
     PASS.
  - Found and fixed a real bug during this pass: the focus-on-fail effect
    originally gated on a `justFailedRef` flag set *after* `await submit()`
    resolved, but `submit()` calls `fail()` (which schedules the errors state
    update) synchronously before that await resolves — the flag lost the race
    with React's render and focus never moved. Fixed by dropping the flag and
    keying the effect directly on `drawer.errors` reference identity (see
    §1 above) — an exact, simpler signal with no race.
  - Harness deleted before committing; `git status` confirmed clean of
    harness artifacts (`smoke-harness/`, `.playwright-mcp/`, `dist/`).
