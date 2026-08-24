// U2 sms-parse — L6 orchestration wiring (Step 8). Node env, no jsdom: the flow
// (runPasteSms) is driven directly with an injected `enabled` + a fake parseSms
// (standing in for useAI) and a spy `openDrawer` (standing in for the drawer
// context). Assertions are made against the seed the opener passes to
// openDrawer('addTx', …) — the SAME path the real UI takes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import parseReq from '../../../modal/fixtures/parse-sms.request.json';
import { runPasteSms } from './pasteSmsFlow.js';

// The HBL fixture text resolves last4 1234 → this account (exactly one match).
const S = { accounts: [{ id: 'a1', last4: '1234' }], cards: [] };

// Grab the form the opener handed to openDrawer('addTx', form).
const addTxForm = openDrawer => {
  const call = openDrawer.mock.calls.find(c => c[0] === 'addTx');
  return call ? call[1] : null;
};

afterEach(() => vi.clearAllMocks());

describe('runPasteSms — tier-1 hit', () => {
  it('opens a prefilled editor WITHOUT calling the LLM', async () => {
    const openDrawer = vi.fn();
    const parseSms = vi.fn();
    const res = await runPasteSms({ text: parseReq.text, enabled: true, parseSms, S, openDrawer });

    expect(parseSms).not.toHaveBeenCalled();
    expect(res.tier).toBe('local');
    const form = addTxForm(openDrawer);
    expect(form).toMatchObject({
      type: 'expense', amount: '5420', date: '2026-08-24', merchant: 'IMTIAZ', payWith: 'acc:a1',
    });
    expect(form.notes).toBe(''); // notes untouched on the seed path
  });
});

describe('runPasteSms — tier-1 miss, AI on', () => {
  it('calls the LLM then seeds the editor from its ParsedSms', async () => {
    const openDrawer = vi.fn();
    const parseSms = vi.fn().mockResolvedValue({ amount: 900, direction: 'credit', merchant: 'ACME' });
    const text = 'Some unlisted-format alert with no parseable fields';
    const res = await runPasteSms({ text, enabled: true, parseSms, S, openDrawer });

    expect(parseSms).toHaveBeenCalledTimes(1);
    expect(parseSms).toHaveBeenCalledWith(text);
    expect(res.tier).toBe('llm');
    // No last4 in the LLM parse → ref stays blank (txDefaults' account: '').
    expect(addTxForm(openDrawer)).toMatchObject({ type: 'income', amount: '900', merchant: 'ACME', account: '' });
  });
});

describe('runPasteSms — failure paths → notes fallback (US-12)', () => {
  it('LLM rejects → editor opens empty with the raw SMS in notes', async () => {
    const openDrawer = vi.fn();
    const parseSms = vi.fn().mockRejectedValue(new Error('ai down'));
    const text = 'junk sms that regex cannot read';
    const res = await runPasteSms({ text, enabled: true, parseSms, S, openDrawer });

    expect(parseSms).toHaveBeenCalledTimes(1);
    expect(res.tier).toBe('notes');
    expect(addTxForm(openDrawer)).toMatchObject({ type: 'expense', notes: text, amount: '' });
  });

  it('AI off → LLM never called, notes fallback on a tier-1 miss', async () => {
    const openDrawer = vi.fn();
    const parseSms = vi.fn();
    const text = 'no amount, no direction here';
    const res = await runPasteSms({ text, enabled: false, parseSms, S, openDrawer });

    expect(parseSms).not.toHaveBeenCalled();
    expect(res.tier).toBe('notes');
    expect(addTxForm(openDrawer)).toMatchObject({ notes: text });
  });

  it('LLM returns an unusable parse (garbage direction) → notes fallback', async () => {
    const openDrawer = vi.fn();
    const parseSms = vi.fn().mockResolvedValue({ amount: 900 }); // no direction → not usable
    const res = await runPasteSms({ text: 'unreadable', enabled: true, parseSms, S, openDrawer });

    expect(res.tier).toBe('notes');
    expect(addTxForm(openDrawer)).toMatchObject({ notes: 'unreadable' });
  });
});
