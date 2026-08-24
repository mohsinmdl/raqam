// The React entry point for AI features. Composes the toggle pref, endpoint
// configuration, warming state, and the ai.js helpers into one hook every
// surface consumes. The wrappers do warming bookkeeping and then re-throw, so
// each caller keeps its own "degrade as if AI didn't exist" catch path (US-3).
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefs } from '../../store/StoreProvider.jsx';
import * as ai from '../../lib/ai.js';
import { anyInflight, createWarming, endCall, isWarming, startCall } from '../../lib/aiWarming.js';

// How often the poller re-checks whether a slow in-flight call has crossed the
// warming threshold. Fine-grained enough to feel prompt, coarse enough to idle.
const POLL_MS = 500;

export function useAI() {
  const prefs = usePrefs();
  const available = ai.aiConfigured();
  // Default OFF: an undefined pref reads as off (US-1).
  const enabled = Boolean(prefs.aiEnabled) && available;

  const warmRef = useRef(null);
  if (!warmRef.current) warmRef.current = createWarming();
  const timerRef = useRef(null);
  const [warming, setWarming] = useState(false);

  const evaluate = useCallback(() => {
    setWarming(isWarming(warmRef.current, Date.now()));
  }, []);

  const stopPoller = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Wrap one ai.js call: track it for warming, run it, and always untrack on
  // settle. Errors propagate untouched so the caller can degrade.
  const track = useCallback(async (run) => {
    const id = startCall(warmRef.current, Date.now());
    if (!timerRef.current) {
      timerRef.current = setInterval(() => {
        evaluate();
        if (!anyInflight(warmRef.current)) stopPoller();
      }, POLL_MS);
    }
    try {
      return await run();
    } finally {
      endCall(warmRef.current, id);
      evaluate();
      if (!anyInflight(warmRef.current)) stopPoller();
    }
  }, [evaluate, stopPoller]);

  useEffect(() => stopPoller, [stopPoller]);

  const categorize = useCallback((txs, context, opts) => track(() => ai.categorize(txs, context, opts)), [track]);
  const parseSms = useCallback((text, opts) => track(() => ai.parseSms(text, opts)), [track]);
  const parseReceipt = useCallback((file, opts) => track(() => ai.parseReceipt(file, opts)), [track]);
  const digest = useCallback((aggregates, opts) => track(() => ai.digest(aggregates, opts)), [track]);

  return { enabled, available, warming, categorize, parseSms, parseReceipt, digest };
}
