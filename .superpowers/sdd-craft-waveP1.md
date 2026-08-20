# Wave P1 — structural polish + input (P3 / personas)

Branch `worktree-register-craft`. One commit: *Structural polish: category
picker on the Combobox primitive, typed dates, keyboard calculator, cursor
a11y*.

## 1. PlanCategoryPicker → the Combobox primitive

`src/ui/PlanCategoryPicker.jsx` was a hand-rolled combobox: a 34px input, an
`position: absolute` panel living inside the table cell, and a 25-line
ancestor walk that hunted for the nearest overflow ancestor (plus the app
header) to decide whether to drop up or down and how tall the list could be.
It carried `role="combobox"` on the input and stopped there — no listbox, no
options, no `aria-activedescendant`.

It is now built on `src/ui/primitives/Combobox.jsx` (Base UI), the same
primitive `PayeeCell` uses:

- **The clipping math is gone.** The panel is portalled and positioned by
  Floating UI, so a picker in a `<td>`, a drawer, a popover or a modal is no
  longer clipped by its container. `dropUp`, `listMax`, the `CHROME` constant
  and the `getComputedStyle` ancestor walk were all deleted.
- **ARIA comes free**: `role="listbox"` on the list, `role="option"` on every
  row, `aria-activedescendant` following the keyboard highlight.
- **`.rq-combo-item[data-highlighted]`** (theme.css) gives that highlight a
  visual. Base UI marks the keyboard-highlighted option with an attribute and
  the codebase styled only `:hover` — so before this, arrow keys moved an
  invisible cursor in *every* Base UI combobox, PayeeCell included.

