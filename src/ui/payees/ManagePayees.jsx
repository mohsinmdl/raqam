// Manage Payees (Spec 2). Two panes: a searchable checkbox list on the left,
// a detail/bulk editor on the right. Selection keys are namespaced —
// 'p:<payeeKey>' for payees, 't:<ref>' for transfer payees — because the two
// populations live in different tables of truth. Mixing the two groups shows
// the deselect-transfers empty state (YNAB's cone screen). Footer Undo/Redo
// is the scoped window from src/lib/scopedUndo.js.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { useUI } from '../UIProvider.jsx';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { Modal, ModalClose, ModalPanel } from '../primitives/Modal.jsx';
import Checkbox from '../Checkbox.jsx';
import { payeeIndex, payeeKey, transferHidden } from '../../lib/payees.js';
import { openScope, transition, canUndoScoped, canRedoScoped } from '../../lib/scopedUndo.js';
import { setPayeesHidden } from '../../store/actions.js';
import PayeeDetail from './PayeeDetail.jsx';
import PayeeBulk from './PayeeBulk.jsx';

const paneMsg = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontSize: 13.5, padding: 24, textAlign: 'center' };

function transferRows(S) { // plain data helper, not a component
  return [
    ...S.accounts.filter(a => a.status === 'active').map(a => ({ key: 't:acc:' + a.id, ref: 'acc:' + a.id, label: 'Transfer : ' + a.nickname })),
    ...S.cards.filter(c => c.type === 'credit' && c.status === 'active').map(c => ({ key: 't:card:' + c.id, ref: 'card:' + c.id, label: 'Transfer : ' + c.nickname + ' ••' + c.last4 })),
  ];
}

