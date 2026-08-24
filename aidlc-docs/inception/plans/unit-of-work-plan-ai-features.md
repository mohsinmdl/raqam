# Unit of Work Plan — AI Features (Cycle 2)

Answers PRE-FILLED with recommendations — edit any you disagree with, then
approve.

## Execution Checklist (Part 2)

- [x] Generate unit-of-work-ai-features.md (unit definitions, responsibilities, code organization per unit)
- [x] Generate unit-of-work-dependency-ai-features.md (dependency matrix + merge order)
- [x] Generate unit-of-work-story-map-ai-features.md (all 18 stories assigned; no orphans)
- [x] Validate unit boundaries against the application-design components (C1–C7 each owned by exactly one unit)
- [x] Validate every story is assigned to exactly one unit

## Decomposition inputs already approved (not re-asked)
- Grouping: feature-based U0–U4 (story plan Q2=A) — U0 ai-foundation, U1
  auto-categorize, U2 sms-parse, U3 receipt-scan, U4 insights-digest
- Sequence/dependencies: U0 first, then U1→U2→U3→U4 (execution plan)
- Code location: in-repo `modal/` + client modules (design plan Q1=A)
- Team alignment / business-domain boundaries: N/A (solo user, single domain)

## Questions

## Question 1
Merge strategy: how do the five units reach main?

A) One PR per unit (5 small PRs, merged in dependency order; the default-OFF toggle keeps prod inert until the final enablement) — smaller reviews, earlier integration, matches "each unit shippable"

B) One cycle PR like Multi-Plan #208 (all units land together at Build & Test)

C) Other (please describe after the answer tag below)

\[Answer]: A

## Question 2
U1 scope: what does the categorizer use in v1?

A) Embeddings-only kNN over the user's own history — an unseen merchant simply gets no chip (never a fabricated guess); the LLM-fallback path stays in the route contract but is NOT implemented in U1 v1. Cheaper (CPU-only route), faster, safest for trust

B) Include the LLM fallback for unseen merchants in U1 v1 (more coverage, more cost, more wrong-but-confident risk)

C) Other (please describe after the answer tag below)

\[Answer]: A
