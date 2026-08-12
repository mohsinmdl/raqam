// Phone presentation of the Spending register (≤700px) — YNAB anatomy: day
// section headers, payee/amount line, category chip + account line, optional
// memo line. Same data pipeline as the desktop table. Spec:
// docs/superpowers/specs/2026-08-12-mobile-tabbar-ynab-spending-design.md
// View mode: tap opens the editor (onRowTap/onSchedTap). Select mode: tap
// toggles membership; circles render on the left. Amounts arrive
// pre-formatted (amtLabel/amtColor).
import TxChips from '../ui/TxChips.jsx';
import { schedNote } from '../lib/txRow.js';

const chipStyle = (bg, fg) => ({
  fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
  background: bg, color: fg, border: '1px solid var(--border)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  display: 'inline-flex', alignItems: 'center', maxWidth: '100%',
});

// Selection circle: outlined when off, accent + check when on (YNAB).
function Circle({ on }) {
  return (
    <span aria-hidden="true" style={{
      width: 22, height: 22, borderRadius: 999, flex: 'none',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: on ? 'none' : '2px solid var(--muted)',
      background: on ? 'var(--accent)' : 'transparent',
      color: 'var(--on-accent)', fontSize: 12, fontWeight: 700,
    }}>{on ? '✓' : ''}</span>
  );
}

function PhoneRow({ t, selId, checked, selectMode, onToggle, onTap, scheduled, hideAccount, last, needsCat }) {
  const payee = t.merchant || 'No Payee Set';
  const catChip = needsCat
    ? <span style={chipStyle('var(--warn-soft)', 'var(--text)')}>Category Needed</span>
    : t.catName
      ? <span style={chipStyle('var(--soft)', 'var(--text)')}>{t.catName}</span>
      : null;
  return (
    <button
      onClick={() => (selectMode ? onToggle(selId, !checked) : onTap && onTap())}
      aria-pressed={selectMode ? checked : undefined}
      aria-label={(selectMode ? 'Select ' : 'Edit ') + payee + ' on ' + t.dateLabel + ', ' + t.amtLabel}
      className={checked ? undefined : 'hv-elev'}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56,
        padding: '8px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
        color: 'var(--text)', font: 'inherit',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: checked ? 'var(--soft)'
          : scheduled ? 'color-mix(in srgb, var(--warn-soft) 40%, var(--surface))' : 'none',
      }}
    >
      {selectMode && <Circle on={checked} />}
      <span style={{ minWidth: 0, flex: 1, opacity: t.rowOpacity }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{payee}</span>
          <span className="tnum" style={{ fontSize: 14.5, fontWeight: 600, color: t.amtColor, whiteSpace: 'nowrap', flex: 'none' }}>{t.amtLabel}</span>
          {!scheduled && t.stGlyph && (
            <span role="img" aria-label={t.stLabel} title={t.stTitle || t.stLabel}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 999, boxSizing: 'border-box',
                background: t.stOutline ? 'transparent' : t.stColor,
                color: t.stOutline ? t.stColor : t.stOn,
                border: t.stOutline ? ('1.25px solid ' + t.stColor) : 'none',
                fontSize: 9, fontWeight: 700, lineHeight: 1, flex: 'none' }}
            >{t.stGlyph}</span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden' }}>
            {catChip}
            <TxChips row={t} />
          </span>
          {!hideAccount && t.acctLabel && (
            <span style={{ flex: 'none', fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.acctLabel}</span>
          )}
        </span>
        {t.hasNotes && (
          <span style={{ display: 'block', fontSize: 11.5, marginTop: 3, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes}</span>
        )}
      </span>
    </button>
  );
}

function DayHeader({ label }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 2, padding: '10px 16px 6px',
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
      fontSize: 13, fontWeight: 700,
    }}>{label}</div>
  );
}

export default function TxPhoneList({
  groups, postedRows, scheduled, schedKey, schedOpen, onToggleSchedOpen,
  overdueCount, hiddenRuleCount, hideAccount, needsCat,
  selectMode, selected, schedSel, onToggleRow, onToggleSched, onRowTap, onSchedTap,
}) {
  const note = schedNote(overdueCount, hiddenRuleCount);
  const rowProps = t => ({
    t, selId: t.id, hideAccount, selectMode,
    needsCat: needsCat.has(t.id),
    checked: selected.has(t.id), onToggle: onToggleRow,
    onTap: () => onRowTap(t),
  });
  return (
    <div>
      {scheduled.length > 0 && (
        <>
          <button
            onClick={onToggleSchedOpen} aria-expanded={schedOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '8px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
          >
            <span aria-hidden="true" style={{ fontSize: 12, color: 'var(--muted)', width: 12, transform: schedOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>›</span>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>Scheduled</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{scheduled.length} · {note}</span>
          </button>
          {schedOpen && scheduled.map((x, i) => {
            const key = schedKey(x);
            return (
              <PhoneRow
                key={key} t={x.row} selId={key} scheduled hideAccount={hideAccount}
                selectMode={selectMode} needsCat={false}
                checked={schedSel.has(key)} onToggle={onToggleSched}
                onTap={() => onSchedTap(x)}
                last={false}
              />
            );
          })}
        </>
      )}
      {groups
        ? groups.map(g => (
            <section key={g.key} aria-label={g.label}>
              <DayHeader label={g.label} />
              {g.rows.map((t, i) => (
                <PhoneRow key={t.id} {...rowProps(t)} last={i === g.rows.length - 1} />
              ))}
            </section>
          ))
        : postedRows.map((t, i) => (
            <PhoneRow key={t.id} {...rowProps(t)} last={i === postedRows.length - 1} />
          ))}
    </div>
  );
}
