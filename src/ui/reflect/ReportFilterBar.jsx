// Reflect reports' filter bar: a date-range preset pill (‹ / › stepping, a
// YNAB-ordered preset menu) plus the Categories and Accounts multi-select
// pills from Task 5. Pure presentation over the range/selection state the
// caller (Task 9's report screen) owns — every change goes out through
// onRangeChange/onCatSel/onAcctSel rather than being held locally here.
import { useState } from 'react';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { kindLabel } from '../../lib/calc.js';
import { monthsBetween } from '../../lib/dates.js';
import {
  REPORT_PRESETS, presetOf, rangeFor, rangeLabel, shiftRange, yearOpts,
} from '../../lib/dateRange.js';
import { Menu, MenuTrigger, MenuPanel, MenuItem } from '../primitives/Menu.jsx';
import { BottomSheet, BottomSheetTrigger, BottomSheetPanel, BottomSheetClose } from '../primitives/BottomSheet.jsx';
import FilterMultiSelect from './FilterMultiSelect.jsx';

const groupStyle = {
  display: 'inline-flex', alignItems: 'stretch', height: 32,
  border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', overflow: 'hidden',
};
const arrowBtnStyle = disabled => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30,
  border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
});
const dividerStyle = { width: 1, background: 'var(--border)' };
const labelBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent',
  color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '0 12px', whiteSpace: 'nowrap',
};
const closeStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
  color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
};

function CalendarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

// Root section is the 'Uncategorized Transactions' row; then each category
// group (sortOrder order) with its active expense-category members
// (sortOrder order); then any active expense categories with no group under
// an 'Other' section. Groups/Other with no members are omitted.
function categorySections(store) {
  const root = { id: null, name: '', items: [{ id: 'uncategorized', name: 'Uncategorized Transactions' }] };
  const cats = (store.categories || []).filter(c => c.type === 'expense' && c.status === 'active');
  const byOrder = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0);
  const groups = [...(store.categoryGroups || [])].sort(byOrder);
  const asItem = c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color });
  const groupSections = groups
    .map(g => ({ id: g.id, name: g.name, items: cats.filter(c => c.groupId === g.id).sort(byOrder).map(asItem) }))
    .filter(s => s.items.length > 0);
  const ungrouped = cats.filter(c => c.groupId == null).sort(byOrder).map(asItem);
  const other = ungrouped.length ? [{ id: 'other', name: 'Other', items: ungrouped }] : [];
  return [root, ...groupSections, ...other];
}

// Active accounts sectioned by their institution's kind label, in first-seen
// order — same grouping accountGroupsFor() uses for the phone Accounts list.
function accountSections(store) {
  const instById = new Map((store.institutions || []).map(i => [i.id, i]));
  const sections = [];
  const byLabel = new Map();
  for (const a of (store.accounts || [])) {
    if (a.status !== 'active') continue;
    const inst = instById.get(a.instId) || null;
    const label = inst ? kindLabel(inst.kind) : 'Other';
    let sec = byLabel.get(label);
    if (!sec) { sec = { id: label, name: label, items: [] }; byLabel.set(label, sec); sections.push(sec); }
    sec.items.push({ id: a.id, name: a.nickname });
  }
  return sections;
}

function pillLabelFor(sel, singular, plural) {
  return sel ? sel.size + ' ' + (sel.size === 1 ? singular : plural) : 'All ' + plural;
}

export default function ReportFilterBar({ store, range, onRangeChange, catSel, onCatSel, acctSel, onAcctSel }) {
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);

  const width = range.from && range.to ? monthsBetween(range.from, range.to) + 1 : 1;
  const years = yearOpts(store);
  const prev = shiftRange(range.from, range.to, -width, years);
  const next = shiftRange(range.from, range.to, width, years);
  const activePreset = presetOf(range.from, range.to, undefined, REPORT_PRESETS);
  const label = rangeLabel(range.from, range.to);

  const pickPreset = id => onRangeChange(rangeFor(id));

  const dateLabelBtn = phone ? (
    <BottomSheetTrigger className="hv-soft" style={labelBtnStyle}>
      <CalendarGlyph />{label}
    </BottomSheetTrigger>
  ) : (
    <MenuTrigger className="hv-soft" style={labelBtnStyle}>
      <CalendarGlyph />{label}
    </MenuTrigger>
  );

  const datePill = (
    <div style={groupStyle}>
      <button type="button" onClick={() => prev && onRangeChange(prev)} disabled={!prev}
        aria-label="Previous period" style={arrowBtnStyle(!prev)} className="hv-soft">‹</button>
      <span aria-hidden="true" style={dividerStyle} />
      {phone ? (
        <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
          {dateLabelBtn}
          <BottomSheetPanel label="Date range">
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Date range</span>
                <BottomSheetClose aria-label="Close" className="hv-soft" style={closeStyle}>×</BottomSheetClose>
              </div>
              {REPORT_PRESETS.map(p => (
                <button key={p.id} type="button" className="hv-soft"
                  onClick={() => { pickPreset(p.id); setSheetOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                    border: 'none', background: 'none', borderRadius: 8, padding: '10px 12px',
                    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text)',
                  }}
                >
                  <span style={{ flex: 1 }}>{p.label}</span>
                  {activePreset === p.id && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </BottomSheetPanel>
        </BottomSheet>
      ) : (
        <Menu>
          {dateLabelBtn}
          <MenuPanel aria-label="Date range">
            {REPORT_PRESETS.map(p => (
              <MenuItem key={p.id} onClick={() => pickPreset(p.id)}>
                <span style={{ flex: 1 }}>{p.label}</span>
                {activePreset === p.id && <span aria-hidden="true">✓</span>}
              </MenuItem>
            ))}
          </MenuPanel>
        </Menu>
      )}
      <span aria-hidden="true" style={dividerStyle} />
      <button type="button" onClick={() => next && onRangeChange(next)} disabled={!next}
        aria-label="Next period" style={arrowBtnStyle(!next)} className="hv-soft">›</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {datePill}
      <FilterMultiSelect
        pillLabel={pillLabelFor(catSel, 'Category', 'Categories')}
        searchPlaceholder="Search categories"
        sections={categorySections(store)}
        selected={catSel}
        onApply={onCatSel}
      />
      <FilterMultiSelect
        pillLabel={pillLabelFor(acctSel, 'Account', 'Accounts')}
        searchPlaceholder="Search accounts"
        sections={accountSections(store)}
        selected={acctSel}
        onApply={onAcctSel}
      />
    </div>
  );
}
