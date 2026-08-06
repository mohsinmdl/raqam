import { describe, it, expect } from 'vitest';
import { reducer } from '../src/store/StoreProvider.jsx';
import { recordChange, emptyStacks } from '../src/lib/undo.js';

const store = over => ({ transactions: [], audit: [], ...(over || {}) });
const auditRow = summary => ({ id: 'a' + summary, at: '2026-08-06T10:00', summary });

const readyState = (data, stacks) => ({ status: 'ready', data, error: null, ...(stacks || emptyStacks()) });

describe('reducer — system-flagged data actions', () => {
  it('leaves nothing undoable behind a system change', () => {
    const d0 = store({ transactions: [{ id: 't0' }] });
    const d1 = store({ transactions: [{ id: 't1' }] });
    const past = recordChange(emptyStacks(), d0, 'earlier change').past;
    const state = readyState(d0, { past, future: [] });

    const out = reducer(state, { type: 'data', fn: () => d1, system: true });

    expect(out.past).toEqual([]);
    expect(out.future).toEqual([]);
  });

  it('records no new entry for the system change itself', () => {
    const d0 = store();
    const d1 = store({ transactions: [{ id: 't1' }] });
    const state = readyState(d0);

    const out = reducer(state, { type: 'data', fn: () => d1, system: true });

    expect(out.data).toBe(d1);
    expect(out.past).toEqual([]);
  });
});

describe('reducer — no-op data actions', () => {
  it('returns the identical state object when the action changes nothing', () => {
    const d0 = store();
    const state = readyState(d0);

    const out = reducer(state, { type: 'data', fn: d => d });

    expect(out).toBe(state);
  });
});

describe('reducer — hydrate and replaceData', () => {
  it('hydrate clears both stacks', () => {
    const past = recordChange(emptyStacks(), store(), 'x').past;
    const state = readyState(store(), { past, future: [{ snapshot: store(), label: 'y' }] });

    const out = reducer(state, { type: 'hydrate', data: store({ transactions: [{ id: 'fresh' }] }) });

    expect(out.past).toEqual([]);
    expect(out.future).toEqual([]);
  });

  it('replaceData clears both stacks', () => {
    const past = recordChange(emptyStacks(), store(), 'x').past;
    const state = readyState(store(), { past, future: [{ snapshot: store(), label: 'y' }] });

    const out = reducer(state, { type: 'replaceData', data: store({ transactions: [{ id: 'imported' }] }) });

    expect(out.past).toEqual([]);
    expect(out.future).toEqual([]);
  });
});

describe('reducer — undo with an empty past', () => {
  it('returns the identical state object rather than a new one', () => {
    const state = readyState(store());

    const out = reducer(state, { type: 'undo', auditRow: auditRow('Undid: nothing') });

    expect(out).toBe(state);
  });
});
