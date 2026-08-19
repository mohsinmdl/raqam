// Reflect reports' filter bar: a date-range preset pill (‹ / › stepping, a
// YNAB-ordered preset menu) plus the Categories and Accounts FilterMultiSelect
// pills. Pure presentation over the range/selection state the caller
// (SpendingBreakdown) owns — every change goes out through
// onRangeChange/onCatSel/onAcctSel rather than being held locally here.
import { useMemo, useState } from 'react';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { kindLabel } from '../../lib/calc.js';
import { monthsBetween } from '../../lib/dates.js';
import {
  REPORT_PRESETS, presetOf, rangeFor, rangeLabel, shiftRange,
} from '../../lib/dateRange.js';
import { catKeyFn, reportTxns } from '../../lib/spendingReport.js';
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

// The filter list has to cover the same universe the report does, or it
// offers no way to exclude rows the user can see. breakdownByCategory keeps a
// NON-active expense category when it has in-range spend, and reportTxns
// reads every account's transactions regardless of status — so `spentIds`
// (the ids with in-range activity) re-admits exactly those.
//
// The same principle covers the synthetic 'deleted' bucket: it shows up as a
// row, so it needs a checkbox, and it gets one next to Uncategorized whenever
// the range actually contains dangling ids. Both reserved keys then behave
// identically — an explicit Set can include or exclude either.
//
// Root section is the 'Uncategorized Transactions' row; then each category
// group (sortOrder order) with its expense-category members (active first by
// sortOrder, then any archived-with-spend ones); then ungrouped active
// categories under 'Other'; then archived-with-spend categories that have no
// group to sit in, under a final 'Archived'. Empty sections are omitted, so a
// range with no archived spend looks exactly as it did before.
function categorySections(store, spentIds) {
  const rootItems = [{ id: 'uncategorized', name: 'Uncategorized Transactions' }];
  if (spentIds.has('deleted')) rootItems.push({ id: 'deleted', name: 'Deleted category' });
  const root = { id: null, name: '', items: rootItems };
  const cats = (store.categories || []).filter(c => c.type === 'expense'
    && (c.status === 'active' || spentIds.has(c.id)));
  const byOrder = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0);
  const groups = [...(store.categoryGroups || [])].sort(byOrder);
  const groupIds = new Set(groups.map(g => g.id));
  const asItem = c => ({ id: c.id, name: c.name });
  const active = c => c.status === 'active';
  const groupSections = groups
    .map(g => {
      const mine = cats.filter(c => c.groupId === g.id);
      return {
        id: g.id,
        name: g.name,
        items: [...mine.filter(active).sort(byOrder), ...mine.filter(c => !active(c)).sort(byOrder)].map(asItem),
      };
    })
    .filter(s => s.items.length > 0);
  // A groupId pointing at a group that no longer exists is homeless too —
  // breakdownByCategory folds those rows into 'Other' for the same reason.
  const homeless = cats.filter(c => c.groupId == null || !groupIds.has(c.groupId));
  const ungrouped = homeless.filter(active).sort(byOrder).map(asItem);
  const archived = homeless.filter(c => !active(c)).sort(byOrder).map(asItem);
  return [
    root,
    ...groupSections,
    ...(ungrouped.length ? [{ id: 'other', name: 'Other', items: ungrouped }] : []),
    ...(archived.length ? [{ id: 'archived', name: 'Archived', items: archived }] : []),
  ];
}

// Active accounts sectioned by their institution's kind label, in first-seen
// order — same grouping accountGroupsFor() uses for the phone Accounts list —
// then any closed/archived account with in-range activity under a final
// 'Closed' section (the report counts its transactions, so the filter must be
// able to drop them). Omitted when there is no such activity.
function accountSections(store, spentIds) {
  const instById = new Map((store.institutions || []).map(i => [i.id, i]));
  const sections = [];
  const byLabel = new Map();
  const closed = [];
  for (const a of (store.accounts || [])) {
    if (a.status !== 'active') {
      if (spentIds.has(a.id)) closed.push({ id: a.id, name: a.nickname });
      continue;
    }
    const inst = instById.get(a.instId) || null;
    const label = inst ? kindLabel(inst.kind) : 'Other';
    let sec = byLabel.get(label);
    if (!sec) { sec = { id: label, name: label, items: [] }; byLabel.set(label, sec); sections.push(sec); }
    sec.items.push({ id: a.id, name: a.nickname });
  }
  if (closed.length) sections.push({ id: 'closed', name: 'Closed', items: closed });
  return sections;
}

function pillLabelFor(sel, singular, plural) {
  return sel ? sel.size + ' ' + (sel.size === 1 ? singular : plural) : 'All ' + plural;
}

export default function ReportFilterBar({ store, range, onRangeChange, catSel, onCatSel, acctSel, onAcctSel }) {
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(false);

  const width = range.from && range.to ? monthsBetween(range.from, range.to) + 1 : 1;
  // No year gate: that exists for the Transactions filter's year <select>,
  // whose options a stepped-past bound could fall outside of. This bar has no
  // such select, so the arrows disable only when there is nothing to step —
  // 'All dates', where shiftRange returns null.
  const prev = shiftRange(range.from, range.to, -width);
  const next = shiftRange(range.from, range.to, width);
  const activePreset = presetOf(range.from, range.to, undefined, REPORT_PRESETS);
  const label = rangeLabel(range.from, range.to);

  // Which categories/accounts the report actually touches in this range.
  // Deliberately range-only (no catIds/acctIds): narrowing one pill must not
  // shrink the other pill's list, nor its own.
  const spent = useMemo(() => {
    const catKey = catKeyFn(store); // raw ids would miss the 'deleted' bucket entirely
    const cats = new Set(), accts = new Set();
    for (const t of reportTxns(store, { from: range.from, to: range.to })) {
      const k = catKey(t);
      if (k !== 'uncategorized') cats.add(k); // Uncategorized is always offered
      accts.add(t.accountId);
    }
    return { cats, accts };
  }, [store, range.from, range.to]);
  const catSections = useMemo(() => categorySections(store, spent.cats), [store, spent]);
  const acctSections = useMemo(() => accountSections(store, spent.accts), [store, spent]);

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
        sections={catSections}
        selected={catSel}
        onApply={onCatSel}
      />
      <FilterMultiSelect
        pillLabel={pillLabelFor(acctSel, 'Account', 'Accounts')}
        searchPlaceholder="Search accounts"
        sections={acctSections}
        selected={acctSel}
        onApply={onAcctSel}
      />
    </div>
  );
}
