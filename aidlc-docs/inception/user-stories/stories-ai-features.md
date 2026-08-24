# User Stories — AI Features (Cycle 2)

Feature-based groups mapping to units U0–U4 (plan Q2=A). Acceptance criteria are
Given/When/Then (Q4=A). Every story carries a **Verify** tag (Q5=A):
`unit` = pure client logic (vitest) · `mock` = client behavior against a mocked
AI endpoint · `live` = needs the deployed Modal endpoint (smoke script/runsheet).
FR references trace to `requirements-ai-features.md`.

---

## U0 — Shared AI Foundation

### US-1 — AI opt-in toggle
As the app's user, I can turn AI features on or off for my account, and they are OFF until I choose otherwise, so nothing about my app changes until I opt in.
- **Given** a user who has never touched AI settings, **When** they use any screen, **Then** no AI affordance (chip, button, sheet entry) is rendered anywhere.
- **Given** the user menu, **When** AI features are toggled on and `VITE_AI_ENDPOINT` is configured, **Then** AI affordances appear without a reload.
- **Given** the toggle ON but no endpoint configured in the build, **Then** AI affordances stay hidden (toggle shows an "unavailable" note).
- **Given** the toggle state, **Then** it persists per-user across sessions (prefs fall-through) and never syncs into ledger data.
- **Verify**: mock · **FR**: FR-0.6

### US-2 — Warming-up state
As the user, when the AI service is cold-starting I see that it is warming up, so a slow first response reads as expected behavior, not breakage.
- **Given** a first AI call after idle, **When** the response takes longer than 3s, **Then** the calling surface shows a distinct "warming up" state (not an error, not a generic spinner) until response or timeout.
- **Given** the warming state, **When** the call succeeds, **Then** the result replaces the state seamlessly; **When** it times out, **Then** the degradation path (US-3) takes over.
- **Verify**: mock · **FR**: FR-0.8, NFR-4

### US-3 — Silent degradation
As the user, AI being down, slow, or wrong never blocks or breaks what I could already do by hand.
- **Given** any AI request failing (network/5xx/timeout), **When** it occurs inside an entry flow (SMS, receipt, categorize), **Then** the manual flow remains fully usable and no modal/blocking error appears.
- **Given** a failed suggestion fetch, **Then** the needs-category pill behaves exactly as today (pre-AI behavior).
- **Given** AI toggled off mid-session, **Then** in-flight results are discarded and no AI UI remains.
- **Verify**: mock · **FR**: FR-0.7, NFR-5

### US-4 — Authenticated calls only
As the operator, only logged-in Raqam users can spend my Modal credit, so the endpoint is useless to anyone else.
- **Given** a request without a valid Supabase JWT, **When** it hits any AI route except `/health`, **Then** the service responds 401 and performs no model work.
- **Given** an expired token on a client call, **When** the service returns 401, **Then** the client refreshes the session once and retries; a second 401 degrades per US-3.
- **Given** a valid token, **Then** the request is served and no request content is persisted server-side.
- **Verify**: live (service behavior) + unit (client attach/retry) · **FR**: FR-0.2, FR-0.5, NFR-1, NFR-2

---

## U1 — Auto-categorization

### US-5 — Suggestion chips on uncategorized transactions
As the user, uncategorized transactions show me up to two suggested categories drawn from my own history, so categorizing the backlog is one glance instead of a picker safari.
- **Given** AI on and ≥30 categorized transactions in the active plan, **When** transactions flagged needs-category are visible, **Then** each shows up to 2 suggestion chips (category name) alongside the existing pill, on desktop register, phone list, and dashboard recents.
- **Given** fewer than 30 categorized transactions (Fresh Starter), **Then** no chips render — the plain pill remains.
- **Given** a suggestion below the confidence floor, **Then** no chip renders for that transaction.
- **Verify**: mock (chips) + unit (context assembly, thresholds) · **FR**: FR-1.1, FR-1.2, FR-1.3

### US-6 — One-tap accept
As the user, tapping a suggestion applies that category exactly as if I picked it myself.
- **Given** a suggestion chip, **When** tapped, **Then** the category is applied via the existing categorize action, the row leaves the needs-category set, and an ordinary audit row is written.
- **Given** an applied suggestion, **When** I undo, **Then** the transaction returns to uncategorized (standard undo semantics).
- **Given** a chip for a category that was deleted/archived since the suggestion, **When** tapped, **Then** nothing is written and the chip disappears.
- **Verify**: mock + unit · **FR**: FR-1.3, FR-1.4

### US-7 — Payee-rule graduation
As the user, once I've accepted the same suggestion for a payee three times, the app offers to make it a standing rule, so the AI teaches the deterministic system and gets out of the way.
- **Given** 3 accepted suggestions mapping the same payee key to the same category, **When** the third accept lands, **Then** a non-blocking prompt offers "Always categorize <payee> as <category>?".
- **Given** acceptance of the offer, **Then** a payee auto-categorize rule is created via the existing payee machinery, and that payee's future transactions stop being sent for suggestions.
- **Given** decline, **Then** the offer is not repeated for that payee/category pair.
- **Verify**: unit (counter/threshold logic) + mock (prompt flow) · **FR**: FR-1.5

### US-8 — Suggestion integrity
As the user, suggestions are ephemeral hints, never data.
- **Given** any server response, **When** it references a category id not in my active plan's list, **Then** it is dropped client-side (defense-in-depth on top of FR-1.2).
- **Given** suggestions on screen, **When** I reload, **Then** nothing about them was persisted or synced — they recompute on demand.
- **Verify**: unit · **FR**: FR-1.2, FR-1.6

