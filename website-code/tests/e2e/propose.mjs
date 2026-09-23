// End-to-end test of the "Propose a problem" page in headless Chromium (Playwright library, no test runner):
// required fields, tag pickers, live preview (PDF content checked with pypdf), error location, a stuck compile,
// Copy + open GitHub (clipboard + URL), the generated file passing `python3 -m bank.validate --compile`,
// "Show available LaTeX", Download, the draft kept in the browser (two tabs), and the PDF links used when the browser
// has no built-in PDF viewer (headless Chromium, like Chrome for Android).
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
  const f = join(mkdtempSync(join(tmpdir(), 'propose-e2e-')), 'preview.pdf');
  writeFileSync(f, Buffer.from(bytes));
  const py = spawnSync('python3', ['-c', 'import sys, pypdf; print("\\n".join(p.extract_text() or "" for p in pypdf.PdfReader(sys.argv[1]).pages))', f], { encoding: 'utf8' });
  return py.stdout || '';
};

const server = await startServer(SITE);
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch();
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
await page.addInitScript(() => { window.__opened = []; window.open = (url) => { window.__opened.push(url); return {}; }; });
const downloads = [];
page.on('download', d => downloads.push(d.suggestedFilename()));
const cspViolations = [];                                   // base.html's Content-Security-Policy: nothing may be blocked
await context.exposeFunction('__cspViolation', s => cspViolations.push(s));
await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__cspViolation(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)));
const engineRequests = [];
page.on('request', r => { if (r.url().includes('/static/busytex/')) engineRequests.push(r.url()); });
const previewUrl = (p = page) => p.evaluate(() => window.propose.state.preview.url);
const previewBytes = () => page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(window.propose.state.preview.url)).arrayBuffer())));
const waitPreview = async (what) => {
  try { await page.waitForFunction(() => /Updated|LaTeX error/.test(document.getElementById('pp-preview-status').textContent), null, { timeout: 240000 }); }
  catch (e) { throw new Error(`preview (${what}) never finished: "${await page.textContent('#pp-preview-status')}"`); }
};

