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

// The popup is a FLEX COLUMN, not one scroll box: only the List scrolls, and
// the header/footer are non-scrolling siblings. Before this, `footer` sat
// inside the single scrolling element, so PayeeCell's "Manage Payees" link
// fell below the fold as soon as the payee list was long enough to scroll —
// the one action that is not a list item was the one you had to scroll to
// find. minHeight:0 on the List is what lets it shrink inside the flex column
// instead of pushing the footer out of the popup.
const popupStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: 'var(--shadow)', padding: 6, color: 'var(--text)', boxSizing: 'border-box',
  maxHeight: 320, outline: 'none', width: 'var(--anchor-width)',
  display: 'flex', flexDirection: 'column', minHeight: 0,
};
const listStyle = { overflowY: 'auto', minHeight: 0, flex: '0 1 auto' };
const headerStyle = { flex: 'none', paddingBottom: 4, marginBottom: 4, borderBottom: '1px solid var(--border)' };
const footerStyle = { flex: 'none', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--border)' };

// `header` / `footer` are the non-scrolling bands above and below the list.
// `body` REPLACES the list entirely (the category picker's inline "Add
// Category" form, which is not a list of anything). `style` merges into the
// popup for consumers that need a floor on its width.
export function ComboboxPanel({ children, header, body, footer, style }) {
  return (
    <BaseCombobox.Portal>
      {/* data-rq-overlay marks this portalled surface for the app's hand-rolled
          outside-click dismissals (Plan.jsx's usePopoverDismiss): a click in
          here is inside the combobox, even though the DOM says it is nowhere
          near the field. zIndex sits above the modal/sheet band (60) — the
          picker is hosted inside Manage Payees and the phone money sheets —
          but below ConfirmDialog/Tooltip (70). */}
      <BaseCombobox.Positioner sideOffset={4} data-rq-overlay="" style={{ zIndex: 65 }}>
        <BaseCombobox.Popup style={{ ...popupStyle, ...style }}
          onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>
          {header ? <div style={headerStyle}>{header}</div> : null}
          {body || <BaseCombobox.List className="rq-scroll" style={listStyle}>{children}</BaseCombobox.List>}
          {footer ? <div style={footerStyle}>{footer}</div> : null}
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  );
}

export function ComboboxGroupLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 8px 2px' }}>{children}</div>;
}

// rq-combo-item gives the KEYBOARD highlight a visual (theme.css keys off Base
// UI's data-highlighted). hv-elev alone only covers the pointer.
export function ComboboxItem({ value, children, indent }) {
  return (
    <BaseCombobox.Item value={value} className="rq-combo-item hv-elev"
      style={{ padding: '5px 8px', paddingLeft: indent ? 22 : 8, borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
      {children}
    </BaseCombobox.Item>
  );
}
