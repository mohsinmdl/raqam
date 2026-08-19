// Generic searchable multi-select filter — a checkbox tree behind a pill
// button, popover on desktop and bottom sheet on phone. Built for the Reflect
// report filter bar (Categories / Accounts pills), but the contract is
// generic: `sections = [{id, name, items: [{id, name, icon?, color?}]}]`. A
// section with `id: null` renders its items at the root with no header — the
// "Uncategorized Transactions" root row in the categories filter.
//
// `selected` is `null | Set<itemId>` — null means "everything", matching how
// the report engine (spendingReport.js) treats an absent filter. The component stages
// edits in local state and only calls `onApply` on Done; Cancel or an
// outside dismiss (Escape / click-away) discards the staged Set entirely,
// since the popover/sheet just closes without a commit. Selecting every item
// re-normalizes back to `null` on Done, so a caller can `!== null` check to
// know whether the filter is actually narrowing anything.
import { useMemo, useState } from 'react';
import { useIsPhone } from '../../lib/useIsPhone.js';
import { iconStyle } from '../../lib/catIcon.js';
import Checkbox from '../Checkbox.jsx';
import SearchField from '../SearchField.jsx';
import { Popover, PopoverTrigger, PopoverPanel } from '../primitives/Popover.jsx';
import { BottomSheet, BottomSheetTrigger, BottomSheetPanel } from '../primitives/BottomSheet.jsx';

const pillStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px',
  border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)',
  color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

const textBtnStyle = {
  border: 'none', background: 'none', padding: 0, color: 'var(--accent)',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  // Without these the flex footer shrinks them until "Select None" breaks
  // across two lines next to the Cancel/Done pills.
  whiteSpace: 'nowrap', flex: 'none',
};

const softPillStyle = {
  height: 30, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 999,
  background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

const accentPillStyle = {
  height: 30, padding: '0 14px', border: 'none', borderRadius: 999,
  background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

function ItemRow({ item, checked, onToggle, indent }) {
  return (
    <div
      onClick={() => onToggle(!checked)}
      className="hv-elev"
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', marginLeft: indent, borderRadius: 6, cursor: 'pointer',
      }}
    >
      <Checkbox checked={checked} onChange={onToggle} label={item.name} />
      {item.icon && <span aria-hidden="true" style={iconStyle(item.icon, item.color, 12)} />}
      <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.name}
      </span>
    </div>
  );
}

function SectionHeaderRow({ section, checked, indeterminate, onToggle }) {
  return (
    <div
      onClick={() => onToggle(!checked)}
      className="hv-elev"
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
      }}
    >
      <Checkbox checked={checked} indeterminate={indeterminate} onChange={onToggle} label={section.name} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.2px' }}>
        {section.name}
      </span>
    </div>
  );
}

export default function FilterMultiSelect({ pillLabel, searchPlaceholder, sections, selected, onApply }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const allIds = useMemo(() => new Set(sections.flatMap(s => s.items.map(i => i.id))), [sections]);
  const [staged, setStaged] = useState(() => new Set(allIds));

  const reset = () => { setStaged(selected ? new Set(selected) : new Set(allIds)); setQ(''); };
  const handleOpenChange = o => { if (o) reset(); setOpen(o); };

  const toggle = (ids, on) => setStaged(prev => {
    const next = new Set(prev);
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    return next;
  });

  const done = () => { onApply(staged.size === allIds.size ? null : new Set(staged)); setOpen(false); };
  const cancel = () => setOpen(false);
  const selectAll = () => toggle(allIds, true);
  const selectNone = () => toggle(allIds, false);

  const query = q.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!query) return sections;
    return sections
      .map(sec => ({ ...sec, items: sec.items.filter(i => i.name.toLowerCase().includes(query)) }))
      .filter(sec => sec.items.length > 0);
  }, [sections, query]);

  const list = (
    <>
      {filteredSections.map(sec => {
        const ids = sec.items.map(i => i.id);
        const checkedCount = ids.filter(id => staged.has(id)).length;
        const allChecked = ids.length > 0 && checkedCount === ids.length;
        const some = checkedCount > 0 && checkedCount < ids.length;
        return (
          <div key={sec.id === null ? '__root' : sec.id} style={{ marginBottom: 2 }}>
            {sec.id !== null && (
              <SectionHeaderRow
                section={sec} checked={allChecked} indeterminate={some}
                onToggle={on => toggle(ids, on)}
              />
            )}
            {sec.items.map(item => (
              <ItemRow
                key={item.id} item={item} checked={staged.has(item.id)}
                onToggle={on => toggle([item.id], on)}
                indent={sec.id === null ? 0 : 26}
              />
            ))}
          </div>
        );
      })}
      {filteredSections.length === 0 && (
        <p style={{ margin: '16px 12px', fontSize: 13, color: 'var(--muted)' }}>No matches for “{q}”.</p>
      )}
    </>
  );

  const footer = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: 10,
      borderTop: '1px solid var(--border)', background: 'var(--surface)',
      ...(phone ? { position: 'sticky', bottom: 0 } : {}),
    }}>
      <button type="button" onClick={selectAll} style={textBtnStyle}>Select All</button>
      <span aria-hidden="true" style={{ color: 'var(--border)', fontSize: 12.5 }}>·</span>
      <button type="button" onClick={selectNone} style={textBtnStyle}>Select None</button>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={cancel} className="hv-soft" style={softPillStyle}>Cancel</button>
      <button type="button" onClick={done} className="hv-accent" style={accentPillStyle}>Done</button>
    </div>
  );

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
        <SearchField value={q} onChange={setQ} placeholder={searchPlaceholder} label={searchPlaceholder} />
      </div>
      <div style={{ overflowY: 'auto', maxHeight: phone ? undefined : 420, padding: '6px 4px' }}>
        {list}
      </div>
      {footer}
    </div>
  );

  const trigger = <>{pillLabel}<span aria-hidden="true" style={{ fontSize: 9, color: 'var(--muted)' }}>▾</span></>;

  if (phone) {
    return (
      <BottomSheet open={open} onOpenChange={handleOpenChange}>
        <BottomSheetTrigger className="hv-soft" style={pillStyle}>{trigger}</BottomSheetTrigger>
        <BottomSheetPanel label={pillLabel}>{body}</BottomSheetPanel>
      </BottomSheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger className="hv-soft" style={pillStyle}>{trigger}</PopoverTrigger>
      {/* 380, not 340: the footer's four controls (Select All · Select None,
          Cancel, Done) do not fit on one line at 340. */}
      <PopoverPanel width={380} style={{ padding: 0, overflow: 'hidden' }} aria-label={pillLabel}>
        {body}
      </PopoverPanel>
    </Popover>
  );
}
