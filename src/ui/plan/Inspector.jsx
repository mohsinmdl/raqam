// Plan inspector (Phase 3): right-column sidebar reacting to row selection.
// Structure live-captured from YNAB 2026-08-09 (see the phase-3 spec);
// chrome follows Raqam tokens, not YNAB's.
import { useMemo, useState, useRef } from 'react';
import { monthLabel } from '../../lib/calc.js';
import {
  selectionSummary, autoAssignPlan, autoAssignAmount, AUTO_ASSIGN_KINDS,
} from '../../lib/inspector.js';
import { moveAssigned, setCategoryNote, setTarget, clearTarget, setCategoryExcluded } from '../../store/actions.js';
import { hasTarget, targetNeeded, targetSummary, costToBeMe } from '../../lib/targets.js';
import { parseAmt } from '../../lib/format.js';
import { useUI } from '../UIProvider.jsx';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const lineRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, padding: '3px 0' };
const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

function Card({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section style={cardStyle}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
        <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </section>
  );
}

function SummaryLines({ sum, money, monthName }) {
  return (
    <>
      <div style={lineRow}><span>Left Over from Last Month</span><span className="tnum">{money(sum.carryIn)}</span></div>
      <div style={lineRow}><span>Assigned in {monthName}</span><span className="tnum">{money(sum.assigned)}</span></div>
      <div style={lineRow}><span>Activity</span><span className="tnum">{money(sum.activity)}</span></div>
      <div style={{ ...lineRow, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 7 }}>
        <span style={{ fontWeight: 700 }}>Available</span>
        <span className="tnum" style={{ fontWeight: 700, color: tone(sum.available) }}>{money(sum.available)}</span>
      </div>
    </>
  );
}

const KIND_LABELS = {
  underfunded: 'Underfunded',
  assignedLastMonth: 'Assigned Last Month', spentLastMonth: 'Spent Last Month',
  avgAssigned: 'Average Assigned', avgSpent: 'Average Spent',
  resetAvailable: 'Reset Available Amount', resetAssigned: 'Reset Assigned Amount',
};

function AutoAssignRows({ kinds, catIds, ctx, money, applyData, plural }) {
  const { notify } = useUI();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {kinds.map(kind => {
        const amount = autoAssignAmount(kind, catIds, ctx);
        const plan = autoAssignPlan(kind, catIds, ctx);
        const label = KIND_LABELS[kind] + (plural && kind.startsWith('reset') ? 's' : '');
        return (
          <button key={kind} className="hv-soft" disabled={!plan.length}
            onClick={() => {
              applyData(data => plan.reduce((d, mv) => moveAssigned(d, mv), data));
              notify(label + ' applied to ' + plan.length + (plan.length === 1 ? ' category.' : ' categories.'));
            }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 32, padding: '0 10px', border: 'none', borderRadius: 8, background: 'var(--elev)', color: 'var(--text)', fontSize: 13, cursor: plan.length ? 'pointer' : 'default', opacity: plan.length ? 1 : .55 }}>
            <span>{label}</span>
            <span className="tnum" style={{ fontWeight: 600 }}>{money(amount)}</span>
          </button>
        );
      })}
    </div>
  );
}

const SIX_KINDS = AUTO_ASSIGN_KINDS.filter(k => k !== 'underfunded');

function AvailableCard({ row, money }) {
  const pillBg = row.available > 0 ? 'var(--pos-soft)' : row.available < 0 ? 'var(--neg-soft)' : 'var(--elev)';
  const pillFg = row.available > 0 ? 'var(--pos)' : row.available < 0 ? 'var(--neg)' : 'var(--muted)';
  return (
    <Card title="Available Balance">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <span className="tnum" style={{ padding: '4px 14px', borderRadius: 999, background: pillBg, color: pillFg, fontSize: 15, fontWeight: 700 }}>{money(row.available)}</span>
      </div>
      <div style={lineRow}><span>Left Over from Last Month</span><span className="tnum">{money(row.carryIn)}</span></div>
      <div style={lineRow}><span>Assigned This Month</span><span className="tnum">{(row.assigned > 0 ? '+' : '') + money(row.assigned)}</span></div>
      <div style={lineRow}><span>Spending This Month</span><span className="tnum">{money(row.activity)}</span></div>
    </Card>
  );
}

