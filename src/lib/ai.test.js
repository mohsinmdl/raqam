import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import categorizeReq from '../../modal/fixtures/categorize.request.json';
import categorizeResp from '../../modal/fixtures/categorize.response.json';
import {
  AiError, aiConfigured, buildCategorizeBody, categorize, parseSms,
} from './ai.js';

// supabase.auth is mocked so token retrieval + the 401 refresh path are
// controllable per test. vi.hoisted keeps the fns reachable inside the factory.
const { getSession, refreshSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock('./supabase.js', () => ({
  supabase: { auth: { getSession, refreshSession } },
  supabaseConfigured: true,
}));

const ENDPOINT = 'https://ai.raqam.test';

// Minimal Response stand-in: only what ai.js reads (status + json()).
function jsonRes(status, body) {
  return { status, json: async () => body };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_AI_ENDPOINT', ENDPOINT);
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  refreshSession.mockResolvedValue({ data: {}, error: null });
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('aiConfigured', () => {
  it('is true when VITE_AI_ENDPOINT is set', () => {
    expect(aiConfigured()).toBe(true);
  });
  it('is false when the endpoint is unset', () => {
    vi.stubEnv('VITE_AI_ENDPOINT', '');
    expect(aiConfigured()).toBe(false);
  });
});

describe('request body shape (contract lockstep)', () => {
  it('buildCategorizeBody matches the fixture key-for-key', () => {
    const body = buildCategorizeBody(categorizeReq.transactions, categorizeReq.context);
    expect(Object.keys(body).sort()).toEqual(Object.keys(categorizeReq).sort());
    expect(Object.keys(body.context).sort()).toEqual(Object.keys(categorizeReq.context).sort());
    expect(body).toEqual(categorizeReq);
  });
});

describe('categorize', () => {
  it('attaches the bearer token and returns the parsed suggestions', async () => {
    global.fetch.mockResolvedValueOnce(jsonRes(200, categorizeResp));
    const out = await categorize(categorizeReq.transactions, categorizeReq.context);

    expect(out).toEqual(categorizeResp.suggestions);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`${ENDPOINT}/categorize`);
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(categorizeReq);
  });

  it('refreshes the session on a 401 and retries once, succeeding', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonRes(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonRes(200, categorizeResp));

    const out = await categorize(categorizeReq.transactions, categorizeReq.context);
    expect(out).toEqual(categorizeResp.suggestions);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws AiError kind=auth on a second 401', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonRes(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonRes(401, { error: 'expired' }));

    const err = await categorize(categorizeReq.transactions, categorizeReq.context).catch(e => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('auth');
    expect(err.status).toBe(401);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('maps a timeout/abort to kind=cold', async () => {
    // Honour the abort signal so the AbortController timeout rejects as it would live.
    global.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
      });
    }));

    const err = await categorize(
      categorizeReq.transactions, categorizeReq.context, { timeoutMs: 10 },
    ).catch(e => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('cold');
  });

  it('maps HTTP 501 (stubbed route) to kind=unavailable with status', async () => {
    global.fetch.mockResolvedValueOnce(jsonRes(501, { error: 'not implemented' }));
    const err = await categorize(categorizeReq.transactions, categorizeReq.context).catch(e => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('unavailable');
    expect(err.status).toBe(501);
  });

  it('maps a network error to kind=unavailable', async () => {
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await categorize(categorizeReq.transactions, categorizeReq.context).catch(e => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('unavailable');
  });

  it('maps malformed JSON to kind=bad-response', async () => {
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => { throw new Error('bad json'); } });
    const err = await categorize(categorizeReq.transactions, categorizeReq.context).catch(e => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('bad-response');
  });
});

describe('parseSms', () => {
  it('returns null when the server reports an empty parse ({})', async () => {
    global.fetch.mockResolvedValueOnce(jsonRes(200, { parsed: {} }));
    expect(await parseSms('gibberish')).toBeNull();
  });
});
