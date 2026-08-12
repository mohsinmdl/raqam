import { describe, expect, it } from 'vitest';
import { kbGrowGeometry } from './useKeyboardInset.js';

describe('kbGrowGeometry', () => {
  it('pins the bottom edge by translating up by exactly the keyboard inset', () => {
    const { transform } = kbGrowGeometry(444, 400);
    expect(transform).toBe('translateY(-444px)');
  });

  it('sizes height directly off the live viewport height (minus the 10px top gap)', () => {
    const { height } = kbGrowGeometry(444, 400);
    expect(height).toBe('calc(390px - env(safe-area-inset-top))');
  });

  it('never double-counts the inset: height depends only on viewportHeight', () => {
    // Same viewportHeight, wildly different insets — height must not move.
    const a = kbGrowGeometry(100, 500);
    const b = kbGrowGeometry(900, 500);
    expect(a.height).toBe(b.height);
    expect(a.height).toBe('calc(490px - env(safe-area-inset-top))');
  });

  it('translateY depends only on inset, never on viewportHeight', () => {
    const a = kbGrowGeometry(300, 200);
    const b = kbGrowGeometry(300, 900);
    expect(a.transform).toBe(b.transform);
    expect(a.transform).toBe('translateY(-300px)');
  });

  it('clamps height at 0 rather than emitting a negative calc()', () => {
    const { height } = kbGrowGeometry(50, 5); // viewportHeight (5) < TOP_GAP (10)
    expect(height).toBe('calc(0px - env(safe-area-inset-top))');
  });
});
