# Mobile Accounts: YNAB-style phone experience on Base UI

Date: 2026-08-15 · Status: validated design, implementation pending
Request: revamp the Accounts experience on phones to match YNAB mobile (user
supplied 10 reference screenshots — accounts list, per-account register,
transaction editor), built on Base UI per the project convention.

## Problem

Three gaps between the phone Accounts experience and the reference:

1. **Accounts screen has zero phone code.** The desktop six-column grid
   (`Accounts.jsx:15` — `2fr 1.1fr 1fr 1.1fr 100px 128px`) fluid-squeezes at
   390px until balances, freshness, and actions are unreadable.
2. **The account register has no identity.** `/transactions/:acctId` already
   renders the YNAB-style phone register (day sections, select mode with
   Categorize/©/⋯ chrome, scheduled band, banners — shipped with the mobile
   shell), but nothing on screen says which account you are in or what its
   balance is.
3. **The transaction editor is a desktop form.** `TxForm.jsx` is a field-grid
   drawer whose amount is a focused text input — the OS keyboard drives it.
   The reference editor is the opposite: a big amount header on a custom
   keypad, a type switcher, and tappable field rows. (This was recorded as
   the agreed next phase when the shell shipped; the keypad now exists.)

## Decisions (user-validated)

- **Scope = the Accounts experience** (screenshots' literal content), not the
  Dashboard: ① phone Accounts screen, ② register header, ③ full YNAB-style
  editor. Dashboard/Home is untouched.
- **Structure only**: layout and interactions are copied from YNAB; every
  pixel renders in Raqam's "Trusted Ledger" tokens (flat surfaces, 1px
  hairlines, single `--shadow` on overlays, teal only on actions, pos/neg
  tints). Not YNAB's purple/lime identity.
- **Base UI everywhere** per the standing convention: reuse
  `src/ui/primitives/{Popover,BottomSheet,Menu}.jsx` (all in main).
- **Editor strategy**: phone-native editor for the everyday cases, with an
  **"All options"** row opening the classic TxForm drawer prefilled — splits,
  repeat rules, and other advanced machinery keep their full home there.
  Nothing is lost, just relocated.
- **Base: current `main`** (the mobile-Plan stack #122–#125 is merged, so the
  keypad reducer and primitives are available from a clean branch).
- **Delivery: a 4-PR gh-stack** in dependency order, SDD execution, live
  phone-viewport verification + accessibility audit at the end.

## Architecture

Dedicated phone render paths, desktop untouched — the proven Plan pattern:
gate `if (phone) return <XPhone/>` AFTER all hooks. New components:

- `src/ui/accounts/phone/AccountsPhone.jsx` — ① screen composition.
- `src/ui/accounts/phone/ArchivedSheet.jsx` — ① archived-accounts sheet.
- `src/ui/tx/phone/AccountHeader.jsx` — ② register header band.
- `src/ui/tx/phone/TxSheet.jsx` — ③ the editor (full-screen Dialog).
- `src/ui/tx/phone/TxKeypad.jsx` — ③ generalized key grid (digits + ops),
  extracted from the Plan `KeypadSheet` so both consume one component; state
  stays the shipped `src/ui/plan/phone/keypadState.js` reducer (move to
  `src/lib/` or a shared ui location as part of the extraction).
- `src/ui/tx/phone/txSheetState.js` — ③ pure helpers: per-type field
  visibility (extracted from TxForm's `fx*` flags), amount-header tint per
  type, row-label derivations. Unit-tested.

**No new business logic.** Everything imports the existing engine:
`accountBalance`/`kindLabel`/`lastActivity`/`accountDeletePolicy`
(`src/lib/calc.js`), `freshInfo`/`instName` (`src/lib/txRow.js`),
`setAccountStatus`/`deleteAccountPermanently`/`addTransaction`/
`updateTransaction`/`deleteTransaction` (`src/store/actions.js`),
`validate` (`src/lib/validate.js`), `findDuplicate`, the envelope for
category available amounts, `CategoryPickerSheet`
(`src/components/CategoryPickerSheet.jsx`), `formatAmountInput`, and the
`balanceMonth` clamp from MonthContext.

**Shared submit path (load-bearing):** TxForm's submit logic (build → 
validate → duplicate check → recurring-occurrence bookkeeping → action
dispatch) is extracted into a module both editors call. The phone editor must
never re-implement submission — recording a recurring occurrence through a
second code path that skips `markOccurrenceRecorded` would leave rules stuck
due. If extraction proves riskier than planned, the fallback is: forms opened
with `fromRecurring` keep the classic TxForm even on phone, and the phone
editor covers plain add/edit only. The plan decides after reading the code;
either way the invariant is "one submission code path per flow".

