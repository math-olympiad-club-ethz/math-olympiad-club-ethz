/* site.js — loaded by every page in <head>, before anything is painted (templates/base.html).
   - Light/dark theme: the saved choice, else the system setting.  A choice is saved only when the visitor clicks the
     button, so "follow the system" stays the default.  Storage may be blocked: then the choice lasts for the page.
     A page restored by Back/Forward, and the other open tabs, follow a choice made elsewhere.
   - The web fonts: their style sheet (fonts.css) put to use once the page has been painted.
   - The footer year (the build writes it too; this keeps it right in a new year).
   - A pinch keeps the header on screen: on a trackpad it magnifies only the page, and on a touch screen the header follows it.
   - A page whose script fails to load (a network error, a partial deploy, a browser too old) shows its
     [data-load-error] message instead of staying empty.  The page's module sets <html data-ready> when it has started;
     errors after that are not a failed load.
   A file, not an inline script: the pages' Content-Security-Policy allows no inline script. */
(function () {
  var root = document.documentElement;
  // 'color-mode' holds a clicked choice.
  function savedChoice() {
    try { return localStorage.getItem('color-mode'); } catch (e) { return null; /* site data blocked */ }
  }
  function apply(choice) {
    var dark = false;
    try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* old browser */ }
    root.setAttribute('data-theme', choice === 'dark' || choice === 'light' ? choice : (dark ? 'dark' : 'light'));
  }
  apply(savedChoice());
  // Problems: a link that will show a list (a topic or All problems, a=; or words, q=: bank-ui.js::loadFromUrl) keeps the
  // room for it, so that the footer does not jump when the list arrives (site.css)
  if (/[?&](?:q|a)=[^&]/.test(location.search)) root.setAttribute('data-list', '');
  // The web fonts' style sheet, put to use once the page has been painted: Safari paints nothing until the web fonts it
  // has been told about have arrived (1.4 s on a slow phone line, measured); the others swap them in anyway.  The
  // fallbacks take the same room (site.css), so the swap moves nothing.  On the next pages of a visit the fonts are in the
  // cache: put to use at once.  base.html fetches the style sheet early, and uses it as it is without scripts.
  var me = (document.currentScript && document.currentScript.src) || '';
  var staticBase = me.replace(/js\/site\.js(\?.*)?$/, '');            // .../static/, for the files below
  if (me) {
    var addFonts = function () {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = me.replace(/\/js\/site\.js/, '/css/fonts.css');      // with the same ?v= as this file
      link.onload = function () {
        try { document.fonts.load('18px "MOC Serif"').then(function () { try { sessionStorage.setItem('moc-fonts', '1'); } catch (e) { /* not kept */ } }, function () { /* not loaded: asked for later again */ }); } catch (e) { /* old browser */ }
      };
      document.head.appendChild(link);
    };
    var known = false;
    try { known = !!sessionStorage.getItem('moc-fonts'); } catch (e) { /* storage blocked */ }
    if (known) addFonts(); else requestAnimationFrame(function () { setTimeout(addFonts, 0); });
  }
  // Firefox gives a local fallback face (local() with size-adjust, site.css) only once it is asked for: asked for now, so
  // that the text before the swap already takes its final room (the header's words moved by 30 px without it)
  try {
    var ask = function (f) { document.fonts.load(f).catch(function () { /* not on this system: the next one in the list is */ }); };
    ['"MOC Menlo"', '"MOC Consolas"', '"MOC Mono"'].forEach(function (f) { ask('400 14px ' + f); });       // (the typewriter is never bold)
    ['"MOC Georgia"', '"MOC Times"', '"MOC Noto"'].forEach(function (f) { ask('400 18px ' + f); ask('700 18px ' + f); });
  } catch (e) { /* old browser */ }
  window.addEventListener('pageshow', function (e) { if (e.persisted) apply(savedChoice()); });
  try {     // with no choice saved, the page follows the system at once
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (!savedChoice()) apply(null); });
  } catch (e) { /* old browser */ }
  window.addEventListener('storage', function (e) { if (e.key === 'color-mode' && e.newValue) apply(e.newValue); });

  // the other theme's logos (backgrounds in site.css, so not fetched yet) start downloading as soon as the button is
  // pointed at, pressed or focused: they would otherwise arrive during the fade
  var warmed = false;
  function warmOtherTheme(e) {
    if (warmed || !staticBase || !e.target.closest || !e.target.closest('#theme-toggle')) return;
    warmed = true;
    var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', files = ['images/club_logo_' + t + '_176.webp?v=2'];
    if (document.querySelector('.sponsor-logo')) files.push('images/janestreet_logo_' + t + '_512.webp');
    files.forEach(function (f) { new Image().src = staticBase + f; });
  }
  ['pointerover', 'pointerdown', 'focusin'].forEach(function (ev) { document.addEventListener(ev, warmOtherTheme, true); });

  // the button's label ("Dark" / "Light") follows the theme through CSS (site.css)
  // The browser cross-fades a picture of the page in the old colours into the page in the new ones, all of it together
  // (site.css). Where it cannot, or where the visitor asks for less motion, the colours simply change.
  var fading = null;
  document.addEventListener('click', function (e) {
    // during the fade the page is a picture and a click lands on <html>: it ends the fade and reaches what is under it
    if (fading && e.target === root) {
      var f = fading;
      f.skipTransition();
      f.finished.then(function () {
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) return;
        if (el.matches && el.matches('input, textarea, select')) el.focus();
        if (el.click) el.click();
      });
      return;
    }
    if (!e.target.closest || !e.target.closest('#theme-toggle')) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('color-mode', next); } catch (err) { /* not saved: fine */ }
    var change = function () { root.setAttribute('data-theme', next); };
    var calm = false;
    try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (err) { /* old browser */ }
    if (!document.startViewTransition || calm) { change(); return; }
    root.classList.add('theme-switching');
    var fade = document.startViewTransition(change);
    fading = fade;
    var done = function () { if (fading === fade) { fading = null; root.classList.remove('theme-switching'); } };
    fade.ready.catch(function () { /* skipped by a second click: the colours have still changed */ });
    fade.finished.then(done, done);
  });

  // A pinch on a touch screen is the browser's own: it moves the "visual viewport" inside the page, and a fixed element
  // stays behind in the page's own view. The header is moved to the top of what is on screen by hand, and scaled back to
  // its normal size (origin in site.css). This runs apart from the browser's pinch, so the header trails it a little.
  var vv = window.visualViewport, head = null;
  function followPinch() {
    if (!vv) return;
    head = head || document.querySelector('.site-head');
    if (!head) return;
    var s = Math.max(1, vv.scale), x = Math.max(0, vv.offsetLeft), y = Math.max(0, vv.offsetTop);
    // a phone's keyboard moves this viewport too: in landscape, with so little left, the header gives its room to the field
    var typing = s < 1.001 && vv.height < 260;
    head.style.transform = typing || (s < 1.001 && x < 0.5 && y < 0.5) ? '' : 'translate(' + x + 'px,' + y + 'px) scale(' + 1 / s + ')';
  }
  // and the page is told the new size once the fingers are gone, for what it draws pixel by pixel itself (as after a pinch
  // on a trackpad: see tellZoom below)
  var scaleTold = 1, scaleTimer = 0;
  function followScale() {
    clearTimeout(scaleTimer);
    scaleTimer = setTimeout(function () {
      var s = vv.scale || 1;
      if (Math.abs(s / scaleTold - 1) < 0.05) return;
      scaleTold = s;
      try { window.dispatchEvent(new CustomEvent('pagezoom', { detail: s })); } catch (e) { /* an old browser: nobody to tell */ }
    }, 250);
  }
  if (vv) {
    vv.addEventListener('resize', followPinch);
    vv.addEventListener('resize', followScale);
    vv.addEventListener('scroll', followPinch);
    window.addEventListener('pageshow', followPinch);
  }

  // A pinch on a trackpad is ours, so that the header cannot trail it: it magnifies .page, and the header, outside .page,
  // does not move at all. It arrives as wheel events with ctrlKey (Chrome, Edge, Firefox) or as gesture events (Safari). A
  // mouse wheel with Ctrl keeps the browser's zoom, and gesture events on a touch screen stay the browser's.
  // During the gesture one thing changes, once a frame: a transform of .page, which the compositor applies by itself. No
  // layout and no scrolling: those are what make a zoom stutter. When the gesture ends, settlePinch hands the result to the
  // real scroll.
  // A transform alone stretches a picture of the page, and a stretched picture is soft. Chrome and Firefox draw the page
  // again at its new size once the gesture is over; Safari keeps the picture for as long as the transform lasts. So in
  // Safari a magnified page is also laid out bigger (`base`, the CSS zoom of .page): at the whole number at or above the
  // zoom shown (`zoom`), which the transform brings down to it. Every letter is then drawn with at least the pixels the
  // screen shows, at every zoom up to the largest: never stretched, so always sharp.
  //   - A whole number: only then is the layout the same, only bigger (measured in Safari's engine on the Problems page:
  //     what is on screen stays within 0.1 px; laid out at 1.3 itself, boxes move by up to 3 px as the page sharpens).
  //   - The next one up, not more: the picture has at most twice the screen's pixels each way (1.01x is laid out at 2),
  //     so zooming back out never has much more to draw than the screen shows.
  //   - While the fingers move, the layout changes only on the way out, as the zoom passes a whole number (one frame
  //     each): that keeps the bound above.  On the way in, the picture is stretched until the fingers rest or leave.
  //   - Safari only: the others draw a transformed page again by themselves, and Chrome's layout at a zoom is not quite
  //     the same layout (it gives a line that mixes two fonts a whole number of pixels).
  // Everywhere else base stays 1, and the transform does it all.
  var MAX_ZOOM = 5, ZOOM_SPEED = 0.01;
  var REST = 200;       // ms without a change: the fingers rest
  var zoom = 1, base = 1, page = null, room = null;
  var safari = 'GestureEvent' in window;     // WebKit: the only engine with these events
  var layout = null;    // is the zoom laid out? Not asked before the first pinch
  var unit = false;     // does the zoom of an element also multiply the lengths of its own transform?
  var pinch = null;     // during a gesture: the page's size, the real scroll, and the scroll that the transform shows
  var wanted = null, settling = 0, resting = 0, sharpening = 0, told = 1;
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), Math.max(lo, hi)); }
  // What sticks (the Problems page's row of filters, its list and the list's head) stops sticking while the page is
  // magnified (site.css .is-zoomed): each is held where it was on screen when the pinch began, so that nothing jumps on a
  // scrolled page; let go back at 1x.
  var STUCK = '.bank-tools, .bank-actions, .bank-status, .bank-right, .bank-results-head, .pp-sheet-col', held = [];
  function holdStuck() {
    var els = document.querySelectorAll(STUCK), was = [], i;
    for (i = 0; i < els.length; i++) was.push(els[i].getBoundingClientRect().top);
    // the list's box: every row is drawn while magnified (site.css), so rows that were never drawn take their real height;
    // its first row on screen, drawn, is held at its place in the box (the first row in the box can be above the screen,
    // never drawn, and the browser's own scroll anchoring holds that one)
    var box = document.getElementById('bank-tree-panel'), first = null, at = 0;
    if (box && box.scrollTop) {
      var rows = box.querySelectorAll('#bank-results > li:not([hidden])'), top = box.getBoundingClientRect().top, from = Math.max(top, 0);
      for (i = 0; i < rows.length && !first; i++) if (rows[i].getBoundingClientRect().bottom > from) { first = rows[i]; at = first.getBoundingClientRect().top - top; }
    }
    root.classList.add('is-zoomed');
    if (first) box.scrollTop += first.getBoundingClientRect().top - box.getBoundingClientRect().top - at;
    for (i = 0; i < els.length; i++) {
      var d = was[i] - els[i].getBoundingClientRect().top;
      if (Math.abs(d) > 0.5) { els[i].style.position = 'relative'; els[i].style.top = d + 'px'; held.push(els[i]); }
    }
  }
  function letGoStuck() {
    for (var i = 0; i < held.length; i++) { held[i].style.removeProperty('position'); held[i].style.removeProperty('top'); }
    held = [];
  }
  function laidFor(z) { return z <= 1 ? 1 : Math.ceil(z - 1e-9); }      // the whole number at or above a zoom

  // The zoom is laid out in Safari, if the CSS zoom property is there and a zoomed box measures what it shows (as under a
  // transform, which the pages' scripts count on). Asked once, of a box nobody sees.
  function probeZoom() {
    layout = false;
    try {
      if (!safari || !window.CSS || !CSS.supports || !CSS.supports('zoom', '2')) return;
      var box = document.createElement('div'), s = box.style;
      s.position = 'absolute'; s.left = '0'; s.top = '0'; s.width = '10px'; s.height = '10px'; s.visibility = 'hidden'; s.pointerEvents = 'none';
      s.zoom = '2';
      document.body.appendChild(box);
      var wide = box.getBoundingClientRect().width, own = box.offsetWidth, left = box.getBoundingClientRect().left;
      s.transform = 'translate(10px, 0)';
      var moved = box.getBoundingClientRect().left - left;
      document.body.removeChild(box);
      unit = Math.abs(moved - 20) < 0.5;
      layout = Math.abs(wide - 20) < 0.5 && own === 10 && (unit || Math.abs(moved - 10) < 0.5);
    } catch (e) { layout = false; }
  }
  // The page laid out b times bigger: 1, or the whole number at or above the zoom while it is magnified (site.css takes
  // it out of the flow then, so that the room to scroll in is the room of what is shown). `width`: the page's own width,
  // before any zoom.
  function setBase(b, width) {
    if (!layout || b === base) return;
    base = b;
    page.classList.toggle('is-laid', b !== 1);
    page.style.zoom = b === 1 ? '' : String(b);
    page.style.width = b === 1 ? '' : width + 'px';     // said in px: the same layout, where a width left to itself would be the window's
    if (b === 1) page.style.removeProperty('--page-zoom'); else page.style.setProperty('--page-zoom', String(b));   // for what must keep its size (site.css)
  }

  function beginPinch() {
    page = page || document.querySelector('.page');
    if (!page) return false;
    if (layout === null) probeZoom();
    clearTimeout(sharpening);
    if (!root.classList.contains('is-zoomed')) holdStuck();
    page.classList.add('is-zooming');
    // offsetWidth and offsetHeight: the page's size before any zoom, whatever is laid out now
    pinch = { w: page.offsetWidth, h: page.offsetHeight, vw: root.clientWidth, vh: root.clientHeight,
      sx: window.scrollX, sy: window.scrollY, x: window.scrollX, y: window.scrollY };
    return true;
  }
  function drawPinch() {
    var n = wanted;
    wanted = null;
    if (!n || !pinch) return;
    var px = (pinch.x + n.x) / zoom, py = (pinch.y + n.y) / zoom;   // the point under the fingers stays under them
    zoom = clamp(n.scale, 1, MAX_ZOOM);
    pinch.x = clamp(px * zoom - n.x, 0, pinch.w * zoom - pinch.vw);
    pinch.y = clamp(py * zoom - n.y, 0, pinch.h * zoom - pinch.vh);
    if (layout && laidFor(zoom) < base) setBase(laidFor(zoom), pinch.w);     // on the way out, past a whole number
    showPinch();
  }
  function showPinch() {     // the layout, base times bigger, brought to the size asked for and to the place the gesture has reached
    var per = unit ? base : 1;
    page.style.transform = 'translate(' + (pinch.sx - pinch.x) / per + 'px,' + (pinch.sy - pinch.y) / per + 'px) scale(' + zoom / base + ')';
  }
  function queuePinch(scale, x, y) {
    if (!wanted) requestAnimationFrame(drawPinch);
    wanted = { scale: scale, x: x, y: y };
    clearTimeout(resting);
    resting = setTimeout(restPinch, REST);
  }
  // Tells the page when the gesture has ended, for what it draws pixel by pixel itself (a statement on a canvas: bank-ui.js
  // draws it again for this size)
  function tellZoom() {
    if (told === zoom) return;
    told = zoom;
    try { window.dispatchEvent(new CustomEvent('pagezoom', { detail: zoom })); } catch (e) { /* an old browser: nobody to tell */ }
  }
  function restPinch() {     // the fingers rest on the trackpad: sharp now, not only when they leave it
    drawPinch();
    if (!pinch || !layout || laidFor(zoom) === base) return;
    setBase(laidFor(zoom), pinch.w);
    showPinch();
  }
  function settlePinch() {
    clearTimeout(settling);
    clearTimeout(resting);
    drawPinch();
    if (!pinch) return;
    var x = pinch.x, y = pinch.y, w = pinch.w, h = pinch.h;
    pinch = null;
    if (zoom < 1.01) { y /= zoom; x = 0; zoom = 1; }
    setBase(laidFor(zoom), w);
    page.style.transform = zoom === base ? '' : 'scale(' + zoom / base + ')';
    if (zoom === 1) { root.classList.remove('is-zoomed'); letGoStuck(); }
    // The room to scroll in, said outright: Safari keeps the scrollable size from an earlier step of a transform.
    if (!room) { room = document.createElement('div'); room.className = 'zoom-room'; document.body.appendChild(room); }
    room.style.width = zoom === 1 ? '' : w * zoom + 'px';
    room.style.height = zoom === 1 ? '' : h * zoom + 'px';
    window.scrollTo(Math.round(x), Math.round(y));     // a whole pixel, the nearest: some browsers would cut the fraction off
    if (zoom === 1 && !page.style.length) page.removeAttribute('style');
    sharpening = setTimeout(function () { page.classList.remove('is-zooming'); }, 100);   // not at once: the next pinch may follow
    tellZoom();
  }
  window.addEventListener('wheel', function (e) {
    if (!e.ctrlKey || e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50) {
      if (pinch) settlePinch();             // scrolling again: from the place the pinch ended
      return;
    }
    e.preventDefault();
    if (!pinch && !beginPinch()) return;
    queuePinch((wanted ? wanted.scale : zoom) * Math.exp(-e.deltaY * ZOOM_SPEED), e.clientX, e.clientY);
    clearTimeout(settling);
    settling = setTimeout(settlePinch, 150);   // these events have no end: their silence is it
  }, { passive: false });
  if (!navigator.maxTouchPoints && safari) {     // Safari on a Mac: the only browser that sends these events
    // A pinch on a Mac happens at the pointer, which does not move during it. Its place comes from there rather than from the
    // gesture event, whose coordinates cannot be relied on.
    var gestureFrom = 1, pointerX = null, pointerY = null;
    window.addEventListener('mousemove', function (e) { pointerX = e.clientX; pointerY = e.clientY; }, { passive: true });
    window.addEventListener('gesturestart', function (e) { e.preventDefault(); if (pinch) settlePinch(); beginPinch(); gestureFrom = zoom; }, { passive: false });
    window.addEventListener('gesturechange', function (e) {
      e.preventDefault();
      if (!pinch) return;
      queuePinch(gestureFrom * e.scale, pointerX !== null ? pointerX : e.clientX || window.innerWidth / 2, pointerY !== null ? pointerY : e.clientY || window.innerHeight / 2);
    }, { passive: false });
    window.addEventListener('gestureend', function (e) { e.preventDefault(); settlePinch(); }, { passive: false });
  }
  // The window changes size under a page laid out bigger: the page keeps the width it would have without the zoom.
  window.addEventListener('resize', function () {
    if (base === 1 || !page) return;
    if (pinch) settlePinch();
    if (base === 1) return;
    page.style.width = page.parentNode.clientWidth + 'px';
    if (room) { room.style.width = page.offsetWidth * zoom + 'px'; room.style.height = page.offsetHeight * zoom + 'px'; }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var y = document.getElementById('current-year');
    if (y) y.textContent = String(new Date().getFullYear());
    followPinch();
  });

  window.addEventListener('error', function (e) {
    var t = e.target;
    var src = t && t.tagName === 'SCRIPT' ? t.src : e.filename;
    if (!src || src.indexOf(location.origin + '/') !== 0 || root.hasAttribute('data-ready')) return;   // another site's script, or later errors
    var show = function () {
      var boxes = document.querySelectorAll('[data-load-error]');
      for (var i = 0; i < boxes.length; i++) boxes[i].hidden = false;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();   // the box may not be parsed yet
  }, true);
})();