function NotesCard({ cat, applyData }) {
  const { notify } = useUI();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Same cancelledRef guard as CategoryRow's assigned input (Plan.jsx): Escape sets
  // it before teardown so a still-pending blur doesn't re-commit the discarded draft.
  const cancelledRef = useRef(false);
  const start = () => { cancelledRef.current = false; setDraft(cat.description || ''); setEditing(true); };
  const commit = () => {
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    const changed = draft !== (cat.description || '');
    applyData(data => setCategoryNote(data, { id: cat.id, note: draft }));
    setEditing(false);
    if (changed) notify('Note saved.');
  };
  return (
    <Card title="Notes">
      {editing ? (
        <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          aria-label={'Note for ' + cat.name}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); cancelledRef.current = true; setEditing(false); }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
          }}
          style={{ width: '100%', minHeight: 64, boxSizing: 'border-box', padding: 8, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
      ) : (
        <button type="button" onClick={start} style={{ display: 'block', margin: 0, width: '100%', border: 'none', background: 'transparent', padding: 0, fontSize: 13, color: cat.description ? 'var(--text)' : 'var(--muted)', cursor: 'text', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
          {cat.description || 'Enter a note...'}
        </button>
      )}
    </Card>
  );
}

const DISABLED_CADENCES = ['Weekly', 'Yearly', 'Custom'];

