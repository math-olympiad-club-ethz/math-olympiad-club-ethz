// End-to-end test of the site's own pinch on a trackpad (site.js): the page is magnified and the header is not; while the
// fingers move only a transform changes; and in Safari, when they rest or leave, the magnified page is laid out at the
// whole number at or above the zoom and brought down to it, which is what keeps it sharp there at every zoom (a stretched picture is soft, but a headless browser's screenshot does not show
// that: the checks are on the state of the page and on where things are).  The clock is the test's own, so every frame
// and every timer comes when the test says.
// Needs a built site (python3 build.py --preview).
//   node tests/e2e/pinch.mjs             headless Chromium: its own way (the transform alone), and Safari's way, which
//                                        site.js takes when the browser has Safari's gesture events (the test gives it some)
//   node tests/e2e/pinch.mjs webkit      WebKit, Safari's engine: Safari's way as it is, and the transform alone
// exit 0 = pass
import { chromium, webkit } from 'playwright';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../lib/static-server.mjs';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const SITE = join(ROOT, 'site');
if (!existsSync(join(SITE, 'problems.html')) || !existsSync(join(SITE, 'propose.html'))) {
  console.log('The site is missing. Build it once with:  python3 build.py --preview');
  process.exit(2);
}
const engine = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

const server = await startServer(SITE);
const base = `http://127.0.0.1:${server.port}`;
// Chromium stands in for Safari here.  On Linux (CI) it rounds the width of every letter to whole pixels at each size
// (font hinting): a line laid out twice as big is then not quite twice as wide, and may break a word earlier, every box
// under it a line down (23 to 33 px, measured on CI).  Without hinting its letters scale as Safari's do.
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? {} : { args: ['--font-render-hinting=none'] });
const errors = [];
const AT = { x: 900, y: 500 };          // where the pointer is during the pinches: on the right, to see the zoom go there
// How far a box may be from where the transform alone had put it, once the page is laid out twice as big.  In WebKit that
// layout is the page exactly, twice as big.  Chromium, which never takes this way outside this test, gives a line that
// mixes two fonts a whole number of pixels: a few boxes end up a pixel or two away.
const NEAR = engine === 'webkit' ? 1.5 : 4;
// what tells site.js that it is in Safari, given or taken away before the page's scripts run
const asSafari = () => { if (!('GestureEvent' in window)) window.GestureEvent = function GestureEvent() {}; };
const notSafari = () => { delete window.GestureEvent; };
const noZoomProperty = () => { if (!('GestureEvent' in window)) window.GestureEvent = function GestureEvent() {}; const real = CSS.supports.bind(CSS); CSS.supports = (...a) => (a[0] === 'zoom' ? false : real(...a)); };

async function open(path, { height = 800, before = asSafari, clock = true } = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !(shooting && /Refused to apply a stylesheet/.test(m.text()))) errors.push(m.text()); });
  await p.addInitScript(before);
  await p.goto(base + path);
  await p.waitForFunction(() => document.documentElement.hasAttribute('data-ready') || !document.querySelector('script[type="module"]'));
  await p.evaluate(() => document.fonts.ready);
  if (clock) { await p.clock.install(); await p.clock.pauseAt(new Date(Date.now() + 5000)); }
  await p.mouse.move(AT.x, AT.y);
  return p;
}
/* What the pinch has done to the page.  zoom = what is shown: the layout's own zoom times the transform's scale. */
const state = p => p.evaluate(() => {
  const pg = document.querySelector('.page'), root = document.documentElement, s = /scale\(([\d.]+)\)/.exec(pg.style.transform), room = document.querySelector('.zoom-room');
  const laid = parseFloat(pg.style.zoom) || 1, scale = s ? Number(s[1]) : 1;
  return { laid, scale, zoom: laid * scale, transform: pg.style.transform, width: pg.style.width, attr: pg.getAttribute('style') || '', cls: pg.className, zoomed: root.classList.contains('is-zoomed'),
    x: scrollX, y: scrollY, sw: root.scrollWidth, sh: root.scrollHeight, vw: root.clientWidth, w: pg.offsetWidth, h: pg.offsetHeight,
    room: room ? [parseFloat(room.style.width) || 0, parseFloat(room.style.height) || 0] : null, told: window.__told || [] };
});
/* The element under the pointer is remembered, with the place of the pointer in it; pinned() says how far that place is
   from the pointer now, in px. */
