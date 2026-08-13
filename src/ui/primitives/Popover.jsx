// Thin, tokened wrapper over Radix Popover. The whole point of adopting a
// headless lib here: Radix supplies anchored positioning + collision flip,
// Escape / outside-click dismissal, portal, focus return, and ARIA — the
// concerns the app currently hand-rolls in ~6 positioning engines and ~8
// outside-click loops — while WE keep full control of the look.
//
// "The Trusted Ledger" design rules baked into the content surface:
//   flat white card · one 1px hairline border · the single --shadow token
//   (reserved for transient overlays) · 12px radius · no second elevation.
// Teal stays on the actionable control only (the consumer's OK button), never
// on the container.
//
// Only the sandbox imports this today. If the direction is validated, this file
// is the artifact to promote into src/ui/ and point real popovers at.
import * as RadixPopover from '@radix-ui/react-popover';

const contentBase = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: 'var(--shadow)',
  padding: 12,
  // Slots into the app's existing z-index ladder (popovers/modals sit at 60).
  zIndex: 60,
  boxSizing: 'border-box',
};

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverClose = RadixPopover.Close;
export const PopoverAnchor = RadixPopover.Anchor;

// Content is always portalled to document.body (escapes the plan table's
// overflow:hidden, same reason the hand-rolled popovers portal). `width` is a
// convenience for the common fixed-width card; everything else passes through.
export function PopoverContent({
  children, style, width,
  side = 'bottom', align = 'start', sideOffset = 6, collisionPadding = 8,
  ...rest
}) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        style={{ ...contentBase, ...(width ? { width } : null), ...style }}
        {...rest}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
