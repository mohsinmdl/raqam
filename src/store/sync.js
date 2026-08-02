// Supabase sync engine.
//
// The app keeps its single in-memory store and pure actions untouched; this module
// mirrors the store to Supabase by DIFFING the current store against a `lastPushed`
// baseline per collection and pushing upserts/deletes in FK-safe order. The baseline
// only advances on success, so failed pushes self-heal on the next diff.
//
// Collection sync rules:
//   card_products  — fetch-only (global catalogue; no client writes, RLS would deny them)
//   institutions   — fetch + insert/delete of the user's OWN Custom rows only
//   everything else — full upsert/delete sync of the user's rows
import { supabase } from '../lib/supabase.js';

// ---- row mapping (client camelCase <-> DB snake_case) ----------------------

const stripNulls = o => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
};

const COLLECTIONS = [
  {
    name: 'institutions', table: 'institutions', keyOf: r => r.id,
    // Only the user's own Custom institutions are writable; global rows are fetch-only.
    writable: r => r.kind === 'Custom',
    conflictKey: 'id', // PK is plain id here (shared catalogue), not (user_id, id)
    toRow: r => ({ id: r.id, name: r.name, kind: r.kind }),
    fromRow: r => ({ id: r.id, name: r.name, kind: r.kind }),
  },
  {
    name: 'cardProducts', table: 'card_products', keyOf: r => r.id,
    writable: () => false, // global catalogue
    fromRow: r => ({ id: r.id, instId: r.inst_id, name: r.name, type: r.type, network: r.network, tier: r.tier }),
  },
  {
    name: 'categories', table: 'categories', keyOf: r => r.id,
    toRow: r => ({ id: r.id, name: r.name, type: r.type, color: r.color }),
    fromRow: r => ({ id: r.id, name: r.name, type: r.type, color: r.color }),
  },
  {
    name: 'accounts', table: 'accounts', keyOf: r => r.id,
    toRow: r => ({
      id: r.id, inst_id: r.instId, nickname: r.nickname, type: r.type, islamic: !!r.islamic,
      currency: r.currency || 'PKR', last4: r.last4 || '', status: r.status, notes: r.notes || '',
      opened_on: r.createdAt,
    }),
    fromRow: r => ({
      id: r.id, instId: r.inst_id, nickname: r.nickname, type: r.type, islamic: r.islamic,
      currency: r.currency, last4: r.last4, status: r.status, notes: r.notes, createdAt: r.opened_on,
    }),
  },
  {
    name: 'cards', table: 'cards', keyOf: r => r.id,
    toRow: r => stripNulls({
      id: r.id, inst_id: r.instId, product_id: r.productId ?? null, nickname: r.nickname, type: r.type,
      network: r.network, tier: r.tier || '', last4: r.last4 || '',
      linked_account_id: r.linkedAccountId ?? null, credit_limit: r.limit ?? null,
      opening_outstanding: r.openingOutstanding || {}, statement_day: r.statementDay ?? null,
      due_date: r.dueDate ?? null, annual_fee_month: r.annualFeeMonth ?? null,
      status: r.status, theme: r.theme || 'teal',
    }),
    fromRow: r => stripNulls({
      id: r.id, instId: r.inst_id, productId: r.product_id, nickname: r.nickname, type: r.type,
      network: r.network, tier: r.tier, last4: r.last4,
      linkedAccountId: r.linked_account_id, limit: r.credit_limit,
      openingOutstanding: r.opening_outstanding || {}, statementDay: r.statement_day,
      dueDate: r.due_date, annualFeeMonth: r.annual_fee_month,
      status: r.status, theme: r.theme,
    }),
  },
  {
    // No surrogate id: identity is (accountId, month) — mirrors the server PK.
    name: 'snapshots', table: 'snapshots', keyOf: r => `${r.accountId}|${r.month}`,
    conflictKey: 'user_id,account_id,month',
    deleteKeys: ['account_id', 'month'],
    toRow: r => stripNulls({
      account_id: r.accountId, month: r.month, amount: r.amount, status: r.status,
      confirmed_at: r.confirmedAt ?? null, corrected: !!r.corrected, history: r.history || [],
    }),
    fromRow: r => stripNulls({
      accountId: r.account_id, month: r.month, amount: Number(r.amount), status: r.status,
      confirmedAt: r.confirmed_at, corrected: r.corrected || undefined,
      history: (r.history && r.history.length) ? r.history : undefined,
    }),
  },
  {
    name: 'transactions', table: 'transactions', keyOf: r => r.id,
    toRow: r => stripNulls({
      id: r.id, date: r.date, type: r.type, amount: r.amount,
      account_id: r.accountId ?? null, to_account_id: r.toAccountId ?? null,
      card_id: r.cardId ?? null, to_card_id: r.toCardId ?? null,
      is_card_payment: !!r.isCardPayment, fee: r.fee ?? null,
      category_id: r.category ?? null, merchant: r.merchant || '', notes: r.notes || '', status: r.status,
    }),
    fromRow: r => stripNulls({
      id: r.id, date: r.date, type: r.type, amount: Number(r.amount),
      accountId: r.account_id, toAccountId: r.to_account_id,
      cardId: r.card_id, toCardId: r.to_card_id,
      isCardPayment: r.is_card_payment || undefined, fee: r.fee != null ? Number(r.fee) : undefined,
      category: r.category_id, merchant: r.merchant, notes: r.notes, status: r.status,
    }),
  },
  {
    name: 'budgets', table: 'budgets', keyOf: r => r.id,
    toRow: r => stripNulls({ id: r.id, category_id: r.category ?? null, amount: r.amount, label: r.label ?? null }),
    fromRow: r => stripNulls({ id: r.id, category: r.category_id, amount: Number(r.amount), label: r.label }),
  },
  {
    name: 'recurring', table: 'recurring', keyOf: r => r.id,
    toRow: r => stripNulls({
      id: r.id, name: r.name, type: r.type, amount: r.amount, estimated: !!r.estimated,
      freq: r.freq || '', next_date: r.nextDate ?? null, account_id: r.accountId ?? null,
      card_id: r.cardId ?? null, category_id: r.category ?? null,
      behaviour: r.behaviour || 'reminder', status: r.status || 'active', done_this_month: !!r.doneThisMonth,
    }),
    fromRow: r => stripNulls({
      id: r.id, name: r.name, type: r.type, amount: Number(r.amount), estimated: r.estimated,
      freq: r.freq, nextDate: r.next_date, accountId: r.account_id,
      cardId: r.card_id, category: r.category_id,
      behaviour: r.behaviour, status: r.status, doneThisMonth: r.done_this_month || undefined,
    }),
  },
];

