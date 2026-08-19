# Spending Breakdown — YNAB parity rebuild

**Date:** 2026-08-19
**Status:** Approved (goal-mode run; user delegated remaining decisions)
**Reference:** 14 YNAB web-app screenshots captured 2026-08-19 (user's own data in YNAB). Raqam's existing visual language (indigo sidebar, pill buttons, rounded cards) is the house style; YNAB supplies the report's *structure and behavior*.

## Goal

Rebuild the Reflect → Spending Breakdown tab (`/reflect` index route) to match YNAB's Spending Breakdown report: rich local filters, an interactive donut, group drill-down, per-category transaction popovers, and a two-file CSV export — with mobile parity.

Decisions locked with the user:

- Full parity in one build (no phasing).
- **ECharts** for the donut.
- Filters are **local to Spending Breakdown** (not the shared Reflect bar).
- **Mobile parity** in this pass (sheets on phone).
- Date range: **presets only** (no Custom from–to picker).
- Multi-month ranges **sum across the range**; Average Monthly Spending = total ÷ months in range.

## What YNAB does (from the screenshots)

1. Filter row under the title: `‹ | 📅 <range label> | ›` + `All Categories ▾` + `All Accounts ▾`.
2. Date menu: This Month, Last 3 Months, Last 6 Months, Last 12 Months, Year To Date, Last Year, All Dates (+ Custom, which we skip). Check mark on the active preset. ‹/› steps the range.
3. Categories dropdown: search field, checkbox tree (groups with nested categories, plus a root "Uncategorized Transactions" entry), Select All / Select None, Cancel / **Done** (selection applies on Done).
4. Accounts dropdown: same anatomy, flat accounts under group headers.
5. Left card: "Total Spending" + amount, Categories ⇄ Groups pill toggle, donut with external leader labels (name, amount, percent).
6. Donut hover: other slices dim; the center readout swaps from "Total Spending / total" to the hovered slice's name / amount / percent.
7. Donut click and list-row click: anchored popover with that category's transactions — columns ACCOUNT / DATE / PAYEE / MEMO / AMOUNT — and a Close button. The matching list row gets a focus ring/highlight.
8. Groups lens: clicking a group drills in — title becomes breadcrumb `All Groups › <Group>`, donut/list/total recompute for just that group's categories; "All Groups" navigates back.
9. Stat cards: Average Monthly Spending, Average Daily Spending, Most Frequent Category (n transactions), Largest Outflow (payee + amount).
10. Export: modal ("Export Report", reassurance copy, "Don't show again" checkbox, Cancel/Export) that downloads **two** CSVs — a summary and a transaction detail (shapes below).

## Architecture

### Filter state (local to SpendingBreakdown)

`SpendingBreakdown.jsx` owns:

```js
{
  range: { from, to },        // 'YYYY-MM' | null bounds, from lib/dateRange.js semantics
  catSel: null | Set<id>,     // null = all categories; ids include 'uncategorized'
  acctSel: null | Set<id>,    // null = all accounts
  lens: 'categories' | 'groups',
  drillGroupId: null | string,        // groups lens drill-down
  focus: null | { id, anchor },       // open transaction popover target
}
```

Default range = This Month (seeded from `useMonth()` so it agrees with the app's month context on first paint).

`Reflect.jsx` keeps its shared native-select FilterRow **for the other four tabs** but hides it on the index route (`useLocation().pathname` check). Outlet context is unchanged, so the other tabs are untouched.

### Data layer — new `src/lib/spendingReport.js`

`reports.js` stays as-is (other tabs use it). New module, unit-tested:

- `reportTxns(store, { from, to, acctIds, catIds, now })` → the filtered transaction list. Predicate: `inRange(t, from, to)` (from `dateRange.js`) ∧ `t.status !== 'pending'` ∧ `hasOccurred(t, now)` ∧ `t.type ∈ {'expense','refund'}` ∧ account/category membership (null sets = all; `t.category == null` matches the `'uncategorized'` id). Refunds subtract, mirroring `reports.js`.
- `breakdownByCategory(store, opts)` → rows `{ id, name, icon, color, amt, pct, groupId, txCount }`, sorted amt desc; always includes Uncategorized. Colors: `category.color` or `PALETTE[i % len]` fallback (same palette, moved to this module).
- `breakdownByGroup(store, opts)` → rows `{ id, name, amt, pct, color, catIds }`; group color = stable `PALETTE` assignment by sorted position; Uncategorized is its own bucket; missing `groupId` → `Other`.
- `rangeMonths(store, from, to, now)` → ordered `['YYYY-MM', …]` covered by the range; for All Dates, earliest transaction month → current month. Used for stats and CSV month columns.
- `breakdownStats(store, opts)` → `{ total, avgMonthly, avgDaily, mostFrequent: {name, count}, largestOutflow: {merchant, amt} }` where `avgMonthly = total / rangeMonths.length` and `avgDaily = total / daysInRange` (calendar days; for open-ended ranges, days spanned by `rangeMonths`).
- `categoryTxRows(store, catId, opts)` / group variant → popover rows `{ id, account, date, payee, memo, amt }`, date desc.

### Date range — extend `src/lib/dateRange.js`

Add preset ids `last6`, `last12`, `ytd` to `rangeFor` and a new exported `REPORT_PRESETS` list in YNAB's order: `month, last3, last6, last12, ytd, lastYear, all` with YNAB labels ("Last 3 Months", "Year To Date", …). The existing `RANGE_PRESETS` list is untouched (other consumers). `shiftRange`/`presetOf`/`rangeLabel`/`clampRange` are reused as-is. Pill label: `rangeLabel(from, to)` (reads "Aug 2026", "Jun – Aug 2026", "All dates").

### UI components — new `src/ui/reflect/`

1. **`ReportFilterBar.jsx`** — the pill row: `‹ | 📅 label | ›` + `Categories ▾` + `Accounts ▾` pills. Arrows call `shiftRange` (disabled when it returns null). Pills show "All Categories" / "N Categories" per selection.
2. **`DateRangeMenu.jsx`** — Base UI Menu off the date pill; radio-style items with a check on the active preset (`presetOf`). Phone (`useIsPhone`): same list in a `BottomSheet`.
3. **`FilterMultiSelect.jsx`** — the generic searchable checkbox-tree popover, used for both Categories and Accounts. Anatomy: `SearchField` on top, scrollable tree (`Checkbox` with `indeterminate` on parent rows, children indented), footer `Select All · Select None · Cancel · Done`. Selection is **staged locally and applied on Done**; Cancel/outside-click discards. Desktop: Base UI Popover anchored to the pill; phone: bottom sheet (search stays top here — the footer buttons take the thumb zone). Data adapters:
   - Categories: groups + their categories (from `store.categoryGroups`/`store.categories`, reusing `categoryPickerSections`-style grouping) + root "Uncategorized Transactions" entry. Category rows render the cat-icon swatch (`catIcon.js`) — Raqam's analogue of YNAB's emoji (which live in YNAB category *names*, not a field).
   - Accounts: active accounts (`nickname`) sectioned by institution kind (`instId` → `store.institutions`, `kindLabel`), Raqam's analogue of YNAB's "Cash Accounts" headers.
4. **`SpendingDonut.jsx`** — ECharts wrapper (`echarts/core` + `PieChart` + `LabelLayout`, canvas renderer, tree-shaken). One `pie` series, `radius` tuned to YNAB's ring thickness, `padAngle`/white border for slice gaps, `label` external with leader lines: `{name}\n{amount} ({pct})`. Hover: `emphasis.focus: 'self'` + `blur.itemStyle.opacity` dims siblings; `mouseover`/`mouseout` events drive a **React center overlay** (absolutely positioned; not ECharts `graphic`) that swaps Total ⇄ hovered slice name/amount/pct. `click` emits `(sliceId, virtualAnchor)` where the anchor is a `getBoundingClientRect`-style virtual element at the click point for the Base UI popover. Resizes via `ResizeObserver`. Chart is decorative to screen readers (`aria-hidden`) — the adjacent list is the accessible representation, matching the current Donut's summary-label approach.
5. **`CategoryRowList.jsx`** — right-card rows (icon swatch, name, amount, progress bar, percent). Click behavior by lens: categories lens (or drilled group) → toggle `focus` popover, row gets the ring/highlight; groups lens → set `drillGroupId`. Header shows `Categories`/`Groups`, or the breadcrumb `All Groups › <Group>` when drilled (button resets `drillGroupId`).
6. **`TransactionPopover.jsx`** — direct `@base-ui/react/popover` with external `anchor` (element for rows, virtual for slices), modeled on `CategoryPickerPopover`. Header: cat-icon + name; table ACCOUNT / DATE / PAYEE / MEMO / AMOUNT (refunds positive, spends negative, `money()` formatting, dd/mm/yyyy dates as in the register); footer Close button. Phone: bottom sheet with the same table.
7. **`ExportModal.jsx`** — `ExplainDialog`-pattern centered card (phone: bottom sheet): title "Export Report", copy "Your data is yours — the report will be exported as CSV files you can open anywhere.", `Checkbox` "Don't show again" (persisted at `localStorage['raqam.reflect.exportConfirmSkip']`; when set, the Export button in the page header downloads immediately), Cancel / Export.

### Export — new `src/lib/spendingExport.js` (unit-tested)

Built on existing `toCsv`/`downloadCsv`. Two files per export, honoring the active filters + lens drill:

- **Summary** `raqam-reflect-spending-breakdown-<YYYY-MM-DD>.csv`: columns `Category Group, Category, <one per month in range: 'Aug-26' …>, Average, Total`. Rows: Uncategorized first, then categories grouped by group (group name repeated per row, YNAB-style). Outflows negative.
- **Transactions** `raqam-reflect-spending-breakdown-<YYYY-MM-DD>-transactions.csv`: columns `Account, Flag, Date, Payee, Category Group/Category, Category Group, Category, Memo, Outflow, Inflow, Cleared`. `Flag` empty (Raqam has no flags), `Category Group/Category` = `"Group: Category"`, Outflow/Inflow split by sign, `Cleared`/`Uncleared` from `t.status`.

### Page layout

Desktop (>700px): filter bar under the `Spending Breakdown` title (title ⇄ breadcrumb when drilled) with Export at top right; two columns — left card (Total Spending + toggle + donut + stat grid below), right card (rows list). Phone: single column — filter pills wrap; donut card, stat grid, then list; all popovers become sheets.

### Error/empty handling

- Zero spending in range → donut renders the empty track ring, list shows the existing empty note, Export disabled.
- A drilled group emptied by filter changes → auto-reset `drillGroupId`.
- Popover target disappearing on filter change → `focus` cleared whenever filters/lens change.

## Testing

- **Vitest (node, no jsdom):** `spendingReport.js` (range filtering incl. uncategorized + refund signs + account/category sets, months/days math for each preset, group enrichment), `dateRange.js` additions (last6/last12/ytd + presetOf round-trip), `spendingExport.js` (both CSV shapes, month columns, sign conventions, filenames).
- **Live browser (Playwright subagent, per standing memory):** filter interactions, drill-down + breadcrumb, slice/row popovers, hover center readout, export downloads (both files), phone-width sheet behavior. Subagent fixes what it finds.

## Out of scope

Custom date range picker; flags; other Reflect tabs (Trends/Net Worth/Income v Expense/Age of Money); YNAB's help beacon; changes to the shared Reflect outlet context.
