#!/usr/bin/env node
// Raqam -> YNAB one-way load.
//
// Reads the JSON dumps produced by scripts/raqam-dump.sh, keeps a single
// user_id partition, and creates the equivalent categories, accounts, opening
// balances, transactions and budget assignments in a YNAB plan.
//
// Read-only with respect to Raqam. Idempotent with respect to YNAB: every
// transaction carries a deterministic import_id, and accounts/categories are
// matched by (name, type) before being created, so a rate-limited or partial
// run can simply be re-run.
//
//   node scripts/ynab-load.mjs             # dry run, writes nothing
//   node scripts/ynab-load.mjs --apply     # perform the load
//
// Env: YNAB_TOKEN (required), YNAB_BUDGET_ID, RAQAM_DIR, RAQAM_USER.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.YNAB_TOKEN;
const BUDGET = process.env.YNAB_BUDGET_ID;
const DIR = process.env.RAQAM_DIR;
const USER = process.env.RAQAM_USER;
if (!TOKEN || !BUDGET || !DIR || !USER) {
  console.error('Set YNAB_TOKEN, YNAB_BUDGET_ID, RAQAM_DIR, RAQAM_USER.');
  process.exit(1);
}

// --------------------------------------------------------------------------
// Money and ids
// --------------------------------------------------------------------------
// Raqam stores integer whole PKR (0001_init.sql:5); YNAB uses milliunits. The
// plan's currency is already PKR, so this is the entire conversion.
const mu = pkr => Math.round(pkr) * 1000;
const rs = m => (m / 1000).toLocaleString('en-PK', { maximumFractionDigits: 0 });

// import_id is capped at 36 chars, and Raqam ids are already 36-char UUIDs, so
// a raw id cannot carry a prefix. Hash instead — deterministic across runs.
const impId = (prefix, key) =>
  prefix + createHash('sha1').update(key).digest('hex').slice(0, 36 - prefix.length);

// --------------------------------------------------------------------------
// Load and partition
// --------------------------------------------------------------------------
const TABLES = ['institutions', 'categories', 'accounts', 'cards', 'snapshots', 'transactions', 'budgets'];
const raw = {};
for (const t of TABLES) raw[t] = JSON.parse(readFileSync(join(DIR, t + '.json'), 'utf8'));
// institutions is a shared catalogue (user_id NULL = global), so it is looked
// up whole; everything else is scoped to the one user.
const instById = new Map(raw.institutions.map(i => [i.id, i]));
const R = {};
for (const t of TABLES) R[t] = raw[t].filter(r => r.user_id === USER);

const catById = new Map(R.categories.map(c => [c.id, c]));
const accById = new Map(R.accounts.map(a => [a.id, a]));

// --------------------------------------------------------------------------
// Mapping tables
// --------------------------------------------------------------------------
const ACCOUNT_TYPE = {
  'Current': 'checking',
  'Salary': 'checking',
  'Savings': 'savings',
  'Mobile wallet': 'cash',
  'Foreign currency': 'checking', // plan is PKR-only; flagged in the report
};

// Raqam system category id -> existing YNAB default category name.
const REUSE = {
  groceries: '🛒 Groceries',
  dining: '🍽️ Dining out',
  transport: '🚘 Transportation',
  utilities: '⚡️ Utilities',
  mobile: '📱 Phone & Internet',
  rent: '🏠 Rent/Mortgage',
  healthcare: '🩺 Medical expenses',
  entertainment: '🍿 Entertainment',
};
// Raqam system category id -> [new YNAB name, group]. Deliberately no merges:
// budgets are one-per-category in both systems, so folding two Raqam
// categories onto one YNAB category would collide their budget amounts.
const CREATE = {
  fuel: ['⛽️ Fuel', 'Needs'],
  education: ['🎓 Education', 'Needs'],
  shopping: ['🛍️ Shopping', 'Wants'],
  family: ['👪 Family support', 'Needs'],
  charity: ['🤲 Charity & Zakat', 'Needs'],
  fees: ['🏦 Bank fees', 'Bills'],
};
// Group placement for the user's own categories, by name.
const CUSTOM_GROUP = {
  'Cleaning & maintenance': 'Needs',
  'Food Delivery': 'Wants',
  'Pet care': 'Wants',
};
// excludeFromBudget categories hold recoverable advances. YNAB has no
// equivalent exclusion, so they get their own group to stay visually separable.
const RECOVERABLE_GROUP = 'Recoverable (advances)';

