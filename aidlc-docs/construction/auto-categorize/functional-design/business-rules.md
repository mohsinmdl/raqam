# Business Rules — U1 auto-categorize

Tunable constants collected in ONE place (`src/lib/aiSuggest.js` consts +
mirrored in the service). Stories in brackets.

| ID | Rule | Value / logic |
| --- | --- | --- |
| BR-U1-1 | Low-history guard [US-5] | Suggestions computed only when the active plan has ≥ **30** categorized, non-archived transactions; else no chips at all |
| BR-U1-2 | Example window | Up to **200** most-recent categorized txs as kNN examples |
| BR-U1-3 | Embedded feature [Q2] | Normalized MERCHANT string only; amount/date not embedded |
| BR-U1-4 | Type is a hard filter [Q2] | A target only matches examples/categories of the same `type` (expense/income); never cross-type |
| BR-U1-5 | k | k = **10** nearest neighbours |
| BR-U1-6 | Primary chip floor [Q1] | Emit winner only if `topSim ≥ 0.80` AND `share(winner) ≥ 0.60` |
| BR-U1-7 | Second chip floor [Q1] | Emit runner-up only if `share(runner) ≥ 0.25`; max **2** chips/tx |
| BR-U1-8 | Confidence | `= share`, 2 dp, 0–1 |
| BR-U1-9 | Id integrity [US-8] | Every returned categoryId MUST be a present, non-archived category of the matching type in the active plan; server restricts to the supplied list, client re-drops foreign/stale ids |
| BR-U1-10 | Ephemerality [US-8] | Suggestions never persisted/synced; recomputed on demand; nothing about them touches the ledger |
| BR-U1-11 | Apply path [US-6] | The only write is `setTransactionsCategory` on tap; AI never writes a category autonomously (Trusted Ledger) |
| BR-U1-12 | Batch/debounce [US-5] | One debounced ~**800ms** batch over the visible needs-category set; refetch only when that id-set changes |
| BR-U1-13 | Failure silence [US-3] | Any categorize failure → no chips, no error UI, no auto-retry; the plain pill remains exactly as pre-AI |
| BR-U1-14 | Graduation threshold [US-7] | Offer a payee rule at the **3rd** accept of the same `payeeKey→categoryId`; offer shown ONCE |
| BR-U1-15 | Graduation accept [US-7] | Creates a payee auto-categorize rule via `upsertPayee`; that payee is then excluded from suggestion targets |
| BR-U1-16 | Graduation decline [US-7] | Sets a per-pair dismissed flag; never re-offered for that payee/category pair |
| BR-U1-17 | Counter storage [Q3] | Accept counts + dismissed flags live in per-user prefs (with `aiEnabled`); advisory only, never in the ledger |
| BR-U1-18 | Empty merchant | A tx whose merchant normalizes to empty is never a target and never counted toward graduation |
| BR-U1-19 | Rule'd payees skip AI | A payee that already has an active `autoCategorize` rule is excluded from L2 targets (deterministic path wins) |

## Error / edge scenarios
- No categorized history / <30 → silent, no chips (BR-U1-1).
- Category deleted between fetch and tap → no-op apply (BR-U1-9 re-check).
- Two visible txs same merchant → each gets its own (identical) chips; each
  accept counts once toward graduation.
- AI disabled mid-scroll → cached chips cleared, targets stop firing (US-1/US-3).
