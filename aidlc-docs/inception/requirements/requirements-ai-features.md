# Requirements — AI Features (Modal.com) — Cycle 2

## Intent Analysis

- **User request**: Add AI capabilities to Raqam using the user's Modal.com
  subscription ($30 credit). Four features selected in ideation:
  auto-categorization, bank SMS → transaction, receipt photo → transaction,
  insights digest.
- **Request type**: New feature set (four user-facing features + one new
  backend service — the app's first component outside the client + Supabase).
- **Scope estimate**: Multiple components — new Modal service (Python), new
  client AI layer, touchpoints in transactions UI, payees, Reflect, prefs.
- **Complexity estimate**: Complex (new runtime, new language, external
  service lifecycle, model selection, cost/latency constraints).
- **Depth**: Comprehensive.

All requirement decisions below trace to the approved question file
(`requirement-verification-questions-ai-features.md`, Q1–Q13 all = A,
approved 2026-08-24T17:10:00Z).

## Scope

**In scope (this cycle, ordered units — Q1):** shared foundation, then
auto-categorization, then SMS parsing, then receipt scanning, then insights
digest. Each unit shippable/mergeable on its own.

**Out of scope:** PWA share_target (Q7), receipt line-item splits (Q9),
scheduled digests/notifications (Q10), server-side embedding index (Q6),
semantic search, ask-your-ledger Q&A, any auto-applied AI writes (Q5).

## Functional Requirements

### FR-0 — Shared AI foundation (unit U0)

- **FR-0.1** One Modal app exposing one FastAPI ASGI web endpoint with routes
  `/categorize`, `/parse-sms`, `/parse-receipt`, `/digest`, plus `/health` (Q2).
- **FR-0.2** Every route (except `/health`) requires a valid Supabase JWT
  (signature + expiry verified server-side); anonymous or invalid tokens are
  rejected with 401 (Q4).
- **FR-0.3** Models are self-hosted open weights in the user's Modal
  workspace: small CPU embedding model; ~4B-class instruct LLM on a small GPU;
  ~7B-class VLM loaded only by `/parse-receipt` (Q3, Q11).
- **FR-0.4** The service is stateless: no request data is persisted anywhere on
  Modal — no logs containing transaction content, no caches of user data (Q6).
- **FR-0.5** Client: a single API module (`src/lib/ai.js`) owns endpoint
  configuration (`VITE_AI_ENDPOINT`), attaches the Supabase access token,
  applies per-request timeouts, and exposes typed helpers per feature. It is
  the only place `fetch` to the AI service occurs.
- **FR-0.6** Client: an "AI features" per-user toggle, default OFF, in the
  user menu; all AI UI renders only when enabled AND an endpoint is configured
  (Q12). Preference persists via the existing per-user prefs fall-through
  (`setPrefs({ aiEnabled })`).
- **FR-0.7** Degradation: any AI failure (network, 5xx, timeout, cold start
  abort) leaves the corresponding manual flow untouched and visible; AI
  affordances disappear or show a quiet retry — never a blocking error in an
  entry flow (Q12).
- **FR-0.8** Cold start UX: first call after idle may take ~30–60s; calling UI
  must show a "warming up" state distinct from failure (Q11).

### FR-1 — Auto-categorization (unit U1)

- **FR-1.1** For transactions flagged by the existing `needsCategory` logic,
  the client may request suggestions: request carries the uncategorized rows
  (merchant, amount, date, type) plus context of recent categorized
  transactions (~200) and the active plan's category list (id, name, group,
  type) (Q6).
- **FR-1.2** Response: per transaction, up to top-2 category suggestions with
  confidence, chosen ONLY from the provided category list (by id). Unknown /
  low-confidence → no suggestion.
- **FR-1.3** UI: suggestion chip(s) rendered with the existing needs-category
  pill surfaces (`NeedsCategoryPill` in TxChips.jsx; equivalent treatment in
  TxPhoneList). One tap applies via the existing `setTransactionsCategory`
  action — the ONLY write path; the AI never writes directly (Q5).
- **FR-1.4** Accepting a suggestion is auditable like any manual
  categorization (existing audit rows from `setTransactionsCategory` suffice).
- **FR-1.5** After ≥3 accepted suggestions for the same payee key mapping to
  the same category, offer (non-blocking prompt) to create a payee
  auto-categorize rule via the existing `upsertPayee` machinery; on accept,
  the deterministic rule takes over and that payee stops hitting the AI (Q5).
- **FR-1.6** Suggestions are ephemeral: never synced, never stored in the
  ledger; a reload recomputes on demand.

### FR-2 — Bank SMS → transaction (unit U2)

- **FR-2.1** A "Paste bank SMS" entry point (desktop + phone) accepts pasted
  text (Q7).
- **FR-2.2** Parsing is deterministic-first: a client-side pattern library for
  known Pakistani bank formats (HBL, Meezan, UBL, Alfalah, easypaisa/TMB,
  JazzCash/MMBL, …) extracts amount, direction (debit/credit), merchant/payee
  text, date, and account/card hint (last4). Only unmatched messages go to the
  Modal LLM route (Q8).
- **FR-2.3** Account resolution: a parsed last4 is matched against
  `accounts[].last4` and `cards[].last4`; ambiguous or missing matches leave
  the field for the user.
