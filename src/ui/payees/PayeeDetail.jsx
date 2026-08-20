// src/ui/payees/PayeeDetail.jsx
// Single-payee editor: name, transactions link, auto-categorize, rename
// rules, visibility, delete-with-reassignment (spec §3 + the reference
// screenshots — Delete swaps this pane into a "New payee" step defaulting
// [No Payee]).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { useUI } from '../UIProvider.jsx';
import { useMoney } from '../../lib/format.js';
import { currentMonth, nowIso } from '../../lib/dates.js';
import { envelopeFor } from '../../lib/envelope.js';
import Checkbox from '../Checkbox.jsx';
import PlanCategoryPicker from '../PlanCategoryPicker.jsx';
import PayeeTxList from './PayeeTxList.jsx';
import { upsertPayee, renamePayee, setPayeesHidden, deletePayees } from '../../store/actions.js';
import { payeeIndex, payeeKey, payeeListLabel } from '../../lib/payees.js';

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 };
const h = { fontSize: 13.5, fontWeight: 700 };
const note = { fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 };

export default function PayeeDetail({ entry, onDeselect, onStepChange = () => {} }) {
  const { data: S, applyData } = useStore();
  const { ask } = useUI();
  const { money } = useMoney();
  const month = currentMonth();
  const [nameDraft, setNameDraft] = useState(null); // null = mirror entry.name
  const [txOpen, setTxOpen] = useState(false);
  // null = no step. Otherwise a SNAPSHOT {names, txCount} taken when Delete was
  // clicked: the step must act on what the user saw, not on whatever the
  // selection says by the time they press the red button.
  const [deleting, setDeleting] = useState(null);
  const [replacement, setReplacement] = useState('');
  const [ruleOp, setRuleOp] = useState('contains');
  const [rulePattern, setRulePattern] = useState('');
  const committing = useRef(false);
  const rec = entry.record;
  const rules = (rec && rec.renameRules) || [];

  const index = useMemo(() => payeeIndex(S), [S]);
  const others = useMemo(() => index.filter(p => payeeKey(p.name) !== payeeKey(entry.name)), [index, entry.name]);

  // Tell the modal a step is open so it can freeze the selection list behind it.
  useEffect(() => { onStepChange(!!deleting); return () => onStepChange(false); }, [deleting, onStepChange]);
  // The chosen replacement can disappear underneath the open step — another
  // tab's sync, an undo, a rename. Falling back to [No Payee] is the honest
  // reading of a <select> whose value no longer exists (the browser shows the
  // first option anyway); silently deleting against a stale name is not.
  useEffect(() => {
    if (replacement && !others.some(p => payeeKey(p.name) === payeeKey(replacement))) setReplacement('');
  }, [others, replacement]);

  const commitName = async () => {
    if (committing.current) return; // Enter then blur must not ask twice
    const to = nameDraft === null ? '' : nameDraft.trim();
    if (!to || payeeKey(to) === payeeKey(entry.name)) { setNameDraft(null); return; }
    const clash = index.find(p => payeeKey(p.name) === payeeKey(to)); // different key by the check above
    committing.current = true;
    try {
      if (clash) {
        const ok = await ask({
          title: 'Combine payees?',
          body: '“' + clash.name + '” already exists with ' + clash.txCount + ' transaction' + (clash.txCount === 1 ? '' : 's') +
            '. Renaming “' + entry.name + '” to that name merges the two into one payee — their transactions, rules and settings end up together. Undo reverses it.',
          action: 'Rename and combine',
        });
        if (!ok) { setNameDraft(null); return; }
      }
      applyData(d => renamePayee(d, { from: entry.name, to }));
      onDeselect(); // the selection key just changed
      setNameDraft(null);
    } finally {
      committing.current = false;
    }
  };
  const patch = p => applyData(d => upsertPayee(d, { name: entry.name, patch: p }));
  const rulePatternValid = !!rulePattern.trim();
  // Duplicate rules are inert (applyRenameRules stops at the first match), so
  // adding one is pure noise in the list. The button disables on both the
  // empty and the duplicate case — a disabled control explains itself where a
  // silent no-op would just look broken.
  const ruleDuplicate = rules.some(r => r.op === ruleOp && payeeKey(r.pattern) === payeeKey(rulePattern));
  const canAddRule = rulePatternValid && !ruleDuplicate;
  const addRule = () => {
    if (!canAddRule) return;
    patch({ renameRules: [...rules, { op: ruleOp, pattern: rulePattern.trim() }] });
    setRulePattern('');
  };

  if (deleting) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={h}>New payee</div>
        <div style={{ ...note, fontStyle: 'italic' }}>
          {deleting.txCount} transaction{deleting.txCount === 1 ? ' is' : 's are'} using this payee. Select a new payee for: {payeeListLabel(deleting.names)}.
        </div>
        <select className="field" aria-label="New payee" value={replacement} onChange={e => setReplacement(e.target.value)}
          style={{ height: 36, padding: '0 10px', fontSize: 13.5, maxWidth: 520 }}>
          <option value="">[No Payee]</option>
          {others.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setDeleting(null)} className="hv-elev" style={{ height: 34, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" className="hv-neg-soft"
            onClick={() => { applyData(d => deletePayees(d, { names: deleting.names, replacement })); setDeleting(null); onDeselect(); }}
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
          {/* Unchecking clears the category too: a record holding only a dead
              autoCategoryId is a bare record, and upsertPayee deletes a record
              with nothing left to customize. Sending the boolean alone would
              leave the id behind and keep the record alive forever. */}
          <Checkbox checked={!!(rec && rec.autoCategorize)}
            onChange={on => patch(on ? { autoCategorize: true } : { autoCategorize: false, autoCategoryId: '' })}
            label="Automatically categorize payee" />
          Automatically categorize payee
        </label>
        <div style={note}>If enabled, transactions with this payee will automatically receive the selected category.</div>
        <div style={note}>Choosing Ready to Assign keeps this payee's inflows as uncategorized income — the same as having no rule.</div>
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
          <button type="button" onClick={addRule} aria-label="Add rule" className="hv-soft" disabled={!canAddRule}
            title={ruleDuplicate ? 'This rule already exists' : undefined}
            style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--accent)', fontSize: 16, cursor: canAddRule ? 'pointer' : 'default', opacity: canAddRule ? 1 : 0.45, flex: 'none' }}>＋</button>
        </div>
        {ruleDuplicate && <div style={note}>This rule is already on the list.</div>}
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
        : setDeleting({ names: [entry.name], txCount: entry.txCount }))}
        className="hv-neg-soft"
        style={{ alignSelf: 'flex-start', height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Delete
      </button>

      <PayeeTxList names={[entry.name]} open={txOpen} onClose={() => setTxOpen(false)} />
    </div>
  );
}
