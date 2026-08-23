import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// fetchAll's clock-skew retry (src/store/sync.js). PostgREST intermittently
// rejects a just-minted token with "JWT issued at future" when Supabase's auth
// clock runs ahead of PostgREST's (PostgREST#1139) — a transient condition
// that outlives itself in seconds. fetchAll retries exactly once, after a
// pause, for that error only; everything else still fails fast.
//
// The mock counts full fetch passes via the transactions table (fetched once
// per pass) and can be armed to fail the first N passes with a given message.
vi.mock('../src/lib/supabase.js', () => {
  const state = { failuresLeft: 0, message: '', passes: 0 };
  const makeBuilder = table => {
    let error = null;
    if (table === 'transactions') {
      state.passes += 1;
      if (state.failuresLeft > 0) { state.failuresLeft -= 1; error = { message: state.message }; }
    }
    const builder = {
      data: [], error,
      select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
    };
    return builder;
  };
  return { supabase: { from: makeBuilder }, __state: state };
});

import { CLOCK_SKEW_RETRY_MS, fetchAll } from '../src/store/sync.js';
import { __state as state } from '../src/lib/supabase.js';

beforeEach(() => {
  vi.useFakeTimers();
  state.failuresLeft = 0;
  state.message = '';
  state.passes = 0;
});
afterEach(() => vi.useRealTimers());

describe('fetchAll clock-skew retry', () => {
  it('silently retries once on "JWT issued at future" and resolves', async () => {
    state.failuresLeft = 1;
    state.message = 'JWT issued at future';
    const p = fetchAll();
    await vi.advanceTimersByTimeAsync(CLOCK_SKEW_RETRY_MS);
    const store = await p;
    expect(store.transactions).toEqual([]);
    expect(state.passes).toBe(2);
  });

  it('waits out the skew window before retrying, not immediately', async () => {
    state.failuresLeft = 1;
    state.message = 'JWT issued at future';
    const p = fetchAll();
    p.catch(() => {}); // not expected to reject; guard the assertion window
    await vi.advanceTimersByTimeAsync(CLOCK_SKEW_RETRY_MS - 1);
    expect(state.passes).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(state.passes).toBe(2);
  });

  it('does not retry other errors', async () => {
    state.failuresLeft = 1;
    state.message = 'permission denied for table transactions';
    await expect(fetchAll()).rejects.toThrow(/permission denied/);
    expect(state.passes).toBe(1);
  });

  it('surfaces the error when the skew outlives the single retry', async () => {
    state.failuresLeft = 2;
    state.message = 'JWT issued at future';
    const p = fetchAll();
    const rejection = expect(p).rejects.toThrow(/issued at future/);
    await vi.advanceTimersByTimeAsync(CLOCK_SKEW_RETRY_MS);
    await rejection;
    expect(state.passes).toBe(2);
  });
});
