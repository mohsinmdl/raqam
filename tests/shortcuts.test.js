import { describe, it, expect } from 'vitest';
import { matchKey, isTypingTarget, SPEC, SHORTCUT_GROUPS, SHORTCUT_BY_ID } from '../src/lib/shortcuts.js';

const ev = (key, mods = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

describe('matchKey', () => {
  it('requires shift for shift-letter combos', () => {
    expect(matchKey(ev('N', { shiftKey: true }), SPEC.addTx)).toBe(true);
    expect(matchKey(ev('n'), SPEC.addTx)).toBe(false);
  });

  it('disambiguates E from shift+E', () => {
    expect(matchKey(ev('e'), SPEC.enterNow)).toBe(true);
    expect(matchKey(ev('e', { shiftKey: true }), SPEC.enterNow)).toBe(false);
    expect(matchKey(ev('e', { shiftKey: true }), SPEC.reconcile)).toBe(true);
    expect(matchKey(ev('e'), SPEC.reconcile)).toBe(false);
  });

  it('matches ? even though its event carries shiftKey', () => {
    expect(matchKey(ev('?', { shiftKey: true }), SPEC.help)).toBe(true);
  });

  it('treats metaKey and ctrlKey alike', () => {
    expect(matchKey(ev('a', { metaKey: true }), SPEC.selectAll)).toBe(true);
    expect(matchKey(ev('a', { ctrlKey: true }), SPEC.selectAll)).toBe(true);
    expect(matchKey(ev('a'), SPEC.selectAll)).toBe(false);
  });

  it('does not fire a plain-letter shortcut when meta is held', () => {
    expect(matchKey(ev('c'), SPEC.toggleCleared)).toBe(true);
    expect(matchKey(ev('c', { metaKey: true }), SPEC.toggleCleared)).toBe(false);
  });

  it('accepts an alt key (Delete or Backspace)', () => {
    expect(matchKey(ev('Delete'), SPEC.delete)).toBe(true);
    expect(matchKey(ev('Backspace'), SPEC.delete)).toBe(true);
    expect(matchKey(ev('x'), SPEC.delete)).toBe(false);
  });

  it('requires both meta and shift for focus-search', () => {
    expect(matchKey(ev('f', { metaKey: true, shiftKey: true }), SPEC.focusSearch)).toBe(true);
    expect(matchKey(ev('f', { metaKey: true }), SPEC.focusSearch)).toBe(false);
  });

  it('toggle-theme fires on ctrl+shift+L or cmd+shift+L, but needs both modifiers', () => {
    expect(matchKey(ev('l', { ctrlKey: true, shiftKey: true }), SPEC.toggleTheme)).toBe(true);
    expect(matchKey(ev('l', { metaKey: true, shiftKey: true }), SPEC.toggleTheme)).toBe(true);
    expect(matchKey(ev('l', { ctrlKey: true }), SPEC.toggleTheme)).toBe(false);
    expect(matchKey(ev('l', { shiftKey: true }), SPEC.toggleTheme)).toBe(false);
  });

  it('hide-amounts fires on a bare H only', () => {
    expect(matchKey(ev('h'), SPEC.hideAmounts)).toBe(true);
    expect(matchKey(ev('h', { shiftKey: true }), SPEC.hideAmounts)).toBe(false);
    expect(matchKey(ev('h', { metaKey: true }), SPEC.hideAmounts)).toBe(false);
  });

  it('never matches a sequence spec (those are handled by useSequence)', () => {
    expect(matchKey(ev('g'), SPEC.goDashboard)).toBe(false);
    expect(matchKey(ev('d'), SPEC.goDashboard)).toBe(false);
  });

  it('matches Alt+digit jumps by physical code (macOS Option composes the key)', () => {
    // On macOS Option+1 emits '¡', so e.key is unreliable — match e.code instead.
    expect(matchKey(ev('¡', { altKey: true, code: 'Digit1' }), SPEC.jumpBudget)).toBe(true);
    expect(matchKey(ev('2', { altKey: true, code: 'Digit2' }), SPEC.jumpReflect)).toBe(true);
    expect(matchKey(ev('3', { altKey: true, code: 'Digit3' }), SPEC.jumpAccounts)).toBe(true);
  });

  it('requires Alt to be held for an Alt+digit jump, and matches only its own code', () => {
    expect(matchKey(ev('1', { code: 'Digit1' }), SPEC.jumpBudget)).toBe(false);           // no Alt
    expect(matchKey(ev('2', { altKey: true, code: 'Digit2' }), SPEC.jumpBudget)).toBe(false); // wrong code
  });

  it('a bare letter chord no longer fires while Alt is held', () => {
    expect(matchKey(ev('h', { altKey: true }), SPEC.hideAmounts)).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('is true for text-entry elements', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('registry', () => {
  it('every item is well-formed and present in SPEC', () => {
    const ids = [];
    for (const g of SHORTCUT_GROUPS) {
      expect(typeof g.title).toBe('string');
      for (const i of g.items) {
        expect(i.id && Array.isArray(i.keys) && i.label && i.spec).toBeTruthy();
        expect(SPEC[i.id]).toBe(i.spec);
        ids.push(i.id);
      }
    }
    expect(Object.keys(SPEC).length).toBe(ids.length);
  });

  it('SHORTCUT_BY_ID exposes one full item per id, each with a label and keys (for tooltips)', () => {
    const ids = SHORTCUT_GROUPS.flatMap(g => g.items.map(i => i.id));
    expect(Object.keys(SHORTCUT_BY_ID).length).toBe(ids.length);
    for (const id of ids) {
      const item = SHORTCUT_BY_ID[id];
      expect(item.id).toBe(id);
      expect(typeof item.label).toBe('string');
      expect(Array.isArray(item.keys) && item.keys.length > 0).toBe(true);
    }
    // Tooltip-referenced ids resolve.
    for (const id of ['addTx', 'undo', 'redo', 'focusSearch', 'reconcile', 'toggleCleared', 'duplicate', 'delete', 'makeRepeating', 'enterNow']) {
      expect(SHORTCUT_BY_ID[id]).toBeTruthy();
    }
  });
});
