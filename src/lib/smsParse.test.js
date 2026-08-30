// U2 sms-parse — tier-1 engine tests. Per-bank realistic samples, the L2 field
// rules (amount/date/last4/direction), L4 account resolution, L5 seed shapes,
// plus fast-check invariants on toTxSeed. Wire shape is locked against the
// shared fixtures (modal/fixtures/parse-sms.*).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import parseReq from '../../modal/fixtures/parse-sms.request.json';
import parseResp from '../../modal/fixtures/parse-sms.response.json';
import { todayStr } from './dates.js';
import {
  isUsable, parseAmount, parseBank, parseDate, parseDirection, parseLast4,
  parseSmsLocal, resolveAccount, seedType, toTxSeed,
} from './smsParse.js';

// The real-world regression this feature fixes: a bank is named ("HBL") but the
// SMS carries no card/account number, so last4 resolution has nothing to bite on.
const HBL_NO_LAST4 = 'Your HBL Debit Card has been charged for a Transaction of PKR 2532.99 on 29/08/2026 23:31:13.';

// ---- fixture lockstep ------------------------------------------------------
describe('wire contract (fixtures)', () => {
  it('parses the request fixture to the exact response ParsedSms shape', () => {
    expect(parseSmsLocal(parseReq.text)).toEqual(parseResp.parsed);
  });
});

// ---- per-bank samples ------------------------------------------------------
const SAMPLES = [
  ['HBL', 'HBL: Rs 5,420.00 debited from A/C **1234 at IMTIAZ on 24-Aug-2026. Avbl Bal Rs 12,300.',
    { amount: 5420, direction: 'debit', date: '2026-08-24', merchant: 'IMTIAZ', last4: '1234' }],
  ['UBL', 'UBL: PKR 2,300 credited to A/C **5678 on 01/08/2026. Avbl Bal PKR 40,000.',
    { amount: 2300, direction: 'credit', date: '2026-08-01', last4: '5678' }],
  ['MCB', 'MCB Alert: Your card ending 4321 was used for a purchase of PKR 899 at CAREEM on 15/08/2026.',
    { amount: 899, direction: 'debit', date: '2026-08-15', merchant: 'CAREEM', last4: '4321' }],
  ['Bank Alfalah', 'Bank Alfalah: Rs. 15,000 withdrawn from ATM using card **9012 on 20-08-2026.',
    { amount: 15000, direction: 'debit', date: '2026-08-20', last4: '9012' }],
  ['Meezan', 'Meezan Bank: Rs 3,750 spent at FOODPANDA via debit card **1111 on 18-Aug-2026.',
    { amount: 3750, direction: 'debit', date: '2026-08-18', merchant: 'FOODPANDA', last4: '1111' }],
  ['Faysal', 'Faysal Bank: PKR 1,200.50 debited from your account **2222 on 2026-08-10. Bal: PKR 9,000.',
    { amount: 1201, direction: 'debit', date: '2026-08-10', last4: '2222' }],
  ['BankIslami', 'BankIslami: Rs 600 credited to your account **3333 on 12/08/2026.',
    { amount: 600, direction: 'credit', date: '2026-08-12', last4: '3333' }],
  ['Standard Chartered', 'Standard Chartered: Your card **4444 has been charged PKR 7,800 at DARAZ on 22-Aug-2026.',
    { amount: 7800, direction: 'debit', date: '2026-08-22', merchant: 'DARAZ', last4: '4444' }],
  ['JazzCash', 'JazzCash: You have received Rs 500 from 03001234567 on 24-08-2026. TID 12345.',
    { amount: 500, direction: 'credit', date: '2026-08-24' }],
  ['easypaisa', 'Easypaisa: Rs 1,000 debited for payment to Ali Khan on 19-08-2026.',
    { amount: 1000, direction: 'debit', date: '2026-08-19', merchant: 'Ali Khan' }],
  ['Raqami', 'Raqami: PKR 250 debited from wallet **7777 at NETFLIX on 23-Aug-2026.',
    { amount: 250, direction: 'debit', date: '2026-08-23', merchant: 'NETFLIX', last4: '7777' }],
];

describe('per-bank parse', () => {
  it.each(SAMPLES)('%s → expected ParsedSms', (_bank, sms, expected) => {
    expect(parseSmsLocal(sms)).toEqual(expected);
  });
});

// ---- field helpers ---------------------------------------------------------
describe('amount (BR-U2-3)', () => {
  it('strips Rs + thousands separators and rounds to integer PKR', () => {
    expect(parseAmount('Rs 5,420.00')).toBe(5420);
    expect(parseAmount('PKR 1,200.50')).toBe(1201); // rounds
    expect(parseAmount('Rs. 899')).toBe(899);
    expect(parseAmount('no currency here 123')).toBeUndefined();
  });
});

