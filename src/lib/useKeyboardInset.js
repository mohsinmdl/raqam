import { useEffect, useState } from 'react';

// Height (px) of the on-screen keyboard overlapping the bottom of the layout
// viewport. 0 on desktop and while the keyboard is hidden. The visual viewport
// shrinks under the keyboard on iOS/Android while the layout viewport (and so
// anything anchored bottom:0) keeps its height — the difference is the inset.
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, Math.round(covered)));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}
