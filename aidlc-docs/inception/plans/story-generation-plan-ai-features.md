# Story Generation Plan — AI Features (Cycle 2)

Answers are PRE-FILLED with recommendations — edit any you disagree with, then
approve the plan.

## Execution Checklist (Part 2 runs this after plan approval)

- [x] Load approved requirements (requirements-ai-features.md) and this plan
- [x] Generate personas-ai-features.md (per Q1 decision)
- [x] Generate stories-ai-features.md, feature-based groups U0–U4 (per Q2/Q3)
- [x] Write acceptance criteria in Given/When/Then form for every story (per Q4)
- [x] Tag every story with a verification mode (per Q5)
- [x] Verify INVEST compliance (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- [x] Map personas to stories
- [x] Cross-reference each story to its FR ids for traceability

## Questions

## Question 1
Personas: cycle 1 produced personas for this app. How should cycle 2 handle personas?

A) Reuse the cycle-1 personas unchanged (same solo owner-user product; add a short "AI posture" note to each — cautious about auto-writes, cost-conscious operator of the Modal deployment)

B) Create new AI-specific personas from scratch

C) Skip personas entirely (single-user app)

D) Other (please describe after the answer tag below)

\[Answer]: A

## Question 2
Story breakdown approach:

A) Feature-based, grouped by unit (U0 Foundation, U1 Auto-categorization, U2 SMS, U3 Receipt, U4 Digest) — maps 1:1 onto the Construction per-unit loop

B) User-journey-based (entry → categorize → reflect journeys crossing units)

C) Epic-based hierarchy

D) Other (please describe after the answer tag below)

\[Answer]: A

## Question 3
Granularity: how many stories, at what size?

A) ~15–20 stories total: U0 gets 3–4 (toggle, warming state, degradation, auth failure); each feature gets 3–4 (happy path, review/edit path, failure path, and the feature-specific special: payee-rule graduation / last4 matching / no-line-items / numbers-match-client)

B) Fewer, larger stories (~8–10) — faster to write, coarser acceptance criteria

C) More, finer stories (25+) — maximum traceability, more overhead

D) Other (please describe after the answer tag below)

\[Answer]: A

## Question 4
Acceptance criteria format:

A) Given/When/Then per criterion (matches cycle 1; doubles as live-verification script steps)

B) Checklist bullets per story

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 5
Verification-mode tagging (how each story will be proven at Build & Test):

A) Tag every story one of: `unit` (pure client logic, vitest), `mock` (client behavior against a mocked AI endpoint, vitest/Playwright), `live` (needs the deployed Modal endpoint — smoke script or manual runsheet, like cycle 1's DB-proof stories)

B) No tagging; decide verification at Build & Test

C) Other (please describe after the answer tag below)

\[Answer]: A
