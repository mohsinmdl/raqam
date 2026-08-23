// Pure helpers with no React/store dependencies (safe to import from anywhere).
import { activeFormat } from './planFormat.js';

// Returns NaN (never 0) for empty/garbage input — callers coerce or comparison-guard deliberately.
// Reads the open plan's separators first (BR-U3-6: the plan decimal AND '.'
// both parse; group chars are stripped); the parseFloat fallback keeps the
// historical tolerance for partially-numeric drafts ('12ab34' → 12) that the
// strict parser deliberately rejects.
export function parseAmt(v) {
  const strict = activeFormat().parseAmount(v);
  if (strict != null) return Math.round(strict);
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return isFinite(n) ? Math.round(n) : NaN;
}

export function uid() {
  try { return crypto.randomUUID(); } catch { return 'x' + Math.random().toString(36).slice(2, 10); }
}
