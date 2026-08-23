// Example-based pins for the plan-formatting engine (BR-U3-8, PBT-10
// complement): catalogue single-sourcing, one fixture per number/date format
// (the catalogue labels ARE the fixtures), placements, masks, lakh, the
// legacy-equivalence spot checks, parsing tie-rules, and the wrapper/input
// surfaces under a temporarily rebound singleton.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAN_DATE_FORMATS, PLAN_DEFAULTS, PLAN_NUMBER_FORMATS, PLAN_PLACEMENTS } from '../src/store/seed.js';
import { CURRENCIES, DATE_FORMATS, NBSP, NUMBER_FORMATS, PLACEMENTS, SYMBOLS, symbolFor } from '../src/lib/planFormatOptions.js';
import { LEGACY_SETTINGS, activeFormat, makeFormatter, maskDigits, setActiveFormat } from '../src/lib/planFormat.js';
import { fmtDate, fmtNum, fmtPKR, fmtPKRCompact, fmtSigned } from '../src/lib/calc.js';
import { datePlaceholder, parseTypedDate } from '../src/lib/dates.js';
import { caretAfterDigits, digitsBefore, formatAmountInput } from '../src/lib/amountInput.js';
import { parseAmt } from '../src/lib/util.js';
import { applyCalcExpr } from '../src/lib/calcExpr.js';
import { displayOf } from '../src/lib/keypadState.js';

const fmt = over => makeFormatter({ ...LEGACY_SETTINGS, ...over });

// Every test that rebinds the singleton restores the pre-bind default, so no
// other suite can ever observe a non-legacy format.
afterEach(() => setActiveFormat(LEGACY_SETTINGS));

