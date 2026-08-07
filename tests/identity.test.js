import { describe, it, expect } from 'vitest';
import { resolveDisplayName, initialOf } from '../src/lib/identity.js';

describe('resolveDisplayName', () => {
  it('uses the display name when set', () => {
    expect(resolveDisplayName('Mohsin', 'x@y.com')).toBe('Mohsin');
  });
  it('ignores a whitespace-only name and falls back to the email local part', () => {
    expect(resolveDisplayName('   ', 'mohsin@example.com')).toBe('Mohsin');
  });
  it('capitalises the email local part when there is no display name', () => {
    expect(resolveDisplayName('', 'daisy.khan@example.com')).toBe('Daisy.khan');
  });
  it('falls back to "Account" when neither is present', () => {
    expect(resolveDisplayName('', '')).toBe('Account');
  });
});

describe('initialOf', () => {
  it('returns the uppercased first character', () => {
    expect(initialOf('mohsin')).toBe('M');
  });
  it('returns "?" for an empty name', () => {
    expect(initialOf('')).toBe('?');
  });
});
