import { useEffect, useRef } from 'react';
import { isTypingTarget, matchKey } from '../lib/shortcuts.js';

// One bubble-phase keydown listener (the capture-phase Escape chain is left
// untouched). Ignores keystrokes while typing. A ref holds the latest bindings
// so handlers never go stale and the listener is not re-subscribed every render.
// bindings: [{ spec, run, when? }]; `enabled` gates the whole set.
export function useShortcuts(bindings, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = e => {
      if (isTypingTarget(document.activeElement)) return;
      for (const b of ref.current) {
        if (matchKey(e, b.spec) && (!b.when || b.when())) {
          e.preventDefault();
          b.run();
          return;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
}
