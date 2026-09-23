// End-to-end test of the Problems page in headless Chromium (Playwright library, no test runner):
// filter, tick problems, Create, and check that both PDFs contain the expected problems in the expected order
// (automatic, then dragged by hand); Edit links and the "+" button; keyboard focus, ARIA, the tag counts, the
// layout at 360 px, the theme, the PDF links without a built-in PDF viewer (headless Chromium, like Chrome for
// Android), the Content-Security-Policy, the engine prefetch and the message when the page's script fails to load.
// Needs a built site (python3 build.py --preview) and the engine bundle in site/static/busytex/.
//   node tests/e2e/bank.mjs            exit 0 = pass
//   E2E_SHOTS=<dir> node tests/e2e/bank.mjs   also saves screenshots (360 px, dark mode) into <dir>
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer } from '../lib/static-server.mjs';

const DOCS = resolve(new URL('../../site', import.meta.url).pathname);
const CHECK_PDF = resolve(new URL('./check_pdf.py', import.meta.url).pathname);
const SHOTS = process.env.E2E_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
// pre-flight: the test needs a preview build (all problems) and the engine bundle
import { existsSync, readFileSync } from 'node:fs';
if (!existsSync(join(DOCS, 'static', 'busytex', 'manifest.json'))) {
  console.log('The engine bundle site/static/busytex/ is missing. Build it once with:  python3 build.py --preview');
  process.exit(2);
}
try {
  const html = readFileSync(join(DOCS, 'problems.html'), 'utf8');
  const m = /"count":(\d+)/.exec(html);
  if (!m || Number(m[1]) === 0) {
    console.log('site/problems.html lists no problem (public build, nothing published yet). Run:  npm run build:preview');
    process.exit(2);
  }
} catch (e) { console.log('site/problems.html is missing. Run:  npm run build:preview'); process.exit(2); }
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
// the problem IDs of a stitched document, in PDF order (from its \bankproblem{k}{title}{origin}{NNNN} lines)
const texIds = tex => [...tex.matchAll(/^\\bankproblem\{\d+\}.*\{(\d{4})\}$/gm)].map(m => Number(m[1]));
const ROWS = '#bank-results > li:not([hidden])';          // the rows on screen (rows are built once, then hidden or shown)
// WCAG contrast ratio of two CSS rgb() colours
const contrast = (a, b) => {
  const lum = c => { const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const server = await startServer(DOCS);
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
const cspViolations = [];
const watch = (p) => {
  p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
};
watch(page);
await context.exposeFunction('__cspViolation', s => cspViolations.push(s));
await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__cspViolation(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)));
const engineRequests = [];
const showAll = async (p = page) => { if (await p.locator('#bank-show-all').isVisible()) await p.click('#bank-show-all'); };
page.on('request', r => { if (r.url().includes('/static/busytex/')) engineRequests.push(r.url()); });

