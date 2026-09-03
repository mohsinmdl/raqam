// Floating "+ Transaction" pill above the phone tab bar (YNAB). Rendered by
// the Shell on every tab screen; hides while Spending's Select mode is on and
// when there is no active account to record against (same rule as the desktop
// Add Transaction toolbar action).
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { openers } from '../drawers/openers.js';
import { useStore } from '../store/StoreProvider.jsx';
import { useTxView } from '../store/TxViewContext.jsx';
import { useAI } from '../ui/ai/useAI.js';

export default function AddTxPill() {
  const { openDrawer } = useDrawer();
  const { data: S } = useStore();
  const { phoneSelect, addSeed } = useTxView();
  const { enabled: aiEnabled } = useAI();
  const disabled = S.accounts.filter(a => a.status === 'active').length === 0;
  if (phoneSelect || disabled) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 'var(--phone-nav-clearance)', zIndex: 39, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
      {/* U2: "Paste bank SMS" companion action — AI-only (US-1). */}
      {aiEnabled && (
        <button onClick={() => openers.pasteSms(openDrawer)} className="hv-elev rq-btn-outline"
          aria-label="Paste bank SMS" data-testid="paste-sms-trigger"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 42,
            padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999,
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 13.5, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow)',
          }}>
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>✉</span>
          Paste SMS
        </button>
      )}
      {/* U3: "Scan receipt" companion action — AI-only (US-1). */}
      {aiEnabled && (
        <button onClick={() => openers.scanReceipt(openDrawer)} className="hv-elev rq-btn-outline"
          aria-label="Scan receipt" data-testid="scan-receipt-trigger"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 42,
            padding: '0 16px', border: '1px solid var(--border)', borderRadius: 999,
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 13.5, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow)',
          }}>
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>📷</span>
          Scan receipt
        </button>
      )}
      <button onClick={() => openers.addTx(openDrawer, 'expense', addSeed)} className="hv-accent rq-btn-solid"
        aria-label="Add transaction"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
          padding: '0 20px', border: 'none', borderRadius: 999,
          background: 'var(--accent)', color: 'var(--on-accent)',
          fontSize: 15, fontWeight: 600, cursor: 'pointer',
          boxShadow: 'var(--shadow)',
        }}>
        <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>＋</span>
        Transaction
      </button>
    </div>
  );
}
