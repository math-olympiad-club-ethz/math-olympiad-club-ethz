// The lag test: the site on a mid-range phone, on slow 4G, its files gzipped as GitHub Pages sends them (headless
// Chromium through the DevTools protocol).  Each page on arrival: first paint, largest paint, layout shift, time the
// main thread is blocked, bytes downloaded (the Propose page also as a returning visitor with a saved draft); then every
// main interaction of the Problems and Propose pages, from the click or key to the next frame (Event Timing, the measure
// behind Google's INP), and the frames of a long scroll of the list.  The header's glass blur is on, as for visitors
// (a computer set to "reduce transparency" would otherwise measure the page without it).  Each number has a budget; over it, the
// test fails (measured twice before failing: one slow run of a busy machine is not a regression).
// A phone's slowness is relative: the machine is timed first, and the CPU slowed down so that it runs like a phone about
// 4x slower than the computer that set the budgets (a slower CI machine is slowed down less).
// Needs a built site (python3 build.py --preview).
//   node tests/e2e/perf.mjs            exit 0 = within every budget
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { startServer } from '../lib/static-server.mjs';

const SITE = resolve(new URL('../../site', import.meta.url).pathname);
if (!existsSync(join(SITE, 'problems.html'))) { console.log('site/problems.html is missing. Run:  npm run build:preview'); process.exit(2); }

// Budgets.  Load: Google's "good" thresholds (first paint 1.8 s, largest paint 2.5 s, blocking 200 ms) on slow 4G, a
// stricter layout shift (the site's own: nothing jumps), and the bytes of today with about a third to spare.
// Interactions: 200 ms, the "good" INP.
const LOAD = { fcp: 1800, lcp: 2500, cls: 0.02, blocking: 200 };
const BYTES = { 'index.html': 200e3, 'problems.html': 230e3, 'propose.html': 270e3 };
const INTERACTION = 200;
const STATEMENT = 6000;           // a first statement on slow 4G: the drawing code (PDF.js) and, alongside it, one PDF of the build's previews
const STATEMENT_READ = 3000;      // the same once the list has been read a moment: the drawing code came meanwhile
const FRAME = 100;                // the longest frame of a scroll (60 a second would be 17 ms each)
const REF_BENCH_MS = 32;          // the benchmark below on the computer that set these budgets (Apple M-series, unthrottled)
const PHONE = 4;                  // a phone: this many times slower than that computer
const NET = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 };   // "slow 4G"

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const row = (label, value, budget, unit = 'ms') => {
  const over = value > budget;
  if (over) failures.push(`${label}: ${value.toFixed(unit === '' ? 4 : 0)}${unit} (budget ${budget}${unit})`);
  console.log(`  ${over ? '✗' : '✓'} ${label.padEnd(52)} ${(unit === '' ? value.toFixed(4) : Math.round(value) + ' ' + unit).padStart(9)}   (budget ${budget}${unit && ' ' + unit})`);
};

const server = await startServer(SITE, 0, { gzip: true });
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch();
const errors = [];

// how fast this machine is: a fixed piece of work, the best of five, unthrottled
let rate;
{
  const p = await browser.newPage();
  const times = [];
  for (let i = 0; i < 5; i++) times.push(await p.evaluate(() => {
    const t = performance.now();
    const a = [];
    for (let i = 0; i < 200000; i++) a.push((i * 7919) % 10007);
    a.sort((x, y) => x - y);
    JSON.parse(JSON.stringify(a));
    return performance.now() - t;
  }));
  const bench = Math.min(...times);
  rate = Math.min(8, Math.max(1, PHONE * REF_BENCH_MS / bench));
  console.log(`this machine: benchmark ${bench.toFixed(1)} ms (reference ${REF_BENCH_MS} ms): the CPU is slowed ${rate.toFixed(1)}x to run like the phone`);
  await p.close();
}

