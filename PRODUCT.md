# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individual people tracking their own money manually across multiple bank accounts,
cards, and cash — the general public worldwide, one person per account, not shared
household ledgers. Pakistan is the origin and first market (and the reason the local
model is unusually well-developed), but the product is not limited to Pakistani users.
Each user's data is fully isolated; the product is headed to real, self-serve signups
rather than a single private user.

## Product Purpose

Give a person one clear, trustworthy picture of their money across every Pakistani
account they hold — balances, transactions, budgets, cards, recurring commitments,
and reporting — from figures **they** enter, on their terms. The app never connects
to a bank and never holds or moves real money; the user is the source of truth.
Success is a stranger being able to sign up, trust the numbers, and rely on Raqam to
know where their money stands.

## Positioning

A manual-entry, privacy-first personal-finance app that started Pakistan-native and is
opening up worldwide — not a localized clone of a Western tool. The mechanism a
neighbor could not truthfully copy:

- **Manual by design, not by limitation** — no bank integrations, on purpose. This is
  a trust and privacy stance, not a missing feature to be "fixed" later.
- **Strong local model, globally usable** — a depth of Pakistan-specific support
  (institution catalogue, Islamic/conventional classification, PKR/Asia-Karachi
  defaults) that generic trackers lack, offered to a worldwide audience as currency
  and locale options expand; only the last 4 digits of any account/card are ever
  stored.
- **Envelope/zero-based budgeting** adapted to this manual, multi-account context.

## Operating Context

- **Manual-entry ritual.** The user records expense / income / transfer / refund /
  adjustment transactions themselves, with per-type forms and a non-blocking duplicate
  warning. Transfer fees are recorded as separate expenses; paying a credit-card bill
  is modeled as a transfer, never a second expense.
- **Monthly opening snapshots.** Each account's starting balance is confirmed per
  month; confirmed snapshots are immutable and corrections are versioned. A new month
  carries forward the previous month's computed closing balance as a pending snapshot.
- **Month navigation** moves over the real months present in the user's own data.
- **Amounts are masked by default;** the user unmasks deliberately.
- **Optimistic UI** backed by a self-healing, write-behind sync queue, with an
  unsaved-changes guard.

## Capabilities and Constraints

Confirmed functionality (as implemented):

- Dashboard (total balance, monthly opening, change-since-start, credit-card
  liability, net worth; income/expense/net/savings; daily-spending and category
  charts; month-to-month comparison; budgets; upcoming recurring; largest expenses;
  recent transactions).
- Transactions (five types with per-type forms, inline new categories, pending status,
  duplicate warning).
- Accounts (Pakistani institution catalogue + custom, Islamic/conventional flag,
  last-4 privacy, archive/restore/close, per-account activity and opening-balance
  trend, balance adjustments).
- Cards (wallet of card-face tiles; credit cards track outstanding / available credit /
  utilisation / statement + due dates; debit cards link to accounts).
- Envelope budgeting (Plan, Budget Hub, Budgets, category targets; drag-and-drop plan
  reorder; recent-moves history).
- Recurring / planned commitments.
- Reflect reporting (multi-tab reports; CSV export).
- Undo/redo, keyboard shortcuts, light/dark theme, one-time import of pre-account
  localStorage data (original kept as a local backup).
- Accounts & sync: email+password or Google auth; per-user data in Supabase Postgres
  behind Row-Level Security (`user_id = auth.uid()` on every policy).

Durable constraints future work must preserve:

- No bank integrations; the app must never hold or move real money.
- Only the last 4 digits of any account/card are ever stored.
- Every user's rows stay isolated by RLS.
- **Currency:** PKR is the current default and Asia/Karachi the default locale;
  user-selectable currency options are a planned expansion, so future work should not
  hard-code PKR/Karachi assumptions it would have to unwind.
- UI language is **English-only** (see Brand Commitments); this is the intended durable
  state, not a gap awaiting localization.

## Brand Commitments

- **Name:** Raqam (رقم — Arabic/Urdu for "number"), shown with its Arabic-script
  wordmark alongside the Latin name.
- **Origin:** ported from the "Hisaab" Claude Design prototype (design project
  `e58e55d7…`, `Hisaab.dc.html`), renamed to Raqam and rebuilt on React + Vite with
  real dates and persistence.
- **Language:** English UI is a committed, durable decision — Urdu / RTL is explicitly
  not a planned requirement. The Arabic-script wordmark is identity, not localization.

## Evidence on Hand

- Design system and blueprint documentation live in the originating Claude Design
  project (`docs/DESIGN_SYSTEM.md`, `docs/UX_UI_BLUEPRINT.md` referenced by the
  README; not vendored into this repo).
- Feature plans and design specs under `docs/superpowers/plans/` and
  `docs/superpowers/specs/` record the product's evolution (undo/redo, sidebar budget
  hub, envelope budgeting phases 1–4, category targets, keyboard shortcuts,
  drag-and-drop, close-account, Reflect reporting).
- No real user testimonials, customer counts, benchmarks, pricing, or press exist yet;
  future work must not fabricate any of these.

## Product Principles

1. **The user is the source of truth.** Money is entered by hand, never synced from a
   bank; the app's job is to reflect and reconcile what the user tells it — never to
   fetch, hold, or move real funds.
2. **Privacy is a feature, not a setting.** Mask amounts by default, store only last-4
   digits, and isolate every user's data. Never regress this to add convenience.
3. **Local depth, global reach.** Pakistan-specific support (local institutions,
   Islamic/conventional distinctions, PKR/Asia-Karachi defaults) is first-class rather
   than an afterthought — and the same care extends outward as currency and locale
   options open the product to a worldwide audience.
4. **The math must be trustworthy.** Immutable confirmed snapshots, versioned
   corrections, carry-forward balances, and pure calculation — correctness over
   cleverness, because users are staking real financial decisions on the numbers.
5. **Ready for strangers.** As a product headed to public signup, favor clear
   onboarding, honest empty/error states, and edge-case handling over shortcuts that
   only a builder who knows the internals could tolerate.

## Accessibility & Inclusion

No formal external standard has been committed. Ongoing product-level attention exists
to keyboard operability (full keyboard shortcuts, row navigation) and to light/dark
theming; future work should preserve and extend keyboard access rather than treat it
as optional.
