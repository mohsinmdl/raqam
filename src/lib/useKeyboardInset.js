import { useEffect, useState } from 'react';

// Height (px) of the on-screen keyboard overlapping the bottom of the layout
// viewport, and the live visualViewport height (the space actually visible
// above the keyboard). Both 0 on desktop and while the keyboard is hidden.
//
// The visual viewport shrinks under the keyboard on iOS/Android while the
// layout viewport (and so anything anchored bottom:0) keeps its height — the
// difference is `inset`. `viewportHeight` is exposed too because the CSS
// `dvh` unit does NOT track the keyboard on iOS Safari (dvh only responds to
// browser-chrome changes, not the software keyboard) — and browser-chrome
// changes (the URL bar collapsing/expanding) can happen at the same moment a
// field is focused, so a height computed from `dvh` and an inset computed
// from visualViewport can drift apart by exactly the chrome's height. Sizing
// the sheet directly off `visualViewport.height` sidesteps that drift: it's
// the one number that is always the true, current, keyboard-exclusive
// visible height.
export function useKeyboardInset() {
  const [state, setState] = useState({ inset: 0, viewportHeight: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setState({ inset: Math.max(0, Math.round(covered)), viewportHeight: Math.round(vv.height) });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // visualViewport's own events don't fire for every change to
    // window.innerHeight — Safari can expand/collapse its chrome (URL bar)
    // independently of the keyboard's resize/scroll events (e.g. right as a
    // field gains focus). Without also watching window resize, `inset` can
    // go stale relative to the bottom:0 anchor it's meant to offset, leaving
    // a gap between the sheet's transformed edge and the keyboard's real top.
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return state;
}

// Pure geometry, split out so the math is unit-testable without a real
// viewport. The sheet's bottom is pinned by pushing it up by exactly
// `inset` — that math holds regardless of what height the box ends up with,
// which is why `height` below is free to be computed from a *different*,
// unrelated number (`viewportHeight`) without double-counting the inset.
// Height fills the visible area above the keyboard, leaving TOP_GAP px plus
// the safe area below the notch/status bar.
const TOP_GAP = 10;
export function kbGrowGeometry(inset, viewportHeight) {
  return {
    transform: `translateY(-${inset}px)`,
    height: `calc(${Math.max(0, viewportHeight - TOP_GAP)}px - env(safe-area-inset-top))`,
  };
}
