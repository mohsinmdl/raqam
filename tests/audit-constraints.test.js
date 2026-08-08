import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Regression guard for the class of bug 0012 fixed: moveAssigned writes audit
// rows with action: 'move', but 0010's audit_log_action_check predated it, so
// every move silently 400'd against Postgres (and, pre-R2, wedged sync
// forever). Rather than pinning today's allow-lists as magic strings, this
// test PARSES them straight out of the migrations and cross-checks them
// against every literal the app actually writes via makeAudit — so the next
// time someone adds a new action/entityType without a matching migration,
// this fails instead of shipping a silent 400 to production.

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const STORE_DIR = join(process.cwd(), 'src/store');

// Migration filenames are numerically prefixed (0001_..., 0012_...), so a
// plain string sort is also chronological order. Each migration that touches
// a CHECK constraint does `drop constraint if exists ... add constraint ...`,
// which supersedes any earlier definition — so scanning files in order and
// keeping the LAST match for a given constraint name gives the value list
// the live schema enforces today.
function latestCheckValues(constraintName, columnName) {
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const checkRe = new RegExp(
    'add constraint\\s+' + constraintName + '\\s*[\\s\\S]*?check\\s*\\(\\s*' + columnName + '\\s+in\\s*\\(([\\s\\S]*?)\\)\\s*\\)',
    'g',
  );
  let values = null;
  for (const file of files) {
    const src = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const matches = [...src.matchAll(checkRe)];
    if (matches.length === 0) continue;
    const list = matches[matches.length - 1][1];
    values = [...list.matchAll(/'([^']*)'/g)].map(m => m[1]);
  }
  return values;
}

// Pulls the balanced (paren/bracket-aware) segment that follows `field:`
// inside one makeAudit({...}) call body, stopping at the first top-level
// comma or closing brace. A plain "next comma" split would truncate ternary
// values like `existing ? (amt === 0 ? 'delete' : 'update') : 'create'`
// (actions.js:914) at the comma inside a nested expression if there were
// one — there isn't here, but the parens themselves would still break a
// naive regex that didn't track depth. Returns every quoted literal found in
// that segment, so a ternary between several literal actions surfaces all of
// them, not just the first.
function fieldLiterals(callText, field) {
  const key = field + ':';
  const literals = new Set();
  let idx = callText.indexOf(key);
  while (idx !== -1) {
    let i = idx + key.length;
    let depth = 0;
    let seg = '';
    while (i < callText.length) {
      const ch = callText[i];
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0) break;
      else if (ch === '}' && depth === 0) break;
      seg += ch;
      i++;
    }
    // Strip equality comparisons (`status === 'active' ? ... : ...`,
    // actions.js:361) before pulling literals: 'active' there is a condition
    // to test against, never a value the ternary can actually produce, so
    // it must not be treated as a candidate action/entityType.
    const withoutComparisons = seg.replace(/(?:===|!==)\s*'[^']*'/g, '');
    for (const m of withoutComparisons.matchAll(/'([^']*)'/g)) literals.add(m[1]);
    idx = callText.indexOf(key, i);
  }
  return literals;
}

// Actual invocations only — excludes makeAudit's own `function makeAudit({
// entityType, action, ... }) {` declaration in audit.js, whose destructuring
// closes the same `})` shape but carries no string literals anyway.
const CALL_RE = /(?<!function )makeAudit\(\{[\s\S]*?\}\)/g;

function callsIn(src) {
  return src.match(CALL_RE) || [];
}

const ACTION_VALUES = latestCheckValues('audit_log_action_check', 'action');
const ENTITY_TYPE_VALUES = latestCheckValues('audit_log_entity_type_check', 'entity_type');

describe('audit CHECK constraints cover every literal the app writes', () => {
  it('parsed both CHECK constraints out of the migrations', () => {
    expect(ACTION_VALUES).toBeTruthy();
    expect(ACTION_VALUES.length).toBeGreaterThan(0);
    expect(ENTITY_TYPE_VALUES).toBeTruthy();
    expect(ENTITY_TYPE_VALUES.length).toBeGreaterThan(0);
  });

  it("'move' is allowed — moveAssigned's audit action (0012)", () => {
    expect(ACTION_VALUES).toContain('move');
  });

  const storeFiles = readdirSync(STORE_DIR).filter(f => f.endsWith('.js'));

  it('finds store source files to scan', () => {
    expect(storeFiles.length).toBeGreaterThan(0);
  });

  for (const file of storeFiles) {
    const src = readFileSync(join(STORE_DIR, file), 'utf8');
    const calls = callsIn(src);
    if (calls.length === 0) continue;

    const actions = new Set();
    const entityTypes = new Set();
    for (const call of calls) {
      for (const a of fieldLiterals(call, 'action')) actions.add(a);
      for (const t of fieldLiterals(call, 'entityType')) entityTypes.add(t);
    }

    for (const a of actions) {
      it(`${file}: makeAudit action '${a}' is allowed by audit_log_action_check`, () => {
        expect(ACTION_VALUES).toContain(a);
      });
    }
    for (const t of entityTypes) {
      it(`${file}: makeAudit entityType '${t}' is allowed by audit_log_entity_type_check`, () => {
        expect(ENTITY_TYPE_VALUES).toContain(t);
      });
    }
  }

  // Sanity check that the extraction itself actually finds things, so a
  // regex typo that silently matches nothing can't make every check above
  // vacuously pass.
  it('actually extracted action/entityType literals from at least one file', () => {
    let total = 0;
    for (const file of storeFiles) {
      const src = readFileSync(join(STORE_DIR, file), 'utf8');
      for (const call of callsIn(src)) {
        total += fieldLiterals(call, 'action').size + fieldLiterals(call, 'entityType').size;
      }
    }
    expect(total).toBeGreaterThan(10);
  });

  it('fieldLiterals pulls every branch out of a ternary action (regression for the extractor itself)', () => {
    const call = "makeAudit({ entityType: 'assignment', entityId: id, action: existing ? (amt === 0 ? 'delete' : 'update') : 'create', summary: 'x' })";
    expect([...fieldLiterals(call, 'action')].sort()).toEqual(['create', 'delete', 'update']);
  });
});