const pin = p => p.evaluate(({ x, y }) => {
  window.addEventListener('pagezoom', e => (window.__told = window.__told || []).push(e.detail));
  const e = document.elementFromPoint(x, y), r = e.getBoundingClientRect();
  window.__pin = { e, fx: (x - r.left) / r.width, fy: (y - r.top) / r.height, x, y };
}, AT);
const pinned = p => p.evaluate(() => { const { e, fx, fy, x, y } = window.__pin, r = e.getBoundingClientRect(); return Math.hypot(r.left + fx * r.width - x, r.top + fy * r.height - y); });
/* A screenshot.  In WebKit Playwright prepares it with a style sheet of its own, which the page's Content-Security-Policy
   refuses: that error in the console is not the site's, and open() leaves it out. */
let shooting = 0;
const shot = async p => { shooting++; try { return await p.screenshot(); } finally { shooting--; } };
/* Every box of the page, where it is on screen.  Not the rows of the problem list: built ahead while the browser is idle
   (bank-ui.js buildRowsIdle), hidden until a list is shown, they would change which boxes come first. */
const boxes = p => p.evaluate(() => [...document.querySelectorAll('main *:not(#bank-results *), footer *')].slice(0, 400).map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }));
/* The layout a magnified page has in Safari: the whole number at or above the zoom (site.js laidFor) */
const whole = z => (z <= 1 ? 1 : Math.ceil(z - 1e-9));
const apart = (a, b) => Math.max(...a.map((r, i) => Math.max(...r.map((v, k) => Math.abs(v - b[i][k])))));
/* A pinch as a trackpad sends it to Chrome: wheel events with Ctrl held, one per frame, until the zoom reaches `to` */
async function pinchTo(p, to, each = null) {
  let s = await state(p), worst = 0, worstPage = 0;
  const out = to < s.zoom;
  for (let i = 0; i < 400 && (out ? s.zoom > to : s.zoom < to); i++) {
    await p.mouse.wheel(0, out ? 3 : -3);
    await p.clock.runFor(17);
    s = await state(p);
    const off = await pinned(p);
    worst = Math.max(worst, off);
    worstPage = Math.max(worstPage, off / s.zoom);          // the same, in pixels of the page itself
    if (each) each(s);
    if (s.zoom >= 5 && !out) break;                          // the largest zoom
  }
  return { ...s, worst, worstPage };
}
async function pinchBackToNormal(p) {
  await pinchTo(p, 1.0001);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 3); await p.clock.runFor(17); }
  await p.clock.runFor(400);
  return state(p);
}
/* How different two screenshots are, seen from a little way off (each reduced four times, so that the grain of the
   letters' edges does not count, only where things are): the mean difference of their pixels, 0 to 255. */
let meter = null;
async function differ(a, b) {
  if (!meter) { meter = await (await browser.newContext()).newPage(); await meter.goto('about:blank'); }
  return meter.evaluate(async ([x, y]) => {
    const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width >> 2; c.height = i.height >> 2;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(i, 0, 0, c.width, c.height); return g.getImageData(0, 0, c.width, c.height).data; };
    const [p, q] = [await load(x), await load(y)];
    let sum = 0;
    for (let i = 0; i < p.length; i += 4) sum += (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])) / 3;
    return sum / (p.length / 4);
  }, [a.toString('base64'), b.toString('base64')]);
}

