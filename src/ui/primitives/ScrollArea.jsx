// Tokened wrapper over Base UI's ScrollArea — a REAL scrollbar (a draggable
// thumb element, proper rendering in every browser) rather than a
// ::-webkit-scrollbar pseudo-element. Base UI hides the native scrollbar and
// tracks scroll position/overflow state (verified against @base-ui/react
// 1.7.0, scroll-area/viewport/ScrollAreaViewport.js's styleDisableScrollbar
// class); this file only owns the look, kept to .rq-scroll's existing
// appearance (thin, --border thumb, --muted on hover, transparent track) so
// a consumer on this primitive and one still on the CSS-only .rq-scroll
// approach (Combobox's ComboboxPanel, not yet migrated — see the TODO there)
// read as the same scrollbar.
//
// ScrollAreaRoot already sets position:relative on itself by default
// (verified: scroll-area/root/ScrollAreaRoot.js's own default props), so
// this is a plain re-export — no wrapper needed to supply it.
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';

export const ScrollArea = BaseScrollArea.Root;
export const ScrollAreaViewport = BaseScrollArea.Viewport;
export const ScrollAreaContent = BaseScrollArea.Content;

// preventDefault on pointerdown, on BOTH the track and the thumb: Base UI's
// own handlers never call it (confirmed: neither ScrollAreaScrollbar's own
// onPointerDown, which explicitly ignores clicks landing on the thumb, nor
// ScrollAreaThumb's onPointerDown={handlePointerDown} does), so without this
// the browser's default mousedown behavior moves DOM focus onto the
// scrollbar's nearest focusable ancestor mid-drag — off whichever list item
// was highlighted. A consumer that reads "what's highlighted" from
// e.target/document.activeElement (the inline tx editor's Tab-commit does
// exactly this) would then silently commit nothing. preventDefault here only
// suppresses that default FOCUS shift; Base UI's own pointer-capture/drag
// tracking (setPointerCapture, pointermove) runs via explicit calls elsewhere
// and composes fine with this (mergeProps composes same-named handlers,
// verified: merge-props/mergeProps.js's mergeEventHandlers) — dragging still
// works, the highlighted item just never loses focus while you do it.
const keepFocus = e => e.preventDefault();

export function ScrollAreaScrollbar({ className, style, ...rest }) {
  return (
    // aria-hidden: Base UI gives Scrollbar/Thumb no role of their own (a real
    // role="scrollbar" would need aria-valuenow etc. Base UI doesn't
    // compute), so left alone they're two unlabeled, non-focusable divs
    // inside this list's role="listbox" — some screen readers announce them.
    // Keyboard users already scroll via arrow keys; this is a pointer-only
    // affordance.
    <BaseScrollArea.Scrollbar aria-hidden="true" onPointerDown={keepFocus} className={['rq-scrollbar', className].filter(Boolean).join(' ')} style={style} {...rest}>
      <BaseScrollArea.Thumb className="rq-scrollbar-thumb" onPointerDown={keepFocus} />
    </BaseScrollArea.Scrollbar>
  );
}