export default function ManagePayees() {
  const { data: S, undo, redo, undoDepth, canUndo, canRedo } = useStore();
  const { payeesOpen, closePayees } = useUI();
  const phone = useIsPhone();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [scope, setScope] = useState(null);

  // Scope lifecycle: mark the boundary when the modal opens, and re-derive the
  // window whenever the global undo depth moves while it's open. Kept in an
  // effect (rather than the mid-render `if (cond) setState(...)` form) so the
  // dependency (undoDepth changing out from under an open modal) is explicit
  // and there's no risk of a render-phase warning from the structural/strict
  // checks — the scope only ever feeds button `disabled` states, so the extra
  // tick of latency behind an effect is invisible.
  useEffect(() => {
    if (!payeesOpen) { setScope(null); return; }
    setScope(prev => {
      if (!prev) return openScope(undoDepth);
      if (prev.depth === undoDepth) return prev;
      return transition(prev, undoDepth, false);
    });
  }, [payeesOpen, undoDepth]);

  const index = useMemo(() => payeeIndex(S), [S]);
  const transfers = useMemo(() => transferRows(S), [S]);
  const hit = s => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const rows = [
    ...index.filter(p => hit(p.name)).map(p => ({ key: 'p:' + payeeKey(p.name), kind: 'p', entry: p, label: p.name, dim: !!(p.record && p.record.hidden) })),
    ...transfers.filter(t => hit(t.label)).map(t => ({ ...t, kind: 't', dim: transferHidden(S, t.ref) })),
  ];
  const visibleKeys = rows.map(r => r.key);
  const selVisible = visibleKeys.filter(k => sel.has(k));
  const allSelected = selVisible.length > 0 && selVisible.length === visibleKeys.length;
  const toggle = (key, on) => setSel(prev => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n; });

  const selPayees = rows.filter(r => r.kind === 'p' && sel.has(r.key)).map(r => r.entry);
  const selTransfers = rows.filter(r => r.kind === 't' && sel.has(r.key));
  const mixed = selPayees.length > 0 && selTransfers.length > 0;
  const close = () => { setSel(new Set()); setQ(''); setScope(null); closePayees(); };
  const modalUndo = () => { undo(); setScope(s => transition(s, undoDepth - 1, false)); };
  const modalRedo = () => { redo(); setScope(s => transition(s, undoDepth + 1, true)); };

  if (phone) return null; // desktop-first (spec decision 5)
  return (
    <Modal open={payeesOpen} onOpenChange={o => { if (!o) close(); }}>
      <ModalPanel label="Manage Payees">
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Manage Payees</span>
          <span style={{ flex: 1 }} />
          <ModalClose aria-label="Close" className="hv-elev" style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}>×</ModalClose>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 300, flex: 'none', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px 8px' }}>
              <input className="field" placeholder="Search Payees" aria-label="Search payees" value={q}
                onChange={e => setQ(e.target.value)} style={{ width: '100%', height: 34, padding: '0 10px', fontSize: 13 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px 8px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Checkbox checked={allSelected} indeterminate={selVisible.length > 0 && !allSelected}
                onChange={on => setSel(on ? new Set(visibleKeys) : new Set())} label="Select all payees" />
              Payees ({selVisible.length || rows.length})
            </label>
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
              {rows.map(r => (
                <label key={r.key} className="hv-elev" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', fontSize: 13.5, cursor: 'pointer', opacity: r.dim ? 0.5 : 1 }}>
                  <Checkbox checked={sel.has(r.key)} onChange={on => toggle(r.key, on)} label={'Select ' + r.label} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, background: 'var(--elev)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {mixed ? (
              <div style={paneMsg}>
                <span style={{ fontSize: 34 }} aria-hidden="true">⚠️</span>
                <span>
                  Only one payee group can be edited at a time. Please{' '}
                  <button type="button" onClick={() => setSel(prev => new Set([...prev].filter(k => !k.startsWith('t:'))))}
                    style={{ border: 'none', background: 'none', color: 'var(--accent)', font: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    deselect transfer payees
                  </button>{' '}to continue.
                </span>
              </div>
            ) : selTransfers.length > 0 ? (
              <TransferPane S={S} rows={selTransfers} />
            ) : selPayees.length === 1 ? (
              <PayeeDetail entry={selPayees[0]} onDeselect={() => setSel(new Set())} />
            ) : selPayees.length > 1 ? (
              <PayeeBulk entries={selPayees} onDeselect={() => setSel(new Set())} />
            ) : (
              <div style={paneMsg}>Select a Payee to Edit</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', flex: 'none' }}>
          <button type="button" onClick={modalUndo} disabled={!(scope && canUndoScoped(scope, undoDepth) && canUndo)} className="hv-elev"
            style={{ height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: scope && canUndoScoped(scope, undoDepth) && canUndo ? 1 : 0.45 }}>↺ Undo</button>
          <button type="button" onClick={modalRedo} disabled={!(scope && canRedoScoped(scope) && canRedo)} className="hv-elev"
            style={{ height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: scope && canRedoScoped(scope) && canRedo ? 1 : 0.45 }}>↻ Redo</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={close} className="hv-accent" style={{ height: 34, padding: '0 20px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Done</button>
        </div>
      </ModalPanel>
    </Modal>
  );
}

// Transfer-only selection: visibility is the single editable property of a
// synthesized payee (spec §3).
function TransferPane({ S, rows }) {
  const { applyData } = useStore();
  const refs = rows.map(r => r.ref);
  const allHidden = refs.every(ref => transferHidden(S, ref));
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{rows.length === 1 ? rows[0].label : rows.length + ' Transfer Payees Selected'}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
        <Checkbox checked={allHidden} onChange={on => applyData(d => setPayeesHidden(d, { transferRefs: refs, hidden: on }))} label="Hide these transfer payees" />
        Hide {rows.length === 1 ? 'this payee' : 'these payees'}
      </label>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', maxWidth: '52ch' }}>
        Hidden payees will not be suggested as you type or included in the list of payees when adding a transaction.
      </div>
    </div>
  );
}
