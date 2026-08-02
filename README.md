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
- **Privacy** — amounts masked by default; only last-4 digits ever stored; all data
  stays in the browser (`localStorage` key `raqam.v1`).
- Light/dark theme, month navigation over your data's real months, demo dataset
  (re-dated to the current month) behind a confirm.

## Run

```sh
npm install
npm run dev       # dev server
npm run build     # production build (dist/, relative paths — any static host)
npm run preview
```

No backend, no environment variables. Plain JS + JSX; state is React context +
reducer; routing is react-router (hash mode).

## Structure

```
src/lib/        calc.js (pure PKR math, ported verbatim from the design), dates.js
                (real-date layer), txRow.js (row presenters), format.js (masking)
src/store/      seed.js (demo/fresh stores), persistence.js (raqam.v1 + migrations),
                StoreProvider.jsx, actions.js (pure mutations), MonthContext.jsx
src/ui/         Drawer/Confirm/Explain/Toast/FocusTrap chrome
src/drawers/    the six drawer forms + shared fields
src/screens/    Dashboard, FirstUse, Transactions, Accounts, AccountDetail, Cards, Planned
```

Design docs live in the Claude Design project (`docs/DESIGN_SYSTEM.md`,
`docs/UX_UI_BLUEPRINT.md`).
