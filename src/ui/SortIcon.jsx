// Sort state as a glyph. Inactive is drawn at low opacity rather than hidden,
// so the column's width never changes when a sort is applied and the affordance
// is discoverable before hover. Never the only signal: the header also carries
// aria-sort and a weight change.
export default function SortIcon({ dir }) {
  const active = dir === 'asc' || dir === 'desc';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block', width: 10, textAlign: 'center', flex: 'none',
        fontSize: 10, lineHeight: 1,
        color: active ? 'var(--accent)' : 'var(--muted)',
        opacity: active ? 1 : 0.4,
      }}
    >
      {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}
    </span>
  );
}
