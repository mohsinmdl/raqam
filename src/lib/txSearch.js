// Search over a transaction — free text AND structured facets.
//
// Two layers live here, both pure so the awkward cases are testable:
//   1. Free text (txHaystack / matchesQuery): the original behaviour — a
//      substring over everything a person might type to find a row (merchant,
//      notes, category, and every account/card the row touches, transfer far
//      side included). An empty query matches everything.
//   2. Structured terms (searchSuggestions / matchesTerm): the register's
//      search box offers interpretations of what you typed — an Account, a
//      Category, a status, a date comparison, an amount comparison, or a
//      field-scoped text match — and picking one filters the rows to it. This
//      mirrors YNAB's register search, adapted to Raqam's data: there is no
//      "reconciled" state here, only Cleared vs Uncleared, so the "Is:" facet
//      offers those two (plus the real "Needs Category" flag) rather than
//      inventing a status the ledger does not store.
import { parseTypedDate } from './dates.js';

// Everything about a transaction that free-text search should look through,
// lowered once. Missing references drop out rather than emitting blanks.
export function txHaystack(t, S) {
  const catName = id => (S.categories.find(c => c.id === id) || {}).name || '';
  const acctName = id => (S.accounts.find(a => a.id === id) || {}).nickname || '';
  const cardName = id => {
    const c = S.cards.find(x => x.id === id);
    return c ? c.nickname + ' ' + (c.last4 || '') : '';
  };
  return [
    t.merchant, t.notes, t.adjustmentReason, catName(t.category),
    acctName(t.accountId), acctName(t.toAccountId),
    cardName(t.cardId), cardName(t.toCardId),
  ].filter(Boolean).join(' ').toLowerCase();
}

// Case- and whitespace-insensitive substring match. An empty query matches
// everything, so the caller need not special-case "no search".
export function matchesQuery(t, q, S) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return true;
  return txHaystack(t, S).includes(needle);
}

// ---- Field helpers for the scoped-text facets -----------------------------
// (payee reads t.merchant directly; the "any" facet defers to matchesQuery —
// only category and memo need a getter.)

const lower = s => (s || '').toLowerCase();
const catName = (t, S) => ((S.categories || []).find(c => c.id === t.category) || {}).name || '';
const memoText = t => [t.adjustmentReason, t.notes].filter(Boolean).join(' ');

const CATEGORIZABLE = t => t.type === 'expense' || t.type === 'income' || t.type === 'refund';

// Outflow / Inflow magnitudes, derived exactly as the register's two columns
// are (txRowOf): money leaving is outflow, money arriving is inflow, a signed
// adjustment picks its side by sign. The unpopulated side is null, so an
// "Outflow ≥ 2" filter never matches a pure inflow row.
//
// `accountId` mirrors txRowOf's forAccountId perspective for the one type whose
// side is perspective-dependent — a transfer. All-accounts (no accountId) puts
// it on the outflow side (it left the source); scoped to the DESTINATION
// account it is that account's inflow, matching the column the register shows.
// An unknown type is excluded from both sides rather than guessed onto one.
export function txFlows(t, accountId) {
  if (t.type === 'expense') return { outflow: t.amount, inflow: null };
  if (t.type === 'income' || t.type === 'refund') return { outflow: null, inflow: t.amount };
  if (t.type === 'transfer') {
    if (accountId && (t.toAccountId === accountId || t.toCardId === accountId)) return { outflow: null, inflow: t.amount };
    return { outflow: t.amount, inflow: null };
  }
  if (t.type === 'adjustment' || t.type === 'cardAdjustment') {
    return t.amount < 0 ? { outflow: -t.amount, inflow: null } : { outflow: null, inflow: t.amount };
  }
  return { outflow: null, inflow: null };
}

// The register's "This needs a category" rule. Mirrors txRowOf (kept in sync by
// hand): it tests the RESOLVED category, so a transaction pointing at a deleted
// category id reads as needing one — the same row the register flags with the
// pill — which `!t.category` alone would miss. Needs the store to resolve.
export function txNeedsCategory(t, S) {
  const cat = t.category ? (S.categories || []).find(c => c.id === t.category) : null;
  return !cat && CATEGORIZABLE(t);
}

// Whether a row belongs to an account/card (either side of a transfer).
function touchesAccount(t, id) {
  return t.accountId === id || t.toAccountId === id || t.cardId === id || t.toCardId === id;
}

