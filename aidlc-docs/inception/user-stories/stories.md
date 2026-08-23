# User Stories — Multi-Plan System

Feature-based organization mirroring FR-1…FR-7; dependency-ordered (build sequence). All stories are v1 must-have. Acceptance criteria are Given/When/Then. Traceability tags reference `requirements.md`.

---

## Area 1: Plans Entity & Migration

### US-1: My existing data lands in "My Plan"
**As** the Existing Budgeter, **I want** all my current data automatically placed in a plan named "My Plan" **so that** nothing changes about my ledger when multi-Plan ships.
*Traces: FR-1.1, FR-1.2, FR-6.4, NFR-3.1*

- **Given** an account with pre-migration data, **when** the migration runs, **then** a plan "My Plan" exists and every account, transaction, category, budget, assignment, snapshot, recurring schedule, payee, and audit row carries its `plan_id`.
- **Given** the migrated plan, **when** I open the app, **then** balances, RTA, budgets, and reports are byte-identical to pre-migration values, and rendering is unchanged (PKR defaults: Don't show, `123,456.78`, dd/mm/yyyy).
- **Given** the migration has run once, **when** it is evaluated again, **then** it is a no-op (no duplicate plans, no reassigned rows).

### US-2: My plans can never reference another user's plan
**As** any user, **I want** plan scoping enforced at the database level **so that** a buggy or malicious client cannot attach my rows to someone else's plan or read across plans.
*Traces: FR-1.3, NFR-1.1 (SECURITY-08)*

- **Given** a row insert with a `plan_id` belonging to a different user, **when** it reaches Postgres, **then** the composite FK `(user_id, plan_id)` rejects it.
- **Given** RLS policies, **when** any table is queried, **then** only `auth.uid()`-owned rows are visible, exactly as today.

### US-3: A fresh account gets its first plan
**As** the Fresh Starter, **I want** the first-use flow to create my first plan **so that** I'm never in a plan-less state.
*Traces: FR-1.4, FR-2*

- **Given** a signed-in user with zero plans, **when** the app loads, **then** the first-use flow presents plan creation (name + currency + formats + default-categories checkbox) before anything else.
- **Given** the created first plan, **when** the flow completes, **then** the app opens into it with seeded categories if the checkbox was checked.

---

## Area 2: New Plan Modal

### US-4: I can create a new plan
**As** either persona, **I want** a New Plan modal with name, currency, currency placement, number format, and date format **so that** each plan matches its purpose.
*Traces: FR-2.1, FR-2.2, FR-2.4, FR-2.5, NFR-1.3*

- **Given** the modal open, **when** I submit an empty/whitespace name, **then** creation is blocked with inline validation.
- **Given** valid inputs, **when** I press Create Plan, **then** the button shows "Creating plan…", the plan is persisted with the chosen settings, and the app switches into the new (empty or seeded) plan.
- **Given** defaults untouched, **when** the modal opens, **then** it shows PKR / Don't show / `123,456.78` / `30/12/2026`.
- **Given** any settings value outside the known option sets, **when** it reaches the write path, **then** it is rejected (constraint/validation).

### US-5: I can pick from full YNAB-parity option sets
**As** either persona, **I want** the complete currency and format option lists **so that** any locale works.
*Traces: FR-2.1, FR-6.3*

- **Given** the currency select, **when** I type to search, **then** the full ISO currency list filters (e.g. "PKR", "rupee").
- **Given** the number-format select, **when** opened, **then** all 8 formats appear (incl. lakh-style `1,23,456.78`); the date-format select shows all 7; placement shows Before/After/Don't show with live example previews.

### US-6: I choose whether a new plan starts with default categories
**As** either persona, **I want** a "Start with default categories" checkbox (default on) **so that** I can start structured or blank.
*Traces: FR-2.3*

- **Given** the checkbox checked, **when** the plan is created, **then** it contains Raqam's default category groups/catalogues and zero accounts.
- **Given** the checkbox unchecked, **when** the plan is created, **then** it has no categories and no accounts.

---

## Area 3: Plan Switcher & Open Plan

### US-7: I always see which plan I'm in
**As** either persona, **I want** the current plan name + my email at the top of the sidebar **so that** context is never ambiguous.
*Traces: FR-3.1*

- **Given** the desktop app, **when** any screen renders, **then** the sidebar top shows the open plan's name and my account email with a dropdown affordance.

### US-8: I can switch to another plan
**As** the Existing Budgeter, **I want** to open the switcher and pick another plan **so that** I can move between ledgers.
*Traces: FR-3.1, FR-4.1, FR-5.4, NFR-2.2*

- **Given** the switcher dropdown, **when** opened, **then** it lists all my plans ordered by name with the open one marked, plus New Plan and management entries.
- **Given** I pick another plan, **when** the switch runs, **then** pending syncs flush first, a loading state shows, and the app re-renders entirely in the target plan's data and formats.
- **Given** a switch, **when** it completes, **then** the undo stack is empty (no cross-plan undo).

### US-9: The app remembers my open plan
**As** either persona, **I want** my last-opened plan restored per device **so that** launches feel continuous.
*Traces: FR-3.2*

- **Given** plan B open on this device, **when** I reload, **then** plan B opens.
- **Given** the remembered plan was deleted, **when** I reload, **then** the first available plan opens (no error state).

### US-10: I can switch plans on my phone
**As** either persona, **I want** an equivalent switcher entry in the phone shell **so that** mobile has parity.
*Traces: FR-3.3*

- **Given** the phone shell, **when** I use its switcher entry point, **then** I can see the plan list, switch, and reach New Plan with the same behavior as desktop.

---

## Area 4: Per-Plan Data Scoping

### US-11: Plans are fully isolated
**As** the Existing Budgeter, **I want** each plan to show only its own data **so that** ledgers never bleed together.
*Traces: FR-5.1, FR-5.3, NFR-2.1, NFR-3.3*

- **Given** plan A with data and plan B empty, **when** I switch to B, **then** register, Plan screen, RTA, reports, payees, and recurring lists are all empty; switching back restores A exactly.
- **Given** the open plan, **when** data loads, **then** only that plan's rows are fetched (verified via network filters), keeping load comparable to today.

### US-12: Everything I create belongs to the open plan
**As** either persona, **I want** every new record stamped with the open plan **so that** writes, undo, and audit stay scoped.
*Traces: FR-5.2, FR-5.3, FR-5.5, NFR-1.4*

- **Given** plan B open, **when** I add a transaction/account/category, **then** its row persists with plan B's `plan_id` (including through the offline/optimistic queue and retries).
- **Given** actions in plan B, **when** I view undo history or the audit trail, **then** only plan B entries appear.
- **Given** any open plan, **when** the app loads, **then** the plans list itself is always fetched (drives the switcher).

---

## Area 5: Per-Plan Formatting

### US-13: Amounts render in my plan's format
**As** either persona, **I want** all amounts to follow the plan's currency, placement, and number format **so that** each plan reads natively.
*Traces: FR-6.1, FR-6.2, NFR-4.2, NFR-4.3*

- **Given** a plan set to USD / Before / `123,456.78`, **when** any amount renders (register, Plan, RTA, reports, keypad, exports), **then** it shows like `$1,234.56`; with Don't show, no symbol appears.
- **Given** a plan with lakh format, **when** 1234567.89 renders, **then** it shows `12,34,567.89`.
- **Given** any format combo, **when** an amount is formatted then parsed, **then** the value round-trips exactly (PBT).

### US-14: Dates render in my plan's format
**As** either persona, **I want** all dates to follow the plan's date format **so that** the whole app is consistent.
*Traces: FR-6.1, FR-6.2, Q10=A*

- **Given** a plan set to `2026-12-30` style, **when** the register, date pickers, reports, and month headers render, **then** all user-facing dates use that format.
- **Given** the migrated "My Plan", **when** dates render, **then** they look exactly as before the update.

### US-15: Amount entry understands my plan's separators
**As** either persona, **I want** amount inputs to accept the plan's decimal separator **so that** typing feels native.
*Traces: FR-6.3*

- **Given** a plan using comma-decimal (`123.456,78`), **when** I type `12,5` in an amount field, **then** it parses as 12.50; the keypad decimal key inserts the plan's separator.

---

## Area 6: Plan Management

### US-16: I can rename a plan
**As** either persona, **I want** to rename a plan **so that** names stay meaningful.
*Traces: FR-7.1, NFR-1.3*

- **Given** the management UI, **when** I rename the open plan, **then** the sidebar and switcher update immediately and the change syncs.
- **Given** an empty/whitespace rename, **when** submitted, **then** it is rejected inline.

### US-17: I can delete a plan — carefully
**As** the Existing Budgeter, **I want** deletion to require typing the plan's name and to be blocked for my last plan **so that** I can't destroy data by accident.
*Traces: FR-7.2, FR-7.3, NFR-1.5*

- **Given** the delete dialog, **when** the typed name doesn't exactly match, **then** the delete button stays disabled.
- **Given** a confirmed delete of the open plan, **when** it executes, **then** the app switches to another plan first, then the plan and all its rows are removed server-side.
- **Given** only one plan remains, **when** I look for delete, **then** it is unavailable/blocked with an explanation.
- **Given** a delete that fails mid-way (network), **when** I reload, **then** data is intact or fully gone — never half-deleted client state presented as success.

---

## INVEST check
Each story is independently testable against a running app + DB (Independent/Testable), scoped to one behavior (Small), phrased as user value (Valuable), open to design negotiation in Construction (Negotiable), and sized for single-unit implementation (Estimable).
