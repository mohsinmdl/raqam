# YNAB Budget ("Plan") screen — captured design reference

**Date:** 2026-08-08 · Captured live from app.ynab.com (Test budget) via Playwright, plus the user's annotated screenshots. This is the source-of-truth reference for the Raqam budget-screen redesign; the feature specs point here instead of re-measuring.

## Design tokens (computed styles, live)

- **Font:** Figtree (same family Raqam already adopted). Body 16px, `#191818` on warm off-white.
- **Accent (links/actions):** `#475AFA` (rgb 71,90,250) — toolbar "＋ Category Group", filter links, sidebar Auto-Assign buttons. Raqam maps this to `var(--accent)`.
- **Month header:** 21px / 700.
- **Table header** (CATEGORY / ASSIGNED / ACTIVITY / AVAILABLE): 14px / 500, letter-spacing 0.6px, `#191818`.
- **Group (master) row:** height 40px, bg `#F8F6F2`; name 16px / 600.
- **Category (sub) row:** height 44px, bg `#FFFFFF`; name 16px / 500; amounts 14px / 500 tnum.
- **Ready to Assign pill:** radius 8, padding ~8px 16px 12px; label 14px / 400 muted; amount 21px / 700. Zero-state bg `#F3EEE2` (beige, muted text). Positive state (from screenshots): light-green banner (~`#C9EE8F`) with dark-green **Assign ▾** button; text near-black.
- **Filter pills** (Underfunded / Money Available / Snoozed): 12px / 500, radius 5, padding 3px 12px, bg `rgba(199,196,189,.24)`, 1.5px transparent border (border colors on active).
- **Segmented view toggle** (progress-bar view ⟷ compact view): container bg `rgba(125,109,63,.16)`, radius 8, padding 2 — same pattern as Raqam's existing pill toggles.
- **Progress bar container:** height ~32 (row bottom edge), bar itself thin (~4px) full-width under the row content; green fill, red for overspent segment, track `rgba(125,109,63,.16)`.
- **Available pills (from screenshots, approx):** positive = green pill (~`#B7E96B` bg, near-black text); overspent = red pill (~`#EDA69F` bg, dark red text); zero = beige pill (`#F3EEE2`, muted text). Radius 999.
- **Popovers:** white cards, radius ~12, shadow, with a caret/tail pointing at the trigger (same speech-bubble pattern Raqam's BulkBar MoreMenu uses).

Full-page reference screenshot: `2026-08-08-ynab-budget-reference.png` (also the 18 annotated screenshots in the task thread).

## Category tree (live Test budget — the DEFAULT starter set)

- **Needs:** 🛒 Groceries · 🚘 Transportation · 🩺 Medical expenses · 😌 Emergency fund
- **Bills:** 🏠 Rent/Mortgage · 📱 Phone & Internet · ⚡️ Utilities
- **Wants:** 🍽️ Dining out · 🍿 Entertainment · 🏝️ Vacation · ❗️ Stuff I forgot to plan for · 🌳 YNAB subscription

**Discrepancy:** the user's screenshots (Plan-Categories dropdowns) show a richer, customized set — groups **Recoverable (advances)** (Household advance, Roommate advance), **Bills**, **Needs** (with 🛢 Fuel, plus Charity & Zakat, Family support, Education, Cleaning & maintenance, Pet care seen in the table) — which does NOT exist in the live budget at capture time. The category-sync feature must reconcile against whichever set the user designates.

## Behavioral inventory (from live app + the 18 screenshots)

1. **Layout:** three zones — budget table (groups → categories, 4 columns), a right **inspector** sidebar, and a top bar (month stepper · Ready to Assign banner · Assign button · filter pills · view toggle).
2. **Manage Views modal:** filter views (Underfunded, Overfunded, Money Available, Snoozed) with drag-handle reordering + "New View" + Done.
3. **View toggle:** two-state segmented control switching category rows between progress-bar view and compact view.
4. **＋ Category Group** (toolbar): inline popover with a name input + Cancel/OK.
5. **Group hover ＋:** each group row shows a + on hover → popover to add a category inside that group.
6. **Ready to Assign banner:** amount + **Assign ▾** button. Assign popover has **Auto / Manually** tabs; Manually = amount (prefilled with full RTA) + "To:" category dropdown + Assign.
7. **RTA breakdown popover** (clicking the banner): itemized `+ Inflow: RTA transactions in <month>` − `Assigned in <month>` = `Total Ready to Assign`, with an info note.
8. **Inspector (right sidebar), dynamic by selection:**
   - No/one category: category name + pencil; **Available Balance** disclosure (Cash Left Over From Last Month / Assigned This Month / Cash Spending / Credit Spending); **Target** card (create target CTA); **Auto-Assign** card; **Notes**.
   - Multi-select: "N Categories Selected" + names; **Month's Summary** (Left Over / Assigned / Activity / Available); **Auto-Assign** actions (Underfunded, Assigned Last Month, Spent Last Month, Average Assigned, Average Spent, Reset Available Amounts) each with its computed amount.
9. **Recent Moves popover:** grouped by day, filter tabs All/Moved/Assigned; entries "«user» moved Rs X from 🛒 Groceries AUG to 🏠 Rent AUG" / "assigned Rs X to …" with avatar. (Raqam already has a Recent Moves panel + undo/redo — this is a restyle/extension, not new plumbing.)
10. **Activity cell = hyperlink:** click opens an **Activity popover** — a mini transactions table (Account / Date / Payee / Memo / Amount) for that category+month, with Close.
11. **Assigned cell editing:** click-to-edit; the field shows a small `+− ×÷` calculator affordance; typing `+n`, `−n`, `×n`, `÷n` applies the operation to the current value; a small history (clock) icon restores.
12. **Available pill behaviors:** overspent (red) → popover "Cover overspending from" + category dropdown + OK; positive (green) → popover "Move [amount] To [category dropdown]" + OK. Both dropdowns are the **Plan Categories picker**: "Inflow: Ready to Assign Rs X" first, then categories grouped by group with their current available amounts (red when negative).
13. **Category dropdown picker:** searchable input; groups as section headers; amounts right-aligned, colored by sign.

## Raqam mapping notes

- Raqam's current Budgets screen is a flat per-category monthly-amount list (`Budgets.jsx`); it has no groups-as-budget-rows, no assigned/available envelope math, no inspector. This reference implies a full envelope model (assigned per category per month, carryover, RTA) — a data-model change, not just UI.
- Raqam already has: Figtree, category groups **on categories** (`S.categories` have `group`? — verify), Recent Moves + undo/redo, popover/caret patterns (BulkBar MoreMenu), drawer system, `?` help modal, and the transactions modal building blocks (table row renderers).
