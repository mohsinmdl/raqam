// Phone presentation of the transactions register (≤700px) — same data
// pipeline as the desktop table, different markup. Spec:
// docs/superpowers/specs/2026-08-12-mobile-transactions-design.md
// Tap toggles selection (additive, like the desktop checkbox); actions stay
// in the existing BulkBar. Amounts arrive pre-formatted (amtLabel/amtColor).
import TxChips from '../ui/TxChips.jsx';

function PhoneRow({ t, selId, checked, onToggle, scheduled, hideAccount, last }) {
  const sub = [t.dateLabel, t.catName, !hideAccount && t.acctLabel].filter(Boolean).join(' · ');
  return (
    <button
      onClick={() => onToggle(selId, !checked)}
      aria-pressed={checked}
      className={checked ? undefined : 'hv-elev'}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48,
        padding: '6px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
        color: 'var(--text)', font: 'inherit',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: checked ? 'var(--soft)'
          : scheduled ? 'color-mix(in srgb, var(--warn-soft) 40%, var(--surface))' : 'none',
      }}
    >
      <span style={{ minWidth: 0, flex: 1, opacity: t.rowOpacity }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.merchant}</span>
          <TxChips row={t} meta />
        </span>
        <span style={{ display: 'block', fontSize: 11.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: t.isOverdue ? 'var(--neg)' : 'var(--muted)' }}>{sub}</span>
      </span>
      <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: t.amtColor, whiteSpace: 'nowrap', flex: 'none', opacity: t.rowOpacity }}>{t.amtLabel}</span>
      {!scheduled && t.stGlyph && (
        <span
          role="img" aria-label={t.stLabel} title={t.stTitle || t.stLabel}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 999, boxSizing: 'border-box',
            background: t.stOutline ? 'transparent' : t.stColor,
            color: t.stOutline ? t.stColor : t.stOn,
            border: t.stOutline ? ('1.25px solid ' + t.stColor) : 'none',
            fontSize: 9, fontWeight: 700, lineHeight: 1, flex: 'none', opacity: t.rowOpacity }}
        >{t.stGlyph}</span>
      )}
    </button>
  );
}

export default function TxPhoneList({
  postedRows, scheduled, schedKey, selected, schedSel,
  onToggleRow, onToggleSched, schedOpen, onToggleSchedOpen,
  overdueCount, hiddenRuleCount, hideAccount,
}) {
  const grouped = scheduled.length > 0;
  const note = [
    overdueCount > 0 ? overdueCount + ' overdue' : 'not yet spent',
    hiddenRuleCount > 0 ? hiddenRuleCount + ' more later' : null,
  ].filter(Boolean).join(' · ');
  return (
    <div>
      {grouped && (
        <>
          <button
            onClick={onToggleSchedOpen} aria-expanded={schedOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '8px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--warn-soft)', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
          >
            <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--muted)', width: 10 }}>{schedOpen ? '▾' : '▸'}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em' }}>SCHEDULED</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{scheduled.length + (scheduled.length === 1 ? ' item' : ' items')} · {note}</span>
          </button>
          {schedOpen && scheduled.map((x, i) => {
            const key = schedKey(x);
            return (
              <PhoneRow
                key={key} t={x.row} selId={key} scheduled hideAccount={hideAccount}
                checked={schedSel.has(key)} onToggle={onToggleSched}
                last={postedRows.length === 0 && i === scheduled.length - 1}
              />
            );
          })}
          {postedRows.length > 0 && (
            <div aria-hidden="true" style={{ height: '.3125rem', background: 'var(--warn-soft)', borderBottom: '1px solid var(--border)' }} />
          )}
        </>
      )}
      {postedRows.map((t, i) => (
        <PhoneRow
          key={t.id} t={t} selId={t.id} hideAccount={hideAccount}
          checked={selected.has(t.id)} onToggle={onToggleRow}
          last={i === postedRows.length - 1}
        />
      ))}
    </div>
  );
}
