/* site.js — loaded by every page in <head>, before anything is painted (templates/base.html).
   - Light/dark theme: the saved choice, else the system setting.  A choice is saved only when the visitor clicks the
     button, so "follow the system" stays the default.  Storage may be blocked: then the choice lasts for the page.
     A page restored by Back/Forward, and the other open tabs, follow a choice made elsewhere.
   - The footer year (the build writes it too; this keeps it right in a new year).
   - A pinch keeps the header on screen: on a trackpad it magnifies only the page, and on a touch screen the header follows it.
   - A page whose script fails to load (a network error, a partial deploy, a browser too old) shows its
     [data-load-error] message instead of staying empty.  The page's module sets <html data-ready> when it has started;
     errors after that are not a failed load.
   A file, not an inline script: the pages' Content-Security-Policy allows no inline script. */
(function () {
  var root = document.documentElement;
  // 'color-mode' holds a clicked choice.  The old key 'theme' was written 'light' on every visit: only a 'dark' in it
  // was a real choice.
  function savedChoice() {
    try { return localStorage.getItem('color-mode') || (localStorage.getItem('theme') === 'dark' ? 'dark' : null); } catch (e) { return null; /* site data blocked */ }
  }
  function apply(choice) {
    var dark = false;
    try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* old browser */ }
    root.setAttribute('data-theme', choice === 'dark' || choice === 'light' ? choice : (dark ? 'dark' : 'light'));
  }
  apply(savedChoice());
  // Problems: a link that will show a list (the keys of bank-search.js::encodeState that make one) keeps the room for it, so that the
  // footer does not jump when the list arrives (site.css)
  if (/[?&](?:q|a|m|d|o|y|s)=[^&]/.test(location.search)) root.setAttribute('data-list', '');
  window.addEventListener('pageshow', function (e) { if (e.persisted) apply(savedChoice()); });
  try {     // with no choice saved, the page follows the system at once
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (!savedChoice()) apply(null); });
  } catch (e) { /* old browser */ }
  window.addEventListener('storage', function (e) { if (e.key === 'color-mode' && e.newValue) apply(e.newValue); });

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
  if (vv) {
    vv.addEventListener('resize', followPinch);
    vv.addEventListener('scroll', followPinch);
    window.addEventListener('pageshow', followPinch);
  }

  // A pinch on a trackpad is ours, so that the header cannot trail it: it magnifies .page with a transform, and the header,
  // outside .page, does not move at all. It arrives as wheel events with ctrlKey (Chrome, Edge, Firefox) or as gesture
  // events (Safari). A mouse wheel with Ctrl keeps the browser's zoom, and gesture events on a touch screen stay the browser's.
  // During the gesture one thing changes, once a frame: that transform, which the compositor applies by itself. No layout and
  // no scrolling: those are what make a zoom stutter. When the gesture ends, settlePinch hands the result to the real scroll.
  var MAX_ZOOM = 5, ZOOM_SPEED = 0.01;
  var zoom = 1, page = null, room = null;
  var pinch = null;     // during a gesture: the page's size, the real scroll, and the scroll that the transform shows
  var wanted = null, settling = 0, sharpening = 0;
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), Math.max(lo, hi)); }

  function beginPinch() {
    page = page || document.querySelector('.page');
    if (!page) return false;
    clearTimeout(sharpening);
    root.classList.add('is-zoomed');
    page.classList.add('is-zooming');
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
    page.style.transform = 'translate(' + (pinch.sx - pinch.x) + 'px,' + (pinch.sy - pinch.y) + 'px) scale(' + zoom + ')';
  }
  function queuePinch(scale, x, y) {
    if (!wanted) requestAnimationFrame(drawPinch);
    wanted = { scale: scale, x: x, y: y };
  }
  function settlePinch() {
    clearTimeout(settling);
    drawPinch();
    if (!pinch) return;
    var x = pinch.x, y = pinch.y, w = pinch.w, h = pinch.h;
    pinch = null;
    if (zoom < 1.01) { y /= zoom; x = 0; zoom = 1; }
    page.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')';
    root.classList.toggle('is-zoomed', zoom !== 1);
    // The room to scroll in, said outright: Safari keeps the scrollable size from an earlier step of a transform.
    if (!room) { room = document.createElement('div'); room.className = 'zoom-room'; document.body.appendChild(room); }
    room.style.width = zoom === 1 ? '' : w * zoom + 'px';
    room.style.height = zoom === 1 ? '' : h * zoom + 'px';
    window.scrollTo(x, y);
    sharpening = setTimeout(function () { page.classList.remove('is-zooming'); }, 100);   // drawn again at this scale: sharp
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
  if (!navigator.maxTouchPoints) {
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
