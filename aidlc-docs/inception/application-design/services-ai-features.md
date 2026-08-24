# Services & Orchestration — AI Features (Cycle 2)

Who calls what, when. The client is the only orchestrator; the service never
initiates anything (stateless request/response).

## S1 — Suggestion flow (U1)
1. Register/list renders rows → needs-category ids visible.
2. `useAI().enabled` false → STOP (nothing renders; US-1).
3. `aiSuggest.buildContext(S)` → null (low history) → STOP (US-5 guard).
4. Debounce (~800ms after list settles) → ONE batched `ai.categorize(targets, context)` (plan Q4=A).
5. `validateSuggestions()` → chips render via `SuggestionChips`.
6. Tap → `applyData(setTransactionsCategory({ ids:[txId], categoryId }))` → `recordAccept()` → maybe graduation offer → accept → `applyData(upsertPayee({ name, patch:{ autoCategorize:true, autoCategoryId } }))`.
- Failure at 4 → chips absent, pill unchanged (US-3). Warming >3s → chip skeleton with "warming" hint only on the banner surface (no per-row noise).

## S2 — SMS flow (U2)
1. Entry (sheet/dialog) → paste text.
2. `parseSmsLocal(text)` → hit → `toTxSeed` + `resolveAccount` → `openers.addTx(openDrawer, type, seed)` — instant, offline, no AI involvement.
3. Miss AND `useAI().enabled` → `ai.parseSms(text)` → parsed → same seed path (US-11). Warming state shown in the entry surface.
4. Miss/failure → `openers.addTx` with `{ notes: text }` (US-12).
- The editor is ALWAYS the gate: nothing writes without the user's save.

## S3 — Receipt flow (U3)
1. Entry → image picked → `ai.parseReceipt(file)` (warming state in-surface).
2. Parsed → seed (merchant/date/total); optionally chain `ai.categorize` for a category prefill (US-14) — non-blocking: editor opens immediately, category fills when it lands.
3. Failure → empty editor + quiet notice (US-15).

## S4 — Digest flow (U4)
1. Reflect Overview → "Generate insights" → `buildDigestPayload(S, month)` (pure, local).
2. `ai.digest(payload)` → render headline + observations; figures shown come from the local payload, not model text (FR-4.3).
3. Failure → retry affordance in-card; tab unaffected (US-18).

## S5 — Foundation behaviors (U0, cross-cutting)
- **Toggle**: UserMenu row → `setPrefs({ aiEnabled })` (per-user fall-through). All surfaces gate on `useAI().enabled`.
- **Auth**: every `ai.js` call attaches the current session token; one 401 → `supabase.auth.refreshSession()` → retry → second 401 degrades (mirrors sync.js's convention).
- **Warming**: `useAI` starts a 3s timer per tracked call; surfaces read `warming` and render their own placement (FR-0.8).
- **Degradation contract**: `ai.js` throws typed `AiError`; every consumer's catch path is "render as if AI didn't exist" (US-3). No global error UI.

## Service-side orchestration (C1)
- `/categorize`: embed examples + targets (CPU) → kNN vote → confidence → top-2. No GPU unless the (U1-FD-decided) LLM fallback triggers.
- `/parse-sms`, `/digest`: FastAPI handler → `models_llm.remote(...)` (L4, scale-to-zero).
- `/parse-receipt`: handler → `models_vlm.remote(image)` (separate function/image so its weight is never paid by other routes).