try {
  console.log('1. a calm page on arrival; Show all lists every problem');
  await page.goto(`${base}/problems.html`);
  await page.waitForSelector('#bank-idle:not([hidden])');
  const total = await page.evaluate(() => window.bank.problems.length);
  check(total > 0, `index has ${total} problems`);
  check((await page.locator(ROWS).count()) === 0 && await page.locator('#bank-results-head').isHidden(), 'on arrival: no list and no PDF bar');
  check(new RegExp(`${total} problems`).test(await page.textContent('#bank-idle')), `the page says "${total} problems" and offers Show all`);
  check(/<meta http-equiv="Content-Security-Policy"/.test(await page.content()), 'the page carries a Content-Security-Policy');
  const bs = await page.evaluate(() => ({ js: typeof window.bootstrap, css: getComputedStyle(document.documentElement).getPropertyValue('--bs-body-bg').trim() }));
  check(bs.css !== '' && (bs.js === 'object' || await page.waitForFunction(() => typeof window.bootstrap === 'object', null, { timeout: 10000 }).then(() => true, () => false)),
    `Bootstrap CSS and JS load from the CDN under their integrity hashes (--bs-body-bg=${bs.css})`);
  const modules = await page.evaluate(() => {
    const ui = document.querySelector('script[type=module]').src;
    const v = new URL(ui).search;
    const urls = performance.getEntriesByType('resource').map(e => e.name).filter(u => /\/static\/js\/bank-(search|compile)\.js/.test(u));
    return { v, ok: urls.length >= 2 && urls.every(u => new URL(u).search === v) };
  });
  check(modules.ok, modules.v ? `every module of the page is loaded with the build version (${modules.v})` : 'the modules are loaded (no build version in this build)');
  check(engineRequests.length === 0, 'nothing of the LaTeX engine is downloaded on arrival');
  await page.mouse.wheel(0, 300); await page.mouse.click(5, 300); await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  check(engineRequests.length === 0, 'nor after a scroll, a click on the page and a key press');
  await page.click('#bank-show-all');
  check(await page.locator(ROWS).count() === total, 'Show all lists every problem');
  await page.click('#bank-hide-all');
  check((await page.locator(ROWS).count()) === 0 && await page.locator('#bank-idle').isVisible(), 'Hide all goes back to the calm page');
  await page.click('#bank-show-all');
  const ids = await page.evaluate(() => window.bank.state.results.map(p => p.id));
  check(ids.every((v, i) => i === 0 || v > ids[i - 1]), 'results are in order of arrival');
  check(!/\b0\d{3}\b/.test(await page.locator('#bank-results').textContent()), 'no problem number is shown in the list');
  const diffChip = (await page.locator(ROWS).first().locator('.bank-chip-unrated').textContent()).trim();
  check(/Difficulty\s*none\s*AI: (easy|medium|hard|extreme)/.test(diffChip), `an unrated problem's chip says "Difficulty none", the AI estimate in small print on its right (${diffChip})`);
  check(await page.locator('#bank-create').isDisabled(), 'Create is disabled with no selection');
  check((await page.locator('#bank-results a.bank-edit').count()) === 0, 'no Edit link per problem (it comes with the administrator mode)');
  check((await page.getAttribute('#bank-propose', 'href')) === 'propose.html', 'the "+ Propose a problem" button links to propose.html');
  check(!/\bunsolved\b/.test(await page.locator('#bank-results').textContent()) && (await page.locator(`${ROWS} .bank-marker-unsolved`).first().textContent()) === 'no solution',
    'a problem without a solution is marked "no solution" (the same words as the filter)');

  console.log('2. the bar searches titles; the list suggests the tags those words could mean');
  const probe = await page.evaluate(() => {
    const counts = new Map();
    for (const p of window.bank.problems) for (const w of p.title.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 5) counts.set(w, (counts.get(w) || 0) + 1);
    const word = [...counts.keys()].find(w => counts.get(w) === 1);
    return { word, n: window.bank.problems.filter(p => window.bank.S.matchesText(p, word)).length, id: window.bank.problems[2].id };
  });
  await page.fill('#bank-search', probe.word);
  check(probe.n >= 1 && (await page.locator(ROWS).count()) === probe.n, `typing "${probe.word}" narrows the list to ${probe.n} problem(s) by title`);
  await page.waitForFunction(w => location.search.includes('q=' + w), probe.word, { timeout: 5000 }).catch(() => {});
  check((await page.evaluate(() => location.search)).includes('q='), 'the typed words travel in the URL');
  await page.fill('#bank-search', '∑ ^');
  await page.waitForTimeout(400);
  check((await page.locator(ROWS).count()) === total && !(await page.evaluate(() => location.search)).includes('q='),
    'symbols only ("∑ ^") filter nothing, and the URL carries no q=');
  await page.fill('#bank-search', 'algeb');
  await page.waitForSelector('#bank-listbox [role=option]');
  const first = await page.locator('#bank-listbox [role=option]').first().textContent();
  check(/Algebra/.test(first), `first suggestion is Algebra (${first.trim()})`);
  await page.fill('#bank-search', probe.word);
  await page.keyboard.press('Enter');
  check((await page.locator('#bank-chips .bank-chip').count()) === 0 && await page.locator('#bank-listbox').isHidden() && (await page.inputValue('#bank-search')) === probe.word,
    'Enter on words found in a title keeps them as a title search and closes the list');
  await page.fill('#bank-search', 'algeb');
  await page.waitForSelector('#bank-listbox [role=option]');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  check((await page.locator('#bank-chips .bank-chip').count()) === 1, 'ArrowDown + Enter takes the tag as a filter');
  check((await page.inputValue('#bank-search')) === '', 'and empties the bar: those words were there to find the tag');
  const nAlg = await page.locator(ROWS).count();
  check(nAlg > 0 && nAlg < total, `Algebra filter narrows the list (${nAlg})`);
  await page.waitForFunction(() => location.search.includes('a=algebra'), null, { timeout: 5000 }).catch(() => {});
  check((await page.evaluate(() => location.search)).includes('a=algebra'), 'URL carries the filter');
  // a word found in no title but naming a tag (e.g. an origin): Enter takes the tag, not an empty list
  const tagWord = await page.evaluate(() => {
    const { S, problems, cat } = window.bank;
    const counts = S.tagCounts(problems, cat);
    for (const t of cat.byType.origin.values()) {
      const w = S.normalize(t.name).split(' ')[0];
      if (w.length >= 4 && counts.get('origin:' + t.slug) && !problems.some(p => S.matchesText(p, w)) && S.suggest(cat, w, S.emptyFilters(), Infinity).filter(s => counts.get(s.tag.type + ':' + s.tag.slug))[0]?.tag.slug === t.slug) return { w, slug: t.slug, n: counts.get('origin:' + t.slug) };
    }
    return null;
  });
  if (tagWord) {
    await page.click('#bank-chips .bank-chip-x');
    await page.fill('#bank-search', tagWord.w);
    await page.waitForSelector('#bank-listbox [role=option]');
    check(/No title contains/.test(await page.locator('#bank-listbox').textContent()), `"${tagWord.w}" is in no title: the list says so`);
    await page.keyboard.press('Enter');
    check((await page.evaluate(() => window.bank.state.filters.origin)).includes(tagWord.slug) && (await page.locator(ROWS).count()) === tagWord.n,
      `and Enter picks the tag: ${tagWord.n} problem(s)`);
    await page.click('#bank-chips .bank-chip-x');
  } else check(true, 'no origin word is missing from every title (Enter on a tag-only word not tested)');

  console.log('3. keyboard browse list, alias search, chip removal, tag counts');
  await page.fill('#bank-search', 'abstract algebra');
  await page.waitForSelector('#bank-listbox [role=option]');
  check(/Group theory/.test(await page.locator('#bank-listbox').textContent()), 'alias "abstract algebra" proposes Algebra children');
  await page.keyboard.press('Escape');
  check(await page.locator('#bank-listbox').isHidden(), 'Escape closes the list');
  await page.fill('#bank-search', '');                                  // the bar is a title filter: empty it
  if (await page.locator('#bank-chips .bank-chip-x').count()) await page.click('#bank-chips .bank-chip-x');
  check(await page.locator(ROWS).count() === total, 'removing the chip restores all problems');
  await page.fill('#bank-search', '');
  await page.click('#bank-search');
  const SEC = '#bank-listbox .bank-list-section', OPT = '#bank-listbox .bank-option';
  await page.waitForSelector(SEC);
  check((await page.locator(OPT).count()) === 0 && (await page.locator(SEC).count()) >= 4, 'the tag list opens with every section closed');
  check((await page.locator('#bank-listbox .bank-list-count-head').textContent()) === 'problems', 'the counts are labelled "problems" once');
  await page.locator(SEC).first().click();
  const nArea = await page.locator(OPT).count();
  await page.locator(SEC).first().click();
  check(nArea > 5 && (await page.locator(OPT).count()) === 0 && await page.locator('#bank-listbox').isVisible(),
    `clicking the Area title shows its ${nArea} tags, clicking again hides them`);
  for (let k = 0; k < await page.locator(SEC).count(); k++) await page.locator(SEC).nth(k).click();     // open every section
  const lb = await page.evaluate(() => {
    const { S, problems, cat } = window.bank;
    const opts = [...document.querySelectorAll('#bank-listbox .bank-option')];
    const counts = opts.map(o => Number(o.querySelector('.bank-option-count').textContent));
    const shown = new Set(opts.map(o => o.querySelector('.bank-option-label').textContent));
    const empty = [...cat.byType.origin.values()].filter(t => !S.filterProblems(problems, { ...S.emptyFilters(), origin: [t.slug] }, cat).length);
    const firstOrigin = opts.find(o => o.classList.contains('bank-option-origin'));
    const slug = [...cat.byType.origin.values()].find(t => t.name === firstOrigin.querySelector('.bank-option-label').textContent).slug;
    return { allPositive: counts.every(n => n > 0), emptyHidden: empty.every(t => !shown.has(t.name)), nEmpty: empty.length,
      originCount: Number(firstOrigin.querySelector('.bank-option-count').textContent), originReal: S.filterProblems(problems, { ...S.emptyFilters(), origin: [slug] }, cat).length,
      tabindex: document.getElementById('bank-listbox').getAttribute('tabindex'),
      ariaExpanded: document.querySelectorAll('#bank-listbox [role=option][aria-expanded]').length,
      nested: document.querySelectorAll('#bank-listbox [role=option] button, #bank-listbox [role=option] [tabindex]').length };
  });
  check(lb.allPositive && lb.emptyHidden, `every tag shows its number of problems; the ${lb.nEmpty} origin(s) with none are not offered`);
  check(lb.originCount === lb.originReal, `a tag's number is the number of problems it gives (${lb.originCount})`);
  check(lb.tabindex === '-1' && lb.ariaExpanded === 0 && lb.nested === 0, 'the tag list is not a Tab stop, and its options carry no aria-expanded and no control inside');
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id !== 'bank-listbox' && document.getElementById('bank-listbox').hidden),
    'Tab from the search bar leaves it (not into the scrolling list), and the list closes');
  await page.click('#bank-search');
  await page.waitForSelector('#bank-listbox [role=option]');
  await page.keyboard.press('Enter');
  check(await page.locator('#bank-chips .bank-chip').count() === 0, 'Enter on the empty bar selects nothing');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  check(await page.locator('#bank-chips .bank-chip').count() === 1, 'ArrowDown + Enter selects a tag');
  check(await page.locator('#bank-listbox').isVisible(), 'the full list stays open after a keyboard pick');
  await page.locator('#bank-listbox [role=option]').nth(3).click();
  check(await page.locator('#bank-chips .bank-chip').count() === 2, 'mouse click on an option adds a second chip');
  check(await page.locator('#bank-listbox').isVisible(), 'the full list stays open after a mouse pick');
  const expandBtn = page.locator('#bank-listbox .bank-toggle:not(.bank-toggle-empty)').first();
  const before = await page.locator('#bank-listbox [role=option]').count();
  await expandBtn.click();
  check((await page.locator('#bank-listbox [role=option]').count()) > before, 'expanding an area node shows its children');
  await page.keyboard.press('Escape');
  await page.locator('#bank-chips .bank-chip-x').first().focus();
  await page.keyboard.press('Enter');
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('bank-chip-x')), 'removing a chip with the keyboard: focus goes to the next chip');
  await page.keyboard.press('Enter');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'bank-search') && await page.locator('#bank-listbox').isHidden(),
    'removing the last chip: focus goes back to the search bar (the list stays closed)');
  await page.click('#bank-filter-btn');            // the advanced menu holds Reset
  await page.click('#bank-reset');
  check(await page.locator('#bank-chips .bank-chip').count() === 0, 'Reset clears the filters');

  console.log('4. advanced menu: show methods, solved, origin year; no ID range');
  await showAll();
  await page.check('#bank-show-methods');
  check((await page.locator(`${ROWS} .bank-chip-methods:visible`).count()) > 0, 'methods appear when "Show methods" is on');
  await page.uncheck('#bank-show-methods');
  check((await page.locator(`${ROWS} .bank-chip-methods:visible`).count()) === 0, 'methods hidden again');
  check((await page.locator('#bank-id-from').count()) === 0, 'there is no ID-range filter (the ID means nothing to visitors)');
  check((await page.textContent('#bank-op-help')) === 'Problems with all the tags.', 'AND explains only AND');
  await page.click('label[for=bank-op-or]');
  check((await page.textContent('#bank-op-help')) === 'Problems with at least one of the tags.', 'OR explains only OR');
  await page.click('label[for=bank-op-and]');
  const nOf = async (v) => { await page.click(`label[for=bank-solved-${v}]`); return page.locator(ROWS).count(); };
  const nFull = await nOf('full');
  check(nFull < total && (await page.locator(`${ROWS} .bank-marker`).count()) === 0, `"full solution" leaves ${nFull} problems, none marked`);
  const nPart = await nOf('partial');
  check(nPart > 0 && (await page.locator(`${ROWS} .bank-marker-partial`).count()) === nPart, `"partial solution" gives the ${nPart} problems marked "partial solution"`);
  const nNone = await nOf('none');
  check(nNone > 0 && (await page.locator(`${ROWS} .bank-marker-unsolved`).count()) === nNone, `"no solution" gives the ${nNone} problems marked "no solution"`);
  check(nFull + nPart + nNone === total, 'full + partial + no solution = every problem');
  await page.click('label[for=bank-solved-all]');
  const yrs = await page.evaluate(() => [...new Set(window.bank.problems.map(p => p.originYear).filter(y => Number.isInteger(y)))].sort((a, b) => a - b));
  check((await page.textContent('#bank-year-label')) === `${yrs[0]} – ${yrs[yrs.length - 1]}`, `the year slider spans the years of the bank (${yrs[0]} – ${yrs[yrs.length - 1]})`);
  await page.focus('#bank-year-lo');
  for (let k = 0; k < yrs.length - 3; k++) await page.keyboard.press('ArrowRight');
  const from = yrs[yrs.length - 3];
  const nYear = await page.evaluate(y => window.bank.problems.filter(p => Number.isInteger(p.originYear) && p.originYear >= y).length, from);
  check((await page.locator(ROWS).count()) === nYear && (await page.textContent('#bank-year-label')).startsWith(String(from)),
    `moving "from" to ${from}: ${nYear} problems, undated ones left out`);
  await page.waitForFunction(() => location.search.includes('y='), null, { timeout: 5000 }).catch(() => {});
  check((await page.evaluate(() => location.search)).includes(`y=${from}-`), 'the year range is in the URL');
  await page.keyboard.press('Home');
  await page.waitForFunction(() => !location.search.includes('y='), null, { timeout: 5000 }).catch(() => {});
  check((await page.locator(ROWS).count()) === total && !(await page.evaluate(() => location.search)).includes('y='), 'back at the start: no year filter, every problem again');
  await page.click('#bank-filter-btn');

  console.log('4b. the Origin filter explains its matches: also-in sources show in the rows');
  const also = await page.evaluate(() => {
    const p = window.bank.problems.find(q => q.alsoIn && q.alsoIn.length && !q.alsoIn.includes(q.origin));
    return p ? { id: p.id, slug: p.alsoIn[0] } : null;
  });
  if (also) {
    check((await page.locator(`#bank-results li[data-id="${also.id}"] .bank-chip-alsoin:visible`).count()) === 0, 'without an Origin filter the also-in sources stay out of the rows');
    await page.evaluate(slug => { window.bank.state.filters.origin = [slug]; window.bank.update(); }, also.slug);
    check((await page.locator(`#bank-results li[data-id="${also.id}"] .bank-chip-alsoin[data-slug="${also.slug}"]:visible`).count()) === 1,
      'with Origin = one of its also-in sources, the row shows that source ("Also in")');
    await page.evaluate(() => { window.bank.state.filters.origin = []; window.bank.update(); });
  }

  console.log('5. select all, a link that ticks 20 problems, Create → problems PDF, solutions PDF on request');
  check(engineRequests.length === 0, 'after typing, filtering and browsing, still nothing of the LaTeX engine is downloaded');
  await page.fill('#bank-search', probe.word);
  await page.keyboard.press('Enter');                                   // the tag list floats over the results: close it
  const nWord = await page.locator(ROWS).count();
  await page.click('#bank-select-all');
  check((await page.evaluate(() => window.bank.state.selection.size)) === nWord, `select all ticks the ${nWord} listed problem(s)`);
  await page.waitForTimeout(300);
  check(engineRequests.some(u => u.endsWith('manifest.json')), 'ticking problems starts fetching the engine');
  await page.click('#bank-clear-selection');
  await page.fill('#bank-search', '');
  await page.goto(`${base}/problems.html?sel=1-20`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  const n20 = await page.evaluate(() => window.bank.state.selection.size);
  check(n20 === 20, `a link with sel=1-20 ticks ${n20} problems`);
  check((await page.locator(ROWS).count()) === 0 && (await page.textContent('#bank-selected-count')) === '20 selected',
    'a link with ticked problems only: the page stays calm, the PDF bar says "20 selected"');
  check(!(await page.locator('#bank-create').isDisabled()), 'Create enabled');
  const urlBefore = await page.evaluate(() => location.href);
  const autoIds = await page.evaluate(() => window.bank.pdfOrder());
  const expectAuto = await page.evaluate(() => window.bank.S.autoOrder([...window.bank.state.selection], window.bank.byId, window.bank.cat));
  check(JSON.stringify(autoIds) === JSON.stringify(expectAuto) && autoIds.length === n20, `PDF order is automatic: ${autoIds.join(',')}`);
  check(!(await page.evaluate(() => location.search)).includes('ord='), 'no ord= in the URL for the automatic order');
  await page.evaluate(() => {                                                   // every text the status line shows
    window.__status = [];
    const s = document.getElementById('bank-status');
    new MutationObserver(() => window.__status.push(s.textContent)).observe(s, { childList: true, characterData: true, subtree: true });
  });
  await page.focus('#bank-create');
  await page.keyboard.press('Enter');                                           // Create with the keyboard
  const waitPdf = async (v) => {
    try { await page.waitForSelector(`#bank-out-${v} a[download$=".pdf"]`, { timeout: 240000 }); }
    catch (e) { throw new Error(`${v} PDF never appeared. status="${await page.locator('#bank-status').textContent()}" output="${(await page.locator(`#bank-out-${v} .bank-out-body`).textContent()).slice(0, 400)}"`); }
  };
  const busyFocus = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, aria: document.getElementById('bank-create').getAttribute('aria-disabled') }));
  await waitPdf('problems');
  check(busyFocus.id === 'bank-create' && busyFocus.aria === 'true', 'while it works, Create keeps the focus (aria-disabled, not disabled)');
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest('#bank-out-problems'), null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('#bank-out-problems'))), 'when the PDF is ready, focus moves to it');
  check(await page.evaluate(() => window.bank.output.solutions === null) && (await page.locator('#bank-out-solutions a[download$=".pdf"]').count()) === 0,
    'Create builds the problem set alone: the solutions PDF is not compiled');
  check(!/Loading the LaTeX engine/.test(await page.textContent('#bank-status')), `the status line ends on the result (${(await page.textContent('#bank-status')).trim()})`);
  const statuses = await page.evaluate(() => [...new Set(window.__status)]);
  check(statuses.some(t => /^Compiling the problems PDF… \d+ \/ 20$/.test(t)) && !statuses.includes('Compiling this problem…'),
    `while pdfTeX works the status line says which PDF and how far (${statuses.filter(t => / \/ /.test(t)).slice(-1)[0] || statuses.join(' | ')})`);
  const noViewer = await page.evaluate(() => navigator.pdfViewerEnabled === false);
  check(!noViewer || ((await page.locator('#bank-output iframe').count()) === 0 && (await page.locator('#bank-out-problems a', { hasText: 'Open PDF' }).count()) === 1),
    'no built-in PDF viewer: no PDF frame, an "Open PDF" and a "Download PDF" link instead');
  const pdfBytes = (v) => page.evaluate(async (v) => Array.from(new Uint8Array(await (await fetch(document.querySelector(`#bank-out-${v} a[download$=".pdf"]`).href)).arrayBuffer())), v);
  const askSolutions = async () => {
    await page.focus('#bank-make-solutions'); await page.keyboard.press('Enter');
    await waitPdf('solutions');
  };
  await askSolutions();
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest('#bank-out-solutions'), null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('#bank-out-solutions'))), 'the solutions PDF ready: focus moves to it');
  const out = await page.evaluate(() => {
    const o = window.bank.output;
    return { p: { ids: o.problems.ids, tex: o.problems.mainTex }, s: { ids: o.solutions.ids, tex: o.solutions.mainTex } };
  });
  out.p.bytes = await pdfBytes('problems'); out.s.bytes = await pdfBytes('solutions');
  check(out.p.ids.length === n20 && out.s.ids.length === n20, 'both PDFs were built for the ticked problems');
  check(JSON.stringify(out.p.ids) === JSON.stringify(autoIds), 'the problems PDF follows the automatic order');
  check(String.fromCharCode(...out.p.bytes.slice(0, 5)) === '%PDF-' && String.fromCharCode(...out.s.bytes.slice(0, 5)) === '%PDF-', 'both outputs are PDFs');
  check((out.p.tex.match(/\\bankproblem\{/g) || []).length === n20, `problems .tex has ${n20} problem headings`);
  check(out.s.tex.includes('\\begin{solution}') || out.s.tex.includes('\\banknosolution'), 'solutions .tex has solutions or "Not solved yet" markers');
  check(!/\\today/.test(out.p.tex + out.s.tex), 'no \\today in the generated documents');
  check(!/Selection:/.test(out.p.tex + out.s.tex), 'the cover prints no "Selection" line (no filters, no typed text)');
  const dir = mkdtempSync(join(tmpdir(), 'bank-e2e-'));
  for (const [v, r] of [['problems', out.p], ['solutions', out.s]]) {
    const f = join(dir, `${v}.pdf`);
    writeFileSync(f, Buffer.from(r.bytes));
    const py = spawnSync('python3', [CHECK_PDF, f, String(n20)], { encoding: 'utf8' });
    console.log('   ' + (py.stdout || py.stderr).trim());
    check(py.status === 0, `${v} PDF has the headings "Problem 1." … "Problem ${n20}." and prints no problem number`);
    check(JSON.stringify(texIds(r.tex)) === JSON.stringify(autoIds), `${v} PDF lists the problems in the automatic order`);
  }
  check((await page.locator('#bank-out-problems a', { hasText: 'Download .tex' }).count()) === 1, 'Download .tex offered');

  console.log('5b. Preview one problem');
  await showAll();
  const firstRow = page.locator(ROWS).first();
  const firstTitle = (await firstRow.locator('.bank-title').textContent()).trim();
  const nLi = await page.locator('#bank-results > li').count();
  await firstRow.locator('.bank-preview-btn').click();
  await page.waitForSelector('.bank-preview-panel a[download$=".pdf"]', { timeout: 240000 });
  const prev = await page.evaluate(async () => {
    const btn = document.querySelector('#bank-results > li:not([hidden]) .bank-preview-btn');
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    const bytes = new Uint8Array(await (await fetch(panel.querySelector('a[download$=".pdf"]').href)).arrayBuffer());
    return { head: String.fromCharCode(...bytes.slice(0, 5)), tex: window.bank.C.makePreview(await window.bank.C.loadBodies(), window.bank.state.results[0].id),
      label: btn.getAttribute('aria-label'), inRow: !!panel && panel.parentElement === btn.closest('li'), download: panel.querySelector('a[download$=".pdf"]').getAttribute('download') };
  });
  check(prev.head === '%PDF-', 'Preview shows that one problem as a PDF (Open PDF / Download PDF)');
  check(prev.tex.includes('\\begin{problem}') && !prev.tex.includes('\\begin{solution}'), 'the preview document has the statement and no solution');
  check(prev.label === `Preview “${firstTitle}”` && prev.inRow && (await page.locator('#bank-results > li').count()) === nLi,
    `each Preview button is named after its problem ("${prev.label}"), and its panel sits inside the row (no extra list item)`);
  check(!/\d{4}/.test(prev.download), `the preview's file name carries no problem number (${prev.download})`);
  await firstRow.locator('.bank-preview-btn').click();
  check((await page.locator('.bank-preview-panel').count()) === 0, 'clicking Preview again closes it');
  // abandoned previews are cancelled (bank-compile.js drops a job whose signal is aborted before it starts)
  const rowsIds = await page.evaluate(() => window.bank.state.results.slice(1, 6).map(p => p.id));
  for (const id of rowsIds) await page.click(`#bank-results li[data-id="${id}"] .bank-preview-btn`);
  await page.waitForSelector('.bank-preview-panel a[download$=".pdf"]', { timeout: 240000 });
  check((await page.locator('.bank-preview-panel').count()) === 1 && (await page.locator(`#bank-results li[data-id="${rowsIds[4]}"] .bank-preview-panel`).count()) === 1,
    'five Previews clicked in a row: only the last one stays open');
  await page.click(`#bank-results li[data-id="${rowsIds[4]}"] .bank-preview-btn`);
  check((await page.locator('#bank-copy-link').count()) === 0, 'no Copy link button (the page address is the link)');

  console.log('6. shareable URL restores filters and selection; second Create is served from cache');
  await page.goto(urlBefore);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  check(await page.evaluate(() => window.bank.state.selection.size) === n20, 'selection restored from the URL');
  await page.click('#bank-create');
  await waitPdf('problems');
  await askSolutions();
  const cached = await page.evaluate(() => window.bank.output.problems.fromCache && window.bank.output.solutions.fromCache);
  check(cached, 'same selection → PDFs come from the cache');
  const h1 = [await sha(out.p.bytes), await sha(out.s.bytes)];
  const same = [await sha(await pdfBytes('problems')), await sha(await pdfBytes('solutions'))];
  check(same[0] === h1[0] && same[1] === h1[1], 'same URL → byte-identical PDFs');

  console.log('7. PDF order by hand: arrows, drag, URL, reset');
  check(await page.locator('#bank-order').isHidden(), 'the order panel is closed by default');
  await page.click('#bank-order-btn');
  const rowIds = async () => page.$$eval('#bank-order-list li', lis => lis.map(li => Number(li.dataset.id)));
  check(JSON.stringify(await rowIds()) === JSON.stringify(autoIds), 'the order panel lists the ticked problems in the automatic order');
  check(await page.locator('#bank-order-reset').isDisabled(), '"Back to automatic order" is disabled while the order is automatic');
  await page.click('#bank-order-list li:first-child .bank-order-down');
  let want = [autoIds[1], autoIds[0], ...autoIds.slice(2)];
  check(JSON.stringify(await rowIds()) === JSON.stringify(want), '↓ moves the first problem one place down');
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('bank-order-down')), 'focus stays on the moved row (keyboard use)');
  const h3 = await page.locator('#bank-order-list li:nth-child(3) .bank-order-handle').boundingBox();
  const r1 = await page.locator('#bank-order-list li:nth-child(1)').boundingBox();
  await page.mouse.move(h3.x + h3.width / 2, h3.y + h3.height / 2);
  await page.mouse.down();
  await page.mouse.move(h3.x + h3.width / 2, r1.y + 3, { steps: 8 });
  await page.mouse.up();
  want = [want[2], want[0], want[1], ...want.slice(3)];
  check(JSON.stringify(await rowIds()) === JSON.stringify(want), 'dragging the third problem to the top reorders the list');
  check(JSON.stringify(await page.evaluate(() => window.bank.pdfOrder())) === JSON.stringify(want), 'the PDF order follows the drag');
  const wantSel = await page.evaluate(ids => window.bank.S.formatIdList(ids), want);
  await page.waitForFunction(sel => location.search.includes('sel=' + sel + '&ord=manual'), wantSel, { timeout: 5000 }).catch(() => {});
  const manualUrl = await page.evaluate(() => location.href);
  check(new URL(manualUrl).search.includes(`sel=${wantSel}&ord=manual`), `the URL keeps the hand-made order (${new URL(manualUrl).search})`);
  await page.goto(manualUrl);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  check(JSON.stringify(await page.evaluate(() => window.bank.pdfOrder())) === JSON.stringify(want), 'reloading the URL restores the hand-made order');
  check((await page.textContent('#bank-order-btn')).includes('yours'), 'the order button says the order is yours');
  await page.click('#bank-create');
  await waitPdf('problems'); await askSolutions();
  const man = await page.evaluate(() => { const o = window.bank.output; return { ids: o.problems.ids, fromCache: o.problems.fromCache, pt: o.problems.mainTex, st: o.solutions.mainTex }; });
  man.p = await pdfBytes('problems'); man.s = await pdfBytes('solutions');
  check(JSON.stringify(man.ids) === JSON.stringify(want) && !man.fromCache, 'the PDFs are compiled in the hand-made order (not the cached automatic ones)');
  const dir2 = mkdtempSync(join(tmpdir(), 'bank-e2e-order-'));
  for (const [v, bytes, tex] of [['problems', man.p, man.pt], ['solutions', man.s, man.st]]) {
    const f = join(dir2, `${v}.pdf`);
    writeFileSync(f, Buffer.from(bytes));
    const py = spawnSync('python3', [CHECK_PDF, f, String(n20)], { encoding: 'utf8' });
    console.log('   ' + (py.stdout || py.stderr).trim());
    check(py.status === 0, `${v} PDF has its ${n20} headings and no problem number`);
    check(JSON.stringify(texIds(tex)) === JSON.stringify(want), `${v} PDF follows the hand-made order`);
  }
  await page.click('#bank-order-btn');
  await page.click('#bank-order-reset');
  check(JSON.stringify(await rowIds()) === JSON.stringify(autoIds), '"Back to automatic order" restores the automatic order');
  await page.waitForFunction(() => !location.search.includes('ord='), null, { timeout: 5000 }).catch(() => {});
  check(!(await page.evaluate(() => location.search)).includes('ord='), 'and removes ord= from the URL');
  await showAll();
  await page.locator(`${ROWS} .bank-check`).first().click();          // untick one: the panel follows
  check((await rowIds()).length === n20 - 1, 'unticking a problem removes it from the order panel');

  console.log('7b. after Create, changing the ticks withdraws the solutions offer');
  await page.goto(`${base}/problems.html?sel=1-3`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  await page.click('#bank-create');
  await waitPdf('problems');
  check(await page.locator('#bank-make-solutions').isVisible(), 'the solutions are offered for the PDF on screen');
  await showAll();
  await page.locator(`${ROWS} .bank-check`).nth(5).click();
  check(await page.locator('#bank-out-solutions').isHidden() && (await page.locator('#bank-make-solutions').count()) === 0,
    'one more tick: the offer is gone (Create PDF again makes a matching pair)');

  console.log('7c. Cancel a PDF that never ends; after a failed compile, reset the engine; plain error messages');
  {
    const ctx = await browser.newContext();
    await ctx.route(/\/static\/bank\/bodies\.json/, async r => {
      const res = await r.fetch(); const j = await res.json();
      j.problems['0001'].statement = '\\def\\bankloop{\\bankloop}\\bankloop';            // pdfTeX never ends
      j.problems['0002'].statement = 'Broken: \\undefinedcontrolsequencexyz.';        // a LaTeX error
      await r.fulfill({ response: res, json: j });
    });
    const p7 = await ctx.newPage();
    await p7.goto(`${base}/problems.html?sel=1`);
    await p7.waitForSelector('#bank-results-head:not([hidden])');
    await p7.click('#bank-create');
    check(await p7.locator('#bank-cancel').isVisible(), 'while the PDF is made, a Cancel button shows');
    await p7.waitForFunction(() => window.bank.C._state.running, null, { timeout: 120000 });
    await p7.waitForTimeout(1000);
    const t0 = Date.now();
    await p7.click('#bank-cancel');
    await p7.waitForFunction(() => document.getElementById('bank-status').textContent === 'Cancelled.', null, { timeout: 10000 }).catch(() => {});
    const after = await p7.evaluate(() => ({ status: document.getElementById('bank-status').textContent, cancel: document.getElementById('bank-cancel').hidden,
      output: document.getElementById('bank-output').hidden, create: !document.getElementById('bank-create').disabled && !document.getElementById('bank-create').hasAttribute('aria-disabled'),
      focus: document.activeElement && document.activeElement.id }));
    check(after.status === 'Cancelled.' && Date.now() - t0 < 5000 && after.cancel && after.output && after.create && after.focus === 'bank-create',
      `Cancel stops a compile that never ends at once: "${after.status}", no PDF card, Create ready and focused (${Date.now() - t0} ms)`);
    await p7.goto(`${base}/problems.html?sel=2`);
    await p7.waitForSelector('#bank-results-head:not([hidden])');
    await p7.click('#bank-create');
    await p7.waitForSelector('#bank-out-problems .alert-danger', { timeout: 120000 });
    check(await p7.locator('#bank-out-problems .bank-reset-engine').isVisible() && /could not be built: The LaTeX compile failed\./.test(await p7.textContent('#bank-status')),
      'a failed compile says so and offers "Reset the LaTeX engine"');
    await p7.click('#bank-out-problems .bank-reset-engine');
    await p7.waitForFunction(() => /reset|could not be reset/.test(document.getElementById('bank-status').textContent) && !window.bank.state.busy, null, { timeout: 120000 }).catch(() => {});
    check((await p7.textContent('#bank-status')) === 'The LaTeX engine was reset. Try again.', `the engine is downloaded again: "${await p7.textContent('#bank-status')}"`);
    await ctx.close();
    const ctx2 = await browser.newContext();
    await ctx2.route(/\/static\/bank\/bodies\.json/, r => r.fulfill({ status: 404, body: 'not found' }));
    const p8 = await ctx2.newPage();
    await p8.goto(`${base}/problems.html?sel=1`);
    await p8.waitForSelector('#bank-results-head:not([hidden])');
    await p8.click('#bank-create');
    await p8.waitForSelector('#bank-out-problems .alert-danger', { timeout: 30000 });
    const msg = (await p8.textContent('#bank-status')).trim();
    check(/^Could not download the problem texts/.test(msg) && (await p8.locator('.bank-reset-engine').count()) === 0,
      `problem texts that do not load: the message says it once ("${msg}"), no engine reset offered`);
    await ctx2.close();
  }

  console.log('8. robustness: a Greek tag name, a crafted link, dragging past the edge of the list');
  await page.goto(`${base}/problems.html?a=arithmetic-functions`);
  await page.waitForSelector(ROWS);
  await page.click('#bank-select-all');
  await page.click('#bank-create');
  await waitPdf('problems'); await askSolutions();
  check(await page.evaluate(() => !!(window.bank.output.problems.pdf && window.bank.output.solutions.pdf)),
    'both PDFs build with the filter "Arithmetic functions (φ, σ, τ, …)" active');
  await page.goto(`${base}/problems.html?q=zqx%5E%7B%7D%5Cinput%7Bzqy%7D&sel=1,2`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  await page.click('#bank-create');
  await waitPdf('problems');
  check(await page.evaluate(() => !!window.bank.output.problems.pdf && !/zqy|Selection:/.test(window.bank.output.problems.mainTex)),
    'a link with LaTeX in its search text (q=zqx^{}\\input{zqy}) builds a clean PDF: the text never reaches the document');
  await page.goto(`${base}/problems.html?q=%E2%88%91`);
  await page.waitForSelector('#bank-idle:not([hidden])', { timeout: 10000 }).catch(() => {});
  check(await page.locator('#bank-idle').isVisible() && (await page.locator(ROWS).count()) === 0, 'a link whose search is symbols only (q=∑) opens the calm page');
  const huge = Array.from({ length: 200 }, (_, i) => `${i * 100000}-${i * 100000 + 99999}`).join(',');
  await page.goto(`${base}/problems.html?sel=${huge}&ord=manual`);
  await page.waitForSelector('#bank-results-head:not([hidden])', { timeout: 15000 });
  await showAll();
  check((await page.locator(ROWS).count()) === total, 'a crafted ?sel= link with millions of IDs still gives a working page');
  await page.goto(`${base}/problems.html?sel=1-30`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  await page.click('#bank-order-btn');
  const lastId = await page.evaluate(() => {
    const l = document.getElementById('bank-order-list');
    l.scrollIntoView({ block: 'center', behavior: 'instant' });  // the whole list on screen (Bootstrap makes scrolling smooth)
    l.scrollTop = l.scrollHeight;                                // its last row visible, the first ones scrolled away
    return Number(l.lastElementChild.dataset.id);
  });
  const hb = await page.locator('#bank-order-list li:last-child .bank-order-handle').boundingBox();
  const lbox = await page.locator('#bank-order-list').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, lbox.y + 4, { steps: 6 });
  await page.waitForFunction(() => document.getElementById('bank-order-list').scrollTop === 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.mouse.up();
  const firstAfter = await page.evaluate(() => Number(document.querySelector('#bank-order-list li').dataset.id));
  check(firstAfter === lastId, `holding a dragged row at the top edge scrolls the list: the last problem (#${lastId}) moved to the top`);

  console.log('9. a browser with a built-in PDF viewer shows the PDFs in the page');
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', { get: () => true }));
    await ctx.exposeFunction('__cspViolation', s => cspViolations.push(s));
    await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__cspViolation(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)));
    const p2 = await ctx.newPage();
    await p2.goto(`${base}/problems.html?sel=1,2`);
    await p2.waitForSelector('#bank-results-head:not([hidden])');
    await p2.click('#bank-create');
    await p2.waitForSelector('#bank-out-problems iframe.bank-pdf', { timeout: 240000 });
    await showAll(p2);
    await p2.locator(ROWS).first().locator('.bank-preview-btn').click();
    await p2.waitForSelector('.bank-preview-panel iframe.bank-preview-pdf', { timeout: 240000 });
    check(await p2.evaluate(() => [...document.querySelectorAll('iframe.bank-pdf')].every(f => f.src.startsWith('blob:'))) && (await p2.locator('.bank-preview-panel a', { hasText: 'Open PDF' }).count()) === 1,
      'the problems PDF and the Preview show in a frame, with Open PDF / Download PDF links too');
    await ctx.close();
  }

  console.log('10. layout at 360 px and in dark mode; the theme');
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));      // what the old site saved on every visit
    const p3 = await ctx.newPage();
    watch(p3);
    const logos = [];
    p3.on('request', r => { if (/club_logo|janestreet/.test(r.url())) logos.push(r.url().split('/').pop()); });
    await p3.goto(`${base}/problems.html?sm=1`);
    await p3.waitForSelector('#bank-idle:not([hidden]), ' + ROWS);
    await showAll(p3);
    await p3.waitForSelector(ROWS);
    const theme = await p3.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
    check(theme === scheme, `with no choice saved, the page follows the system: ${scheme} (${theme}); the old site's automatic "light" does not count`);
    const lay = await p3.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const out = [...document.querySelectorAll('#bank-results > li:not([hidden])')].filter(li => [...li.querySelectorAll('.bank-row-actions, .bank-chip')].some(e => e.getBoundingClientRect().right > w + 0.5));
      return { scroll: document.documentElement.scrollWidth, w, out: out.length };
    });
    check(lay.scroll <= lay.w && lay.out === 0, `problems page at 360 px (${scheme}, methods shown): no sideways scroll (${lay.scroll} px), every Preview / Edit and chip on screen`);
    const c = await p3.evaluate(() => {
      const m = document.querySelector('#bank-results > li:not([hidden]) .bank-marker');
      const s = m && getComputedStyle(m);
      return s ? [s.color, s.backgroundColor] : null;
    });
    check(!c || contrast(c[0], c[1]) >= 4.5, `the "no solution" / "partial solution" markers are readable (${c ? contrast(c[0], c[1]).toFixed(2) : '-'}:1)`);
    if (SHOTS) await p3.screenshot({ path: join(SHOTS, `problems-360-${scheme}.png`), fullPage: false });
    await p3.evaluate(() => window.scrollTo(0, 0));
    const name = await p3.evaluate(() => { const b = document.getElementById('theme-toggle'); return { label: b.getAttribute('aria-label'), text: b.innerText.trim() }; });
    check(name.label === null && name.text === (scheme === 'dark' ? 'Light' : 'Dark'), `the theme button is named by what it shows ("${name.text}")`);
    check(logos.length === 1 && logos[0].includes(scheme === 'dark' ? 'dark' : 'light'), `only the ${scheme} logo is downloaded (${logos.join(', ')})`);
    for (const pg of ['index.html', 'propose.html']) {
      await p3.goto(`${base}/${pg}`);
      await p3.waitForLoadState('load');
      const sw = await p3.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(sw[0] <= sw[1], `${pg} at 360 px (${scheme}): no sideways scroll (${sw[0]} px)`);
      if (SHOTS) await p3.screenshot({ path: join(SHOTS, `${pg.replace('.html', '')}-360-${scheme}.png`), fullPage: false });
    }
    const tog = await p3.evaluate(() => { const t = document.querySelector('.navbar-toggler'); return [t.getAttribute('aria-label'), t.getAttribute('aria-controls'), t.getAttribute('aria-expanded')]; });
    check(tog[0] === 'Menu' && tog[1] === 'navbarNav' && tog[2] === 'false', 'the mobile menu button has a name and says what it controls');
    await p3.waitForFunction(() => typeof window.bootstrap === 'object', null, { timeout: 10000 }).catch(() => {});
    await p3.click('.navbar-toggler');
    await p3.waitForSelector('#navbarNav a[href="problems.html"]', { state: 'visible', timeout: 5000 }).catch(() => {});
    check(await p3.locator('#navbarNav a[href="problems.html"]').isVisible(), 'the mobile menu opens (Bootstrap JS, loaded async)');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); } }); });
    const p4 = await ctx.newPage();
    const errs = [];
    p4.on('pageerror', e => errs.push(e.message));
    await p4.goto(`${base}/index.html`);
    await p4.click('#theme-toggle');
    check(errs.length === 0 && (await p4.getAttribute('html', 'data-bs-theme')) === 'light' && /\d{4}/.test(await p4.textContent('#current-year')),
      'with site data blocked, the theme button still works and nothing throws');
    if (SHOTS) {
      await p4.click('#theme-toggle');
      await p4.setViewportSize({ width: 1280, height: 900 });
      await p4.goto(`${base}/problems.html?sel=1,2&a=algebra&sm=1`);
      await p4.waitForSelector(ROWS);
      await p4.screenshot({ path: join(SHOTS, 'problems-1280-dark.png') });
    }
    await ctx.close();
  }

  console.log('11. a script that fails to load: a message, not an empty page; without JavaScript: a message');
  {
    const ctx = await browser.newContext();
    await ctx.route(/\/static\/js\/bank-search\.js/, r => r.fulfill({ status: 404, body: 'not found' }));
    const p5 = await ctx.newPage();
    await p5.goto(`${base}/problems.html`);
    await p5.waitForSelector('[data-load-error]:not([hidden])', { timeout: 10000 }).catch(() => {});
    check(await p5.locator('[data-load-error]').isVisible(), `a module that does not load shows "${(await p5.textContent('[data-load-error]')).trim()}"`);
    await ctx.close();
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const p6 = await nojs.newPage();
    await p6.goto(`${base}/problems.html`);
    check(/needs JavaScript/.test(await p6.textContent('main')), 'without JavaScript the page says the search needs it');
    await nojs.close();
  }

  check(cspViolations.length === 0, 'no Content-Security-Policy violation in any of the above' + (cspViolations.length ? ': ' + cspViolations.slice(0, 3).join(' | ') : ''));
  check(consoleErrors.length === 0, 'no console errors' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' | ') : ''));
} catch (e) {
  failures.push('exception: ' + e.message);
  console.log('  ✗ exception: ' + e.stack);
} finally {
  await browser.close();
  await server.close();
}

async function sha(bytes) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nall e2e checks passed');
process.exit(failures.length ? 1 : 0);
