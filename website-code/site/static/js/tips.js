/* tips.js: the bubbles of the Problems page. One bubble for the whole page, moved to whatever asks for it: an element
   with data-tip="its text", or data-tip-from="the id of the element that holds its text".
   - With a mouse it shows while the pointer is on the element or on the bubble.
   - The keyboard shows it on the focus of a .tip-btn.
   - A click or a tap keeps it open until the next click or tap, or Escape.  A tap is read from the pointer events, because
     iOS sends no click for a tap on something without a handler of its own.  A tag that acts when pressed (it filters, or
     removes itself) gives no bubble then.
   It stays inside the window: under its element if it fits there, else above it. */
(function () {
  'use strict';
  var SEL = '[data-tip]:not([data-tip=""]), [data-tip-from]';
  var box = null, owner = null, kept = false, timer = 0;

  function place() {
    var r = owner.getBoundingClientRect(), b = box.getBoundingClientRect(), m = 8;
    var x = Math.max(m, Math.min(r.left, document.documentElement.clientWidth - b.width - m));
    var y = r.bottom + 6 + b.height <= window.innerHeight - m ? r.bottom + 6 : Math.max(m, r.top - 6 - b.height);
    box.style.setProperty('--x', Math.round(x) + 'px');
    box.style.setProperty('--y', Math.round(y) + 'px');
  }
  function show(el, keep) {
    clearTimeout(timer);
    if (!box) {
      box = document.createElement('div');
      box.id = 'tip'; box.className = 'tip'; box.setAttribute('role', 'tooltip');
      document.body.appendChild(box);
    }
    if (owner && owner !== el) owner.removeAttribute('aria-describedby');
    owner = el; kept = !!keep;
    var from = el.getAttribute('data-tip-from'), src = from && document.getElementById(from);
    box.textContent = src ? src.textContent : el.getAttribute('data-tip');
    box.hidden = false;
    el.setAttribute('aria-describedby', 'tip');
    place();
  }
  function hide() {
    clearTimeout(timer);
    if (!owner) return;
    owner.removeAttribute('aria-describedby');
    owner = null; kept = false; box.hidden = true;
  }

  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse' || kept || !e.target.closest) return;
    if (box && box.contains(e.target)) { clearTimeout(timer); return; }   // the pointer can move onto the bubble
    var el = e.target.closest(SEL);
    if (el) { if (el === owner) clearTimeout(timer); else show(el); }
    else if (owner) { clearTimeout(timer); timer = setTimeout(hide, 150); }
  });
  document.addEventListener('focusin', function (e) {
    if (!kept && e.target.matches && e.target.matches('.tip-btn:focus-visible')) show(e.target);
  });
  document.addEventListener('focusout', function (e) {
    if (!kept && e.target === owner) hide();
  });
  function pressed(target) {
    if (!target.closest || (box && box.contains(target))) return;
    var el = target.closest(SEL);
    if (el && target.closest('.bank-chip-x, .bank-chip-clickable')) el = null;
    if (el && !(kept && el === owner)) show(el, true);
    else if (owner) hide();
  }
  // in the capture phase: a tag's own handler may stop the click, or remove the tag from the page
  var down = null, lastTap = 0;
  document.addEventListener('pointerdown', function (e) { down = e.pointerType === 'mouse' ? null : e.target; }, true);
  document.addEventListener('pointercancel', function () { down = null; }, true);     // the finger went on to scroll
  document.addEventListener('pointerup', function () {
    if (!down) return;
    lastTap = Date.now();
    pressed(down);
    down = null;
  }, true);
  document.addEventListener('click', function (e) {
    if (Date.now() - lastTap > 600) pressed(e.target);      // the mouse and the keyboard; a tap has been dealt with
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide();
  });
  function moved() {
    if (owner) { if (kept && owner.getClientRects().length) place(); else hide(); }      // no box: its row has been filtered away
  }
  window.addEventListener('scroll', moved, { passive: true, capture: true });     // capture: the list's own scrolling too
  for (var ev of ['input', 'change', 'keyup']) document.addEventListener(ev, moved);      // typing or a filter may hide its row
  window.addEventListener('resize', moved);
})();
