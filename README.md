# Raqam — رقم

Manual-entry personal-finance web app for Pakistan (PKR, Asia/Karachi). One clear
picture of your money across every Pakistani bank account — entered by you, on your
terms. No bank integrations; the app never holds or moves real money.

Implemented from the **Hisaab** Claude Design prototype (design project
`e58e55d7…`, `Hisaab.dc.html`), renamed to Raqam, ported off the design runtime to
React + Vite with real dates and localStorage persistence.

## Features

- **Dashboard** — total bank balance, monthly opening, change-since-start, credit-card
  liability, net worth; income/expense/net/savings summary; daily-spending and
  category charts; month-to-month comparison; budgets; upcoming recurring reminders;
  largest expenses; recent transactions.
- **Monthly opening snapshots** — confirm each account's starting balance; confirmed
  snapshots are immutable (corrections are versioned). New months carry forward the
  previous month's computed closing balance as a pending snapshot.
- **Transactions** — expense / income / transfer / refund / adjustment with per-type
  forms, inline new categories, pending status, duplicate warning (warns, never
  blocks), transfer fees recorded as separate expenses.
- **Accounts** — Pakistani institution catalogue (+ custom), Islamic/conventional
  classification, last-4-only privacy, archive/restore, per-account activity and
  opening-balance trend, balance adjustments.
- **Cards** — wallet with card-face tiles; credit cards track outstanding, available
  credit, utilisation, statement/due dates; paying a bill is a transfer, never a
  second expense. Debit cards link to accounts.
- **Accounts & sync** — registration/login (email+password or Google), per-user data
  in Supabase Postgres behind Row Level Security; optimistic UI with a self-healing
  write-behind sync queue and an unsaved-changes guard.
- **Privacy** — amounts masked by default; only last-4 digits ever stored; each
  user's rows are isolated by RLS (`user_id = auth.uid()` on every policy).
- Light/dark theme, month navigation over your data's real months, one-time import
  of pre-account localStorage data (original kept as a local backup).

## Setup

1. Create a Supabase project, then copy `.env.example` to `.env.local` and fill in
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
2. Apply the schema: `npx supabase login`, `npx supabase link --project-ref <ref>`,
   `npx supabase db push` (runs `supabase/migrations/*.sql`: tables, RLS policies,
   global catalogue seed).
3. Auth settings: enable Email (keep "Confirm email" ON) and optionally Google
   (OAuth client in Google Cloud Console → provider config in Supabase; allowlist
   your dev/prod URLs under Authentication → URL Configuration).

## Run

```sh
npm install
npm run dev       # dev server
npm run build     # production build (dist/, relative paths — any static host)
npm run preview
```

Plain JS + JSX; state is React context + reducer; routing is react-router (hash
mode — OAuth uses PKCE so the `?code=` redirect coexists with `#/` routes).

## Structure

```
src/lib/        calc.js (pure PKR math), dates.js (real-date layer), txRow.js,
                format.js (masking), supabase.js (client init)
src/store/      seed.js (catalogues + fresh store), sync.js (diff-based sync queue),
                StoreProvider.jsx (hydrate + mirror), actions.js (pure mutations),
                PrefsProvider.jsx, MonthContext.jsx, persistence.js (legacy import)
src/auth/       AuthProvider (session), AuthScreen (login/register gate)
src/ui/         Drawer/Confirm/Explain/Toast/FocusTrap chrome
src/drawers/    the six drawer forms + shared fields
src/screens/    Dashboard, FirstUse, Transactions, Accounts, AccountDetail, Cards, Planned
supabase/       SQL migrations (schema, RLS, catalogue seed)
```

Design docs live in the Claude Design project (`docs/DESIGN_SYSTEM.md`,
`docs/UX_UI_BLUEPRINT.md`).