try {
  console.log('1. from the Problems page, "+" opens the propose page; the email fallback is always shown');
  await page.goto(`${base}/problems.html`);
  await page.click('#bank-propose');
  await page.waitForSelector('#pp-area-input');
  check(page.url().endsWith('/propose.html'), 'the "+ Propose a problem" button opens propose.html');
  check((await page.locator('a[href="mailto:olympiadclub@math.ethz.ch"]').count()) >= 1 && /No GitHub account\?/.test(await page.textContent('body')),
    '"No GitHub account? Send your problem to olympiadclub@math.ethz.ch" is shown');
  const modules = await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(n => /\/static\/js\/bank-[a-z-]+\.js/.test(n)));
  const query = new Set(modules.map(n => new URL(n).search));
  check(modules.some(n => n.includes('bank-compile.js')) && query.size === 1 && /^\?v=\w+$/.test([...query][0]),
    `every page module is loaded with the same ?v= (one copy of each, ${[...query]})`);
  await page.click('#pp-title'); await page.keyboard.press('a'); await page.keyboard.press('Backspace');
  await page.mouse.wheel(0, 400); await page.mouse.wheel(0, -400);
  check(engineRequests.length === 0, `clicking, typing a title and scrolling do not download the LaTeX engine (${engineRequests.length} requests)`);

  console.log('2. only the statement and one area are required');
  await page.click('#pp-submit');
  const errs = await page.textContent('#pp-errors');
  check(/statement/i.test(errs) && /area/i.test(errs), 'sending an empty form lists the statement and the area as missing');
  check((await page.evaluate(() => window.__opened.length)) === 0, 'nothing is opened while something required is missing');
  check(await page.locator('#pp-statement.is-invalid').count() === 1, 'the statement box is marked');
  check(engineRequests.length === 0, 'still no engine download');
  const described = await page.evaluate(() => { const t = document.getElementById('pp-statement');
    return [t.getAttribute('aria-invalid'), (t.getAttribute('aria-describedby') || '').split(' ').map(id => (document.getElementById(id) || {}).textContent).join()]; });
  check(described[0] === 'true' && /statement/i.test(described[1]), `and told to screen readers: aria-invalid + aria-describedby (${described})`);

  console.log('3. fill the form: title, statement with a drawing and citations, solution, tags, history, bibliography');
  await page.fill('#pp-title', 'Sum of two cubes');
  check((await page.textContent('#pp-filename')) === 'new-sum-of-two-cubes.tex', 'the file name follows the title');
  await page.fill('#pp-statement', 'Show that $n^3+m^3$ is special \\cite{solomon1967Hurwitz}, see also \\cite{own2020}.\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\nThat is all.');
  await page.fill('#pp-solution', 'By induction.\nAnd that is the end.');
  await page.fill('#pp-bibtex', '@article{own2020,\n  author = {Doe, Jane},\n  title = {An Own Reference},\n  journal = {J. Test},\n  year = {2020},\n}');
  check(/own2020/.test(await page.textContent('#pp-bib-keys')), 'the bibliography box lists its keys');
  await page.fill('#pp-area-input', 'primes');
  await page.waitForSelector('#pp-area-list [role=option]');
  await page.keyboard.press('Enter');
  await page.fill('#pp-area-input', '');
  await page.click('#pp-area-input');
  check((await page.locator('#pp-area-list .bank-option', { hasText: 'Divisibility & gcd' }).count()) === 0, 'the area list opens folded (sub-areas hidden)');
  await page.locator('#pp-area-list .bank-option', { has: page.locator('.bank-option-label', { hasText: /^Number theory$/ }) }).locator('.bank-toggle').click();
  await page.locator('#pp-area-list [role=option]', { hasText: 'Divisibility & gcd' }).click();
  await page.keyboard.press('Escape');
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().area)) === '["primes","divisibility"]', 'areas picked by search + Enter and from the browse list');
  check(engineRequests.length > 0, 'writing a statement fetches the engine ahead of the first preview');
  await page.fill('#pp-area-input', 'real analysis');              // a third area, removed again with the chips' ×
  await page.waitForSelector('#pp-area-list [role=option]');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.click('#pp-area .bank-chip-x >> nth=1');
  const afterRemove = await page.evaluate(() => [window.propose.readDraft().area.join(), document.activeElement.getAttribute('aria-label')]);
  check(afterRemove[0] === 'primes,real-analysis' && afterRemove[1] === 'Remove Real analysis', `removing a chip moves the focus to the next chip (${afterRemove})`);
  await page.click('#pp-area .bank-chip-x >> nth=1');
  check((await page.evaluate(() => document.activeElement.id)) === 'pp-area-input', 'removing the last chip moves it to the search box');
  await page.fill('#pp-area-input', 'divisibility');
  await page.waitForSelector('#pp-area-list [role=option]');
  await page.locator('#pp-area-list [role=option]', { hasText: 'Divisibility & gcd' }).click();
  await page.keyboard.press('Escape');
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().area)) === '["primes","divisibility"]', 'areas back to primes, divisibility');
  await page.fill('#pp-methods-input', '');
  await page.click('#pp-methods-input');
  const nHeads = await page.locator('#pp-methods-list .bank-list-section').count();
  check(nHeads > 3 && (await page.locator('#pp-methods-list .bank-option').count()) === 0, `the methods list opens with its ${nHeads} groups closed`);
  await page.locator('#pp-methods-list .bank-list-section').first().click();
  check((await page.locator('#pp-methods-list .bank-option').count()) > 0, 'clicking a group shows its methods');
  await page.keyboard.press('Escape');
  await page.fill('#pp-methods-input', 'induction');
  await page.waitForSelector('#pp-methods-list [role=option]');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  check(JSON.stringify(await page.evaluate(() => window.propose.readDraft().methods)) === '["induction"]', 'a method picked with the keyboard');
  await page.selectOption('#pp-difficulty', 'medium');
  await page.selectOption('#pp-origin', 'putnam');
  await page.fill('#pp-origin-date', '1989-13');
  check(/YYYY/.test(await page.textContent('#pp-errors')), 'a bad date is reported while typing');
  await page.fill('#pp-origin-date', '1989-12');
  await page.fill('#pp-origin-number', 'A3');
  await page.fill('#pp-references', 'https://example.org/source\nKalva archive');
  check(await page.locator('#pp-errors').isHidden(), 'no error left');

  console.log('4. live preview (in-browser pdfTeX): heading, drawing box, citations, solution');
  await page.click('#pp-refresh');
  await waitPreview('first');
  check(/Updated/.test(await page.textContent('#pp-preview-status')), `the preview compiles (${await page.textContent('#pp-preview-status')})`);
  const text = pdfText(await previewBytes());
  check(/Problem\s*1\.\s*Sum of two cubes/.test(text) && !/\(#/.test(text), 'preview heading "Problem 1. Sum of two cubes", no number');
  check(/Putnam 1989, A3/.test(text), 'origin line "Putnam 1989, A3"');
  check(/TikZ drawing/.test(text), 'the drawing is a placeholder box');
  check(/special\s*\[1\],\s*see\s*also\s*\[2\]/.test(text) && /An Own Reference/.test(text) && /Solomon Hurwitz/.test(text), 'citations resolved from references.bib and the own entry');
  check(/Solution\.\s*By induction/.test(text), 'the solution follows');
  const noViewer = await page.evaluate(() => navigator.pdfViewerEnabled === false);
  if (noViewer) {
    check(await page.locator('#pp-pdf').isHidden() && !(await page.getAttribute('#pp-pdf', 'src')), 'no built-in PDF viewer: no PDF frame (it would download the PDF)');
    check((await page.getAttribute('#pp-pdf-open', 'href')) === await previewUrl() && (await page.getAttribute('#pp-pdf-download', 'download')) === 'sum-of-two-cubes.pdf',
      'but Open PDF / Download PDF links to the preview');
  } else check(await page.locator('#pp-pdf').isVisible(), 'the PDF is shown in the page');

  console.log('5. a LaTeX error is located in the form; the last good PDF stays');
  const goodSrc = await previewUrl();
  await page.fill('#pp-solution', 'By induction.\nAnd \\notacommand{} end.');
  await page.click('#pp-refresh');
  await page.waitForFunction(() => /LaTeX error/.test(document.getElementById('pp-preview-status').textContent), null, { timeout: 60000 });
  const errText = await page.textContent('#pp-preview-error');
  check(/Solution, line 2: Undefined control sequence/.test(errText), `the error says where: ${errText.slice(0, 80)}`);
  check((await previewUrl()) === goodSrc, 'the last good PDF stays visible');
  const dialogs = [];
  page.once('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await page.click('#pp-submit');
  check(/LaTeX error\. Send anyway\?/.test(dialogs[0] || '') && (await page.evaluate(() => window.__opened.length)) === 0,
    `sending a draft whose preview has a LaTeX error asks first; Cancel sends nothing (${dialogs[0]})`);
  await page.fill('#pp-solution', 'By induction.\nAnd that is the end.');
  await page.click('#pp-refresh');
  await waitPreview('fixed');
  check(await page.locator('#pp-preview-error').isHidden(), 'fixing it clears the error');
  const mistakes = [['$', 'statement', 'x $a', /Statement: something opened here is never closed.*Missing \$ inserted/],
    ['{', 'solution', 'By \\textbf{induction.', /Solution: something opened here is never closed.*File ended while scanning use of \\textbf/],
    ['\\begin{itemize}', 'statement', 'A list\n\\begin{itemize}\n\\item one', /Statement, line 2: something opened here is never closed.*\\begin\{itemize\} ended by \\end\{problem\}/]];
  for (const [what, box, bad, want] of mistakes) {
    const before = await page.inputValue(`#pp-${box}`);
    await page.fill(`#pp-${box}`, bad);
    await page.click('#pp-refresh');
    await page.waitForFunction(() => /LaTeX error/.test(document.getElementById('pp-preview-status').textContent), null, { timeout: 60000 });
    const t = await page.textContent('#pp-preview-error');
    check(want.test(t) && !/null/.test(t) && !(await page.locator('#pp-preview-error code', { hasText: /^\\end\{(problem|solution)\}$/ }).count()),
      `an unclosed ${what} is shown in its box, not at the page's own \\end{…} (${t.slice(0, 110)})`);
    await page.fill(`#pp-${box}`, before);
  }
  await page.click('#pp-refresh');
  await waitPreview('mistakes fixed');

  console.log('5b. "Update while typing" off: the status says when the PDF is out of date');
  await page.uncheck('#pp-auto');
  await page.fill('#pp-solution', 'By induction.\nAnd that is the end. \\undefinedQ');
  await page.waitForTimeout(1200);
  check(/Out of date: click Update now/.test(await page.textContent('#pp-preview-status')), `out of date after typing (${await page.textContent('#pp-preview-status')})`);
  await page.fill('#pp-solution', 'By induction.\nAnd that is the end.');
  check(/Updated/.test(await page.textContent('#pp-preview-status')), 'back to "Updated" when the text is what the PDF shows');
  await page.check('#pp-auto');

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

  console.log('6b. a looping preview that is then fixed recovers; display-math diagrams, Greek, DOIs with _');
  const saved = await page.evaluate(() => window.propose.readDraft());
  await page.evaluate(() => { window.propose.state.preview.timeoutMs = 4000; });
  await page.fill('#pp-statement', 'Loop \\def\\x{\\x}\\x');
  await page.click('#pp-refresh');
  await page.waitForFunction(() => /Compiling/.test(document.getElementById('pp-preview-status').textContent), null, { timeout: 10000 });
  await page.fill('#pp-statement', 'Fixed. Consider\n\\[\n\\begin{tikzcd}\nA \\arrow[r] & B\n\\end{tikzcd}\n\\]\nwith φ and \\cite{sp}.');
  await page.fill('#pp-bibtex', '@incollection{sp, author = {A. Author}, title = {Chapter}, year = {2010}, doi = {10.1007/978-3-642-15546-8_7}}');
  await page.waitForFunction(() => /Updated|error|failed|Not updated/i.test(document.getElementById('pp-preview-status').textContent), null, { timeout: 60000 });
  const after = await page.textContent('#pp-preview-status');
  check(/Updated/.test(after) && await page.locator('#pp-preview-error').isHidden(), `after a stuck compile the fixed text is previewed, not reported as a loop (${after})`);
  check(/Chapter/.test(pdfText(await previewBytes())), 'a diagram in \\[ … \\], a Greek letter and a DOI with _ compile in the preview');
  await page.evaluate(() => { window.propose.state.preview.timeoutMs = 0; });
  await page.fill('#pp-title', '√2 is irrational');
  check(/cannot contain √/.test(await page.textContent('#pp-errors')), 'a title with √ is refused before sending (CI could not print it)');
  await page.evaluate(d => window.propose.setDraft(d), saved);
  await page.fill('#pp-title', saved.title);                        // typed: the autosave keeps this draft
  await page.click('#pp-refresh');
  await waitPreview('restored');

  console.log('7. Copy file and open GitHub');
  await page.evaluate(() => { window.__opened = []; });
  page.once('dialog', d => { dialogs.push('unexpected: ' + d.message()); d.dismiss(); });
  await page.click('#pp-submit');
  await page.waitForFunction(() => /Copied/.test(document.getElementById('pp-submit-status').textContent), null, { timeout: 5000 });
  const opened = await page.evaluate(() => window.__opened);
  check(opened.length === 1 && opened[0] === 'https://github.com/math-olympiad-club-ethz/math-olympiad-club-ethz/new/main/problem-bank/problems?filename=new-sum-of-two-cubes.tex',
    `GitHub's new-file page opens with the file name (${opened[0]})`);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const expected = await page.evaluate(() => window.propose.P.problemFile(window.propose.readDraft()));
  check(clip === expected && clip.startsWith('% title:          Sum of two cubes\n% area:           primes, divisibility\n'), 'the clipboard holds the problem file');
  check(/\\begin\{bibentries\}\n@article\{own2020,/.test(clip) && /% references:     https:\/\/example.org\/source; Kalva archive/.test(clip), 'bibliography block and references line');
  check(!(await page.locator('#pp-open-fallback').isHidden()), 'a direct link is offered in case GitHub did not open');
  check(!dialogs.some(m => m.startsWith('unexpected')), 'no question when the preview of this text compiled');
  page.removeAllListeners('dialog');
  check(/Your proposal is public on GitHub/.test(await page.textContent('body')), 'the page says a proposal is public once sent');
  const dir = mkdtempSync(join(tmpdir(), 'propose-file-'));
  const file = join(dir, 'new-sum-of-two-cubes.tex');
  writeFileSync(file, clip);
  const val = spawnSync('python3', ['-m', 'bank.validate', '--compile', file], { cwd: ROOT, encoding: 'utf8' });
  console.log('   ' + (val.stdout || val.stderr).trim().split('\n').join('\n   '));
  check(val.status === 0, 'the file passes the CI validator and compiles with pdflatex (author mode, real TikZ)');

  console.log('8. Show the file, Download .tex, Show available LaTeX');
  await page.click('#pp-show-file');
  check((await page.inputValue('#pp-file')) === expected, '"Show the file" shows the same file');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pp-download')]);
  check(download.suggestedFilename() === 'new-sum-of-two-cubes.tex' && readFileSync(await download.path(), 'utf8') === expected, 'Download .tex gives the file');
  check(await page.locator('#pp-show-latex').isHidden(), '"Show available LaTeX" sits inside the closed Writing rules');
  await page.click('.pp-rules summary');
  await page.click('#pp-show-latex');
  await page.waitForFunction(() => document.getElementById('pp-preamble').dataset.loaded === '1', null, { timeout: 10000 });
  check(await page.locator('#pp-latex').isVisible() && (await page.textContent('#pp-preamble')).includes('\\newcommand{\\bankproblem}'), '"Show available LaTeX" shows preamble.tex');
  await page.click('#pp-latex [data-close]');
  check(await page.locator('#pp-latex').isHidden(), 'the dialog closes');

  check(downloads.length === 1 && downloads[0].endsWith('.tex'), `no stray PDF download while the preview updated (${downloads})`);

  console.log('9. the draft stays in this browser (also right after typing); a second tab is noticed; Clear the form');
  await page.reload();
  await page.waitForSelector('#pp-area-input');
  const restored = await page.evaluate(() => window.propose.readDraft());
  check(restored.title === 'Sum of two cubes' && restored.area.join() === 'primes,divisibility' && restored.bibtex.includes('own2020'), 'reloading restores the draft');
  check(/already sent or downloaded/.test(await page.textContent('#pp-draft-note')) && await page.locator('#pp-draft-note').isVisible(),
    'with a note that it was already sent');
  await page.fill('#pp-title', 'Changed just before reload');
  await page.reload();
  await page.waitForSelector('#pp-area-input');
  check((await page.inputValue('#pp-title')) === 'Changed just before reload', 'an edit made just before a reload is kept (saved when the page is left)');
  check(/restored/.test(await page.textContent('#pp-draft-note')), 'edited after sending: a normal restored draft again');
  const tabB = await context.newPage();
  await tabB.goto(`${base}/propose.html`);
  await tabB.waitForSelector('#pp-area-input');
  await tabB.fill('#pp-title', 'Problem from tab B');
  await page.waitForFunction(() => !document.getElementById('pp-other-tab').hidden, null, { timeout: 5000 }).catch(() => {});
  check(await page.locator('#pp-other-tab').isVisible() && (await page.inputValue('#pp-title')) === 'Changed just before reload',
    'tab A is told that tab B changed the saved draft, and keeps its own text');
  await page.fill('#pp-title', 'Sum of two cubes');
  await tabB.waitForFunction(() => !document.getElementById('pp-other-tab').hidden, null, { timeout: 5000 }).catch(() => {});
  check(await page.locator('#pp-other-tab').isHidden() && await tabB.locator('#pp-other-tab').isVisible(), 'typing in tab A saves it again, and tab B is told');
  await tabB.close();
  check((await page.textContent('#pp-clear')) === 'Clear the form' && await page.locator('#pp-clear').isVisible(), '"Clear the form" is shown when something is written');
  page.once('dialog', d => d.accept());
  await page.click('#pp-clear');
  const cleared = await page.evaluate(() => window.propose.readDraft());
  check(!cleared.title && !cleared.statement && !cleared.area.length, '"Clear the form" empties the form');
  check(await page.locator('#pp-clear').isHidden(), 'and hides itself on the empty form');
  await page.reload();
  await page.waitForSelector('#pp-area-input');
  check(!(await page.evaluate(() => window.propose.readDraft().statement)), 'and the draft is gone after a reload');

  console.log('10. with a built-in PDF viewer, the preview is shown in the page');
  const viewer = await context.newPage();
  await viewer.addInitScript(() => Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', { get: () => true }));
  viewer.on('download', () => {});
  await viewer.goto(`${base}/propose.html`);
  await viewer.waitForSelector('#pp-area-input');
  await viewer.fill('#pp-statement', 'Shown inline.');
  await viewer.click('#pp-refresh');
  await viewer.waitForFunction(() => /Updated/.test(document.getElementById('pp-preview-status').textContent), null, { timeout: 60000 });
  check(await viewer.locator('#pp-pdf').isVisible() && (await viewer.getAttribute('#pp-pdf', 'src')) === await previewUrl(viewer)
    && await viewer.locator('#pp-pdf-links').isHidden(), 'the PDF frame is used, no extra links');
  await viewer.close();

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
