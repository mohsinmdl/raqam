// Inline editor for one of the user's OWN banks, shown under the institution
// picker in the account and card drawers. A bank is a single shared record, so
// edits here apply immediately and everywhere it is used — they are deliberately
// NOT part of the account/card form being filled in (which is why this keeps its
// own state instead of writing into drawer.form: mirroring it there would mark
// that form dirty and trip the unsaved-changes guard on close).
// Catalogue banks are read-only (no `own` flag) and render nothing.
import { useEffect, useState } from 'react';
import { useDrawer } from '../ui/DrawerProvider.jsx';
import { useStore } from '../store/StoreProvider.jsx';
import { useUI } from '../ui/UIProvider.jsx';
import { instById, instRefs, INST_KINDS } from '../lib/calc.js';
import { deleteInstitution, updateInstitution } from '../store/actions.js';
import { Label, Hint, grid2 } from './fields.jsx';

export const KIND_LABEL = { Custom: 'Other — not a bank' };

// The kind picker, shared by this component and the "＋ Custom institution…"
// path in both drawers (where the bank does not exist yet).
export function KindOptions() {
  return INST_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>);
}

export default function BankKindField() {
  const { drawer, setForm } = useDrawer();
  const { data: S, applyData } = useStore();
  const { ask, notify } = useUI();
  const inst = instById(S, drawer.form.inst);
  const own = !!(inst && inst.own);
  const [name, setName] = useState(inst ? inst.name : '');

  // Re-seed when the picker moves to a different bank.
  useEffect(() => { if (inst) setName(inst.name); }, [inst && inst.id]);

  if (!own) return null; // catalogue row, '__custom', or nothing chosen

  const refs = instRefs(S, inst.id);
  const commitName = () => {
    const n = name.trim();
    if (!n || n === inst.name) { setName(inst.name); return; }
    applyData(data => updateInstitution(data, { id: inst.id, name: n, kind: inst.kind }));
    notify('Bank renamed to “' + n + '”.');
  };
  const commitKind = kind => {
    applyData(data => updateInstitution(data, { id: inst.id, name: inst.name, kind }));
    notify('“' + inst.name + '” is now listed under ' + (kind === 'Custom' ? 'Other' : kind) + '.');
  };
  const askRemove = async () => {
    const ok = await ask({
      title: 'Remove “' + inst.name + '”?',
      body: 'No account or card uses this bank, so removing it only takes it out of the lists. Nothing else changes.',
      action: 'Remove bank',
    });
    if (!ok) return;
    applyData(data => deleteInstitution(data, { id: inst.id }));
    setForm({ inst: '' });
    notify('“' + inst.name + '” removed.');
  };

  return (
    <div style={{ marginTop: 10, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--elev)' }}>
      <div style={grid2}>
        <div>
          <Label htmlFor="i-name">Bank name</Label>
          <input
            id="i-name" className="field" value={name} maxLength={60}
            onChange={e => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
          />
        </div>
        <div>
          <Label htmlFor="i-kind">Type of bank</Label>
          <select id="i-kind" className="field" style={{ padding: '0 10px' }} value={inst.kind} onChange={e => commitKind(e.target.value)}>
            <KindOptions />
          </select>
        </div>
      </div>
      <Hint>
        Sets which group this bank appears under. Saved straight away and applies everywhere it is used
        {refs.total > 0 ? ' — ' + refs.total + ' ' + (refs.total === 1 ? 'account or card' : 'accounts and cards') : ''}.
      </Hint>
      {refs.total === 0 && (
        <button
          onClick={askRemove}
          className="hv-neg-soft rq-btn-outline"
          style={{ marginTop: 10, height: 30, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
        >
          Remove this bank
        </button>
      )}
    </div>
  );
}
