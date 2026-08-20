// src/ui/payees/PayeeBulk.jsx
// Multi-payee pane: combine-and-rename (merges renaming rules — YNAB copy),
// bulk hide, and Delete All via the same reassignment step as single delete.
import { useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import Checkbox from '../Checkbox.jsx';
import PayeeTxList from './PayeeTxList.jsx';
import { combinePayees, deletePayees, setPayeesHidden } from '../../store/actions.js';
import { payeeIndex, payeeKey } from '../../lib/payees.js';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 };
const h = { fontSize: 13.5, fontWeight: 700 };
const note = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 };

export default function PayeeBulk({ entries, onDeselect }) {
  const { data: S, applyData } = useStore();
  const names = entries.map(e => e.name);
  const txCount = entries.reduce((s, e) => s + e.txCount, 0);
  const [intoDraft, setIntoDraft] = useState(null); // null = mirror names[0]
  const into = intoDraft !== null ? intoDraft : names[0];
  const [txOpen, setTxOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacement, setReplacement] = useState('');
  const allHidden = entries.every(e => e.record && e.record.hidden);
  const keys = names.map(payeeKey);
  const others = payeeIndex(S).filter(p => !keys.includes(payeeKey(p.name)));

  if (deleting) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={h}>New payee</div>
        <div style={{ ...note, fontStyle: 'italic' }}>{txCount} transaction{txCount === 1 ? ' is' : 's are'} using {entries.length === 1 ? 'this payee' : 'these payees'}. Select a new payee for {txCount === 1 ? 'this transaction' : 'these transactions'}.</div>
        <select className="field" aria-label="New payee" value={replacement} onChange={e => setReplacement(e.target.value)} style={{ height: 36, padding: '0 10px', fontSize: 13.5, maxWidth: 520 }}>
          <option value="">[No Payee]</option>
          {others.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setDeleting(false)} className="hv-elev" style={{ height: 34, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" className="hv-neg-soft"
            onClick={() => { applyData(d => deletePayees(d, { names, replacement })); setDeleting(false); onDeselect(); }}
            style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{entries.length} Payees Selected</span>
        <button type="button" onClick={() => setTxOpen(true)} disabled={txCount === 0}
          style={{ border: 'none', background: 'none', color: txCount ? 'var(--accent)' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: txCount ? 'pointer' : 'default', padding: 0 }}>
          Show {txCount} Transaction{txCount === 1 ? '' : 's'}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names.join(', ')}</div>

      <div style={card}>
        <div style={h}>Combine and Rename</div>
        <div style={note}>Combining these payees will also combine all their renaming rules.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" aria-label="Combined payee name" value={into} onChange={e => setIntoDraft(e.target.value)}
            style={{ flex: 1, height: 36, padding: '0 10px', fontSize: 13.5 }} />
          <button type="button" disabled={!into.trim()} className="hv-accent"
            onClick={() => { applyData(d => combinePayees(d, { names, into: into.trim() })); setIntoDraft(null); onDeselect(); }}
            style={{ height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: into.trim() ? 'pointer' : 'default', opacity: into.trim() ? 1 : 0.5, flex: 'none' }}>Combine</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Payee Visibility</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <Checkbox checked={allHidden} onChange={on => applyData(d => setPayeesHidden(d, { names, hidden: on }))} label="Hide these payees" />
          Hide these payees
        </label>
        <div style={note}>Hidden payees will not be suggested as you type or included in the list of payees when adding a transaction.</div>
      </div>

      <button type="button" onClick={() => (txCount === 0
        ? (applyData(d => deletePayees(d, { names, replacement: '' })), onDeselect())
        : setDeleting(true))}
        className="hv-neg-soft"
        style={{ alignSelf: 'flex-start', height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Delete All
      </button>

      <PayeeTxList names={names} open={txOpen} onClose={() => setTxOpen(false)} />
    </div>
  );
}
