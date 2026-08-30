# Story Generation Plan — Command Palette (Cycle 3)

**Role**: Product Owner. This plan converts `requirements-command-palette.md` into INVEST user stories with acceptance criteria.

**How to answer**: Recommended answers are pre-filled after each `[Answer]:`. Skim, change what you disagree with (or use `X) Other`), then reply "done" / "approve" and I'll generate `stories-command-palette.md` + `personas-command-palette.md`.

---

## Planning Questions

### Question 1 — Story breakdown approach
How should stories be organized?

A) **Feature/capability-based** — one story per palette capability (open, search pages, search data, run actions, recents, keyboard nav, mobile, a11y). Cleanest map to units of work.

B) User-journey-based — stories follow end-to-end flows ("find and open a report", "add a transaction from anywhere").

C) Persona-based — grouped by user type.

D) Hybrid — feature-based core + a couple of journey stories for the headline flows.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 2 — Personas
Prior cycles used "The Existing Budgeter" and "The Fresh Starter".

A) **Reuse both existing personas, and add one lens — "The Keyboard-First Power User"** (drives everything from the keyboard; the palette's primary champion).

B) Reuse the two existing personas only; no new persona.

C) Fresh personas specific to this feature.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 3 — Story granularity
How fine-grained?

A) **Medium — one story per capability (~9–12 stories)**, each a thin vertical slice, testable on its own.

B) Coarse — a few large stories (~4–5).

C) Fine — many small stories (~15+).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 4 — Acceptance criteria format
A) **Given / When / Then** (matches prior cycles; maps directly to tests).

B) Bulleted checklist criteria.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 5 — Non-functional / quality stories
Should a11y, performance, and the property-tested match/rank function get their own explicit stories?

A) **Yes** — dedicated stories for Accessibility & keyboard-only operation, Performance/instant-feel, and the testable match/rank engine (so PBT/quality is a tracked deliverable, not implicit).

B) No — fold these into acceptance criteria of the functional stories only.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Proposed Story Set (preview — will be generated on approval)
Feature-based (Q1=A), medium granularity (Q3=A), GWT criteria (Q4=A):

1. **US-1 Open/close** — open via ⌘K/Ctrl+K + `/`, close via Esc, focus restore, guarded in inputs.
2. **US-2 Sidebar & mobile entry** — sidebar "Quick search… ⌘K" field (desktop) + mobile search icon → same palette (full-screen sheet on phone).
3. **US-3 Search pages** — fuzzy-find and navigate to any page/tab, with synonyms.
4. **US-4 Search my data** — find accounts, categories, payees, plans; selecting navigates to the right filtered view.
5. **US-5 Run actions** — "Add transaction", "New category", "Switch plan → {plan}", "Toggle theme", etc.; selecting performs the action (opens drawer / runs).
6. **US-6 Recents** — recent destinations/commands on empty open, per-device, storage-safe, stale entries filtered.
7. **US-7 Grouped results & keyboard nav** — results grouped by kind, ↑↓/↵/Esc, active item scroll-into-view, footer hint bar, empty & no-match states.
8. **US-8 Accessibility** — full keyboard operation, dialog ARIA/focus trap, active-option announcement, SR results count.
9. **US-9 Performance / instant feel** — memoized in-memory index, no per-keystroke rebuild, no lag on realistic dataset.
10. **US-10 Match/rank engine (quality)** — pure, deterministic match+rank function; example-based + property-based tests (fast-check); documented ranking order.

(Number/split may adjust slightly to honor INVEST.)

---

## Mandatory Artifacts (generated in Part 2)
- [ ] `personas-command-palette.md` — archetypes + persona→story map
- [ ] `stories-command-palette.md` — INVEST stories with Given/When/Then acceptance criteria
- [ ] Each story Independent, Negotiable, Valuable, Estimable, Small, Testable
- [ ] Acceptance criteria per story
- [ ] Persona → story mapping
