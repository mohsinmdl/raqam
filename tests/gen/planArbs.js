// Centralized fast-check generators for the plan-formatting suites (PBT-07).
// Domain-constrained on purpose: amounts are the integers the ledger stores
// plus 2-dp cents (never 3+ fraction digits — display formatting is defined
// on at most two), dates are real calendar days incl. leap days and month
// ends, and settings cross the full 0017 catalogues via seed.js so a new key
// automatically joins every property.
import fc from 'fast-check';
import { PLAN_DATE_FORMATS, PLAN_NUMBER_FORMATS, PLAN_PLACEMENTS } from '../../src/store/seed.js';

const p2 = n => String(n).padStart(2, '0');

// 0, ±1, grouping boundaries, big magnitudes, and 2-dp cents.
export const arbAmount = fc.oneof(
  fc.constantFrom(0, 1, -1, 999, 1000, -1000, 99999, 100000, 999999, 123456.78, -123456.78, 1234567.89, 1e12, -1e12),
  fc.integer({ min: -1e12, max: 1e12 }),
  fc.integer({ min: -1e10, max: 1e10 }).map(c => c / 100), // cents
);

// Valid 'YYYY-MM-DD' days, 1900–2999 (parseTypedDate's own plausibility
// range). Day is clamped into the month so every draw is a real date; the
// constants pin the interesting calendar edges regardless of shrink paths.
export const arbDate = fc.oneof(
  fc.constantFrom('2028-02-29', '2000-02-29', '1900-01-01', '2999-12-31', '2026-08-31', '2026-04-30', '2026-02-28'),
  fc.record({
    y: fc.integer({ min: 1900, max: 2999 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 31 }),
  }).map(({ y, m, d }) => `${y}-${p2(m)}-${p2(Math.min(d, new Date(y, m, 0).getDate()))}`),
);

export const arbNumberFormat = fc.constantFrom(...PLAN_NUMBER_FORMATS);
export const arbDateFormat = fc.constantFrom(...PLAN_DATE_FORMATS);
export const arbPlacement = fc.constantFrom(...PLAN_PLACEMENTS);
// Curated-symbol and fallback-symbol currencies both appear.
export const arbCurrency = fc.constantFrom('PKR', 'USD', 'EUR', 'GBP', 'JPY', 'INR', 'CHF', 'BOB', 'ZMW');

// Full settings cross (8 number × 7 date × 3 placement, times currencies).
export const arbSettings = fc.record({
  currency: arbCurrency,
  currencyPlacement: arbPlacement,
  numberFormat: arbNumberFormat,
  dateFormat: arbDateFormat,
});

// Rows for the plan-scoping partition property (P9): each row carries the
// plan it belongs to; the test stamps it through sync.js pushRow under that
// plan and asserts the stamped sets partition cleanly.
export const arbStoreRows = fc.array(
  fc.record({
    id: fc.integer({ min: 0, max: 1e9 }).map(n => 'row' + n),
    name: fc.string({ maxLength: 12 }),
    plan: fc.constantFrom('p1', 'p2'),
  }),
  { maxLength: 40 },
);

export { fc };