// ---- The predicate ---------------------------------------------------------

// Does a transaction satisfy one structured term? Terms are the objects
// searchSuggestions() attaches to each suggestion, so a picked suggestion and
// the filter it applies can never drift apart.
export function matchesTerm(t, term, S, accountId) {
  if (!term) return true;
  switch (term.kind) {
    case 'field': {
      const q = lower(term.q).trim();
      if (!q) return true;
      if (term.field === 'payee') return lower(t.merchant).includes(q);
      if (term.field === 'category') return lower(catName(t, S)).includes(q);
      if (term.field === 'memo') return lower(memoText(t)).includes(q);
      return matchesQuery(t, term.q, S); // 'any'
    }
    case 'account': return touchesAccount(t, term.id);
    case 'category': return t.category === term.id;
    case 'status':
      return term.value === 'uncleared' ? t.status === 'pending' : t.status !== 'pending';
    case 'needsCategory': return txNeedsCategory(t, S);
    case 'date': {
      const d = (t.date || '').slice(0, 10);
      if (!d) return false;
      if (term.op === 'on') return d === term.iso;
      if (term.op === 'onBefore') return d <= term.iso;
      return d >= term.iso; // onAfter
    }
    case 'amount': {
      const flow = txFlows(t, accountId)[term.side];
      if (flow == null) return false;
      if (term.op === 'gte') return flow >= term.value;
      if (term.op === 'lte') return flow <= term.value;
      return flow === term.value; // eq
    }
    // Fail CLOSED. A term whose kind no producer emits is a bug (a renamed or
    // half-added facet); matching every row would show an active filter chip
    // over an unfiltered list — the silent failure hardest to notice. An empty
    // result at least reads as "this filtered something out".
    default: return false;
  }
}

// The single entry point the screen filters on: a structured term wins when
// present, otherwise fall back to free text. So typing-and-Enter keeps the
// original behaviour and picking a suggestion narrows to that facet.
export function matchesSearch(t, { q, term } = {}, S, accountId) {
  return term ? matchesTerm(t, term, S, accountId) : matchesQuery(t, q, S);
}

// ---- Suggestions -----------------------------------------------------------

