// Money formatting bound to the privacy mask, plus small input helpers.
import { useCallback } from 'react';
import { fmtPKR, fmtSigned } from './calc.js';
import { usePrefs } from '../store/StoreProvider.jsx';

export { parseAmt, uid } from './util.js';

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
  const { masked, maskedPosition, decimals } = usePrefs();
  const money = useCallback(n => fmtPKR(n, masked, decimals), [masked, decimals]);
  const moneyS = useCallback(n => fmtSigned(n, masked, decimals), [masked, decimals]);
  // Position-scoped formatters honor `maskedPosition` (the Dashboard eye icon)
  // instead of the overall `masked`. Used only by the full "Current position"
  // card; every other surface uses money/moneyS.
  const moneyPos = useCallback(n => fmtPKR(n, maskedPosition, decimals), [maskedPosition, decimals]);
  const moneySPos = useCallback(n => fmtSigned(n, maskedPosition, decimals), [maskedPosition, decimals]);
  const moneyRaw = useCallback(n => fmtPKR(n, false, decimals), [decimals]); // ← contribution site
  return { money, moneyS, moneyPos, moneySPos, moneyRaw, masked, maskedPosition };
}
