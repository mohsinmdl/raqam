// The decision behind "click outside the register table closes the inline tx
// editor". Pure truth table so the guard rails are pinned: it closes ONLY on a
// clean outside press — not inside the table, not inside an open picker/dialog,
// and not while any picker is open (that press just dismisses the picker). The
// actual close is routed through requestClose by the caller, so a meaningful
// unsaved draft still gets the discard-confirm; that part isn't this predicate's
// job.
import { describe, it, expect } from 'vitest';
import { shouldCloseInlineOnOutsidePress } from '../src/lib/inlineOutsideClose.js';

const call = o => shouldCloseInlineOnOutsidePress(o);

describe('shouldCloseInlineOnOutsidePress', () => {
  it('closes on a clean press outside the table with nothing open', () => {
    expect(call({ inTable: false, inOverlay: false, overlayOpen: false })).toBe(true);
  });

  it('does nothing when the press is inside the table', () => {
    expect(call({ inTable: true, inOverlay: false, overlayOpen: false })).toBe(false);
  });

  it('does nothing when the press lands inside an open picker or dialog', () => {
    expect(call({ inTable: false, inOverlay: true, overlayOpen: true })).toBe(false);
  });

  it('does nothing when a picker is open (that press dismisses the picker, keeps the row)', () => {
    expect(call({ inTable: false, inOverlay: false, overlayOpen: true })).toBe(false);
  });

  it('inside-table always wins even if an overlay is somehow open', () => {
    expect(call({ inTable: true, inOverlay: false, overlayOpen: true })).toBe(false);
  });
});
