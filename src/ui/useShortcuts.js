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

// Two-key "leader" sequences (e.g. G then D). bindings: [{ seq: [leader, key], run }].
// Press the leader, then the second key within ~1.2s. Any modifier, typing,
// timeout, or a non-matching second key cancels the pending sequence. Modifier-
// free single letters, so it never fights the chord shortcuts in useShortcuts.
export function useSequence(bindings, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return undefined;
    let prefix = null;
    let timer = null;
    const reset = () => { prefix = null; if (timer) { clearTimeout(timer); timer = null; } };
    const onKey = e => {
      if (isTypingTarget(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) { reset(); return; }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!prefix) {
        if (ref.current.some(b => b.seq[0] === k)) { prefix = k; timer = setTimeout(reset, 1200); }
        return;
      }
      const match = ref.current.find(b => b.seq[0] === prefix && b.seq[1] === k);
      reset();
      if (match) { e.preventDefault(); match.run(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (timer) clearTimeout(timer); };
  }, [enabled]);
}