// A bare number the amount facets compare against. Unlike smsParse's
// parseAmount this needs no currency tag — the search box's "02" means 2.00.
export function parseSearchAmount(text) {
  const s = String(text == null ? '' : text).trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Two decimals, no currency symbol — matches the "2.00" the dropdown shows.
const amt2 = n => Number(n).toFixed(2);

const STATUS_KEYWORDS = [
  ['uncleared', 'Uncleared', 'uncleared'],
  ['cleared', 'Cleared', 'cleared'],
];

const AMOUNT_OPS = [
  ['eq', 'equals'],
  ['gte', 'more or equal to'],
  ['lte', 'less or equal to'],
];

// Ordered interpretations of the typed query, richest-signal first. Pure: the
// caller passes the store slice it reads (accounts, cards, categories) and the
// anchor date a bare day resolves within (the viewed month). Each suggestion
// carries the `term` that picking it applies — see matchesTerm.
//
// Shape of a suggestion: { key, prefix, icon, main, term }, where `main` is
// either a string or { pre, strong, post } for the "Find …" echoes that bold
// the query.
export function searchSuggestions(q, S, anchorIso, limit = 5) {
  const raw = (q || '').trim();
  if (!raw) return [];
  const low = raw.toLowerCase();
  const out = [];
  const accounts = S.accounts || [];
  const cards = S.cards || [];
  const categories = S.categories || [];

  // 1. Accounts and cards whose name contains the query.
  for (const a of accounts) {
    if (a.status === 'closed') continue;
    if (lower(a.nickname).includes(low)) {
      out.push({ key: 'acct:' + a.id, prefix: 'Account:', main: a.nickname,
        term: { kind: 'account', id: a.id, label: 'Account: ' + a.nickname, text: a.nickname } });
    }
  }
  for (const c of cards) {
    const name = c.nickname + (c.last4 ? ' ••' + c.last4 : '');
    if (lower(c.nickname + ' ' + (c.last4 || '')).includes(low)) {
      out.push({ key: 'card:' + c.id, prefix: 'Account:', main: name,
        term: { kind: 'account', id: c.id, label: 'Account: ' + name, text: name } });
    }
  }

  // 2. Categories whose name contains the query (emoji lives in the name).
  for (const cat of categories) {
    if (lower(cat.name).includes(low)) {
      out.push({ key: 'cat:' + cat.id, prefix: 'Category:', main: cat.name,
        term: { kind: 'category', id: cat.id, label: 'Category: ' + cat.name, text: cat.name } });
    }
  }

  // 3. Status (Is:) — Raqam has Cleared / Uncleared, not Reconciled.
  for (const [kw, label] of STATUS_KEYWORDS) {
    if (kw.startsWith(low)) {
      out.push({ key: 'status:' + kw, prefix: 'Is:', icon: 'status-' + kw, main: label,
        term: { kind: 'status', value: kw, label: 'Is: ' + label, text: label } });
    }
  }

  // 4. Needs Category (Is:) — the real categorisation flag.
  if ('needs category'.startsWith(low) || 'uncategorized'.startsWith(low) || 'uncategorised'.startsWith(low)) {
    out.push({ key: 'needsCat', prefix: 'Is:', icon: 'needs', main: 'Needs Category',
      term: { kind: 'needsCategory', label: 'Is: Needs Category', text: 'Needs Category' } });
  }

  // 5. Date (On / On or before / On or after) when the query parses as a date.
  const iso = anchorIso ? parseTypedDate(raw, anchorIso) : null;
  if (iso) {
    const shown = fmtDmy(iso);
    out.push({ key: 'date:on', prefix: 'On:', icon: 'date', main: 'On ' + shown,
      term: { kind: 'date', op: 'on', iso, label: 'On ' + shown, text: 'On ' + shown } });
    out.push({ key: 'date:before', prefix: 'Before:', icon: 'date', main: 'On or before ' + shown,
      term: { kind: 'date', op: 'onBefore', iso, label: 'On or before ' + shown, text: 'On or before ' + shown } });
    out.push({ key: 'date:after', prefix: 'After:', icon: 'date', main: 'On or after ' + shown,
      term: { kind: 'date', op: 'onAfter', iso, label: 'On or after ' + shown, text: 'On or after ' + shown } });
  }

  // 6. Amount (Outflow / Inflow). A numeric query fixes the value; the words
  // "outflow"/"inflow" surface the facet at 0.00 to be edited by typing digits.
  const num = parseSearchAmount(raw);
  const sides = [];
  if (num != null) { sides.push(['outflow', num], ['inflow', num]); }
  else {
    if ('outflow'.startsWith(low)) sides.push(['outflow', 0]);
    if ('inflow'.startsWith(low)) sides.push(['inflow', 0]);
  }
  for (const [side, value] of sides) {
    const Side = side === 'outflow' ? 'Outflow' : 'Inflow';
    for (const [op, phrase] of AMOUNT_OPS) {
      out.push({ key: `amt:${side}:${op}`, prefix: Side + ':', icon: side, main: `${Side} ${phrase} ${amt2(value)}`,
        term: { kind: 'amount', side, op, value, label: `${Side} ${phrase} ${amt2(value)}`, text: `${Side} ${phrase} ${amt2(value)}` } });
    }
  }

  // 7. Find "…" in any field — the default (also what typing + Enter does).
  out.push({ key: 'field:any', prefix: '', main: { pre: 'Find "', strong: raw, post: '" in any field' },
    term: { kind: 'field', field: 'any', q: raw, label: raw, text: raw } });

  // 8-10. Field-scoped text: Payee, Category, Memo.
  for (const [field, label] of [['payee', 'Payee'], ['category', 'Category'], ['memo', 'Memo']]) {
    out.push({ key: 'field:' + field, prefix: label + ':',
      main: { pre: 'Find "', strong: raw, post: '" in the ' + label },
      term: { kind: 'field', field, q: raw, label: `${label}: ${raw}`, text: raw } });
  }

  // Cap only the open-ended entity groups (accounts/cards/categories) so a
  // ledger with dozens of matches does not bury the fixed facets below.
  return capEntities(out, limit);
}

// Keep at most `limit` of the entity suggestions (account/category kinds),
// preserving order and all non-entity facets.
function capEntities(list, limit) {
  let kept = 0;
  return list.filter(s => {
    const isEntity = s.term.kind === 'account' || s.term.kind === 'category';
    if (!isEntity) return true;
    kept += 1;
    return kept <= limit;
  });
}

// DD/MM/YYYY, the order the register itself prints dates in.
function fmtDmy(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
