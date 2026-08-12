// Floating "+ Transaction" pill above the phone tab bar (YNAB). Rendered by
// the Shell on every tab screen; hides while Spending's Select mode is on and
// when there is no active account to record against (same rule as the desktop
// Add Transaction toolbar action).
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';
import { useStore } from '../store/StoreProvider.jsx';
import { useTxView } from '../store/TxViewContext.jsx';

export default function AddTxPill() {
  const { openDrawer } = useDrawer();
  const { data: S } = useStore();
  const { phoneSelect } = useTxView();
  const disabled = S.accounts.filter(a => a.status === 'active').length === 0;
  if (phoneSelect || disabled) return null;
  return (
    <button onClick={() => openers.addTx(openDrawer)} className="hv-accent"
      aria-label="Add transaction"
      style={{
        position: 'fixed', right: 16,
        bottom: 'var(--phone-nav-clearance)', zIndex: 39,
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
        padding: '0 20px', border: 'none', borderRadius: 999,
        background: 'var(--accent)', color: 'var(--on-accent)',
        fontSize: 15, fontWeight: 600, cursor: 'pointer',
        boxShadow: 'var(--shadow)',
      }}>
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>＋</span>
      Transaction
    </button>
  );
}
