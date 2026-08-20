// Thin tokened re-exports over Base UI's Combobox parts. Consumers compose
// Root/Input themselves (a combobox's controlled state is the consumer's
// business); this file only owns the look of the floating list.
//
// Verified against node_modules/@base-ui/react/combobox's type defs
// (ComboboxRoot.d.ts, ComboboxItem.d.ts, AriaCombobox.d.ts et al.): Root
// takes items/value/onValueChange/inputValue/onInputValueChange/filter as
// documented, and Combobox.Input's own `value`/`onChange` props are the
// supported escape hatch — Base UI's mergeProps gives the consumer's own
// props precedence over the parts' internally-computed ones (rightmost
// wins; see node_modules/@base-ui/react/merge-props/mergeProps.js), so a
// consumer-controlled `value` on Input is a first-class pattern, not a
// hack. That is what PayeeCell relies on to show "closed" text (a
// committed payee or a transfer's To/From label) that differs from the
// live query. `filter={null}` on Root disables Base UI's internal
// filtering — PayeeCell already filtered via payeeSections(query).
import { Combobox as BaseCombobox } from '@base-ui/react/combobox';

export const Combobox = BaseCombobox;

const popupStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: 'var(--shadow)', padding: 6, color: 'var(--text)', boxSizing: 'border-box',
  maxHeight: 300, overflowY: 'auto', outline: 'none', width: 'var(--anchor-width)',
};

export function ComboboxPanel({ children, footer }) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner sideOffset={4} style={{ zIndex: 45 }}>
        <BaseCombobox.Popup style={popupStyle}
          onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>
          <BaseCombobox.List>{children}</BaseCombobox.List>
          {footer}
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  );
}

export function ComboboxGroupLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 8px 2px' }}>{children}</div>;
}

export function ComboboxItem({ value, children, indent }) {
  return (
    <BaseCombobox.Item value={value} className="hv-elev"
      style={{ padding: '5px 8px', paddingLeft: indent ? 22 : 8, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
      {children}
    </BaseCombobox.Item>
  );
}
