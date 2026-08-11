// The badge cluster on a transaction row: transfer, repeats, edited, excluded.
// Extracted because this markup was duplicated verbatim across Transactions,
// AccountDetail and Dashboard, and every tweak had to be made three times.
import { RepeatIcon, TransferIcon } from './icons.jsx';

const chip = (bg, fg) => ({
  fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
  background: bg, color: fg, border: '1px solid var(--border)',
  flex: 'none', whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 4,
});

export default function TxChips({ row, meta }) {
  const t = row;
  return (
    <>
      {t.hasChip && (
        <span
          style={chip(t.chipBg, t.chipFg)}
          {...(t.chipIcon ? { role: 'img', 'aria-label': t.chip, title: t.chip } : null)}
        >
          {t.chipIcon === 'transfer' ? <TransferIcon size={14} /> : t.chip}
        </span>
      )}
      {t.isRepeating && (
        <span role="img" aria-label="Part of a recurring rule" title="Part of a recurring rule" style={chip('var(--soft)', 'var(--accent)')}>
          <RepeatIcon size={14} />
        </span>
      )}
      {/* Only the full-width Transactions row has room for these; the compact
          account-detail and dashboard rows have always omitted them. */}
      {meta && t.edited && <span title={t.editedLabel} style={chip('var(--elev)', 'var(--muted)')}>Edited</span>}
      {meta && t.excluded && <span style={chip('var(--elev)', 'var(--muted)')}>{t.excludedLabel}</span>}
      {meta && t.split && <span style={chip('var(--elev)', 'var(--muted)')}>Split</span>}
    </>
  );
}
