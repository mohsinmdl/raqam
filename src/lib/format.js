// Money formatting bound to the privacy mask, plus small input helpers.
import { useCallback } from 'react';
import { fmtPKR, fmtSigned } from './calc.js';
import { usePrefs } from '../store/StoreProvider.jsx';

/**
 * useMoney — every amount the UI renders goes through one of these three.
 *
 * ── USER CONTRIBUTION CHECKPOINT (learning mode) ─────────────────────────────
 * Decision: should `moneyRaw` respect the privacy mask?
 * The prototype deliberately leaves chart tooltips, aria chart summaries, and the
 * duplicate-transaction warning UNMASKED (moneyRaw) even when "Hide amounts" is on —
 * tooltips exist to reveal exact values, but that also leaks amounts on a shared
 * screen. Current provisional default: preserve the prototype behavior (unmasked).
 * To make the mask absolute, change moneyRaw's body to `fmtPKR(n, masked)`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function useMoney() {
  const { masked } = usePrefs();
  const money = useCallback(n => fmtPKR(n, masked), [masked]);
  const moneyS = useCallback(n => fmtSigned(n, masked), [masked]);
  const moneyRaw = useCallback(n => fmtPKR(n, false), []); // ← contribution site
  return { money, moneyS, moneyRaw, masked };
}

export function parseAmt(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return isFinite(n) ? Math.round(n) : NaN;
}

export function uid() {
  try { return crypto.randomUUID(); } catch { return 'x' + Math.random().toString(36).slice(2, 10); }
}
