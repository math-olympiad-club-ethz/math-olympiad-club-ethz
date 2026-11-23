// End-to-end test of the Problems page in headless Chromium (Playwright library, no test runner): the calm page on arrival
// (the tree of topics unfolded one level, the row of filters, no list); a topic chosen in the tree and its problems listed on
// the right, the fold rule, the numbers of the tree; the search bar and the tags it suggests; the filters, a word each with
// its menu and the numbers of its choices, and their one rule; tick problems, Create, and check that both PDFs contain the
// expected problems in the expected order (automatic, then dragged by hand); the statement of a problem drawn under its
// title; shareable links and the back button; no Edit link per problem (until the administrator mode) and no problem number
// anywhere; keyboard focus, ARIA, the tag counts, the layout at 360 px (a phone) and in dark mode, the theme, the PDF links
// without a built-in PDF viewer (headless Chromium, like Chrome for Android), the Content-Security-Policy, the engine
// prefetch, the message when the page's script fails to load, and the proposed problems of the public build.
// Needs a built site (python3 build.py --preview) and the engine bundle in site/static/busytex/.
//   node tests/e2e/bank.mjs            exit 0 = pass
//   E2E_SHOTS=<dir> node tests/e2e/bank.mjs   also saves screenshots (360 px, dark mode) into <dir>
import { chromium } from 'playwright';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer } from '../lib/static-server.mjs';

const DOCS = resolve(new URL('../../site', import.meta.url).pathname);
const CHECK_PDF = resolve(new URL('./check_pdf.py', import.meta.url).pathname);
const SHOTS = process.env.E2E_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
// pre-flight: the test needs a preview build (all problems) and the engine bundle
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
// The problems of this build, in ID order.  On main, bank/leave_out.py may have left broken ones out, so the links
// below take their numbers from here, never fixed ones (range(i, j): the i-th to the j-th problem, j - i + 1 of them).
const IDS = JSON.parse(readFileSync(join(DOCS, 'static', 'bank', 'index.json'), 'utf8')).problems.map(p => p.id);
const range = (i, j) => `${IDS[i]}-${IDS[j]}`;
const pad = n => String(n).padStart(4, '0');
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
// the problem IDs of a stitched document, in PDF order (from its \bankproblem{k}{title}{origin}{NNNN} lines)
const texIds = tex => [...tex.matchAll(/^\\bankproblem\{\d+\}.*\{(\d{4})\}$/gm)].map(m => Number(m[1]));
const ROWS = '#bank-results > li:not([hidden])';          // the rows on screen (rows are built once, then hidden or shown)
const TOPICS = '#bank-tree-topics > li > ul > li';         // the first level of the tree, under All problems
const NAME = slug => `#bank-tree-topics .tt-name[data-slug="${slug}"]`;     // a topic's name in the tree ("" = All problems)
const TG = slug => `#bank-tree-topics .tt-tg[data-for="${slug}"]`;          // its round button, which folds or unfolds it
// The tree starts folded (All problems alone): a test that goes to a topic unfolds it first, as a visitor does
const unfoldTree = async p => { if ((await p.getAttribute(TG(''), 'aria-expanded')) === 'false') await p.click(TG('')); };
const WORD = key => `.bank-filter-word[data-filter="${key}"]`;              // a filter's word, which opens its menu
const CROSS = key => `.bank-filter-x[data-filter="${key}"]`;                // the cross of a filter that is set
const OPT = v => `#bank-menu .bank-option[data-opt="${v}"]`;                // a choice of the open menu
const noNumber = text => !/\b0\d{3}\b|#\s*\d{4}/.test(text);                // no problem number (0042, #0042) in a text
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
page.on('request', r => { if (r.url().includes('/static/busytex/')) engineRequests.push(r.url()); });

// What the page shows: the rows listed (their IDs), the head of the list, what the tree lights, the topic chosen.
const view = (p = page) => p.evaluate(() => {
  const ids = [...document.querySelectorAll('#bank-results > li:not([hidden])')].map(li => Number(li.dataset.id));
  const count = document.getElementById('bank-count');
  return { n: ids.length, ids, count: count.hidden ? null : count.textContent, head: !document.getElementById('bank-results-head').hidden,
    lit: [...document.querySelectorAll('#bank-tree-topics .tt-name[aria-current="true"]')].map(e => e.dataset.slug),
    all: window.bank.state.all, area: [...window.bank.state.filters.area] };
});
// the problems under any of these topics (their sub-topics' too), from the data, in ID order
const under = (slugs, p = page) => p.evaluate(slugs => {
  const { problems, cat } = window.bank;
  return problems.filter(q => !q.proposed && q.area.some(a => slugs.some(s => a === s || (cat.ancestors.get(a) || []).includes(s)))).map(q => q.id);
}, slugs);
// the whole bank listed: All problems chosen in the tree (unless it is already)
const listAll = async (p = page) => {
  await p.waitForSelector('html[data-ready]');
  if (!(await p.evaluate(() => window.bank.state.all))) await p.click(NAME(''));
  await p.waitForSelector(ROWS);
};
// a filter's menu, opened by its word (unless it is open already); Escape closes it
const openMenu = async (key, p = page) => {
  if (await p.evaluate(k => window.bank.state.menu !== k, key)) await p.click(WORD(key));
  await p.waitForSelector('#bank-menu:not([hidden])');
};
const closeMenu = async (p = page) => { if (await p.evaluate(() => !!window.bank.state.menu)) await p.keyboard.press('Escape'); };
// the words of the row of filters: what each says, whether it is set, its name for a screen reader
const words = (p = page) => p.evaluate(() => [...document.querySelectorAll('#bank-filters .bank-filter-word')].map(w => ({
  key: w.dataset.filter, text: w.textContent.trim(), on: w.parentElement.classList.contains('is-on'), label: w.getAttribute('aria-label') })));
const word = async (key, p = page) => (await words(p)).find(w => w.key === key) || {};
// the choices of the open menu: the number each shows, and the problems it would leave given everything else chosen
const menuChoices = (key, p = page) => p.evaluate(key => {
  const { S, problems, cat, state } = window.bank;
  return [...document.querySelectorAll('#bank-menu .bank-option[data-opt]')].map(o => {
    const v = o.dataset.opt, change = key === 'solved' ? { solved: v } : { [key]: [v] };
    return { v, role: o.getAttribute('role'), on: o.getAttribute('aria-checked') === 'true', none: o.classList.contains('bank-option-none'),
      shown: Number(o.querySelector('.bank-option-count').textContent), want: S.filterProblems(problems, { ...state.filters, ...change }, cat).length };
  });
}, key);
const countsRight = cs => cs.length > 0 && cs.every(c => c.shown === c.want && c.none === (c.want === 0 && !c.on));
// every topic of the tree: the number it shows, and what it would list with the filters and words as they are
const treeNumbers = (p = page) => p.evaluate(() => {
  const { S, problems, cat, state } = window.bank;
  return [...document.querySelectorAll('#bank-tree-topics .tt-name')].map(e => {
    const slug = e.dataset.slug, want = S.filterProblems(problems, { ...state.filters, area: slug ? [slug] : [] }, cat).length;
    return { slug, shown: Number(e.querySelector('.tt-count').textContent), want, none: e.closest('li').classList.contains('tt-none') };
  });
});
const treeRight = ts => ts.length > 0 && ts.every(t => t.shown === t.want && t.none === (t.want === 0));
// a folded branch goes once its animation is over
const folded = (p = page) => p.waitForFunction(() => !document.querySelector('#bank-tree-topics .tt-going'), null, { timeout: 3000 }).catch(() => {});
// the address follows a change 150 ms later (bank-ui.js syncUrl)
const address = async (p = page) => { await p.waitForTimeout(300); return p.evaluate(() => location.search); };

