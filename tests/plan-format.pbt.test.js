// PBT-01 properties P1–P9 for the plan-formatting engine. fast-check's
// default reporter prints the seed and the shrunk counterexample on failure
// (verbose bumps it to the full failure trail), so a red run is replayable
// with fc.assert(..., { seed }) as-is.
import { afterEach, describe, expect, it } from 'vitest';
import { fc, arbAmount, arbDate, arbDateFormat, arbNumberFormat, arbSettings, arbStoreRows } from './gen/planArbs.js';
import { LEGACY_SETTINGS, makeFormatter, maskDigits } from '../src/lib/planFormat.js';
import { NUMBER_FORMATS, NBSP } from '../src/lib/planFormatOptions.js';
import { parseTypedDate } from '../src/lib/dates.js';
import { COLLECTIONS, pushRow, setActivePlanId } from '../src/store/sync.js';

const OPTS = { verbose: 1 };
const fmt = over => makeFormatter({ ...LEGACY_SETTINGS, ...over });
const specOf = key => NUMBER_FORMATS.find(f => f.key === key);

describe('P1 — parseAmount inverts num for every number format × decimals', () => {
  it('round-trips the rounded magnitude', () => {
    fc.assert(fc.property(arbAmount, arbNumberFormat, fc.boolean(), (x, nf, decimals) => {
      const f = fmt({ numberFormat: nf });
      const a = Math.abs(x); // num formats the magnitude; sign lives in money
      const expected = decimals ? Number(a.toFixed(2)) : Math.round(a);
      expect(f.parseAmount(f.num(x, decimals))).toBe(expected);
    }), OPTS);
  });
});

describe('P2 — parseTypedDate inverts date for every date format', () => {
  it('round-trips the ISO day', () => {
    fc.assert(fc.property(arbDate, arbDateFormat, (iso, df) => {
      const f = fmt({ dateFormat: df });
      expect(parseTypedDate(f.date(iso + 'T12:00'), '2026-08-23', f.typedDateOrder)).toBe(iso);
    }), OPTS);
  });
});

describe('P3 — num emits only digits plus that format\'s own separators', () => {
  it('never leaks a foreign character', () => {
    fc.assert(fc.property(arbAmount, arbNumberFormat, fc.boolean(), (x, nf, decimals) => {
      const { group, decimal } = specOf(nf);
      const out = fmt({ numberFormat: nf }).num(x, decimals);
      for (const ch of out) {
        expect(ch >= '0' && ch <= '9' || ch === group || ch === decimal).toBe(true);
      }
    }), OPTS);
  });
});

describe('P4 — grouping never alters the digits', () => {
  it('stripping non-digits from num(x, 0) leaves String(round(|x|))', () => {
    fc.assert(fc.property(arbAmount, arbNumberFormat, (x, nf) => {
      const out = fmt({ numberFormat: nf }).num(x, 0);
      expect(out.replace(/[^0-9]/g, '')).toBe(String(Math.round(Math.abs(x))));
    }), OPTS);
  });
});

describe('P5 — lakh grouping is 3-then-2', () => {
  it('rightmost group has 3 digits, every other full group 2', () => {
    fc.assert(fc.property(arbAmount, x => {
      const groups = fmt({ numberFormat: 'lakh' }).num(x, 0).split(',');
      if (groups.length === 1) { expect(groups[0].length).toBeLessThanOrEqual(3); return; }
      expect(groups[groups.length - 1].length).toBe(3);
      for (let i = 1; i < groups.length - 1; i++) expect(groups[i].length).toBe(2);
      expect(groups[0].length).toBeGreaterThanOrEqual(1);
      expect(groups[0].length).toBeLessThanOrEqual(2);
    }), OPTS);
  });
});

describe('P6 — maskDigits over money preserves shape', () => {
  it('same length; every non-digit survives in place, every digit becomes •', () => {
    fc.assert(fc.property(arbAmount, arbSettings, fc.boolean(), (x, settings, decimals) => {
      const m = makeFormatter(settings).money(x, false, decimals);
      const masked = maskDigits(m);
      expect(masked.length).toBe(m.length);
      for (let i = 0; i < m.length; i++) {
        expect(masked[i]).toBe(/[0-9]/.test(m[i]) ? '•' : m[i]);
      }
    }), OPTS);
  });
});

