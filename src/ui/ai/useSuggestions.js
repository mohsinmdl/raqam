// U1 auto-categorize — the suggestion BATCH + cache + graduation orchestration a
// list surface (Transactions / Dashboard) owns (FD frontend-components "State
// management"; L3/L6/L7). Everything is gated on useAI().enabled, so with AI off
// this hook holds an empty cache and no offer, and the host renders exactly as
// pre-AI (US-1/US-3).
//
// Writes go ONLY through the existing store actions the caller passes nothing for
// here — the caller wires chip apply to its own categorizeOne; this hook owns the
// advisory prefs (accept counts / dismissed flags via setPrefs) and the payee
// rule (upsertPayee) that graduation creates.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/StoreProvider.jsx';
import { upsertPayee } from '../../store/actions.js';
import { payeeKey } from '../../lib/payees.js';
import {
  buildContext, collectTargets, dismissRule, recordAccept, validateSuggestions,
} from '../../lib/aiSuggest.js';
import { useAI } from './useAI.js';

// Debounce after the visible needs-category id-set settles (BR-U1-12).
const DEBOUNCE_MS = 800;

// `needsCatIds`: a Set (or array) of the visible needs-category tx ids.
export function useSuggestions(needsCatIds) {
  const { data: S, prefs, setPrefs, applyData } = useStore();
  const ai = useAI();

  const [cache, setCache] = useState(() => new Map()); // txId -> Suggestion[]
  const [offer, setOffer] = useState(null);            // { payeeName, categoryId, categoryName } | null

  // Refs so the debounced job reads FRESH store/prefs without re-arming on every
  // keystroke — the only trigger that should refetch is the id-set (or enable).
  const sRef = useRef(S); sRef.current = S;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const aiRef = useRef(ai); aiRef.current = ai;

  // Stable, order-independent key for the visible needs-category id-set.
  const idKey = useMemo(() => {
    const arr = needsCatIds instanceof Set ? [...needsCatIds] : (needsCatIds || []);
    return arr.slice().sort().join(',');
  }, [needsCatIds]);

  useEffect(() => {
    // AI off, or nothing to ask about → empty cache, no request (US-1/US-3).
    if (!ai.enabled || !idKey) { setCache(new Map()); return undefined; }
    const ids = idKey.split(',');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const store = sRef.current;
      const context = buildContext(store);          // L1 guard (null under MIN_HISTORY)
      const targets = context ? collectTargets(store, ids) : [];
      if (!context || targets.length === 0) { if (!cancelled) setCache(new Map()); return; }
      try {
        const map = await aiRef.current.categorize(targets, context); // L3 single batch
        if (cancelled) return;
        setCache(new Map(Object.entries(validateSuggestions(map, sRef.current)))); // L5
      } catch {
        if (!cancelled) setCache(new Map()); // failure silence (BR-U1-13)
      }
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
    // Refetch ONLY when the id-set changes or AI is toggled (BR-U1-12 / Q5).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.enabled, idKey]);

  // Record an accept and, on the 3rd for a pair, surface the one-time rule offer
  // (L7). The category WRITE is the caller's existing categorizeOne — this only
  // touches advisory prefs.
  const recordAcceptFor = useCallback((txId, categoryId) => {
    const tx = sRef.current.transactions.find(t => t.id === txId);
    if (!tx) return;
    const { prefsPatch, offer: nextOffer } = recordAccept(prefsRef.current, tx, categoryId);
    if (Object.keys(prefsPatch).length) setPrefs(prefsPatch);
    if (nextOffer) {
      const cat = sRef.current.categories.find(c => c.id === categoryId);
      setOffer({ payeeName: nextOffer.payeeName, categoryId, categoryName: cat ? cat.name : '' });
    }
  }, [setPrefs]);

  const acceptOffer = useCallback(() => {
    setOffer(cur => {
      if (cur) applyData(d => upsertPayee(d, { name: cur.payeeName, patch: { autoCategorize: true, autoCategoryId: cur.categoryId } }));
      return null;
    });
  }, [applyData]);

  const dismissOffer = useCallback(() => {
    setOffer(cur => {
      if (cur) setPrefs(dismissRule(prefsRef.current, payeeKey(cur.payeeName) + '|' + cur.categoryId));
      return null;
    });
  }, [setPrefs]);

  return { suggestions: cache, recordAccept: recordAcceptFor, offer, acceptOffer, dismissOffer };
}
