import { useMemo } from 'react';
import { sortGroups, sortCats } from '../../../lib/categoryOrder.js';
import MaskPositionEye from '../../MaskPositionEye.jsx';

// Phone render path for the Plan screen — YNAB's mobile anatomy in ledger
// tokens. Read-only skeleton in PR1: taps are wired by the keypad (PR2) and
// sheets (PR3) layers via the on*Tap props.
const hair = '1px solid var(--border)';
const colHead = { fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 };

// Derives the flat list the phone screen renders. Mirrors desktop `sections`
// (Plan.jsx sections memo) exactly: groups sorted by (sortOrder || 0) with a
// name tiebreak, each group's categories sorted the same way, and a dangling
// groupId (group deleted, or never set) re-bucketed into the same synthetic
// 'other' key desktop uses — so Collapse-all and other cross-referencing code
// can compare phone/desktop group keys directly.
export function phoneRowsFor(S, env, collapsed) {
  const groups = sortGroups(S.categoryGroups);
  const cats = (S.categories || []).filter(c => c.type === 'expense');
  const active = cats.filter(c => c.status === 'active');
  const hiddenCount = cats.filter(c => c.status === 'archived').length;
  const out = [];
  const overspent = [];
  const bucket = gid => sortCats(active.filter(c => (c.groupId || null) === gid));
  const emit = (key, name, members) => {
    if (!members.length) return;
    let assigned = 0, available = 0;
    const rows = members.map(cat => {
      const row = env.rows.get(cat.id) || { assigned: 0, activity: 0, available: 0 };
      assigned += row.assigned; available += row.available;
      if (row.available < 0) overspent.push({ cat, row });
      return { kind: 'cat', cat, row };
    });
    out.push({ kind: 'group', key, name, assigned, available, collapsed: collapsed.has(key) });
    if (!collapsed.has(key)) out.push(...rows);
  };
  const ids = new Set(groups.map(g => g.id));
  groups.forEach(g => emit(g.id, g.name, bucket(g.id)));
  const other = sortCats(active.filter(c => !c.groupId || !ids.has(c.groupId)));
  emit('other', 'Other', other);
  return { list: out, hiddenCount, overspent };
}

// The distinct group keys the phone list currently renders (in list order),
// used by the overflow menu's Collapse/Expand-all so it operates on what's
// actually on screen rather than the desktop view-pill's filtered key set.
export function phoneGroupKeysFor(S, env, collapsed) {
  return [...new Set(phoneRowsFor(S, env, collapsed).list.filter(i => i.kind === 'group').map(i => i.key))];
}

const pillTone = v => v > 0 ? { background: 'var(--pos-soft)', color: 'var(--pos)' }
  : v < 0 ? { background: 'var(--neg-soft)', color: 'var(--neg)' }
  : { background: 'var(--track)', color: 'var(--muted)' };