describe('catalogue single-source (BR-U3-7)', () => {
  // Hardcoded copies of the CHECK lists in supabase/migrations/0017_plans.sql
  // — if a key is ever added/renamed there, this test forces seed.js and the
  // decorated catalogues to move in the same commit.
  const CHECK_0017_NUMBER = ['comma-dot', 'dot-comma', 'space-dot', 'apostrophe-dot', 'space-dash', 'space-comma', 'comma-slash', 'lakh'];
  const CHECK_0017_DATE = ['YYYY/MM/DD', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY.MM.DD'];
  const CHECK_0017_PLACEMENT = ['before', 'after', 'none'];

  it('seed keys match the 0017 CHECK lists', () => {
    expect(PLAN_NUMBER_FORMATS).toEqual(CHECK_0017_NUMBER);
    expect(PLAN_DATE_FORMATS).toEqual(CHECK_0017_DATE);
    expect(PLAN_PLACEMENTS).toEqual(CHECK_0017_PLACEMENT);
  });

  it('decorated catalogues carry exactly the seed keys, in order, fully specced', () => {
    expect(NUMBER_FORMATS.map(f => f.key)).toEqual(PLAN_NUMBER_FORMATS);
    expect(DATE_FORMATS.map(f => f.key)).toEqual(PLAN_DATE_FORMATS);
    expect(PLACEMENTS.map(p => p.key)).toEqual(PLAN_PLACEMENTS);
    NUMBER_FORMATS.forEach(f => { expect(f.group).toBeTruthy(); expect(f.decimal).toBeTruthy(); expect(['3', '3-then-2']).toContain(f.grouping); expect(f.label).toBeTruthy(); });
    DATE_FORMATS.forEach(f => { expect(['YMD', 'DMY', 'MDY']).toContain(f.order); expect(['/', '-', '.']).toContain(f.sep); });
  });

  it('PLAN_DEFAULTS stays inside the catalogues; LEGACY_SETTINGS differs only in placement', () => {
    expect(PLAN_NUMBER_FORMATS).toContain(PLAN_DEFAULTS.numberFormat);
    expect(PLAN_DATE_FORMATS).toContain(PLAN_DEFAULTS.dateFormat);
    expect(PLAN_PLACEMENTS).toContain(PLAN_DEFAULTS.currencyPlacement);
    // The migrated plan (0017 backfill) renders the historical 'Rs ' prefix;
    // the column default 'none' is only the New Plan modal's starting choice.
    expect(LEGACY_SETTINGS).toEqual({ ...PLAN_DEFAULTS, currencyPlacement: 'before' });
  });

  it('currency list is the full active ISO set with unique codes; curated symbols stay inside it', () => {
    const codes = CURRENCIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThanOrEqual(150);
    codes.forEach(c => expect(c).toMatch(/^[A-Z]{3}$/));
    Object.keys(SYMBOLS).forEach(c => expect(codes).toContain(c));
    expect(codes).toContain('PKR');
  });
});

describe('number-format fixtures — the catalogue label is the rendering', () => {
  it.each(NUMBER_FORMATS.map(f => [f.key, f.label]))('%s renders 123456.78 as its label', (key, label) => {
    expect(fmt({ numberFormat: key, currencyPlacement: 'none' }).num(123456.78, true)).toBe(label);
  });

  it('lakh: 1234567.89 → 12,34,567.89', () => {
    expect(fmt({ numberFormat: 'lakh', currencyPlacement: 'none' }).num(1234567.89, true)).toBe('12,34,567.89');
  });

  it('0-dp mirrors legacy Math.round; 2-dp keeps fractions', () => {
    const f = fmt({ numberFormat: 'comma-dot' });
    expect(f.num(1234.6)).toBe('1,235');
    expect(f.num(1234.5, true)).toBe('1,234.50');
    expect(f.num(0, true)).toBe('0.00');
  });
});

describe('date fixtures — one per pattern', () => {
  const EXPECT = {
    'YYYY/MM/DD': '2026/08/05',
    'YYYY-MM-DD': '2026-08-05',
    'DD-MM-YYYY': '05-08-2026',
    'DD/MM/YYYY': '05/08/2026',
    'DD.MM.YYYY': '05.08.2026',
    'MM/DD/YYYY': '08/05/2026',
    'YYYY.MM.DD': '2026.08.05',
  };
  it.each(PLAN_DATE_FORMATS.map(k => [k, EXPECT[k]]))('%s renders 2026-08-05 as %s', (key, out) => {
    expect(fmt({ dateFormat: key }).date('2026-08-05T14:30')).toBe(out);
  });
});

describe('placement and symbols', () => {
  it('PKR keeps the legacy trailing-space prefix; suffix mirrors the spacing', () => {
    expect(fmt({}).money(123456.78, false, true)).toBe('Rs 123,456.78');
    expect(fmt({ currencyPlacement: 'after' }).money(123456.78, false, true)).toBe('123,456.78 Rs');
    expect(fmt({ currencyPlacement: 'none' }).money(123456.78, false, true)).toBe('123,456.78');
  });

  it('sign sits outside the symbol, as today', () => {
    expect(fmt({}).money(-1234, false, true)).toBe('−Rs 1,234.00');
    expect(fmt({}).moneySigned(1234, false, true)).toBe('+Rs 1,234.00');
    expect(fmt({ currencyPlacement: 'after', currency: 'USD' }).money(-1234)).toBe('−1,234$');
  });

  it('bare-sign symbols abut the amount; uncurated codes fall back to the code', () => {
    expect(fmt({ currency: 'USD' }).money(1234.56, false, true)).toBe('$1,234.56');
    expect(symbolFor('BOB')).toBe('BOB ');
    expect(symbolFor('BOB', 'after')).toBe(' BOB');
    expect(fmt({ currency: 'BOB' }).money(5)).toBe('BOB 5');
    expect(fmt({ currency: 'BOB', currencyPlacement: 'after' }).money(5)).toBe('5 BOB');
  });

  it('placement catalogue examples compose with symbolFor', () => {
    const by = Object.fromEntries(PLACEMENTS.map(p => [p.key, p]));
    expect(by.before.example(symbolFor('PKR', 'before'))).toBe('Rs 123,456.78');
    expect(by.after.example(symbolFor('PKR', 'after'))).toBe('123,456.78 Rs');
    expect(by.none.example('')).toBe('123,456.78');
  });
});

describe('mask composition (BR-U3-3)', () => {
  it('masks after formatting, for any format', () => {
    expect(fmt({}).money(425000, true)).toBe('Rs •••,•••');
    expect(fmt({ numberFormat: 'space-dot' }).money(1234.5, true, true)).toBe(`Rs •${NBSP}•••.••`);
    expect(fmt({ numberFormat: 'lakh', currencyPlacement: 'none' }).money(1234567, true)).toBe('••,••,•••');
    expect(maskDigits('123,456/78')).toBe('•••,•••/••');
  });
});

describe('legacy-oracle spot examples (BR-U3-1)', () => {
  it('the engine under LEGACY_SETTINGS is today\'s formatter', () => {
    const f = makeFormatter(LEGACY_SETTINGS);
    expect(f.money(425000)).toBe('Rs 425,000');
    expect(f.money(0)).toBe('Rs 0');
    expect(f.moneySigned(425000)).toBe('+Rs 425,000');
    expect(f.moneyCompact(1250000)).toBe('Rs 1.25M');
    expect(f.moneyCompact(-1200000000)).toBe('−Rs 1.2B');
    expect(f.date('2026-08-17')).toBe('17/08/2026');
    expect(f.typedDateOrder).toBe('DMY');
  });

  it('the wrappers stay bound to it by default', () => {
    expect(fmtPKR(425000)).toBe('Rs 425,000');
    expect(fmtSigned(-450, true)).toBe('−Rs •••');
    expect(fmtNum(1234, true)).toBe('1,234.00');
    expect(fmtPKRCompact(1250000)).toBe('Rs 1.25M');
    expect(fmtDate('2026-08-17T09:00')).toBe('17/08/2026');
    expect(datePlaceholder()).toBe('dd/mm/yyyy');
  });
});

describe('parseAmount tie-rules (A4, BR-U3-6)', () => {
  it('dot-comma: a 3-digit tail dot is grouping, short tails are fractions', () => {
    const f = fmt({ numberFormat: 'dot-comma' });
    expect(f.parseAmount('1.234')).toBe(1234);
    expect(f.parseAmount('12,5')).toBe(12.5);
    expect(f.parseAmount('12.5')).toBe(12.5); // '.' not in a group position
    expect(f.parseAmount('1.234.567,89')).toBe(1234567.89);
  });

  it('comma-slash: "/" is the decimal, "." still accepted', () => {
    const f = fmt({ numberFormat: 'comma-slash' });
    expect(f.parseAmount('123,456/78')).toBe(123456.78);
    expect(f.parseAmount('123,456.78')).toBe(123456.78);
  });

  it('space formats read NBSP and typed spaces alike', () => {
    const f = fmt({ numberFormat: 'space-dash' });
    expect(f.parseAmount(`123${NBSP}456-78`)).toBe(123456.78);
    expect(f.parseAmount('123 456-78')).toBe(123456.78);
    expect(f.parseAmount('-123 456-78')).toBe(-123456.78); // leading '-' is the sign
  });

  it('mid-typing tails and bare fractions resolve; ambiguity and garbage are null', () => {
    const f = fmt({});
    expect(f.parseAmount('5.')).toBe(5);
    expect(f.parseAmount('.5')).toBe(0.5);
    expect(f.parseAmount('−1,234')).toBe(-1234);
    expect(f.parseAmount('1.2.3')).toBe(null); // two dots, neither grouping under comma-dot
    expect(f.parseAmount('1.234')).toBe(null); // 3-digit tail can't be a fraction, '.' isn't this plan's group
    expect(f.parseAmount('')).toBe(null);
    expect(f.parseAmount('.')).toBe(null);
    expect(f.parseAmount('12ab')).toBe(null);
    expect(f.parseAmount("12'345")).toBe(null); // apostrophe belongs to another plan
  });
});

describe('typed dates follow the plan order (A5, BR-U3-5)', () => {
  const TODAY = '2026-08-20';
  it('MDY reads 3/4 as March 4; explicit order wins', () => {
    expect(parseTypedDate('3/4', TODAY, 'MDY')).toBe('2026-03-04');
    expect(parseTypedDate('12/31/2026', TODAY, 'MDY')).toBe('2026-12-31');
    expect(parseTypedDate('31/12/2026', TODAY, 'MDY')).toBe(null); // 31 is no month
  });

  it('a bare day stays a day, and ISO stays universal, in every order', () => {
    for (const order of ['DMY', 'MDY', 'YMD']) {
      expect(parseTypedDate('17', TODAY, order)).toBe('2026-08-17');
      expect(parseTypedDate('2026-12-31', TODAY, order)).toBe('2026-12-31');
    }
  });

  it('the default order comes from the active format', () => {
    setActiveFormat({ ...LEGACY_SETTINGS, dateFormat: 'MM/DD/YYYY' });
    expect(parseTypedDate('3/4', TODAY)).toBe('2026-03-04');
    setActiveFormat(LEGACY_SETTINGS);
    expect(parseTypedDate('3/4', TODAY)).toBe('2026-04-03');
  });
});

describe('input surfaces under a rebound singleton', () => {
  it('formatAmountInput groups and normalizes with the plan separators', () => {
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'dot-comma' });
    expect(formatAmountInput('1234567,89')).toBe('1.234.567,89');
    expect(formatAmountInput('1.234.567,89')).toBe('1.234.567,89'); // idempotent
    expect(formatAmountInput('12.5')).toBe('125'); // '.' IS this plan's group char in a live field
    expect(parseAmt('1.234.567,89')).toBe(1234568);
  });

  it('caret math counts the plan\'s value chars', () => {
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'space-comma' });
    const text = `1${NBSP}000${NBSP}000,50`;
    expect(digitsBefore(text, text.length)).toBe(10); // 9 digits + the ',' decimal mark
    expect(caretAfterDigits(text, 7)).toBe(9);
  });

  it('calcExpr normalizes plan separators at the tokenizer boundary only', () => {
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'apostrophe-dot' });
    expect(applyCalcExpr(0, "1'000+500")).toBe(1500);
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'comma-slash' });
    expect(applyCalcExpr(5000, '/4')).toBe(1250);   // '/' keeps dividing
    expect(applyCalcExpr(0, '1,000+2.5')).toBe(1003); // '.' still types a fraction
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'space-dot' });
    expect(applyCalcExpr(0, `1${NBSP}000+1 000`)).toBe(2000);
  });

  it('keypad display groups per plan', () => {
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'lakh' });
    expect(displayOf('1500000×2')).toBe('15,00,000×2');
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'space-dot' });
    expect(displayOf('1500')).toBe(`1${NBSP}500`);
  });
});

describe('defensive fallback', () => {
  it('unknown keys warn and degrade to the legacy rendering', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = makeFormatter({ currency: 'x', currencyPlacement: 'left', numberFormat: 'bogus', dateFormat: 'DDMMYY' });
    expect(warn).toHaveBeenCalledTimes(4);
    expect(f.money(425000)).toBe('Rs 425,000');
    expect(f.date('2026-08-17')).toBe('17/08/2026');
    warn.mockRestore();
  });

  it('absent settings default quietly (the pre-bind case)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(makeFormatter(undefined).money(1)).toBe('Rs 1');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('setActiveFormat rebinding is what activeFormat serves', () => {
    setActiveFormat({ ...LEGACY_SETTINGS, numberFormat: 'lakh' });
    expect(activeFormat().num(1234567)).toBe('12,34,567');
  });
});