// budgets.category null vs undefined: normalize round-trips through fromRow/toRow —
// diffing compares toRow() output so representation quirks don't cause phantom pushes.

// FK-safe push order == COLLECTIONS order; deletes run in reverse.
const PUSH_ORDER = COLLECTIONS;
const DELETE_ORDER = [...COLLECTIONS].reverse();

// ---- fetch -----------------------------------------------------------------

export async function fetchAll() {
  const results = await Promise.all(
    COLLECTIONS.map(c => supabase.from(c.table).select('*'))
  );
  const store = {};
  COLLECTIONS.forEach((c, i) => {
    const { data, error } = results[i];
    if (error) throw new Error(`${c.table}: ${error.message}`);
    store[c.name] = data.map(c.fromRow);
  });
  // Deterministic ordering the UI relies on (transactions newest-first like unshift did)
  store.transactions.sort((a, b) => b.date.localeCompare(a.date));
  return store;
}

// ---- diff ------------------------------------------------------------------

// Returns [{ collection, upserts: {added: [...], changed: [...]}, deletes: [key...] }]
// comparing toRow() representations so client-only quirks don't produce writes.
export function diffStores(prev, next) {
  const out = [];
  for (const c of COLLECTIONS) {
    if (!c.toRow) continue; // fetch-only collections never push
    const writable = c.writable || (() => true);
    const prevRows = new Map((prev?.[c.name] || []).filter(writable).map(r => [c.keyOf(r), r]));
    const nextRows = (next?.[c.name] || []).filter(writable);
    const added = [], changed = [];
    const seen = new Set();
    for (const r of nextRows) {
      const k = c.keyOf(r);
      seen.add(k);
      const p = prevRows.get(k);
      if (!p) added.push(c.toRow(r));
      else if (JSON.stringify(c.toRow(p)) !== JSON.stringify(c.toRow(r))) changed.push(c.toRow(r));
    }
    const deletes = [...prevRows.keys()].filter(k => !seen.has(k));
    if (added.length || changed.length || deletes.length) {
      out.push({ collection: c, added, changed, deletes });
    }
  }
  return out;
}

