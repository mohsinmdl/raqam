// Tokened wrapper over Base UI's Select — same contract as Popover.jsx: Base
// UI supplies positioning, portal, keyboard nav, typeahead and ARIA; we keep
// "The Trusted Ledger" look. First consumer: the inline editor's account cell.
import { Select as BaseSelect } from '@base-ui/react/select';

const popupStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: 'var(--shadow)', padding: 6, color: 'var(--text)', boxSizing: 'border-box',
  maxHeight: 320, overflowY: 'auto', outline: 'none', minWidth: 'var(--anchor-width)',
};

export function Select({ value, onValueChange, ariaLabel, renderValue, disabled, children, triggerStyle }) {
  return (
    <BaseSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <BaseSelect.Trigger aria-label={ariaLabel} className="field" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        width: '100%', height: 28, padding: '0 8px', fontSize: 13, cursor: 'pointer',
        ...triggerStyle,
      }}>
        <BaseSelect.Value style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {renderValue}
        </BaseSelect.Value>
        <BaseSelect.Icon style={{ color: 'var(--muted)', fontSize: 10, flex: 'none' }}>▾</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} style={{ zIndex: 45 }}>
          <BaseSelect.Popup style={popupStyle}>{children}</BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export function SelectGroup({ label, children }) {
  return (
    <BaseSelect.Group>
      <BaseSelect.GroupLabel style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', padding: '6px 8px 2px' }}>
        {label}
      </BaseSelect.GroupLabel>
      {children}
    </BaseSelect.Group>
  );
}

export function SelectItem({ value, children }) {
  return (
    <BaseSelect.Item value={value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 22px', borderRadius: 6, fontSize: 13, cursor: 'pointer', position: 'relative' }} className="hv-elev">
      <BaseSelect.ItemIndicator style={{ position: 'absolute', left: 6, color: 'var(--accent)' }}>✓</BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
