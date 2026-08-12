import { describe, expect, it } from 'vitest';
import { shouldLock, toB64url, fromB64url } from './appLock.js';

describe('shouldLock', () => {
  it('never locks when the app was never hidden', () => {
    expect(shouldLock(null, 10_000)).toBe(false);
  });
  it('does not lock within the threshold', () => {
    expect(shouldLock(1_000, 1_000 + 60_000)).toBe(false); // exactly 60s → not yet
    expect(shouldLock(1_000, 1_000 + 59_999)).toBe(false);
  });
  it('locks past the threshold', () => {
    expect(shouldLock(1_000, 1_000 + 60_001)).toBe(true);
  });
  it('honours a custom threshold', () => {
    expect(shouldLock(0, 5_001, 5_000)).toBe(true);
    expect(shouldLock(0, 4_999, 5_000)).toBe(false);
  });
});

describe('base64url round-trip', () => {
  it('encodes and decodes bytes losslessly, url-safe', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63]);
    const s = toB64url(bytes.buffer);
    expect(s).not.toMatch(/[+/=]/);            // url-safe, unpadded
    expect(Array.from(fromB64url(s))).toEqual(Array.from(bytes));
  });
});
