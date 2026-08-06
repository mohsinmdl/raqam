import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// A component defined inside another component gets a fresh function identity
// on every render, so React sees a new *type* and unmounts/remounts the whole
// subtree instead of updating it. On the Transactions table that destroyed and
// rebuilt every row on any state change — opening a row menu, typing in the
// search box, ticking a checkbox — which collapsed the scroll container's
// height and snapped it back to the top, taking the just-opened menu with it.
//
// The symptom is easy to misread as a menu-positioning bug, and nothing in a
// build or a normal test catches it, so it is worth pinning here.
//
// The allowlist is empty, and should stay that way. Recurring.jsx was the last
// holdout — its Row closed over ten bindings, which now arrive as a single
// `ctx` object. If a screen ever needs an entry here, the comment should say
// what makes hoisting genuinely hard, not just that nobody got round to it.
const ALLOWED = new Set();

const SCREENS = join(process.cwd(), 'src/screens');

// `const Foo = (` or `function Foo(` — a capitalised binding taking arguments.
// Object/array constants (`const DEFAULT_FILTERS = {`) can't match: they have
// no `(` after `=`, and SCREAMING_CASE names break on the underscore.
const INLINE = /\n\s+(?:const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*\(|function\s+([A-Z][a-zA-Z0-9]*)\s*\()/g;

function inlineComponentsIn(src) {
  const at = src.search(/^export default function \w+/m);
  if (at < 0) return [];
  // Indented definitions only — a module-scope `function Row(` starts at
  // column 0 and is exactly what we want people to write instead.
  return [...src.slice(at).matchAll(INLINE)].map(m => m[1] || m[2]);
}

describe('no components defined inside components', () => {
  const files = readdirSync(SCREENS).filter(f => f.endsWith('.jsx'));

  it('finds screens to check', () => expect(files.length).toBeGreaterThan(5));

  for (const f of files) {
    const run = ALLOWED.has(f) ? it.skip : it;
    run(`${f} defines its components at module scope`, () => {
      expect(inlineComponentsIn(readFileSync(join(SCREENS, f), 'utf8'))).toEqual([]);
    });
  }

  it('actually detects the pattern it is meant to catch', () => {
    const bad = 'export default function Screen() {\n  const Row = ({ t }) => <tr />;\n  return <Row />;\n}';
    expect(inlineComponentsIn(bad)).toEqual(['Row']);
    const good = 'function Row({ t }) { return <tr />; }\nexport default function Screen() {\n  return <Row />;\n}';
    expect(inlineComponentsIn(good)).toEqual([]);
  });
});
