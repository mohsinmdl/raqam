// A subtle "excluded from budget" marker shown next to a category name wherever
// a category is listed (Plan rows, pickers, reports). Renders nothing unless
// `excluded` is true, so callers can drop it in unconditionally:
//   <ExcludedTag excluded={cat.excludeFromBudget} />
// Muted and small on purpose — it flags the category without competing with the
// name. The <title> makes it a real tooltip and gives screen readers the reason.
import { ExcludedIcon } from './icons.jsx';

export default function ExcludedTag({ excluded, size = 12, style }) {
  if (!excluded) return null;
  return (
    <span style={{ flex: 'none', display: 'inline-flex', color: 'var(--muted)', opacity: 0.75, ...style }}>
      <ExcludedIcon size={size} title="Excluded from budget" />
    </span>
  );
}
