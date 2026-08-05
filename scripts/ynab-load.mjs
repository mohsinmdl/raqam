#!/usr/bin/env node
// Raqam -> YNAB one-way load / refresh.
//
// Re-runnable. Every object it creates is addressable afterwards, so a second
// run brings YNAB back in line with Raqam rather than duplicating anything:
//
//   * transactions carry a deterministic import_id derived from the Raqam row
//     id, so they are created once, PATCHed when the Raqam row changed, and
//     reported (or deleted, with --prune) when the Raqam row is gone;
//   * accounts and categories are matched by (name, type) before creating;
//   * budget assignments are absolute values, and are only sent when the
//     amount in YNAB actually differs.
//
// Nothing in Raqam or its database is ever written.
//
//   node scripts/ynab-load.mjs --dump                  # refresh the local dump, then dry run
//   node scripts/ynab-load.mjs                         # dry run against the existing dump
//   node scripts/ynab-load.mjs --dump --apply          # the normal "update YNAB" command
//   node scripts/ynab-load.mjs --list-partitions       # show the user_ids in the dump
//
// Flags
//   --dump              re-run scripts/raqam-dump.sh first (needs the service-role key)
//   --apply             actually write to YNAB (otherwise dry run)
//   --user <uuid>       which Raqam user_id to load (see --list-partitions)
//   --prune             delete YNAB transactions whose Raqam row no longer exists
//   --zero-unbudgeted   set assigned to 0 for mapped categories Raqam has no budget for
//   --list-partitions   list user_id partitions in the dump and exit
//
// Config, in precedence order
//   token   YNAB_TOKEN env  ->  ./.ynab-token  ->  ~/.ynab-token
//   plan    YNAB_BUDGET_ID env  ->  auto-detected when the account has exactly one
//   user    --user  ->  RAQAM_USER env  ->  auto when the dump has exactly one partition
//   dump    RAQAM_DIR env  ->  ./.raqam-dump

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const die = m => { console.error('\n' + m + '\n'); process.exit(1); };

const APPLY = has('--apply');
const PRUNE = has('--prune');
const ZERO = has('--zero-unbudgeted');
const DIR = process.env.RAQAM_DIR || '.raqam-dump';

// --------------------------------------------------------------------------
// Credentials
// --------------------------------------------------------------------------
// Preferring a file over an env var keeps the token out of shell history.
function token() {
  if (process.env.YNAB_TOKEN) return process.env.YNAB_TOKEN.trim();
  for (const p of ['.ynab-token', join(process.env.HOME || '', '.ynab-token')]) {
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  }
  die('No YNAB token. Put a Personal Access Token in ./.ynab-token (gitignored) or set YNAB_TOKEN.');
}
const TOKEN = token();

