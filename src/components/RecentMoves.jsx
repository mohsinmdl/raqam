// Recent Moves — what you have changed, grouped by day.
//
// Read-only on purpose: audit rows outlive the things they describe (a delete
// entry names a row that is gone), so a click that sometimes lands nowhere
// would be worse than no click at all. The undo button beside this one is
// where acting happens.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreProvider.jsx';
import { nowIso } from '../lib/dates.js';
import { MOVE_FILTERS, filterMoves, groupMovesByDay, moveCount } from '../lib/moves.js';
import { AUDIT_FETCH_LIMIT } from '../store/sync.js';

// Three bands, not one scrolling box: only the middle scrolls, so the header
// and footer are ordinary siblings the list cannot slide under. A sticky
// footer would have had to fight this panel's own padding for the same edge.
const panelStyle = {
  position: 'absolute', top: 38, right: 0, zIndex: 30, width: 400, maxWidth: '92vw',
  maxHeight: 460, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, boxShadow: 'var(--shadow)',
};
// minHeight 0 is load-bearing: a flex child defaults to min-height auto, which
// refuses to shrink below its content, so overflow never engages and the panel
// grows past maxHeight instead of scrolling.
const listStyle = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 12px' };
const chipStyle = active => ({
  height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer',
  fontSize: 12, fontWeight: 600,
  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
  background: active ? 'var(--accent)' : 'var(--surface)',
  color: active ? 'var(--on-accent)' : 'var(--text)',
});

function MoveRow({ row }) {
  return (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13 }}>{row.summary || row.action}</div>
      <div className="tnum" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
        {row.at.slice(11, 16)}
      </div>
    </div>
  );
}

function DayGroup({ group }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 4px' }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{group.dayLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{group.relLabel}</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {group.rows.map(r => <MoveRow key={r.id} row={r} />)}
      </div>
    </div>
  );
}

export default function RecentMoves() {
  const { data: S } = useStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  // Same dismissal contract as RowMenu, rather than a second one.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const audit = S.audit || [];
  const rows = filterMoves(audit, filter);
  const groups = groupMovesByDay(rows, nowIso());
  const total = moveCount(audit, 'all');

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: 'none' }}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog" aria-expanded={String(open)}
        title="Recent moves"
        className="hv-elev"
        style={{
          height: 32, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Recent moves
      </button>

      {open && (
        <div role="dialog" aria-label="Recent moves" style={panelStyle}>
          {/* Title and chips get their own rows — sharing one row left too
              little width for four chips, so the last wrapped over the title. */}
          <div style={{ flex: 'none', padding: '12px 14px 11px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Recent moves</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {MOVE_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={String(filter === f.id)}
                  className="hv-soft"
                  style={chipStyle(filter === f.id)}
                >
                  {f.label}
                  <span style={{ marginLeft: 5, fontSize: 10.5, fontWeight: 500, opacity: 0.65 }}>
                    {moveCount(audit, f.id)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={listStyle}>
            {groups.map(g => <DayGroup key={g.day} group={g} />)}

            {groups.length === 0 && (
              <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
                {total === 0 ? 'Nothing recorded yet.' : 'No moves match this filter.'}
              </div>
            )}
          </div>

          <div
            style={{
              flex: 'none', background: 'var(--surface)', padding: '9px 14px 11px',
              fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)',
            }}
          >
            {audit.length >= AUDIT_FETCH_LIMIT
              ? `Showing your ${AUDIT_FETCH_LIMIT} most recent changes. Older history is kept but not listed, and undo and redo steps are not listed.`
              : 'Undo and redo steps are not listed.'}
          </div>
        </div>
      )}
    </div>
  );
}
