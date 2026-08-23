# Performance Test Instructions — Multi-Plan

Formal load testing is N/A (single-user-per-account SPA on managed Supabase; resiliency extension opted out). Performance obligations from NFR-2 are verified observationally:

1. **No initial-load regression**: post-migration, single-plan users fetch the same row volume as before (plus one tiny `plans` query). Check DevTools Network on the deployed app: scoped requests carry `plan_id=eq.…`; row counts match pre-feature loads.
2. **Plan switch latency**: switch = drain + reload + scoped fetch. Target: comparable to a normal app reload (the existing LoadingScreen covers it). Measure once on production data after 0017: time from switch click to Plan screen interactive; flag if it materially exceeds a cold reload.
3. **Index sanity**: `(user_id, plan_id)` indexes exist per scoped table (constraint-shape probe in the verify script); PostgREST filter queries use them (optionally `EXPLAIN` a transactions select on the SQL editor).
4. **Formatter cost**: pure string ops replacing Intl calls; the vitest suite (~800ms for 1363 tests incl. 1000+ property executions) is the regression canary — investigate if the plan-format suites' duration jumps by an order of magnitude.
