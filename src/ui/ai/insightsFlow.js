// U4 insights-digest — the (React-free) orchestration behind the Insights card.
// Injecting `digest` (from useAI) + the store lets the whole flow be driven in
// the repo's node test env without React. It builds the aggregate payload on the
// client, sends ONLY that to /digest, and hands back both the payload (the
// authoritative figures the card renders) and the model's narrative. Errors are
// left to propagate so the card owns the "degrade quietly" catch path (US-18).
import { buildDigestPayload } from '../../lib/digestData.js';

// runDigest({ S, month, digest }) -> { payload, result }. `payload` is the exact
// wire body (no raw transactions); `result` is the DigestResponse
// { headline, observations[] }. Throws (AiError et al.) on any failure.
export async function runDigest({ S, month, digest }) {
  const payload = buildDigestPayload(S, month);
  const result = await digest(payload);
  return { payload, result };
}