try {
  console.log(`1. Safari's way: a pinch in, and the fingers leave (${engine})`);
  {
    const p = await open('/problems.html');
    await p.keyboard.down('Control');
    await pin(p);
    const head = await p.evaluate(() => JSON.stringify(document.querySelector('.brand').getBoundingClientRect()));
    const start = await state(p);
    let still = true;
    const moving = await pinchTo(p, 1.4, s => { still = still && s.laid === 1 && s.x === 0 && s.y === 0 && !/is-laid/.test(s.cls); });
    check(/translate/.test(moving.transform) && moving.scale > 1.39 && still && /is-zooming/.test(moving.cls),
      `while the fingers move only the transform of the page changes: no layout, no real scroll (${moving.transform})`);
    check(moving.worst < 1.5, `the place under the pointer stays under it (${moving.worst.toFixed(2)} px away at most)`);
    const [shotA, boxesA] = [await shot(p), await boxes(p)];
    await p.clock.runFor(160);                 // 150 ms of silence: the gesture has ended
    const ended = await state(p);
    check(ended.laid === 2 && /is-laid/.test(ended.cls) && ended.width === `${start.w}px` && Math.abs(ended.zoom - moving.zoom) < 1e-4 && !/translate/.test(ended.transform),
      `when the fingers leave, the page is laid out at the whole number above and brought to the size asked for (zoom ${ended.laid}, ${ended.transform}): the same ${ended.zoom.toFixed(2)}x`);
    const [shotB, boxesB] = [await shot(p), await boxes(p)];
    const moved = apart(boxesA, boxesB);
    check(moved < NEAR, `and nothing has moved: every box is where the transform alone had put it (${moved.toFixed(2)} px at most; the real scroll is a whole pixel)`);
    await p.evaluate(() => window.scrollBy(2, 2));
    const shotC = await shot(p);
    await p.evaluate(() => window.scrollBy(-2, -2));
    const [same, off] = [await differ(shotA, shotB), await differ(shotB, shotC)];
    check(same < off / (engine === 'webkit' ? 2 : 1), `the frame before and the frame after look the same (difference ${same.toFixed(2)}; for a page 2 px off: ${off.toFixed(2)})`);
    check(Math.abs(ended.x - AT.x * (ended.zoom - 1)) < 3 && await pinned(p) < NEAR, `the zoom went where the pointer is, on the right too (scrolled ${ended.x} at ${ended.zoom.toFixed(2)}x)`);
    check(Math.abs(ended.sw - ended.vw * ended.zoom) < 3 && Math.abs(ended.sh - start.h * ended.zoom) < 3, `all of the magnified page can be reached, and no more (${ended.sw} x ${ended.sh})`);
    check(await p.evaluate(b => JSON.stringify(document.querySelector('.brand').getBoundingClientRect()) === b, head), 'the header has not moved by a pixel');
    check(ended.told.length === 1 && Math.abs(ended.told[0] - ended.zoom) < 1e-4, 'the page is told the new size once, when the gesture has ended (for what it draws itself)');
    await p.clock.runFor(120);
    check(!/is-zooming/.test((await state(p)).cls), 'a moment later nothing is kept ready for a transform any more');

    console.log('2. more pinches on the magnified page: up to the largest zoom, and back');
    let laidOnly2 = true, scrolled = false;
    const far = await pinchTo(p, 3.2, s => { laidOnly2 = laidOnly2 && s.laid === 2; scrolled = scrolled || s.x !== ended.x || s.y !== ended.y; });
    check(laidOnly2 && !scrolled && far.scale > 1.5 && far.worst < NEAR, `on the way in, while the fingers move, the same layout is stretched (scale ${far.scale.toFixed(2)} for ${far.zoom.toFixed(2)}x), the pointer's place ${far.worst.toFixed(2)} px away at most`);
    const boxesFar = await boxes(p);
    await p.clock.runFor(300);
    const farEnd = await state(p), movedFar = apart(boxesFar, await boxes(p));
    check(farEnd.laid === whole(farEnd.zoom) && farEnd.scale <= 1 && farEnd.transform === `scale(${farEnd.scale})` && Math.abs(farEnd.sw - farEnd.vw * farEnd.zoom) < 3 && await pinned(p) < NEAR,
      `when the fingers leave, laid out at ${farEnd.laid} and brought down to ${farEnd.zoom.toFixed(2)}x: drawn with more pixels than it shows, never stretched (${farEnd.transform})`);
    check(movedFar < NEAR, `and nothing has moved (${movedFar.toFixed(2)} px at most)`);
    await pinchTo(p, 6);
    await p.clock.runFor(300);
    const topEnd = await state(p);
    const topOff = await pinned(p) / 5;
    check(Math.abs(topEnd.zoom - 5) < 1e-6 && topEnd.laid === 5 && !/scale/.test(topEnd.transform) && topOff < NEAR / 2,
      `at the largest zoom (5x) the page is laid out at 5 itself: no transform, every letter drawn at the screen's own pixels (${topEnd.transform || 'no transform'}; the pointer's place ${topOff.toFixed(2)} px of the page away)`);
    let following = true;
    const seenLaid = new Set();
    const back = await pinchTo(p, 1.5, s => { seenLaid.add(s.laid); following = following && s.laid === whole(s.zoom); });
    check(following && back.worstPage < NEAR / 2 && seenLaid.size >= 3, `on the way out the layout steps down with the zoom at each whole number (${[...seenLaid].join(', ')}), never more than twice the pixels shown; the pointer's place ${back.worstPage.toFixed(2)} px of the page away at most (${back.worst.toFixed(2)} on screen)`);
    await p.clock.runFor(300);
    const small = await state(p);
    check(small.laid === 2 && small.scale < 1 && Math.abs(small.sh - start.h * small.zoom) < 3, `at ${small.zoom.toFixed(2)}x the page is drawn with more pixels than it shows (zoom 2, scale ${small.scale.toFixed(2)})`);

    console.log('3. the window changes size, then back to the normal page');
    await p.setViewportSize({ width: 1100, height: 800 });
    await p.waitForTimeout(200);               // the resize event comes with a frame of the browser's own
    const resized = await p.evaluate(() => { const pg = document.querySelector('.page'), root = document.documentElement; return { w: pg.offsetWidth, body: document.body.clientWidth, sw: root.scrollWidth }; });
    check(resized.w === resized.body && Math.abs(resized.sw - resized.w * small.zoom) < 3, `a narrower window: the magnified page takes the width it would have without the zoom (${resized.w} px), and its room follows`);
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.waitForTimeout(200);
    const normal = await pinchBackToNormal(p);
    check(normal.attr === '' && normal.cls === 'page' && !normal.zoomed && normal.x === 0 && normal.sw === normal.vw && normal.sh === start.sh,
      `pinching back returns to the normal page: no style, no class, no room left (${JSON.stringify([normal.attr, normal.cls, normal.sw, normal.sh])})`);
    await p.keyboard.up('Control');
    await p.context().close();
  }

  console.log('4. a page shorter than the window');
  {
    const p = await open('/problems.html', { height: 2400 });
    await p.keyboard.down('Control');
    await pin(p);
    // the bottom of the footer, from the top of the page (whatever the scroll or the transform)
    const foot = () => p.evaluate(() => document.querySelector('.site-foot').getBoundingClientRect().bottom - document.querySelector('.page').getBoundingClientRect().top);
    const [start, foot0] = [await state(p), await foot()];
    await pinchTo(p, 1.3);
    const footMoving = await foot();
    await p.clock.runFor(400);
    const [s, footEnd] = [await state(p), await foot()];
    check(s.laid === 2 && start.h === 2400 && foot0 === 2400 && Math.abs(footEnd - foot0 * s.zoom) < NEAR && Math.abs(footEnd - footMoving) < NEAR && Math.abs(s.sh - 2400 * s.zoom) < 3,
      `its footer stays in proportion, at the bottom of the magnified page (${footEnd.toFixed(0)} px down at ${s.zoom.toFixed(2)}x, the page ${s.sh} px high)`);
    await p.keyboard.up('Control');
    await p.context().close();
  }

  console.log('5. Safari\'s gesture events, and the fingers resting on the trackpad');
  {
    const p = await open('/problems.html');
    await pin(p);
    const send = (type, scale) => p.evaluate(([type, scale]) => { const e = new Event(type, { cancelable: true }); e.scale = scale; window.dispatchEvent(e); }, [type, scale]);
    await send('gesturestart', 1);
    for (const k of [1.1, 1.2, 1.3, 1.4]) { await send('gesturechange', k); await p.clock.runFor(17); }
    const moving = await state(p);
    check(moving.laid === 1 && Math.abs(moving.zoom - 1.4) < 1e-4 && moving.x === 0 && await pinned(p) < 1.5, `a gesture magnifies the page at the pointer, with a transform (${moving.transform})`);
    const before = await boxes(p);
    await p.clock.runFor(150);
    const waiting = await state(p);
    await p.clock.runFor(100);                  // 250 ms without a change: the fingers rest
    const rested = await state(p);
    const moved = apart(before, await boxes(p));
    check(waiting.laid === 1 && rested.laid === 2 && /is-zooming/.test(rested.cls) && /translate/.test(rested.transform) && rested.x === 0 && Math.abs(rested.zoom - 1.4) < 1e-4 && moved < NEAR,
      `fingers resting on the trackpad: the page is laid out twice as big under the same gesture, and nothing moves (zoom ${rested.laid}, ${rested.transform}; ${moved.toFixed(2)} px at most)`);
    for (const k of [1.5, 1.6]) { await send('gesturechange', k); await p.clock.runFor(17); }
    await send('gestureend', 1.6);
    await p.clock.runFor(300);
    const ended = await state(p);
    check(ended.laid === 2 && Math.abs(ended.zoom - 1.6) < 1e-4 && ended.transform === `scale(${ended.scale})` && ended.x > 0 && await pinned(p) < NEAR && ended.told.length === 1,
      `the gesture goes on from there, and ends at ${ended.zoom.toFixed(2)}x with the real scroll (${ended.x}, ${ended.y})`);
    await p.context().close();
  }

  console.log('6. a dialog over a magnified page');
  {
    const p = await open('/propose.html', { clock: false });
    // opened as "LaTeX help" opens it (showModal), wherever that button is on the page
    const size = () => p.evaluate(() => { const d = document.getElementById('pp-latex'); d.showModal(); const r = d.getBoundingClientRect(); d.close(); return [r.left, r.width, r.height]; });
    const plain = await size();
    await p.mouse.move(640, 300);
    await p.keyboard.down('Control');
    for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, -3); await p.waitForTimeout(16); }
    await p.keyboard.up('Control');
    await p.waitForTimeout(500);
    const s = await state(p);
    const zoomed = await size();
    check(s.laid === whole(s.zoom) && s.zoom > 1.5 && Math.abs(zoomed[1] - plain[1]) < 1 && Math.abs(zoomed[0] - plain[0]) < 1 && zoomed[1] <= 1280,
      `"LaTeX help" keeps its size and its place in the window at ${s.zoom.toFixed(2)}x (${Math.round(zoomed[1])} px wide, as on the normal page)`);
    await p.context().close();
  }

  console.log('6b. a pinch at the end of the page, the whole bank listed and its box scrolled: nothing jumps');
  {
    // set up on the real clock: under the test's clock WebKit does not draw the rows a scroll brings on screen, which a
    // real Safari has always drawn before a pinch can begin
    const p = await open('/problems.html', { clock: false });
    await p.locator('#bank-tree-topics .tt-name[data-slug=""]').click();
    await p.mouse.move(AT.x, AT.y);                                      // the click left the pointer on the tree
    await p.waitForTimeout(600);
    await p.evaluate(() => { scrollTo(0, 1e6); document.getElementById('bank-tree-panel').scrollTop = 900; });   // the page at its end
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.clock.install(); await p.clock.pauseAt(new Date(Date.now() + 5000));
    const stuck = () => p.evaluate(() => ['bank-tools', 'bank-right'].map(id => document.getElementById(id).getBoundingClientRect().top));
    const [tools0, list0] = await stuck();
    await p.keyboard.down('Control');
    await pin(p);
    const onRow = await p.evaluate(() => !!window.__pin.e.closest('#bank-results'));
    const first = await pinchTo(p, 1.05);
    const [tools1] = await stuck();
    check(onRow && first.worst < 1.5 && Math.abs(tools1 - (AT.y + (tools0 - AT.y) * first.zoom)) < 2,
      `the row of filters and the list stay where they were when the pinch begins (the row at ${tools0.toFixed(0)} px, then ${tools1.toFixed(0)} at ${first.zoom.toFixed(2)}x; the point on a row ${first.worst.toFixed(2)} px away)`);
    const far = await pinchTo(p, 2.4);
    await p.clock.runFor(300);
    const rest = await state(p), off = await pinned(p);
    check(far.worstPage < NEAR / 2 && off < NEAR && rest.laid === whole(rest.zoom),
      `pinched to ${rest.zoom.toFixed(2)}x over a row of the scrolled list: the point stays under the pointer while moving (${far.worstPage.toFixed(2)} px of the page) and when the page is laid out at ${rest.laid} (${off.toFixed(2)} px)`);
    const normal = await pinchBackToNormal(p);
    const left = await p.evaluate(() => [...document.querySelectorAll('.bank-tools, .bank-actions, .bank-status, .bank-right, .bank-results-head')].map(e => e.getAttribute('style') || '').join(''));
    const [tools2, list2] = await stuck();
    check(!normal.zoomed && left === '' && Math.abs(tools2 - tools0) < 2 && Math.abs(list2 - list0) < 2,
      `back at 1x everything sticks again where it was (the row at ${tools2.toFixed(0)}, the list at ${list2.toFixed(0)} px), no style left`);
    await p.keyboard.up('Control');
    await p.context().close();
  }

  for (const [label, before] of [['7. every other browser: the transform alone, as before', notSafari], ['8. a Safari that cannot lay a zoom out: the same', noZoomProperty]]) {
    console.log(label);
    const p = await open('/problems.html', { before });
    await p.keyboard.down('Control');
    await pin(p);
    const head = await p.evaluate(() => JSON.stringify(document.querySelector('.brand').getBoundingClientRect()));
    const start = await state(p);
    let still = true;
    const moving = await pinchTo(p, 1.8, m => { still = still && m.laid === 1 && m.x === 0 && m.y === 0; });
    check(/translate/.test(moving.transform) && still, `while the fingers move only the transform of the page changes: no layout, no real scroll (${moving.transform})`);
    await p.clock.runFor(400);
    const s = await state(p);
    check(s.laid === 1 && s.cls === 'page' && s.transform === `scale(${s.scale})` && Math.abs(s.zoom - moving.zoom) < 1e-4 && s.room && Math.abs(s.room[0] - start.w * s.zoom) < 1 && Math.abs(s.room[1] - start.h * s.zoom) < 1,
      `nothing is laid out again, and the room to scroll in is said outright (${s.transform}, room ${s.room && s.room.map(Math.round).join(' x ')})`);
    check(Math.abs(s.sw - s.vw * s.zoom) < 3 && moving.worst < 1.5 && await pinned(p) < 1.5 && s.told.length === 1, 'the magnified page can be reached, the place under the pointer has stayed, and the page is told');
    check(await p.evaluate(b => JSON.stringify(document.querySelector('.brand').getBoundingClientRect()) === b, head), 'the header has not moved by a pixel');
    const normal = await pinchBackToNormal(p);
    check(normal.attr === '' && !normal.zoomed && normal.sw === normal.vw, 'and pinching back returns to the normal page');
    await p.keyboard.up('Control');
    await p.context().close();
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

console.log(failures.length ? `\n${failures.length} FAILURE(S)` : `\nall pinch checks passed (${engine})`);
process.exit(failures.length ? 1 : 0);
