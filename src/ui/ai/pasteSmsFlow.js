// U2 sms-parse — L6 orchestration (no React, no Base UI, so it stays unit
// testable in the repo's node env). Two-tier: client regex first, LLM only on
// a miss and only when AI is enabled; the result PREFILLS the existing add-tx
// editor via openers.addTx — it never writes. Total failure (or AI off/failed)
// still opens the editor with the raw SMS in `notes` so the paste is never lost
// (US-12 / BR-U2-9).
import { openers } from '../../drawers/openers.js';
import { isUsable, parseSmsLocal, seedType, toTxSeed } from '../../lib/smsParse.js';

// Params are injected (enabled + parseSms come from useAI, S from the store,
// openDrawer from the drawer context) so the flow can be driven directly in a
// test without React. Returns a small result describing which tier answered.
export async function runPasteSms({ text, enabled, parseSms, S, openDrawer }) {
  const raw = text == null ? '' : String(text);

  let parsed = parseSmsLocal(raw); // L1 — instant, offline
  let tier = parsed ? 'local' : null;

  // L3 — LLM tier, only on a tier-1 miss and only when AI is enabled (BR-U2-8).
  if (!parsed && enabled && parseSms) {
    try {
      const r = await parseSms(raw);
      if (isUsable(r)) { parsed = r; tier = 'llm'; }
    } catch {
      parsed = null; // any AiError degrades to the notes fallback
    }
  }

  if (parsed && isUsable(parsed)) {
    // Pass `raw` so L4 can resolve the account by the bank NAMED in the SMS when
    // there's no last4 to key on — works for both the local and LLM tiers.
    openers.addTx(openDrawer, seedType(parsed), toTxSeed(parsed, S, raw)); // L5 prefill
    return { tier, parsed };
  }

  openers.addTx(openDrawer, 'expense', { notes: raw }); // US-12 fallback
  return { tier: 'notes', parsed: null };
}
