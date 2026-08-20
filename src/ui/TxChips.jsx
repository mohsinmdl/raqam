// The badge cluster on a transaction row: transfer, repeats, edited, excluded.
// Extracted because this markup was duplicated verbatim across Transactions,
// AccountDetail and Dashboard, and every tweak had to be made three times.
import { EditedIcon, ExcludedIcon, RepeatIcon, SplitIcon, TransferIcon } from './icons.jsx';

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
//
// tone='accent' (Wave D) is the SAME control — identical shape, size and
// click target — for a row still holding its post-save completion accent:
// warm amber reads as a problem, which is wrong the instant after a save
// succeeded. Soft-tint background / accent-colored text says "one small
// invitation," not "you made a mistake"; the copy shortens to match ("This
// needs a category" states a problem, "Categorize?" offers an action). Once
// the saved-state ends the caller switches tone back to 'warn' — same id,
// same click handler, no flash.
export function NeedsCategoryPill({ fontSize = 12, onClick, tone = 'warn' }) {
  const accent = tone === 'accent';
  const label = accent ? 'Categorize?' : 'This needs a category';
  const title = accent ? 'Add a category to this transaction.' : "Assign a category to this transaction so you'll know what you spent your money on.";
  const look = { ...chip(accent ? 'var(--soft)' : 'var(--warn-soft)', accent ? 'var(--accent)' : 'var(--text)'), fontSize, fontWeight: 500 };
  if (!onClick) {
    return (
      <span
        title={title}
        aria-label={accent ? title : 'This needs a category. ' + title}
        style={look}
      >
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(e); }}
      title={title}
      aria-label={accent ? 'Categorize this transaction' : 'This needs a category — assign one now'}
      className={accent ? 'hv-elev' : 'hv-soft'}
      style={{ ...look, cursor: 'pointer', font: 'inherit' }}
    >
      {label}
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
      {/* Only the full-width Transactions row shows these (meta); the compact
          account-detail and dashboard rows have always omitted them. Drawn as
          icons rather than text pills so the cluster stays one visual family
          with the transfer/repeat glyphs above and never outgrows the now
          fixed-width PAYEE column — the label lives on the chip's title +
          aria-label, so the meaning is still spoken and on hover. */}
      {meta && t.edited && (
        <span role="img" aria-label={t.editedLabel} title={t.editedLabel} style={chip('var(--elev)', 'var(--muted)')}>
          <EditedIcon size={14} />
        </span>
      )}
      {meta && t.excluded && (
        <span role="img" aria-label={t.excludedLabel} title={t.excludedLabel} style={chip('var(--elev)', 'var(--muted)')}>
          <ExcludedIcon size={14} />
        </span>
      )}
      {meta && t.split && (
        <span role="img" aria-label={t.splitLabel} title={t.splitLabel} style={chip('var(--elev)', 'var(--muted)')}>
          <SplitIcon size={14} />
        </span>
      )}
    </>
  );
}
