# Shortcut Tooltips

**Date:** 2026-08-08
**Status:** Approved (scope confirmed) — build
**Branch:** `worktree-shortcut-tooltips` (off merged `main`)

## Goal

Surface each keyboard shortcut on its control via a dark hover/focus **tooltip** (action label + keycap chips), styled like the reference: `Add new transaction  [shift] [N]`. Tooltips read their label + chips from the shortcut registry (`src/lib/shortcuts.js`) so they can never drift from the `?` help modal or the actual bindings.

## Decisions (confirmed)

- Registry-driven: a `SHORTCUT_BY_ID` lookup exposes each item's `label` + `keys` for its control.
- Show on **hover and keyboard focus** (accessibility), after a short delay; hide on leave/blur. No tooltip on touch/no-hover devices.
- Reuse the help modal's key-cap rendering (extract `Kbd` to a shared component with an `onDark` variant for the dark tooltip).
- Always-visible controls get a floating tooltip; **dropdown menu items** get an inline right-aligned chip instead (a tooltip inside an open menu popover would overlap/clip — the macOS-menu convention is cleaner and more discoverable).

## Components

### `src/ui/Kbd.jsx` (new — extracted from ShortcutHelpModal)
`Kbd({ children, onDark })` — a keycap. Default: `var(--elev)` bordered (light surfaces). `onDark`: light-grey cap on the dark tooltip (`#3a4152` bg / `#4a5265` border / white text). `ShortcutHelpModal` imports it instead of its local copy.

### `src/ui/Tooltip.jsx` (new)
`Tooltip({ shortcut, label, keys, placement = 'top', delay = 350, children })` — wraps one control in a `position: relative` inline-flex span; on `mouseenter`/`focus` (after `delay`) shows a `role="tooltip"` dark pill (label + `onDark` `Kbd` chips) positioned above (or below, `placement`) the child, centered, `z-index: 70`, `pointer-events: none`, a quick fade (skipped under `prefers-reduced-motion`). `label`/`keys` come from `shortcut` (a registry item) when passed. Clears its timer on unmount.

### `src/lib/shortcuts.js` (modify)
Add `export const SHORTCUT_BY_ID = Object.fromEntries(SHORTCUT_GROUPS.flatMap(g => g.items.map(i => [i.id, i])));`

## Wiring

| Control | File | Chips | Placement |
|---|---|---|---|
| Add Transaction (ToolbarAction) | Transactions.jsx | shift · N | top |
| Undo / Redo (ToolbarAction) | Transactions.jsx | ⌘·Z / ⌘·shift·Z | top |
| Search box (SearchField) | Transactions.jsx | ⌘·shift·F | top |
| ~~Select-all checkbox~~ | — | ⌘·A | **omitted** — the `fill` checkbox is `position:absolute; inset:0` over its sticky `<th>`; any wrapper reparents that and breaks the full-cell hit area. ⌘·A stays in the `?` help modal. |
| Reconcile button | Header.jsx | shift · E | bottom (top bar) |
| Bulk: Mark cleared/uncleared (inline) | BulkBar.jsx | inline `onDark` chip after label | — |
| Bulk: Duplicate / Delete / Make repeating (menu) | BulkBar.jsx | inline right-aligned chip | — |
| Scheduled: Post now (menu) | BulkBar.jsx | inline right-aligned chip (E) | — |

**BulkBar uses inline chips, not floating tooltips:** the bar is `overflow-x: auto` (its `MoreMenu` is `position: fixed` precisely to escape that clip), so an absolute Tooltip inside it would be clipped. Inline keycaps (on-dark in the bar, default in the light menu) are clip-free and more discoverable anyway.

- **ToolbarAction** gains an optional `shortcut` prop; when set it wraps the button in `<Tooltip shortcut={…}>` (keeps its `title` as the native fallback removed to avoid a double tooltip).
- **SearchField** and the **select-all checkbox** are wrapped at their call sites in Transactions.jsx.
- **Reconcile** button wrapped at its call site in Header.jsx.
- **BulkBar** action/menu item data gains an optional `keys` array: inline actions render a `<Tooltip>`; `MoreMenu` items render the chips inline, right-aligned in the row. The controller (Transactions.jsx) adds `keys` from `SHORTCUT_BY_ID` to the relevant `actions`/`more` items.

## Out of scope

No new shortcuts, no behavior change — purely surfacing existing shortcuts. Controls without a shortcut are untouched.

## Verification

- **Unit (vitest):** `SHORTCUT_BY_ID` has one entry per registry item and each entry carries `label` + `keys` (add to `tests/shortcuts.test.js`). `Kbd`/`Tooltip` are not unit-tested (no jsdom).
- **Build:** `npx vite build` clean; full suite green.
- **Manual (5207):** hovering (and tab-focusing) each control shows a dark tooltip with the right label + chips; the tooltip disappears on leave/blur; bulk-bar menu items show right-aligned chips; nothing clips; the chips match the `?` help modal exactly.
