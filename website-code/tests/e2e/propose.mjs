// End-to-end test of the "Propose a problem" page in headless Chromium (Playwright library, no test runner):
// what is required, the lines that open in place (what it is about: the tree of topics; a solution; where it is from,
// with the competitions the bank knows; why the proposer likes it), the methods tree, the sheet typeset by the in-browser
// pdfTeX (PDF content checked with pypdf), LaTeX errors under their box, a stuck compile, sending (the share menu with
// the PDF, the .tex and the note; without one, the files saved and the mail app opened with one line), the file
// passing `python3 -m bank.validate --compile`, LaTeX help, and the draft kept on this device (two tabs).
// Needs a built site (python3 build.py --preview) and the engine bundle in site/static/busytex/.
//   node tests/e2e/propose.mjs            exit 0 = pass
import { chromium } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer } from '../lib/static-server.mjs';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const SITE = join(ROOT, 'site');
if (!existsSync(join(SITE, 'static', 'busytex', 'manifest.json')) || !existsSync(join(SITE, 'propose.html'))) {
  console.log('The site or its engine bundle is missing. Build it once with:  python3 build.py --preview');
  process.exit(2);
}
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const pdfText = (bytes) => {
  const f = join(mkdtempSync(join(tmpdir(), 'propose-e2e-')), 'sheet.pdf');
  writeFileSync(f, Buffer.from(bytes));
  const py = spawnSync('python3', ['-c', 'import sys, pypdf; print("\\n".join(p.extract_text() or "" for p in pypdf.PdfReader(sys.argv[1]).pages))', f], { encoding: 'utf8' });
  return py.stdout || '';
};

const server = await startServer(SITE);
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch();
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
// the mail app is recorded, not opened
await page.addInitScript(() => {
  window.__mailto = [];
  // no share menu unless a test gives one (headless browsers differ): Firefox's case
  Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
  Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: undefined });
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (/^mailto:/.test(this.href)) { window.__mailto.push(this.href); return; } return click.call(this); };
});
const downloads = [];
page.on('download', d => downloads.push(d));
const cspViolations = [];                                   // base.html's Content-Security-Policy: nothing may be blocked
await context.exposeFunction('__cspViolation', s => cspViolations.push(s));
await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__cspViolation(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)));
const engineRequests = [];
page.on('request', r => { if (r.url().includes('/static/busytex/')) engineRequests.push(r.url()); });
const sheetBytes = () => page.evaluate(() => Array.from(window.propose.state.preview.pdf || []));
const status = () => page.textContent('#pp-preview-status');
// the sheet shows the text now in the form (typeset, or its LaTeX error)
const waitSheet = async (what) => {
  try { await page.waitForFunction(() => window.propose.upToDate() && ['ok', 'error', 'failed'].includes(document.getElementById('pp-preview-status').dataset.state), null, { timeout: 240000 }); }
  catch (e) { throw new Error(`the sheet (${what}) never followed the text: "${await page.textContent('#pp-preview-status')}"`); }
  return page.evaluate(() => document.getElementById('pp-preview-status').dataset.state);
};
// the share menu as Chrome has it: canShare says yes to everything, share() refuses a .tex file (as Chrome 153 does, the
// tap spent); what it takes is recorded.  noShareSheet: none again (Firefox)
const shareSheet = () => page.evaluate(() => {
  window.__shared = [];
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async d => {
    if (d.files.some(f => /\.tex$/.test(f.name))) throw new DOMException('Permission denied', 'NotAllowedError');
    window.__shared.push({ title: d.title, text: d.text, files: await Promise.all(d.files.map(async f => ({ name: f.name, head: await f.slice(0, 5).text(),
      text: /\.(tex|txt)$/.test(f.name) ? await f.text() : '', bytes: /\.pdf$/.test(f.name) ? Array.from(new Uint8Array(await f.arrayBuffer())) : null }))) });
  } });
});
const noShareSheet = () => page.evaluate(() => { delete navigator.share; delete navigator.canShare; });
// what the mail app was given: the last mailto link clicked, read back
const lastMail = async () => { const u = new URL(await page.evaluate(() => window.__mailto[window.__mailto.length - 1])); return { to: u.pathname, subject: u.searchParams.get('subject'), body: u.searchParams.get('body') }; };

