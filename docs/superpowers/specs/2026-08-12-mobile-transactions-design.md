# Mobile Transactions Screen — Design Spec

**Date:** 2026-08-12 · **Status:** internally approved (sdd-auto self-review)
**Request:** "Redesign and implement the main tx screen where the txns are shown. Fully responsive, special attention to iPhone 15 Pro."

## Problem

`src/screens/Transactions.jsx` renders an 8-column desktop `<table>` (checkbox + account/date/details/category/memo/amount/status) with sortable sticky headers, a 7-control toolbar, dual selection models, and a keyboard cursor. At 393pt it scrolls horizontally (verified live 2026-08-12) — unusable on the phone shell that now lands users here via the tab bar.

## Chosen approach (B): phone list rendering, shared data pipeline

`useIsPhone()` (existing, ≤700px) branches the **presentation** inside the same
`Transactions()` component: phone gets a flex-row list + compact toolbar; desktop
keeps the table byte-identically. All state and logic — `txGroups`, search,
range, selection sets, bulk actions, drawers — is shared; only JSX branches.

**Rejected A — CSS-collapse the table** (the Dashboard trick): a real `<table>`
with `colgroup`, sticky `thead`, `colSpan` group heads, and shared Row cells
fights `display:block` remapping; fragile and unreadable. The dashboard worked
because it was already flex/grid divs.
**Rejected C — separate MobileTransactions screen**: duplicates the data
pipeline (filtering, grouping, selection, shortcuts) → permanent drift risk;
violates "prefer existing conventions".

## Design decisions (each self-resolved per sdd-auto rules)

1. **Row anatomy mirrors the dashboard's Recent list** (system consistency):
   line 1 = merchant + TxChips, right-aligned signed amount (`.tnum`,
   `amtColor`); line 2 = `dateLabel · catName · acctLabel` in muted 11.5px
   (account segment omitted on a single-account ledger). Status carried as the
   existing 15px C-glyph after the amount; overdue dates keep `--neg`.
2. **Tap = select** (existing `toggleRow` semantics, unchanged): one tap
   selects the row and raises the existing BulkBar, whose single-selection menu
   already offers Edit / Duplicate / Mark cleared / Delete — mobile actions
   without new chrome. Checkboxes are not rendered on phone.
3. **Phone toolbar = SearchField (full-width, ≥44pt) + the existing sort
   quick-toggle.** Hidden on phone: Add Transaction (tab bar ＋ owns it),
   Undo/Redo/RecentMoves (desktop activities), wide-mode toggle (meaningless).
4. **Scheduled band stays**: same collapse button rendered as a full-width
   `--warn-soft` band above the scheduled phone rows; spacer band between
   populations kept.
5. **Rows ≥44pt tall, ≥8px gaps** (touch floor); no swipe gestures, no
   pull-to-refresh (anti-goals; online-only app, no gesture vocabulary yet).
6. **Sticky phone header: none in v1** — the shell header + strip already cost
   fold height; sorting is available via the toolbar toggle.
7. **New component file `src/components/TxPhoneList.jsx`** — Transactions.jsx
   is 762 lines; the phone list is a presentation unit with a clean props
   interface (rows, scheduled, selection state, handlers). Module scope,
   stable component types (same remount lesson as Row/GroupHead).

## Scope & anti-goals

Touch: `src/screens/Transactions.jsx` (render branches), new
`src/components/TxPhoneList.jsx`, `src/styles/theme.css` (phone block),
pure helpers if extracted. Untouched: data pipeline (`txGroups`, `txRow.js`,
actions, TxViewContext), desktop table markup, keyboard shortcuts (inert on
phone by nature), BulkBar internals, drawers. Anti-goals: swipe actions,
date-section grouping, infinite scroll, pull-to-refresh, editing the desktop
toolbar.

## States & edge cases

- Empty month / empty search: existing empty states render (they're plain divs
  — verify they fit 393pt).
- Scheduled-only, recorded-only, both (spacer), collapsed scheduled.
- Overdue rows (date in `--neg`), pending rows (dim via `rowOpacity`),
  scheduled warm wash, selected `--soft` fill.
- Long merchant/category names truncate; amount never wraps (`.tnum`,
  `flex: none`).
- Single-account ledger (`/transactions/:accountId`): no account segment in
  sub-line; strip already scoped.
- BulkBar with large selections; Escape/scrim behaviors unchanged.
- Masked amounts (default) render as masked through the shared `fmt`.

## Acceptance criteria

- [ ] 393×852: no horizontal scroll (`scrollWidth ≤ 393`) on All Accounts with
      real-shaped data (both populations present).
- [ ] Phone rows show merchant/chips/amount + date·category·account sub-line;
      rows ≥44pt tall; amounts right-aligned tabular.
- [ ] Tap a row → BulkBar appears with count 1; its menu offers Edit;
      tap again → selection clears.
- [ ] Scheduled band collapses/expands; overdue cue visible.
- [ ] Phone toolbar: full-width search (≥16px input font) + sort toggle only;
      no Add/Undo/Redo/RecentMoves/wide controls.
- [ ] Desktop 1280×800: table, toolbar, and all behaviors pixel-identical to
      pre-change (no DOM changes on the desktop path beyond the branch).
- [ ] `pnpm test` green (851+), `pnpm build` clean.

## Self-review notes

Checked for: ambiguity (row anatomy pinned to exact fields; toolbar inventory
enumerated), scope creep (grouping/gestures explicitly out), contradictions
(tap-select vs tap-edit resolved: select wins, Edit lives in BulkBar — matches
desktop click semantics), edge cases (single-account, both populations,
masked), responsiveness (only ≤700px changes; 701–1180 unchanged), acceptance
criteria testable via Playwright + fixture harness (auth gate: use the
established throwaway-Vite-harness pattern with resolveId stubs when live
login is unavailable).
