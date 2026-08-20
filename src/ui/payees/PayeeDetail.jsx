// src/ui/payees/PayeeDetail.jsx
// Single-payee editor: name, transactions link, auto-categorize, rename
// rules, visibility, delete-with-reassignment (spec §3 + the reference
// screenshots — Delete swaps this pane into a "New payee" step defaulting
// [No Payee]).
import { useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { currentMonth, nowIso } from '../../lib/dates.js';
import { envelopeFor } from '../../lib/envelope.js';
import Checkbox from '../Checkbox.jsx';
import PlanCategoryPicker from '../PlanCategoryPicker.jsx';
import PayeeTxList from './PayeeTxList.jsx';
import { upsertPayee, renamePayee, setPayeesHidden, deletePayees } from '../../store/actions.js';
import { payeeIndex, payeeKey } from '../../lib/payees.js';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 };
const h = { fontSize: 13.5, fontWeight: 700 };
const note = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 };

export default function PayeeDetail({ entry, onDeselect }) {
  const { data: S, applyData } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  const [nameDraft, setNameDraft] = useState(null); // null = mirror entry.name
  const [txOpen, setTxOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [ruleOp, setRuleOp] = useState('contains');
  const [rulePattern, setRulePattern] = useState('');
  const rec = entry.record;
  const rules = (rec && rec.renameRules) || [];

  const commitName = () => {
    if (nameDraft !== null && nameDraft.trim() && payeeKey(nameDraft) !== payeeKey(entry.name)) {
      applyData(d => renamePayee(d, { from: entry.name, to: nameDraft.trim() }));
      onDeselect(); // the selection key just changed
    }
    setNameDraft(null);
  };
  const patch = p => applyData(d => upsertPayee(d, { name: entry.name, patch: p }));
  const addRule = () => {
    const pattern = rulePattern.trim();
    if (!pattern) return;
    patch({ renameRules: [...rules, { op: ruleOp, pattern }] });
    setRulePattern('');
  };
  const others = payeeIndex(S).filter(p => payeeKey(p.name) !== payeeKey(entry.name));

  if (deleting) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={h}>New payee</div>
        <div style={{ ...note, fontStyle: 'italic' }}>
          {entry.txCount} transaction{entry.txCount === 1 ? ' is' : 's are'} using this payee. Select a new payee for {entry.txCount === 1 ? 'this transaction' : 'these transactions'}.
        </div>
        <select className="field" aria-label="New payee" value={replacement} onChange={e => setReplacement(e.target.value)}
          style={{ height: 36, padding: '0 10px', fontSize: 13.5, maxWidth: 520 }}>
          <option value="">[No Payee]</option>
          {others.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setDeleting(false)} className="hv-elev" style={{ height: 34, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" className="hv-neg-soft"
            onClick={() => { applyData(d => deletePayees(d, { names: [entry.name], replacement })); setDeleting(false); onDeselect(); }}
            style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}>
        <div style={h}>Payee Name</div>
        <input className="field" aria-label="Payee name" value={nameDraft !== null ? nameDraft : entry.name}
          onChange={e => setNameDraft(e.target.value)} onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } }}
          style={{ height: 36, padding: '0 10px', fontSize: 13.5 }} />
        <button type="button" onClick={() => setTxOpen(true)} disabled={entry.txCount === 0}
          style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: entry.txCount ? 'var(--accent)' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: entry.txCount ? 'pointer' : 'default', padding: 0 }}>
          Show {entry.txCount} Transaction{entry.txCount === 1 ? '' : 's'}
        </button>
      </div>

      <div style={card}>
        <div style={h}>Categorization</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <Checkbox checked={!!(rec && rec.autoCategorize)} onChange={on => patch({ autoCategorize: on })} label="Automatically categorize payee" />
          Automatically categorize payee
        </label>
        <div style={note}>If enabled, transactions with this payee will automatically receive the selected category.</div>
        {rec && rec.autoCategorize && (
          <PlanCategoryPicker
            env={envelopeFor(S, month, nowIso())} S={S} month={month} money={money}
            catType="expense" showAmounts heading="Plan Categories"
            value={rec.autoCategoryId === 'rta' ? 'rta' : (rec.autoCategoryId || '')}
            onChange={id => patch({ autoCategoryId: id === 'rta' ? 'rta' : id })}
          />
        )}
      </div>

      <div style={card}>
        <div style={h}>Renaming</div>
        <div style={note}>Imported payees that match these rules will be renamed. (No import feature exists yet — rules are stored for when it does.)</div>
        {rules.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600, width: 76, flex: 'none', textTransform: 'capitalize' }}>{r.op}:</span>
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.pattern}</span>
            <button type="button" aria-label={'Remove rule ' + (i + 1)} className="hv-soft"
              onClick={() => patch({ renameRules: rules.filter((_, j) => j !== i) })}
              style={{ width: 26, height: 26, border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="field" aria-label="Rule type" value={ruleOp} onChange={e => setRuleOp(e.target.value)} style={{ width: 110, height: 34, padding: '0 8px', fontSize: 13, flex: 'none' }}>
            <option value="contains">Contains</option>
            <option value="is">Is</option>
          </select>
          <input className="field" aria-label="Rule pattern" value={rulePattern} onChange={e => setRulePattern(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}
            style={{ flex: 1, height: 34, padding: '0 10px', fontSize: 13 }} />
          <button type="button" onClick={addRule} aria-label="Add rule" className="hv-soft"
            style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', flex: 'none' }}>＋</button>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Payee Visibility</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <Checkbox checked={!!(rec && rec.hidden)} onChange={on => applyData(d => setPayeesHidden(d, { names: [entry.name], hidden: on }))} label="Hide this payee" />
          Hide this payee
        </label>
        <div style={note}>Hidden payees will not be suggested as you type or included in the list of payees when adding a transaction. This is useful for payees you don't expect to use again, like from a trip or event.</div>
      </div>

      <button type="button" onClick={() => (entry.txCount === 0
        ? (applyData(d => deletePayees(d, { names: [entry.name], replacement: '' })), onDeselect())
        : setDeleting(true))}
        className="hv-neg-soft"
        style={{ alignSelf: 'flex-start', height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Delete
      </button>

      <PayeeTxList names={[entry.name]} open={txOpen} onClose={() => setTxOpen(false)} />
    </div>
  );
}
