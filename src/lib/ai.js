// The app's ONLY connection to the Raqam AI service. Pure module (no React) so
// it is unit-testable and can be called from hooks or plain logic alike. Every
// feature surface reaches the service through the typed helpers below; nothing
// else in the app calls `fetch` against the AI endpoint.
//
// Auth mirrors sync.js's convention: attach the current session's JWT, and on a
// single 401 refresh the session once and retry — a second 401 is a real auth
// failure, not a transient expiry. Failures always surface as a typed AiError so
// every consumer's catch path can simply "render as if AI didn't exist" (US-3).
import { supabase } from './supabase.js';

// import.meta.env is Vite-injected; read it live (not captured at module load)
// so tests can stub VITE_AI_ENDPOINT per case, and the fallback keeps this
// module importable in plain Node.
const env = () => import.meta.env ?? {};

// Public-class config, like the Supabase anon URL — presence alone gates the
// whole feature. Absent → the app behaves exactly as it did before AI existed.
export function aiConfigured() {
  return Boolean(env().VITE_AI_ENDPOINT);
}

// Trailing slash trimmed so `${base}${path}` never doubles up.
function endpoint() {
  return String(env().VITE_AI_ENDPOINT || '').replace(/\/+$/, '');
}

// Normal request budget, and the longer budget for the first call after the
// scale-to-zero service has gone idle (a cold container boot can take ~a minute).
const DEFAULT_TIMEOUT_MS = 20000;
const COLD_TIMEOUT_MS = 75000;
// After this much quiet, the next authed call is treated as a cold start.
const IDLE_MS = 60000;
let lastActivityAt = 0;

function coldTimeout() {
  return lastActivityAt === 0 || Date.now() - lastActivityAt > IDLE_MS
    ? COLD_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS;
}

// Typed failure. `kind` drives how a surface degrades; `status` is attached when
// an HTTP status was involved (useful for logging/telemetry, never for the UI).
export class AiError extends Error {
  constructor(kind, message, status) {
    super(message || kind);
    this.name = 'AiError';
    this.kind = kind; // 'cold' | 'auth' | 'unavailable' | 'bad-response'
    if (status !== undefined) this.status = status;
  }
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

// One fetch with an AbortController timeout. Maps transport failures to kinds:
// abort/timeout → 'cold' (likely a cold container), anything else → 'unavailable'.
async function rawFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AiError('cold', 'AI request timed out');
    throw new AiError('unavailable', (e && e.message) || 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

// Authed request with the single 401-refresh-retry idiom (mirrors sync.js).
async function authedFetch(path, init = {}, opts = {}) {
  // Degrade rather than crash when the backend isn't wired up at all.
  if (!supabase) throw new AiError('unavailable', 'AI backend unavailable');
  const url = endpoint() + path;
  const timeoutMs = opts.timeoutMs ?? coldTimeout();

  const attempt = async () => {
    const token = await getToken();
    const headers = { ...(init.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return rawFetch(url, { ...init, headers }, timeoutMs);
  };

  try {
    let res = await attempt();
    if (res.status === 401) {
      // A single refresh + retry rides out an expired access token. A refresh
      // failure isn't fatal here — the retry will 401 again and degrade cleanly.
      try { await supabase.auth.refreshSession(); } catch { /* fall through to retry */ }
      res = await attempt();
      if (res.status === 401) throw new AiError('auth', 'Not authorized', 401);
    }
    return res;
  } finally {
    lastActivityAt = Date.now();
  }
}

// Non-2xx → 'unavailable' (with status); malformed JSON → 'bad-response'. 501
// (a route stubbed until its unit lands) falls into 'unavailable' by design.
async function readOk(res) {
  const ok = res.status >= 200 && res.status < 300;
  if (!ok) throw new AiError('unavailable', `AI request failed (${res.status})`, res.status);
  try {
    return await res.json();
  } catch {
    throw new AiError('bad-response', 'Malformed AI response', res.status);
  }
}

// ---- request-body builders (exported so contract tests assert their shape) --
// These mirror modal/schemas.py; keeping them as named pure functions lets the
// vitest suite import the JSON fixtures and assert key-for-key lockstep.

export function buildCategorizeBody(transactions, context) {
  return { transactions, context };
}

export function buildParseSmsBody(text) {
  return { text };
}

// ---- typed helpers ---------------------------------------------------------

// No auth — a liveness probe used by warm-up / diagnostics only.
export async function health(opts = {}) {
  const res = await rawFetch(endpoint() + '/health', { method: 'GET' }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const body = await readOk(res);
  if (!body || body.ok !== true || typeof body.version !== 'string') {
    throw new AiError('bad-response', 'Unexpected /health shape', res.status);
  }
  return body;
}

// Per-tx category suggestions. Returns the { [txId]: [{categoryId, confidence}] } map.
export async function categorize(transactions, context, opts = {}) {
  const res = await authedFetch('/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCategorizeBody(transactions, context)),
  }, opts);
  const body = await readOk(res);
  if (!body || typeof body.suggestions !== 'object' || body.suggestions === null) {
    throw new AiError('bad-response', 'Missing suggestions', res.status);
  }
  return body.suggestions;
}

// Parse a bank SMS. A null parse comes back as {} on the wire → null here.
export async function parseSms(text, opts = {}) {
  const res = await authedFetch('/parse-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildParseSmsBody(text)),
  }, opts);
  const body = await readOk(res);
  if (!body || typeof body.parsed !== 'object' || body.parsed === null) {
    throw new AiError('bad-response', 'Missing parsed', res.status);
  }
  return Object.keys(body.parsed).length ? body.parsed : null;
}

// Parse a receipt image. multipart/form-data with `image`; browser sets the
// multipart boundary, so Content-Type is deliberately NOT set here.
export async function parseReceipt(file, opts = {}) {
  const form = new FormData();
  form.append('image', file);
  const res = await authedFetch('/parse-receipt', { method: 'POST', body: form }, opts);
  const body = await readOk(res);
  if (!body || typeof body.parsed !== 'object' || body.parsed === null) {
    throw new AiError('bad-response', 'Missing parsed', res.status);
  }
  return Object.keys(body.parsed).length ? body.parsed : null;
}

// Monthly narrative from pre-computed aggregates (no raw transactions sent).
export async function digest(aggregates, opts = {}) {
  const res = await authedFetch('/digest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aggregates),
  }, opts);
  const body = await readOk(res);
  if (!body || typeof body.headline !== 'string' || !Array.isArray(body.observations)) {
    throw new AiError('bad-response', 'Unexpected /digest shape', res.status);
  }
  return body;
}
