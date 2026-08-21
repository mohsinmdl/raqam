// Tokened wrapper over Base UI's ScrollArea — a REAL scrollbar (a draggable
// thumb element, proper rendering in every browser) rather than a
// ::-webkit-scrollbar pseudo-element. Base UI hides the native scrollbar and
// tracks scroll position/overflow state; this file only owns the look, kept
// to .rq-scroll's existing appearance (thin, --border thumb, --muted on
// hover, transparent track) so a consumer on this primitive and one still on
// the CSS-only .rq-scroll approach (Combobox's ComboboxPanel, not yet
// migrated) read as the same scrollbar.
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';

// position: relative is a structural requirement, not a per-consumer choice —
// Scrollbar positions itself absolutely against Root — so it lives here
// rather than being repeated at every call site.
export function ScrollArea({ children, style, ...rest }) {
  return <BaseScrollArea.Root style={{ position: 'relative', ...style }} {...rest}>{children}</BaseScrollArea.Root>;
}
export const ScrollAreaViewport = BaseScrollArea.Viewport;
export const ScrollAreaContent = BaseScrollArea.Content;

export function ScrollAreaScrollbar() {
  return (
    <BaseScrollArea.Scrollbar className="rq-scrollbar">
      <BaseScrollArea.Thumb className="rq-scrollbar-thumb" />
    </BaseScrollArea.Scrollbar>
  );
}
