// U3 receipt-scan — orchestration wiring (Step 8). Node env, no jsdom: the flow
// (runReceiptScan) is driven directly with an injected `enabled`, a fake
// parseReceipt/categorize (standing in for useAI), a spy `openDrawer` (the drawer
// context) and a spy `notify` (the UI context). Assertions are made against the
// seed the opener passes to openDrawer('addTx', …) — the SAME path the real UI
// takes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import receiptRes from '../../../modal/fixtures/parse-receipt.response.json';
import { runReceiptScan } from './receiptScanFlow.js';

const file = { name: 'receipt.jpg' }; // opaque File stand-in; only passed through

// Grab the form the opener handed to openDrawer('addTx', form).
const addTxForm = openDrawer => {
  const call = openDrawer.mock.calls.find(c => c[0] === 'addTx');
  return call ? call[1] : null;
};

// A store with too little history → buildContext returns null (no category call).
const S_thin = { categories: [{ id: 'groceries', name: 'Groceries', type: 'expense', status: 'active' }], transactions: [], categoryGroups: [] };

// A store carrying MIN_HISTORY (30) categorized rows → buildContext yields context.
const S_rich = {
  categoryGroups: [],
  categories: [{ id: 'groceries', name: 'Groceries', type: 'expense', status: 'active' }],
  transactions: Array.from({ length: 30 }, (_, i) => ({
    id: 't' + i, merchant: 'SHOP ' + i, amount: 100, category: 'groceries',
    type: 'expense', date: '2026-08-0' + ((i % 9) + 1) + 'T10:00:00Z',
  })),
};

afterEach(() => vi.clearAllMocks());

describe('runReceiptScan — usable parse → seeded editor', () => {
  it('opens the add-tx editor prefilled from the parsed receipt (no category when history is thin)', async () => {
    const openDrawer = vi.fn();
    const parseReceipt = vi.fn().mockResolvedValue(receiptRes.parsed);
    const categorize = vi.fn();
    const notify = vi.fn();

    const res = await runReceiptScan({ file, enabled: true, parseReceipt, categorize, S: S_thin, openDrawer, notify });

    expect(parseReceipt).toHaveBeenCalledTimes(1);
    expect(parseReceipt).toHaveBeenCalledWith(file);
    expect(categorize).not.toHaveBeenCalled(); // buildContext null under MIN_HISTORY
    expect(notify).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(addTxForm(openDrawer)).toMatchObject({
      type: 'expense', amount: '5420', date: '2026-08-24', merchant: 'Imtiaz Super Market', category: '',
    });
  });
});

describe('runReceiptScan — optional category (US-14)', () => {
  it('fills the seed category when buildContext has enough history and the suggestion is valid', async () => {
    const openDrawer = vi.fn();
    const parseReceipt = vi.fn().mockResolvedValue(receiptRes.parsed);
    const categorize = vi.fn().mockResolvedValue({ receipt: [{ categoryId: 'groceries', confidence: 0.92 }] });
    const notify = vi.fn();

    const res = await runReceiptScan({ file, enabled: true, parseReceipt, categorize, S: S_rich, openDrawer, notify });

    expect(categorize).toHaveBeenCalledTimes(1);
    // The synthetic receipt tx is shaped like a categorize target.
    expect(categorize.mock.calls[0][0]).toEqual([
      { id: 'receipt', merchant: 'Imtiaz Super Market', amount: 5420, type: 'expense', date: '2026-08-24' },
    ]);
    expect(res.categoryId).toBe('groceries');
    expect(addTxForm(openDrawer)).toMatchObject({ merchant: 'Imtiaz Super Market', category: 'groceries' });
  });

  it('drops an out-of-plan / wrong-type suggestion (defense in depth)', async () => {
    const openDrawer = vi.fn();
    const parseReceipt = vi.fn().mockResolvedValue(receiptRes.parsed);
    const categorize = vi.fn().mockResolvedValue({ receipt: [{ categoryId: 'nope', confidence: 0.99 }] });

    const res = await runReceiptScan({ file, enabled: true, parseReceipt, categorize, S: S_rich, openDrawer, notify: vi.fn() });

    expect(res.categoryId).toBeNull();
    expect(addTxForm(openDrawer)).toMatchObject({ category: '' });
  });

  it('a categorize failure never breaks the prefill (non-blocking US-14)', async () => {
    const openDrawer = vi.fn();
    const parseReceipt = vi.fn().mockResolvedValue(receiptRes.parsed);
    const categorize = vi.fn().mockRejectedValue(new Error('ai down'));

    const res = await runReceiptScan({ file, enabled: true, parseReceipt, categorize, S: S_rich, openDrawer, notify: vi.fn() });

    expect(res.ok).toBe(true);
    expect(res.categoryId).toBeNull();
    expect(addTxForm(openDrawer)).toMatchObject({ amount: '5420', category: '' });
  });
});

describe('runReceiptScan — failure paths → blank editor + notice (US-15)', () => {
  it('parseReceipt rejects → blank expense editor opens with a quiet notice', async () => {
    const openDrawer = vi.fn();
    const parseReceipt = vi.fn().mockRejectedValue(new Error('ai down'));
    const notify = vi.fn();

    const res = await runReceiptScan({ file, enabled: true, parseReceipt, categorize: vi.fn(), S: S_rich, openDrawer, notify });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unreadable');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(addTxForm(openDrawer)).toMatchObject({ type: 'expense', amount: '', merchant: '' });
  });

  it('empty/junk parse (null) → blank editor + notice, no category call', async () => {
    const openDrawer = vi.fn();
    const parseReceipt = vi.fn().mockResolvedValue(null);
    const categorize = vi.fn();
    const notify = vi.fn();

    const res = await runReceiptScan({ file, enabled: true, parseReceipt, categorize, S: S_rich, openDrawer, notify });

    expect(res.reason).toBe('unreadable');
    expect(categorize).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(addTxForm(openDrawer)).toMatchObject({ amount: '', merchant: '' });
  });
});

describe('runReceiptScan — AI disabled', () => {
  it('does nothing when AI is off (no editor, no parse, no notice)', async () => {
    const openDrawer = vi.fn();
    const parseReceipt = vi.fn();
    const notify = vi.fn();

    const res = await runReceiptScan({ file, enabled: false, parseReceipt, categorize: vi.fn(), S: S_rich, openDrawer, notify });

    expect(res).toEqual({ ok: false, reason: 'disabled' });
    expect(parseReceipt).not.toHaveBeenCalled();
    expect(openDrawer).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
