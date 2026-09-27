// A subtle "top up" marker shown next to an account balance that has fallen
// below the user's low-balance threshold (Settings → Low-balance alert). Renders
// nothing when the balance is fine or the alert is off, so callers drop it in
// unconditionally next to the amount:
//   <LowBalanceHint balance={r.balance} threshold={thr} money={money} />
// A tiny warn-toned dot — the quietest possible "top up" cue; the detail lives
// in the hover tooltip (native title: never clipped by the scrolling sidebar)
// and the aria-label. The padded wrapper gives the 6px dot a hover target a
// pointer can actually land on.
import { isLowBalance } from '../lib/lowBalance.js';

export default function LowBalanceHint({ balance, threshold, money }) {
  if (!isLowBalance(balance, threshold)) return null;
  const tip = 'Low balance — below your ' + (money ? money(threshold) : threshold) + ' alert. Consider topping up.';
  return (
    <span
      role="img" title={tip} aria-label={tip}
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', padding: 4, margin: -4, cursor: 'help' }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--warn)', opacity: 0.8 }} />
    </span>
  );
}
