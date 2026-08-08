# Keyboard row navigation + range selection (Transactions)

**Date:** 2026-08-08
**Status:** Approved design — build
**Branch:** `worktree-shortcut-tooltips` (continues the keyboard-shortcuts work)

## Context

Phase 1 of the keyboard-shortcuts feature deferred the heaviest YNAB shortcuts — arrow-key row navigation, shift-extend, and shift-click range — because the Transactions table has **no focused-row (cursor) model**. Selection today is only checkbox/click toggling of a `selected` Set. This spec adds that cursor model and the range/extend operations, on the **recorded** rows only.

## Decisions (confirmed)

- **Separate cursor + selection** (GitHub/Gmail style): a highlighted cursor row that moves independently; selection changes only on Space/Shift.
- **Recorded rows only**: arrow nav / range / extend operate on the posted list (`visibleIds`). Scheduled rows keep their current click/checkbox selection, untouched.
- **Not building** (YAGNI): Cmd/Ctrl+click additive multi-select, cross-group (Scheduled↔Recorded) navigation, a cursor on scheduled rows.

## Behavior

Keys act on the **visible recorded rows** (`visibleIds = postedTx.map(t => t.id)`), while the Transactions screen is mounted, `!drawer && !confirmOpen && !shortcutsOpen`, and focus is not a typing target:

- **↑ / ↓** — move the cursor to the prev/next visible row; `preventDefault` (no page scroll); the focused row scrolls into view; the anchor collapses onto the cursor. From no cursor, seeds to the first row.
- **Space** — toggle the cursor row's selection (via `toggleRow`). Only when a cursor exists **and** `document.activeElement` is not an interactive control (BUTTON/A/INPUT/TEXTAREA/SELECT/contentEditable), so it never hijacks a focused button. `preventDefault`.
- **Shift + ↑ / ↓** — move the cursor, then set `selected` to `rangeBetween(anchor, cursor)`.
- **Shift + click** a row — set `selected` to `rangeBetween(anchor, clickedId)`; cursor → clicked. `preventDefault` (avoids the browser's shift text-selection).
- **Plain click** on a row body — selects **only** that row (clears the rest), or clears it when it is already the sole selection; sets cursor = anchor = that id.
- **Ctrl/⌘ + click** — additive toggle (add/remove that row, keeping the rest). The **checkbox** and **Space** are also additive toggles. (So multi-select requires the checkbox, Ctrl/⌘+click, Space, or Shift.)
- **Escape** — clears the selection (unchanged); the cursor persists.

Any Space/Shift selection goes through the existing `toggleRow`/`setSelected`, which already clears `schedSel` (mutual exclusion). Range ops **replace** `selected` with the range (standard).

## Pure helpers — `src/lib/rowCursor.js` (new, unit-tested)

```js
// Next id after moving `delta` (±1) from cursorId within ids. Reseeds to the
// first/last when the cursor is null or no longer present. Clamps at the ends.
export function stepCursor(ids, cursorId, delta) { … }

// The inclusive id slice between two ids, in list order (either order of args).
// Returns [] if either id is absent.
export function rangeBetween(ids, anchorId, cursorId) { … }
```

No DOM/React — takes `visibleIds` and returns ids/arrays, so both are fully testable.

## Wiring — `src/screens/Transactions.jsx`

- New state: `const [cursorId, setCursorId] = useState(null); const [anchorId, setAnchorId] = useState(null);`
- A `useEffect` document `keydown` listener (bubble phase, its own — the capture Escape chain stays untouched), gated on `!drawer && !confirmOpen && !shortcutsOpen` and guarded by `isTypingTarget`. Reuse `isTypingTarget` from `src/lib/shortcuts.js`. Reads latest `visibleIds`/state via refs (same "latest ref" pattern as `useShortcuts`) so it isn't re-subscribed each render.
  - ArrowUp/Down: `const next = stepCursor(visibleIds, cursorId, dir);` set cursor; if `shiftKey` → `setSelected(new Set(rangeBetween(visibleIds, anchorId ?? next, next)))` (seed anchor if null); else `setAnchorId(next)`.
  - Space: guarded as above → `toggleRow(cursorId, !selected.has(cursorId))`; `setAnchorId(cursorId)`.
- `Row` gains a `focused` prop; its `onClick` passes the event: `onClick={selId ? e => onToggleRow(selId, !checked, e) : undefined}`. A focused Row scrolls itself into view via a ref + `useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: 'nearest' }); }, [focused])`.
- `toggleRow(id, on, e)` gains the optional event: on `e.shiftKey` (a shift+click), `e.preventDefault()` and `setSelected(new Set(rangeBetween(visibleIds, anchorId ?? id, id)))` + `setCursorId(id)`; otherwise today's toggle, plus `setCursorId(id); setAnchorId(id)`.
- Posted render passes `focused={t.id === cursorId}` to each `<Row>`.

**Cursor highlight (visual):** the focused `<tr>` gets a distinct marker separate from the selected style — a left accent bar (e.g. `box-shadow: inset 3px 0 0 var(--accent)`) or a subtle ring. Must remain legible on both a selected and unselected row, in light and dark themes.

## Files

- **Create:** `src/lib/rowCursor.js`, `tests/rowCursor.test.js`
- **Modify:** `src/screens/Transactions.jsx` (cursor/anchor state, keydown handler, `Row` `focused` + scroll + event-passing click, posted render)

## Reused functions (do not reinvent)

- `isTypingTarget` (`src/lib/shortcuts.js`) — the typing guard.
- Existing selection: `selected`, `setSelected`, `toggleRow`, `clearSel`, `visibleIds`, `postedTx`, and the `schedSel` mutual-exclusion already in `Transactions.jsx`.
- The "latest ref" listener pattern from `src/ui/useShortcuts.js`.

## Verification

- **Unit (vitest), `tests/rowCursor.test.js`:** `stepCursor` moves ±1, clamps at both ends, seeds from null (down→first, up→first), and reseeds when the cursor id is absent; `rangeBetween` returns the inclusive slice in list order regardless of arg order, a single-element range when both ids are equal, and `[]` when either id is missing. Keep the full suite green; `vite build` clean.
- **Manual (dev server, 5207):** on Transactions, ↑/↓ moves a visible highlight and scrolls it into view without scrolling the page; Space checks/unchecks the highlighted row; Shift+↑/↓ grows/shrinks the selection from the anchor; Shift+click selects a contiguous range; plain click still toggles; none of it fires while typing in search, in a drawer/confirm, or with the help modal open; scheduled rows are unaffected; Escape clears the selection.
