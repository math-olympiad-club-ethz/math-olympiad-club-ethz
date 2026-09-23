// The browser (bank-compile.js::makeMain) and CI (bank/stitch.py::make_main) must generate byte-identical documents,
// with the problems in the order given (the PDF order is decided by the page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { makeMain } from '../../site/static/js/bank-compile.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const BODIES = ROOT + 'site/static/bank/bodies.json';

test('JS makeMain == Python make_main on the built bodies (problems / solutions / methods / filters)', (t) => {
  if (!existsSync(BODIES)) { t.skip('site/static/bank/bodies.json not built'); return; }
  const bodies = JSON.parse(readFileSync(BODIES, 'utf8')).problems;
  const all = Object.keys(bodies).map(Number).sort((a, b) => a - b);
  const cases = [
    { ids: all.slice(0, 5), variant: 'problems', filters: '', showMethods: false },
    { ids: all.slice(0, 5), variant: 'solutions', filters: 'Area: Analysis & Algebra (any of) · IDs 1–20', showMethods: false },
    { ids: all, variant: 'solutions', filters: '', showMethods: true },
    { ids: all.filter(i => (bodies[String(i).padStart(4, '0')].figures || {}) && Object.keys(bodies[String(i).padStart(4, '0')].figures || {}).length), variant: 'solutions', filters: 'figures', showMethods: true },
    { ids: [...all.slice(0, 12)].reverse().concat(all.slice(20, 23)), variant: 'solutions', filters: 'hand-made order', showMethods: false },   // any order, kept as given
  ];
  for (const c of cases) {
    if (!c.ids.length) continue;
    const args = ['-m', 'bank.stitch', 'main', '--bodies', BODIES, '--ids', c.ids.join(','), '--variant', c.variant, '--filters', c.filters];
    if (c.showMethods) args.push('--show-methods');
    const py = spawnSync('python3', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(py.status, 0, py.stderr);
    const js = makeMain(bodies, c.ids, c.variant, { filters: c.filters, showMethods: c.showMethods });
    assert.equal(js, py.stdout, `mismatch for ${JSON.stringify({ ...c, ids: c.ids.length })}`);
  }
});