## ① Phone Accounts screen

`Accounts.jsx` gates to `<AccountsPhone/>`. Top to bottom:

1. **Groups** — active accounts grouped by institution kind
   (`kindLabel(inst.kind)`; accounts with no institution fall into "Other").
   Each group: a header row (collapse chevron, kind label, `.tnum` group
   total = sum of member balances) above a rounded `--surface` card with
   hairline-divided rows. Row anatomy: freshness dot (existing `freshInfo`
   colors + tooltip text as `aria-label` detail), nickname (truncating) with
   institution subtitle, `.tnum` balance right-aligned (negative in
   `--neg`), chevron. Tap row → `/transactions/:id`. Collapse state is
   phone-local component state (not persisted).
2. **Archived** — when archived/closed accounts exist: one "N archived
   accounts ›" row opening `ArchivedSheet` (BottomSheetPanel): each row shows
   nickname, institution, status, and the existing Restore / Delete actions
   with the same `accountDeletePolicy` guards and confirm dialog. Delete
   stays behind the existing `ask()` confirm.
3. **Add account** — full-width bordered `--surface` row, teal "＋ Add
   account" label → existing `openers.addAccount` drawer (unchanged).
4. **Empty state** — no active accounts: the desktop empty-state copy reused
   in a phone-width card.

Balances use `accountBalance(a, S, balanceMonth, now)` — the future-month
clamp holds. Dropped on phone: TYPE/FRESHNESS/NUMBER columns as columns (the
dot carries freshness; last4 and type stay desktop-only), Edit button per row
(editing stays reachable from the register header in ②).

## ② Account register header

On phone, `/transactions/:acctId` renders a header band above the existing
register chrome (which is untouched — Select, search, ⋯, banners, scheduled
band, select mode all stay):