describe('date formats (BR-U2-5)', () => {
  it.each([
    ['24-Aug-2026', '2026-08-24'],
    ['24 Aug 2026', '2026-08-24'],
    ['15/08/2026', '2026-08-15'],
    ['2026-08-10', '2026-08-10'],
    ['19-08-26', '2026-08-19'],
  ])('%s → %s', (input, iso) => {
    expect(parseDate('on ' + input + ' done')).toBe(iso);
  });
  it('returns undefined for an unparseable date', () => {
    expect(parseDate('sometime soon')).toBeUndefined();
  });
});

describe('direction (BR-U2-6)', () => {
  it('reads debit/credit keywords, transaction verb nearest the front wins', () => {
    expect(parseDirection('Rs 5 debited ... Avbl credit balance')).toBe('debit');
    expect(parseDirection('Rs 5 credited to your account')).toBe('credit');
    expect(parseDirection('your OTP is 123')).toBeUndefined();
  });
});

describe('last4', () => {
  it.each([
    ['A/C **1234', '1234'],
    ['card ending 4321', '4321'],
    ['xx7777', '7777'],
    ['wallet **9012', '9012'],
  ])('%s → %s', (input, last4) => {
    expect(parseLast4('debit ' + input + ' rest')).toBe(last4);
  });
});

// ---- usable threshold (BR-U2-7) --------------------------------------------
describe('usable threshold', () => {
  it('OTP / promo SMS are not usable → null', () => {
    expect(parseSmsLocal('Your OTP for login is 123456. Do not share it.')).toBeNull();
    expect(parseSmsLocal('Get 20% cashback on your next purchase with HBL! Valid till Aug 31.')).toBeNull();
  });
  it('amount without a direction is not usable', () => {
    expect(isUsable({ amount: 500 })).toBe(false);
    expect(isUsable({ direction: 'debit' })).toBe(false);
    expect(isUsable({ amount: 500, direction: 'debit' })).toBe(true);
  });
});

// ---- generic fallback ------------------------------------------------------
describe('generic fallback (BR-U2-2)', () => {
  it('catches an unlisted-bank debit', () => {
    expect(parseSmsLocal('XYZ Bank: Rs 4,000 debited from A/C **8888 on 21-Aug-2026.')).toEqual({
      amount: 4000, direction: 'debit', date: '2026-08-21', last4: '8888',
    });
  });
});

// ---- L4 account resolution (BR-U2-4) ---------------------------------------
const storeWith = (accounts = [], cards = []) => ({ accounts, cards });
describe('resolveAccount', () => {
  it('exactly one account match → acc ref', () => {
    const S = storeWith([{ id: 'a1', last4: '1234' }], [{ id: 'c1', last4: '5678' }]);
    expect(resolveAccount({ last4: '1234' }, S)).toEqual({ ref: 'acc:a1' });
  });
  it('exactly one card match → card ref', () => {
    const S = storeWith([{ id: 'a1', last4: '1234' }], [{ id: 'c1', last4: '5678' }]);
    expect(resolveAccount({ last4: '5678' }, S)).toEqual({ ref: 'card:c1' });
  });
  it('zero matches → blank', () => {
    const S = storeWith([{ id: 'a1', last4: '1234' }], []);
    expect(resolveAccount({ last4: '9999' }, S)).toEqual({});
  });
  it('ambiguous — account AND card share the digits → blank', () => {
    const S = storeWith([{ id: 'a1', last4: '4444' }], [{ id: 'c1', last4: '4444' }]);
    expect(resolveAccount({ last4: '4444' }, S)).toEqual({});
  });
  it('no last4 → blank', () => {
    expect(resolveAccount({ amount: 5 }, storeWith())).toEqual({});
  });
});

// ---- L1 bank identity (feeds L4 when there is no last4) ---------------------
describe('parseBank (bank → instId)', () => {
  it.each([
    [HBL_NO_LAST4, 'hbl'],
    ['UBL: PKR 2,300 credited to A/C **5678', 'ubl'],
    ['Bank Alfalah: Rs. 15,000 withdrawn from ATM', 'alfalah'],
    ['Standard Chartered: Your card **4444 has been charged', 'scb'],
    ['Meezan Bank: Rs 3,750 spent at FOODPANDA', 'meezan'],
  ])('%s → %s', (text, instId) => {
    expect(parseBank(text)).toBe(instId);
  });
  it('a generic SMS with no known bank → undefined', () => {
    expect(parseBank('Rs 500 debited on 24-08-2026')).toBeUndefined();
  });
  it('missing text → undefined (never throws)', () => {
    expect(parseBank(undefined)).toBeUndefined();
    expect(parseBank('')).toBeUndefined();
  });
});