---

## U2 — Bank SMS → Transaction

### US-9 — Paste a bank SMS, get a prefilled transaction
As the user, I paste a bank debit/credit SMS and the add-transaction editor opens prefilled, so recording a real-world transaction takes seconds.
- **Given** the paste entry point (phone sheet + desktop), **When** I paste a known-format SMS (HBL/Meezan/UBL/Alfalah/easypaisa/JazzCash patterns), **Then** the existing editor opens instantly (no network call) with amount, type (expense for debit / income for credit), date, merchant text, and matched account prefilled.
- **Given** the prefilled editor, **Then** nothing is saved until I press save — identical semantics to manual entry.
- **Verify**: unit (parsers — with fast-check PBT) + mock (flow) · **FR**: FR-2.1, FR-2.2, FR-2.4

### US-10 — Account matching by last4
As the user, the parsed SMS lands on the right account or card automatically when the message names its last digits.
- **Given** an SMS containing "A/C **1234" (or card equivalent), **When** exactly one of my accounts/cards has last4 = 1234, **Then** payWith/account is prefilled with it.
- **Given** zero or multiple matches, **Then** the field is left empty for me to pick — never a guess.
- **Verify**: unit · **FR**: FR-2.3

### US-11 — Unknown format falls back to the LLM
As the user, an SMS from an unrecognized bank still parses — it just takes a moment.
- **Given** a message no client pattern matches, **When** AI is on, **Then** it is sent to `/parse-sms`, and a returned parse prefills the editor exactly as US-9 (fields the model could not extract stay empty).
- **Given** AI off or unreachable, **Then** the LLM tier is skipped entirely (US-12 applies).
- **Verify**: mock (contract) + live (real model quality spot-check) · **FR**: FR-2.2

### US-12 — Parse failure never eats my SMS
As the user, when parsing fails outright I still get an editor with my pasted text preserved.
- **Given** both tiers failing (or the LLM tier skipped), **Then** the empty editor opens with the pasted SMS in notes, so I can enter amounts by hand without re-finding the message.
- **Verify**: mock · **FR**: FR-2.5

---

## U3 — Receipt Photo → Transaction

### US-13 — Snap a receipt, get a prefilled transaction
As the user, I photograph a receipt and the editor opens with merchant, date, and total filled in.
- **Given** the scan entry point (camera on phone, file picker on desktop), **When** the VLM parses the image, **Then** the editor opens prefilled (merchant, date, total as amount) — single transaction, no line items (v1).
- **Given** a parse result with missing fields, **Then** present fields are filled and missing ones left empty — never invented.
- **Verify**: live (VLM) + mock (flow) · **FR**: FR-3.1, FR-3.2, FR-3.3

### US-14 — Receipt gets a category suggestion
As the user, a scanned receipt also suggests a category the same way US-5 does.
- **Given** a successful receipt parse and suggestion context available, **Then** the editor's category field shows the suggestion as a prefill I can change — same integrity rules as US-8.
- **Verify**: mock · **FR**: FR-3.2

### US-15 — Receipt failure and privacy
As the user, a failed scan costs me nothing and my receipt image is never stored anywhere.
- **Given** a VLM failure/timeout, **Then** the empty editor opens (manual entry), with a quiet non-blocking notice.
- **Given** any receipt request, **Then** the image is processed in memory only — not written to Modal storage, not uploaded to Supabase (code-inspectable + service contract).
- **Verify**: mock (failure) + live-inspect (no persistence) · **FR**: FR-3.4, FR-0.7

---

## U4 — Insights Digest

### US-16 — Generate insights on demand
As the user, one action on Reflect's Overview gives me a short narrative of my month grounded in my real numbers.
- **Given** AI on, **When** I press "Generate insights", **Then** the client computes aggregates via the existing report selectors and the response renders a headline + a few observations.
- **Given** the rendered digest, **Then** every figure shown matches the client-computed aggregates (numbers rendered from client data, not model output), and no raw transaction list left the device — only aggregates.
- **Verify**: mock (rendering, aggregate assembly) + unit (aggregate builder) · **FR**: FR-4.1, FR-4.2, FR-4.3

### US-17 — Digest is ephemeral
As the user, insights are a view, not a record.
- **Given** a generated digest, **When** I regenerate, **Then** the new one replaces it; **When** I reload, **Then** it is gone — nothing was stored or synced.
- **Verify**: mock · **FR**: FR-4.4

### US-18 — Digest unavailable
As the user, the Reflect tab is never degraded by the digest feature failing.
- **Given** a digest request failing, **Then** the Overview tab renders exactly as today, with a quiet retry affordance where the digest would be.
- **Verify**: mock · **FR**: FR-0.7

---

## INVEST check

All 18 stories: Independent (each lands within one unit; U1–U4 depend only on U0's shipped foundation), Negotiable (UI details left to design stages), Valuable (each names its user payoff), Estimable (bounded by named FRs + integration anchors), Small (one behavior each), Testable (Given/When/Then + explicit verify mode).

## Verification-mode totals
- `unit`: 7 stories carry unit-level assertions (US-4, 5, 6, 8, 9, 10, 16)
- `mock`: 15 stories exercised against a mocked endpoint
- `live`: 4 stories need the deployed Modal service (US-4, 11, 13, 15) — Build & Test will carry a live smoke runsheet for these, like cycle 1's DB-proof stories.
