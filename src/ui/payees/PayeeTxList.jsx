// src/ui/payees/PayeeTxList.jsx
// "Show N Transactions": a read-only sub-modal listing every non-adjustment
// transaction whose merchant matches the selected payee name(s).
import { useMemo } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { dayLabel } from '../../lib/calc.js';
import { Modal, ModalPanel } from '../primitives/Modal.jsx';
import { matchesPayeeTx, payeeKey } from '../../lib/payees.js';

const th = { textAlign: 'left', fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', color: 'var(--muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' };
const td = { fontSize: 13, padding: '7px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 };

export default function PayeeTxList({ names, open, onClose }) {
  const { data: S } = useStore();
  const { moneyS } = useMoney();
  const keys = names.map(payeeKey);
  const rows = useMemo(() => S.transactions
    .filter(t => keys.some(k => matchesPayeeTx(t, k)))
    .sort((a, b) => (a.date < b.date ? 1 : -1)), [S, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const acctOf = t => (S.accounts.find(a => a.id === t.accountId) || {}).nickname
    || (S.cards.find(c => c.id === t.cardId) || {}).nickname || '—';
  const catOf = t => (S.categories.find(c => c.id === t.category) || {}).name || (t.type === 'transfer' ? 'Transfer' : '—');
  const signed = t => (t.type === 'expense' ? -t.amount : t.amount);
  return (
    <Modal open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <ModalPanel label="Transactions" width={720}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Transactions</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>ACCOUNT</th><th style={th}>DATE</th><th style={th}>CATEGORY</th><th style={th}>MEMO</th><th style={{ ...th, textAlign: 'right' }}>AMOUNT</th>
            </tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td style={td}>{acctOf(t)}</td>
                  <td style={td} className="tnum">{dayLabel(t.date)}</td>
                  <td style={td}>{catOf(t)}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{t.notes}</td>
                  <td style={{ ...td, textAlign: 'right' }} className="tnum">{moneyS(signed(t))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid var(--border)', flex: 'none' }}>
          <button type="button" onClick={onClose} className="hv-accent" style={{ height: 32, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
      </ModalPanel>
    </Modal>
  );
}