describe('P7 — placements differ only by the symbol affix', () => {
  it('before/after are none with the symbol spliced in after the sign', () => {
    fc.assert(fc.property(arbAmount, arbSettings, fc.boolean(), (x, settings, decimals) => {
      const before = makeFormatter({ ...settings, currencyPlacement: 'before' });
      const after = makeFormatter({ ...settings, currencyPlacement: 'after' });
      const none = makeFormatter({ ...settings, currencyPlacement: 'none' });
      const sign = x < 0 ? '−' : '';
      const bare = none.money(x, false, decimals).slice(sign.length);
      expect(before.money(x, false, decimals)).toBe(sign + before.symbol + bare);
      expect(after.money(x, false, decimals)).toBe(sign + bare + after.symbol);
    }), OPTS);
  });
});

describe('P8 — defaults-equivalence oracle against the legacy Intl implementations', () => {
  // The pre-U3 bodies of fmtNum/fmtPKR/fmtSigned/fmtPKRCompact, verbatim.
  const nf = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfCompact = new Intl.NumberFormat('en-PK', { notation: 'compact', maximumFractionDigits: 2 });
  const legacyNum = (n, decimals) => { const a = Math.abs(n); return decimals ? nf2.format(a) : nf.format(Math.round(a)); };
  const legacyPKR = (n, masked, decimals) => { const s = (n < 0 ? '−' : '') + 'Rs ' + legacyNum(n, decimals); return masked ? maskDigits(s) : s; };
  const legacySigned = (n, masked, decimals) => { const s = (n > 0 ? '+' : n < 0 ? '−' : '') + 'Rs ' + legacyNum(n, decimals); return masked ? maskDigits(s) : s; };
  const legacyCompact = n => (n < 0 ? '−' : '') + 'Rs ' + nfCompact.format(Math.abs(n));

  it('the migrated plan\'s settings reproduce every legacy output byte-for-byte', () => {
    const f = makeFormatter(LEGACY_SETTINGS);
    fc.assert(fc.property(arbAmount, fc.boolean(), fc.boolean(), (x, masked, decimals) => {
      expect(f.num(x, decimals)).toBe(legacyNum(x, decimals));
      expect(f.money(x, masked, decimals)).toBe(legacyPKR(x, masked, decimals));
      expect(f.moneySigned(x, masked, decimals)).toBe(legacySigned(x, masked, decimals));
      expect(f.moneyCompact(x)).toBe(legacyCompact(x));
    }), OPTS);
  });
});

describe('P9 — plan scoping partitions rows (hosted here per U2 L7)', () => {
  const col = COLLECTIONS.find(c => c.name === 'categoryGroups');
  afterEach(() => setActivePlanId(null));

  it('scoped(p) ∩ scoped(q) = ∅ and their union is everything', () => {
    fc.assert(fc.property(arbStoreRows, rows => {
      const stamped = rows.map(r => {
        setActivePlanId(r.plan);
        return pushRow(col, { id: r.id, name: r.name, sortOrder: 1 });
      });
      const inP1 = stamped.filter(r => r.plan_id === 'p1');
      const inP2 = stamped.filter(r => r.plan_id === 'p2');
      expect(inP1.length + inP2.length).toBe(stamped.length);          // union = all
      expect(inP1.some(r => inP2.includes(r))).toBe(false);            // disjoint
      stamped.forEach((r, i) => expect(r.plan_id).toBe(rows[i].plan)); // stamp = assignment
    }), OPTS);
  });
});

// Cross-format sanity riding the same generators: parsing accepts a plain
// space wherever the format renders NBSP (A4's NBSP ≡ ' ' rule).
describe('parseAmount NBSP ≡ space', () => {
  it('reads its own output with NBSP swapped for typed spaces', () => {
    fc.assert(fc.property(arbAmount, fc.constantFrom('space-dot', 'space-dash', 'space-comma'), (x, nf) => {
      const f = fmt({ numberFormat: nf });
      const out = f.num(x, true).split(NBSP).join(' ');
      expect(f.parseAmount(out)).toBe(Number(Math.abs(x).toFixed(2)));
    }), OPTS);
  });
});
