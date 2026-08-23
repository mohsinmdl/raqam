// Plan-formatting engine (U3). makeFormatter(settings) is PURE: the open
// plan's display settings in, a bundle of string functions out — no store, no
// React, no Intl locale hacks for grouping (Intl cannot produce '123 456-78'
// or '123,456/78', and lakh needs en-IN; one hand-rolled grouping algorithm
// covers all eight formats and is the property-test target anyway).
//
// Nobody imports this from a component: the existing wrappers (calc.js
// fmtNum/fmtPKR/…, dates.js parseTypedDate, amountInput.js) read the
// singleton, so every call site keeps its signature (BR-U3-2). PlanProvider
// binds setActiveFormat(openPlan) once per app lifetime, before StoreProvider
// hydrates; the pre-bind default is the LEGACY settings so nothing can ever
// render differently from today's hardcoded 'Rs 425,000' output — which is
// also why tests that never bind a plan keep passing byte-for-byte (BR-U3-1).
import { DATE_FORMATS, NBSP, NUMBER_FORMATS, symbolFor } from './planFormatOptions.js';

// The migrated plan's settings (0017 backfill): placement 'before' — today's
// UI always renders the 'Rs ' prefix, so 'none' would visibly change every
// amount. (The COLUMN default stays 'none' for the New Plan modal.)
export const LEGACY_SETTINGS = { currency: 'PKR', currencyPlacement: 'before', numberFormat: 'comma-dot', dateFormat: 'DD/MM/YYYY' };

// Digit-preserving mask: every digit becomes '•', everything else (symbol,
// grouping chars, decimal mark, +/− sign) survives untouched — bullet COUNT
// differentiates magnitude without revealing it. Composes AFTER formatting,
// for every format (BR-U3-3). Canonical home is here (money() masks with it);
// calc.js re-exports it under its historical name.
export function maskDigits(formatted) {
  return String(formatted).replace(/[0-9]/g, '•');
}

const NUM_SPEC = Object.fromEntries(NUMBER_FORMATS.map(f => [f.key, f]));
const DATE_SPEC = Object.fromEntries(DATE_FORMATS.map(f => [f.key, f]));

// Compact stays Intl: en-PK trims trailing zeros (1_000_000 → '1M') and uses
// the western M/B/K scale — exactly the legacy fmtPKRCompact digits. Only the
// symbol affix is plan-aware.
const nfCompact = new Intl.NumberFormat('en-PK', { notation: 'compact', maximumFractionDigits: 2 });

// Defensive per-key fallback (BR error table): the DB CHECKs make an unknown
// value unreachable, but a bad key must degrade to today's rendering, loudly,
// not to a crash mid-paint. Absent keys default quietly (the pre-bind case).
function pick(val, ok, fallback, what) {
  if (val == null) return fallback;
  if (ok(val)) return val;
  console.warn(`Raqam: unknown plan ${what} ${JSON.stringify(val)} — falling back to ${JSON.stringify(fallback)}`);
  return fallback;
}

