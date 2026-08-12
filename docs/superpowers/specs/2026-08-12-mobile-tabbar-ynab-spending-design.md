# Mobile Tab Bar + YNAB-Style Spending — Design Spec

**Date:** 2026-08-12 · **Status:** user-approved (brainstorm dialogue)
**Request:** Five-section bottom bar — Home (dashboard) · Plan (budget) ·
Spending (transactions) · Accounts · Reflect — mimicking YNAB mobile, plus a
YNAB-style Spending screen. Reference: 15 YNAB iOS screenshots (2026-08-12).

## Context

Built on the mobile-dashboard branch work: `useIsPhone()` (≤700px),
`MobileTabBar.jsx` (currently Dash · Tx · [+] · Budget · Accounts),
`TxPhoneList.jsx` (flat list, tap=select), phone bulk bar clearance, safe-area
handling. All five destinations already exist as routes: `/dashboard`,
`/budget` (→ Plan), `/transactions`, `/accounts`, `/reflect`. Desktop is
untouched throughout.

## User decisions (asked & answered)

1. **Scope:** tab bar + full Spending mimicry now; calculator-keypad add/edit
   sheet is the next phase. Category picker pulled INTO this phase (needed by
   Select-mode Categorize).
2. **Row tap:** switch to YNAB model — tap opens the edit drawer; multi-select
   moves behind an explicit Select mode.
3. **Add button:** floating "+ Transaction" pill above the tab bar on ALL five
   phone screens (not Spending-only, not a center tab slot).

## 1 · Tab bar (`src/components/MobileTabBar.jsx`)

- Five equal tabs, YNAB order/labels: **Home** `/dashboard` · **Plan**
  `/budget` · **Spending** `/transactions` · **Accounts** `/accounts` ·
  **Reflect** `/reflect`. Center ＋ button removed.
- Icons in the existing 1.8-stroke line language: house (new), envelope/jar
  (reuse `budget`), banknote (new: rounded rect + center circle, YNAB-like),
  bank columns (existing), bar-chart (new, matches Reflect sidebar icon).
- **Floating pill geometry** (YNAB shape, Trusted Ledger skin): the nav
  becomes `position: fixed` bottom bar inset by 10px sides /
  `calc(8px + env(safe-area-inset-bottom))` bottom, `border-radius: 999`,
  `var(--surface)` bg, 1px `var(--border)`, soft shadow token. Content
  scrolls behind it; scrollable phone screens get bottom padding
  (tab-bar height + pill clearance) via a shared CSS var
  `--phone-nav-clearance` so the last row is never trapped under chrome.
  Active tab keeps the Soft-Teal nav idiom (accent icon, `--soft` bg).

## 2 · Floating "+ Transaction" pill (new `src/components/AddTxPill.jsx`)

- Right-aligned pill floating above the tab bar (fixed, same right inset,
  bottom = tab-bar top + 12px), accent bg, ＋ glyph + "Transaction" label.
- Rendered by the phone shell on all five tab screens; opens
  `openers.addTx(openDrawer)` (expense default), exactly what the center ＋
  did.
- Hidden while Select mode is active (YNAB behavior — selection chrome takes
  the space).

## 3 · Spending screen, phone branch (`Transactions.jsx` + `TxPhoneList.jsx`)

### Header & toolbar
- Large screen title "Spending" (rename from Transactions on phone chrome
  only; route and desktop untouched).
- Toolbar right: **Select** pill · search icon · **⋯** overflow. Search icon
  expands the existing full-width 44pt SearchField (collapsed by default to
  buy back fold height); ⋯ menu holds the sort quick-toggle (and future
  items). In Select mode the header becomes title + ✕ (exits mode).

### Banners (each rendered only when count > 0)
- **"N to categorize · Review"** — our mapping of YNAB's "New transactions"
  approval flow (we have no import/approval concept): counts posted
  transactions of category-bearing types (expense/refund/income) with no
  category. Tapping filters the list to those rows; YNAB's yellow
  "Category Needed" chip appears on such rows in all modes.
- **"Show N uncleared transactions"** — applies the existing uncleared status
  filter (`status === 'pending'`).

### List
- **Date-section grouping**: posted rows grouped by calendar day with sticky
  day headers ("August 12, 2026"). Date therefore leaves the row sub-line.
  Grouping is presentation-only, computed from the already-sorted
  `postedRows`; when the sort key is not date, grouping falls back to the
  flat list (headers only make sense date-sorted).
- **Row anatomy (YNAB)**: line 1 = payee (fallback "No Payee Set") left,
  signed amount (`.tnum`, `amtColor`) + 15px status glyph right; line 2 =
  category chip (soft colored pill; yellow "Category Needed" variant when
  uncategorized) left, account name right in muted 11.5px (omitted on
  single-account ledgers, as today). Memo = third muted line when present.
  Rows ≥48pt, ≥44pt touch targets throughout.
