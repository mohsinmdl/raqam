import { describe, it, expect } from 'vitest';
import { matchKey, isTypingTarget, SPEC, SHORTCUT_GROUPS } from '../src/lib/shortcuts.js';

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
});