- **Back** chevron button → `/accounts` (browser back also works; the button
  is for reachability, YNAB's ‹).
- **Identity block** (center): account nickname, institution subtitle, and a
  `.tnum` **Working balance** figure with a muted "Working balance" label —
  `accountBalance` at `balanceMonth`, matching the Accounts screen number
  exactly.
- **Edit** (⋯-adjacent): a small control opening the existing
  `openers.editAccount` drawer — replaces the desktop row's Edit button on
  phone.

The all-transactions view (`/transactions`, no `:acctId`) gets no header band
— it already has its filter chrome.

## ③ YNAB transaction editor (phone add + edit)

Full-screen sheet (Base UI Dialog, `modal`, own surface covering the
viewport, ✕ close top-left; Escape/✕ discard with no write). It replaces the
classic drawer on phone for the `addTx` drawer route, so every existing entry
point — AddTxPill, register tap-to-edit, dashboard Edit, upcoming Record —
flows into it with zero call-site changes (subject to the `fromRecurring`
fallback decision in Architecture).

Anatomy, top to bottom:

1. **Amount header** — large `.tnum` display of the draft amount
   (`formatAmountInput` grouping), tinted by type: `--pos-soft` ground for
   income/refund, plain `--surface` for expense/adjustment, `--soft` accent
   tint for transfer (YNAB's blue header, re-toned). Tapping the amount
   opens the **keypad** (below). The amount is never a focused text input —
   the OS keyboard is unreachable for it by construction.
2. **Type switcher** — a centered pill ("Expense ⌄" etc.) opening a Base UI
   **Menu** with Raqam's five types — Expense, Income, Transfer, Refund,
   Adjustment — each with its one-line hint from TxForm's `HINTS`; the
   active type is check-marked. Switching type resets category/splits state
   exactly as TxForm's pills do today.
3. **Field rows card** — rounded `--surface` card, hairline-divided chevron
   rows; each row = muted label above value (YNAB anatomy):
   - **Payee** (hidden for adjustment, exactly TxForm's `fxMerchant`): tap
     → inline text input, the one OS-keyboard field.
   - **Category** (expense/income/refund): tap → `CategoryPickerSheet`
     (existing component, income/expense list per type as TxForm does).
   - **Pay with / Account**: tap → a bottom-sheet list of active accounts
     (and credit cards for expense) with balances — the same option set
     TxForm's `useOpts` builds.
   - **Date**: tap → the native date input styled as a row (phone date
     pickers are good; no custom calendar in v1).
   - **Transfer layout**: the rows above are replaced by YNAB's two-card
     "Transferred from" ↓ "Transferred to" stack, each opening the account
     sheet; plus Date.
4. **Keypad** — bottom-pinned panel: `TxKeypad` (digits, ⌫, clear,
   `− + × ÷ =`) driving the shipped `keypadState` reducer; `=` evaluates via
   `applyCalcExpr` semantics already inside the reducer. Opens on amount
   tap and on first open of a new transaction; collapses when a field row
   is tapped.
5. **Show more** — collapsed divider row revealing: memo/notes (textarea),
   fee (transfer only), Cleared toggle (TxForm's uncleared semantics), and
   the **"All options"** row — closes the sheet and opens the classic
   TxForm drawer prefilled with the current draft (splits, repeat rules,
   and adjustment nuances live there).
6. **Footer** — primary Save button (per-type CTA labels from TxForm's
   `CTAS`); in edit mode also the edited-before notice (reusing TxForm's
   copy) and a Delete action behind the existing confirm.

Validation errors surface inline under the field rows (same `validate`
messages); a failed validation keeps the sheet open. Duplicate detection
runs on save exactly as today (same prompt copy, re-hosted in the sheet).

## Error handling

No new failure modes: all writes go through existing store actions with
their guards; invalid keypad expressions keep the draft (stay-editing);
sheets are dismissible; sync failures surface through the existing
"Not saved — retrying" pill. Discard-on-close (✕/Escape) never writes.

## Testing

- Unit (Vitest, node env — no jsdom, components verified live):
  `txSheetState` helpers (per-type field visibility matches TxForm's `fx*`
  truth table; tint mapping; transfer row derivation); accounts grouping
  (kind bucketing, group totals, archived split); keypad reducer tests
  already exist and move with the extraction.
- Live (Playwright, 390×780, real app): Accounts screen renders grouped
  with correct totals and no horizontal overflow; tap-through to register
  shows the header with the same balance; add-transaction round trip via
  keypad (digits → category → account → save → row appears → exact-inverse
  cleanup); calculator path; transfer round trip; edit + delete; All-options
  escape opens TxForm prefilled; desktop regression at 1280 (Accounts grid,
  TxForm drawer byte-identical behavior); light + dark.
- `/accessibility` audit on the new surfaces before the stack is marked
  ready (amounts announced, labeled inputs, 24×24 targets, contrast).

## Delivery

gh-stack off `main`, four PRs, bottom → top:

1. `feat/mobile-accounts-list` — ① Accounts phone screen + archived sheet
   + this spec.
2. `feat/mobile-accounts-register` — ② register header band.
3. `feat/mobile-tx-editor` — ③ editor shell: sheet, amount header, keypad
   extraction (`TxKeypad`), type menu, field rows, save path for
   expense + income.
4. `feat/mobile-tx-editor-types` — ③ transfer/refund/adjustment layouts,
   Show more (memo, fee, cleared, All options), edit mode (notice, Delete),
   duplicate-detection re-host.

Follow-up specs (explicitly out of v1): native phone splits and repeat
editing (they stay in TxForm via All options), scheduled-transaction editing
from the register's scheduled band, account reorder on phone, photo
attachments (YNAB's Photo row has no Raqam backend — omitted entirely).
