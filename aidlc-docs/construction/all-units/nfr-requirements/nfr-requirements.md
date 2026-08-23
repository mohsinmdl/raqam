# NFR Requirements — Consolidated (U1–U4)

Source of truth: `aidlc-docs/inception/requirements/requirements.md` (NFR-1..NFR-4, approved). This pass maps them to units; nothing new is introduced.

| NFR | Requirement | Owning unit(s) |
|---|---|---|
| Security — ownership integrity (NFR-1.1) | Composite FK + RLS as boundary; client filters convenience-only | U1 (schema), U2 (stamping/filtering) |
| Security — migration safety (NFR-1.2) | Single transaction, idempotent, verification queries, rollback | U1 |
| Security — input validation (NFR-1.3) | CHECK constraints + form validation from catalogues | U1, U4 |
| Security — fail-closed delete (NFR-1.5) | Typed-name confirm; drain failure surfaces rejected status | U2, U4 |
| Performance (NFR-2) | Per-plan fetch = no regression; switch shows LoadingScreen, target ≈ current cold load | U2 |
| Compatibility (NFR-3) | Byte-identical balances post-migration; storage formats unchanged; per-plan identities preserved | U1, U3 (default-rendering equivalence) |
| Testing (NFR-4) | PBT partial (PBT-02/03/07/08/09) + example-based vitest; Playwright live verification | U3 (owner), U1/U2/U4 (example-based) |
| Availability / scalability / observability | No change — managed Supabase + Cloudflare Pages, single-user-per-account SPA; resiliency extension opted OUT (Q12=B) | N/A |

## Verification obligations carried into Build & Test
- Migration equivalence + idempotency proofs (U1)
- Isolation invariants via sync contract tests (U2)
- PBT suites green with logged seeds in CI (U3, PBT-08)
- Story-AC Playwright pass, desktop + phone (U4)
