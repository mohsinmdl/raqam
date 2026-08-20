// Tokened wrapper over Base UI's Select — same contract as Popover.jsx: Base
// UI supplies positioning, portal, keyboard nav, typeahead and ARIA; we keep
// "The Trusted Ledger" look. First consumer: the inline editor's account cell.
import { forwardRef } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Chevron } from '../icons.jsx';

const popupStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: 'var(--shadow)', padding: 6, color: 'var(--text)', boxSizing: 'border-box',
  maxHeight: 320, overflowY: 'auto', outline: 'none', minWidth: 'var(--anchor-width)',
};
const ringStyle = { outline: '1px solid var(--neg)', outlineOffset: '-1px' };

export const Select = forwardRef(function Select({ value, onValueChange, ariaLabel, renderValue, disabled, children, triggerStyle, autoFocus, invalid, describedBy }, ref) {
  return (
    <BaseSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <BaseSelect.Trigger ref={ref} autoFocus={autoFocus} aria-label={ariaLabel}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? describedBy : undefined} className="field" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        width: '100%', height: 28, padding: '0 8px', fontSize: 13, cursor: 'pointer',
        ...(invalid ? ringStyle : null), ...triggerStyle,
      }}>
        <BaseSelect.Value style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {renderValue}
        </BaseSelect.Value>
        {/* Drawn, not the ▾ text glyph: the trigger sits beside 1.8px-stroke
            icons everywhere it is used, and a font-rendered arrowhead never
            matched their weight. */}
        <BaseSelect.Icon style={{ color: 'var(--muted)', display: 'inline-flex', flex: 'none' }}><Chevron /></BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} style={{ zIndex: 45 }}>
          {/* Base UI still closes the popup on Escape; stopping propagation
              here just keeps it from also reaching DrawerProvider's session
              listener, same contract as every sibling overlay (Popover). */}
          <BaseSelect.Popup style={popupStyle} onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>{children}</BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
});

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