try {
  console.log('1. from the Problems page, the header link opens the propose page; Send knows the club\'s address');
  await page.goto(`${base}/problems.html`);
  await page.click('#site-nav a[href="propose.html"]');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
  check(page.url().endsWith('/propose.html'), 'the header link "Propose a problem" opens propose.html');
  check((await page.getAttribute('#pp-submit', 'data-address')) === 'olympiadclub@math.ethz.ch', 'Send knows the club\'s address (olympiadclub@math.ethz.ch)');
  check(await page.locator('.pp-send button:visible').count() === 1, 'one way to send: Send to the club, nothing else');
  const modules = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(n => /\/static\/js\/bank-[a-z-]+\.js/.test(n)));
  const query = new Set(modules.map(n => new URL(n).search));
  check(modules.some(n => n.includes('bank-compile.js')) && query.size === 1 && /^\?v=\w+$/.test([...query][0]),
    `every page module is loaded with the same ?v= (one copy of each, ${[...query]})`);
  check(await page.locator('#pp-solution').isHidden() && await page.locator('#pp-from').isHidden() && await page.locator('#pp-tree').isHidden() && await page.locator('#pp-note').isHidden() && !(await page.evaluate(() => document.getElementById('pp-details').open)),
    'only the title and the statement show at first: the rest waits behind its line, or under More details');
  check(!(await page.locator('select').count()), 'no menu of the browser\'s own anywhere on the page');
  await page.click('#pp-title'); await page.keyboard.press('a'); await page.keyboard.press('Backspace');
  await page.mouse.wheel(0, 400); await page.mouse.wheel(0, -400);
  check(engineRequests.length === 0, `clicking, typing a title and scrolling do not download the LaTeX engine (${engineRequests.length} requests)`);

  console.log('2. only the statement and what it is about are required');
  await page.click('#pp-submit');
  const errs = await page.textContent('#pp-errors');
  check(/statement/i.test(errs) && /about/i.test(errs), `sending an empty form says what is missing (${errs.replace(/\s+/g, ' ').trim()})`);
  check((await page.evaluate(() => window.__mailto.length)) === 0 && downloads.length === 0, 'nothing is sent while something required is missing');
  check(await page.locator('#pp-statement.is-invalid').count() === 1 && await page.locator('#pp-add-about.is-invalid').count() === 1, 'the statement box and the line "What is it about?" are marked');
  check(engineRequests.length === 0, 'still no engine download');
  const described = await page.evaluate(() => { const t = document.getElementById('pp-statement');
    return [t.getAttribute('aria-invalid'), (t.getAttribute('aria-describedby') || '').split(' ').map(id => (document.getElementById(id) || {}).textContent).join()]; });
  check(described[0] === 'true' && /statement/i.test(described[1]), `and told to screen readers: aria-invalid + aria-describedby (${described})`);
  await page.locator('#pp-errors a', { hasText: /about/ }).click();
  check(await page.locator('#pp-tree').isVisible() && (await page.evaluate(() => document.activeElement.id)) === 'pp-add-about', 'its message opens "What is it about?"');
  const tints = await page.evaluate(() => {
    const tags = JSON.parse(document.getElementById('propose-data').textContent).tags.area.filter(t => !t.parent);
    const dark = document.documentElement.dataset.theme === 'dark';
    return tags.map(t => { const li = document.querySelector(`#pp-tree [data-topic="${t.slug}"]`);
      return [t.slug, li && getComputedStyle(li).getPropertyValue('--c').trim(), t.colour && t.colour[dark ? 1 : 0]]; });
  });
  check(tints.length > 1 && tints.every(([, got, want]) => want && got === want), `its first-level topics in their colours, as on the Problems page (${tints.filter(([, g, w]) => g !== w).map(([s]) => s).join(', ') || 'all'})`);

  console.log('3. writing: title, statement with a drawing and citations, a solution, the topics, where it is from, More details');
  await page.fill('#pp-title', 'Sum of two cubes');
  await page.fill('#pp-statement', 'Show that \\( n^3+m^3 \\) is special \\cite{solomon1967Hurwitz}, see also \\cite{own2020}.\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\nThat is all.');
  await page.click('#pp-add-solution');
  check(await page.locator('#pp-solution').isVisible() && (await page.evaluate(() => document.activeElement.id)) === 'pp-solution', '"Add a solution" opens the solution box, the cursor in it');
  await page.fill('#pp-solution', 'By induction.\nAnd that is the end.');
  check((await page.textContent('#pp-add-solution')).trim() === 'Solution', 'its line then says "Solution"');
  const tall = await page.evaluate(() => { const t = document.getElementById('pp-statement'), h = t.offsetHeight; t.value += '\n'.repeat(12) + 'More.'; t.dispatchEvent(new Event('input', { bubbles: true })); return [h, t.offsetHeight]; });
  check(tall[1] > tall[0] + 100, `the statement box grows with its text (${tall[0]} → ${tall[1]} px)`);
  await page.fill('#pp-statement', 'Show that \\( n^3+m^3 \\) is special \\cite{solomon1967Hurwitz}, see also \\cite{own2020}.\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\nThat is all.');
  // what it is about: the tree
  const tg = slug => `#pp-tree .tt-tg[data-for="${slug}"]`, nm = slug => `#pp-tree .tt-name[data-slug="${slug}"]`;
  check(await page.locator(nm('primes')).count() === 0 && await page.locator(nm('number-theory')).count() === 1, 'the tree opens folded: the main topics only');
  await page.click(tg('number-theory'));
  await page.click(nm('primes'));
  await page.click(nm('divisibility'));
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().area)) === '["primes","divisibility"]' && (await page.getAttribute(nm('primes'), 'aria-pressed')) === 'true',
    'a click on a name chooses it (several may be)');
  await page.click(tg('analysis'));
  await page.click(tg('real-analysis'));
  await page.click(nm('series'));
  await page.click(nm('series'));
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().area)) === '["primes","divisibility"]', 'a second click lets it go');
  await page.click(tg('analysis'));
  await page.waitForTimeout(400);
  check(await page.locator(nm('real-analysis')).count() === 0, 'its round button folds a topic');
  await page.click(tg('analysis'));
  check(await page.locator(nm('real-analysis')).count() === 1 && await page.locator(nm('series')).count() === 0, 'unfolded again, one level shows: folding closed every branch under it');
  check((await page.textContent('#pp-about-sum')) === 'Primes, Divisibility & gcd', `the line says what is chosen (${await page.textContent('#pp-about-sum')})`);
  const addHere = under => `#pp-tree .tt-add[data-under="${under}"] .tt-add-btn`;
  await page.click(addHere('number-theory'));                     // (Number theory is open since its topics were chosen)
  await page.keyboard.type('Zig-zag sums');
  await page.keyboard.press('Enter');
  const added = await page.evaluate(() => { const d = window.propose.readDraft(); return [d.newArea, d.newAreaUnder]; });
  check(JSON.stringify(added) === '[["Zig-zag sums"],{"Zig-zag sums":"number-theory"}]' && await page.locator('#pp-tree .tt-new', { hasText: 'Zig-zag sums' }).count() === 1,
    '"New topic here", at the end of an open branch, names a topic the tree lacks: it hangs there, marked new');
  check(/area "Zig-zag sums" under number-theory/.test(await page.evaluate(() => window.propose.P.problemFile(window.propose.fileDraft(window.propose.readDraft())))),
    'and the file tells the reviewer where it goes');
  await page.click(addHere('number-theory'));
  await page.keyboard.type('primes');
  await page.keyboard.press('Enter');
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().newArea)) === '["Zig-zag sums"]', 'a name the tree has is not added as new');
  await page.click('#pp-tree .tt-new .tt-new-x');
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().newArea)) === '[]', 'its × takes it away again');
  await page.click(tg('number-theory'));
  // where it is from
  await page.click('#pp-add-from');
  await page.fill('#pp-from', 'im');
  const imc = await page.evaluate(() => { const f = JSON.parse(document.getElementById('propose-data').textContent).originForms.imc; return `IMC ${f.date}, ${f.number}`; });
  const opts = await page.evaluate(() => [...document.querySelectorAll('#pp-from-list [role=option]')].map(o => o.textContent));
  check(opts.length >= 2 && opts[0] === `IMC${imc}` && await page.getAttribute('#pp-from', 'aria-expanded') === 'true',
    `typing "im" lists the competitions the bank knows, the one it has most problems from first, with its usual form (${opts.slice(0, 2).join(' | ')})`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check((await page.inputValue('#pp-from')) === 'IMC ' && (await page.textContent('#pp-from-read')) === `Then the year and the problem, as in ${imc}.` && await page.locator('#pp-from-list').isHidden(),
    `picked with the keyboard, it writes its name and says what follows (${await page.textContent('#pp-from-read')})`);
  await page.fill('#pp-from', 'my');                              // ("mine" alone is read at once: no list)
  await page.locator('#pp-from-list [role=option]', { hasText: 'My own problem' }).click();
  check((await page.inputValue('#pp-from')) === 'My own problem' && (await page.evaluate(() => window.propose.readDraft().origin)) === 'original', 'one\'s own problem is in the list too');
  await page.fill('#pp-from', 'Putnam 1989, A3');
  check((await page.textContent('#pp-from-read')) === 'Read as Putnam 1989, A3.', `"Where is it from?" says what it read (${await page.textContent('#pp-from-read')})`);
  check(JSON.stringify(await page.evaluate(() => { const d = window.propose.readDraft(); return [d.origin, d.originDate, d.originNumber]; })) === '["putnam","1989","A3"]',
    'and fills the competition, the date and the number under More details');
  await page.fill('#pp-from', 'Kalva archive');
  check(/kept as written/.test(await page.textContent('#pp-from-read')) && (await page.evaluate(() => window.propose.readDraft().origin)) === ''
    && /% references:     Kalva archive/.test(await page.evaluate(() => window.propose.P.problemFile(window.propose.fileDraft(window.propose.readDraft())))),
    'something it does not know is kept as written, as a reference');
  await page.fill('#pp-from', 'Putnam 1989, A3');
  check((await page.textContent('#pp-from-read')) === 'Read as Putnam 1989, A3.', 'read again');
  await page.fill('#pp-from', 'my own problem');
  check(JSON.stringify(await page.evaluate(() => { const d = window.propose.readDraft(); return [d.origin, d.originNumber]; })) === '["original",""]', `"my own problem" is read as Original (${await page.textContent('#pp-from-read')})`);
  await page.fill('#pp-from', 'Putnam 1989, A3');
  // why the proposer likes it
  await page.click('#pp-add-note');
  await page.fill('#pp-note', 'A cute identity hides behind it.');
  check((await page.textContent('#pp-note-sum')) === 'A cute identity hides behind it.' && !/cute identity/.test(await page.evaluate(() => window.propose.P.problemFile(window.propose.readDraft()))),
    '"Why do you like it?" keeps a note for the club, not in the file');
  // More details
  await page.click('#pp-details > summary');
  await page.fill('#pp-bibtex', '@article{own2020,\n  author = {Doe, Jane},\n  title = {An Own Reference},\n  journal = {J. Test},\n  year = {2020},\n}');
  check(/own2020/.test(await page.textContent('#pp-bib-keys')), 'the bibliography box lists its keys');
  const mtg = key => `#pp-methods .tt-tg[data-for="${key}"]`, mnm = slug => `#pp-methods .tt-name[data-slug="${slug}"]`;
  const groups = await page.locator('#pp-methods > li > .tt-row > .tt-tg').count();
  check(groups > 3 && await page.locator('#pp-methods button.tt-name[data-slug]').count() === 0, `the methods come in their ${groups} groups, folded`);
  await page.click('#pp-methods .tt-group >> nth=0');
  check(await page.locator('#pp-methods button.tt-name[data-slug]').count() > 0, 'a group\'s name unfolds it too');
  await page.click(mnm('induction'));
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().methods)) === '["induction"]', 'a method chosen with a click');
  await page.click('#pp-methods .tt-add[data-under="g:Proof strategies"] .tt-add-btn');
  await page.keyboard.type('Zig-zag pairing');
  await page.keyboard.press('Enter');
  check(JSON.stringify(await page.evaluate(() => { const d = window.propose.readDraft(); return [d.methods, d.newMethods]; })) === '[["induction"],["Zig-zag pairing"]]'
    && /% Proposed new tags, not in tags\.yml yet: method "Zig-zag pairing" in "Proof strategies"\n/.test(await page.evaluate(() => window.propose.P.problemFile(window.propose.readDraft()))),
    '"New method here" names a method in its group, and the file says so');
  await page.click(mtg('g:Proof strategies'));
  await page.click('#pp-difficulty .pp-choice[data-value="medium"]');
  check((await page.evaluate(() => window.propose.readDraft().difficulty)) === 'medium' && (await page.textContent('#pp-difficulty-help')).length > 0, 'difficulty: four words, one chosen, its meaning under them');
  await page.click('#pp-difficulty .pp-choice[data-value="medium"]');
  check((await page.evaluate(() => window.propose.readDraft().difficulty)) === '', 'chosen again, none: not rated');
  await page.click('#pp-difficulty .pp-choice[data-value="medium"]');
  await page.fill('#pp-references', 'https://example.org/source\nKalva archive');
  check(await page.locator('#pp-errors').isHidden(), 'no error left');

  console.log('4. the sheet: the problem typeset in the page (in-browser pdfTeX, drawn with PDF.js)');
  check((await waitSheet('first')) === 'ok', `it typesets (${await status()})`);
  const canvases = await page.evaluate(() => [...document.querySelectorAll('#pp-pages canvas')].map(c => [c.width, c.height]));
  check(canvases.length >= 1 && canvases.every(([w, h]) => w > 100 && h > 20) && await page.locator('#pp-sheet-empty').isHidden(), `drawn on the sheet (${JSON.stringify(canvases)})`);
  const text = pdfText(await sheetBytes());
  check(/Problem\s*1\.\s*Sum of two cubes/.test(text) && !/\(#/.test(text), 'heading "Problem 1. Sum of two cubes", no number');
  check(/Putnam 1989, A3/.test(text), 'origin line "Putnam 1989, A3"');
  check(/TikZ drawing/.test(text) && /boxes here/.test(await status()), 'the drawing is a box, and the sheet says so');
  check(/special\s*\[1\],\s*see\s*also\s*\[2\]/.test(text) && /An Own Reference/.test(text) && /Solomon Hurwitz/.test(text), 'citations resolved from references.bib and the own entry');
  check(/Solution\.\s*By\s*induction/.test(text), 'the solution follows');
  const width = await page.evaluate(() => window.propose.state.preview.width);
  check(width === null || (width > 150 && width < 426.79), `typeset at the sheet's own measure, its text at the page's size (${width} pt)`);

  console.log('5. a LaTeX error shows under its box; the last sheet that typeset stays, greyed');
  await page.fill('#pp-solution', 'By induction.\nAnd \\notacommand{} end.');
  check((await waitSheet('error')) === 'error', 'the sheet notices the error');
  const errText = await page.textContent('#pp-solution-error');
  check(/Line 2: Undefined control sequence/.test(errText) && await page.locator('#pp-solution-error').isVisible(), `the error is under the solution, with its line: ${errText.slice(0, 80)}`);
  check(await page.locator('#pp-pages.is-stale').count() === 1 && await page.locator('#pp-pages canvas').count() >= 1 && /the solution/.test(await status()), 'the last sheet stays, greyed, and the status says where to look');
  await page.click('#pp-submit');
  await page.waitForFunction(() => document.getElementById('pp-submit-status').dataset.kind === 'latex', null, { timeout: 60000 });
  check((await page.evaluate(() => window.__mailto.length)) === 0 && /error.*again to send it as it is/.test(await page.textContent('#pp-submit-status')),
    `sending it says its LaTeX has an error, and sends nothing yet (${await page.textContent('#pp-submit-status')})`);
  downloads.length = 0;
  await page.click('#pp-submit');
  await page.waitForFunction(() => window.__mailto.length === 1, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  check((await lastMail()).body === 'Problem: Sum of two cubes\n' && JSON.stringify(downloads.map(x => x.suggestedFilename())) === '["new-sum-of-two-cubes.tex","sum-of-two-cubes-note.txt"]',
    `pressed again, it goes without a PDF (${downloads.map(x => x.suggestedFilename())})`);
  await page.fill('#pp-solution', 'By induction.\nAnd that is the end.');
  check((await waitSheet('fixed')) === 'ok' && await page.locator('#pp-solution-error').isHidden() && await page.locator('#pp-pages.is-stale').count() === 0, 'fixing it clears the error');
  const mistakes = [['$', 'statement', 'x $a', /Something opened here is never closed.*Missing \$ inserted/],
    ['{', 'solution', 'By \\textbf{induction.', /Something opened here is never closed.*File ended while scanning use of \\textbf/],
    ['\\begin{itemize}', 'statement', 'A list\n\\begin{itemize}\n\\item one', /Line 2: something opened here is never closed.*\\begin\{itemize\} ended by \\end\{problem\}/]];
  for (const [what, box, bad, want] of mistakes) {
    const before = await page.inputValue(`#pp-${box}`);
    await page.fill(`#pp-${box}`, bad);
    await waitSheet(what);
    const t = await page.textContent(`#pp-${box}-error`);
    check(want.test(t) && !/null/.test(t) && !(await page.locator(`#pp-${box}-error code`, { hasText: /^\\end\{(problem|solution)\}$/ }).count()),
      `an unclosed ${what} is shown under its box, not at the page's own \\end{…} (${t.slice(0, 110)})`);
    await page.fill(`#pp-${box}`, before);
  }
  await waitSheet('mistakes fixed');

  console.log('6. a compile that never ends is stopped and the engine restarts');
  const stuck = await page.evaluate(async () => {
    const C = await import('./static/js/bank-compile.js' + new URL(document.querySelector('script[src*="bank-propose-ui.js"]').src).search);   // the page's copy
    const t0 = performance.now();
    let message = '';
    try { await C.compileTex('\\begin{document}\\def\\x{\\x}\\x\\end{document}\n', { timeoutMs: 3000 }); } catch (e) { message = e.message; }
    const after = await C.compileTex('\\begin{document}Fine.\\end{document}\n', { timeoutMs: 60000 });
    return { message, ms: performance.now() - t0, ok: after.exit === 0 && !!after.pdf };
  });
  check(/too long/.test(stuck.message) && stuck.ok, `endless loop stopped after the timeout, next compile works (${Math.round(stuck.ms)} ms)`);

  console.log('6b. a looping text that is then fixed recovers; display-math diagrams, Greek, DOIs with _');
  const saved = await page.evaluate(() => window.propose.readDraft());
  await page.evaluate(() => { window.propose.state.preview.timeoutMs = 4000; });
  await page.fill('#pp-statement', 'Loop \\def\\x{\\x}\\x');
  await page.waitForFunction(() => document.getElementById('pp-preview-status').dataset.state === 'running', null, { timeout: 10000 });
  await page.fill('#pp-statement', 'Fixed. Consider\n\\[\n\\begin{tikzcd}\nA \\arrow[r] & B\n\\end{tikzcd}\n\\]\nwith φ and \\cite{sp}.');
  await page.fill('#pp-bibtex', '@incollection{sp, author = {A. Author}, title = {Chapter}, year = {2010}, doi = {10.1007/978-3-642-15546-8_7}}');
  const after = await waitSheet('after a loop');
  check(after === 'ok' && await page.locator('#pp-statement-error').isHidden(), `after a stuck compile the fixed text is typeset, not reported as a loop (${after}: ${await status()})`);
  check(/Chapter/.test(pdfText(await sheetBytes())), 'a diagram in \\[ … \\], a Greek letter and a DOI with _ compile on the sheet');
  await page.evaluate(() => { window.propose.state.preview.timeoutMs = 0; });
  await page.fill('#pp-title', '√2 is irrational');
  check(/cannot contain √/.test(await page.textContent('#pp-errors')), 'a title with √ is refused before sending (CI could not print it)');
  await page.evaluate(d => window.propose.setDraft(d), saved);
  await page.fill('#pp-title', saved.title);                        // typed: the autosave keeps this draft
  await waitSheet('restored');

  console.log('7. Send to the club: the share menu with the PDF and the .tex, the address copied');
  await shareSheet();
  await page.click('#pp-submit');
  await page.waitForFunction(() => window.__shared.length === 1, null, { timeout: 120000 });
  const shared = await page.evaluate(() => window.__shared[0]);
  const expected = await page.evaluate(() => window.propose.P.problemFile(window.propose.fileDraft(window.propose.readDraft())));
  check(JSON.stringify(shared.files.map(f => f.name)) === '["sum-of-two-cubes.pdf","new-sum-of-two-cubes.tex.txt","sum-of-two-cubes-note.txt"]' && shared.files[0].head === '%PDF-'
    && shared.files[1].text === expected && shared.files[2].text === 'A cute identity hides behind it.\n',
    `the menu gets the three files: the PDF, the problem file (as .tex.txt: Chrome's menu refuses .tex), the note (${shared.files.map(f => f.name)})`);
  check(/Problem\s*1\.\s*Sum of two cubes/.test(pdfText(shared.files[0].bytes)) && /Putnam 1989, A3/.test(pdfText(shared.files[0].bytes)), 'the PDF is the problem as the bank prints it');
  check(shared.title === 'Problem proposal: Sum of two cubes' && shared.text === 'Problem: Sum of two cubes\n', `and one line: "${shared.text.trim()}"`);
  check((await page.evaluate(() => navigator.clipboard.readText())) === 'olympiadclub@math.ethz.ch' && /Thank you\. We read every proposal/.test(await page.textContent('#pp-submit-status')),
    'the club\'s address was copied for To, and the page thanks the sender once it is sent');

  console.log('7b. without a share menu (Firefox): the files saved, the mail app opened with the message');
  await noShareSheet();
  await page.evaluate(() => { window.__mailto = []; });
  downloads.length = 0;
  await page.click('#pp-submit');
  await page.waitForFunction(() => window.__mailto.length === 1, null, { timeout: 120000 });
  await page.waitForTimeout(300);
  const mail = await lastMail();
  const got = downloads.map(x => x.suggestedFilename());
  check(JSON.stringify(got) === '["sum-of-two-cubes.pdf","new-sum-of-two-cubes.tex","sum-of-two-cubes-note.txt"]' && readFileSync(await downloads[1].path(), 'utf8') === expected,
    `the three files are saved (${got})`);
  check(mail.to === 'olympiadclub@math.ethz.ch' && mail.subject === 'Problem proposal: Sum of two cubes' && mail.body === 'Problem: Sum of two cubes\n',
    `the mail app opens addressed to the club, with its subject and the one line (${mail.subject})`);
  check(/Drag the three files just saved \(sum-of-two-cubes\.pdf, new-sum-of-two-cubes\.tex and sum-of-two-cubes-note\.txt\) into it, then press Send\./.test(await page.textContent('#pp-submit-status'))
    && await page.locator('#pp-mail-help').isVisible(), 'the page says to drag the three files in, and what to do if nothing opened');
  const dir = mkdtempSync(join(tmpdir(), 'propose-file-'));
  const file = join(dir, 'new-sum-of-two-cubes.tex');
  writeFileSync(file, expected);
  const val = spawnSync('python3', ['-m', 'bank.validate', '--compile', file], { cwd: ROOT, encoding: 'utf8' });
  console.log('   ' + (val.stdout || val.stderr).trim().split('\n').join('\n   '));
  check(val.status === 0, 'the file passes the CI validator and compiles with pdflatex (author mode, real TikZ)');

  console.log('8. LaTeX help');
  check(await page.locator('#pp-show-latex').isVisible() && await page.locator('.pp-label-row #pp-show-latex').count() === 1, '"LaTeX help" sits beside the statement');
  await page.click('#pp-show-latex');
  await page.waitForFunction(() => document.getElementById('pp-preamble').dataset.loaded === '1', null, { timeout: 10000 });
  const help = await page.textContent('#pp-latex');
  check(await page.locator('#pp-latex').isVisible() && /\\cite\{key\}/.test(help) && /Shared results/.test(help) && (await page.textContent('#pp-preamble')).includes('\\newcommand{\\bankproblem}'),
    'it holds the few rules, the shared results and what the club\'s LaTeX has (preamble.tex)');
  const results = await page.evaluate(() => [JSON.parse(document.getElementById('propose-data').textContent).appendix.map(a => a.name).sort(),
    [...document.querySelectorAll('#pp-latex .pp-results dt')].map(d => d.textContent).sort(), (document.querySelector('#pp-latex .pp-results') || {}).childElementCount]);
  check(results[0].length > 0 && JSON.stringify(results[0]) === JSON.stringify(results[1]),
    `the shared results it lists are the bank's own, all ${results[0].length} of them (made at each build from problem-bank/appendix/: a new one shows by itself)`);
  const sizeNote = await page.textContent('#pp-typeset-line');
  check(/about \d+ MB/.test(sizeNote), `the engine's download size comes from its manifest (${sizeNote.trim().replace(/\s+/g, ' ')})`);
  await page.click('#pp-latex [data-close]');
  check(await page.locator('#pp-latex').isHidden(), 'the dialog closes');

  console.log('9. the draft stays on this device (also right after typing); a second tab is noticed; Start again');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
  const restored = await page.evaluate(() => window.propose.readDraft());
  check(restored.title === 'Sum of two cubes' && restored.area.join() === 'primes,divisibility' && restored.from === 'Putnam 1989, A3' && /sp|own2020/.test(restored.bibtex), 'reloading restores the draft');
  check(await page.locator('#pp-solution').isVisible() && await page.locator('#pp-note').isVisible() && (await page.textContent('#pp-from-sum')) === 'Putnam 1989, A3' && (await page.textContent('#pp-about-sum')) === 'Primes, Divisibility & gcd'
    && (await page.inputValue('#pp-note')) === 'A cute identity hides behind it.', 'with its solution and its note open, and its lines saying what they hold');
  check(/Sent already\?/.test(await page.textContent('#pp-saved')), `and a word that it may have been sent (${await page.textContent('#pp-saved')})`);
  check(JSON.stringify(await page.evaluate(() => { const d = window.propose.readDraft(); return [d.methods, d.newMethods, d.newMethodsUnder, d.difficulty]; })) === '[["induction"],["Zig-zag pairing"],{"Zig-zag pairing":"Proof strategies"},"medium"]',
    'methods, a new one in its group, and the difficulty come back too');
  await page.fill('#pp-title', 'Changed just before reload');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
  check((await page.inputValue('#pp-title')) === 'Changed just before reload', 'an edit made just before a reload is kept (saved when the page is left)');
  check(/draft is back/.test(await page.textContent('#pp-saved')), 'edited after sending: a draft again');
  await page.fill('#pp-title', 'Changed again');
  await page.waitForFunction(() => /Saved on this device/.test(document.getElementById('pp-saved').textContent), null, { timeout: 5000 });
  check(true, '"Saved on this device" after typing');
  const tabB = await context.newPage();
  await tabB.goto(`${base}/propose.html`);
  await tabB.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
  await tabB.fill('#pp-title', 'Problem from tab B');
  await page.waitForFunction(() => !document.getElementById('pp-other-tab').hidden, null, { timeout: 5000 }).catch(() => {});
  check(await page.locator('#pp-other-tab').isVisible() && (await page.inputValue('#pp-title')) === 'Changed again',
    'tab A is told that tab B changed the saved draft, and keeps its own text');
  await page.fill('#pp-title', 'Sum of two cubes');
  await tabB.waitForFunction(() => !document.getElementById('pp-other-tab').hidden, null, { timeout: 5000 }).catch(() => {});
  check(await page.locator('#pp-other-tab').isHidden() && await tabB.locator('#pp-other-tab').isVisible(), 'typing in tab A saves it again, and tab B is told');
  await tabB.close();
  check((await page.textContent('#pp-clear')) === 'Start again' && await page.locator('#pp-clear').isVisible(), '"Start again" is there when something is written');
  await page.click('#pp-clear');
  check(await page.locator('#pp-confirm').isVisible() && (await page.evaluate(() => document.activeElement.textContent)) === 'Cancel', '"Start again" asks first, in a box of the page\'s own, Cancel ready');
  await page.keyboard.press('Escape');
  check(await page.locator('#pp-confirm').isHidden() && (await page.evaluate(() => window.propose.readDraft().title)) === 'Sum of two cubes', 'Escape: nothing erased');
  await page.click('#pp-clear');
  await page.click('#pp-confirm [data-close]');
  check((await page.evaluate(() => window.propose.readDraft().title)) === 'Sum of two cubes', 'Cancel: nothing erased');
  await page.click('#pp-clear');
  await page.click('#pp-confirm-yes');
  const cleared = await page.evaluate(() => window.propose.readDraft());
  check(!cleared.title && !cleared.statement && !cleared.area.length && !cleared.from && await page.locator('#pp-confirm').isHidden(), 'confirmed, the form is emptied');
  check(await page.locator('#pp-clear').isHidden() && await page.locator('#pp-solution').isHidden() && await page.locator('#pp-sheet-empty').isVisible(), 'its lines closed, the sheet empty, and "Start again" hidden');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
  check(!(await page.evaluate(() => window.propose.readDraft().statement)), 'and the draft is gone after a reload');
  // what the page keeps beside the file is a draft too: a "Where is it from?" that names no competition, a note; spaces are not
  const reload = async () => { await page.reload(); await page.waitForFunction(() => document.documentElement.hasAttribute('data-ready')); };
  const stored = () => page.waitForFunction(() => /Saved on this device/.test(document.getElementById('pp-saved').textContent), null, { timeout: 5000 }).catch(() => {});
  for (const [line, text, what] of [['from', 'Kalva archive', 'a "Where is it from?" that names no competition'], ['note', 'A cute identity hides behind it.', 'a note ("Why do you like it?")']]) {
    await page.click(`#pp-add-${line}`);
    await page.fill(`#pp-${line}`, '   ');
    const blank = await page.locator('#pp-clear').isHidden();
    await page.fill(`#pp-${line}`, text);
    const shown = await page.locator('#pp-clear').isVisible();
    await stored();
    await reload();
    const back = await page.evaluate(k => window.propose.readDraft()[k], line);
    check(blank && shown && back === text && /Your draft is back/.test(await page.textContent('#pp-saved')) && await page.locator('#pp-clear').isVisible(),
      `a form that holds only ${what} has something written: "Start again" shows (not for spaces alone), and after a reload the text is back ("${await page.textContent('#pp-saved')}")`);
    await page.click('#pp-clear');
    await page.click('#pp-confirm-yes');
  }
  await page.click('#pp-add-note');
  await page.fill('#pp-note', '   ');
  await stored();
  await reload();
  check(await page.locator('#pp-clear').isHidden() && !/draft is back/.test(await page.textContent('#pp-saved')),
    'spaces alone are no draft: after a reload nothing is brought back, and "Start again" stays hidden');

  check(consoleErrors.length === 0, 'no console errors' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' | ') : ''));
  check(cspViolations.length === 0, 'no Content-Security-Policy violation in any of the above' + (cspViolations.length ? ': ' + cspViolations.slice(0, 3).join(' | ') : ''));
} catch (e) {
  failures.push('exception: ' + e.message);
  console.log('  ✗ exception: ' + e.stack);
} finally {
  await browser.close();
  await server.close();
}

console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nall propose e2e checks passed');
process.exit(failures.length ? 1 : 0);
