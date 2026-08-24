// U3 receipt-scan — orchestration (no React, no Base UI, so it stays unit
// testable in the repo's node env). Snap/pick an image → `/parse-receipt` (VLM)
// → PREFILL the existing add-tx editor via openers.addTx — it never writes.
// Optionally chains ai.categorize for a category prefill (US-14), best-effort and
// non-blocking. A junk/failed parse still opens a blank expense editor plus a
// quiet notice (US-15). Never blocks or throws to the user.
import { openers } from '../../drawers/openers.js';
import { buildContext } from '../../lib/aiSuggest.js';
import { isUsableReceipt, toReceiptSeed } from '../../lib/receiptSeed.js';

// The quiet notice shown when a receipt can't be read (US-15). The editor still
// opens so the tap is never wasted.
const UNREADABLE_NOTICE = "Couldn't read that receipt — opening a blank transaction to fill in.";

// US-14 (optional): ask the service for a category for the just-parsed receipt.
// buildContext returns null under the MIN_HISTORY guard (Fresh Starter → no
// suggestion). We validate the top suggestion against the active plan's own
// categories here (present, non-archived, expense type) because the parsed
// receipt is a synthetic, not-yet-stored tx — aiSuggest.validateSuggestions keys
// off stored transactions, so it would drop it. Any failure → null (no category).
async function suggestCategory({ seed, categorize, S }) {
  if (!categorize) return null;
  try {
    const context = buildContext(S);
    if (!context) return null;
    const amount = seed.amount ? Number(seed.amount) : 0;
    const tx = { id: 'receipt', merchant: seed.merchant, amount, type: 'expense', date: seed.date };
    const map = await categorize([tx], context);
    const top = map && Array.isArray(map.receipt) ? map.receipt[0] : null;
    if (!top || !top.categoryId) return null;
    const cat = (S.categories || []).find(
      c => c.id === top.categoryId && c.status !== 'archived' && c.type === 'expense',
    );
    return cat ? cat.id : null;
  } catch {
    return null; // US-14 is a bonus; its failure never affects the prefill
  }
}

// Params are injected (enabled + parseReceipt/categorize come from useAI, S from
// the store, openDrawer from the drawer context, notify from the UI context) so
// the flow can be driven directly in a test without React. Returns a small result
// describing the outcome.
export async function runReceiptScan({ file, enabled, parseReceipt, categorize, S, openDrawer, notify }) {
  if (!enabled || !file || !parseReceipt) return { ok: false, reason: 'disabled' };

  let parsed = null;
  try {
    parsed = await parseReceipt(file);
  } catch {
    parsed = null; // any AiError degrades to the blank-editor + notice path
  }

  // Junk image or a total failure → blank expense editor + quiet notice (US-15).
  if (!isUsableReceipt(parsed)) {
    openers.addTx(openDrawer, 'expense', {});
    if (notify) notify(UNREADABLE_NOTICE);
    return { ok: false, reason: 'unreadable', parsed: null };
  }

  // Prefill the seed, then (best-effort) fold in a category BEFORE opening so the
  // editor opens once, fully seeded — post-open re-seeding would risk clobbering
  // a user edit. categorize is awaited but fully guarded (never blocks/throws).
  const seed = toReceiptSeed(parsed, S);
  const categoryId = await suggestCategory({ seed, categorize, S });
  if (categoryId) seed.category = categoryId;

  openers.addTx(openDrawer, 'expense', seed); // prefill only — nothing writes
  return { ok: true, parsed, categoryId: categoryId || null };
}
