# Performance Test Instructions — AI Features (Cycle 2)

Personal-scale app (peak ≈ 1–2 concurrent requests); this is budget/latency
validation, not load testing. Targets from NFR (`ai-shared/nfr-requirements`).

## Targets (warm)
| Route | Target | Notes |
|---|---|---|
| /health | ≤300ms | trivial |
| /categorize | ≤2s (50-tx batch) | CPU embeddings, one batched call |
| /parse-sms | ≤2s | vLLM guided JSON; tier-1 is instant/offline |
| /parse-receipt | ≤10s | VLM, one image |
| /digest | ≤5s | vLLM, aggregates-only prompt |
| cold start | ≤~60s once/idle | warming UI covers it (FR-0.8) |

## Cost guardrails (the real constraint — $30 credit)
- `max_containers=1` on every function (api/llm/vlm) → bounded worst case.
- No keep-warm, no cron, no unattended callers → spend only on user action.
- Client: one debounced batch for suggestions; single 401-refresh retry only —
  no retry loops.
- VLM isolated → its 7B weight never loads on categorize/sms/digest.

## How to measure (at/after deploy)
1. `modal run modal/smoke.py` → warms `api`; note round-trip.
2. In-app, first call after idle → confirm the "warming" state shows, then a
   warm call meets the table above. 3. Modal dashboard → per-function invocation
   durations + spend; confirm scale-to-zero (containers drop after idle) and
   daily spend is pennies.

## If a target is missed
- Cold >60s: confirm weights are cached in the volume (first-boot download is
  one-time). - Warm categorize >2s: check batch size / examples window (≤200).
  - Runaway spend: verify `max_containers=1` and that nothing calls the service
  on a timer.
