# Story Generation Plan — Multi-Plan System

> **Note**: Questions below are pre-filled with Claude's recommended answers (per your convention). Edit any `[Answer]:` you disagree with, then approve the plan.

## Methodology

Convert the approved requirements (`aidlc-docs/inception/requirements/requirements.md`) into INVEST-compliant user stories with acceptance criteria, plus personas. Story organization and format are governed by the answers below.

## Story Breakdown Approach Options (for Question 2)

- **User Journey-Based**: stories follow workflows (first launch after update → create plan → switch → …). Good narrative flow; weaker traceability to FRs.
- **Feature-Based**: stories grouped by feature area mirroring FR-1…FR-7. Direct traceability to requirements and to Construction units; slight risk of losing cross-feature journeys (mitigated by journey-level ACs in shell stories).
- **Persona-Based**: grouped by persona; overkill with only two personas whose needs mostly overlap.
- **Epic-Based**: hierarchical epics; useful for large teams/backlogs, ceremony we don't need.

## Clarifying Questions

## Question 1
Which personas should anchor the stories?

A) One persona — "the solo budgeter" (covers everything)

B) Two personas — **Existing budgeter** (has years of PKR data; hits the migration path, expects zero visual change) and **Fresh starter** (new signup; hits first-use plan creation) 

C) Three+ personas (add e.g. phone-first user as a separate persona)

D) Other (please describe after `[Answer]:` tag below)

`[Answer]: B`

## Question 2
How should stories be organized?

A) Feature-based, mirroring FR-1…FR-7 (migration, New Plan modal, switcher, Open Plan, scoping, formatting, management) — best traceability into Construction units

B) User journey-based (first launch, creating, switching, managing)

C) Epic-based hierarchy

D) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 3
What story granularity?

A) ~12–18 small stories, each independently testable, mapped 1:1-ish to FR sub-items

B) ~6–8 coarse stories, one per feature area

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 4
Acceptance criteria format?

A) Given/When/Then (Gherkin-style) — translates directly into vitest cases and Playwright steps

B) Bullet-point checklists per story

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Question 5
Story prioritization scheme?

A) Dependency-ordered single release (schema/migration → scoping → formatting → shell UI → management) — everything is v1 must-have, order reflects build sequence

B) MoSCoW (Must/Should/Could/Won't) with some stories deferred

C) Other (please describe after `[Answer]:` tag below)

`[Answer]: A`

## Execution Checklist (Part 2 — Generation)

- [x] Generate `aidlc-docs/inception/user-stories/personas.md` with user archetypes and characteristics per Question 1 answer
- [x] Generate `aidlc-docs/inception/user-stories/stories.md` with user stories following INVEST criteria, organized per Question 2 answer at granularity per Question 3
- [x] Include acceptance criteria for each story in the format per Question 4
- [x] Order stories per Question 5 prioritization
- [x] Map personas to relevant user stories
- [x] Add FR/NFR traceability reference to each story
- [x] Verify stories are Independent, Negotiable, Valuable, Estimable, Small, Testable
