# Inspection fix batch — per-item status

Branch `worktree-register-craft`. One commit. `pnpm test` 1219/1219 pass (87 files),
`pnpm build` clean. No test needed updating: the suite is pure-function only and
asserts nothing about the sort-label arrow, `COLUMNS` widths, or accessible names.

Verification: throwaway Vite harness (`src/store/sync.js` + `src/auth/AuthProvider.jsx`
stubbed via an `enforce:'pre'` `resolveId` plugin; everything above the network
boundary is the real app), fixture with a 42-char account nickname
("Meezan Bank Everyday Savings Account 0042"), uncleared + transfer + needs-category
+ scheduled rows, `snapshots: []`. Harness deleted before committing.

---

## P1

**1. DateCell clipping — FIXED, re-measured.**
`COLUMNS` DATE 96 → 120; input `padding: '0 4px'`, `minWidth: 0`.

| viewport | input clientW | content box | value "20/08/2026" | placeholder "dd/mm/yyyy" | scrollW ≤ clientW |
|---|---|---|---|---|---|
| 1440 | 110 | 102 | 72 (30 headroom) | 75 (27 headroom) | yes (110 ≤ 110) |
| 1024 | 110 | 102 | 72 (30 headroom) | 75 (27 headroom) | yes (110 ≤ 110) |

Text also ends before the 20px calendar-chevron box (`textEndsBeforeChevron: true`),
so dropping the 22px right gutter does not put the value under the trigger.

**2. Folded transfer sub-line — FIXED.** Took the report's `maxWidth: 50%` branch
rather than `flex: 1 1 50%`: an equal 50/50 basis leaves a gap between a short
source and the arrow, whereas `flex: '0 1 auto' + minWidth: 0 + maxWidth: '50%'`
on both halves is gap-free when the content fits and caps each half under
pressure. Measured with the 42-char nickname:

- 1024, all-accounts, folded sub-line: outer 132px → source 66px (ellipsised),
  dest 53px showing " → Current" in full. Neither collapsed (was 1.8px).
- 1180, ACCOUNT column: outer 126px → source 63px, dest 63px, both ellipsised.
  Symmetric, neither collapsed.

**3. Long nickname defeats the fold — FIXED via `table-layout: fixed`.**
Chose the table-layout branch: it makes `<colgroup>` authoritative, so the
min-content width of a nowrap sub-line can no longer widen a column. Also added
`minWidth: 0` to the PAYEE td and its inner flex row.

| viewport | wrapper clientW | scrollW | table overflow | document overflow |
|---|---|---|---|---|
| 1440 | 1204 | 1204 | **0** | 0 |
| 1180 | 944 | 944 | **0** | 0 |
| 1024 | 788 | 788 | **0** | 0 |

**4. Uncleared dim broke the floors — FIXED.** `...dim` removed from the BALANCE
and STATUS tds only; every other cell keeps it. Measured live (light):
BALANCE text `--muted` **4.96:1** @ opacity 1 (was 2.43:1 @ .62); uncleared
STATUS ring **4.96:1** @ opacity 1. Dark: 7.12:1. The uncleared OUTFLOW still
measures 4.74:1 dimmed — the row state is still legible, it is just no longer
paid for out of the two cells that report it.

**5. SplitRows grid-true — FIXED.** Replaced the `colSpan - tail` spanning cell
with per-column tds. `tail` redefined to the real trailing count
(amount + inflow + balance? + remove = `showBalance ? 4 : 3`); it previously
folded the leading checkbox cell in, which is why the report's quoted formula
looked off by one. With that correction the quoted arithmetic holds exactly:
`leadSpan = colSpan - tail - 1 - (hideMemo ? 0 : 1)`. `hideMemo` is now threaded
from TxEditorRow. Measured at 1440 (account-scoped, BALANCE showing):

- CATEGORY header spans x 662–852; split picker 666–848 → **inside**.
- OUTFLOW header spans x 1032–1142; split amount 1036–1138 → **inside**.

## P2

6. **SortIcon drawn** — `SortIcon` added to `icons.jsx` (1.8px stroke, Chevron
   geometry; two chevrons when unsorted, one for asc/desc). Inactive measured at
   `--muted`, **opacity 1, 4.96:1** (was 0.4 → 2.43:1).
7. **CalcIcon drawn** — rounded rect + display bar + four round-cap dot keys,
   14px at viewBox 24. Trigger measured **24×28**, `title="Insert an operator"`,
   `aria-label="Insert an operator into Outflow"` / `…Inflow`.
8. **Remaining glyph icons drawn** — PlanCategoryPicker's ＋ now renders
   `PlusCircle`; its ✓ and TxEditorRow's marker both render the shared
   `CheckIcon` (one path, two call sites); SplitRows' remove × → `CloseIcon`,
   "+ Add line" → `PlusIcon`; BulkBar's clear × → `CloseIcon`.