async function pushDiff(diff) {
  // Inserts/updates in FK order…
  for (const c of PUSH_ORDER) {
    const d = diff.find(x => x.collection === c);
    if (!d) continue;
    if (d.added.length) {
      // ignoreDuplicates: a second device's rollover (or StrictMode double-run)
      // must never overwrite an existing row — e.g. regress a confirmed snapshot.
      const { error } = await supabase.from(c.table)
        .upsert(d.added, { onConflict: c.conflictKey || 'user_id,id', ignoreDuplicates: true });
      if (error) throw Object.assign(new Error(`${c.table} insert: ${error.message}`), { code: error.code, status: error.status });
    }
    if (d.changed.length) {
      const { error } = await supabase.from(c.table)
        .upsert(d.changed, { onConflict: c.conflictKey || 'user_id,id' });
      if (error) throw Object.assign(new Error(`${c.table} update: ${error.message}`), { code: error.code, status: error.status });
    }
  }
  // …deletes in reverse FK order.
  for (const c of DELETE_ORDER) {
    const d = diff.find(x => x.collection === c);
    if (!d || !d.deletes.length) continue;
    if (c.deleteKeys) {
      // Composite-identity rows (snapshots): delete one by one — volumes are tiny.
      for (const key of d.deletes) {
        const [accountId, month] = key.split('|');
        const { error } = await supabase.from(c.table).delete().match({ account_id: accountId, month });
        if (error) throw Object.assign(new Error(`${c.table} delete: ${error.message}`), { code: error.code, status: error.status });
      }
    } else {
      const { error } = await supabase.from(c.table).delete().in('id', d.deletes);
      if (error) throw Object.assign(new Error(`${c.table} delete: ${error.message}`), { code: error.code, status: error.status });
    }
  }
}

// ---- queue -----------------------------------------------------------------

const BACKOFF = [1000, 2000, 5000, 15000];

// Single-flight write-behind queue. `latest` always holds the newest store; a
// push diffs lastPushed -> latest, and only a fully successful push advances
// the baseline. onStatus reports 'synced' | 'syncing' | 'retrying' | 'error'.
export function createSyncQueue({ initialBaseline, onStatus = () => {} }) {
  let lastPushed = initialBaseline;
  let latest = initialBaseline;
  let inFlight = null;
  let retryTimer = null;
  let attempt = 0;
  let stopped = false;

  const status = s => { try { onStatus(s); } catch { /* status display is best-effort */ } };

  async function pushOnce() {
    const target = latest;
    const diff = diffStores(lastPushed, target);
    if (diff.length === 0) { attempt = 0; status('synced'); return; }
    status(attempt > 0 ? 'retrying' : 'syncing');
    await pushDiff(diff);
    lastPushed = target;
    attempt = 0;
    // More changes may have landed while pushing.
    if (latest !== target) return pushOnce();
    status('synced');
  }

  async function run() {
    if (stopped) return;
    try {
      await pushOnce();
    } catch (e) {
      console.error('Raqam sync push failed', e);
      if (e.status === 401) {
        try { await supabase.auth.refreshSession(); } catch { /* fall through to retry */ }
      }
      const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
      attempt += 1;
      status(attempt > 2 ? 'error' : 'retrying');
      retryTimer = setTimeout(() => {
        retryTimer = null;
        inFlight = run().finally(() => { inFlight = null; });
      }, delay);
      return;
    }
  }

  return {
    // Called on every store change (debounced by the caller).
    update(nextStore) {
      latest = nextStore;
      if (!inFlight && !retryTimer) inFlight = run().finally(() => { inFlight = null; });
      else if (!inFlight && retryTimer) {
        // A user action while waiting out backoff retries immediately.
        clearTimeout(retryTimer); retryTimer = null;
        inFlight = run().finally(() => { inFlight = null; });
      }
    },
    // True when everything reached the server.
    isClean() { return diffStores(lastPushed, latest).length === 0; },
    // Await full drain (sign-out, reset, import completion). Gives up after ~timeout.
    async drain(timeoutMs = 15000) {
      const start = Date.now();
      while (!this.isClean() && Date.now() - start < timeoutMs) {
        if (!inFlight) {
          clearTimeout(retryTimer); retryTimer = null;
          inFlight = run().finally(() => { inFlight = null; });
        }
        await new Promise(r => setTimeout(r, 150));
      }
      return this.isClean();
    },
    stop() { stopped = true; clearTimeout(retryTimer); },
  };
}