Everything the old component did, it still does: grouped list with headers,
per-category available amounts with pos/neg/muted tones, the Ready to Assign
row under its own "Inflow:" header (`excludeRta` suppresses it), the
`＋ New Category` inline create form (the creating-mode content swap), the
"Selected:" section, the `footer` slot (the editor's Split button),
search-as-field, and keyboard nav. Public props are unchanged apart from the
new `size`.

Two deliberate differences, both improvements:

- **`size` prop** — 34 by default (drawers, Plan popovers, PayeeDetail), 28 in
  the inline register editor (`CategoryCell` and `SplitRows`), where the field
  now matches the height of every sibling cell instead of standing 6px taller
  than the row it sits in.
- **"Selected:" moved into the panel's pinned header** rather than scrolling
  at the top of the list. It stays visible while you scroll, and it stays out
  of the listbox — it is a restatement of a row further down, and duplicating
  it as an option would double it in the keyboard order and in a screen
  reader's option count. (It was never keyboard-reachable before either.)

### The two hazards a portalled panel creates, and their fixes

1. **Hand-rolled outside-click dismissal.** `Plan.jsx`'s `usePopoverDismiss`
   closes on any `mousedown` outside its root ref. A portalled list is outside
   that ref, so picking a category would have dismissed the Assign / Move /
   Cover popover before the click landed. `ComboboxPanel`'s positioner now
   carries `data-rq-overlay`, and `usePopoverDismiss` treats a press inside one
   as inside itself.
2. **Stacking.** The picker is hosted inside Manage Payees (`Modal`, z 60) and
   the phone money sheets (`BottomSheet`, z 60), so the combobox positioner
   moved from z 45 to **65** — above the modal/sheet band, below
   ConfirmDialog/Tooltip (70).

Consumers checked and unchanged in behaviour: `TxForm` (×2), `SplitRows`,
`CategoryCell`, `PayeeDetail`, `BudgetForm`, `ReassignForm`,
`ReassignGroupForm`, `RecurringForm`, `Plan.jsx` (×3), `MoneySheets` (×3).

## 2. ComboboxPanel: footer out of the scroll container

The popup was one scrolling box with the footer inside it, so PayeeCell's
"Manage Payees" link — the one thing in the panel that is not a list item —
fell below the fold the moment the payee list was long enough to scroll. The
popup is now a flex column: an optional pinned `header`, a `List` that scrolls
(`overflow-y: auto`, `min-height: 0`), and a pinned `footer` with a
`border-top`. A `body` slot replaces the list outright for the category
picker's Add Category form, which is not a list of anything.

`.picker-scroll` (which only the old picker used) is gone; its YNAB scrollbar
skin survives as `.rq-scroll` on the primitive's List, so every combobox gets
it. That retires Wave P2's "`.picker-scroll` overflow-y: scroll → auto" item.

## 3. Typed dates

`DateCell`'s trigger is now a real text input (`dd/mm/yyyy`). `parseTypedDate`
(`src/lib/dates.js`, pure, `today` injected) reads what a hand actually types:
`17` (that day this month), `17/8`, `17/8/26` (20xx), `17/08/2026`, `.`/`-`
separators, and ISO order when the first part has four digits. It is strict
after it is lenient: `31/2`, `17/13`, `31` in a 30-day month, letters, and
out-of-range years all return `null`, which puts the `--neg` ring on the cell
and *keeps the draft* — the same contract Wave H gave AmountCell (no silent
revert on blur, no silent refusal on Enter). Commit is on blur or Enter.

The calendar is still there and still owns the month stepper, the
Today/Yesterday chips and the Repeat select. It opens two ways: focusing the
field, or the drawn SVG chevron. Which opener fired decides focus — opened
from the field the popup must *not* take focus (the caret has to stay where
the date is being typed), opened from the chevron it does, which is how a
keyboard still reaches the day grid and the Repeat select. Picking any day, or
Today/Yesterday, fills the field and discards a half-typed draft.

## 4. Calculator in the tab order

`AmountCell`'s `⌗` trigger was `tabIndex={-1}` — the op pad was the only way to
discover the calculator, and no keyboard could reach it. Now `tabIndex={0}`,
with the theme's `:focus-visible` ring and a 4px radius so the ring sits on the
glyph rather than around the cell.

## 5. Editor row's no-op checkbox → decorative marker

The editor row's first cell held a permanently-checked, `readOnly` `Checkbox`
whose only job was to line the editor up with the selection column. It offered
a keyboard stop and an accessible name ("Editing this transaction") for a
control that could never do anything. Replaced with an `aria-hidden` marker of
the same 13px footprint and accent fill (drawn SVG tick).

## 6. Row-cursor and label accessibility

- **`cursorStatusLabel(rows, cursorId, selected)`** (`src/lib/rowCursor.js`,
  pure) feeds a visually-hidden `role="status"` region in the register:
  "Row 3 of 22: Daraz, 24 Aug", gaining " — selected" when the row is
  selected — so Space has an audible result. The accent bar that draws the
  cursor is visible-only; nothing about a styled `<tr>` announces that a
  cursor landed on it.
- **`a11yName`** on the row presenter (`txRow.js`). The ledger prints an em
  dash for a machine-written row with no payee, and the checkbox read "Select
  — on 7 Aug", which names nothing. Rows now carry a name meant to be spoken:
  `adjustment`, `card correction`, `refund`, `income`, `Own-account transfer`,
  or `transaction` — the real payee whenever there is one. Fixed at the
  presenter, so the cursor announcement and the checkbox label share it and
  the printed column is untouched.

## Verification

- `pnpm test`: 86 files, 1200 tests, all pass — including 14 new
  `parseTypedDate` cases (`tests/typed-date.test.js`), 5 new
  `cursorStatusLabel` cases (`tests/rowCursor.test.js`) and 4 new `a11yName`
  cases (`tests/adjustment-merchant.test.js`).
- `pnpm build`: clean (only the standing >500kB chunk-size warning).
- Live-checked at 1440×900 in a throwaway Vite harness (auth + `sync.js`
  stubbed via an `enforce: 'pre'` `resolveId` plugin; 20 payees, 9 categories
  in 3 groups + 1 ungrouped, 2 accounts), driven with Playwright by a
  subagent. 13/13 PASS, no console errors at any point:
  1. Register loads, 22 rows, no errors.
  2. Editor row: category input 28px, exactly matching the payee input; first
     cell holds no `input[type=checkbox]`, only the aria-hidden marker.
  3. Picker portalled and unclipped: `[data-rq-overlay].closest('table')`
     is `null`, popup rect `{744, 358, 214×214}` entirely inside the
     viewport; `role="listbox"` + 9 `role="option"`; ArrowDown sets
     `aria-activedescendant`; all four group headers render.
  4. Typing "ren" narrows to Rent; ArrowDown+Enter commits it and the portal
     leaves the DOM.
  5. `＋ New Category` swaps the panel to the form, `document.activeElement`
     is `#pcp-newname` (keystrokes land in the popup), Save selects the new
     category. This was the refactor's real risk — a form taking focus inside
     a Base UI popup whose input lives outside it — and it holds.
  6. Split button is not a descendant of the listbox and does not move when
     the list is scrolled to the bottom.
  7. With 23 payee options the "Manage Payees" footer sits at 617 against a
     popup bottom of 624, outside the listbox, immune to its scroll.
  8. `17/8` → `17/08/2026`; `zzz` → `aria-invalid="true"`, outline
     `rgb(194,65,59)`, draft text kept; calendar day 5 → `05/08/2026`.
  9. Shift+Tab from Outflow lands on "Calculator for Outflow" with a
     `2px solid rgb(15,118,110)` focus ring.
  10. The live region tracks the cursor through ArrowDown×3 and gains
      " — selected" on Space.
  11. Plan's Assign popover (hand-rolled `usePopoverDismiss`) survives a pick
      — the `data-rq-overlay` fix works.
  12. Inside Manage Payees, overlay z 65 beats the modal's z 60:
      `elementFromPoint()` at an option's centre resolves inside the overlay,
      the pick lands, the modal stays open.
  13. Screenshots of both open pickers confirm unclipped portalled popups
      with their footers.
- Harness deleted before committing; `git status` clean of `smoke-harness/`,
  `.playwright-mcp/` and `dist/`.