try {
  console.log('1. a calm page on arrival: the tree unfolded one level, the row of filters, no list');
  // the first paint, before any script: the page as served, read with JavaScript off
  const firstPaint = await (async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const p0 = await ctx.newPage();
    await p0.goto(`${base}/problems.html`);
    const r = await p0.evaluate(() => ({ words: [...document.querySelectorAll('#bank-filters .bank-filter-word')].map(w => w.textContent.trim()),
      tree: [...document.querySelectorAll('#bank-tree-topics .tt-name')].map(n => n.textContent), seen: document.getElementById('bank-filters').getBoundingClientRect().height > 0 }));
    await ctx.close();
    return r;
  })();
  await page.goto(`${base}/problems.html`);
  await page.waitForSelector('html[data-ready]');
  const nAll = await page.evaluate(() => window.bank.problems.length);
  const nProposed = await page.evaluate(() => window.bank.problems.filter(p => p.proposed).length);
  const total = nAll - nProposed;                         // what the page lists by default (a preview build: every problem)
  check(total > 0, `index has ${total} problems`);
  // the letters of the site's own text beyond plain Latin (tags such as Vojtěch Jarník, φ σ τ) are in the basic font
  // files: no page of the bank downloads a second one for them (tools/subset_fonts.py, fonts.css)
  const fontFiles = await page.evaluate(async () => {
    const own = [...window.bank.cat.byType.area.values(), ...window.bank.cat.byType.origin.values()].map(t => t.name).join(' ');
    await document.fonts.ready;
    await Promise.all(['400 16px "MOC Typewriter"', '400 16px "MOC Serif"', '700 16px "MOC Serif"'].map(f => document.fonts.load(f, own)));
    return performance.getEntriesByType('resource').map(e => e.name.split('/').pop()).filter(n => n.endsWith('.woff2'));
  });
  check(fontFiles.length >= 3 && !fontFiles.some(n => n.includes('-ext')), `every tag name is drawn with the basic font files alone (${fontFiles.join(', ')})`);
  let v = await view();
  check(v.n === 0 && !v.head && !v.lit.length && !v.all, 'on arrival: no list, no head of a list, nothing lit in the tree');
  const roots = await page.evaluate(() => [...window.bank.cat.byType.area.values()].filter(a => !a.parent).map(a => a.slug));
  const withProblems = [], rootCounts = [];
  for (const r of roots) { const n = (await under([r])).length; if (n) { withProblems.push(r); rootCounts.push(n); } }
  const treeNow = () => page.evaluate(() => {
    const line = li => {
      const tg = li.querySelector(':scope > .tt-row > .tt-tg'), name = li.querySelector(':scope > .tt-row > .tt-name');
      return { slug: name.dataset.slug, name: name.firstChild.textContent, n: Number(name.querySelector('.tt-count').textContent), sub: li.querySelectorAll(':scope > ul > li').length,
        dot: !!li.querySelector(':scope > .tt-row > .tt-dot'), tg: tg && { for: tg.dataset.for, open: tg.getAttribute('aria-expanded'), label: tg.getAttribute('aria-label'), text: tg.textContent } };
    };
    return { root: line(document.querySelector('#bank-tree-topics > .tt-root')), topics: [...document.querySelectorAll('#bank-tree-topics > li > ul > li')].map(line),
      names: [...document.querySelectorAll('#bank-tree-topics .tt-name')].map(n => n.textContent), shown: !document.getElementById('bank-tree').hidden };
  });
  const folded0 = await treeNow(), f0 = folded0.root;
  check(folded0.shown && !folded0.topics.length && f0.slug === '' && f0.name === 'All problems' && f0.n === total && f0.tg && f0.tg.for === '' && f0.tg.open === 'false' && f0.tg.label === 'Unfold the tree' && f0.tg.text === '+',
    `on arrival the tree is folded: All problems alone, with its ${f0.n} problems; its round button unfolds the tree ("${f0.tg && f0.tg.label}")`);
  await page.click(TG(''));
  const tree0 = await treeNow();
  check(tree0.shown && same(tree0.topics.map(t => t.slug), withProblems) && same(tree0.topics.map(t => t.n), rootCounts) && tree0.topics.every(t => !t.sub),
    `unfolded, it shows one level: the ${withProblems.length} topics that hold problems, each with its number of problems, none unfolded`);
  const r0 = tree0.root;
  check(r0.sub === withProblems.length && r0.tg.open === 'true' && r0.tg.label === 'Fold the tree' && r0.tg.text === '−',
    `its round button then folds the tree ("${r0.tg && r0.tg.label}")`);
  check(tree0.topics.every(t => t.tg ? t.tg.for === t.slug && t.tg.open === 'false' && t.tg.label === `Unfold ${t.name}` && t.tg.text === '+' : t.dot),
    `every topic has a round button that unfolds it ("${(tree0.topics.find(t => t.tg) || { tg: {} }).tg.label}"), or a dot when nothing hangs under it`);
  const words0 = await words();
  const keys0 = ['difficulty', 'origin', 'solved', 'years', 'methods', ...(nProposed ? ['proposed'] : [])];
  check(same(words0.map(w => w.key), keys0) && words0.every(w => !w.on) && (await page.locator('#bank-reset').evaluate(b => b.classList.contains('is-idle') && getComputedStyle(b).visibility === 'hidden' && b.tabIndex === -1 && b.getAttribute('aria-hidden') === 'true')),
    `the row of filters has a word per filter (${words0.map(w => w.text).join(', ')}${nProposed ? '' : '; no Proposed: this build has no proposed problem'}), none set; "Clear all" hidden, out of the keyboard's way, its room kept`);
  check(firstPaint.seen && same(firstPaint.words, words0.slice(0, firstPaint.words.length).map(w => w.text)) && firstPaint.words.length >= 5 && same(firstPaint.tree, folded0.names),
    'before the script runs, the page already shows those words and the folded tree, as the script draws them');
  const aria0 = await page.evaluate(() => [...document.querySelectorAll('#bank-filters .bank-filter-word')].every(w => !w.hasAttribute('aria-haspopup') && w.getAttribute('aria-expanded') === 'false' && w.getAttribute('aria-controls') === 'bank-menu'));
  check(aria0, 'each word says what it opens (aria-expanded false, aria-controls bank-menu: a group of choices, not a menu of commands)');
  const acts = await page.evaluate(() => {
    const o = document.getElementById('bank-order-btn');
    return { order: o.textContent, disabled: o.disabled, idle: o.classList.contains('is-idle'), seen: getComputedStyle(o).visibility, hidden: o.hidden,
      cancel: document.getElementById('bank-cancel').hidden, create: document.getElementById('bank-create').disabled };
  });
  check(acts.order === 'PDF order' && acts.disabled && acts.idle && acts.seen === 'hidden' && !acts.hidden && acts.cancel && acts.create,
    'nothing ticked: "PDF order" waits unseen in its place (disabled), no Cancel, Create PDF disabled');
  const row = await page.evaluate(() => {
    const tools = document.getElementById('bank-tools'), cs = getComputedStyle(tools), r = tools.getBoundingClientRect();
    const actions = document.getElementById('bank-actions').getBoundingClientRect(), filters = document.getElementById('bank-filters').getBoundingClientRect();
    return { pos: cs.position, top: parseFloat(cs.top), head: document.querySelector('.site-head').offsetHeight, right: Math.abs(actions.right - r.right) < 1 && actions.left >= filters.right - 1,
      status: document.getElementById('bank-status').getBoundingClientRect().top >= r.bottom - 1, announce: document.getElementById('bank-announce').getAttribute('aria-live') };
  });
  check(row.pos === 'sticky' && row.top === row.head && row.right && row.status && row.announce === 'polite',
    'on a computer the row of filters sticks under the header, what is done with the ticks on its right, the status line under it');
  await page.waitForFunction(n => document.querySelectorAll('#bank-results > li').length >= n, nAll, { timeout: 10000 }).catch(() => {});
  const built = await page.evaluate(() => ({ all: document.querySelectorAll('#bank-results > li').length, shown: document.querySelectorAll('#bank-results > li:not([hidden])').length }));
  check(built.all === nAll && built.shown === 0, `the rows are built ahead while the browser is idle: all ${built.all} there, every one hidden, before any list is shown`);
  check(/<meta http-equiv="Content-Security-Policy"/.test(await page.content()), 'the page carries a Content-Security-Policy');
  const look = await page.evaluate(async () => {
    await document.fonts.ready;
    return { bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`),
      others: performance.getEntriesByType('resource').map(e => e.name).filter(u => new URL(u).origin !== location.origin) };
  });
  check(look.bg !== '' && look.fonts.some(f => f.startsWith('MOC Typewriter')) && look.others.length === 0,
    `the site's stylesheet and its Computer Modern font load, and nothing comes from another site (${look.fonts.join(', ') || 'no font'}${look.others.length ? '; from elsewhere: ' + look.others.join(', ') : ''})`);
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
  await page.keyboard.press('Escape');
  check((await page.locator('#site-nav a[href="propose.html"]').count()) === 1, 'the header links to the propose page');
  // a word found in one title only, for the searches below
  const probe = await page.evaluate(() => {
    const counts = new Map();
    for (const p of window.bank.problems) for (const w of p.title.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 5) counts.set(w, (counts.get(w) || 0) + 1);
    const word = [...counts.keys()].find(w => counts.get(w) === 1);
    return { word, n: window.bank.problems.filter(p => !p.proposed && window.bank.S.matchesText(p, word)).length };
  });
  await page.click(NAME(''));
  v = await view();
  check(v.n === total && v.count === `${total} problems` && v.all && same(v.lit, ['']) && v.head,
    `a click on All problems lists the whole bank on the right ("${v.count}"), the name lit, window.bank.state.all set`);
  check((await address()) === '?a=*', 'All problems is kept in the address (a=*): a link to it lists the whole bank');
  const cols = await page.evaluate(() => {
    const right = document.getElementById('bank-right'), panel = document.getElementById('bank-tree-panel'), list = document.getElementById('bank-results'), cs = getComputedStyle(panel);
    return { inside: panel.parentElement === right && panel.contains(list) && panel.contains(document.getElementById('bank-results-head')),
      beside: right.getBoundingClientRect().left >= document.querySelector('#bank-tree .bank-left').getBoundingClientRect().right - 1,
      sticky: getComputedStyle(right).position, scroll: cs.overflowY, capped: cs.maxHeight !== 'none', scrolls: panel.scrollHeight > panel.clientHeight };
  });
  check(cols.inside && cols.beside && cols.sticky === 'sticky' && cols.scroll === 'auto' && cols.capped && cols.scrolls,
    'the list is on the right of the tree, its head above it; on a computer its column stays in sight, and the list scrolls in a box of its own');
  // the line the list hangs on: the right edge of the tree's column, in the colour of the topic chosen (site.css .bank-left)
  const lineAll = await page.evaluate(() => {
    const left = document.querySelector('#bank-tree .bank-left'), cs = getComputedStyle(left);
    return { topic: left.getAttribute('data-topic'), line: cs.borderRightColor, width: parseFloat(cs.borderRightWidth),
      own: getComputedStyle(document.querySelector('#bank-tree-topics > .tt-root > .tt-row > .tt-tg')).borderTopColor };
  });
  check(lineAll.topic === null && lineAll.line === lineAll.own && lineAll.line !== 'rgba(0, 0, 0, 0)' && lineAll.width > 0,
    `the whole bank hangs on a line down the right edge of the tree, in the colour of All problems (${lineAll.line})`);
  check(v.ids.every((x, i) => i === 0 || x > v.ids[i - 1]), 'results are in order of arrival');
  check(noNumber(await page.locator('#bank-results').textContent()), 'no problem number is shown in the list');
  const diffChip = (await page.locator(ROWS).locator('.bank-chip-unrated').first().textContent()).trim();
  check(/Difficulty\s*None\s*AI: (Easy|Medium|Hard|Extreme)/.test(diffChip), `an unrated problem's chip says "Difficulty None", the AI estimate in small print on its right (${diffChip})`);
  check(await page.locator('#bank-create').isDisabled(), 'Create is disabled with no selection');
  check((await page.locator('#bank-results a.bank-edit').count()) === 0, 'no Edit link per problem (it comes with the administrator mode)');
  check(!/\bunsolved\b/.test(await page.locator('#bank-results').textContent()) && (await page.locator(`${ROWS} .bank-marker-incomplete`).first().textContent()) === 'Incomplete solution',
    'a problem without a whole solution is marked "Incomplete solution" (the same words as the filter)');
  const rowParts = await page.evaluate(() => {
    const li = document.querySelector('#bank-results > li:not([hidden])');
    return { check: !!li.querySelector(':scope > .bank-check'), title: li.querySelector('.bank-row-title')?.getAttribute('aria-expanded'), chips: li.querySelectorAll('.bank-chip').length,
      gone: document.querySelectorAll('.bank-preview-btn, .bank-row-actions, .bank-bar, #bank-idle, #bank-chips, #bank-filter-btn, #bank-advanced').length };
  });
  check(rowParts.check && rowParts.title === 'false' && rowParts.chips > 0 && rowParts.gone === 0,
    'a row: its tick box, its title (a button that opens the statement), its tags; no Preview button, no bar of the old page');
  await page.click(NAME(''));
  v = await view();
  check(v.n === 0 && !v.head && !v.lit.length && !v.all, 'a second click on All problems lets go of it: no list, nothing lit');

  console.log('1b. a topic chosen in the tree: its problems on the right; nothing moves, and the ticks stay');
  {
    const t = await context.newPage();                  // a page of its own: the ticks below stay out of the next sections
    watch(t);
    await t.goto(`${base}/problems.html`);
    await t.waitForSelector('html[data-ready]');
    await unfoldTree(t);
    // each first-level topic in its own colour (bank/colours.py, through tags.json), in both themes; none grey
    for (const theme of ['light', 'dark']) {
      const paint = await t.evaluate(theme => {
        const was = document.documentElement.dataset.theme;
        document.documentElement.dataset.theme = theme;
        const faint = getComputedStyle(document.body).getPropertyValue('--ink-faint').trim();
        const out = [...window.bank.cat.byType.area.values()].filter(tag => !tag.parent).map(tag => {
          const li = document.querySelector(`#bank-tree-topics [data-topic="${tag.slug}"]`);
          return { slug: tag.slug, want: tag.colour && tag.colour[theme === 'dark' ? 1 : 0], got: li && getComputedStyle(li).getPropertyValue('--c').trim() };
        });
        document.documentElement.dataset.theme = was;
        return { faint, out };
      }, theme);
      const wrong = paint.out.filter(x => !x.want || x.got !== x.want || x.got === paint.faint);
      check(paint.out.length > 1 && !wrong.length && new Set(paint.out.map(x => x.got)).size === paint.out.length,
        `${theme} theme: each of the ${paint.out.length} first-level topics in its own colour from tags.json, none grey${wrong.length ? ' (not: ' + wrong.map(x => `${x.slug} ${x.got}`).join(', ') + ')' : ''}`);
    }
    const place = () => t.evaluate(() => {
      const at = e => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; };
      return `tree ${at(document.querySelector('#bank-tree-topics > .tt-root > .tt-row'))}, Create ${at(document.getElementById('bank-create'))}, scrolled ${Math.round(scrollY)}`;
    });
    const place0 = await place();
    const slug = withProblems[0];
    const name = await t.evaluate(s => window.bank.cat.byType.area.get(s).name, slug);
    await t.click(NAME(slug));
    const want = await under([slug], t);
    v = await view(t);
    check(same(v.ids, want) && v.count === `${want.length} problems in ${name}` && same(v.lit, [slug]) && !v.all,
      `a click on a name: on the right its ${want.length} problems (its sub-topics' too), each once, in order of arrival, "${v.count}", the name lit`);
    check((await address(t)) === `?a=${slug}`, `the address names the topic (a=${slug})`);
    check((await t.locator('#bank-tree-panel .tt-tg, #bank-tree-panel .tt-name').count()) === 0, 'the right side never draws the tree again: no topic to unfold there');
    const lineOf = () => t.evaluate(s => {
      const left = document.querySelector('#bank-tree .bank-left'), node = document.querySelector(`#bank-tree-topics .tt-tg[data-for="${s}"]`);
      return { topic: left.getAttribute('data-topic'), line: getComputedStyle(left).borderRightColor, own: node && getComputedStyle(node).borderTopColor };
    }, slug);
    const line1 = await lineOf();
    check(line1.topic === slug && line1.line === line1.own && line1.line !== 'rgba(0, 0, 0, 0)',
      `its list hangs on the right edge of the tree, a line in the colour of ${name} (${line1.line}, as its node in the tree)`);
    check(await place() === place0, `nothing moves when a topic is chosen: the first line of the tree and Create PDF keep their place (${place0})`);
    check(noNumber(await t.locator('#bank-tree').textContent()), 'no problem number in the tree');
    const box = t.locator(`${ROWS} .bank-check`);
    const ticks = () => t.evaluate(() => {
      const o = document.getElementById('bank-order-btn');
      return { text: document.getElementById('bank-selected-count').textContent, marked: document.querySelectorAll('#bank-results > li.bank-row-selected:not([hidden])').length,
        orderOff: o.disabled, idle: o.classList.contains('is-idle'), order: o.textContent, create: document.getElementById('bank-create').disabled };
    });
    await box.nth(0).check();
    const one = await ticks();
    check(one.text === '1 selected' && one.marked === 1 && !one.create && await place() === place0, 'a tick: the head of the list says "1 selected", the row is marked, Create PDF can be used, and nothing moves');
    check(one.orderOff && one.idle, 'with one tick "PDF order" still waits unseen (disabled)');
    await box.nth(1).check();
    const two = await ticks();
    check(two.text === '2 selected' && !two.orderOff && !two.idle && two.order === 'PDF order' && await place() === place0,
      'a second tick: "PDF order" shows in the place kept for it, and Create PDF has not moved');
    await t.click(NAME(slug));
    v = await view(t);
    const kept = await t.evaluate(() => ({ text: document.getElementById('bank-selected-count').textContent, count: document.getElementById('bank-count').hidden,
      all: document.getElementById('bank-select-all-wrap').hidden, size: window.bank.state.selection.size }));
    check(v.n === 0 && !v.lit.length && v.head && kept.text === '2 selected' && kept.count && kept.all && kept.size === 2,
      'a second click on the name lets go of it: no list, but the ticks stay, and the head says "2 selected" (no count, no Select all)');
    const line0 = await lineOf();
    check(line0.topic === null && line0.line === 'rgba(0, 0, 0, 0)', 'with no list there is no line either');
    const a2 = await address(t);
    check(!a2.includes('a=') && a2.includes('sel='), `the address keeps the ticks, not the topic (${a2})`);
    await t.click(NAME(slug));
    check((await t.locator(`${ROWS} .bank-check:checked`).count()) === 2, 'chosen again, its list shows the two problems still ticked');
    await t.click('#bank-clear-selection');
    await t.click(NAME(slug));
    check(await t.locator('#bank-results-head').isHidden() && (await view(t)).n === 0, 'nothing ticked and no list: the head of the list goes');
    await t.close();
  }

  console.log('1c. the round buttons fold and unfold one level; folding away what is chosen hands the choice up');
  {
    const root = withProblems[0];
    const rootName = await page.evaluate(s => window.bank.cat.byType.area.get(s).name, root);
    // a topic two levels down (Series, under Real analysis, under Analysis)
    const deep = await page.evaluate(root => {
      const { cat, problems } = window.bank, has = s => problems.some(p => p.area.some(a => a === s || (cat.ancestors.get(a) || []).includes(s)));
      const all = [...cat.byType.area.values()].filter(a => (cat.ancestors.get(a.slug) || []).length === 2 && cat.ancestors.get(a.slug)[0] === root && has(a.slug));
      const t = all.find(a => a.slug === 'series') || all[0];
      return t && { slug: t.slug, name: t.name, mid: cat.ancestors.get(t.slug)[1] };
    }, root);
    const li = page.locator(`${TOPICS}[data-topic="${root}"]`);
    await page.click(TG(root));
    const tg = await page.locator(TG(root)).evaluate(b => ({ open: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'), text: b.textContent }));
    check((await li.locator(':scope > ul > li').count()) > 0 && tg.open === 'true' && tg.label === `Fold ${rootName}` && tg.text === '−',
      `its round button unfolds ${rootName}: its sub-topics show, and the button now says "${tg.label}"`);
    const leaf = await li.evaluate(l => { const x = l.querySelector('li.tt-leaf'); return x ? { dot: !!x.querySelector(':scope > .tt-row > .tt-dot'), button: !!x.querySelector(':scope > .tt-row > .tt-tg') } : null; });
    check(!leaf || (leaf.dot && !leaf.button), 'a sub-topic with nothing under it has a dot instead of a button');
    await page.click(TG(''));
    await folded();
    const rootTg = await page.locator(TG('')).evaluate(b => ({ open: b.getAttribute('aria-expanded'), label: b.getAttribute('aria-label'), text: b.textContent }));
    check((await page.locator(TOPICS).count()) === 0 && rootTg.text === '+' && rootTg.label === 'Unfold the tree' && rootTg.open === 'false' && await page.locator(NAME('')).isVisible(),
      'the button of All problems folds the tree away: only All problems is left ("Unfold the tree")');
    await page.click(TG(''));
    check((await page.locator(TOPICS).count()) === withProblems.length && (await li.locator(':scope > ul > li').count()) === 0 && (await page.locator(TG(root)).getAttribute('aria-expanded')) === 'false',
      `and brings it back one level deep: ${rootName}, unfolded before, is folded again (a fold closes every branch under it)`);
    await page.click(TG(root));
    if (deep) {
      await page.click(TG(deep.mid));
      await page.click(NAME(deep.slug));
      v = await view();
      const nDeep = (await under([deep.slug])).length;
      check(same(v.lit, [deep.slug]) && v.n === nDeep && (await address()) === `?a=${deep.slug}`, `${deep.name} chosen: its ${nDeep} problems listed, a=${deep.slug}`);
      await page.click(TG(root));
      await folded();
      v = await view();
      const nRoot = (await under([root])).length;
      check(same(v.lit, [root]) && same(v.area, [root]) && v.n === nRoot && v.count === `${nRoot} problems in ${rootName}` && await page.locator(NAME(root)).isVisible() && (await address()) === `?a=${root}`,
        `folding ${rootName} hides ${deep.name}: ${rootName} is chosen instead, its ${nRoot} problems listed, a=${root}, its name lit and in sight`);
      await page.click(TG(root));
      check((await page.locator(TG(deep.mid)).getAttribute('aria-expanded')) === 'false' && !(await page.locator(NAME(deep.slug)).count()),
        `unfolded again, ${rootName} shows one level: the branch that was open in it is folded`);
      await page.click(TG(deep.mid));
      await page.click(NAME(deep.slug));
      await page.click(TG(''));
      await folded();
      v = await view();
      check(v.all && same(v.lit, ['']) && v.n === total && v.count === `${total} problems` && await page.locator(NAME('')).isVisible() && (await address()) === '?a=*',
        `folding the whole tree away with ${deep.name} chosen hands the choice to All problems: the whole bank listed, the address says a=*`);
      await page.click(TG(''));
    } else check(true, 'no topic two levels down has problems (the fold rule not tested)');
    // + then − at once, and a click into a branch that is folding away (found by a tester, 2026-11-22)
    const quick = await page.evaluate(async r => {
      const tg = document.querySelector(`#bank-tree-topics .tt-tg[data-for="${r}"]`), seen = [];
      tg.click(); await new Promise(f => setTimeout(f, 60)); tg.click();
      for (let i = 0; i < 5; i++) { await new Promise(f => setTimeout(f, 40)); const ul = tg.closest('li').querySelector(':scope > ul'); if (ul) seen.push(ul.style.clipPath ? 'clipped' : 'bare'); }
      await new Promise(f => setTimeout(f, 400));
      const root = document.querySelector('#bank-tree-topics .tt-tg[data-for=""]');
      root.click(); await new Promise(f => setTimeout(f, 120));
      const t = document.querySelector(`#bank-tree-topics .tt-tg[data-for="${r}"]`), b = t.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (hit) hit.click();
      await new Promise(f => setTimeout(f, 500));
      root.click(); await new Promise(f => setTimeout(f, 400));
      return { seen, after: document.querySelector(`#bank-tree-topics .tt-tg[data-for="${r}"]`).getAttribute('aria-expanded') };
    }, root);
    check(!quick.seen.includes('bare') && quick.after === 'false',
      `a branch folded the moment it opened stays clipped while it goes (${quick.seen.join(' ')}), and a click into a branch folding away goes nowhere`);
    await page.click(NAME(''));                      // let go of All problems
    check((await view()).n === 0, 'a second click on All problems: the calm page again');
  }

  console.log('1d. a filter narrows what the tree counts, and opens nothing; what is lit is what is listed, and a click on it lets it go');
  {
    await page.evaluate(() => { document.querySelector('#bank-tree-topics .tt-root .tt-name').__kept = true; });
    const kept = () => page.evaluate(() => !!document.querySelector('#bank-tree-topics .tt-root .tt-name').__kept);
    const branches = () => page.evaluate(() => [...document.querySelectorAll('#bank-tree-topics .tt-tg')].map(b => b.getAttribute('aria-expanded')).join());
    const shut = await branches();
    const hardest = await page.evaluate(() => [...window.bank.cat.byType.difficulty.keys()].at(-1));
    await openMenu('difficulty');
    await page.click(OPT(hardest));
    await closeMenu();
    let ts = await treeNumbers();
    check(treeRight(ts) && ts.some(x => x.none), `a filter set (Difficulty: ${(await word('difficulty')).text}): every topic counts what it would list, and a topic with nothing left steps back (tt-none)`);
    v = await view();
    check(v.n === 0 && !v.lit.length && !v.all && (await branches()) === shut && await kept() && !(await address()).includes('a='),
      'and it opens nothing: no list, nothing lit, no branch unfolded, the tree brought up to date in place (the address says no a=)');
    await page.click(NAME(''));
    v = await view();
    const want = ts.find(x => x.slug === '').want;
    check(v.n === want && same(v.lit, ['']) && v.all && (await address()).includes('a=*'), `All problems chosen then: what the filter leaves of the whole bank (${v.n}), All problems lit, the address says a=*`);
    await page.click(NAME(''));
    v = await view();
    ts = await treeNumbers();
    check(v.n === 0 && !v.lit.length && !v.all && (await word('difficulty')).on && treeRight(ts) && !(await address()).includes('a='),
      'All problems clicked again: the list goes, the filter stays set, the numbers still follow it');
    await page.click(CROSS('difficulty'));
    await page.fill('#bank-search', probe.word);
    ts = await treeNumbers();
    v = await view();
    check(treeRight(ts) && ts.some(x => x.none) && v.n === probe.n && same(v.lit, ['']) && await kept(),
      `typed words are a search ("${probe.word}"): the numbers follow, and the ${probe.n} problem(s) found are listed under All problems lit, the tree still the same`);
    await page.fill('#bank-search', '');
    await page.keyboard.press('Escape');
    ts = await treeNumbers();
    v = await view();
    check(treeRight(ts) && !ts.some(x => x.none) && ts.find(x => x.slug === '').shown === total && v.n === 0 && !v.lit.length,
      'the words erased: the list they opened goes, every topic has its full number again');
  }

  console.log('2. the bar searches titles; the list suggests the tags those words could mean');
  await page.goto(`${base}/problems.html`);
  await page.waitForSelector('html[data-ready]');
  const listbox = () => page.evaluate(() => ({ hidden: document.getElementById('bank-listbox').hidden, expanded: document.getElementById('bank-search').getAttribute('aria-expanded'),
    heads: [...document.querySelectorAll('#bank-listbox .bank-list-header')].map(h => h.textContent), options: document.querySelectorAll('#bank-listbox [role=option]').length }));
  const noTags = () => page.evaluate(() => { const f = window.bank.state.filters; return f.area.length + f.methods.length + f.difficulty.length + f.origin.length === 0; });
  await page.click('#bank-search');
  let lb = await listbox();
  check(lb.hidden && lb.expanded === 'false', 'the empty bar opens no list: the tags come only with typed words');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  lb = await listbox();
  check(lb.hidden && (await view()).n === 0 && await noTags(), 'ArrowDown and Enter on the empty bar open nothing and choose nothing');
  await page.fill('#bank-search', probe.word);
  v = await view(); lb = await listbox();
  check(probe.n >= 1 && v.n === probe.n && same(v.lit, ['']), `typing "${probe.word}" narrows the list to ${probe.n} problem(s) by title, at once, under All problems lit`);
  check(lb.heads[0] === `${probe.n} problem${probe.n === 1 ? '' : 's'} with “${probe.word}” in the title. Press Enter to see them.` && lb.expanded === 'true',
    `the list under the bar says so: "${lb.heads[0]}"`);
  check((await address()).includes('q='), 'the typed words travel in the URL');
  check(await page.locator('#bank-reset').isVisible() && (await words()).every(x => !x.on), 'typed words alone bring "Clear all" (no filter is set)');
  await page.keyboard.press('Enter');
  check(await noTags() && await page.locator('#bank-listbox').isHidden() && (await page.inputValue('#bank-search')) === probe.word && (await view()).n === probe.n,
    'Enter on words found in a title keeps them as a title search and closes the list');
  const both = await page.evaluate(() => {             // words found in titles and in tags
    const { S, problems, cat } = window.bank, c = S.tagCounts(problems.filter(p => !p.proposed), cat);
    for (const t of cat.byType.area.values()) {
      const w = S.normalize(t.name).split(' ')[0].slice(0, 5);
      if (w.length < 5) continue;
      const n = problems.filter(p => !p.proposed && S.matchesText(p, w)).length;
      if (n && S.suggest(cat, w, S.emptyFilters(), Infinity, ['area', 'difficulty', 'origin']).some(s => c.get(s.tag.type + ':' + s.tag.slug))) return { w, n };
    }
    return null;
  });
  if (both) {
    await page.fill('#bank-search', both.w);
    lb = await listbox();
    check(lb.heads[0] === `${both.n} problem${both.n === 1 ? '' : 's'} with “${both.w}” in the title. Press Enter to see them.` && lb.heads[1] === 'Or filter by one of these tags' && lb.options > 0,
      `words found in titles and in tags ("${both.w}"): the titles first, then "Or filter by one of these tags"`);
  } else check(true, 'no word is both in a title and in a tag (the two headers not tested)');
  await page.fill('#bank-search', '');
  await listAll();
  await page.fill('#bank-search', '∑ ^');
  v = await view(); lb = await listbox();
  check(v.n === total && lb.hidden && !(await address()).includes('q='), 'symbols only ("∑ ^") filter nothing: the whole bank stays listed, no tag offered, and the URL carries no q=');
  await page.fill('#bank-search', '');
  await page.click(NAME(''));                        // let go of All problems
  await page.fill('#bank-search', 'algeb');
  await page.waitForSelector('#bank-listbox [role=option]');
  const nAlg = (await under(['algebra'])).length;
  const firstOpt = await page.evaluate(() => { const o = document.querySelector('#bank-listbox [role=option]'); return { type: o.querySelector('.bank-option-type').textContent, label: o.querySelector('.bank-option-label').textContent, n: Number(o.querySelector('.bank-option-count').textContent) }; });
  check(firstOpt.label === 'Algebra' && firstOpt.type === 'Topic' && firstOpt.n === nAlg, `first suggestion is Algebra, with its type and its number of problems (${firstOpt.type} ${firstOpt.label} ${firstOpt.n})`);
  const activeAt = () => page.evaluate(() => {
    const id = document.getElementById('bank-search').getAttribute('aria-activedescendant'), opts = [...document.querySelectorAll('#bank-listbox [role=option]')];
    return [id ? opts.findIndex(o => o.id === id) : -1, opts.findIndex(o => o.classList.contains('bank-option-active'))].join();
  });
  await page.keyboard.press('ArrowDown'); const a1 = await activeAt();
  await page.keyboard.press('ArrowDown'); const a2 = await activeAt();
  await page.keyboard.press('ArrowUp'); const a3 = await activeAt();
  check(a1 === '0,0' && a2 === '1,1' && a3 === '0,0', 'ArrowDown and ArrowUp go through the tags, the active one named to a screen reader (aria-activedescendant)');
  await page.keyboard.press('Enter');
  v = await view();
  check(same(v.area, ['algebra']) && same(v.lit, ['algebra']) && v.n === nAlg && nAlg > 0 && nAlg < total, `ArrowDown + Enter takes the tag: Algebra is chosen in the tree, its ${nAlg} problems listed`);
  check((await page.inputValue('#bank-search')) === '' && (await page.evaluate(() => window.bank.state.filters.text)) === '',
    'and empties the bar: those words were there to find the tag');
  check(await page.locator('#bank-listbox').isHidden() && (await page.getAttribute('#bank-search', 'aria-expanded')) === 'false',
    'and the list of tags closes with it: no suggestion is left under the empty bar');
  check((await address()) === '?a=algebra', 'URL carries the topic (a=algebra)');
  await page.click(NAME('algebra'));                 // let go of it
  const sub = await page.evaluate(() => {              // a sub-topic whose topic is folded
    const { S, problems, cat } = window.bank, c = S.tagCounts(problems.filter(p => !p.proposed), cat);
    const closed = s => document.querySelector(`#bank-tree-topics .tt-tg[data-for="${s}"]`)?.getAttribute('aria-expanded') === 'false';
    const t = [...cat.byType.area.values()].find(a => a.parent && c.get('area:' + a.slug) && closed(cat.ancestors.get(a.slug)[0]));
    return t && { slug: t.slug, name: t.name, path: cat.ancestors.get(t.slug) };
  });
  if (sub) {
    await page.fill('#bank-search', sub.name);
    await page.waitForSelector('#bank-listbox [role=option]');
    const label = await page.locator('#bank-listbox [role=option] .bank-option-label').first().textContent();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    v = await view();
    const open = await page.evaluate(path => path.every(s => document.querySelector(`#bank-tree-topics .tt-tg[data-for="${s}"]`)?.getAttribute('aria-expanded') === 'true'), sub.path);
    check(label === sub.name && same(v.lit, [sub.slug]) && open && await page.locator(NAME(sub.slug)).isVisible() && v.n === (await under([sub.slug])).length,
      `a sub-topic picked ("${sub.name}"): it is chosen in the tree, and the topics that hold it unfold, so that it can be seen`);
    await page.click(NAME(sub.slug));
  } else check(true, 'no sub-topic under a folded topic (the tree unfolding to a pick not tested)');
  // a word found in no title but naming a tag (e.g. an origin): Enter takes the tag, not an empty list
  const tagWord = await page.evaluate(() => {
    const { S, problems, cat } = window.bank;
    const counts = S.tagCounts(problems, cat);
    for (const t of cat.byType.origin.values()) {
      const w = S.normalize(t.name).split(' ')[0];
      if (w.length >= 4 && counts.get('origin:' + t.slug) && !problems.some(p => S.matchesText(p, w)) && S.suggest(cat, w, S.emptyFilters(), Infinity).filter(s => counts.get(s.tag.type + ':' + s.tag.slug))[0]?.tag.slug === t.slug) return { w, slug: t.slug, n: counts.get('origin:' + t.slug), name: t.name };
    }
    return null;
  });
  if (tagWord) {
    await page.fill('#bank-search', tagWord.w);
    await page.waitForSelector('#bank-listbox [role=option]');
    lb = await listbox();
    check(lb.heads[0] === `No title contains “${tagWord.w}”. Press Enter to filter by the first tag.`, `"${tagWord.w}" is in no title: the list says so ("${lb.heads[0]}")`);
    await page.keyboard.press('Enter');
    const w = await word('origin');
    check(same(await page.evaluate(() => window.bank.state.filters.origin), [tagWord.slug]) && (await page.locator(ROWS).count()) === tagWord.n && w.text === tagWord.name && w.on,
      `and Enter picks the tag: ${tagWord.n} problem(s), and the Origin word says "${w.text}"`);
    const second = await page.evaluate(first => {        // another origin, typed in full: it joins the first
      const { S, problems, cat } = window.bank, c = S.tagCounts(problems.filter(p => !p.proposed), cat);
      const t = [...cat.byType.origin.values()].find(o => o.slug !== first && c.get('origin:' + o.slug)
        && S.suggest(cat, o.name, { ...S.emptyFilters(), origin: [first] }, Infinity, ['area', 'difficulty', 'origin']).filter(s => c.get(s.tag.type + ':' + s.tag.slug) && s.tag.type === 'origin')[0]?.tag.slug === o.slug);
      if (!t) return null;
      const slugs = [first, t.slug];
      return { slug: t.slug, name: t.name, names: [...cat.byType.origin.values()].filter(o => slugs.includes(o.slug)).map(o => o.name).join(', '),
        n: problems.filter(p => !p.proposed && (slugs.includes(p.origin) || (p.alsoIn || []).some(o => slugs.includes(o)))).length };
    }, tagWord.slug);
    if (second) {
      await page.fill('#bank-search', second.name);
      await page.waitForSelector('#bank-listbox .bank-option-origin');
      await page.locator('#bank-listbox .bank-option-origin').first().click();
      const w2 = await word('origin');
      check(same(await page.evaluate(() => window.bank.state.filters.origin), [tagWord.slug, second.slug]) && w2.text === second.names && (await view()).n === second.n && (await page.inputValue('#bank-search')) === '',
        `another origin picked with the mouse joins the first: "${w2.text}", the ${second.n} problems from either, the bar emptied`);
    } else check(true, 'no second origin to type (two origins picked in the search not tested)');
    await page.click(CROSS('origin'));
  } else check(true, 'no origin word is missing from every title (Enter on a tag-only word not tested)');
  await page.fill('#bank-search', 'zzqqxx');
  lb = await listbox();
  const empty = await page.evaluate(() => {
    const e = document.getElementById('bank-empty'), b = document.getElementById('bank-empty-clear');
    return { shown: !e.hidden, text: e.firstChild.textContent.trim(), button: b.textContent, inside: e.contains(b) };
  });
  check(lb.heads[0] === 'No title contains “zzqqxx”.' && lb.options === 0 && empty.shown && empty.text === 'No problem matches.' && empty.button === 'Clear the filters' && empty.inside && (await view()).n === 0,
    'words found nowhere: under the bar "No title contains “zzqqxx”.", and on the right "No problem matches." with "Clear the filters"');
  await page.keyboard.press('Escape');
  await page.click('#bank-empty-clear');
  check((await page.inputValue('#bank-search')) === '' && (await view()).n === 0 && await page.locator('#bank-empty').isHidden(), '"Clear the filters" empties the bar: back to the calm page');

  console.log('3. the list under the bar: alias search, the numbers of the tags, keyboard and ARIA');
  await page.fill('#bank-search', 'abstract algebra');
  await page.waitForSelector('#bank-listbox [role=option]');
  check(/Group theory/.test(await page.locator('#bank-listbox').textContent()), 'alias "abstract algebra" proposes Algebra children');
  await page.keyboard.press('Escape');
  check(await page.locator('#bank-listbox').isHidden(), 'Escape closes the list');
  await page.fill('#bank-search', 'e');
  await page.waitForSelector('#bank-listbox [role=option]');
  const sug = await page.evaluate(() => {
    const { S, problems, cat } = window.bank;
    return [...document.querySelectorAll('#bank-listbox .bank-option')].map(o => {
      const type = S.TAG_TYPES.find(t => o.classList.contains('bank-option-' + t)), label = o.querySelector('.bank-option-label').textContent;
      const tag = type && [...cat.byType[type].values()].find(t => t.name === label);
      return { label, type, typeText: o.querySelector('.bank-option-type').textContent, typeWant: S.TYPE_LABEL[type], shown: Number(o.querySelector('.bank-option-count').textContent),
        want: tag ? S.filterProblems(problems, { ...S.emptyFilters(), [type]: [tag.slug], showMethods: true }, cat).length : -1 };
    });
  });
  check(sug.length > 3 && sug.every(s => s.typeText === s.typeWant && s.shown === s.want && s.want > 0) && new Set(sug.map(s => s.type)).size > 1,
    `every suggestion says its type and the number of problems it gives on its own (${sug.length} checked: ${sug.slice(0, 3).map(s => `${s.label} ${s.shown}`).join(', ')}, …)`);
  const emptyOrigin = await page.evaluate(() => {
    const { S, problems, cat } = window.bank, c = S.tagCounts(problems, cat);
    const t = [...cat.byType.origin.values()].find(o => !c.get('origin:' + o.slug));
    return t ? t.name : null;
  });
  if (emptyOrigin) {
    await page.fill('#bank-search', emptyOrigin);
    await page.waitForTimeout(100);
    const labels = await page.locator('#bank-listbox .bank-option-label').allTextContents();
    check(!labels.includes(emptyOrigin), `an origin no problem has ("${emptyOrigin}") is not offered`);
  } else check(true, 'every origin has a problem (an origin with none not tested)');
  await page.fill('#bank-search', 'e');
  await page.waitForSelector('#bank-listbox [role=option]');
  const aria = await page.evaluate(() => {
    const i = document.getElementById('bank-search');
    return { tabindex: document.getElementById('bank-listbox').getAttribute('tabindex'), ariaExpanded: document.querySelectorAll('#bank-listbox [role=option][aria-expanded]').length,
      nested: document.querySelectorAll('#bank-listbox [role=option] button, #bank-listbox [role=option] [tabindex]').length,
      combo: i.getAttribute('role') === 'combobox' && i.getAttribute('aria-controls') === 'bank-listbox' && i.getAttribute('aria-expanded') === 'true' };
  });
  check(aria.tabindex === '-1' && aria.ariaExpanded === 0 && aria.nested === 0 && aria.combo,
    'the bar is a combobox that controls the list; the list is not a Tab stop, and its options carry no aria-expanded and no control inside');
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id !== 'bank-listbox' && document.activeElement.id !== 'bank-search' && document.getElementById('bank-listbox').hidden),
    'Tab from the search bar leaves it (not into the scrolling list), and the list closes');
  await page.fill('#bank-search', '');
  await page.keyboard.press('Escape');

  console.log('4. the filters: a word each, its menu under it, every choice with the number of problems it would leave');
  await page.goto(`${base}/problems.html`);
  await page.waitForSelector('html[data-ready]');
  await unfoldTree(page);
  await listAll();                                // a filter narrows a list: here the whole bank's
  const diffs = await page.evaluate(() => [...window.bank.cat.byType.difficulty.values()].map(t => ({ slug: t.slug, name: t.name })));
  const nDiff = slugs => page.evaluate(s => window.bank.problems.filter(p => !p.proposed && s.includes(p.difficulty)).length, slugs);
  const menuState = () => page.evaluate(() => {
    const m = document.getElementById('bank-menu'), a = document.activeElement;
    return { open: !m.hidden, focus: a ? (a.dataset.opt || (a.dataset.filter ? `${a.className.split(' ')[0]}:${a.dataset.filter}` : a.id)) : '' };
  });
  await page.click(WORD('difficulty'));
  const m1 = await page.evaluate(() => {
    const menu = document.getElementById('bank-menu'), w = document.querySelector('.bank-filter-word[data-filter="difficulty"]');
    const mr = menu.getBoundingClientRect(), wr = w.parentElement.getBoundingClientRect();
    return { open: !menu.hidden, under: mr.top >= wr.bottom - 3 && Math.abs(mr.left - wr.left) < 1.5, expanded: w.getAttribute('aria-expanded'), label: menu.getAttribute('aria-label'),
      focus: document.activeElement.dataset.opt, first: menu.querySelector('.bank-option[data-opt]').dataset.opt };
  });
  check(m1.open && m1.under && m1.expanded === 'true' && m1.label === 'Difficulty', 'a click on Difficulty opens its menu right under it (its word aria-expanded, the menu named "Difficulty")');
  check(m1.focus === m1.first, 'the keyboard is on its first choice');
  let cs = await menuChoices('difficulty');
  check(same(cs.map(c => c.v), diffs.map(d => d.slug)) && cs.every(c => c.role === 'checkbox' && !c.on) && countsRight(cs),
    `its choices are tick boxes, each with the number of problems it would leave (${cs.map(c => `${c.v} ${c.shown}`).join(', ')})`);
  await page.keyboard.press('ArrowDown'); const down = (await menuState()).focus;
  await page.keyboard.press('ArrowUp'); const up = (await menuState()).focus;
  check(down === cs[1].v && up === cs[0].v, 'ArrowDown and ArrowUp go from one choice to the next');
  await page.keyboard.press('Escape');
  let ms = await menuState();
  check(!ms.open && ms.focus === 'bank-filter-word:difficulty' && (await page.getAttribute(WORD('difficulty'), 'aria-expanded')) === 'false', 'Escape closes it, and the keyboard is back on its word');
  await page.click(WORD('difficulty'));
  await page.click(WORD('difficulty'));
  check(!(await menuState()).open, 'a second click on the word closes it');
  await page.click(WORD('difficulty'));
  await page.click('.bank-lede');
  check(!(await menuState()).open, 'and so does a click elsewhere on the page');
  await page.click(WORD('origin'));
  await page.click(WORD('difficulty'));
  check((await menuState()).open && (await page.getAttribute('#bank-menu', 'aria-label')) === 'Difficulty' && (await page.getAttribute(WORD('origin'), 'aria-expanded')) === 'false',
    'one menu at a time: a click on another word opens its menu instead');
  await page.click(OPT(diffs[0].slug));
  let w = await word('difficulty');
  v = await view();
  const nEasy = await nDiff([diffs[0].slug]);
  check(w.text === diffs[0].name && w.on && w.label === `Difficulty: ${diffs[0].name}` && v.n === nEasy && same(v.lit, ['']),
    `a choice sets the filter: its word says what it keeps ("${w.text}"), filled, and the ${nEasy} problems it leaves are listed`);
  check((await menuState()).open && (await page.getAttribute(OPT(diffs[0].slug), 'aria-checked')) === 'true', 'the menu stays open for another choice, the choice ticked');
  check(await page.locator(CROSS('difficulty')).isVisible() && (await page.textContent('#bank-reset')) === 'Clear all', 'a filter set carries a cross, and "Clear all" shows');
  await page.click(OPT(diffs[1].slug));
  w = await word('difficulty');
  const nEasyMedium = await nDiff([diffs[0].slug, diffs[1].slug]);
  check(w.text === `${diffs[0].name}, ${diffs[1].name}` && (await view()).n === nEasyMedium && nEasyMedium > nEasy,
    `two difficulties: problems that are either ("${w.text}", ${nEasyMedium} problems)`);
  await closeMenu();
  // the numbers are what each choice would leave given everything else chosen: a topic and an origin too
  await page.click(NAME(withProblems[0]));
  await openMenu('origin');
  const firstOrigin = await page.locator('#bank-menu .bank-option[data-opt]').first().getAttribute('data-opt');
  await page.click(OPT(firstOrigin));
  await openMenu('difficulty');
  cs = await menuChoices('difficulty');
  check(countsRight(cs), `with a topic and an origin chosen too, each difficulty counts what it would leave of them (${cs.map(c => `${c.v} ${c.shown}`).join(', ')})`);
  await page.click('#bank-reset');
  check(same((await view()).area, [withProblems[0]]) && !(await word('difficulty')).on && !(await word('origin')).on, '"Clear all" clears the filters; the topic chosen stays');
  await page.click(NAME(withProblems[0]));
  const small = await page.evaluate(() => {            // a topic where some difficulty has no problem
    const { S, problems, cat } = window.bank;
    return [...cat.byType.area.values()].filter(a => !a.parent).map(a => a.slug).find(s => {
      const ps = S.filterProblems(problems, { ...S.emptyFilters(), area: [s] }, cat);
      return ps.length && [...cat.byType.difficulty.keys()].some(d => !ps.some(p => p.difficulty === d));
    });
  });
  if (small) {
    await page.click(NAME(small));
    await openMenu('difficulty');
    cs = await menuChoices('difficulty');
    check(countsRight(cs) && cs.some(c => c.none) && cs.some(c => !c.none),
      `in a small topic (${small}) a difficulty that would leave nothing steps back (bank-option-none): ${cs.filter(c => c.none).map(c => c.v).join(', ')}`);
    await closeMenu();
    await page.click(NAME(small));
  } else check(true, 'every topic has every difficulty (a choice that would leave nothing not tested)');
  await openMenu('difficulty');
  await page.click(OPT(diffs[0].slug));
  await closeMenu();
  await page.focus(CROSS('difficulty'));
  await page.keyboard.press('Enter');
  ms = await menuState();
  check(!(await word('difficulty')).on && (await page.evaluate(() => window.bank.state.filters.difficulty.length)) === 0 && ms.focus === 'bank-filter-word:difficulty' && (await page.locator(CROSS('difficulty')).count()) === 0,
    'its cross clears the filter (here from the keyboard), and the keyboard is back on its word');
  await listAll();                                // the topic let go: the origins narrow the whole bank's list
  await openMenu('origin');
  const om = await page.evaluate(() => {
    const { S, problems, cat } = window.bank, c = S.tagCounts(problems.filter(p => !p.proposed), cat);
    const offered = [...cat.byType.origin.values()].filter(t => c.get('origin:' + t.slug)), kinds = [...new Set(offered.map(t => t.kind))];
    let head = null;          // each origin under the header of its kind
    const grouped = [...document.getElementById('bank-menu').children].every(e => e.classList.contains('bank-list-header') ? ((head = e.textContent), true)
      : !e.dataset.opt || (S.ORIGIN_KIND[cat.byType.origin.get(e.dataset.opt).kind] || cat.byType.origin.get(e.dataset.opt).kind) === head);
    return { heads: [...document.querySelectorAll('#bank-menu .bank-list-header')].map(h => h.textContent), wantHeads: kinds.map(k => S.ORIGIN_KIND[k] || k), grouped,
      opts: [...document.querySelectorAll('#bank-menu .bank-option[data-opt]')].map(o => o.dataset.opt), wantOpts: kinds.flatMap(k => offered.filter(t => t.kind === k).map(t => t.slug)),
      nEmpty: cat.byType.origin.size - offered.length, names: offered.slice(0, 3).map(t => t.name), slugs: offered.slice(0, 3).map(t => t.slug) };
  });
  check(same(om.heads, om.wantHeads) && om.grouped && same(om.opts, om.wantOpts) && om.slugs.length === 3,
    `the Origin menu groups the origins by kind (${om.heads.join(', ')}), each under its header, and offers only those some problem has (the ${om.nEmpty} with none are not offered)`);
  cs = await menuChoices('origin');
  check(countsRight(cs), `each origin counts the problems it would leave, its also-in sources included (${cs.slice(0, 3).map(c => `${c.v} ${c.shown}`).join(', ')}, …)`);
  const nOrigins = slugs => page.evaluate(s => window.bank.problems.filter(p => !p.proposed && (s.includes(p.origin) || (p.alsoIn || []).some(o => s.includes(o)))).length, slugs);
  await page.click(OPT(om.slugs[0])); await page.click(OPT(om.slugs[1]));
  w = await word('origin');
  const n2 = await nOrigins(om.slugs.slice(0, 2));
  check(w.text === `${om.names[0]}, ${om.names[1]}` && (await view()).n === n2, `two origins: the word names both ("${w.text}"), the ${n2} problems from either are listed`);
  await page.click(OPT(om.slugs[2]));
  w = await word('origin');
  const n3 = await nOrigins(om.slugs);
  check(w.text === '3 origins' && w.label === 'Origin: 3 origins' && (await view()).n === n3, `a third: "${w.text}", ${n3} problems`);
  await closeMenu();
  await page.click(NAME(withProblems[0]));
  await page.fill('#bank-search', probe.word);
  await page.keyboard.press('Escape');
  await page.click('#bank-reset');
  const reset = await page.evaluate(() => ({ f: window.bank.state.filters, input: document.getElementById('bank-search').value, focus: document.activeElement && document.activeElement.dataset.filter }));
  v = await view();
  check(reset.input === '' && reset.f.text === '' && reset.f.origin.length === 0 && same(reset.f.area, [withProblems[0]]) && v.n === rootCounts[0] && (await page.locator('#bank-reset').evaluate(b => b.classList.contains('is-idle') && getComputedStyle(b).visibility === 'hidden' && b.tabIndex === -1 && b.getAttribute('aria-hidden') === 'true')) && reset.focus === 'difficulty',
    '"Clear all" clears the words and the filters, the topic stays (its whole list back); "Clear all" hides again, and the keyboard is on the first word');
  await page.click(NAME(withProblems[0]));

  console.log('4b. Solution, Years and Methods');
  await listAll();
  await openMenu('solved');
  cs = await menuChoices('solved');
  check(same(cs.map(c => c.v), ['all', 'full', 'incomplete']) && cs.every(c => c.role === 'radio') && cs[0].on && countsRight(cs),
    `the Solution menu is a choice of one (Any, Full, Incomplete), each with its number (${cs.map(c => c.shown).join(', ')})`);
  const nOf = async (k) => { await openMenu('solved'); await page.click(OPT(k)); return page.locator(ROWS).count(); };
  const nFull = await nOf('full');
  check(nFull < total && (await page.locator(`${ROWS} .bank-marker`).count()) === 0 && (await word('solved')).text === 'Full solution', `"Full solution" leaves ${nFull} problems, none marked; its word says "Full solution"`);
  const nInc = await nOf('incomplete');
  const incKinds = await page.evaluate(() => { const shown = window.bank.problems.filter(p => !p.hasSolution || p.partial); return { partial: shown.filter(p => p.partial).length, none: shown.filter(p => !p.hasSolution).length }; });
  check(nInc > 0 && (await page.locator(`${ROWS} .bank-marker-incomplete`).count()) === nInc && (await word('solved')).text === 'Incomplete solution' && incKinds.partial > 0 && incKinds.none > 0,
    `"Incomplete solution" gives the ${nInc} problems marked so: the ${incKinds.partial} with a partial solution and the ${incKinds.none} with none yet`);
  check(nFull + nInc === total, 'full + incomplete = every problem');
  await page.click(OPT('all'));
  check(!(await word('solved')).on && (await view()).n === total && (await page.getAttribute(OPT('all'), 'aria-checked')) === 'true', '"Any" lets every problem back, and the word is plain again');
  await closeMenu();
  const yrs = await page.evaluate(() => [...new Set(window.bank.problems.map(p => p.originYear).filter(y => Number.isInteger(y)))].sort((a, b) => a - b));
  await openMenu('years');
  const ends = () => page.evaluate(() => [...document.querySelectorAll('#bank-menu .bank-years span')].map(s => s.textContent));
  const handles = await page.evaluate(() => ['bank-year-lo', 'bank-year-hi'].map(id => { const e = document.getElementById(id); return e && `${e.type} ${e.getAttribute('aria-label')}`; }));
  check(same(await ends(), [String(yrs[0]), String(yrs.at(-1))]) && same(handles, ['range Origin year from', 'range Origin year to']),
    `the Years menu has two handles over the years of the bank (${yrs[0]} – ${yrs.at(-1)})`);
  await page.focus('#bank-year-lo');
  for (let k = 0; k < yrs.length - 3; k++) await page.keyboard.press('ArrowRight');
  const from = yrs[yrs.length - 3];
  const nYear = await page.evaluate(y => window.bank.problems.filter(p => !p.proposed && (!Number.isInteger(p.originYear) || p.originYear >= y)).length, from);
  w = await word('years');
  check((await page.locator(ROWS).count()) === nYear && w.text === `${from} – ${yrs.at(-1)}` && w.on && (await ends())[0] === String(from),
    `moving "from" to ${from}: ${nYear} problems, undated ones kept; the word says "${w.text}"`);
  check((await address()).includes(`y=${from}-`), 'the year range is in the URL');
  await page.keyboard.press('Home');
  check((await page.locator(ROWS).count()) === total && !(await address()).includes('y=') && !(await word('years')).on, 'back at the start: no year filter, every problem again');
  await closeMenu();
  const M = await page.evaluate(() => {                // a method that some problem has
    const { S, problems, cat } = window.bank, c = S.tagCounts(problems.filter(p => !p.proposed), cat);
    const t = [...cat.byType.methods.values()].find(m => c.get('methods:' + m.slug));
    return { slug: t.slug, name: t.name, n: c.get('methods:' + t.slug) };
  });
  await openMenu('methods');
  let mm = await page.evaluate(() => ({ sw: (e => e && e.checked)(document.getElementById('bank-show-methods')), pdf: !!document.getElementById('bank-methods-pdf'),
    choices: document.querySelectorAll('#bank-menu .bank-option').length, note: (e => e && e.textContent)(document.querySelector('#bank-menu .bank-menu-note')) }));
  check(mm.sw === false && !mm.pdf && mm.choices === 0 && !!mm.note, `methods off: the Methods menu holds a note ("${mm.note}") and the "Show the methods" switch, no method to choose, no "Also in the PDFs"`);
  await closeMenu();
  await page.fill('#bank-search', M.name);
  await page.waitForSelector('#bank-listbox .bank-list-header');
  check((await page.locator('#bank-listbox .bank-option-methods').count()) === 0 && (await page.locator(`${ROWS} .bank-chip-methods:visible`).count()) === 0,
    `methods off: "${M.name}" typed suggests no method, and the rows show none`);
  await page.fill('#bank-search', ''); await page.keyboard.press('Escape');
  await openMenu('methods');
  await page.check('#bank-show-methods');
  check((await page.locator(`${ROWS} .bank-chip-methods:visible`).count()) > 0, 'methods appear in the rows when "Show the methods" is on');
  check(await page.locator('#bank-methods-pdf').isVisible() && !(await page.isChecked('#bank-methods-pdf')), '"Also in the PDFs" appears under it, off');
  mm = await page.evaluate(() => {
    const { S, problems, cat } = window.bank, c = S.tagCounts(problems.filter(p => !p.proposed), cat);
    return { heads: [...document.querySelectorAll('#bank-menu .bank-list-header')].map(h => h.textContent),
      want: [...new Set([...cat.byType.methods.values()].filter(m => c.get('methods:' + m.slug)).map(m => m.group))] };
  });
  cs = await menuChoices('methods');
  check(same(mm.heads, mm.want) && countsRight(cs), `then the methods by group (${mm.heads.join(', ')}), each with its number of problems`);
  w = await word('methods');
  check(w.text === 'Methods shown' && w.on, 'the word says "Methods shown"');
  await closeMenu();
  await page.fill('#bank-search', M.name);
  await page.waitForSelector('#bank-listbox .bank-option-methods');
  await page.locator('#bank-listbox .bank-option-methods').first().click();
  const nM = await page.locator(ROWS).count();
  w = await word('methods');
  check(same(await page.evaluate(() => window.bank.state.filters.methods), [M.slug]) && w.text === M.name && nM === M.n && nM < total,
    `"Show the methods" on: "${M.name}" typed suggests it; picked, it filters by it (${nM} problems) and the word names it`);
  const M2 = await page.evaluate(first => {              // a second method with a problem the first does not have
    const { problems, cat } = window.bank;
    const t = [...cat.byType.methods.values()].find(m => m.slug !== first && problems.some(p => !p.proposed && p.methods.includes(m.slug) && !p.methods.includes(first)));
    const slugs = [first, t.slug];
    return { slug: t.slug, names: [...cat.byType.methods.values()].filter(m => slugs.includes(m.slug)).map(m => m.name).join(', '),
      n: problems.filter(p => !p.proposed && p.methods.some(m => slugs.includes(m))).length };
  }, M.slug);
  await openMenu('methods');
  await page.click(OPT(M2.slug));
  const nM2 = await page.locator(ROWS).count();
  check(nM2 === M2.n && nM2 > nM && (await word('methods')).text === M2.names, `a second method widens the list: either will do (${nM} → ${nM2} problems, "${M2.names}")`);
  await page.uncheck('#bank-show-methods');
  check((await page.locator(`${ROWS} .bank-chip-methods:visible`).count()) === 0, 'methods hidden again');
  await page.waitForFunction(() => !/[?&]m=/.test(location.search), null, { timeout: 3000 }).catch(() => {});     // the address follows 150 ms later
  w = await word('methods');
  check(!w.on && w.text === 'Methods' && (await page.locator(ROWS).count()) === total && !/[?&]m=/.test(page.url()) && (await page.evaluate(() => window.bank.state.filters.methods.length)) === 0,
    '"Show the methods" off drops the method filter: the word is plain, every problem is back, no m= in the address');
  check((await page.locator('#bank-methods-pdf').count()) === 0, '"Also in the PDFs" goes with it');
  await closeMenu();
  await page.click(NAME(''));

  console.log('4c. one rule: inside one filter any choice will do, every filter set must hold; old links; the tags of a row');
  await page.goto(`${base}/problems.html?op=and&a=analysis,algebra`);
  await page.waitForSelector(ROWS);
  const either = await under(['analysis', 'algebra']);
  v = await view();
  check(same(v.ids, either) && v.count === `${either.length} problems in Analysis and Algebra` && same(v.lit, ['analysis', 'algebra']),
    `an old link with op=and and two topics lists the problems of either (${either.length}), both names lit`);
  check((await address()) === '?a=analysis,algebra', 'its op= is dropped from the address');
  await page.goto(`${base}/problems.html?d=${diffs[0].slug},${diffs[1].slug}&o=${om.slugs[0]}`);
  await page.waitForSelector('html[data-ready]');
  v = await view();
  check(v.n === 0 && !v.lit.length && (await word('origin')).on, 'a link with filters alone lists nothing: they are set, and narrow the numbers of the tree');
  await page.goto(`${base}/problems.html?a=*&d=${diffs[0].slug},${diffs[1].slug}&o=${om.slugs[0]}`);
  await page.waitForSelector(ROWS);
  const mixed = await page.evaluate(([d, o]) => window.bank.problems.filter(p => !p.proposed && d.includes(p.difficulty) && (p.origin === o || (p.alsoIn || []).includes(o))).map(p => p.id),
    [[diffs[0].slug, diffs[1].slug], om.slugs[0]]);
  check(same((await view()).ids, mixed) && mixed.length > 0, `two difficulties and an origin: the problems that are ${diffs[0].name.toLowerCase()} or ${diffs[1].name.toLowerCase()}, and from ${om.names[0]} (${mixed.length})`);
  await page.goto(`${base}/problems.html`);
  await listAll();
  const pick = await page.evaluate(() => {               // a row whose first topic is a sub-topic
    const { byId, cat } = window.bank;
    for (const li of document.querySelectorAll('#bank-results > li:not([hidden])')) {
      const a = byId.get(Number(li.dataset.id)).area[0];
      if (a && (cat.ancestors.get(a) || []).length) return { id: Number(li.dataset.id), slug: a, path: cat.ancestors.get(a) };
    }
    return null;
  });
  await page.locator(`#bank-results > li[data-id="${pick.id}"] .bank-chip-area`).first().click();
  v = await view();
  const opened = await page.evaluate(path => path.every(s => document.querySelector(`#bank-tree-topics .tt-tg[data-for="${s}"]`)?.getAttribute('aria-expanded') === 'true'), pick.path);
  check(same(v.lit, [pick.slug]) && same(v.area, [pick.slug]) && opened && await page.locator(NAME(pick.slug)).isVisible() && v.n === (await under([pick.slug])).length,
    'an Area tag on a row chooses that topic in the tree, which unfolds to it');
  const tagOf = (sel, field) => page.evaluate(([sel, field]) => {
    const chip = [...document.querySelectorAll(`#bank-results > li:not([hidden]) ${sel}`)][0];
    if (!chip) return null;
    const p = window.bank.byId.get(Number(chip.closest('li').dataset.id)), slug = field === 'methods' ? p.methods[0] : p[field];
    chip.closest('li').setAttribute('data-picked', '');
    return { slug, name: window.bank.cat.byType[field].get(slug).name };
  }, [sel, field]);
  const oc = await tagOf('.bank-chip-origin', 'origin');
  await page.locator('#bank-results > li[data-picked] .bank-chip-origin').first().click();
  check(same(await page.evaluate(() => window.bank.state.filters.origin), [oc.slug]) && (await word('origin')).text === oc.name && same((await view()).area, [pick.slug]),
    `an Origin tag on a row joins the Origin filter ("${oc.name}"), the topic stays`);
  await page.evaluate(() => document.querySelectorAll('[data-picked]').forEach(e => e.removeAttribute('data-picked')));
  const dc = await tagOf('.bank-chip-difficulty.bank-chip-clickable', 'difficulty');
  if (dc) {
    await page.locator('#bank-results > li[data-picked] .bank-chip-difficulty').first().click();
    check(same(await page.evaluate(() => window.bank.state.filters.difficulty), [dc.slug]) && (await word('difficulty')).text === dc.name, `a Difficulty tag (a human rating) joins the Difficulty filter ("${dc.name}")`);
  } else check(true, 'no rated problem left in this list (a Difficulty tag not tested)');
  await page.click('#bank-reset');
  await page.evaluate(() => document.querySelectorAll('[data-picked]').forEach(e => e.removeAttribute('data-picked')));
  await openMenu('methods'); await page.check('#bank-show-methods'); await closeMenu();
  const mc = await tagOf('.bank-chip-methods', 'methods');
  await page.locator('#bank-results > li[data-picked] .bank-chip-methods').first().click();
  check(same(await page.evaluate(() => window.bank.state.filters.methods), [mc.slug]) && await page.evaluate(() => window.bank.state.filters.showMethods) && (await word('methods')).text === mc.name,
    `a Methods tag joins the Methods filter ("${mc.name}"), the methods shown`);
  await page.click('#bank-reset');
  await page.evaluate(() => document.querySelectorAll('[data-picked]').forEach(e => e.removeAttribute('data-picked')));

  console.log('4d. the Origin filter explains its matches: also-in sources show in the rows');
  await listAll();
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
  } else check(true, 'no problem has an also-in source other than its origin (the "Also in" chips not tested)');

  console.log('5. select all, a link that ticks 20 problems, Create → problems PDF, solutions PDF on request');
  check(engineRequests.length === 0, 'after typing, filtering and browsing, still nothing of the LaTeX engine is downloaded');
  await page.goto(`${base}/problems.html`);
  await page.waitForSelector('html[data-ready]');
  await page.fill('#bank-search', probe.word);
  await page.keyboard.press('Enter');                                   // the tag list floats over the results: close it
  const nWord = await page.locator(ROWS).count();
  const manifest = page.waitForRequest(/\/static\/busytex\/manifest\.json/, { timeout: 3000 }).catch(() => {});
  await page.click('#bank-select-all');
  check((await page.evaluate(() => window.bank.state.selection.size)) === nWord, `select all ticks the ${nWord} listed problem(s)`);
  await manifest;
  check(engineRequests.some(u => u.endsWith('manifest.json')), 'ticking problems starts fetching the engine');
  await page.click('#bank-clear-selection');
  await page.fill('#bank-search', '');
  await page.goto(`${base}/problems.html?sel=${range(0, 19)}`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  const n20 = await page.evaluate(() => window.bank.state.selection.size);
  check(n20 === 20, `a link with sel=${range(0, 19)} ticks ${n20} problems`);
  const calm = await page.evaluate(() => ({ count: document.getElementById('bank-count').hidden, all: document.getElementById('bank-select-all-wrap').hidden }));
  check((await page.locator(ROWS).count()) === 0 && (await page.textContent('#bank-selected-count')) === '20 selected' && calm.count && calm.all,
    'a link with ticked problems only: the page stays calm, the head of the list says "20 selected" (no count, no Select all)');
  check(!(await page.locator('#bank-create').isDisabled()), 'Create enabled');
  const urlBefore = await page.evaluate(() => location.href);
  const autoIds = await page.evaluate(() => window.bank.pdfOrder());
  const expectAuto = await page.evaluate(() => window.bank.S.autoOrder([...window.bank.state.selection], window.bank.byId, window.bank.cat));
  check(same(autoIds, expectAuto) && autoIds.length === n20, `PDF order is automatic: ${autoIds.join(',')}`);
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
  const busyFocus = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, aria: document.getElementById('bank-create').getAttribute('aria-disabled'),
    order: document.getElementById('bank-order-btn').hidden, cancel: !document.getElementById('bank-cancel').hidden }));
  await waitPdf('problems');
  check(busyFocus.id === 'bank-create' && busyFocus.aria === 'true', 'while it works, Create keeps the focus (aria-disabled, not disabled)');
  check(busyFocus.order && busyFocus.cancel, 'and Cancel takes the place of "PDF order"');
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest('#bank-out-problems'), null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('#bank-out-problems'))), 'when the PDF is ready, focus moves to it');
  check(await page.evaluate(() => window.bank.output.solutions === null) && (await page.locator('#bank-out-solutions a[download$=".pdf"]').count()) === 0,
    'Create builds the problem set alone: the solutions PDF is not compiled');
  check((await page.textContent('#bank-status')).trim() === '' && (await page.textContent('#bank-announce')) === 'The PDF is ready.', 'the status line goes quiet once the PDF is there; a screen reader is told it is ready');
  check(!(await page.locator('#bank-order-btn').isHidden()) && await page.locator('#bank-cancel').isHidden(), 'the PDF made, "PDF order" is back and Cancel gone');
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
  check((await page.textContent('#bank-make-solutions')) === 'Build the PDF with the solutions', 'the solutions are offered under the PDF ("Build the PDF with the solutions")');
  await askSolutions();
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest('#bank-out-solutions'), null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('#bank-out-solutions'))), 'the solutions PDF ready: focus moves to it');
  const out = await page.evaluate(() => {
    const o = window.bank.output;
    return { p: { ids: o.problems.ids, tex: o.problems.mainTex }, s: { ids: o.solutions.ids, tex: o.solutions.mainTex } };
  });
  out.p.bytes = await pdfBytes('problems'); out.s.bytes = await pdfBytes('solutions');
  check(out.p.ids.length === n20 && out.s.ids.length === n20, 'both PDFs were built for the ticked problems');
  check(same(out.p.ids, autoIds), 'the problems PDF follows the automatic order');
  check(String.fromCharCode(...out.p.bytes.slice(0, 5)) === '%PDF-' && String.fromCharCode(...out.s.bytes.slice(0, 5)) === '%PDF-', 'both outputs are PDFs');
  check((out.p.tex.match(/\\bankproblem\{/g) || []).length === n20, `problems .tex has ${n20} problem headings`);
  check(out.s.tex.includes('\\begin{solution}') || out.s.tex.includes('\\banknosolution'), 'solutions .tex has solutions or "No complete solution yet" markers');
  check(!/\\today/.test(out.p.tex + out.s.tex), 'no \\today in the generated documents');
  check(!/Selection:/.test(out.p.tex + out.s.tex), 'the cover prints no "Selection" line (no filters, no typed text)');
  const cited = await page.evaluate(async (ids) => {                            // shared results (problem-bank/appendix/)
    const b = await window.bank.C.loadBodies();
    return window.bank.C.appendixOrder(ids.map(i => b[String(i).padStart(4, '0')]), window.bank.C.loadedAppendix());
  }, out.s.ids);
  const items = [...out.s.tex.matchAll(/^\\bankappendixitem\{([a-z0-9-]+)\}$/gm)].map(m => m[1]);
  check(same(items, cited) && !out.p.tex.includes('\\bankappendix'),
    `the solutions PDF ends with the shared results its solutions cite (${cited.join(', ') || 'none'}), the problems PDF with none`);
  const dir = mkdtempSync(join(tmpdir(), 'bank-e2e-'));
  for (const [v, r] of [['problems', out.p], ['solutions', out.s]]) {
    const f = join(dir, `${v}.pdf`);
    writeFileSync(f, Buffer.from(r.bytes));
    const py = spawnSync('python3', [CHECK_PDF, f, String(n20), String(v === 'solutions' ? cited.length : 0)], { encoding: 'utf8' });
    console.log('   ' + (py.stdout || py.stderr).trim());
    check(py.status === 0, `${v} PDF has the headings "Problem 1." … "Problem ${n20}."${v === 'solutions' && cited.length
      ? ` and an Appendix A.1 … A.${cited.length}` : ''}, prints no problem number and no ?? reference`);
    check(same(texIds(r.tex), autoIds), `${v} PDF lists the problems in the automatic order`);
  }
  check((await page.locator('#bank-out-problems a', { hasText: 'Download .tex' }).count()) === 1, 'Download .tex offered');
  // methods shown on screen are not printed: "Also in the PDFs" decides (a teacher searches by method, the sheet keeps it quiet)
  const nWithMethods = await page.evaluate(ids => ids.filter(i => window.bank.byId.get(i).methods.length).length, autoIds);
  const createAgain = async () => {
    await page.evaluate(() => { document.getElementById('bank-announce').textContent = ''; });
    await page.click('#bank-create');
    await page.waitForFunction(() => document.getElementById('bank-announce').textContent === 'The PDF is ready.', null, { timeout: 240000 });
    return page.evaluate(() => (window.bank.output.problems.mainTex.match(/\\bankmethods\{/g) || []).length);
  };
  await openMenu('methods');
  await page.check('#bank-show-methods');
  const shownOnly = await createAgain();
  await openMenu('methods');
  await page.check('#bank-methods-pdf');
  const printed = await createAgain();
  check(shownOnly === 0 && printed === nWithMethods && nWithMethods > 0,
    `"Show the methods" on: the PDF still has no method; with "Also in the PDFs" too, the ${nWithMethods} problems with methods show them`);
  await openMenu('methods');
  await page.uncheck('#bank-show-methods');
  await closeMenu();

  console.log('5b. the statement of one problem, drawn under its title');
  {
    // a phone on a first visit: the statement as the build typeset it, with neither the LaTeX engine (some 16 MB) nor the
    // problem texts, at the size of the page's own text (within 5 %: the nearest of the build's measures, drawn to fill)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const t = await ctx.newPage();
    watch(t);
    const asked = [];
    t.on('request', r => asked.push(new URL(r.url()).pathname));
    await t.goto(`${base}/problems.html`);
    await listAll(t);
    await t.evaluate(() => { window.__drawnAt = null; new MutationObserver((_, o) => { if (document.querySelector('.bank-preview-panel .bank-sheet canvas')) { window.__drawnAt = performance.now(); o.disconnect(); } })
      .observe(document.getElementById('bank-results'), { subtree: true, childList: true }); });
    const t0 = Date.now();
    await t.locator(ROWS).first().locator('.bank-row-title').click();
    await t.waitForSelector('.bank-preview-panel .bank-sheet canvas', { timeout: 60000 });
    const ms = Date.now() - t0;
    await t.waitForTimeout(300);                          // what is fetched for a Create comes after the statement
    const drawn = await t.evaluate(() => {
      const panel = document.querySelector('.bank-preview-panel'), layer = panel.querySelector('.textLayer');
      const pxPerPt = (parseFloat(getComputedStyle(document.body).fontSize) || 18) / 10.95;
      const before = performance.getEntriesByType('resource').filter(e => e.startTime < window.__drawnAt).map(e => new URL(e.name).pathname);
      return { by: panel.dataset.typeset, size: parseFloat(layer.style.getPropertyValue('--total-scale-factor')) / pxPerPt, words: layer.textContent.trim().length, before };
    });
    check(drawn.by === 'build' && drawn.words > 10 && drawn.before.some(u => u.includes('/static/bank/previews/')) && !drawn.before.some(u => u.includes('/busytex/') || u.endsWith('/bodies.json'))
      && !asked.some(u => u.includes('/busytex/')),
      `on a phone, a first statement comes typeset by the build, in ${ms} ms: no LaTeX engine (none at all on a phone until a Create), no problem texts before it`);
    check(drawn.size > .94 && drawn.size < 1.06, `drawn at the size of the page's own text, within 5 % (${drawn.size.toFixed(3)})`);
    await ctx.close();
  }
  {
    // the build's previews out of reach: the page typesets the statement itself, as before
    const ctx = await browser.newContext();
    const t = await ctx.newPage();
    watch(t);
    await t.route('**/static/bank/previews/**', r => r.abort());
    await t.goto(`${base}/problems.html`);
    await listAll(t);
    const quiet = t.evaluate(() => new Promise(res => { const seen = []; const o = new MutationObserver(() => { const s = document.querySelector('.bank-preview-panel [role="status"]'); if (s && s.textContent) seen.push(s.textContent); });
      o.observe(document.getElementById('bank-results'), { subtree: true, childList: true, characterData: true }); setTimeout(() => { o.disconnect(); res(seen); }, 400); }));
    await t.locator(ROWS).first().locator('.bank-row-title').click();
    await t.waitForSelector('.bank-preview-panel .bank-sheet canvas', { timeout: 240000 });
    const by = await t.evaluate(() => document.querySelector('.bank-preview-panel').dataset.typeset);
    check(by === 'browser', 'the previews of the build out of reach: the statement is typeset in the browser, as before');
    const said = await quiet;
    check(said.every(w => /Compiling this problem…|Opening the statement…|engine/i.test(w)), `and the panel says what it waits for (${[...new Set(said)].join(' / ') || 'nothing in 400 ms'})`);
    await ctx.close();
    consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter(e => !/static\/bank\/previews|ERR_FAILED|Failed to load resource/.test(e)));   // the blocked requests themselves
  }
  await listAll();
  const firstRow = page.locator(ROWS).first();
  const firstTitle = (await firstRow.locator('.bank-title').textContent()).trim();
  const titleBtn = firstRow.locator('.bank-row-title');
  const chev = () => titleBtn.locator('.chev').evaluate(c => getComputedStyle(c).transform);
  const chevShut = await chev();
  const nLi = await page.locator('#bank-results > li').count();
  await titleBtn.click();
  check((await page.locator('#bank-results .bank-preview-panel').count()) === 1 && (await titleBtn.getAttribute('aria-expanded')) === 'true', 'a click on a title opens its statement under it');
  await page.waitForSelector('.bank-preview-panel .bank-sheet canvas', { timeout: 240000 });
  const prev = await page.evaluate(async () => {
    const btn = document.querySelector('#bank-results > li:not([hidden]) .bank-row-title');
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    const c = panel.querySelector('.bank-sheet canvas'), px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i]) ink++;
    const text = panel.querySelector('.textLayer').textContent;
    return { ink, words: text.trim().length, text, hidden: c.getAttribute('aria-hidden'),
      chrome: panel.querySelectorAll('a, iframe, button').length, tex: window.bank.C.makePreview(await window.bank.C.loadBodies(), window.bank.state.results[0].id),
      name: btn.textContent.trim(), tip: btn.title, inRow: !!panel && panel.parentElement === btn.closest('li') };
  });
  check(prev.ink > 1000 && prev.words > 10 && prev.hidden === 'true' && prev.chrome === 0,
    `the statement is drawn into the page (${prev.ink} inked pixels; its ${prev.words} characters selectable and read aloud from the text layer): no frame, no link, no button`);
  check(prev.tex.includes('\\begin{problem}') && !prev.tex.includes('\\begin{solution}') && !prev.tex.includes('\\Large'),
    'the preview document has the statement only: no solution, no title (its row shows it)');
  check(prev.name === firstTitle && prev.inRow && (await page.locator('#bank-results > li').count()) === nLi,
    `what opens it is the problem's title ("${prev.name}"), and the statement sits inside its row (no extra list item)`);
  check((await chev()) !== chevShut && prev.tip === '', 'an open statement: the chevron of its title turns, and no hover text');
  check(noNumber(prev.text), 'the statement prints no problem number');
  await titleBtn.click();
  await page.waitForFunction(() => !document.querySelector('.bank-preview-panel'), null, { timeout: 3000 }).catch(() => {});
  check((await page.locator('.bank-preview-panel').count()) === 0 && (await titleBtn.getAttribute('aria-expanded')) === 'false' && (await chev()) === chevShut,
    'a second click on the title folds it away, and the chevron turns back');
  // abandoned previews are cancelled (bank-compile.js drops a job whose signal is aborted before it starts)
  const rowsIds = await page.evaluate(() => window.bank.state.results.slice(1, 6).map(p => p.id));
  for (const id of rowsIds) await page.click(`#bank-results li[data-id="${id}"] .bank-row-title`);
  await page.waitForSelector('.bank-preview-panel .bank-sheet canvas', { timeout: 240000 });
  check((await page.locator('.bank-preview-panel').count()) === 1 && (await page.locator(`#bank-results li[data-id="${rowsIds[4]}"] .bank-preview-panel`).count()) === 1
    && (await page.locator('#bank-results .bank-row-title[aria-expanded="true"]').count()) === 1,
    'five titles clicked in a row: only the last statement stays open');
  await page.click(`#bank-results li[data-id="${rowsIds[4]}"] .bank-row-title`);

  console.log('6. shareable URL restores filters and selection; the back button; second Create is served from cache');
  {
    await page.goto(`${base}/index.html`);
    await page.goto(`${base}/problems.html?a=analysis`);
    await page.waitForSelector(ROWS);
    const length0 = await page.evaluate(() => history.length);
    await page.click(NAME('algebra'));
    await openMenu('difficulty');
    await page.click(OPT(diffs[0].slug));
    await closeMenu();
    const a6 = await address();
    const length1 = await page.evaluate(() => history.length);
    const want6 = await page.evaluate(d => { const { S, problems, cat } = window.bank; return S.filterProblems(problems, { ...S.emptyFilters(), area: ['algebra'], difficulty: [d] }, cat).map(p => p.id); }, diffs[0].slug);
    check(a6 === `?a=algebra&d=${diffs[0].slug}` && length1 === length0, `choosing a topic and a filter changes the address (${a6}) but adds nothing to the history of the tab`);
    await page.goBack();
    check(/\/index\.html$/.test(page.url()), 'one Back leaves the page');
    await page.goForward();
    await page.waitForSelector(ROWS);
    v = await view();
    check(same(v.ids, want6) && same(v.lit, ['algebra']) && (await word('difficulty')).text === diffs[0].name, `Forward comes back to the same list (${want6.length} problems), its topic and its filter`);
  }
  await page.goto(urlBefore);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  check(await page.evaluate(() => window.bank.state.selection.size) === n20, 'selection restored from the URL');
  await page.click('#bank-create');
  await waitPdf('problems');
  await askSolutions();
  const cached = await page.evaluate(() => window.bank.output.problems.fromCache && window.bank.output.solutions.fromCache);
  check(cached, 'same selection → PDFs come from the cache');
  const h1 = [await sha(out.p.bytes), await sha(out.s.bytes)];
  const hSame = [await sha(await pdfBytes('problems')), await sha(await pdfBytes('solutions'))];
  check(hSame[0] === h1[0] && hSame[1] === h1[1], 'same URL → byte-identical PDFs');

  console.log('7. PDF order by hand: arrows, drag, URL, reset');
  check(await page.locator('#bank-order').isHidden(), 'the order panel is closed by default');
  check((await page.textContent('#bank-order-btn')) === 'PDF order', 'its button says "PDF order"');
  await page.click('#bank-order-btn');
  const rowIds = async () => page.$$eval('#bank-order-list li', lis => lis.map(li => Number(li.dataset.id)));
  check(same(await rowIds(), autoIds) && (await page.getAttribute('#bank-order-btn', 'aria-expanded')) === 'true', 'the order panel lists the ticked problems in the automatic order');
  check(noNumber(await page.locator('#bank-order-list').textContent()), 'the order panel shows titles and places, no problem number');
  check(await page.locator('#bank-order-reset').isDisabled(), '"Back to automatic order" is disabled while the order is automatic');
  await page.click('#bank-order-list li:first-child .bank-order-down');
  let want = [autoIds[1], autoIds[0], ...autoIds.slice(2)];
  check(same(await rowIds(), want), '↓ moves the first problem one place down');
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('bank-order-down')), 'focus stays on the moved row (keyboard use)');
  const h3 = await page.locator('#bank-order-list li:nth-child(3) .bank-order-handle').boundingBox();
  const r1 = await page.locator('#bank-order-list li:nth-child(1)').boundingBox();
  await page.mouse.move(h3.x + h3.width / 2, h3.y + h3.height / 2);
  await page.mouse.down();
  await page.mouse.move(h3.x + h3.width / 2, r1.y + 3, { steps: 8 });
  await page.mouse.up();
  want = [want[2], want[0], want[1], ...want.slice(3)];
  check(same(await rowIds(), want), 'dragging the third problem to the top reorders the list');
  check(same(await page.evaluate(() => window.bank.pdfOrder()), want), 'the PDF order follows the drag');
  const wantSel = await page.evaluate(ids => window.bank.S.formatIdList(ids), want);
  await page.waitForFunction(sel => location.search.includes('sel=' + sel + '&ord=manual'), wantSel, { timeout: 5000 }).catch(() => {});
  const manualUrl = await page.evaluate(() => location.href);
  check(new URL(manualUrl).search.includes(`sel=${wantSel}&ord=manual`), `the URL keeps the hand-made order (${new URL(manualUrl).search})`);
  await page.goto(manualUrl);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  check(same(await page.evaluate(() => window.bank.pdfOrder()), want), 'reloading the URL restores the hand-made order');
  check((await page.textContent('#bank-order-btn')) === 'PDF order: yours', 'the order button says the order is yours ("PDF order: yours")');
  await page.click('#bank-create');
  await waitPdf('problems'); await askSolutions();
  const man = await page.evaluate(() => { const o = window.bank.output; return { ids: o.problems.ids, fromCache: o.problems.fromCache, pt: o.problems.mainTex, st: o.solutions.mainTex }; });
  man.p = await pdfBytes('problems'); man.s = await pdfBytes('solutions');
  check(same(man.ids, want) && !man.fromCache, 'the PDFs are compiled in the hand-made order (not the cached automatic ones)');
  const dir2 = mkdtempSync(join(tmpdir(), 'bank-e2e-order-'));
  for (const [v, bytes, tex] of [['problems', man.p, man.pt], ['solutions', man.s, man.st]]) {
    const f = join(dir2, `${v}.pdf`);
    writeFileSync(f, Buffer.from(bytes));
    const results = (tex.match(/^\\bankappendixitem\{/gm) || []).length;          // the same results, maybe reordered
    const py = spawnSync('python3', [CHECK_PDF, f, String(n20), String(results)], { encoding: 'utf8' });
    console.log('   ' + (py.stdout || py.stderr).trim());
    check(py.status === 0, `${v} PDF has its ${n20} headings${results ? ` and its ${results} shared result(s)` : ''}, no problem number, no ??`);
    check(same(texIds(tex), want), `${v} PDF follows the hand-made order`);
  }
  await page.click('#bank-order-btn');
  await page.click('#bank-order-reset');
  check(same(await rowIds(), autoIds) && (await page.textContent('#bank-order-btn')) === 'PDF order', '"Back to automatic order" restores the automatic order, and the button says "PDF order" again');
  await page.waitForFunction(() => !location.search.includes('ord='), null, { timeout: 5000 }).catch(() => {});
  check(!(await page.evaluate(() => location.search)).includes('ord='), 'and removes ord= from the URL');
  await listAll();
  await page.locator(`${ROWS} .bank-check`).first().click();          // untick one: the panel follows
  check((await rowIds()).length === n20 - 1, 'unticking a problem removes it from the order panel');

  console.log('7b. after Create, changing the ticks withdraws the solutions offer');
  await page.goto(`${base}/problems.html?sel=${range(0, 2)}`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  await page.click('#bank-create');
  await waitPdf('problems');
  check(await page.locator('#bank-make-solutions').isVisible(), 'the solutions are offered for the PDF on screen');
  await listAll();
  await page.locator(`${ROWS} .bank-check`).nth(5).click();
  check(await page.locator('#bank-out-solutions').isHidden() && (await page.locator('#bank-make-solutions').count()) === 0,
    'one more tick: the offer is gone (Create PDF again makes a matching pair)');

  console.log('7c. Cancel a PDF that never ends; after a failed compile, reset the engine; plain error messages');
  {
    const ctx = await browser.newContext();
    await ctx.route(/\/static\/bank\/bodies\.json/, async r => {
      const res = await r.fetch(); const j = await res.json();
      j.problems[pad(IDS[0])].statement = '\\def\\bankloop{\\bankloop}\\bankloop';            // pdfTeX never ends
      j.problems[pad(IDS[1])].statement = 'Broken: \\undefinedcontrolsequencexyz.';        // a LaTeX error
      await r.fulfill({ response: res, json: j });
    });
    const p7 = await ctx.newPage();
    await p7.goto(`${base}/problems.html?sel=${IDS[0]}`);
    await p7.waitForSelector('#bank-results-head:not([hidden])');
    await p7.click('#bank-create');
    check(await p7.locator('#bank-cancel').isVisible() && await p7.locator('#bank-order-btn').isHidden(), 'while the PDF is made, a Cancel button shows (in the place of "PDF order")');
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
    await p7.goto(`${base}/problems.html?sel=${IDS[1]}`);
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
    await p8.goto(`${base}/problems.html?sel=${IDS[0]}`);
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
    'both PDFs build with the topic "Arithmetic functions (φ, σ, τ, …)" chosen');
  await page.goto(`${base}/problems.html?q=zqx%5E%7B%7D%5Cinput%7Bzqy%7D&sel=${IDS[0]},${IDS[1]}`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  await page.click('#bank-create');
  await waitPdf('problems');
  check(await page.evaluate(() => !!window.bank.output.problems.pdf && !/zqy|Selection:/.test(window.bank.output.problems.mainTex)),
    'a link with LaTeX in its search text (q=zqx^{}\\input{zqy}) builds a clean PDF: the text never reaches the document');
  await page.goto(`${base}/problems.html?q=%E2%88%91`);
  await page.waitForSelector('html[data-ready]');
  v = await view();
  check(v.n === 0 && !v.head && !v.lit.length && await page.locator('#bank-tree-topics').isVisible(), 'a link whose search is symbols only (q=∑) opens the calm page');
  const huge = Array.from({ length: 200 }, (_, i) => `${i * 100000}-${i * 100000 + 99999}`).join(',');
  await page.goto(`${base}/problems.html?sel=${huge}&ord=manual`);
  await page.waitForSelector('#bank-results-head:not([hidden])', { timeout: 15000 });
  await listAll();
  check((await page.locator(ROWS).count()) === total, 'a crafted ?sel= link with millions of IDs still gives a working page');
  await page.goto(`${base}/problems.html?sel=${range(0, 29)}`);
  await page.waitForSelector('#bank-results-head:not([hidden])');
  await page.click('#bank-order-btn');
  const lastId = await page.evaluate(() => {
    const l = document.getElementById('bank-order-list');
    l.scrollIntoView({ block: 'center', behavior: 'instant' });  // the whole list on screen
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
    await p2.goto(`${base}/problems.html?sel=${IDS[0]},${IDS[1]}`);
    await p2.waitForSelector('#bank-results-head:not([hidden])');
    await p2.click('#bank-create');
    await p2.waitForSelector('#bank-out-problems iframe.bank-pdf', { timeout: 240000 });
    await listAll(p2);
    await p2.locator(ROWS).first().locator('.bank-row-title').click();
    await p2.waitForSelector('.bank-preview-panel .bank-sheet canvas', { timeout: 240000 });
    check(await p2.evaluate(() => [...document.querySelectorAll('iframe.bank-pdf')].every(f => f.src.startsWith('blob:'))) && (await p2.locator('#bank-out-problems a', { hasText: 'Open PDF' }).count()) === 1
      && (await p2.locator('.bank-preview-panel iframe, .bank-preview-panel a').count()) === 0,
      'the problems PDF shows in a frame, with Open PDF / Download PDF; the statement is drawn into the page (PDF.js, under the CSP)');
    await ctx.close();
  }

  console.log('10. layout at 360 px and in dark mode; the theme; a phone');
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));      // what the old site saved on every visit
    const p3 = await ctx.newPage();
    watch(p3);
    const logos = [];
    p3.on('request', r => { if (/club_logo|janestreet/.test(r.url())) logos.push(r.url().split('/').pop()); });
    await p3.goto(`${base}/problems.html?sm=1`);
    await p3.waitForSelector('html[data-ready]');
    const phone = () => p3.evaluate(() => {
      const f = document.getElementById('bank-filters'), a = document.getElementById('bank-actions'), r = a.getBoundingClientRect();
      return { line: new Set([...document.querySelectorAll('#bank-filters .bank-filter')].map(e => Math.round(e.getBoundingClientRect().top))).size === 1,
        slides: getComputedStyle(f).overflowX === 'auto' && f.scrollWidth > f.clientWidth, bar: getComputedStyle(a).display !== 'none', ticks: a.classList.contains('has-ticks'),
        fixed: getComputedStyle(a).position === 'fixed' && Math.abs(r.bottom - innerHeight) < 1 && r.left <= 0.5 && r.right >= innerWidth - 0.5,
        tree: !document.getElementById('bank-tree-topics').hidden, line1: document.getElementById('bank-topicline').hidden ? null : document.getElementById('bank-topicline').textContent };
    });
    if (scheme === 'light') {
      const ph = await phone();
      check(ph.line && ph.slides && !ph.bar && ph.tree && ph.line1 === null, 'a phone: the filters on one line that slides sideways, the tree on show, no bar at the bottom while nothing is ticked');
    }
    await p3.locator(NAME('')).tap();
    await p3.waitForSelector(ROWS);
    if (scheme === 'light') {
      let ph = await phone();
      check(!ph.tree && ph.line1 === 'All problemsTopics', `once a list is shown, the tree folds into one line that says where you are ("${ph.line1}")`);
      await p3.locator('#bank-topicline').tap();
      ph = await phone();
      check(ph.tree && ph.line1 === null && await p3.evaluate(() => document.activeElement && document.activeElement.matches('.tt-name[aria-current="true"]')),
        'a tap on that line brings the tree back, the keyboard on the topic lit');
      await p3.locator(`${ROWS} .bank-check`).first().tap();
      ph = await phone();
      check(ph.bar && ph.ticks && ph.fixed && await p3.locator('#bank-create').isVisible(), 'a tick: Create PDF waits in a bar fixed at the bottom of the screen');
      await p3.locator(`${ROWS} .bank-check`).first().tap();
      check(!(await phone()).bar, 'and the bar goes with the last tick');
    }
    const theme = await p3.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check(theme === scheme, `with no choice saved, the page follows the system: ${scheme} (${theme}); the old site's automatic "light" does not count`);
    const lay = await p3.evaluate(() => {
      const w = document.documentElement.clientWidth, out = [];
      for (const li of document.querySelectorAll('#bank-results > li:not([hidden])')) {
        li.scrollIntoView({ block: 'center' });                // a row far off screen is not laid out (content-visibility)
        for (const e of li.querySelectorAll('.bank-check, .bank-row-title, .bank-chip, .bank-marker')) { const r = e.getBoundingClientRect(); if (r.width && (r.right > w + 0.5 || r.left < -0.5)) out.push(li.dataset.id); }
      }
      window.scrollTo(0, 0);
      return { scroll: document.documentElement.scrollWidth, w, out: [...new Set(out)], n: document.querySelectorAll('#bank-results > li:not([hidden])').length };
    });
    check(lay.scroll <= lay.w && lay.out.length === 0 && lay.n > 0, `problems page at 360 px (${scheme}, methods shown): no sideways scroll (${lay.scroll} px), every tick box, title and tag of the ${lay.n} rows on screen${lay.out.length ? ' (not: ' + lay.out.join(', ') + ')' : ''}`);
    const c = await p3.evaluate(() => {
      const m = document.querySelector('#bank-results > li:not([hidden]) .bank-marker');
      const s = m && getComputedStyle(m);
      return s ? [s.color, s.backgroundColor] : null;
    });
    check(!c || contrast(c[0], c[1]) >= 4.5, `the "Incomplete solution" markers are readable (${c ? contrast(c[0], c[1]).toFixed(2) : '-'}:1)`);
    if (SHOTS) await p3.screenshot({ path: join(SHOTS, `problems-360-${scheme}.png`), fullPage: false });
    await p3.evaluate(() => window.scrollTo(0, 0));
    const name = await p3.evaluate(() => { const b = document.getElementById('theme-toggle'); return { label: b.getAttribute('aria-label'), text: b.innerText.trim() }; });
    check(name.label === null && name.text.toLowerCase() === (scheme === 'dark' ? 'light' : 'dark'), `the theme button is named by what it shows ("${name.text}")`);
    check(logos.length === 1 && logos[0].includes(scheme === 'dark' ? 'dark' : 'light'), `only the ${scheme} logo is downloaded (${logos.join(', ')})`);
    for (const pg of ['index.html', 'propose.html']) {
      await p3.goto(`${base}/${pg}`);
      await p3.waitForLoadState('load');
      const sw = await p3.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(sw[0] <= sw[1], `${pg} at 360 px (${scheme}): no sideways scroll (${sw[0]} px)`);
      if (SHOTS) await p3.screenshot({ path: join(SHOTS, `${pg.replace('.html', '')}-360-${scheme}.png`), fullPage: false });
    }
    const nav = await p3.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const links = [...document.querySelectorAll('#site-nav a')];
      return { n: links.length, current: document.querySelector('#site-nav a[aria-current="page"]')?.getAttribute('href'),
        onScreen: links.every(a => { const r = a.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= w + 0.5; }) };
    });
    check(nav.n === 3 && nav.onScreen && nav.current === 'propose.html' && await p3.locator('#site-nav a[href="problems.html"]').isVisible(),
      'at 360 px the three page links are on screen, the current one marked, with no menu to open');
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
    await p4.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', null, { timeout: 2000 }).catch(() => {});   // the switch is a view transition: its callback runs on the next frame
    check(errs.length === 0 && (await p4.getAttribute('html', 'data-theme')) === 'light' && /\d{4}/.test(await p4.textContent('#current-year')),
      'with site data blocked, the theme button still works and nothing throws');
    if (SHOTS) {
      await p4.click('#theme-toggle');
      await p4.setViewportSize({ width: 1280, height: 900 });
      await p4.goto(`${base}/problems.html?sel=${IDS[0]},${IDS[1]}&a=algebra&sm=1`);
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

  console.log('12. proposed problems (not reviewed yet) wait behind their switch (the public build, simulated)');
  {
    // the public build marks the problems without review: human as proposed (bank/data.py); this preview build has
    // their rows with proposed: false, so the page is served as the public build would make it
    const ctx = await browser.newContext();
    await ctx.route(/\/problems\.html/, async r => {
      const res = await r.fetch();
      const html = (await res.text()).replace('"preview":true', '"preview":false')
        .replaceAll('"review":"none","provisional":false,"proposed":false', '"review":"none","provisional":false,"proposed":true');
      await r.fulfill({ response: res, body: html });
    });
    const pp = await ctx.newPage();
    watch(pp);
    await pp.goto(`${base}/problems.html`);
    await pp.waitForSelector('html[data-ready]');
    const ids = await pp.evaluate(() => ({ all: window.bank.problems.length, proposed: window.bank.problems.filter(p => p.proposed).map(p => p.id) }));
    if (!ids.proposed.length) check(true, 'every problem of this build is reviewed: nothing behind the switch (not tested)');
    else {
      const nReviewed = ids.all - ids.proposed.length;
      const rootCount = () => pp.evaluate(() => Number(document.querySelector('#bank-tree-topics .tt-root .tt-count').textContent));
      check((await rootCount()) === nReviewed, `the tree counts the ${nReviewed} reviewed problems, not the ${ids.proposed.length} proposed ones`);
      const ws = await words(pp);
      check(same(ws.map(x => x.key), ['difficulty', 'origin', 'solved', 'years', 'methods', 'proposed']) && ws.at(-1).text === 'Proposed' && !ws.at(-1).on,
        'the row of filters has one more word: Proposed');
      await listAll(pp);
      check((await pp.locator(ROWS).count()) === nReviewed && (await pp.locator(`${ROWS} .bank-review-proposed`).count()) === 0,
        'All problems lists the reviewed problems only');
      await openMenu('proposed', pp);
      check(await pp.locator('#bank-show-proposed').isVisible() && !(await pp.isChecked('#bank-show-proposed')), 'its menu has a "Show the proposed problems" switch, off');
      await pp.click('#bank-show-proposed');
      await pp.waitForFunction(n => document.querySelectorAll('#bank-results > li:not([hidden])').length === n, ids.all, { timeout: 5000 }).catch(() => {});
      check((await pp.locator(ROWS).count()) === ids.all && (await pp.locator(`${ROWS} .bank-review-proposed`).count()) === ids.proposed.length,
        `with the switch on, the ${ids.proposed.length} proposed problems are listed with a "proposed" badge`);
      const pw = await word('proposed', pp);
      check(pw.text === 'Proposed shown' && pw.on && (await rootCount()) === ids.all, 'its word says "Proposed shown", and the tree counts them too');
      await pp.waitForFunction(() => location.search.includes('pr=1'), null, { timeout: 5000 }).catch(() => {});
      check(new URL(pp.url()).searchParams.get('pr') === '1', 'the switch is in the link (pr=1)');
      await closeMenu(pp);
      await pp.click(CROSS('proposed'));
      check((await pp.locator(ROWS).count()) === nReviewed && !(await word('proposed', pp)).on, 'its cross puts them away again');
      await pp.goto(`${base}/problems.html?sel=${ids.proposed[0]}`);
      await pp.waitForSelector('#bank-results-head:not([hidden])');
      check(await pp.evaluate(id => window.bank.state.filters.showProposed && window.bank.state.selection.has(id), ids.proposed[0]) && (await word('proposed', pp)).on,
        'a link that ticks a proposed problem turns the switch on');
    }
    await ctx.close();
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
