/* site.js — loaded by every page in <head>, before anything is painted (templates/base.html).
   - Light/dark theme: the saved choice, else the system setting.  A choice is saved only when the visitor clicks the
     button, so "follow the system" stays the default.  Storage may be blocked: then the choice lasts for the page.
   - The footer year.
   - A page whose script fails to load (a network error, a partial deploy, a browser too old) shows its
     [data-load-error] message instead of staying empty.  The page's module sets <html data-ready> when it has started;
     errors after that are not a failed load.
   A file, not an inline script: the pages' Content-Security-Policy allows no inline script. */
(function () {
  var root = document.documentElement;
  // 'color-mode' holds a clicked choice.  The old key 'theme' was written 'light' on every visit: only a 'dark' in it
  // was a real choice.
  var saved = null;
  try { saved = localStorage.getItem('color-mode') || (localStorage.getItem('theme') === 'dark' ? 'dark' : null); } catch (e) { /* site data blocked */ }
  var dark = false;
  try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* old browser */ }
  root.setAttribute('data-bs-theme', saved === 'dark' || saved === 'light' ? saved : (dark ? 'dark' : 'light'));

  // the button's label ("Dark" / "Light") follows the theme through CSS (custom.css)
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#theme-toggle')) return;
    var next = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-bs-theme', next);
    try { localStorage.setItem('color-mode', next); } catch (err) { /* not saved: fine */ }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var y = document.getElementById('current-year');
    if (y) y.textContent = String(new Date().getFullYear());
  });

  window.addEventListener('error', function (e) {
    var t = e.target;
    var src = t && t.tagName === 'SCRIPT' ? t.src : e.filename;
    if (!src || src.indexOf(location.origin + '/') !== 0 || root.hasAttribute('data-ready')) return;   // the CDN, or later errors
    var boxes = document.querySelectorAll('[data-load-error]');
    for (var i = 0; i < boxes.length; i++) boxes[i].hidden = false;
  }, true);
})();
