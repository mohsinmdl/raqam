// U1 auto-categorize — the 0–2 AI category chips shown beside a needs-category
// pill (US-5/US-6). Presentational: the parent surface owns the batch/cache and
// passes down the ALREADY-VALIDATED suggestions plus an onApply that calls the
// existing categorize handler. Renders nothing when there are no suggestions, so
// with AI off / low-history / a failed batch the host pill is byte-identical to
// pre-AI (US-1/US-3). A chip carries only { categoryId, confidence }; the name is
// resolved here from the active plan.
//
// A chip is a small button. On phone (`compact`) the enclosing row is itself a
// <button>, so a nested <button> would be invalid markup — there the chip is a
// pointer-only <span> that stopPropagation's, exactly as TxPhoneList's catChip
// does; keyboard users reach the same assignment through the row's editor.
import { useStore } from '../../store/StoreProvider.jsx';

const chipLook = {
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
  background: 'var(--soft)', color: 'var(--accent)', border: '1px solid var(--border)',
  flex: 'none', whiteSpace: 'nowrap', cursor: 'pointer', font: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
};

export default function SuggestionChips({ suggestions, onApply, compact }) {
  const { data: S } = useStore();
  if (!suggestions || !suggestions.length) return null; // gate: nothing without suggestions

  const chips = suggestions.map(s => {
    const cat = (S.categories || []).find(c => c.id === s.categoryId);
    if (!cat) return null; // guarded again at render — a category can vanish between fetch and paint
    const label = cat.name;
    const title = 'Suggested: categorize as ' + label;
    const common = {
      key: s.categoryId,
      'data-testid': 'suggestion-chip',
      'data-suggestion-cat': s.categoryId,
      title,
      'aria-label': title,
      style: chipLook,
    };
    if (compact) {
      // Pointer-only span (row is a button). No keyboard focus — the row editor
      // is the keyboard path, matching catChip.
      return (
        <span
          {...common}
          role="button"
          onClick={e => { e.stopPropagation(); onApply(s.categoryId); }}
        >{label}</span>
      );
    }
    return (
      <button
        {...common}
        type="button"
        className="hv-soft rq-btn-outline"
        onClick={e => { e.stopPropagation(); onApply(s.categoryId); }}
      >{label}</button>
    );
  }).filter(Boolean);

  if (!chips.length) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {chips}
    </span>
  );
}
