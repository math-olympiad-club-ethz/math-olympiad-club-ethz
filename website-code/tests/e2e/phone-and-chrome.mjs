// End-to-end test of what the sticky header and row of filters, the bubbles and a phone ask of the site, in headless Chromium (mobile
// emulation for the phone): no download the visitor did not ask for, nothing hidden under what is stuck, no stray bubble,
// no page wider than a phone, a trackpad pinch that leaves the header alone, a theme fade that swallows no click.
// Needs a built site (python3 build.py --preview) and the engine bundle in site/static/busytex/.
//   node tests/e2e/phone-and-chrome.mjs            exit 0 = pass
import { chromium, devices } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../lib/static-server.mjs';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const SITE = join(ROOT, 'site');
if (!existsSync(join(SITE, 'static', 'busytex', 'manifest.json')) || !existsSync(join(SITE, 'problems.html'))) {
  console.log('The site or its engine bundle is missing. Build it once with:  python3 build.py --preview');
  process.exit(2);
}
// The problems of this build, in ID order (on main, bank/leave_out.py may have left broken ones out: no fixed numbers)
const IDS = JSON.parse(readFileSync(join(SITE, 'static', 'bank', 'index.json'), 'utf8')).problems.map(p => p.id);
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

const server = await startServer(SITE);
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
};
const engineFiles = /\/static\/busytex\/(busytex|club)/;
const phone = () => browser.newContext({ ...devices['iPhone 14'] });      // touch, a coarse pointer, 390 px wide
const ROWS = '#bank-results > li:not([hidden])';
// the whole bank listed: a click on All problems, the first line of the tree (unless a list is there already)
const showAll = async (p) => { await p.waitForSelector('html[data-ready]'); if (!(await p.locator(ROWS).count())) await p.locator('#bank-tree-topics .tt-name[data-slug=""]').click(); await p.waitForSelector(ROWS); };
const longTag = 'arithmetic-functions';
const innerHeightOf = p => p.viewportSize().height;

