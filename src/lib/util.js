// Pure helpers with no React/store dependencies (safe to import from anywhere).
// Returns NaN (never 0) for empty/garbage input — callers coerce or comparison-guard deliberately.
export function parseAmt(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return isFinite(n) ? Math.round(n) : NaN;
}

export function uid() {
  try { return crypto.randomUUID(); } catch { return 'x' + Math.random().toString(36).slice(2, 10); }
}
