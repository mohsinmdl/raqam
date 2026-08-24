// U2 sms-parse — tier-1 deterministic SMS→transaction parser (client, PURE).
//
// No React, no network, no fixtures. The registry walk (L1) + shared field
// helpers (L2) produce a `ParsedSms` ({ amount, direction, date, merchant,
// last4 } — all optional); `resolveAccount` (L4) and `toTxSeed` (L5) turn a
// parse into a prefill seed for the EXISTING `openers.addTx`. Nothing here
// writes; the editor is always the gate (business-rules BR-U2-1..12).
//
// Amounts are integer PKR strings on the way out; the SMS digits are
// authoritative (BR-U2-3 — the plan's display numberFormat is never applied).
import { todayStr } from './dates.js';

const p2 = n => String(n).padStart(2, '0');

// ---- L2 shared field helpers ----------------------------------------------

// First currency-tagged number → integer PKR. Strips Rs/PKR + thousands
// separators, keeps the decimal for rounding, then rounds (BR-U2-3).
const AMOUNT_RE = /(?:PKR|RS\.?|Rs\.?)\s*([\d,]+(?:\.\d+)?)/i;
export function parseAmount(text) {
  const m = String(text).match(AMOUNT_RE);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

// Keyword scan; when both a debit and a credit verb appear, the one nearer the
// front (which is where the transaction verb sits, ahead of any "Avbl Bal"
// tail) wins — BR-U2 edge "the transaction verb near the amount wins".
const DEBIT_RE = /\b(?:debited|debit|withdrawn|withdrawal|spent|paid|purchase|deducted|charged)\b/i;
const CREDIT_RE = /\b(?:credited|credit|received|deposited|deposit|refunded|refund)\b/i;
export function parseDirection(text) {
  const s = String(text);
  const d = s.search(DEBIT_RE);
  const c = s.search(CREDIT_RE);
  if (d === -1 && c === -1) return undefined;
  if (d === -1) return 'credit';
  if (c === -1) return 'debit';
  return d <= c ? 'debit' : 'credit';
}

// Text after at/to/@ up to the next delimiter (a date, "Avbl Bal", newline,
// punctuation). Empty is allowed (→ undefined).
// The marker skips account phrases ("to A/C", "to your account") so those never
// land in the merchant field; the capture stops at a date, a "via/using/ref"
// tail, an "Avbl Bal", punctuation, or the line end.
const MERCHANT_RE = /(?:\bat|\bto|@)\s+(?!(?:A\/C|a\/c|your|account|acct)\b)([^\n]+?)(?=\s+(?:on|dated|via|using|ref|trx|txn|thru)\b|\s+Avbl|\s+Avl|\s+Bal\b|[,.]|\s+-\s+|\n|$)/i;
export function parseMerchant(text) {
  const m = String(text).match(MERCHANT_RE);
  if (!m) return undefined;
  const s = m[1].trim();
  return s || undefined;
}

// A/C **NNNN · card ending NNNN · xxNNNN · *NNNN — the trailing 4 digits.
const LAST4_RES = [
  /A\/C\s*(?:no\.?\s*)?\*+\s*(\d{4})/i,
  /A\/C\s*(?:no\.?\s*)?(?:ending\s*)?(\d{4})\b/i,
  /card\s*(?:no\.?\s*)?ending\s*(\d{4})/i,
  /\bx{2,}\s*(\d{4})\b/i,
  /\*{2,}\s*(\d{4})\b/i,
];
export function parseLast4(text) {
  const s = String(text);
  for (const re of LAST4_RES) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return undefined;
}

// Known PK date shapes → 'YYYY-MM-DD' (BR-U2-5): DD-Mon-YYYY, YYYY-MM-DD,
// DD/MM/YYYY, DD-MM-YY. Unparseable → undefined (seed then defaults to today;
// a non-today date is NEVER invented).
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toIso(y, mo, d) {
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return undefined;
  return `${y}-${p2(mo)}-${p2(d)}`;
}
function fullYear(s) { const n = Number(s); return s.length <= 2 ? 2000 + n : n; }
export function parseDate(text) {
  const s = String(text);
  // DD-Mon-YYYY / DD Mon YYYY (24-Aug-2026, 24 Aug 26)
  let m = s.match(/\b(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{2,4})\b/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return toIso(fullYear(m[3]), mo, Number(m[1]));
  }
  // YYYY-MM-DD (ISO)
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  // DD/MM/YYYY · DD-MM-YY · DD/MM/YY (day-first, PK convention)
  m = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (m) return toIso(fullYear(m[3]), Number(m[2]), Number(m[1]));
  return undefined;
}

// Build a ParsedSms from the shared helpers; omit fields that aren't present.
function buildParsed(text) {
  const out = {};
  const amount = parseAmount(text); if (amount !== undefined) out.amount = amount;
  const direction = parseDirection(text); if (direction) out.direction = direction;
  const date = parseDate(text); if (date) out.date = date;
  const merchant = parseMerchant(text); if (merchant) out.merchant = merchant;
  const last4 = parseLast4(text); if (last4) out.last4 = last4;
  return out;
}

// A parse is usable (L1) only with amount AND direction (BR-U2-7).
export function isUsable(parsed) {
  return !!parsed && typeof parsed.amount === 'number' && (parsed.direction === 'debit' || parsed.direction === 'credit');
}

// ---- L1 registry -----------------------------------------------------------
// Ordered bank entries (cheap identifier `test`, shared `extract`) ending in a
// generic fallback whose test is simply "has an amount and a direction"
// (BR-U2-2). Best-effort over common Pakistani debit/credit SMS shapes.
const bankEntry = (bank, test) => ({ bank, test: t => test.test(t), extract: buildParsed });

export const BANK_PATTERNS = [
  bankEntry('HBL', /\bHBL\b|habib\s*bank/i),
  bankEntry('UBL', /\bUBL\b|united\s*bank/i),
  bankEntry('MCB', /\bMCB\b|muslim\s*commercial/i),
  bankEntry('Bank Alfalah', /alfalah/i),
  bankEntry('Meezan', /meezan/i),
  bankEntry('Faysal', /faysal/i),
  bankEntry('BankIslami', /bank\s*islami/i),
  bankEntry('Standard Chartered', /standard\s*chartered|\bSCB\b/i),
  bankEntry('JazzCash', /jazz\s*cash/i),
  bankEntry('easypaisa', /easy\s*paisa/i),
  bankEntry('Raqami', /raqami/i),
  // Generic fallback: any SMS that yields an amount + a direction keyword.
  {
    bank: 'generic',
    test: t => parseAmount(t) !== undefined && parseDirection(t) !== undefined,
    extract: buildParsed,
  },
];

// L1/L2 — first registry entry whose test matches AND whose extract is usable.
// A partial (non-usable) hit falls through to the generic entry, then to null.
export function parseSmsLocal(text) {
  if (!text) return null;
  const norm = String(text).replace(/\s+/g, ' ').trim();
  for (const entry of BANK_PATTERNS) {
    if (!entry.test(norm)) continue;
    const parsed = entry.extract(norm);
    if (isUsable(parsed)) return parsed;
  }
  return null;
}

// ---- L4 account resolution -------------------------------------------------
// last4 fills a ref only on EXACTLY ONE match across accounts+cards (BR-U2-4);
// 0 or >1 (including an account AND a card sharing the digits) → blank {}.
export function resolveAccount(parsed, S) {
  const last4 = parsed && parsed.last4;
  if (!last4 || !S) return {};
  const accs = (S.accounts || []).filter(a => a.last4 === last4);
  const cards = (S.cards || []).filter(c => c.last4 === last4);
  if (accs.length + cards.length !== 1) return {};
  return accs.length === 1 ? { ref: 'acc:' + accs[0].id } : { ref: 'card:' + cards[0].id };
}

// ---- L5 seed building ------------------------------------------------------
// Partial seed for openers.addTx(openDrawer, type, seed). Missing fields fall
// to defaults (date→today, account→blank); nothing is fabricated (BR-U2-12).
export function seedType(parsed) {
  return parsed && parsed.direction === 'credit' ? 'income' : 'expense';
}

export function toTxSeed(parsed, S) {
  const p = parsed || {};
  const type = seedType(p);
  const seed = {
    type,
    amount: typeof p.amount === 'number' ? String(p.amount) : '',
    date: p.date || todayStr(),
    merchant: p.merchant || '',
  };
  const { ref } = resolveAccount(p, S);
  if (ref) {
    if (type === 'expense') seed.payWith = ref;
    else seed.account = ref;
  }
  return seed;
}