function ExcludeToggle({ cat, applyData }) {
  const on = !!cat.excludeFromBudget;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
      <button onClick={() => applyData(d => setCategoryExcluded(d, { id: cat.id, excluded: !on }))}
        role="switch" aria-checked={String(on)} aria-label="Exclude from budgets"
        style={{ width: 44, height: 26, flex: 'none', padding: 2, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--track)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start' }}>
        <span aria-hidden="true" style={{ display: 'block', width: 20, height: 20, borderRadius: 999, background: on ? 'var(--on-accent)' : 'var(--surface)' }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Exclude from budgets</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>Use for advances or money you expect to receive back. Excluded categories carry no target.</div>
      </div>
    </div>
  );
}

function TargetCard({ cat, row, money, applyData }) {
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('setaside');
  const [dueDay, setDueDay] = useState(''); // '' = Last Day of Month
  const excluded = !!cat.excludeFromBudget;
  const has = hasTarget(cat);

  const open = () => {
    setAmt(has ? String(cat.targetAmount) : '');
    setMode(cat.targetMode || 'setaside');
    setDueDay(cat.targetDueDay == null ? '' : String(cat.targetDueDay));
    setEditing(true);
  };
  const commit = () => {
    const amount = Math.max(0, Math.round(parseAmt(String(amt)) || 0));
    applyData(d => setTarget(d, { id: cat.id, amount, mode, dueDay: dueDay === '' ? null : parseInt(dueDay, 10) }));
    setEditing(false);
  };
  const remove = () => { applyData(d => clearTarget(d, { id: cat.id })); setEditing(false); };

  return (
    <Card title="Target">
      {excluded ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Excluded from budgets — no target.</div>
      ) : editing ? (
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <button aria-pressed="true" style={{ flex: 1, padding: '5px 0', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--soft)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'default' }}>Monthly</button>
            {DISABLED_CADENCES.map(c => (
              <button key={c} disabled title="Coming later" style={{ flex: 1, padding: '5px 0', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--elev)', color: 'var(--muted)', fontSize: 12, cursor: 'not-allowed' }}>{c}</button>
            ))}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>I need</label>
          <input autoFocus value={amt} onChange={e => setAmt(e.target.value)} inputMode="decimal"
            style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 10 }} />
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Next month I want to</label>
          <select value={mode} onChange={e => setMode(e.target.value)}
            style={{ width: '100%', height: 34, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 4 }}>
            <option value="setaside">Set aside another</option>
            <option value="refill">Refill up to</option>
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            {mode === 'setaside' ? 'Use for: bills, subscriptions, saving over time' : "Use for: gasoline, fun money, dining out. Whatever you don't spend applies toward next month."}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>By</label>
          <select value={dueDay} onChange={e => setDueDay(e.target.value)}
            style={{ width: '100%', height: 34, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, marginBottom: 12 }}>
            <option value="">Last Day of Month</option>
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Day {d}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {has && <button onClick={remove} style={{ marginRight: 'auto', border: 'none', background: 'transparent', color: 'var(--neg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>}
            <button onClick={() => setEditing(false)} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={commit} disabled={!(parseAmt(String(amt)) > 0)}
              style={{ padding: '6px 12px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: parseAmt(String(amt)) > 0 ? 1 : .5 }}>Save Target</button>
          </div>
        </div>
      ) : has ? (
        <button onClick={open} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{targetSummary(cat, money)}</div>
          <div style={{ fontSize: 12, marginTop: 3, color: targetNeeded(row, cat) > 0 ? 'var(--neg)' : 'var(--pos)' }}>
            {targetNeeded(row, cat) > 0 ? 'Needs ' + money(targetNeeded(row, cat)) + ' more' : 'Funded'}
          </div>
        </button>
      ) : (
        <button onClick={open} style={{ border: '1px solid var(--accent)', borderRadius: 8, background: 'transparent', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: '7px 12px', cursor: 'pointer' }}>Create Target</button>
      )}
      <ExcludeToggle cat={cat} applyData={applyData} />
    </Card>
  );
}

export default function Inspector({ S, env, envAt, month, money, applyData, selected }) {
  const ctx = { S, month, env, envAt };
  const monthName = monthLabel(month).split(' ')[0]; // "August" from "August 2026"
  const activeCats = useMemo(
    () => (S.categories || []).filter(c => c.type === 'expense' && c.status === 'active'),
    [S.categories],
  );
  // Ordered by catalog (activeCats/S.categories) order, not Set-insertion
  // order — an approximation of table order (which is group sortOrder then
  // category sortOrder), which isn't cheaply available here.
  const ordered = activeCats.filter(c => selected.has(c.id)).map(c => c.id);

  if (selected.size === 0) {
    const allIds = activeCats.map(c => c.id);
    return (
      <div className="plan-inspector">
        <Card title={monthName + "'s Summary"}>
          <SummaryLines sum={selectionSummary(env, allIds)} money={money} monthName={monthName} />
          {costToBeMe(activeCats) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
              <span>Cost to Be Me</span><span className="tnum">{money(costToBeMe(activeCats))}</span>
            </div>
          )}
        </Card>
        <Card title="Auto-Assign">
          <AutoAssignRows kinds={['underfunded', ...SIX_KINDS]} catIds={allIds} ctx={ctx} money={money} applyData={applyData} plural />
        </Card>
      </div>
    );
  }

  if (selected.size === 1) {
    const cat = activeCats.find(c => c.id === ordered[0]);
    if (!cat) return null;
    const row = env.rows.get(cat.id) || { assigned: 0, activity: 0, available: 0, carryIn: 0 };
    return (
      <div className="plan-inspector">
        <div style={{ fontSize: 15, fontWeight: 700, padding: '2px 2px 0' }}>{cat.name}</div>
        <AvailableCard row={row} money={money} />
        <TargetCard key={'target-' + cat.id} cat={cat} row={row} money={money} applyData={applyData} />
        <Card title="Auto-Assign">
          <AutoAssignRows kinds={['underfunded', ...SIX_KINDS]} catIds={[cat.id]} ctx={ctx} money={money} applyData={applyData} />
        </Card>
        <NotesCard key={cat.id} cat={cat} applyData={applyData} />
      </div>
    );
  }

  const names = ordered.map(id => (activeCats.find(c => c.id === id) || {}).name).filter(Boolean);
  return (
    <div className="plan-inspector">
      <div style={{ padding: '2px 2px 0' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{selected.size} Categories Selected</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names.join(', ')}</div>
      </div>
      <Card title={monthName + "'s Summary"}>
        <SummaryLines sum={selectionSummary(env, ordered)} money={money} monthName={monthName} />
      </Card>
      <Card title="Auto-Assign">
        <AutoAssignRows kinds={['underfunded', ...SIX_KINDS]} catIds={ordered} ctx={ctx} money={money} applyData={applyData} plural />
      </Card>
    </div>
  );
}
