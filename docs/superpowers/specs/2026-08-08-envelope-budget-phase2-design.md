# Envelope budget, Phase 2 — moving money

**Date:** 2026-08-08 · **Status:** Approved design (pending spec review) · **Branch:** `worktree-budget-phase2` (stacked on `worktree-budget-redesign` / PR #50)
**Visual reference:** `2026-08-08-ynab-budget-reference.md` §6-7, §11-13 + the user's screenshots (assign popover, RTA breakdown, calculator, Moves history, cover-overspending, move-to dialogs).

## Context

Phase 1 shipped the envelope foundation (assignments, RTA, Plan table with a plain click-to-edit ASSIGNED cell). Phase 2 adds the money-moving interactions that make it a real envelope tool: the Assign popover, the RTA breakdown, the calculator field with a per-category Moves history, and the Available-pill move/cover popovers — all sharing one grouped category picker.

## Decisions locked in brainstorming

- **Assign popover keeps the ⚡ Auto / Manually tabs, Auto disabled** ("Targets coming later" tooltip) — visually faithful, functionally manual-only.
- **Calculator:** typed leading-operator expressions (`+n −n ×n ÷n`, with `*` `/` aliases) evaluated against the current value on commit, plus the 4 op buttons in a caret popover; the `+−×÷` glyph sits left in the field.
- **Clock icon = read-only Moves history popover** (per the user's screenshot: DATE / MOVE / AMOUNT rows, avatar chip, Close). It does not restore values (Cmd+Z covers that).
- **`moveAssigned` is one reducer** — either side may be `'rta'`; one undo step; one audit row that powers both Recent Moves and the Moves popover.
- Moving more than is assigned is allowed (assigned may go negative, YNAB-style); no clamping in the reducer.

## 1. Store action — `src/store/actions.js`

```js
// Move assigned money between two envelopes (or Ready to Assign) in one step.
// from/to: category id or 'rta'. from==='rta' → plain assign; to==='rta' → unassign.
export function moveAssigned(data, { from, to, month, amount }) { … }
```

- `amount = Math.round(amount)`; no-op (same reference) when `amount <= 0`, `from === to`, or both sides `'rta'`.
- Category side updates reuse the `setAssigned` upsert/remove-at-zero mechanics inline (single new `assignments` array, not two chained reducers — one audit row only).
- Audit: `makeAudit({ entityType: 'assignment', action: 'move', entityId: from + '>' + to + '|' + month, summary: 'Moved <amt> from <FromName> to <ToName> (<month>)', after: { from, to, amount, month } })` where the RTA side renders as "Ready to Assign". Recent Moves shows the summary as-is.

## 2. Calculator helper — `src/lib/calcExpr.js` (new, pure, unit-tested)

```js
// applyCalcExpr(current, input) → number | null (null = invalid, keep editing)
```

- Plain number (via `parseAmt`) → that number.
- Leading operator `+ - − × * ÷ /` followed by a number → `current op n` (÷0 → null). Result `Math.round`ed; may be negative.
- Anything else → null.

## 3. Shared picker — `src/ui/PlanCategoryPicker.jsx` (new)

Dropdown panel used by Assign / Move / Cover popovers: a text input (type-to-filter, casefolded match on name) over a scrollable list — **"Inflow: Ready to Assign 〈rta〉"** first (green, always visible unless `excludeRta`), then groups by `sortOrder` as section headers with active expense categories, each showing its current Available right-aligned (`var(--pos)` positive / `var(--neg)` negative / muted zero). Props: `{ env, S, month, onPick(idOr'rta'), excludeRta?, excludeId? }`. Keyboard: ↑/↓ moves, Enter picks, Escape closes. Module-scope components; dismissal per the TxMonthNav contract.

## 4. Plan-screen popovers — `src/screens/Plan.jsx` (+ small new components)

- **Assign ▾** button appears on the RTA banner (right side, dark-green like the reference). Popover: tabs ⚡ Auto (disabled) / **Manually**: `Assign [amount input, prefilled full RTA]` → `To [PlanCategoryPicker, excludeRta]` → Cancel / **Assign** → `applyData(moveAssigned({from:'rta', to, month, amount}))`. Disabled Assign until a category is picked and amount > 0.
- **RTA breakdown**: clicking the banner (not the Assign button) opens a popover listing, from `envelopeFor(month)` and `envelopeFor(prevMonth)`: `Left over from last month` (prev rta) · `+ Opening balances` (openingTotal) · `+ Income` · `− Assigned` · `− Uncategorized outflows` · `− Last month's overspending` (derived: prev.rta + opening + income − assigned − uncat − rta) · **`= Total Ready to Assign`**, plus the muted info note. Zero lines hidden; the identity is exact by construction.
- **ASSIGNED editor upgrades**: the edit field gains the `+−×÷` glyph (left), the **clock** button (right), and a caret popover with the 4 op buttons (click inserts the operator at the cursor). Commit path: `applyCalcExpr(currentAssigned, draft)`; null → stay editing with the invalid text selected.
- **Moves popover** (clock): title "Moves" + category name; table DATE / MOVE / AMOUNT from the audit log — entries where `entityType === 'assignment'` and the row's category+month is involved (`entityId` prefix match for set/create/update/delete; `after.from === id || after.to === id` with `after.month === month` for moves). Labels: `Assigned` / `Removed` for direct sets, `Moved from 〈X〉` / `Moved to 〈X〉` for moves; avatar chip = first letter of the user's display name; **Close**. Read-only.
- **Available-pill popovers**: red pill click → **"Cover overspending from"** + picker (amount fixed at the overspend magnitude, shown as copy not an input) → OK → `moveAssigned({from: picked, to: catId})`. Green pill click → **"Move [amount input, default available] To [picker, excludeId=this]"** → OK → `moveAssigned({from: catId, to: picked})`. Beige (zero): no popover.

## Out of scope (later phases)

Auto-assign (targets), inspector sidebar (P3), filter views / activity popover / Recent-Moves restyle (P4), multi-hop moves, drag-to-move.

## Verification

- **Unit:** `moveAssigned` — cat→cat, rta→cat, cat→rta, negative-source allowed, no-op cases by reference, single audit row shape (after.{from,to,amount,month}); `applyCalcExpr` — plain, all six operator spellings, ÷0 null, garbage null, rounding; picker/popovers are screen-level (no jsdom) — live verification.
- **Live (Playwright, real data + YNAB side-by-side):** Assign popover assigns from RTA and both figures move; breakdown lines sum exactly to the banner figure; typed `+500` and op-button flows change assigned correctly; clock shows the move history with correct wording; red pill covers overspending (pill turns beige/green, source drops); green pill moves to another category; every popover Escape/outside-dismisses; Cmd+Z reverts each move in one step.
