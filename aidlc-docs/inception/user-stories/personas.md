# Personas — Multi-Plan System

## Persona 1: The Existing Budgeter
- **Who**: Raqam's current user — has years of PKR transaction history, reconciled bank accounts, monthly budgets, recurring schedules, and reports they rely on. Uses desktop for the register/Plan screen and the phone shell day-to-day.
- **Goals**: Gain the ability to run separate plans (e.g. a personal plan and a family/side-project plan) without disturbing the existing ledger in any way.
- **Fears / constraints**: Migration silently changing balances, budgets, or how anything renders. Any surprise on first launch after the update.
- **Success looks like**: Opens the app after the update and sees exactly what they saw yesterday — same numbers, same formatting — with a new "My Plan" label at the top of the sidebar; can create a second plan in under a minute.
- **Primary stories**: US-1, US-2, US-4–US-17 (everything post-migration).

## Persona 2: The Fresh Starter
- **Who**: A brand-new signup (when signups are enabled) or a wiped/dev account. No data at all.
- **Goals**: Get from empty account to a usable budget quickly, in their own currency and formats.
- **Fears / constraints**: Being dumped into an empty, confusing state; formats that don't match their locale.
- **Success looks like**: First-use flow creates their first plan (name + currency + formats), optionally pre-seeded with default categories, and lands them on a working Plan screen.
- **Primary stories**: US-3, US-4, US-5, US-6, US-13, US-14.

## Persona → Story Map

| Story | Existing Budgeter | Fresh Starter |
|---|---|---|
| US-1 Migration into "My Plan" | ✅ | — |
| US-2 Plan ownership integrity | ✅ | ✅ |
| US-3 First-use plan creation | — | ✅ |
| US-4 Create plan via modal | ✅ | ✅ |
| US-5 Full format option sets | ✅ | ✅ |
| US-6 Default-categories checkbox | ✅ | ✅ |
| US-7 Sidebar plan identity | ✅ | ✅ |
| US-8 Switch plans | ✅ | — |
| US-9 Remembered open plan | ✅ | ✅ |
| US-10 Phone switcher entry | ✅ | ✅ |
| US-11 Data isolation | ✅ | — |
| US-12 Plan-stamped writes & undo/audit scoping | ✅ | ✅ |
| US-13 Per-plan amount rendering | ✅ | ✅ |
| US-14 Per-plan date rendering | ✅ | ✅ |
| US-15 Format-aware amount input | ✅ | ✅ |
| US-16 Rename plan | ✅ | ✅ |
| US-17 Delete plan (guarded) | ✅ | — |
