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

// The warm "categorize me" pill shown in a category cell when a categorizable
// transaction has none (txRowOf.needsCategory). One component so the desktop
// table, phone rows and dashboard recents render the identical pill.
// With `onClick` it renders as a real button (the CTA: open the category
// picker for this row); without, a plain pill for hosts that wire the tap
// elsewhere (the phone row chip). stopPropagation lives here so hosts whose
// rows are themselves click targets (select-toggle, edit) don't also fire.
export function NeedsCategoryPill({ fontSize = 12, onClick }) {
  const look = { ...chip('var(--warn-soft)', 'var(--text)'), fontSize, fontWeight: 500 };
  if (!onClick) {
    return (
      <span
        title="Assign a category to this transaction so you'll know what you spent your money on."
        aria-label="This needs a category. Assign a category to this transaction so you'll know what you spent your money on."
        style={look}
      >
        This needs a category
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title="Assign a category to this transaction so you'll know what you spent your money on."
      aria-label="This needs a category — assign one now"
      className="hv-soft"
      style={{ ...look, cursor: 'pointer', font: 'inherit' }}
    >
      This needs a category
    </button>
  );
}

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
      {meta && t.split && <span title={t.splitLabel} style={chip('var(--elev)', 'var(--muted)')}>Split</span>}
    </>
  );
}
