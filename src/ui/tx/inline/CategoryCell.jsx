// CATEGORY cell: the existing PlanCategoryPicker combobox (search, groups,
// available amounts, inline ＋New Category) plus the YNAB footer — Split.
// On a transfer row the picker is replaced by a static "Payment/Transfer"
// label (transfers carry no category).
//
// The spec's Payment/Transfer footer button is intentionally NOT reproduced
// here — the payee combobox's "Payments and Transfers" section already
// provides that affordance, and a second path through the category cell
// would need its own account-target picker for no added capability. YAGNI.
import { forwardRef } from 'react';
import { useStore } from '../../../store/StoreProvider.jsx';
import { useMoney } from '../../../lib/format.js';
import { currentMonth, nowIso } from '../../../lib/dates.js';
import { envelopeFor } from '../../../lib/envelope.js';
import PlanCategoryPicker from '../../PlanCategoryPicker.jsx';

const footerBtn = { flex: 1, height: 30, border: 'none', borderRadius: 8, background: 'var(--soft)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };

const CategoryCell = forwardRef(function CategoryCell({ value, onChange, onCreate, onSplit, canSplit, isTransfer, catType, disabled, invalid, errorMsg, errorId }, ref) {
  const { data: S } = useStore();
  const { money } = useMoney();
  const month = currentMonth();
  if (isTransfer) {
    return <span className="field" style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>Payment/Transfer</span>;
  }
  if (disabled) {
    const cat = value ? S.categories.find(c => c.id === value) : null;
    return <span className="field" style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', fontSize: 13, color: 'var(--muted)' }}>{cat ? cat.name : 'category'}</span>;
  }
  const env = envelopeFor(S, month, nowIso());
  return (
    <PlanCategoryPicker
      ref={ref} env={env} S={S} month={month} money={money} size={28}
      catType={catType} showAmounts={catType === 'expense'} excludeRta heading={null}
      allowCreate showSelected placeholder="Category"
      onCreate={onCreate}
      value={value} onChange={onChange}
      invalid={invalid} errorMsg={errorMsg} errorId={errorId || 'txeditor-err-category'}
      footer={canSplit ? (
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={onSplit} className="hv-soft" style={footerBtn}>Split</button>
      ) : null}
    />
  );
});

export default CategoryCell;
