// Tokened wrapper over Base UI's Select — same contract as Popover.jsx: Base
// UI supplies positioning, portal, keyboard nav, typeahead and ARIA; we keep
// "The Trusted Ledger" look. First consumer: the inline editor's account cell.
import { forwardRef } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { ScrollArea, ScrollAreaViewport, ScrollAreaContent, ScrollAreaScrollbar } from './ScrollArea.jsx';
import { Chevron } from '../icons.jsx';

// maxHeight + overflow:hidden here is the CARD's hard ceiling; the actual
// scrolling now belongs to ScrollArea/Viewport inside it (a real Base UI
// scrollbar, not the browser's native one — see ScrollArea.jsx). Padding
// moved to ScrollAreaContent so it wraps the scrolled list, not the card.
// One constant, not the popup's number typed three times: the popup is
// box-sizing:border-box with a 1px border, so its CONTENT box is 2px
// shorter than its own maxHeight — the inner ScrollArea/Viewport must match
// that content box, not the outer number, or the popup's `overflow:hidden`
// clips the last ~2px of the list (and the scrollbar track along with it).
const POPUP_MAX_HEIGHT = 320;
const popupStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
  boxShadow: 'var(--shadow)', color: 'var(--text)', boxSizing: 'border-box',
  maxHeight: POPUP_MAX_HEIGHT, overflow: 'hidden', outline: 'none', minWidth: 'var(--anchor-width)',
};
// The popup's content-box ceiling (see POPUP_MAX_HEIGHT above) — height:100%
// would be a no-op here (the popup's own height is auto, not a fixed box),
// so maxHeight is the only constraint doing real work.
const scrollBoxStyle = { maxHeight: POPUP_MAX_HEIGHT - 2 };
const ringStyle = { outline: '1px solid var(--neg)', outlineOffset: '-1px' };

// popupZIndex: the register's inline editor sits under the overlay bands, so
// 45 is the default — but a Select hosted INSIDE a modal (zIndex 60) must
// float its popup above the dialog, same 65 the Combobox panel uses.
export const Select = forwardRef(function Select({ value, onValueChange, ariaLabel, renderValue, disabled, children, triggerStyle, autoFocus, invalid, describedBy, open, onOpenChange, finalFocus, popupZIndex = 45, testId }, ref) {
  return (
    <BaseSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}
      open={open} onOpenChange={onOpenChange}>
      <BaseSelect.Trigger ref={ref} autoFocus={autoFocus} aria-label={ariaLabel} data-testid={testId}
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
        {/* alignItemWithTrigger={false} turns off Base UI's native-macOS-style
            placement, which lifts the popup so the SELECTED item sits over the
            trigger. In a register row that dragged the list up over the rows
            above — the further down the list the current value sat, the
            further the popup climbed — so the same control opened in a
            different place on every row, and on a row near the top it was
            pushed back down and clipped. A plain anchored dropdown below the
            field is what every other picker in this app does. */}
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} style={{ zIndex: popupZIndex }}>
          {/* Base UI still closes the popup on Escape; stopping propagation
              here just keeps it from also reaching DrawerProvider's session
              listener, same contract as every sibling overlay (Popover). */}
          {/* finalFocus: a caller that moves focus ITSELF on close (the inline
              editor's Tab-commit walks to the next cell) passes a function
              returning false so the closing popup doesn't yank focus back to
              the trigger; every other close keeps the default restore. */}
          {/* Base UI Select's own internal scroll math (alignItemWithTrigger,
              scroll-arrow visibility) reads store.state.listElement ?? the
              Popup DOM node as "the scroller" — this Select never renders
              Select.List, so that fallback is the Popup, which no longer
              scrolls (ScrollArea/Viewport does). Harmless today:
              alignItemWithTrigger is off (see below) and no scroll arrow is
              rendered anywhere in this app. Adding either later would need
              Select.List pointed at the Viewport, or that internal math
              silently targets a non-scrolling element. */}
          <BaseSelect.Popup style={popupStyle} finalFocus={finalFocus} onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}>
            <ScrollArea style={scrollBoxStyle}>
              {/* overflowX hidden: this list never needs horizontal scroll
                  (SelectItem truncates instead — see below), so there's no
                  visible affordance to shift a sideways-scrolled Viewport
                  back if one ever appeared. */}
              <ScrollAreaViewport style={{ ...scrollBoxStyle, overflowX: 'hidden' }}>
                {/* paddingRight leaves room for the scrollbar, which floats
                    OVER content (position:absolute, not a layout gutter like
                    a native scrollbar) — without it, an account name long
                    enough to reach the popup's edge renders its last few
                    characters under the thumb. 6 (the padding on every other
                    side) + 11 (.rq-scrollbar's width) + 2 spacing. */}
                <ScrollAreaContent style={{ padding: 6, paddingRight: 19 }}>{children}</ScrollAreaContent>
              </ScrollAreaViewport>
              <ScrollAreaScrollbar />
            </ScrollArea>
          </BaseSelect.Popup>
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
  // data-value mirrors the item's value onto the DOM node so a keydown
  // handler up the tree (the editor row's Tab-commit) can read WHICH item is
  // highlighted from e.target — Base UI Select gives the highlighted item
  // real focus but exposes no onItemHighlighted like Combobox does.
  return (
    <BaseSelect.Item value={value} data-value={value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 22px', borderRadius: 6, fontSize: 13, cursor: 'pointer', position: 'relative' }} className="rq-select-item hv-elev">
      <BaseSelect.ItemIndicator style={{ position: 'absolute', left: 6, color: 'var(--accent)' }}>✓</BaseSelect.ItemIndicator>
      {/* nowrap + ellipsis, matching ComboboxItem: without it a name long
          enough to reach the popup's minWidth-driven edge would wrap or spill
          past the scrollbar's floating gutter instead of clipping cleanly. */}
      <BaseSelect.ItemText style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
