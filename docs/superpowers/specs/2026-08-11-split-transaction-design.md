# Split expense into multiple categories — design

**Date:** 2026-08-11 · **Status:** approved (brainstorming session)

## Problem

A single purchase often spans categories — most commonly: half a payment is the
user's own expense, half is the roommate's share, which belongs in the
**Roommate advance** category (excluded from budgets/spending; recovered later).
Today that requires typing two transactions by hand. The user wants to enter one
purchase and split it across categories at entry time.

## Decisions (made with the user)

1. **Split-on-save, two linked transactions.** A split saves as N ordinary
   expense transactions linked by a shared id — not a multi-leg transaction
   record. The money engine is untouched.
2. **The split UI lives inside the expense form** — no new entry in the type
   selector.
3. **Total is the anchor.** The user enters the total paid; split lines must sum
   to it exactly. A live remainder chip fills the current line on tap.
4. **Legs stay independent after save.** Each leg edits/deletes as a normal
   transaction; the link is a badge, not an edit unit.

## Design

### Data model

- New **optional** field on expense transaction records: `splitId` (string, a
  `uid()` shared by all legs of one split; absent on non-split transactions).
- No consumer of transactions reads `splitId` for money math. `calc.js`,
  `envelope.js`, budgets, and reports treat legs as the ordinary expenses they
  are. The existing excluded-category mechanism (`isExcludedCat` →
  `spending` / `recoverable` split in `monthMetrics`) handles the
  roommate-advance leg with no changes.

### Form UX (`src/drawers/TxForm.jsx`)

- A **"Split"** link beside the Category label — expense type, **add mode only**.
- Split mode replaces the single category picker with **split lines**: each line
  is category picker + amount input + remove (×). Starts at 2 lines;
  **"+ Add line"** appends. Inline new category (`__new`) works per line.
- The existing total amount field is unchanged and remains the anchor.
- A **remainder chip** below the lines shows `total − sum(lines)`; tapping it
  fills the focused (or last empty) line with the remainder.
- **Save gate:** every line has a category and a positive amount, and lines sum
  exactly to the total. Otherwise the CTA is disabled.
- Removing lines down to one exits split mode (keeps that line's category).
- **Split mode hides the Repeat preset** — recurring splits are out of scope.
- Out of scope for v1: splits on refunds/income/transfers, percentage entry,
  editing a saved split as a unit.

### Save flow (`src/store/actions.js`)

- New action `addSplitTransaction(data, { form, legs })` where
  `legs = [{ category, amount }, …]`:
  - Mints one `splitId = uid()`.
  - For each leg: `resolveCategory` (supports `__new`), then the existing
    `buildTx(form, 'expense', leg.amount, 0, catId)` plus `t.splitId`.
  - Prepends all legs in **one `applyData` call** → one undo step, one sync
    push, one audit entry (`Recorded split expense (N ways)`).
- The duplicate warning runs against the **total** before save (unchanged
  behavior); legs are not checked against each other.

### Transactions list

- Rows whose transaction has a `splitId` show a small **"split" badge**.
- v1 keeps the badge display-only. (Optional later: clicking filters the list to
  siblings by `splitId`.)

### Persistence & sync

- Migration `supabase/migrations/0014_split_id.sql`:
  `alter table public.transactions add column split_id text;`
  Nullable, no FK, no backfill.
- `src/store/sync.js` transactions mapping (explicit-null style per that
  collection's convention): `toRow` adds `split_id: r.splitId ?? null`;
  `fromRow` adds `splitId: r.split_id || undefined`.
- Rows without the field behave as unlinked singles everywhere.

### Edge cases

- Leg amounts are positive integers (PKR, same parser as the total field);
  zero-amount legs are invalid.
- Sum must equal the total exactly — no rounding tolerance (integers only).
- Un-split / type change away from expense discards line state safely.

### Testing (vitest, pure functions)

- `addSplitTransaction`: creates N legs sharing `splitId`, date, account,
  merchant, status; amounts sum to the total; one audit entry; inline new
  category on a line resolves; single undo step removes all legs.
- `monthMetrics`: a Groceries + Roommate-advance split lands the leg amounts in
  `spending` and `recoverable` respectively.
- Form-level sum/validation logic extracted pure where practical and unit
  tested (remainder math, save gate).
