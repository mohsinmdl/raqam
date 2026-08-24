# Requirements Verification Questions — AI Features (Modal.com)

Cycle 2. Answers are PRE-FILLED with recommendations (➡️) — edit any you disagree
with, then say "done". Every question keeps an "Other" escape hatch.

## Question 1
Delivery scope for this cycle: all four features were selected. How should they land?

A) All four in this cycle, as ordered units — foundation → auto-categorization → SMS parsing → receipt scan → digest — each unit shippable (mergeable) on its own

B) Foundation + auto-categorization only this cycle; run a fresh cycle later for the rest

C) All four, but prioritize SMS parsing first after the foundation (entry friction over categorization)

D) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 2
Backend architecture on Modal: how should the service be structured?

A) One Modal app exposing one FastAPI ASGI endpoint with routes per feature (/categorize, /parse-sms, /parse-receipt, /digest); models shared across routes; scale-to-zero

B) Separate Modal apps per feature (isolated deploys, more cold starts, more moving parts)

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 3
Model strategy (privacy vs capability):

A) Self-hosted open models only, running in the Modal workspace: small embedding model (CPU) for categorization; Qwen3-4B-Instruct class LLM (L4 GPU) for SMS long-tail + digest; Qwen2.5-VL-7B class VLM for receipts. Financial data never leaves user-controlled infra

B) Hosted frontier API (e.g. Claude) called from Modal — better quality, but transaction data goes to a third party and burns credit differently

C) Hybrid: self-hosted by default, hosted API as an explicit opt-in per feature

D) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 4
How does the Modal endpoint authenticate callers?

A) Verify the caller's Supabase JWT (signature + expiry against the project's JWT secret/JWKS) on every request; reject anonymous calls. No new accounts, and the endpoint is useless to anyone without a Raqam login

B) Static shared secret baked into the client bundle (weaker — extractable from the JS)

C) No auth (rely on URL obscurity) — not acceptable for financial data

D) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 5
Auto-categorization behavior (BR-critical — "Trusted Ledger" ethos):

A) Suggest-only, always: chips on uncategorized transactions with one-tap accept; the AI never writes a category by itself, regardless of confidence. After repeated accepts for the same payee, offer to create a payee auto-categorize rule (the existing deterministic machinery takes over)

B) Auto-apply above a high confidence threshold, marked visually and undoable

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 6
Where does the categorizer's knowledge live?

A) Stateless: each request carries the context it needs (the user's recent categorized transactions ~200 + the uncategorized rows); Modal stores NOTHING between calls — no server-side index, no sync, no retention

B) Server-side embedding index (pgvector in Supabase) maintained incrementally — faster and scales to huge histories, but a new moving part with sync/consistency work

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 7
Bank SMS entry point (v1):

A) Paste flow: a "Paste bank SMS" action (mobile sheet + desktop) → parsed → prefilled transaction editor opens. PWA share_target deferred to a later iteration

B) PWA share_target now (share SMS from Messages straight to Raqam) — requires manifest changes; GET-based to avoid a service worker

C) Both in v1

D) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 8
SMS parsing approach:

A) Deterministic first: regex/pattern library for known Pakistani bank formats (HBL, Meezan, UBL, easypaisa, JazzCash, …) parsed client-side instantly; the Modal LLM is only called for messages the patterns can't handle. Account matched via stored last4

B) LLM for everything (simpler code, slower + costs on every parse)

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 9
Receipt scanning scope (v1):

A) Single-transaction prefill: merchant, date, total (+ suggested category via the categorizer). Line-item split proposal is a later iteration

B) Full line-item extraction + proposed split lines from day one

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 10
Insights digest surface and cadence (v1):

A) On-demand: a "Generate insights" action on the Reflect Overview tab summarizing the current month vs prior months (client computes the numbers via existing report selectors; the LLM only narrates). No scheduling, no notifications

B) Scheduled weekly/monthly digest with notification delivery (needs infrastructure the app deliberately lacks)

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 11
Cold starts and cost guardrails ($30 credit):

A) Accept cold starts: scale-to-zero everything; UI shows a "warming up" state on first call (~30–60s worst case, then fast); per-request timeouts; VLM (the expensive one) loads only on receipt requests. No keep-warm spend

B) Keep the small LLM warm during active use (snappier, steady credit burn)

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 12
AI availability and failure behavior in the client:

A) Per-user opt-in toggle ("AI features") in the user menu, default OFF; endpoint URL from build env (VITE_AI_ENDPOINT). Any AI failure degrades silently to the existing manual flow — never blocks a core action, never shows a scary error mid-entry

B) Default ON once deployed, with a kill-switch toggle

C) Other (please describe after [Answer]: tag below)

\[Answer]: A

## Question 13
Extension configuration carry-over from the Multi-Plan cycle:

A) Same as cycle 1: Security Baseline = Yes (enforced — apt here: new network service, JWT handling, financial data); Resiliency Baseline = No; Property-Based Testing = Partial (pure functions + round-trips: the SMS pattern parsers and categorizer ranking are natural PBT targets)

B) Different (describe after [Answer]: tag)

C) Other (please describe after [Answer]: tag below)

\[Answer]: A