9. **Sort labels** — toolbar button renders `sortLabel(sort)` only. SortableHeader
   inverts the direction for `sort.key === 'signed'` (signed-ASC = largest
   outflow = descending in the column's own vocabulary); `aria-sort` inverts with
   it so the spoken and drawn claims agree.
10. **aria-pressed dropped** from the toolbar amounts toggle and PositionStrip's
    eye. Both labels name the action, so `aria-pressed=false` was asserting the
    inverse of the state.
11. **Error announcement** — per-cell sr-only alerts unchanged (verified: exactly
    one `role="alert"` in the row on a failed submit, `#txeditor-err-outflow`).
    The action-row summary is a plain span, 13px/600. `--neg` measures **4.40:1**
    on the row's `--soft` ground — under the floor — so it renders in a new
    `--neg-strong` token: measured **5.01:1** light, **5.38:1** dark.
12. **Disabled state** — `.field:disabled, .field[aria-disabled="true"]` added to
    theme.css (elev fill, transparent border, muted text, not-allowed). Scoped to
    `:disabled`/explicit `aria-disabled` exactly as prescribed, so the
    Payment/Transfer label is untouched. CategoryCell's read-only span now
    declares `aria-disabled="true"`. `--muted` on `--elev` = 4.83:1 light,
    6.59:1 dark.
13. **PayeeCell empty state** — `No saved payee matches. Press Enter to use "<q>".`
    styled like PlanCategoryPicker's "No matches." Verified on screen. Enter is
    now genuinely wired to that promise: with no matches it commits the free text
    and `preventDefault`s so the same keystroke does not also submit from a render
    that had not seen the payee (the commit would have lost that race).
14. **Action row sticky-RIGHT** — full-width `justify-content: flex-end` wrapper;
    the button group is `position: sticky; right: 0`. Messages sit before the
    buttons in DOM order but OUTSIDE the sticky group: inside it, a long sentence
    made the group wider than the scrollport, and sticky cannot move an element
    past its own containing block, so the pin gave out and the CTA hung 5px off
    the right edge (measured). Messages carry `flex: 1 1 240px`, so they share the
    line when it fits and take their own line when it does not, instead of being
    slid under the pinned group. Measured at 820px with the table overflowing 48px:

    | state | CTA right edge | scrollport right | fully visible |
    |---|---|---|---|
    | unscrolled | 820.0 | 820.0 | yes |
    | scrolled fully right | 808.0 | 820.0 | yes |

    Sticky group shrink-to-fit at 361.5px; message/button overlap: none.
15. **"Save and add another" → `btn(false)`.** The CTA is the only filled control.

## P3

16. **GroupHead subtitle** — `--text-toned` did not exist, so it was added
    (light `#5A6660`, dark `#AEBDB4`) and the subtitle set to 12px/600 in it.
    `--muted` on `--warn-soft` measures 4.23:1 and 11.5px earns no large-text
    exemption. Measured live: **5.11:1 light, 7.80:1 dark**.
17. **Toolbar wrap** — trailing divider gets `.tx-toolbar-divider`, hidden by a
    container query on `.tx-toolbar` at ≤1080px. Verified `display: none` at
    1024 and 1180, visible at 1440. The toolbar still wraps at 1024 (its controls
    genuinely exceed 788px) — that is the deliberate flexWrap fallback from an
    earlier wave; what is fixed is a divider stranded at a line break.
18. **Select** — `alignItemWithTrigger={false}` on the Positioner.
19. **Combobox maxHeight** — `min(var(--available-height, 320px), 420px)`.
    Verified live: `--available-height` resolved to 591px, computed maxHeight 420px.
20. **PlanCategoryPicker group labels** — trailing colon dropped (verified on
    screen: "Everyday", "Bills").
21. **`.row-flash` easing** → `cubic-bezier(0.16, 1, 0.3, 1)`.
22. **errList ordered by CELL_ORDER** — the summary is rebuilt from `cellErrors`
    in CELL_ORDER; any errList message attributed to no single cell keeps its own
    order at the end rather than being dropped.
23. **PositionStrip eye** → "Hide balances" / "Show balances" (verified in the
    accessibility snapshot), disambiguating it from the toolbar's amounts toggle.
24. **Dark scheduled tint** — the mix moved to a `--sched-row` token so the two
    themes can differ: light stays 40%, dark goes to 70%. Dark 40% put the band
    at a 1.045 luminance ratio against a normal row (present in CSS, invisible on
    screen); at 70% it measures **1.224**, and reads as a band in the screenshot.
    `TxPhoneList` now uses the same token, so phone and desktop cannot drift.
25. **Uncleared BALANCE → '—'** with `title="Uncleared — not counted until cleared"`.
    Scoped to recorded rows (`t.isPending && !scheduled`) so a scheduled row stays
    blank as before. Cleared math untouched — verified the column reads
    `["", "", "Rs 138,250", "—", "Rs 142,500", "Rs 155,000", "Rs 180,000", "—"]`
    and the top cleared figure **Rs 138,250 === the strip's Cleared Balance**.
26. **Payee option labels** — one-line ellipsis on `ComboboxItem`.
27. **PositionStrip at 390** — each operator now travels in a nowrap group with
    the operand it introduces, so the row can only break between terms.
28. **Hit targets ≥24×24** — measured: split remove **24×24**, "+ Add line"
    **75×24**, calc trigger **24×28**.

---

## Out of scope, observed

The action row's duplicate-warning span renders `--warn` on `--soft`, which
measures **3.14:1** in light theme. Not in this batch's prescriptions (item 11
names only the error summary), so it is left as found rather than fixed
opportunistically.

## Untouched (PASS list)

Mask rendering, saved-row moment, reduced-motion path, folding mechanism, sticky
mechanism, field-attribution wiring, error copy, bulk bar behaviour, chevrons,
focus-visible. BulkBar's pre-existing `rgba(150,150,150,0.28)` hover (flagged by
the design hook) is documented in-file as a deliberate neutral for the inverted
bar and was left alone.