// YNAB reserves a set of internal payee name prefixes and rejects the whole
// batch with a 400 if any payee starts with one: "Transfer : ",
// "Starting Balance", "Manual Balance Adjustment",
// "Reconciliation Balance Adjustment". Opening balances therefore cannot use
// the obvious name.
const OPENING_PAYEE = 'Raqam opening balance';

// --------------------------------------------------------------------------
// YNAB client
// --------------------------------------------------------------------------
let calls = 0;
async function api(method, path, body) {
  calls++;
  const res = await fetch(`https://api.ynab.com/v1/budgets/${BUDGET}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface the server's own message — the category schemas are truncated in
    // the published spec, so a 400 here is genuinely informative.
    throw new Error(`${method} ${path} -> ${res.status}\n${text}`);
  }
  return text ? JSON.parse(text).data : null;
}

// --------------------------------------------------------------------------
// Raqam financial rules, mirrored (src/lib/calc.js accountDelta)
// --------------------------------------------------------------------------
function accountDelta(t, accId) {
  if (t.status === 'pending') return 0;
  if (t.type === 'transfer') {
    let d = 0;
    if (t.account_id === accId) d -= t.amount + (t.fee || 0);
    if (t.to_account_id === accId) d += t.amount;
    return d;
  }
  if (t.account_id !== accId) return 0;
  if (t.type === 'expense') return -t.amount;
  if (t.type === 'income' || t.type === 'refund') return t.amount;
  if (t.type === 'adjustment') return t.amount; // signed
  return 0;
}

// --------------------------------------------------------------------------
// Build the load plan
// --------------------------------------------------------------------------
const warn = [];

// Categories actually needed: active expense categories, plus any category an
// existing transaction or budget still points at (even if archived).
const referenced = new Set([
  ...R.transactions.map(t => t.category_id).filter(Boolean),
  ...R.budgets.map(b => b.category_id).filter(Boolean),
]);
const wantedCats = R.categories.filter(
  c => c.type === 'expense' && (c.status === 'active' || referenced.has(c.id))
);

function catPlan(c) {
  if (REUSE[c.id]) return { cat: c, mode: 'reuse', name: REUSE[c.id] };
  if (CREATE[c.id]) return { cat: c, mode: 'create', name: CREATE[c.id][0], group: CREATE[c.id][1] };
  const group = c.exclude_from_budget ? RECOVERABLE_GROUP : (CUSTOM_GROUP[c.name] || 'Wants');
  return { cat: c, mode: 'create', name: c.name, group };
}
const catPlans = wantedCats.map(catPlan);

// Accounts. Credit cards would become creditCard accounts; debit/prepaid/
// virtual cards cannot hold a transaction in Raqam (TxForm.jsx:33 offers only
// credit cards as a payment method) so they are deliberately not created.
const accPlans = R.accounts.map(a => {
  const type = ACCOUNT_TYPE[a.type];
  if (!type) warn.push(`Unknown Raqam account type "${a.type}" on ${a.nickname}; defaulting to checking.`);
  if (a.type === 'Foreign currency') warn.push(`${a.nickname} is a Foreign currency account; the PKR plan will render it as PKR.`);
  if (a.currency !== 'PKR') warn.push(`${a.nickname} currency is ${a.currency}, not PKR.`);
  return { acc: a, name: a.nickname, type: type || 'checking' };
});
const creditCards = R.cards.filter(c => c.type === 'credit');
for (const c of creditCards) {
  const first = Object.keys(c.opening_outstanding || {}).sort()[0];
  accPlans.push({
    card: c, name: c.nickname, type: 'creditCard',
    openingMonth: first, opening: first ? -c.opening_outstanding[first] : 0,
  });
}
for (const c of R.cards.filter(c => c.type !== 'credit')) {
  warn.push(`Card "${c.nickname}" (${c.type}) not created — non-credit cards hold no transactions in Raqam.`);
}

// Opening balances: only the EARLIEST snapshot per account is real new money.
// Raqam writes a fresh snapshot every month at rollover from the computed
// closing balance (actions.js:358-368), so importing later ones would
// double-count each month.
const firstSnap = new Map();
for (const s of R.snapshots) {
  const cur = firstSnap.get(s.account_id);
  if (!cur || s.month < cur.month) firstSnap.set(s.account_id, s);
}
const firstTxMonth = new Map();
for (const t of R.transactions) {
  for (const id of [t.account_id, t.to_account_id]) {
    if (!id) continue;
    const m = t.date.slice(0, 7);
    if (!firstTxMonth.has(id) || m < firstTxMonth.get(id)) firstTxMonth.set(id, m);
  }
}
for (const [id, m] of firstTxMonth) {
  const s = firstSnap.get(id);
  if (s && m < s.month) {
    warn.push(`${accById.get(id)?.nickname}: transactions exist in ${m}, before its earliest snapshot ${s.month} — opening balance may be misplaced.`);
  }
}

const months = [...new Set(R.transactions.map(t => t.date.slice(0, 7)))].sort();
const budgetMonths = [...new Set([...months, ...[...firstSnap.values()].map(s => s.month)])].sort();

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------
function reportPlan() {
  console.log(`Raqam user ${USER}`);
  console.log(`  accounts ${R.accounts.length}  cards ${R.cards.length} (credit ${creditCards.length})  transactions ${R.transactions.length}  categories ${R.categories.length}  budgets ${R.budgets.length}`);
  console.log(`  transaction months: ${months.join(', ') || '—'}`);
  const byType = {};
  for (const t of R.transactions) byType[t.type] = (byType[t.type] || 0) + 1;
  console.log(`  by type: ${JSON.stringify(byType)}`);
  const fees = R.transactions.filter(t => t.type === 'transfer' && t.fee > 0);
  console.log(`  transfers with a fee (split into a separate expense): ${fees.length}`);
  console.log('\nCATEGORIES');
  for (const p of catPlans) {
    console.log(`  ${p.mode === 'reuse' ? 'reuse ' : 'CREATE'} ${p.name}${p.group ? '  [' + p.group + ']' : ''}   <- ${p.cat.name}${p.cat.exclude_from_budget ? ' (excludeFromBudget)' : ''}`);
  }
  const skipped = R.categories.filter(c => !wantedCats.includes(c));
  for (const c of skipped) console.log(`  skip   ${c.name} (${c.type}, ${c.status})${c.type === 'income' ? ' -> Inflow: Ready to Assign' : ''}`);
  console.log('\nACCOUNTS');
  for (const p of accPlans) console.log(`  ${p.name}  ->  ${p.type}`);
  console.log('\nOPENING BALANCES');
  for (const [id, s] of firstSnap) console.log(`  ${accById.get(id)?.nickname}  ${s.month}-01  Rs ${s.amount.toLocaleString('en-PK')}`);
  console.log('\nBUDGETS');
  for (const b of R.budgets) {
    const c = b.category_id ? catById.get(b.category_id) : null;
    if (!b.category_id) { console.log(`  SKIP overall budget Rs ${b.amount.toLocaleString('en-PK')} — YNAB has no equivalent (its total is the sum of categories)`); continue; }
    console.log(`  ${c?.name}  Rs ${b.amount.toLocaleString('en-PK')}  x ${budgetMonths.length} month(s)`);
  }
  const catBudgets = R.budgets.filter(b => b.category_id).length;
  const est = 3 + catPlans.filter(p => p.mode === 'create').length + accPlans.length + 1 + catBudgets * budgetMonths.length + 2;
  console.log(`\nEstimated API requests: ~${est} (limit is 200/hour)`);
  console.log('\nEXPECTED CLOSING BALANCES (Raqam) — must equal YNAB cleared_balance after load');
  for (const a of R.accounts) {
    const open = firstSnap.get(a.id)?.amount || 0;
    const bal = open + R.transactions.reduce((s, t) => s + accountDelta(t, a.id), 0);
    console.log(`  ${a.nickname.padEnd(22)} Rs ${bal.toLocaleString('en-PK')}`);
  }
}

// --------------------------------------------------------------------------
// Pre-flight — validate the mapping against the live plan without writing.
// Catches a renamed default category or an account-name clash before the run
// starts, rather than halfway through an irreversible sequence of creates.
// --------------------------------------------------------------------------
async function preflight() {
  const groups = (await api('GET', '/categories')).category_groups;
  const names = new Set();
  for (const g of groups) for (const c of g.categories) if (!c.deleted) names.add(c.name);
  const groupNames = new Set(groups.filter(g => !g.deleted).map(g => g.name));
  console.log('\nPRE-FLIGHT (live plan)');
  for (const p of catPlans.filter(p => p.mode === 'reuse')) {
    if (!names.has(p.name)) warn.push(`Reuse target category "${p.name}" does not exist in the plan — it would have to be created instead.`);
  }
  for (const g of [...new Set(catPlans.filter(p => p.mode === 'create').map(p => p.group))]) {
    console.log(`  group ${g}: ${groupNames.has(g) ? 'exists' : 'will be created'}`);
  }
  for (const p of catPlans.filter(p => p.mode === 'create')) {
    if (names.has(p.name)) console.log(`  category ${p.name}: already exists, will reuse`);
  }
  const accts = (await api('GET', '/accounts')).accounts.filter(a => !a.deleted);
  for (const p of accPlans) {
    const exact = accts.find(a => a.name === p.name && a.type === p.type);
    const clash = accts.find(a => a.name === p.name);
    if (exact) console.log(`  account ${p.name} (${p.type}): already exists, will reuse`);
    else if (clash) warn.push(`YNAB has "${clash.name}" as ${clash.type} (balance Rs ${rs(clash.balance)}, ${clash.closed ? 'closed' : 'open'}) but Raqam says ${p.type}. The API cannot change an account's name or type, so a second "${p.name}" will be created as ${p.type}; delete the empty ${clash.type} one in the web UI.`);
  }
  const mapped = new Set(accPlans.map(p => p.name));
  for (const a of accts) {
    if (!mapped.has(a.name)) warn.push(`YNAB account "${a.name}" (${a.type}, balance Rs ${rs(a.balance)}) has no Raqam counterpart — it will be left untouched. Delete it in the web UI if it was a placeholder.`);
  }
}

