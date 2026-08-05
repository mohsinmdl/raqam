// Briefly highlights one row by id — used to pin a transfer while reading it.
//
// The highlight is a real background set from state, not only an animation:
// theme.css disables every animation under prefers-reduced-motion with
// `* { animation: none !important }`, so an animated-only flash would leave
// those users with no feedback at all. The animation just fades it out.
import { useCallback, useEffect, useRef, useState } from 'react';

const HOLD_MS = 1200;

export default function useRowFlash() {
  const [flashId, setFlashId] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback(id => {
    clearTimeout(timer.current); // re-clicking restarts the hold rather than cutting it short
    setFlashId(id);
    timer.current = setTimeout(() => setFlashId(null), HOLD_MS);
  }, []);

  const rowStyle = useCallback(
    id => (id === flashId ? { background: 'var(--soft)', animation: 'hsFlash .9s ease' } : null),
    [flashId],
  );

  return { flashId, flash, rowStyle };
}
