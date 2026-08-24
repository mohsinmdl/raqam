// U3 receipt-scan — tier PREFILL seed builder (client, PURE).
//
// No React, no network, no fixtures. A `ParsedReceipt` ({ merchant, date, total }
// — all optional) from the VLM `/parse-receipt` route is turned into a prefill
// seed for the EXISTING `openers.addTx`. A receipt is always an expense (v1, no
// line items). Nothing here writes; the editor is always the gate (US-13).
//
// Amounts are integer PKR strings on the way out (a receipt total is authoritative
// but never re-formatted); dates stay 'YYYY-MM-DD'. Mirrors smsParse's toTxSeed
// conventions so the two prefill paths behave identically at the editor.
import { todayStr } from './dates.js';

// A parse is usable only when it carries something worth prefilling — at least a
// total OR a merchant. A junk image comes back as {} → not usable → blank editor
// + quiet notice (US-15), handled by the flow.
export function isUsableReceipt(parsed) {
  if (!parsed) return false;
  const hasTotal = typeof parsed.total === 'number' && Number.isFinite(parsed.total);
  const hasMerchant = typeof parsed.merchant === 'string' && parsed.merchant.trim() !== '';
  return hasTotal || hasMerchant;
}

// Build the AddTxSeed for openers.addTx(openDrawer, 'expense', seed). Missing
// fields fall to defaults: no total → amount '' (the editor then requires it, so
// a total is never fabricated); no date → today (a non-today date is never
// invented). `S` is accepted for parity with toTxSeed and future account hints,
// but a receipt carries no account/last4 so it is currently unused.
export function toReceiptSeed(parsed, S) { // eslint-disable-line no-unused-vars
  const p = parsed || {};
  const hasTotal = typeof p.total === 'number' && Number.isFinite(p.total);
  return {
    type: 'expense',
    amount: hasTotal ? String(p.total) : '',
    date: p.date || todayStr(),
    merchant: p.merchant || '',
  };
}