// ---- L4 account resolution by BANK NAME (no last4) --------------------------
// Product decision (user-chosen): fill from the named bank even when several of
// the user's instruments share it — "first match", corrected in the editor.
const instAcc = (id, instId) => ({ id, instId });
describe('resolveAccount by bank name (no last4)', () => {
  it('names a bank, owns exactly one instrument for it → that ref', () => {
    const S = storeWith([], [instAcc('c1', 'hbl')]);
    expect(resolveAccount(parseSmsLocal(HBL_NO_LAST4), S, HBL_NO_LAST4)).toEqual({ ref: 'card:c1' });
  });
  it('several instruments share the bank → FIRST match (accounts before cards)', () => {
    const S = storeWith([instAcc('a1', 'hbl')], [instAcc('c1', 'hbl'), instAcc('c2', 'hbl')]);
    expect(resolveAccount(parseSmsLocal(HBL_NO_LAST4), S, HBL_NO_LAST4)).toEqual({ ref: 'acc:a1' });
  });
  it('bank named but no instrument for it → blank', () => {
    const S = storeWith([instAcc('a1', 'ubl')], [instAcc('c1', 'meezan')]);
    expect(resolveAccount(parseSmsLocal(HBL_NO_LAST4), S, HBL_NO_LAST4)).toEqual({});
  });
  it('last4 is more specific: a unique last4 match still wins over the bank', () => {
    const S = storeWith([instAcc('a1', 'hbl')], [{ id: 'c1', instId: 'hbl', last4: '4444' }]);
    const parsed = { last4: '4444', bank: 'hbl' };
    expect(resolveAccount(parsed, S, HBL_NO_LAST4)).toEqual({ ref: 'card:c1' });
  });
  it('no text supplied → falls back to the old last4-only behaviour', () => {
    const S = storeWith([instAcc('a1', 'hbl')]);
    expect(resolveAccount(parseSmsLocal(HBL_NO_LAST4), S)).toEqual({});
  });
});

// ---- L5 seed building ------------------------------------------------------
describe('toTxSeed (BR-U2-6/12)', () => {
  const empty = storeWith();
  it('debit → expense with payWith ref', () => {
    const S = storeWith([{ id: 'a1', last4: '1234' }]);
    expect(toTxSeed({ amount: 5420, direction: 'debit', date: '2026-08-24', merchant: 'IMTIAZ', last4: '1234' }, S))
      .toEqual({ type: 'expense', amount: '5420', date: '2026-08-24', merchant: 'IMTIAZ', payWith: 'acc:a1' });
  });
  it('credit → income with account ref', () => {
    const S = storeWith([{ id: 'a1', last4: '5678' }]);
    expect(toTxSeed({ amount: 2300, direction: 'credit', date: '2026-08-01', last4: '5678' }, S))
      .toEqual({ type: 'income', amount: '2300', date: '2026-08-01', merchant: '', account: 'acc:a1' });
  });
  it('omits the ref when last4 does not resolve; date falls to today', () => {
    const seed = toTxSeed({ amount: 500, direction: 'debit' }, empty);
    expect(seed).toEqual({ type: 'expense', amount: '500', date: todayStr(), merchant: '' });
    expect(seed.payWith).toBeUndefined();
  });
  it('seedType maps direction → type', () => {
    expect(seedType({ direction: 'credit' })).toBe('income');
    expect(seedType({ direction: 'debit' })).toBe('expense');
    expect(seedType({})).toBe('expense');
  });
  it('resolves the account by bank name when the SMS has no last4 (regression)', () => {
    const S = storeWith([], [instAcc('c1', 'hbl')]);
    expect(toTxSeed(parseSmsLocal(HBL_NO_LAST4), S, HBL_NO_LAST4))
      .toEqual({ type: 'expense', amount: '2533', date: '2026-08-29', merchant: '', payWith: 'card:c1' });
  });
});

// ---- fast-check properties -------------------------------------------------
describe('toTxSeed properties', () => {
  it('a positive amount always yields a positive-integer amount string', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 5_000_000 }),
      fc.constantFrom('debit', 'credit'),
      (amount, direction) => {
        const seed = toTxSeed({ amount, direction }, {});
        expect(seed.amount).toMatch(/^\d+$/);
        expect(Number(seed.amount)).toBeGreaterThan(0);
      },
    ));
  });
  it('never emits a non-today date it did not parse', () => {
    const today = todayStr();
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 5_000_000 }),
      fc.option(fc.constantFrom('2020-01-01', '2026-08-24', '2019-12-31'), { nil: undefined }),
      (amount, date) => {
        const seed = toTxSeed({ amount, direction: 'debit', ...(date ? { date } : {}) }, {});
        if (date) expect(seed.date).toBe(date);
        else expect(seed.date).toBe(today);
      },
    ));
  });
});