- **FR-2.4** Result opens the EXISTING add-transaction editor
  (`openers.addTx(openDrawer, type, seed)`) prefilled — never a direct ledger
  write; the user reviews and saves normally (Q5 ethos).
- **FR-2.5** Parse failures (both tiers) degrade to the empty manual editor
  with the pasted text placed in notes for reference.

### FR-3 — Receipt photo → transaction (unit U3)

- **FR-3.1** A "Scan receipt" entry point accepts a photo (camera capture on
  phone, file picker on desktop).
- **FR-3.2** `/parse-receipt` (VLM) extracts merchant, date, total; response
  may include a category suggestion produced by the same categorizer contract
  as FR-1.2 (Q9).
- **FR-3.3** Result prefills the existing add-transaction editor (same seed
  path as FR-2.4); user reviews and saves. No line-item extraction in v1 (Q9).
- **FR-3.4** The image is processed in-memory only; not stored on Modal
  (FR-0.4) and not stored in Supabase.

### FR-4 — Insights digest (unit U4)

- **FR-4.1** A "Generate insights" action on the Reflect Overview tab (Q10).
- **FR-4.2** The CLIENT computes all figures using existing report selectors
  (`spendingReport.js` breakdowns/stats, `reports.js` series); the request to
  `/digest` carries only those aggregates (category totals, deltas, stats) —
  no raw transactions (Q6 spirit; merchant names appear only in
  `largestOutflow`).
- **FR-4.3** The LLM returns a short narrative (headline + a few observations)
  that must reference only numbers present in the request — the service
  prompt forbids invented figures; the client renders numbers from its own
  computed data where shown as figures.
- **FR-4.4** Digest output is ephemeral (not stored, not synced); regenerating
  replaces it.

## Non-Functional Requirements

- **NFR-1 (Security — extension enforced)**: Supabase JWT verified on every
  AI request (FR-0.2); no secrets in the client bundle (anon key + endpoint
  URL only — both already public-class); Modal secrets (Supabase JWT secret)
  stored as Modal Secrets, never in the repo; CORS restricted to the app's
  origins (raqam.pages.dev + localhost dev).
- **NFR-2 (Privacy)**: self-hosted models only (Q3); stateless service, no
  retention (FR-0.4); nothing AI-related is ever synced to Supabase except
  ordinary user-confirmed ledger writes through existing actions.
- **NFR-3 (Cost)**: scale-to-zero on all functions; GPU containers use
  `scaledown_window` defaults (no keep-warm); the VLM is a separate function
  so `/categorize`/`/parse-sms`/`/digest` never pay its load cost; client
  debounces/batches suggestion requests. Target: normal personal use well
  under $10/month of the $30 credit (Q11).
- **NFR-4 (Latency)**: warm targets — categorize batch ≤2s, SMS parse ≤2s
  (LLM tier; regex tier is instant/offline), receipt ≤10s, digest ≤5s. Cold
  start up to ~60s is acceptable WITH the warming UI state (FR-0.8).
- **NFR-5 (Availability/degradation)**: the app remains fully functional with
  AI off, unconfigured, or down (FR-0.7); no core flow may await an AI call
  to proceed.
- **NFR-6 (Testing — PBT partial, carried config)**: pure client logic (SMS
  pattern parsers, suggestion-context assembly, digest aggregate assembly,
  seed-building) gets unit tests; SMS parsers and any round-trippable pure
  functions get property-based tests (fast-check, per PBT-02/03/07/08/09).
  The Modal service gets Python unit tests for auth + route contracts; live
  endpoint verification is a smoke script, not CI.
- **NFR-7 (Conventions)**: new interactive UI primitives on Base UI via
  src/ui/primitives/; money stays integer PKR; all new user-facing states
  follow DESIGN.md ("Trusted Ledger": AI suggests, human confirms — Q5).

## Constraints & Context

- Client is a static SPA (Cloudflare Pages, auto-deploy on main); the Modal
  service deploys separately via `modal deploy` — deployment coupling must be
  loose: client feature-detects via the toggle + endpoint env (FR-0.6).
- No existing `fetch` to external services in the codebase; `src/lib/ai.js`
  establishes the pattern (mirrors sync.js's auth-refresh-on-401 retry).
- Integration anchors (verified 2026-08-24 survey): `needsCategory`
  (txRow.js:101), `NeedsCategoryPill` (TxChips.jsx:29),
  `setTransactionsCategory` (actions.js:632), payee machinery (payees.js;
  `upsertPayee` actions.js:1523), tx prefill seed (openers.js:51 `addTx`),
  `last4` on accounts/cards, report selectors (spendingReport.js:40/98/133,
  reports.js:36/72/123), prefs fall-through (StoreProvider.jsx setPrefs),
  user-menu toggle cluster (UserMenu.jsx:49-64).

## Extension Compliance (this stage)

| Extension | Status | Notes |
| --- | --- | --- |
| Security Baseline | Compliant | NFR-1 embeds JWT verification, secret handling, CORS; enforced through design/codegen stages |
| Resiliency Baseline | Disabled (Q13) | N/A |
| Property-Based Testing (partial) | Compliant | NFR-6 assigns PBT to the pure parser/round-trip surfaces per the enforced subset |