const watchMetrics = () => {
  window.__m = { cls: 0, lcp: 0, blocking: 0, inp: 0 };
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) __m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) __m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) __m.blocking += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) __m.inp = Math.max(__m.inp, e.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
};
async function phonePage({ network = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
  if (network) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', NET); }
  await p.addInitScript(watchMetrics);
  return { p, ctx, cdp };
}

// a page on arrival: fresh browser, nothing cached
async function arrival(page, { draft = false } = {}) {
  const { p, ctx } = await phonePage();
  if (draft) await p.addInitScript(() => localStorage.setItem('bank-propose-draft-v1', JSON.stringify({ title: 'A saved draft', statement: 'Prove that \\( 1 + 1 = 2 \\).', area: [] })));
  await p.goto(`${base}/${page}`, { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(2500);                  // what the scripts do after load counts too
  const m = await p.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const bytes = performance.getEntriesByType('navigation')[0].transferSize + performance.getEntriesByType('resource').reduce((s, r) => s + r.transferSize, 0);
    return { ...window.__m, fcp: fcp ? fcp.startTime : Infinity, bytes };
  });
  await ctx.close();
  return m;
}
const best = (a, b) => ({ fcp: Math.min(a.fcp, b.fcp), lcp: Math.min(a.lcp, b.lcp), cls: Math.min(a.cls, b.cls), blocking: Math.min(a.blocking, b.blocking), bytes: Math.min(a.bytes, b.bytes) });
const overLoad = (m, page) => m.fcp > LOAD.fcp || m.lcp > LOAD.lcp || m.cls > LOAD.cls || m.blocking > LOAD.blocking || m.bytes > BYTES[page];

try {
  console.log('\n1. arrival on a phone, slow 4G');
  for (const page of ['index.html', 'problems.html', 'propose.html']) {
    let m = await arrival(page);
    if (overLoad(m, page)) m = best(m, await arrival(page));        // measured again before it counts as slow
    console.log(` ${page}`);
    row('first paint', m.fcp, LOAD.fcp);
    row('largest paint', m.lcp, LOAD.lcp);
    row('layout shift', m.cls, LOAD.cls, '');
    row('main thread blocked (long tasks past 50 ms)', m.blocking, LOAD.blocking);
    row('downloaded (gzip)', m.bytes / 1000, BYTES[page] / 1000, 'kB');
  }
  {
    // a first statement on a phone: typeset by the build, so the drawing code and one PDF, never the LaTeX engine
    const first = async (reading) => {
      const { p, ctx } = await phonePage();
      await p.goto(`${base}/problems.html`, { waitUntil: 'load', timeout: 120000 });
      await p.waitForSelector('html[data-ready]');
      await p.click('#bank-tree-topics .tt-name[data-slug=""]');
      await p.waitForSelector('#bank-results > li:not([hidden]) .bank-row-title');
      await p.waitForTimeout(reading);
      const ms = await p.evaluate(() => new Promise(res => {
        const btn = document.querySelector('#bank-results > li:not([hidden]) .bank-row-title'), t0 = performance.now();
        const o = new MutationObserver(() => { if (document.querySelector('.bank-preview-panel .bank-sheet canvas')) { o.disconnect(); res(performance.now() - t0); } });
        o.observe(document.getElementById('bank-results'), { subtree: true, childList: true });
        btn.click();
      }));
      const engine = await p.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('/busytex/')));
      await ctx.close();
      return { ms, engine };
    };
    console.log(' problems.html, a first statement');
    for (const [label, reading, budget] of [['at once: a click on a title to its statement drawn', 300, STATEMENT], ['the list read for 5 s first', 5000, STATEMENT_READ]]) {
      let s = await first(reading);
      if (s.ms > budget) s = { ...s, ms: Math.min(s.ms, (await first(reading)).ms) };
      row(label, s.ms, budget);
      check(!s.engine, 'and no LaTeX engine downloaded for it');
    }
  }
  {
    let m = await arrival('propose.html', { draft: true });
    if (m.cls > LOAD.cls) m = best(m, await arrival('propose.html', { draft: true }));
    console.log(' propose.html, back with a saved draft');
    row('layout shift', m.cls, LOAD.cls, '');
  }

  // interactions: each alone, from the input to the next frame; again once if over budget
  async function interactions(page, steps, setup, init) {
    const { p, ctx } = await phonePage({ network: false });      // what is measured here is the main thread, not the network
    if (init) await p.addInitScript(init);
    await p.goto(`${base}/${page}`, { waitUntil: 'load' });
    await p.waitForSelector('html[data-ready]');
    await p.waitForTimeout(800);
    if (setup) await setup(p);
    for (const [label, act] of steps) {
      let worst = Infinity;
      for (let attempt = 0; attempt < 2 && worst > INTERACTION; attempt++) {
        if (attempt) { const undo = act.undo; if (!undo) break; await undo(p); await p.waitForTimeout(300); }
        await p.evaluate(() => { __m.inp = 0; });
        await act(p);
        await p.waitForTimeout(600);
        worst = Math.min(worst, await p.evaluate(() => __m.inp));
      }
      row(label, worst, INTERACTION);
    }
    await ctx.close();
  }
  const step = (fn, undo) => Object.assign(fn, { undo });

  console.log('\n2. the Problems page, on the phone');
  await interactions('problems.html', [
    ['tree: unfold it (it starts folded)', step(p => p.click('#bank-tree-topics button[aria-label="Unfold the tree"]'))],
    ['tree: unfold a topic', step(p => p.click('#bank-tree-topics button[aria-label="Unfold Analysis"]'), p => p.click('#bank-tree-topics button[aria-label="Fold Analysis"]'))],
    ['tree: fold the whole tree away', step(p => p.click('#bank-tree-topics button[aria-label="Fold the tree"]'))],
    ['tree: bring it back', step(p => p.click('#bank-tree-topics button[aria-label="Unfold the tree"]'))],
    ['a topic chosen: its list (Analysis; the rows were built ahead)', step(p => p.click('#bank-tree-topics .tt-name[data-slug="analysis"]'))],
    ['the tree brought back over the list', step(p => p.click('#bank-topicline'))],
    ['All problems: the whole list', step(p => p.click('#bank-tree-topics .tt-name[data-slug=""]'))],
    ['a problem ticked', step(p => p.locator('#bank-results > li:not([hidden]) .bank-check').first().click(), p => p.locator('#bank-results > li:not([hidden]) .bank-check').first().click())],
    ['the search bar: focus', step(p => p.click('#bank-search'), p => p.keyboard.press('Escape'))],
    ['a letter typed (titles filtered live)', step(p => p.keyboard.type('s'), p => p.keyboard.press('Backspace'))],
    ['another letter', step(p => p.keyboard.type('e'), p => p.keyboard.press('Backspace'))],
    ['the words deleted', step(async p => { await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); })],
    ['a filter opened (Difficulty)', step(p => p.click('.bank-filter-word[data-filter="difficulty"]'), p => p.click('.bank-filter-word[data-filter="difficulty"]'))],
    ['a choice made in it (Easy)', step(p => p.click('#bank-menu .bank-option[data-opt="easy"]'), p => p.click('#bank-menu .bank-option[data-opt="easy"]'))],
    ['Clear all', step(p => p.click('#bank-reset'))],
    ['Methods opened', step(p => p.click('.bank-filter-word[data-filter="methods"]'), p => p.click('.bank-filter-word[data-filter="methods"]'))],
    ['the methods shown (spoilers)', step(p => p.click('label[for="bank-show-methods"]'), p => p.click('label[for="bank-show-methods"]'))],
    ['the menu closed (Escape)', step(p => p.keyboard.press('Escape'))],
    ['Select all', step(p => p.click('label[for="bank-select-all"]'), p => p.click('label[for="bank-select-all"]'))],
    ['Clear selection', step(p => p.click('#bank-clear-selection'))],
    // what opens a list and what closes it: by hand, or by a search; a filter alone only brings the tree's numbers up to date
    ['the tree brought back over the list again', step(p => p.click('#bank-topicline'))],
    ['All problems clicked again: the list goes', step(p => p.click('#bank-tree-topics .tt-name[data-slug=""]'))],
    ['a filter opened, no list', step(p => p.click('.bank-filter-word[data-filter="difficulty"]'), p => p.click('.bank-filter-word[data-filter="difficulty"]'))],
    ['a choice made in it: the numbers of the tree only', step(p => p.click('#bank-menu .bank-option[data-opt="easy"]'), p => p.click('#bank-menu .bank-option[data-opt="easy"]'))],
    ['the menu closed (Escape)', step(p => p.keyboard.press('Escape'))],
    ['a word typed, no list before: the search lists what it finds', step(async p => { await p.click('#bank-search'); await p.keyboard.type('s'); })],
    ['the word erased: the list it opened goes', step(p => p.keyboard.press('Backspace'))],
  ]);

  console.log('\n2b. a long scroll of the whole list, on the phone');
  {
    const { p, ctx } = await phonePage({ network: false });
    await p.goto(`${base}/problems.html`, { waitUntil: 'load' });
    await p.waitForSelector('html[data-ready]');
    check(await p.evaluate(() => !matchMedia('(prefers-reduced-transparency: reduce)').matches && getComputedStyle(document.documentElement).getPropertyValue('--glass-fx').trim() !== 'none'),
      'the header\'s glass blur is on, as for visitors');
    await p.click('#bank-tree-topics .tt-name[data-slug=""]');        // All problems: the whole list
    await p.waitForTimeout(500);
    const scroll = () => p.evaluate(() => new Promise(done => {
      const frames = []; let last = performance.now(), n = 0;
      const tick = now => { frames.push(now - last); last = now; scrollBy(0, 60); if (++n < 90) requestAnimationFrame(tick); else done({ worst: Math.max(...frames.slice(1)), mean: frames.slice(1).reduce((a, b) => a + b, 0) / (frames.length - 1), end: scrollY }); };
      requestAnimationFrame(tick);
    }));
    let s = await scroll();
    if (s.worst > FRAME) { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300); const again = await scroll(); if (again.worst < s.worst) s = again; }
    check(s.end > 3000, `the page scrolled (${Math.round(s.end)} px in 90 frames, ${s.mean.toFixed(1)} ms a frame on average)`);
    row('the longest frame while scrolling', s.worst, FRAME);
    await ctx.close();
  }

  console.log('\n3. the Propose page, on the phone');
  await interactions('propose.html', [
    ['a letter typed in the title', step(p => p.locator('#pp-title').pressSequentially('S'))],
    ['a letter typed in the statement', step(p => p.locator('#pp-statement').pressSequentially('L'))],
    ['a word typed in the statement', step(p => p.locator('#pp-statement').pressSequentially(' x'))],
    ['"What is it about?": the tree opens', step(p => p.click('#pp-add-about'), p => p.click('#pp-add-about'))],
    ['a topic unfolded', step(p => p.click('#pp-tree .tt-tg[data-for="analysis"]'), p => p.click('#pp-tree .tt-tg[data-for="analysis"]'))],
    ['a topic chosen', step(p => p.click('#pp-tree .tt-name[data-slug="analysis"]'), p => p.click('#pp-tree .tt-name[data-slug="analysis"]'))],
    ['a letter typed in "Where is it from?"', step(async p => { if (await p.locator('#pp-from').isHidden()) await p.click('#pp-add-from'); await p.locator('#pp-from').pressSequentially('I'); })],
  ], null, () => Object.defineProperty(Navigator.prototype, 'connection', { get: () => ({ saveData: true, effectiveType: '4g' }) }));   // a phone that saves data: no typesetting, the keys alone are measured
} catch (e) {
  failures.push('the test itself failed: ' + (e && e.stack || e));
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) failures.push('errors on the pages: ' + errors.join(' | '));
console.log(failures.length ? `\n${failures.length} over budget:\n  ` + failures.join('\n  ') : '\nevery page and every interaction within its budget');
process.exit(failures.length ? 1 : 0);
