// Plan inspector (Phase 3): right-column sidebar reacting to row selection.
// Structure live-captured from YNAB 2026-08-09 (see the phase-3 spec);
// chrome follows Raqam tokens, not YNAB's.
import { useMemo, useState, useRef } from 'react';
import { monthLabel } from '../../lib/calc.js';
import {
  selectionSummary, underfundedFor, autoAssignPlan, autoAssignAmount,
} from '../../lib/inspector.js';
import { moveAssigned, setCategoryNote } from '../../store/actions.js';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const lineRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, padding: '3px 0' };
const tone = v => (v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--muted)');

function Card({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section style={cardStyle}>
      <button onClick={() => setOpen(o => !o)}
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {kinds.map(kind => {
        const amount = autoAssignAmount(kind, catIds, ctx);
        const plan = autoAssignPlan(kind, catIds, ctx);
        const label = KIND_LABELS[kind] + (plural && kind.startsWith('reset') ? 's' : '');
        return (
          <button key={kind} className="hv-soft" disabled={!plan.length}
            onClick={() => applyData(data => plan.reduce((d, mv) => moveAssigned(d, mv), data))}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 32, padding: '0 10px', border: 'none', borderRadius: 8, background: 'var(--elev)', color: 'var(--text)', fontSize: 13, cursor: plan.length ? 'pointer' : 'default', opacity: plan.length ? 1 : .55 }}>
            <span>{label}</span>
            <span className="tnum" style={{ fontWeight: 600 }}>{money(amount)}</span>
          </button>
        );
      })}
    </div>
  );
}

const SIX_KINDS = ['assignedLastMonth', 'spentLastMonth', 'avgAssigned', 'avgSpent', 'resetAvailable', 'resetAssigned'];

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelledRef = useRef(false);
  const start = () => { cancelledRef.current = false; setDraft(cat.description || ''); setEditing(true); };
  const commit = () => { if (cancelledRef.current) { cancelledRef.current = false; return; } applyData(data => setCategoryNote(data, { id: cat.id, note: draft })); setEditing(false); };
  return (
    <Card title="Notes">
      {editing ? (
        <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); cancelledRef.current = true; setEditing(false); }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
          }}
          style={{ width: '100%', minHeight: 64, boxSizing: 'border-box', padding: 8, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
      ) : (
        <p onClick={start} style={{ margin: 0, fontSize: 13, color: cat.description ? 'var(--text)' : 'var(--muted)', cursor: 'text', whiteSpace: 'pre-wrap' }}>
          {cat.description || 'Enter a note...'}
        </p>
      )}
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
  const ids = [...selected];

  if (selected.size === 0) {
    const allIds = activeCats.map(c => c.id);
    return (
      <div className="plan-inspector">
        <Card title={monthName + "'s Summary"}>
          <SummaryLines sum={selectionSummary(env, allIds)} money={money} monthName={monthName} />
        </Card>
        <Card title="Auto-Assign">
          <AutoAssignRows kinds={['underfunded', ...SIX_KINDS]} catIds={allIds} ctx={ctx} money={money} applyData={applyData} plural />
        </Card>
      </div>
    );
  }

  if (selected.size === 1) {
    const cat = activeCats.find(c => c.id === ids[0]);
    if (!cat) return null;
    const row = env.rows.get(cat.id) || { assigned: 0, activity: 0, available: 0, carryIn: 0 };
    return (
      <div className="plan-inspector">
        <div style={{ fontSize: 15, fontWeight: 700, padding: '2px 2px 0' }}>{cat.name}</div>
        <AvailableCard row={row} money={money} />
        <Card title="Auto-Assign">
          <AutoAssignRows kinds={SIX_KINDS} catIds={[cat.id]} ctx={ctx} money={money} applyData={applyData} />
        </Card>
        <NotesCard key={cat.id} cat={cat} applyData={applyData} />
      </div>
    );
  }

  return null; // multi arrives in Task 6
}