- **Tap = edit**: `openers.editTx(S, txId, openDrawer)` — the drawer already
  presents as a bottom sheet on phone. Card-adjustment rows (editTx no-op)
  fall back to no action, matching desktop.

### Select mode
- Entered via the Select pill; exits via ✕ (clears both selections).
- Selection circles animate in on the row's left edge; tap toggles
  membership (replacing tap=edit while the mode is on).
- **Floating count pill** bottom-center above the action bar: selected sum
  (`fmt.moneyS`) + "N transactions selected".
- **Bottom action bar** (floating, replaces the ＋ pill): **Categorize** ·
  **ⓒ** (toggle cleared) · **⋯** (menu = existing bulk actions: Edit when
  exactly 1, Duplicate, Delete; scheduled-selection variants unchanged).
  Wired to the SAME handlers the desktop BulkBar uses; BulkBar itself stays
  desktop-only chrome. **Categorize is a new bulk action** (desktop gains it
  in the ⋯/more menu too): sets the category on all selected
  category-bearing transactions via the category picker; transfers /
  adjustments in the selection are skipped with the existing toast pattern.
- Scheduled rows keep their separate selection set; mixed posted+scheduled
  selection remains mutually exclusive (existing rule).

### Scheduled band
- Keep the existing collapse behavior, restyled as YNAB's "› Scheduled"
  disclosure row (chevron + label + count/overdue note) above the dated
  sections; rows inside keep the warm wash + S/overdue glyphs.

## 3b · Category picker (new phone bottom sheet, `src/drawers/` family)

- Opens from Select-mode Categorize (this phase) and later from the keypad
  add/edit sheet (next phase).
- Grouped by category group; each row = emoji/name left, **available
  balance** right from `envelope.js` month table (green positive / `--neg`
  negative / muted zero). "Inflow: Ready to Assign" pinned as its own top
  group when the context allows inflow categorization.
- **"+ New Category"** row at top → existing new-category flow (name +
  group), then auto-selects it.
- **"Split Between Categories"** row shown ONLY in single-transaction edit
  context (not bulk categorize), reusing the split infrastructure from the
  2026-08-11 split design; if wiring proves non-trivial it moves to the
  keypad phase (explicitly allowed fallback).
- **Floating "Search Categories" field docked at the bottom** (thumb reach,
  YNAB placement), filtering across groups as you type; ≥44pt.
- Selecting a category applies immediately and closes the sheet.

## Data-model mapping (no schema changes)

YNAB approve/new → uncategorized count (Review banner). YNAB cleared ⓒ →
existing `status` cleared/pending. YNAB scheduled → existing rules + future
tx. YNAB flags, photos, repeat-editor, payee management → not in our model;
out of scope (flags/photos indefinitely; repeat exists as `repeat` preset in
the drawer already).

## Scope & anti-goals

Touch: `MobileTabBar.jsx`, new `AddTxPill.jsx`, `Transactions.jsx` (phone
branch + new bulk-categorize handler), `TxPhoneList.jsx`, new category-picker
sheet, `theme.css`, `App.jsx`/shell (pill mounting, clearance var). Desktop
table/toolbar/BulkBar markup untouched except the added Categorize item in
the more-menu. Anti-goals this phase: calculator keypad sheet, payee picker,
flags, photos, swipe gestures, pull-to-refresh, infinite scroll, changing
routes or data model.

## Testing

- Vite throwaway harness (no jsdom) for logic: day-grouping helper,
  uncategorized/uncleared counts, bulk-categorize skip rules.
- Playwright subagent, iPhone 15 Pro viewport (393×852): tab bar navigation
  across all five tabs, pill opens add sheet, tap-opens-editor, Select-mode
  flow (select → categorize via picker → cleared toggle → delete), banners
  filter, scheduled disclosure, safe-area/clearance (last row reachable).

## Acceptance criteria

1. Phone bar shows Home · Plan · Spending · Accounts · Reflect, floating
   pill style, correct active states; no center ＋.
2. "+ Transaction" pill floats above the bar on all five screens and opens
   the add drawer; hidden during Select mode.
3. Spending list is day-grouped with sticky headers; rows match the YNAB
   anatomy incl. category chip and status glyph.
4. Tapping a row opens the edit sheet; Select mode enables multi-select
   with count pill and Categorize/ⓒ/⋯ actions, all functional.
5. Review + uncleared banners appear only when counts > 0 and filter
   correctly.
6. Category picker sheet shows grouped categories with correct available
   balances, bottom search filters, New Category works, bulk apply skips
   non-category types.
7. Desktop register renders byte-identically except the added Categorize
   more-menu item.