export function makeFormatter(settings) {
  const src = settings || {};
  const currency = pick(src.currency, v => /^[A-Z]{3}$/.test(v), LEGACY_SETTINGS.currency, 'currency');
  const placement = pick(src.currencyPlacement, v => v === 'before' || v === 'after' || v === 'none', LEGACY_SETTINGS.currencyPlacement, 'currency placement');
  const numKey = pick(src.numberFormat, v => !!NUM_SPEC[v], LEGACY_SETTINGS.numberFormat, 'number format');
  const dateKey = pick(src.dateFormat, v => !!DATE_SPEC[v], LEGACY_SETTINGS.dateFormat, 'date format');
  const { group, decimal, grouping } = NUM_SPEC[numKey];
  const { order, sep } = DATE_SPEC[dateKey];
  const symbol = placement === 'none' ? '' : symbolFor(currency, placement);

  // A1 grouping on a RAW digit string — string-in/string-out so amount inputs
  // can group a draft with leading zeros without a number round-trip.
  const groupDigits = grouping === '3-then-2'
    // Lakh: rightmost group of 3, every group of 2 above it (1,23,456).
    ? ds => (ds.length <= 3 ? ds : ds.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, group) + group + ds.slice(-3))
    : ds => ds.replace(/\B(?=(\d{3})+(?!\d))/g, group);

  // A1. Sign lives in money/moneySigned, exactly like the legacy fmtNum: the
  // magnitude alone is formatted. Rounding mirrors legacy byte-for-byte:
  // Math.round for 0-dp, two fixed fraction digits otherwise.
  const num = (n, decimals) => {
    const a = Math.abs(n);
    const fixed = decimals ? a.toFixed(2) : String(Math.round(a));
    const dot = fixed.indexOf('.');
    return dot < 0 ? groupDigits(fixed) : groupDigits(fixed.slice(0, dot)) + decimal + fixed.slice(dot + 1);
  };

  // A2. Symbol per placement, U+2212 for negatives, mask composed LAST.
  const affix = body => (placement === 'before' ? symbol + body : placement === 'after' ? body + symbol : body);
  const money = (n, masked, decimals) => {
    const s = (n < 0 ? '−' : '') + affix(num(n, decimals));
    return masked ? maskDigits(s) : s;
  };
  const moneySigned = (n, masked, decimals) => {
    const s = (n > 0 ? '+' : n < 0 ? '−' : '') + affix(num(n, decimals));
    return masked ? maskDigits(s) : s;
  };
  const moneyCompact = n => (n < 0 ? '−' : '') + affix(nfCompact.format(Math.abs(n)));

  // A3. Pure string assembly — no Date object, naive-local strings stay naive.
  const date = iso => {
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return (order === 'YMD' ? [y, m, d] : order === 'DMY' ? [d, m, y] : [m, d, y]).join(sep);
  };

  // A4 (Q4=A) deterministic dual-separator parsing: the plan decimal AND '.'
  // both read as a decimal mark; group chars (a plain space counts for the
  // NBSP formats) are stripped. The LAST mark is the decimal point iff it has
  // 1–2 trailing digits or ends the string (mid-typing); any other mark only
  // survives when it doubles as this plan's group char — otherwise null, the
  // existing invalid-input affordance. So under dot-comma '1.234' is grouping
  // (1234) but '12.5' is a fraction (12.5), documented and pinned in tests.
  const spaceGroup = group === NBSP;
  const isGroup = ch => ch === group || (spaceGroup && ch === ' ');
  const isMark = ch => ch === decimal || ch === '.';
  const parseAmount = text => {
    let s = String(text == null ? '' : text).trim();
    let sign = 1;
    if (s[0] === '-' || s[0] === '−') { sign = -1; s = s.slice(1); }
    if (!s) return null;
    for (const ch of s) if (!(ch >= '0' && ch <= '9') && !isGroup(ch) && !isMark(ch)) return null;
    let decPos = -1;
    for (let i = s.length - 1; i >= 0; i--) if (isMark(s[i])) { decPos = i; break; }
    if (decPos >= 0 && !/^\d{0,2}$/.test(s.slice(decPos + 1))) decPos = -1;
    let digits = '';
    for (const ch of decPos < 0 ? s : s.slice(0, decPos)) {
      if (ch >= '0' && ch <= '9') digits += ch;
      else if (!isGroup(ch)) return null; // a mark in a position it can't hold — ambiguous
    }
    const frac = decPos < 0 ? '' : s.slice(decPos + 1);
    if (!digits && !frac) return null;
    return sign * Number((digits || '0') + (frac ? '.' + frac : ''));
  };

  return {
    num, money, moneySigned, moneyCompact, date, parseAmount,
    // A5: how parseTypedDate reads short forms under this plan ('MDY' plans
    // read 3/4 as March 4; 'YMD' plans type ISO-style — the 4-digit-first
    // branch — so short forms stay DMY there).
    typedDateOrder: order,
    // Exposed for keypads/inputs (amountInput, DateCell placeholder).
    group, decimal, symbol, placement, groupDigits,
    datePattern: dateKey,
  };
}

// ---- singleton -------------------------------------------------------------
// Bound once per app lifetime by PlanProvider (rebinding is a reload, BR-U2-1).
let active = makeFormatter(LEGACY_SETTINGS);
export function setActiveFormat(settings) { active = makeFormatter(settings); }
export function activeFormat() { return active; }
