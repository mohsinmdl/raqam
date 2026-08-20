import { useEffect, useRef, useState } from 'react';

// Measures a ref'd element's content-box inline size via ResizeObserver, for
// components that need the number (not just a CSS container-query
// breakpoint) — e.g. filtering a columns array so <colgroup>/header/cells
// can't drift out of lockstep. Companion to useIsPhone: that one is a
// viewport media query (no sidebar to react to on phone); this one tracks
// real content width the way .dash-cols/.plan-grid's container queries do.
// Returns null until the first observation lands, so callers can treat
// "not yet measured" as unconstrained rather than flashing a folded layout.
export function useContainerWidth(ref) {
  const [width, setWidth] = useState(null);
  const frame = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w == null) return;
      // rAF-batch: ResizeObserver can fire mid-layout, and a resizing sidebar
      // drag fires it rapidly — batch to one state update per frame instead
      // of one per observer callback.
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setWidth(w));
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (frame.current) cancelAnimationFrame(frame.current); };
  }, [ref]);
  return width;
}
