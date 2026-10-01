// The browser (bank-compile.js::makeMain) and CI (bank/stitch.py::make_main) must generate byte-identical documents,
// with the problems in the order given (the PDF order is decided by the page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendixOrder, makeMain } from '../../site/static/js/bank-compile.js';

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
  const appendix = JSON.parse(readFileSync(BODIES, 'utf8')).appendix || {};
  for (const c of cases) {
    if (!c.ids.length) continue;
    const args = ['-m', 'bank.stitch', 'main', '--bodies', BODIES, '--ids', c.ids.join(','), '--variant', c.variant, '--filters', c.filters];
    if (c.showMethods) args.push('--show-methods');
    const py = spawnSync('python3', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(py.status, 0, py.stderr);
    const js = makeMain(bodies, c.ids, c.variant, { filters: c.filters, showMethods: c.showMethods, appendix });
    assert.equal(js, py.stdout, `mismatch for ${JSON.stringify({ ...c, ids: c.ids.length })}`);
  }
});

// Shared results (problem-bank/appendix/): the same appendix, in the same order, on both sides.  Synthetic data, so this
// runs without a build.
test('JS makeMain == Python make_main with shared results (order, closure, cycles, missing names, problems-only PDFs)', () => {
  const body = (i, cites, solution = `Sol ${i} \\appendixref{x}`) => ({ id: String(i).padStart(4, '0'), title: `T${i} & co`, origin: '', status: '',
    methods: [], statement: `S${i}`, solution, cites, figures: {} });
  const bodies = { '0001': body(1, ['c-res', 'gone']), '0002': body(2, ['b-res'], null), '0003': body(3, ['a-res', 'c-res']), '0004': body(4, []) };
  const res = (name, cites, title = name) => ({ name, title, text: `Text of ${name}.`, cites, figures: {} });
  const appendix = { 'a-res': res('a-res', ['b-res'], 'A_1 & 50%'), 'b-res': res('b-res', ['a-res']), 'c-res': res('c-res', []), 'd-res': res('d-res', ['a-res']) };
  assert.deepEqual(appendixOrder([bodies['0001'], bodies['0002'], bodies['0003']], appendix), ['c-res', 'a-res', 'b-res']);
  const dir = mkdtempSync(join(tmpdir(), 'bank-appendix-'));
  try {
    const file = join(dir, 'bodies.json');
    writeFileSync(file, JSON.stringify({ build: 'x', problems: bodies, appendix }));
    const cases = [[[1, 2, 3], 'solutions'], [[3, 1], 'solutions'], [[2, 4], 'solutions'], [[1, 2, 3], 'problems'], [[4], 'solutions']];
    for (const [ids, variant] of cases) {
      const py = spawnSync('python3', ['-m', 'bank.stitch', 'main', '--bodies', file, '--ids', ids.join(','), '--variant', variant],
        { cwd: ROOT, encoding: 'utf8' });
      assert.equal(py.status, 0, py.stderr);
      assert.equal(makeMain(bodies, ids, variant, { appendix }), py.stdout, `mismatch for ${ids} ${variant}`);
    }
    const tex = makeMain(bodies, [3, 1], 'solutions', { appendix });
    assert.ok(tex.includes('\\bankappendix\n\\bankappendixitem{a-res}\n\\begin{appendixitem}{A\\_1 \\& 50\\%}\nText of a-res.\n\\end{appendixitem}\n'
      + '\\bankappendixitem{c-res}\n'), tex);
    assert.equal(makeMain(bodies, [1, 3], 'problems', { appendix }), makeMain(bodies, [1, 3], 'problems'));
    assert.equal(makeMain(bodies, [2, 4], 'solutions', { appendix }), makeMain(bodies, [2, 4], 'solutions'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
