import { describe, it, expect } from 'vitest';
import { schedNote } from '../src/lib/txRow.js';

// The scheduled-band note is built in one place and shared by the desktop
// GroupHead and the phone list's band header — these pin its three shapes.
describe('schedNote', () => {
  it('reports an overdue count with no hidden rules', () => {
    expect(schedNote(2, 0)).toBe('2 overdue');
  });

  it('falls back to "not yet spent" when nothing is overdue or hidden', () => {
    expect(schedNote(0, 0)).toBe('not yet spent');
  });

  it('joins an overdue count with a hidden-rule count', () => {
    expect(schedNote(1, 3)).toBe('1 overdue · 3 more later');
  });
});
