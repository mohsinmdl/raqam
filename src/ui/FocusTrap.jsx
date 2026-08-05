import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Traps Tab focus inside its child dialog while mounted; restores focus to the
// previously focused element on unmount. The prototype declared aria-modal but
// never actually trapped focus — this closes that gap.
export default function FocusTrap({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const root = ref.current;
    // A drawer can name the field worth landing on; otherwise focus falls to
    // the first focusable, which is the close button.
    const first = root?.querySelector('[data-autofocus]') || root?.querySelector(FOCUSABLE);
    (first || root)?.focus?.();

    const onKey = e => {
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, []);

  return <div ref={ref} tabIndex={-1} style={{ display: 'contents' }}>{children}</div>;
}
