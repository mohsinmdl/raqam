# Personas — AI Features (Cycle 2)

Reused from cycle 1 (Multi-Plan) unchanged, with an added **AI posture** note per
the approved story plan (Q1=A). Full persona definitions live in `personas.md`.

## Persona 1: The Existing Budgeter
- **Who**: Raqam's current user — years of PKR history, reconciled accounts,
  budgets, recurring schedules; desktop register + phone shell daily.
- **AI posture**: Wants friction removed (entry, categorization) but is
  **deeply averse to AI writing anything on its own** — the ledger is trusted
  because every number was confirmed by a human. Will accept suggestions only
  if wrong ones are one-glance dismissible. Is ALSO the operator of the Modal
  deployment: cost-conscious ($30 credit), tolerant of a one-off cold-start
  wait if the UI says what's happening.
- **Success looks like**: Pastes a bank SMS and saves the prefilled transaction
  in seconds; uncategorized backlog melts via one-tap chips; the app behaves
  exactly as before whenever AI is off, unreachable, or wrong.

## Persona 2: The Fresh Starter
- **Who**: A brand-new/empty account.
- **AI posture**: Little transaction history means the categorizer has almost
  no context — they must never see confidently wrong suggestions fabricated
  from nothing. SMS paste and receipt scan are their fastest on-ramp to a
  populated ledger.
- **Success looks like**: Entry-side AI (SMS, receipt) works from day one;
  suggestion chips appear only once enough of their own history exists to
  ground them.

## Persona → Story Map

| Story | Existing Budgeter | Fresh Starter |
|---|---|---|
| US-1 AI opt-in toggle | ✅ | ✅ |
| US-2 Warming-up state | ✅ | ✅ |
| US-3 Silent degradation | ✅ | ✅ |
| US-4 Authenticated calls only | ✅ | ✅ |
| US-5 Suggestion chips | ✅ | ✅ (low-history guard) |
| US-6 One-tap accept | ✅ | — |
| US-7 Payee-rule graduation | ✅ | — |
| US-8 Suggestion integrity | ✅ | ✅ |
| US-9 SMS paste → prefill | ✅ | ✅ |
| US-10 last4 matching | ✅ | ✅ |
| US-11 SMS LLM fallback | ✅ | ✅ |
| US-12 SMS failure path | ✅ | ✅ |
| US-13 Receipt → prefill | ✅ | ✅ |
| US-14 Receipt category suggestion | ✅ | — |
| US-15 Receipt failure/privacy | ✅ | ✅ |
| US-16 Generate insights | ✅ | — |
| US-17 Digest ephemerality | ✅ | — |
| US-18 Digest unavailable | ✅ | — |
