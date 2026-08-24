# Unit Dependencies — AI Features (Cycle 2)

## Dependency matrix (row depends on column)

| ↓ needs → | U0 | U1 | U2 | U3 | U4 |
| --- | --- | --- | --- | --- | --- |
| U0 ai-foundation | — | | | | |
| U1 auto-categorize | ✅ hard | — | | | |
| U2 sms-parse | ✅ hard | — | — | | |
| U3 receipt-scan | ✅ hard | soft¹ | soft² | — | |
| U4 insights-digest | ✅ hard | — | soft³ | — | — |

¹ reuses U1's `/categorize` contract for the category prefill (US-14) — U3 can
ship without it (field just stays empty) but is sequenced after U1 anyway.
² reuses U2's `toTxSeed` editor-seed builder.
³ reuses U2's `models_llm.py` GPU function for narration.

## Merge order (one PR per unit — plan Q1=A)

U0 → U1 → U2 → U3 → U4. Strict because each later PR builds on merged files
(`modal/app.py` route additions, shared UI entry points). U1 and U2 are
logically parallel but are serialized to keep PRs conflict-free.

## Coordination points
- **Contract**: `modal/schemas.py` + `component-methods-ai-features.md` +
  shared fixtures `modal/fixtures/*.json` (added per unit as its route lands;
  consumed by pytest and vitest).
- **Toggle**: U0's `useAI().enabled` is the single gate every later unit's UI
  must sit behind — a later unit adds surfaces, never a second switch.
- **Rollback**: any unit's PR can be reverted independently ABOVE the units
  after it (revert U2 ⇒ revert U3's paste-seed reuse first); in practice the
  toggle-off path is the operational rollback and needs no revert.

## Testing checkpoints
- After U0: live smoke (health + auth) — establishes the deployed endpoint.
- After each of U1–U4: unit + mock suites green, full app suite green.
- Build & Test stage: consolidated live runsheet (US-4, 11, 13, 15) + full
  regression.
