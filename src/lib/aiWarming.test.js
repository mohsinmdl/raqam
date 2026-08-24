import { describe, expect, it } from 'vitest';
import {
  WARMING_THRESHOLD_MS, anyInflight, createWarming, endCall, isWarming, startCall,
} from './aiWarming.js';

describe('aiWarming', () => {
  it('is not warming with no calls in flight', () => {
    const s = createWarming();
    expect(isWarming(s, 10_000)).toBe(false);
    expect(anyInflight(s)).toBe(false);
  });

  it('is not warming before the threshold elapses', () => {
    const s = createWarming();
    startCall(s, 1_000);
    expect(anyInflight(s)).toBe(true);
    expect(isWarming(s, 1_000 + WARMING_THRESHOLD_MS)).toBe(false); // exactly threshold → not yet
    expect(isWarming(s, 1_000 + WARMING_THRESHOLD_MS - 1)).toBe(false);
  });

  it('warms once a tracked call is pending past the threshold', () => {
    const s = createWarming();
    startCall(s, 1_000);
    expect(isWarming(s, 1_000 + WARMING_THRESHOLD_MS + 1)).toBe(true);
  });

  it('clears warming when the slow call settles', () => {
    const s = createWarming();
    const id = startCall(s, 1_000);
    expect(isWarming(s, 5_000)).toBe(true);
    endCall(s, id);
    expect(isWarming(s, 5_000)).toBe(false);
    expect(anyInflight(s)).toBe(false);
  });

  it('warms if ANY of several concurrent calls is slow', () => {
    const s = createWarming();
    startCall(s, 0);       // slow one
    const fast = startCall(s, 4_000); // just started
    expect(isWarming(s, 4_100)).toBe(true);
    endCall(s, fast);
    expect(isWarming(s, 4_100)).toBe(true); // slow one still pending
  });

  it('honours a custom threshold', () => {
    const s = createWarming();
    startCall(s, 0);
    expect(isWarming(s, 1_001, 1_000)).toBe(true);
    expect(isWarming(s, 999, 1_000)).toBe(false);
  });
});
