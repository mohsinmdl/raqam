// Pure helpers with no React/store dependencies (safe to import from anywhere).
export function parseAmt(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return isFinite(n) ? Math.round(n) : NaN;
}

export function uid() {
  try { return crypto.randomUUID(); } catch { return 'x' + Math.random().toString(36).slice(2, 10); }
}