// --------------------------------------------------------------------------
// Apply
// --------------------------------------------------------------------------
async function apply() {
  // --- categories -------------------------------------------------------
  let groups = (await api('GET', '/categories')).category_groups;
  const groupByName = new Map(groups.filter(g => !g.deleted).map(g => [g.name, g]));
  const catByName = new Map();
  for (const g of groups) for (const c of g.categories) if (!c.deleted) catByName.set(c.name, c);

  for (const name of [...new Set(catPlans.filter(p => p.mode === 'create').map(p => p.group))]) {
    if (groupByName.has(name)) continue;
    console.log(`+ category group ${name}`);
    const d = await api('POST', '/category_groups', { category_group: { name } });
    groupByName.set(name, d.category_group);
  }

  for (const p of catPlans) {
    const found = catByName.get(p.name);
    if (found) { p.ynabId = found.id; continue; }
    if (p.mode === 'reuse') throw new Error(`Expected existing YNAB category "${p.name}" was not found.`);
    const gid = groupByName.get(p.group)?.id;
    if (!gid) throw new Error(`Category group "${p.group}" missing.`);
    console.log(`+ category ${p.name} [${p.group}]`);
    const d = await api('POST', '/categories', { category: { name: p.name, category_group_id: gid } });
    p.ynabId = d.category.id;
    catByName.set(p.name, d.category);
  }
  const catMap = new Map(catPlans.map(p => [p.cat.id, p.ynabId]));
  const rta = catByName.get('Inflow: Ready to Assign');
  if (!rta) throw new Error('Inflow: Ready to Assign not found.');

  // --- accounts ---------------------------------------------------------
  const ynabAccounts = (await api('GET', '/accounts')).accounts.filter(a => !a.deleted);
  for (const p of accPlans) {
    const exact = ynabAccounts.find(a => a.name === p.name && a.type === p.type);
    if (exact) { p.ynabId = exact.id; p.transferPayeeId = exact.transfer_payee_id; continue; }
    const clash = ynabAccounts.find(a => a.name === p.name);
    if (clash) {
      // The API has no PATCH/PUT/DELETE for accounts, so a wrong-typed
      // same-name account cannot be corrected here. Create the right one and
      // leave the empty duplicate for manual deletion in the web UI.
      warn.push(`YNAB already has "${p.name}" as ${clash.type} (balance ${rs(clash.balance)}); created a second one as ${p.type}. Delete the empty ${clash.type} account in the web UI.`);
    }
    console.log(`+ account ${p.name} (${p.type})`);
    const d = await api('POST', '/accounts', { account: { name: p.name, type: p.type, balance: 0 } });
    p.ynabId = d.account.id;
    p.transferPayeeId = d.account.transfer_payee_id;
    ynabAccounts.push(d.account);
  }
  const accMap = new Map();      // raqam account/card id -> ynab account id
  const payeeMap = new Map();    // raqam account id -> ynab transfer payee id
  for (const p of accPlans) {
    const key = p.acc ? p.acc.id : p.card.id;
    accMap.set(key, p.ynabId);
    payeeMap.set(key, p.transferPayeeId);
  }

  // --- transactions -----------------------------------------------------
  const txs = [];

  // Opening balances as explicit dated transactions. YNAB's balance-at-creation
  // field would date the starting balance to today, landing it in the wrong month.
  for (const p of accPlans) {
    if (p.acc) {
      const s = firstSnap.get(p.acc.id);
      if (!s) continue;
      txs.push({
        account_id: p.ynabId, date: `${s.month}-01`, amount: mu(s.amount),
        payee_name: OPENING_PAYEE, category_id: rta.id, memo: `Raqam opening balance ${s.month}`,
        cleared: 'cleared', approved: true, import_id: impId('rqsb:', p.acc.id),
      });
    } else if (p.openingMonth) {
      txs.push({
        account_id: p.ynabId, date: `${p.openingMonth}-01`, amount: mu(p.opening),
        payee_name: OPENING_PAYEE, category_id: rta.id, memo: `Raqam opening outstanding ${p.openingMonth}`,
        cleared: 'cleared', approved: true, import_id: impId('rqsb:', p.card.id),
      });
    }
  }

  for (const t of R.transactions) {
    const date = t.date.slice(0, 10);
    const cleared = t.status === 'pending' ? 'uncleared' : 'cleared';
    const cat = t.category_id ? catById.get(t.category_id) : null;
    const base = { date, cleared, approved: true, import_id: impId('rq:', t.id) };
    const memo = [t.notes, t.adjustment_reason].filter(Boolean).join(' · ') || null;

    if (t.type === 'transfer') {
      const src = accMap.get(t.account_id);
      const destKey = t.to_account_id || t.to_card_id;
      const payee = payeeMap.get(destKey);
      if (!src || !payee) { warn.push(`Transfer ${t.id} skipped — endpoint not mapped.`); continue; }
      // YNAB creates the paired side itself when payee_id is the destination's
      // transfer payee. There is nowhere to put Raqam's fee, so it splits off.
      txs.push({ ...base, account_id: src, amount: -mu(t.amount), payee_id: payee, memo });
      if (t.fee > 0) {
        const feeCat = catPlans.find(p => p.cat.id === 'fees')?.ynabId || null;
        txs.push({
          ...base, import_id: impId('rqfee:', t.id), account_id: src, amount: -mu(t.fee),
          payee_name: t.merchant || 'Transfer fee', category_id: feeCat,
          memo: 'Raqam transfer fee' + (memo ? ' · ' + memo : ''),
        });
      }
      continue;
    }

    const acct = accMap.get(t.account_id || t.card_id);
    if (!acct) { warn.push(`Transaction ${t.id} (${t.type}) skipped — no mapped account.`); continue; }
    let amount, category_id, payee_name = t.merchant || null;
    if (t.type === 'expense') { amount = -mu(t.amount); category_id = catMap.get(t.category_id) || null; }
    else if (t.type === 'refund') { amount = mu(t.amount); category_id = catMap.get(t.category_id) || null; }
    else if (t.type === 'income') {
      // YNAB has no income categories — all inflow lands in Ready to Assign,
      // so the Raqam category survives only in the memo.
      amount = mu(t.amount); category_id = rta.id;
    } else if (t.type === 'adjustment' || t.type === 'cardAdjustment') {
      amount = mu(t.amount); category_id = rta.id; // signed, like YNAB's own reconciliation adjustment
    } else { warn.push(`Unhandled transaction type ${t.type} (${t.id}).`); continue; }

    txs.push({
      ...base, account_id: acct, amount, category_id, payee_name,
      memo: [memo, t.type === 'income' && cat ? `Raqam category: ${cat.name}` : null].filter(Boolean).join(' · ') || null,
    });
  }

  console.log(`\nposting ${txs.length} transactions`);
  let created = 0, dupes = 0;
  for (let i = 0; i < txs.length; i += 200) {
    const d = await api('POST', '/transactions', { transactions: txs.slice(i, i + 200) });
    created += (d.transactions || []).length;
    dupes += (d.duplicate_import_ids || []).length;
  }
  console.log(`  created ${created}, skipped as already-imported ${dupes}`);

  // YNAB generates the other half of a transfer itself, always as `uncleared`,
  // and the POST body cannot influence it. Raqam has one status for the whole
  // transfer, so the counterpart is patched to match its source — otherwise the
  // destination's cleared_balance stays short by the transfer amount.
  const all = (await api('GET', '/transactions')).transactions;
  const byId = new Map(all.map(t => [t.id, t]));
  const fixes = [];
  for (const t of all) {
    if (!t.transfer_transaction_id || t.import_id) continue; // only the generated side
    const src = byId.get(t.transfer_transaction_id);
    if (src && src.cleared !== t.cleared) fixes.push({ id: t.id, cleared: src.cleared });
  }
  if (fixes.length) {
    console.log(`patching ${fixes.length} generated transfer counterpart(s) to match their source's cleared status`);
    await api('PATCH', '/transactions', { transactions: fixes });
  }

  // --- budget assignments ----------------------------------------------
  // A Raqam budget is ONE standing monthly amount applied to every month
  // (migration 0005), so it is written to each month in range.
  for (const b of R.budgets) {
    if (!b.category_id) continue; // overall budget has no YNAB equivalent
    const cid = catMap.get(b.category_id);
    if (!cid) { warn.push(`Budget for ${catById.get(b.category_id)?.name} skipped — category not mapped.`); continue; }
    for (const m of budgetMonths) {
      await api('PATCH', `/months/${m}-01/categories/${cid}`, { category: { budgeted: mu(b.amount) } });
    }
  }
  console.log(`assigned ${R.budgets.filter(b => b.category_id).length} budgets across ${budgetMonths.join(', ')}`);

  // --- verify -----------------------------------------------------------
  console.log('\nRECONCILIATION (Raqam closing balance vs YNAB cleared_balance)');
  const after = (await api('GET', '/accounts')).accounts.filter(a => !a.deleted);
  let bad = 0;
  for (const p of accPlans.filter(p => p.acc)) {
    const a = after.find(x => x.id === p.ynabId);
    const open = firstSnap.get(p.acc.id)?.amount || 0;
    const expect = open + R.transactions.reduce((s, t) => s + accountDelta(t, p.acc.id), 0);
    const got = a.cleared_balance / 1000;
    const ok = expect === got;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${p.name.padEnd(22)} raqam Rs ${expect.toLocaleString('en-PK').padStart(12)}   ynab Rs ${got.toLocaleString('en-PK').padStart(12)}${ok ? '' : `   delta ${(got - expect).toLocaleString('en-PK')}`}`);
  }
  console.log(bad ? `\n${bad} account(s) DID NOT reconcile.` : '\nAll accounts reconcile.');
}

reportPlan();
await preflight();
if (APPLY) await apply();
if (warn.length) { console.log('\nWARNINGS'); for (const w of warn) console.log('  ! ' + w); }
if (!APPLY) console.log('\nDry run only — nothing written. Re-run with --apply to load.');
console.log(`${calls} API requests used.`);
