# Unit ↔ Story Map — AI Features (Cycle 2)

All 18 stories assigned; each to exactly one unit (no orphans).

| Unit | Stories | Verify modes |
| --- | --- | --- |
| U0 ai-foundation | US-1 toggle · US-2 warming · US-3 degradation · US-4 auth-only | mock ×3 · live+unit ×1 |
| U1 auto-categorize | US-5 chips · US-6 one-tap accept · US-7 graduation · US-8 integrity | mock+unit |
| U2 sms-parse | US-9 paste→prefill · US-10 last4 · US-11 LLM fallback · US-12 failure path | unit+mock ×3 · mock+live ×1 |
| U3 receipt-scan | US-13 scan→prefill · US-14 category prefill · US-15 failure/privacy | live+mock ×2 · mock ×1 |
| U4 insights-digest | US-16 generate · US-17 ephemeral · US-18 unavailable | mock+unit ×1 · mock ×2 |

## Acceptance rollup per unit
- A unit's Code Generation stage is not presented for approval until every
  mapped story's non-live criteria pass in that unit's test suite.
- Live-tagged criteria (US-4, US-11, US-13, US-15) accumulate into the Build &
  Test live runsheet; U0's smoke covers US-4 early so later units build on a
  proven endpoint.
