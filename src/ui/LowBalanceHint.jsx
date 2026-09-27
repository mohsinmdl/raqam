// A subtle "top up" marker shown next to an account balance that has fallen
// below the user's low-balance threshold (Settings → Low-balance alert). Renders
// nothing when the balance is fine or the alert is off, so callers drop it in
// unconditionally next to the amount:
//   <LowBalanceHint balance={r.balance} threshold={thr} money={money} />
// A small warn-toned "Low" pill — enough to prompt a top-up without shouting.
// The <title> carries the reason (and the threshold) for hover + screen readers.
import { isLowBalance } from '../lib/lowBalance.js';

export default function LowBalanceHint({ balance, threshold, money }) {
  if (!isLowBalance(balance, threshold)) return null;
  const tip = 'Low balance — below your ' + (money ? money(threshold) : threshold) + ' alert. Consider topping up.';
  return (
    <span
      title={tip}
      aria-label={tip}
      style={{
        flex: 'none', fontSize: 10, fontWeight: 600, lineHeight: 1.4, padding: '0 5px',
        borderRadius: 999, background: 'var(--warn-soft)', color: 'var(--warn)', whiteSpace: 'nowrap',
      }}
    >Low</span>
  );
}
