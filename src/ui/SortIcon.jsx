// Sort state as an icon. The GLYPH is drawn (src/ui/icons.jsx — a 1.8px-stroke
// sibling of Chevron); this file owns only the state colouring, so the header
// cell keeps a one-prop call site.
//
// Inactive is drawn rather than hidden, so the column's width never changes
// when a sort is applied and the affordance is discoverable before hover. It
// is now --muted at FULL opacity: the old 0.4 opacity put it at 2.43:1 in
// light theme, under any floor, on the exact state that has to be legible
// before the user has interacted with the column. Never the only signal — the
// header also carries aria-sort and a weight change.
import { SortIcon as SortGlyph } from './icons.jsx';

export default function SortIcon({ dir }) {
  const active = dir === 'asc' || dir === 'desc';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 10, flex: 'none', lineHeight: 1,
        color: active ? 'var(--accent)' : 'var(--muted)',
      }}
    >
      <SortGlyph dir={dir} />
    </span>
  );
}
