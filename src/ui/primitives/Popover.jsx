// Tokened wrapper over Base UI's Popover. Base UI (Floating UI under the hood)
// supplies anchored positioning + collision avoidance, portal, Escape /
// outside-click dismissal, focus return, and ARIA — the concerns the app
// currently hand-rolls per overlay. We keep the look: "The Trusted Ledger"
// flat surface, one 1px hairline, the single --shadow token (overlays only).
//
// First production consumer: TxMonthNav. This is the primitive later popover
// migrations point at.
import { Popover as BasePopover } from '@base-ui/react/popover';

const popupStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: 'var(--shadow)',
  padding: 14,
  color: 'var(--text)',
  boxSizing: 'border-box',
  // Kill any default UA outline on the focusable popup; fields inside keep the
  // app's own :focus-visible ring.
  outline: 'none',
};

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;

// The portalled, positioned surface. `side`/`align`/`sideOffset` anchor it to
// the trigger; collisionAvoidance keeps it on-screen near edges (this is what
// structurally prevents the old "panel stretches the header" bug — the content
// lives in a body portal, not the header cell).
//
// Two opt-in props, defaulted so existing consumers are unaffected:
//   collisionAvoidance — override the default 'shift'. A caller that wants the
//     YNAB behaviour (open downward, flip UP when the anchor is near the bottom)
//     passes { side: 'flip', align: 'shift' }.
//   arrow — render a caret pointing at the anchor (styled in theme.css by the
//     Base UI data-side attribute). Off by default; no consumer had one before.
//   anchor — position against this element/ref instead of the trigger. The
//     register's date cell needs it: its trigger is a small chevron button but
//     the calendar must hang off the whole field. Anything not named here
//     (initialFocus/finalFocus among them) falls through to the Popup.
export function PopoverPanel({
  children, style, width, arrow = false, anchor,
  side = 'bottom', align = 'start', sideOffset = 6,
  collisionAvoidance = { side: 'shift', align: 'shift' }, ...rest
}) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        anchor={anchor}
        collisionAvoidance={collisionAvoidance}
        // Transactions' existing dropdown/popover band.
        style={{ zIndex: 30 }}
      >
        <BasePopover.Popup style={{ ...popupStyle, ...(width ? { width } : null), ...style }} {...rest}>
          {arrow ? <BasePopover.Arrow className="rq-pop-arrow" /> : null}
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