export default function PlanPhone({
  S, env, month, money, moneyPos, collapsed, toggleGroup,
  onAssignTap = () => {}, onPillTap = () => {}, onRtaTap = null, onCoverTap = null,
  onHiddenTap = null,
  assignDraft = null, // { catId, text } while the keypad edits a row (PR2)
}) {
  const { list, hiddenCount, overspent } = useMemo(
    () => phoneRowsFor(S, env, collapsed), [S, env, collapsed]);
  const rtaNeg = env.rta < 0;
  return (
    <div style={{ padding: '10px 12px 0' }}>
      {/* RTA banner — tap opens the Assign sheet (PR3). Until wired it is a
          static region, so render a div, not a dead button. */}
      {(() => {
        const Tag = onRtaTap ? 'button' : 'div';
        // The big RTA follows `maskedPosition` (moneyPos), shared with the
        // Dashboard hero. The eye sits beside the banner, not inside it — the
        // banner can be a <button> (when onRtaTap makes it tappable), so a
        // nested button would be invalid.
        return (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 10 }}>
            <Tag onClick={onRtaTap || undefined}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                flex: 1, border: 'none', borderRadius: 12, padding: '14px 16px',
                cursor: onRtaTap ? 'pointer' : 'default', textAlign: 'left',
                background: rtaNeg ? 'var(--neg-soft)' : 'var(--pos-soft)',
                color: rtaNeg ? 'var(--neg)' : 'var(--pos)' }}>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 700 }}>{moneyPos(env.rta)}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Ready to Assign{onRtaTap ? ' ›' : ''}</span>
            </Tag>
            <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
              <MaskPositionEye label="Ready to Assign" size={40} iconSize={18} />
            </div>
          </div>
        );
      })()}
      {overspent.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: hair, borderRadius: 12,
          padding: '10px 12px', marginBottom: 10, background: 'var(--surface)' }}>
          <span className="tnum" style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 999, background: 'var(--neg)', color: 'var(--on-neg)', fontSize: 12, fontWeight: 700 }}>
            {overspent.length}
          </span>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>Overspent categories</span>
          {onCoverTap && (
            <button onClick={onCoverTap} className="hv-soft" style={{ border: 'none', borderRadius: 999,
              padding: '6px 14px', background: 'var(--soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Cover
            </button>
          )}
        </div>
      )}
      <div style={{ background: 'var(--surface)', border: hair, borderRadius: 12, overflow: 'hidden' }}>
        {list.map(item => item.kind === 'group' ? (
          <button key={'g' + item.key} onClick={() => toggleGroup(item.key)}
            aria-expanded={String(!item.collapsed)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none',
              borderBottom: hair, textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
              background: 'var(--track)', color: 'var(--text)' }}>
            <span aria-hidden="true" style={{ flex: 'none', fontSize: 11, color: 'var(--muted)',
              transform: item.collapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
            <span style={{ textAlign: 'right' }}>
              <span style={colHead}>Assigned</span>
              <span className="tnum" style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{money(item.assigned)}</span>
            </span>
            <span style={{ textAlign: 'right', minWidth: 84 }}>
              <span style={colHead}>Available</span>
              <span className="tnum" style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{money(item.available)}</span>
            </span>
          </button>
        ) : (
          <div key={item.cat.id} data-cat={item.cat.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '4px 12px',
              borderBottom: hair,
              background: assignDraft && assignDraft.catId === item.cat.id ? 'var(--soft)' : 'transparent' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.cat.name}
            </span>
            {(() => {
              const isDraft = !!(assignDraft && assignDraft.catId === item.cat.id);
              return (
                <button className="tnum" onClick={() => onAssignTap(item.cat, item.row)}
                  aria-label={'Assigned for ' + item.cat.name + ': ' + (isDraft ? assignDraft.text : money(item.row.assigned))}
                  style={{ border: 'none', background: 'transparent', padding: '10px 4px', cursor: 'pointer',
                    fontSize: 14.5, fontWeight: 600,
                    color: isDraft ? 'var(--accent)' : 'var(--text)' }}>
                  <span aria-live="polite">{isDraft ? assignDraft.text : money(item.row.assigned)}</span>
                </button>
              );
            })()}
            <button className="tnum" onClick={() => onPillTap(item.cat, item.row)}
              disabled={item.row.available === 0}
              aria-label={'Available for ' + item.cat.name + ': ' + money(item.row.available)}
              style={{ flex: 'none', minWidth: 76, textAlign: 'center', border: 'none', borderRadius: 999,
                padding: '6px 10px', fontSize: 13.5, fontWeight: 700,
                cursor: item.row.available !== 0 ? 'pointer' : 'default', ...pillTone(item.row.available) }}>
              {money(item.row.available)}
            </button>
          </div>
        ))}
        {hiddenCount > 0 && (
          onHiddenTap ? (
            <button onClick={onHiddenTap} className="hv-soft"
              style={{ display: 'block', width: '100%', border: 'none', background: 'transparent',
                textAlign: 'left', padding: '12px', fontSize: 13.5, color: 'var(--muted)', cursor: 'pointer' }}>
              <span className="tnum">{hiddenCount}</span> hidden {hiddenCount === 1 ? 'category' : 'categories'} ›
            </button>
          ) : (
            <div style={{ padding: '12px', fontSize: 13.5, color: 'var(--muted)' }}>
              <span className="tnum">{hiddenCount}</span> hidden {hiddenCount === 1 ? 'category' : 'categories'}
            </div>
          )
        )}
      </div>
    </div>
  );
}