let calls = 0;
async function ynab(method, path, body) {
  calls++;
  const res = await fetch('https://api.ynab.com/v1' + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 429) die('YNAB rate limit reached (200 requests/hour). Re-run later — the load resumes where it stopped.');
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${text}`);
  return text ? JSON.parse(text).data : null;
}

// --------------------------------------------------------------------------
// Money and ids
// --------------------------------------------------------------------------
// Raqam stores integer whole PKR (0001_init.sql:5); YNAB uses milliunits. The
// plan's currency is PKR, so this is the entire conversion.
const mu = pkr => Math.round(pkr) * 1000;
const rs = m => (m / 1000).toLocaleString('en-PK', { maximumFractionDigits: 0 });
const pk = n => n.toLocaleString('en-PK', { maximumFractionDigits: 0 });

// import_id is capped at 36 chars and Raqam ids are already 36-char UUIDs, so a
// raw id cannot carry a prefix. Hash instead — stable across runs, which is what
// makes create-vs-update-vs-prune decidable.
const IMPORT_PREFIXES = ['rq:', 'rqsb:', 'rqfee:'];
const impId = (prefix, key) =>
  prefix + createHash('sha1').update(key).digest('hex').slice(0, 36 - prefix.length);
const isOurs = id => !!id && IMPORT_PREFIXES.some(p => id.startsWith(p));

// YNAB permanently burns an import_id once a transaction carrying it has been
// deleted: re-posting it is silently reported as a duplicate rather than
// created. So a Raqam row that was pruned and later restored (or re-created in
// Raqam) would never come back. Each row therefore gets a short ladder of
// candidate ids; matching accepts whichever one is live, and creation walks up
// the ladder when the server says a candidate is already taken.
const GENERATIONS = 5;
const impIds = (prefix, key) =>
  Array.from({ length: GENERATIONS }, (_, g) => impId(prefix, g ? `${key}#${g}` : key));

// --------------------------------------------------------------------------
// Dump and partition
// --------------------------------------------------------------------------
if (has('--dump')) {
  console.log('refreshing dump...');
  execFileSync('bash', [join(import.meta.dirname, 'raqam-dump.sh')], {
    stdio: 'inherit', env: { ...process.env, OUT: DIR },
  });
}

const TABLES = ['institutions', 'categories', 'accounts', 'cards', 'snapshots', 'transactions', 'budgets'];
const raw = {};
for (const t of TABLES) {
  const f = join(DIR, t + '.json');
  if (!existsSync(f)) die(`Missing ${f}. Run with --dump first (needs the Supabase service-role key).`);
  raw[t] = JSON.parse(readFileSync(f, 'utf8'));
}

// The service-role key bypasses RLS, so the dump contains every user's rows.
// Loading without partitioning would merge other users into the plan.
const partitions = new Map();
for (const t of TABLES) for (const r of raw[t]) {
  if (!r.user_id) continue; // institutions with a NULL user_id are the shared catalogue
  if (!partitions.has(r.user_id)) partitions.set(r.user_id, { rows: 0, accounts: [], txs: 0 });
  partitions.get(r.user_id).rows++;
}
for (const a of raw.accounts) partitions.get(a.user_id)?.accounts.push(a.nickname);
for (const t of raw.transactions) if (partitions.has(t.user_id)) partitions.get(t.user_id).txs++;

if (has('--list-partitions')) {
  console.log(`\n${partitions.size} user_id partition(s) in ${DIR}:\n`);
  for (const [id, p] of [...partitions].sort((a, b) => b[1].rows - a[1].rows)) {
    console.log(`  ${id}   ${p.rows} rows, ${p.txs} transactions`);
    console.log(`    accounts: ${p.accounts.join(', ') || '—'}\n`);
  }
  console.log('Pass the right one with --user <uuid>.\n');
  process.exit(0);
}

const USER = opt('--user') || process.env.RAQAM_USER ||
  (partitions.size === 1 ? [...partitions.keys()][0] : null);
if (!USER) die(`The dump holds ${partitions.size} user_id partitions. Pick one with --user <uuid> (see --list-partitions).`);
if (!partitions.has(USER)) die(`user_id ${USER} is not in the dump. See --list-partitions.`);

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
  'Foreign currency': 'checking', // the plan is PKR-only; flagged in the report
};
// Raqam system category id -> existing YNAB default category to reuse.
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
// budgets are one-per-category in both systems, so folding two Raqam categories
// onto one YNAB category would collide their budget amounts.
const CREATE = {
  fuel: ['⛽️ Fuel', 'Needs'],
  education: ['🎓 Education', 'Needs'],
  shopping: ['🛍️ Shopping', 'Wants'],
  family: ['👪 Family support', 'Needs'],
  charity: ['🤲 Charity & Zakat', 'Needs'],
  fees: ['🏦 Bank fees', 'Bills'],
};
const CUSTOM_GROUP = { 'Cleaning & maintenance': 'Needs', 'Food Delivery': 'Wants', 'Pet care': 'Wants' };
// excludeFromBudget categories hold recoverable advances. YNAB has no
// equivalent exclusion, so they get their own group to stay visually separable.
const RECOVERABLE_GROUP = 'Recoverable (advances)';
const DEFAULT_GROUP = 'Wants';

// YNAB reserves a set of internal payee name prefixes and rejects the WHOLE
// batch with a 400 if any payee starts with one: "Transfer : ",
// "Starting Balance", "Manual Balance Adjustment",
// "Reconciliation Balance Adjustment". Opening balances cannot use the obvious name.
const OPENING_PAYEE = 'Raqam opening balance';

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
// Plan
// --------------------------------------------------------------------------
const warn = [];