try {
  console.log('1. the engine is downloaded only when asked for');
  {
    const c = await phone();
    const p = watch(await c.newPage());
    const asked = [];
    p.on('request', r => { if (engineFiles.test(r.url())) asked.push(r.url()); });
    await p.goto(`${base}/problems.html`);
    await showAll(p);
    await p.locator('#bank-results > li:not([hidden]) .bank-check').first().check();
    await p.waitForTimeout(800);
    check(asked.length === 0, `on a phone, a tick starts no download of the engine (${asked.length} requests)`);
    // the Propose page: sending needs the engine (the PDF), so the sheet follows the text on a phone too; only where the
    // visitor saves data does it wait for "Show it typeset"
    const saving = watch(await c.newPage());
    await saving.addInitScript(() => Object.defineProperty(Navigator.prototype, 'connection', { get: () => ({ saveData: true, effectiveType: '4g' }) }));
    saving.on('request', r => { if (engineFiles.test(r.url())) asked.push(r.url()); });
    await saving.goto(`${base}/propose.html`);
    await saving.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
    await saving.waitForTimeout(100);
    await saving.fill('#pp-statement', 'A statement.');
    await saving.waitForTimeout(1200);
    check(asked.length === 0 && await saving.locator('#pp-typeset').isVisible(),
      `on a phone that saves data, typing starts no download (${asked.length} requests): the sheet offers "Show it typeset"`);
    await saving.close();

    // Create does download it; then, on the next visit, a tick starts the stored engine at once: no download, no wait at Create
    await p.goto(`${base}/problems.html?sel=${IDS[0]}`);
    await p.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
    await p.click('#bank-create');
    await p.waitForSelector('#bank-out-problems a[download$=".pdf"]', { timeout: 240000 });
    await p.waitForTimeout(1500);                               // the last engine file is stored while the PDF is shown
    await p.goto(`${base}/problems.html`);
    await showAll(p);
    const before = asked.length;
    await p.locator('#bank-results > li:not([hidden]) .bank-check').first().check();
    await p.waitForFunction(() => !!window.bank.C._state.worker, null, { timeout: 5000 }).catch(() => {});
    check(await p.evaluate(() => !!window.bank.C._state.worker) && asked.length === before, 'on a phone, a tick starts an engine already stored here, with no download');
    await c.close();

    const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const q = watch(await d.newPage());
    const askedD = [];
    q.on('request', r => { if (engineFiles.test(r.url())) askedD.push(r.url()); });
    await q.goto(`${base}/problems.html`);
    await showAll(q);
    await q.hover('#bank-create', { force: true });
    await q.waitForTimeout(500);
    check(askedD.length === 0, `the pointer on a disabled Create starts no download (${askedD.length} requests)`);
    await d.close();
  }

  console.log('2. the bubbles');
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = watch(await c.newPage());
    await p.goto(`${base}/problems.html?a=analysis&s=full`);
    await p.waitForSelector('.bank-filter-x[data-filter="solved"]');
    await p.locator('.bank-filter-x[data-filter="solved"]').click();
    await p.mouse.move(640, 700);
    await p.waitForTimeout(250);
    check(!(await p.locator('.tip').isVisible().catch(() => false)) && !(await p.locator('.bank-filter.is-on').count()), 'clearing a filter with its × opens no bubble');
    const chip = p.locator('#bank-results > li:not([hidden]) .bank-chip-unrated').first();
    if (await chip.count()) {
      await chip.click();
      check(await p.locator('.tip').isVisible(), 'a click on a plain tag opens its bubble');
      await p.fill('#bank-search', 'zzzzzzzz');
      await p.waitForTimeout(150);
      const r = await p.evaluate(() => { const t = document.querySelector('.tip'); return t && !t.hidden ? t.getBoundingClientRect().top : null; });
      check(r === null, 'a bubble whose row is filtered away by typing goes at once');
    } else check(true, 'no unrated problem in Analysis (the bubble of a plain tag not tested)');
    await c.close();
  }

  console.log('3. what is stuck hides nothing');
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = watch(await c.newPage());
    await p.goto(`${base}/problems.html?sel=${IDS[0]}-${IDS[4]}`);
    await showAll(p);
    // the whole tree unfolded makes the page long enough to scroll
    for (let i = 0; i < 4; i++) await p.evaluate(() => document.querySelectorAll('#bank-tree-topics .tt-tg[aria-expanded="false"]').forEach(b => b.click()));
    await p.waitForTimeout(350);
    await p.evaluate(() => window.scrollTo(0, 1200));          // well inside the tree: at the very end of the page the list leaves with it
    await p.waitForFunction(() => document.getElementById('bank-tools').classList.contains('is-stuck'), null, { timeout: 3000 }).catch(() => {});
    const stuck = await p.evaluate(() => {
      const b = document.getElementById('bank-tools').getBoundingClientRect(), h = document.querySelector('.site-head').getBoundingClientRect();
      const panel = document.getElementById('bank-tree-panel').getBoundingClientRect();
      return { barTop: b.top, barBottom: b.bottom, headBottom: h.bottom, cls: document.getElementById('bank-tools').className, panelTop: panel.top, scrolled: scrollY };
    });
    check(stuck.scrolled > 500 && Math.abs(stuck.barTop - stuck.headBottom) < 1 && /is-stuck/.test(stuck.cls), 'scrolled down, the row of filters sticks right under the header, and knows it');
    check(stuck.panelTop >= stuck.barBottom - 1 && stuck.panelTop < innerHeightOf(p), `and the list stays in sight under it (its top at ${Math.round(stuck.panelTop)}, the row ends at ${Math.round(stuck.barBottom)})`);
    await p.click('#bank-order-btn');
    await p.waitForFunction(() => { const t = document.getElementById('bank-order').getBoundingClientRect().top; return t >= 0 && t < innerHeight; }, null, { timeout: 3000 }).catch(() => {});
    const order = await p.evaluate(() => { const r = document.getElementById('bank-order').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
    check(order.top >= 0 && order.top < order.h, `PDF order pressed in the stuck row brings its panel into view (top ${Math.round(order.top)})`);
    await p.click('#bank-order-btn');

    // while a PDF is on its way (the texts are held back), in a narrower window: the status stays readable under the row
    await c.route(/bodies\.json/, async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
    await p.setViewportSize({ width: 1000, height: 800 });
    await p.evaluate(() => window.scrollTo(0, 2000));
    await p.waitForTimeout(100);
    await p.click('#bank-create');
    await p.waitForFunction(() => document.getElementById('bank-status').textContent.length > 0);
    await p.evaluate(() => window.scrollBy(0, 400));
    await p.waitForTimeout(300);
    const seen = await p.evaluate(() => {
      const s = document.getElementById('bank-status'), r = s.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
      return { text: s.textContent, onTop: !!hit && (hit === s || s.contains(hit)) };
    });
    check(seen.onTop, `the status can be read under the row while a PDF is made ("${seen.text}")`);
    await p.click('#bank-cancel');
    await p.waitForFunction(() => document.getElementById('bank-status').textContent === 'Cancelled.', null, { timeout: 1000 }).catch(() => {});
    check(await p.evaluate(() => document.getElementById('bank-status').textContent === 'Cancelled.'), 'Cancel works at once, even while the texts are loading');
    await c.close();

    const land = await browser.newContext({ ...devices['iPhone 14 landscape'] });
    const l = watch(await land.newPage());
    await land.route(/bodies\.json/, async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
    await l.goto(`${base}/problems.html?sel=${IDS[0]}-${IDS[1]}`);
    await showAll(l);
    await l.evaluate(() => window.scrollTo(0, 1500));
    await l.click('#bank-create');
    await l.waitForFunction(() => document.getElementById('bank-status').textContent.length > 0);
    await l.waitForTimeout(400);
    const prog = await l.evaluate(() => {
      const s = document.getElementById('bank-status'), r = s.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
      return { top: r.top, h: innerHeight, onTop: !!hit && (hit === s || s.contains(hit)) };
    });
    check(prog.top >= 0 && prog.top < prog.h && prog.onTop, `a phone in landscape: the progress of a PDF stays on screen (at ${Math.round(prog.top)} of ${prog.h})`);
    await land.close();

    const small = await browser.newContext({ viewport: { width: 1280, height: 560 } });
    const q = watch(await small.newPage());
    await q.goto(`${base}/problems.html`);
    await showAll(q);
    await q.waitForTimeout(150);
    const blocked = await q.evaluate(() => {
      const box = document.getElementById('bank-search'), r = box.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { covered: r.top > 0 && r.bottom < innerHeight && hit !== box, stuck: document.getElementById('bank-tools').classList.contains('is-stuck') };
    });
    check(!blocked.covered && !blocked.stuck, 'a row that has not stuck yet covers nothing above it: the search bar can be clicked');
    await small.close();
  }

  console.log('4. a phone');
  {
    const c = await phone();
    const p = watch(await c.newPage());
    await p.goto(`${base}/problems.html?a=${longTag}`);
    await p.waitForSelector('#bank-topicline:not([hidden])');
    const w = await p.evaluate(() => {
      const x = document.getElementById('bank-topicline').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, xRight: x.right, win: innerWidth, tree: document.getElementById('bank-tree-topics').hidden, rows: document.querySelectorAll('#bank-results > li:not([hidden])').length };
    });
    check(w.sw <= w.cw && w.xRight <= w.win && w.tree && w.rows > 0, `a link to a topic with a long name: the tree is folded into one line that wraps, its list under it, and the page stays ${w.cw} px wide`);
    await p.locator('#bank-results > li:not([hidden]) .bank-check').first().check();
    const bar = await p.evaluate(() => { const r = document.getElementById('bank-actions').getBoundingClientRect(); return { bottom: r.bottom, h: innerHeight, pos: getComputedStyle(document.getElementById('bank-actions')).position }; });
    check(bar.pos === 'fixed' && Math.abs(bar.bottom - bar.h) < 1 && await p.locator('#bank-create').isVisible(), 'once a problem is ticked, Create PDF waits at the bottom of the screen');
    await p.goto(`${base}/propose.html`);
    const sizes = await p.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea')].filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id));
    check(sizes.length === 0, `no field under 16 px, which would make an iPhone zoom${sizes.length ? ': ' + sizes.join(', ') : ''}`);
    await c.close();

    for (const width of [345, 359, 360, 390]) {
      const n = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height: 700 } });
      const q = watch(await n.newPage());
      await q.goto(`${base}/index.html`);
      const m = await q.evaluate(() => {
        const s = document.querySelector('.brand').getBoundingClientRect(), u = document.querySelector('.site-nav ul').getBoundingClientRect();
        return { overlap: !(s.right <= u.left || s.bottom <= u.top), wide: document.documentElement.scrollWidth - document.documentElement.clientWidth, head: getComputedStyle(document.querySelector('.site-head')).position };
      });
      check(!m.overlap && m.wide <= 0 && m.head === 'fixed', `at ${width} px the header's words do not cover the seal, and it stays on screen`);
      await n.close();
    }
  }

  console.log('4b. nothing jumps on arrival');
  for (const [path, most] of [['problems.html', 0.02], ['problems.html?a=analysis', 0.05], ['index.html', 0.02], ['propose.html', 0.02]]) {
    const c = await phone();
    const p = watch(await c.newPage());
    // each shift with what moved (its id, class or tag, and from where to where), so that a failure names the element
    await p.addInitScript(() => {
      window.__cls = 0; window.__moved = [];
      const name = n => !n ? '?' : n.nodeType !== 1 ? `text in ${name(n.parentElement)}` : n.id ? '#' + n.id : n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : n.nodeName.toLowerCase();
      new PerformanceObserver(l => {
        for (const e of l.getEntries()) {
          window.__cls += e.value;
          window.__moved.push(`${e.value.toFixed(4)} at ${Math.round(e.startTime)} ms: ` + (e.sources || []).slice(0, 3)
            .map(s => `${name(s.node)} y ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}, h ${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`).join('; '));
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await p.goto(`${base}/${path}`);
    await p.waitForTimeout(1200);
    const { cls, moved } = await p.evaluate(() => ({ cls: window.__cls, moved: window.__moved }));
    check(cls < most, `${path} on a phone: layout shift ${cls.toFixed(4)} (under ${most})` + (cls < most ? '' : ` [${moved.join(' | ')}]`));
    await c.close();
  }

  console.log('5. a pinch on a trackpad, and the theme fade');
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const p = watch(await c.newPage());
    await p.goto(`${base}/index.html`);
    const before = await p.evaluate(() => JSON.stringify(document.querySelector('.brand').getBoundingClientRect()));
    await p.mouse.move(900, 500);
    await p.keyboard.down('Control');
    for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, -3); await p.waitForTimeout(16); }
    const during = await p.evaluate(() => ({ t: document.querySelector('.page').style.transform, x: scrollX }));
    check(/translate/.test(during.t) && during.x === 0, 'during a pinch only the transform of the page changes: no layout, no real scroll');
    await p.waitForTimeout(350);
    await p.keyboard.up('Control');
    const after = await p.evaluate((b) => {
      const scale = parseFloat(/scale\(([\d.]+)\)/.exec(document.querySelector('.page').style.transform)[1]);
      return { same: JSON.stringify(document.querySelector('.brand').getBoundingClientRect()) === b, x: scrollX, scale, sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth };
    }, before);
    check(after.same, 'the header has not moved by a pixel');
    check(Math.abs(after.x - 900 * (after.scale - 1)) < 3, `the zoom goes where the pointer is, on the right too (scrolled ${after.x} at ${after.scale.toFixed(2)}x)`);
    check(Math.abs(after.sw - after.w * after.scale) < 3, 'all of the magnified page can be reached');
    await p.keyboard.down('Control');
    for (let i = 0; i < 120; i++) { await p.mouse.wheel(0, 6); await p.waitForTimeout(4); }
    await p.waitForTimeout(350);
    await p.keyboard.up('Control');
    check(await p.evaluate(() => document.querySelector('.page').style.transform === '' && !document.documentElement.classList.contains('is-zoomed')), 'pinching back returns to the normal page');

    await p.click('#theme-toggle');
    await p.waitForTimeout(100);
    await p.mouse.click(...(await p.evaluate(() => { const r = document.querySelector('.site-nav a[href="problems.html"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
    await p.waitForURL(/problems\.html/, { timeout: 3000 }).catch(() => {});
    check(/problems\.html/.test(p.url()), 'a click during the theme fade is not lost: the link opens');
    await c.close();
  }

  console.log('6. the sheet of the propose page');
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = watch(await c.newPage());
    await p.goto(`${base}/index.html`);
    await p.click('#site-nav a[href="propose.html"]');
    await p.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
    const length0 = await p.evaluate(() => history.length);
    const typeset = () => p.waitForFunction(() => window.propose.upToDate() && document.getElementById('pp-preview-status').dataset.state === 'ok', null, { timeout: 120000 });
    await p.fill('#pp-statement', 'First statement.');
    await typeset();
    await p.fill('#pp-statement', 'Second statement.');
    await typeset();
    await p.waitForTimeout(1500);
    check((await p.evaluate(() => history.length)) === length0 && await p.locator('#pp-pages canvas').count() >= 1, 'the sheet follows the text and adds nothing to the history of the tab: one Back leaves the page');
    await c.close();
  }

  console.log('7. the page for a wrong address');
  {
    const html = readFileSync(join(SITE, '404.html'), 'utf8');
    const local = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|#|data:|blob:)/.test(u));
    check(local.length > 0 && local.every(u => u.startsWith('/')), `its links are absolute, so they work at any depth${local.find(u => !u.startsWith('/')) ? ': ' + local.find(u => !u.startsWith('/')) : ''}`);
  }

  const real = errors.filter(e => !/Failed to load resource|net::ERR/.test(e));
  check(real.length === 0, 'no console error, and nothing refused by the Content-Security-Policy' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
} catch (e) {
  failures.push('exception: ' + e.message);
  console.log('  ✗ exception: ' + e.stack);
} finally {
  await browser.close();
  await server.close();
}

console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nall phone and sticky-parts checks passed');
process.exit(failures.length ? 1 : 0);