// Categories worth having in YNAB: active expense categories, plus any category
// a surviving transaction or budget still points at, even if archived.
const referenced = new Set([
  ...R.transactions.map(t => t.category_id).filter(Boolean),
  ...R.budgets.map(b => b.category_id).filter(Boolean),
]);
const wantedCats = R.categories.filter(c => c.type === 'expense' && (c.status === 'active' || referenced.has(c.id)));
const catPlans = wantedCats.map(c => {
  if (REUSE[c.id]) return { cat: c, mode: 'reuse', name: REUSE[c.id] };
  if (CREATE[c.id]) return { cat: c, mode: 'create', name: CREATE[c.id][0], group: CREATE[c.id][1] };
  const group = c.exclude_from_budget ? RECOVERABLE_GROUP : (CUSTOM_GROUP[c.name] || DEFAULT_GROUP);
  return { cat: c, mode: 'create', name: c.name, group };
});

// Accounts. Non-credit cards can never hold a transaction in Raqam
// (TxForm.jsx:33 offers only credit cards as a payment method), so creating
// them would add permanently un-deletable empty YNAB accounts.
const accPlans = R.accounts.map(a => {
  if (!ACCOUNT_TYPE[a.type]) warn.push(`Unknown Raqam account type "${a.type}" on ${a.nickname}; using checking.`);
  if (a.type === 'Foreign currency') warn.push(`${a.nickname} is a Foreign currency account; a PKR plan will render it as PKR.`);
  if (a.currency !== 'PKR') warn.push(`${a.nickname} currency is ${a.currency}, not PKR.`);
  return { acc: a, name: a.nickname, type: ACCOUNT_TYPE[a.type] || 'checking' };
});
for (const c of R.cards.filter(c => c.type === 'credit')) {
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
// double-count every month.
const firstSnap = new Map();
for (const s of R.snapshots) {
  const cur = firstSnap.get(s.account_id);
  if (!cur || s.month < cur.month) firstSnap.set(s.account_id, s);
}
for (const t of R.transactions) {
  for (const id of [t.account_id, t.to_account_id].filter(Boolean)) {
    const s = firstSnap.get(id);
    if (s && t.date.slice(0, 7) < s.month) {
      warn.push(`${accById.get(id)?.nickname}: a transaction predates its earliest snapshot ${s.month} — opening balance may be misplaced.`);
    }
  }
}

const months = [...new Set(R.transactions.map(t => t.date.slice(0, 7)))].sort();
const budgetMonths = [...new Set([...months, ...[...firstSnap.values()].map(s => s.month)])].sort();

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------
function report() {
  console.log(`\nRaqam user ${USER}  (dump: ${DIR})`);
  const byType = {};
  for (const t of R.transactions) byType[t.type] = (byType[t.type] || 0) + 1;
  console.log(`  accounts ${R.accounts.length}  credit cards ${R.cards.filter(c => c.type === 'credit').length}  transactions ${R.transactions.length} ${JSON.stringify(byType)}`);
  console.log(`  categories ${R.categories.length}  budgets ${R.budgets.length}  months ${budgetMonths.join(', ') || '—'}`);
  console.log('\nCATEGORIES');
  for (const p of catPlans) console.log(`  ${p.mode === 'reuse' ? 'reuse ' : 'create'} ${p.name}${p.group ? '  [' + p.group + ']' : ''}   <- ${p.cat.name}${p.cat.exclude_from_budget ? ' (excludeFromBudget)' : ''}`);
  for (const c of R.categories.filter(c => !wantedCats.includes(c))) {
    console.log(`  skip   ${c.name} (${c.type}, ${c.status})${c.type === 'income' ? ' -> Inflow: Ready to Assign' : ''}`);
  }
  console.log('\nACCOUNTS');
  for (const p of accPlans) console.log(`  ${p.name.padEnd(22)} -> ${p.type}`);
  console.log('\nEXPECTED CLOSING BALANCES (Raqam) — must equal YNAB cleared_balance');
  for (const a of R.accounts) {
    const open = firstSnap.get(a.id)?.amount || 0;
    console.log(`  ${a.nickname.padEnd(22)} Rs ${pk(open + R.transactions.reduce((s, t) => s + accountDelta(t, a.id), 0)).padStart(12)}`);
  }
}

// --------------------------------------------------------------------------
// Resolve plan / categories / accounts
// --------------------------------------------------------------------------
async function resolveBudget() {
  if (process.env.YNAB_BUDGET_ID) return process.env.YNAB_BUDGET_ID;
  const buds = (await ynab('GET', '/budgets')).budgets;
  if (buds.length === 1) {
    const b = buds[0];
    if (b.currency_format?.iso_code !== 'PKR') {
      warn.push(`Plan "${b.name}" is ${b.currency_format?.iso_code}, not PKR — amounts will be wrong by the exchange rate. Set YNAB_BUDGET_ID to override.`);
    }
    console.log(`plan: ${b.name} (${b.id}, ${b.currency_format?.iso_code})`);
    return b.id;
  }
  die(`Set YNAB_BUDGET_ID. Your account has ${buds.length} plans:\n` + buds.map(b => `  ${b.id}  ${b.name}`).join('\n'));
}
const BUDGET = await resolveBudget();
const bud = p => `/budgets/${BUDGET}${p}`;

async function resolveCategories(write) {
  let groups = (await ynab('GET', bud('/categories'))).category_groups;
  const groupByName = new Map(groups.filter(g => !g.deleted).map(g => [g.name, g]));
  const catByName = new Map();
  for (const g of groups) for (const c of g.categories) if (!c.deleted) catByName.set(c.name, c);

  for (const name of [...new Set(catPlans.filter(p => p.mode === 'create').map(p => p.group))]) {
    if (groupByName.has(name)) continue;
    if (!write) { console.log(`  would create group ${name}`); continue; }
    console.log(`+ group ${name}`);
    groupByName.set(name, (await ynab('POST', bud('/category_groups'), { category_group: { name } })).category_group);
  }
  for (const p of catPlans) {
    const found = catByName.get(p.name);
    if (found) { p.ynabId = found.id; continue; }
    if (p.mode === 'reuse') { warn.push(`Reuse target "${p.name}" is not in the plan; it will be created in ${DEFAULT_GROUP}.`); p.group = p.group || DEFAULT_GROUP; }
    // A dry run against a plan that has none of these yet still needs ids, or
    // every transaction would be reported as unmappable and the counts useless.
    if (!write) { console.log(`  would create category ${p.name} [${p.group}]`); p.ynabId = 'dry:cat:' + p.name; continue; }
    const gid = groupByName.get(p.group)?.id;
    if (!gid) throw new Error(`Category group "${p.group}" missing.`);
    console.log(`+ category ${p.name} [${p.group}]`);
    p.ynabId = (await ynab('POST', bud('/categories'), { category: { name: p.name, category_group_id: gid } })).category.id;
  }
  const rta = catByName.get('Inflow: Ready to Assign');
  if (!rta) die('Inflow: Ready to Assign not found in the plan.');
  return { rta, catMap: new Map(catPlans.filter(p => p.ynabId).map(p => [p.cat.id, p.ynabId])) };
}

async function resolveAccounts(write) {
  const accts = (await ynab('GET', bud('/accounts'))).accounts.filter(a => !a.deleted);
  for (const p of accPlans) {
    const exact = accts.find(a => a.name === p.name && a.type === p.type);
    if (exact) { p.ynabId = exact.id; p.transferPayeeId = exact.transfer_payee_id; continue; }
    const clash = accts.find(a => a.name === p.name);
    if (clash) {
      // The API has no PATCH/PUT/DELETE for accounts, so a wrong-typed
      // same-name account cannot be corrected from here.
      warn.push(`YNAB has "${clash.name}" as ${clash.type} (Rs ${rs(clash.balance)}) but Raqam says ${p.type}. A second "${p.name}" will be created; delete the empty ${clash.type} one in the web UI.`);
    }
    if (!write) {
      console.log(`  would create account ${p.name} (${p.type})`);
      p.ynabId = 'dry:acc:' + p.name; p.transferPayeeId = 'dry:payee:' + p.name;
      continue;
    }
    console.log(`+ account ${p.name} (${p.type})`);
    const a = (await ynab('POST', bud('/accounts'), { account: { name: p.name, type: p.type, balance: 0 } })).account;
    p.ynabId = a.id; p.transferPayeeId = a.transfer_payee_id;
  }
  const mapped = new Set(accPlans.map(p => p.name));
  for (const a of accts) {
    if (!mapped.has(a.name)) warn.push(`YNAB account "${a.name}" (${a.type}, Rs ${rs(a.balance)}) has no Raqam counterpart — left untouched.`);
  }
  const accMap = new Map(), payeeMap = new Map();
  for (const p of accPlans) {
    const key = p.acc ? p.acc.id : p.card.id;
    if (p.ynabId) { accMap.set(key, p.ynabId); payeeMap.set(key, p.transferPayeeId); }
  }
  return { accMap, payeeMap };
}

// --------------------------------------------------------------------------
// Desired transaction set
// --------------------------------------------------------------------------
function desiredTransactions({ rta, catMap, accMap, payeeMap }) {
  const out = [];
  // Opening balances as explicit dated transactions. YNAB's balance-at-creation
  // field dates the starting balance to today, landing it in the wrong month.
  for (const p of accPlans) {
    if (!p.ynabId) continue;
    if (p.acc) {
      const s = firstSnap.get(p.acc.id);
      if (!s) continue;
      out.push({
        _ids: impIds('rqsb:', p.acc.id), account_id: p.ynabId, date: `${s.month}-01`,
        amount: mu(s.amount), payee_name: OPENING_PAYEE, category_id: rta.id,
        memo: `Raqam opening balance ${s.month}`, cleared: 'cleared', approved: true,
      });
    } else if (p.openingMonth) {
      out.push({
        _ids: impIds('rqsb:', p.card.id), account_id: p.ynabId, date: `${p.openingMonth}-01`,
        amount: mu(p.opening), payee_name: OPENING_PAYEE, category_id: rta.id,
        memo: `Raqam opening outstanding ${p.openingMonth}`, cleared: 'cleared', approved: true,
      });
    }
  }

  for (const t of R.transactions) {
    const base = {
      date: t.date.slice(0, 10), // YNAB is date-only; Raqam's time of day is dropped
      cleared: t.status === 'pending' ? 'uncleared' : 'cleared',
      approved: true,
    };
    const memo = [t.notes, t.adjustment_reason].filter(Boolean).join(' · ') || null;

    if (t.type === 'transfer') {
      const src = accMap.get(t.account_id);
      const payee = payeeMap.get(t.to_account_id || t.to_card_id);
      if (!src || !payee) { warn.push(`Transfer ${t.id} skipped — endpoint not mapped.`); continue; }
      // YNAB creates the paired side itself from the destination's transfer payee.
      out.push({ ...base, _ids: impIds('rq:', t.id), account_id: src, amount: -mu(t.amount), payee_id: payee, memo });
      if (t.fee > 0) {
        // Raqam keeps the fee on the transfer row; a YNAB transfer has nowhere
        // to put one, so it splits off as its own categorized expense.
        out.push({
          ...base, _ids: impIds('rqfee:', t.id), account_id: src, amount: -mu(t.fee),
          payee_name: t.merchant || 'Transfer fee',
          category_id: catPlans.find(p => p.cat.id === 'fees')?.ynabId || null,
          memo: 'Raqam transfer fee' + (memo ? ' · ' + memo : ''),
        });
      }
      continue;
    }

    const acct = accMap.get(t.account_id || t.card_id);
    if (!acct) { warn.push(`Transaction ${t.id} (${t.type}) skipped — no mapped account.`); continue; }
    const cat = t.category_id ? catById.get(t.category_id) : null;
    let amount, category_id;
    if (t.type === 'expense') { amount = -mu(t.amount); category_id = catMap.get(t.category_id) || null; }
    else if (t.type === 'refund') { amount = mu(t.amount); category_id = catMap.get(t.category_id) || null; }
    else if (t.type === 'income') { amount = mu(t.amount); category_id = rta.id; }
    else if (t.type === 'adjustment' || t.type === 'cardAdjustment') {
      // Signed, into Ready to Assign — what YNAB's own reconciliation adjustment does.
      amount = mu(t.amount); category_id = rta.id;
    } else { warn.push(`Unhandled transaction type ${t.type} (${t.id}).`); continue; }

    out.push({
      ...base, _ids: impIds('rq:', t.id), account_id: acct, amount, category_id,
      payee_name: t.merchant || null,
      // YNAB has no income categories, so the Raqam one survives in the memo.
      memo: [memo, t.type === 'income' && cat ? `Raqam category: ${cat.name}` : null].filter(Boolean).join(' · ') || null,
    });
  }
  return out;
}

// Only compare the fields this script owns. A transfer's payee is YNAB's own
// "Transfer : X" string and its category is null, so comparing those would
// report a difference on every run.
const norm = v => (v === undefined || v === '' ? null : v);
function changes(want, got) {
  const keys = want.payee_id
    ? ['date', 'amount', 'memo', 'cleared']
    : ['date', 'amount', 'payee_name', 'category_id', 'memo', 'cleared'];
  const out = {};
  for (const k of keys) if (norm(want[k]) !== norm(got[k])) out[k] = norm(want[k]);
  if (want.account_id !== got.account_id) out.account_id = want.account_id;
  return out;
}

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------
report();
console.log(APPLY ? '\nAPPLYING' : '\nDRY RUN — nothing will be written');

const cats = await resolveCategories(APPLY);
const accs = await resolveAccounts(APPLY);
const want = desiredTransactions({ ...cats, ...accs });

const existing = (await ynab('GET', bud('/transactions'))).transactions;
const mine = new Map(existing.filter(t => isOurs(t.import_id) && !t.deleted).map(t => [t.import_id, t]));

// A row is "already in YNAB" if ANY generation of its id is live there.
const toCreate = [], toUpdate = [];
for (const w of want) {
  const got = w._ids.map(id => mine.get(id)).find(Boolean);
  if (!got) { toCreate.push(w); continue; }
  const diff = changes(w, got);
  if (Object.keys(diff).length) toUpdate.push({ id: got.id, ...diff, _label: `${got.date} ${rs(got.amount)} ${got.payee_name || ''}`, _diff: diff });
}
const wantIds = new Set(want.flatMap(w => w._ids));
const orphans = [...mine.values()].filter(t => !wantIds.has(t.import_id));

console.log('\nTRANSACTIONS');
console.log(`  in YNAB from Raqam: ${mine.size}   desired: ${want.length}`);
console.log(`  create ${toCreate.length}   update ${toUpdate.length}   deleted in Raqam ${orphans.length}${orphans.length && !PRUNE ? ' (pass --prune to remove)' : ''}`);
for (const u of toUpdate) console.log(`    ~ ${u._label} -> ${JSON.stringify(u._diff)}`);
for (const o of orphans) console.log(`    - ${o.date} ${rs(o.amount)} ${o.payee_name || ''} (${o.import_id})`);

if (APPLY) {
  if (toCreate.length) {
    // Walk up the id ladder: anything the server rejects as a duplicate is
    // colliding with a row that was deleted from YNAB, so retry it under the
    // next generation rather than losing it silently.
    let created = 0, pending = toCreate.map(w => ({ w, gen: 0 }));
    for (let round = 0; round < GENERATIONS && pending.length; round++) {
      const dup = new Set();
      for (let i = 0; i < pending.length; i += 200) {
        const slice = pending.slice(i, i + 200);
        const d = await ynab('POST', bud('/transactions'), {
          transactions: slice.map(({ w, gen }) => {
            const { _ids, ...tx } = w;
            return { ...tx, import_id: _ids[gen] };
          }),
        });
        created += (d.transactions || []).length;
        for (const id of d.duplicate_import_ids || []) dup.add(id);
      }
      pending = pending
        .filter(({ w, gen }) => dup.has(w._ids[gen]))
        .map(({ w, gen }) => ({ w, gen: gen + 1 }))
        .filter(({ gen }) => gen < GENERATIONS);
      if (pending.length) console.log(`  ${pending.length} collided with a deleted YNAB row; retrying under a fresh import id`);
    }
    console.log(`  created ${created}`);
    if (pending.length) warn.push(`${pending.length} transaction(s) could not be created — all ${GENERATIONS} import ids are burned in YNAB.`);
  }
  if (toUpdate.length) {
    await ynab('PATCH', bud('/transactions'), {
      transactions: toUpdate.map(({ _label, _diff, ...t }) => t),
    });
    console.log(`  updated ${toUpdate.length}`);
  }
  if (orphans.length && PRUNE) {
    for (const o of orphans) await ynab('DELETE', bud(`/transactions/${o.id}`));
    console.log(`  deleted ${orphans.length}`);
  }

  // YNAB generates the other half of a transfer itself, always as `uncleared`,
  // and the POST body cannot influence it. Raqam has one status for the whole
  // transfer, so the counterpart is patched to match its source — otherwise the
  // destination's cleared_balance stays short by the transfer amount.
  const all = (await ynab('GET', bud('/transactions'))).transactions;
  const byId = new Map(all.map(t => [t.id, t]));
  const fixes = [];
  for (const t of all) {
    if (!t.transfer_transaction_id || t.import_id || t.deleted) continue; // the generated side only
    const src = byId.get(t.transfer_transaction_id);
    if (src && src.cleared !== t.cleared) fixes.push({ id: t.id, cleared: src.cleared });
  }
  if (fixes.length) {
    console.log(`  patched ${fixes.length} generated transfer counterpart(s) to match their source`);
    await ynab('PATCH', bud('/transactions'), { transactions: fixes });
  }
}

// --------------------------------------------------------------------------
// Budget assignments
// --------------------------------------------------------------------------
// A Raqam budget is ONE standing monthly amount applied to every month
// (migration 0005), so it is written to each month in range. Absolute values,
// so re-running is safe; only genuine differences are sent.
console.log('\nBUDGETS');
const overall = R.budgets.find(b => !b.category_id);
if (overall) console.log(`  skip overall Rs ${pk(overall.amount)} — YNAB's total is the sum of its categories`);
const budByCat = new Map(R.budgets.filter(b => b.category_id).map(b => [b.category_id, b]));
let patched = 0, already = 0;
for (const m of budgetMonths) {
  const month = (await ynab('GET', bud(`/months/${m}-01`))).month;
  const live = new Map(month.categories.filter(c => !c.deleted).map(c => [c.id, c]));
  for (const p of catPlans) {
    if (!p.ynabId) continue;
    const b = budByCat.get(p.cat.id);
    let target;
    if (b) target = mu(b.amount);
    else if (ZERO) target = 0;              // Raqam has no budget here
    else continue;                          // leave whatever YNAB has
    const cur = live.get(p.ynabId);
    if (cur && cur.budgeted === target) { already++; continue; }
    console.log(`  ${m} ${p.name} Rs ${pk(target / 1000)}${cur ? ` (was Rs ${pk(cur.budgeted / 1000)})` : ''}`);
    if (APPLY) await ynab('PATCH', bud(`/months/${m}-01/categories/${p.ynabId}`), { category: { budgeted: target } });
    patched++;
  }
  if (!ZERO) {
    const unbudgeted = catPlans.filter(p => p.ynabId && !budByCat.has(p.cat.id) && live.get(p.ynabId)?.budgeted);
    for (const p of unbudgeted) {
      warn.push(`${m}: "${p.name}" is assigned Rs ${pk(live.get(p.ynabId).budgeted / 1000)} in YNAB but has no Raqam budget — pass --zero-unbudgeted to clear it.`);
    }
  }
}
console.log(`  ${patched} assignment(s) ${APPLY ? 'written' : 'would change'}, ${already} already correct`);

// --------------------------------------------------------------------------
// Reconcile
// --------------------------------------------------------------------------
console.log('\nRECONCILIATION (Raqam closing balance vs YNAB cleared_balance)');
const after = (await ynab('GET', bud('/accounts'))).accounts.filter(a => !a.deleted);
let bad = 0;
for (const p of accPlans.filter(p => p.acc && p.ynabId)) {
  const a = after.find(x => x.id === p.ynabId);
  if (!a) { console.log(`  --   ${p.name.padEnd(22)} not in YNAB yet (dry run)`); continue; }
  const expect = (firstSnap.get(p.acc.id)?.amount || 0) + R.transactions.reduce((s, t) => s + accountDelta(t, p.acc.id), 0);
  const got = a.cleared_balance / 1000;
  const ok = expect === got;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${p.name.padEnd(22)} raqam Rs ${pk(expect).padStart(12)}   ynab Rs ${pk(got).padStart(12)}${ok ? '' : `   delta ${pk(got - expect)}`}`);
}
console.log(bad ? `\n${bad} account(s) DID NOT reconcile.` : '\nAll accounts reconcile.');

if (warn.length) { console.log('\nWARNINGS'); for (const w of warn) console.log('  ! ' + w); }
console.log(`\n${calls} API request(s) used (limit 200/hour).`);
if (!APPLY) console.log('Dry run — nothing was written. Add --apply to perform it.');
