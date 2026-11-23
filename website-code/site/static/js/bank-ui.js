/* bank-ui.js — the Problems page: the search bar (an accessible combobox), the filters (a word each, with its menu), the
   tree of topics and, beside it, the list of the topic chosen; the selection, the PDF order (automatic, or dragged by
   hand), and Create: the problems PDF, then the solutions PDF on request, compiled in the browser.  One rule for
   everything that opens: it opens where it is clicked, and a second click closes it.  No framework, no build step.
   Data comes inline from <script type="application/json" id="bank-data"> written by build.py. */

// The page loads this file as bank-ui.js?v=<build>.  The other modules are imported with the same ?v= (a relative
// import does not inherit the query), so a browser never runs a cached module of the last deploy next to new ones.
const V = new URL(import.meta.url).search;
const [S, C, F] = await Promise.all([import(`./bank-search.js${V}`), import(`./bank-compile.js${V}`), import(`./tree-fold.js${V}`)]);

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') for (const [prop, val] of Object.entries(v)) e.style.setProperty(prop, val);   // CSSOM: allowed by the page's CSP
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
};

/* ------------------------------------------------------------------ state */
const data = JSON.parse($('bank-data').textContent);
const cat = S.buildCatalogue(data.tags);
const problems = S.sortProblems(data.index.problems);
const byId = new Map(problems.map(p => [p.id, p]));
const reviewed = problems.filter(p => !p.proposed);          // proposed problems (not reviewed yet) wait behind their switch
const shownTotal = () => (state.filters.showProposed ? problems : reviewed).length;
// problems per tag: the list offers only tags that have some (among the problems the switch lets through)
const counts = { all: S.tagCounts(problems, cat), reviewed: S.tagCounts(reviewed, cat) };
const countOf = (type, slug) => (state.filters.showProposed ? counts.all : counts.reviewed).get(type + ':' + slug) || 0;
const inlinePdf = navigator.pdfViewerEnabled !== false;     // no built-in PDF viewer (Chrome on Android): links, no frame
const reducedMotion = F.reducedMotion;
const smooth = () => reducedMotion() ? 'auto' : 'smooth';
const state = {
  filters: S.emptyFilters(),
  selection: new Set(),
  order: null,            // null = automatic PDF order (S.autoOrder); otherwise the IDs in the order chosen by hand
  results: [],
  all: false,             // All problems chosen in the tree: the whole bank is listed (no link says it: a link names its topic or its filters)
  list: { open: false, items: [], active: -1 },      // the suggestions under the search bar
  menu: null,             // the filter whose menu is open (a key of FILTERS)
  busy: false,
};

function loadFromUrl(first = false) {
  let decoded;
  try { decoded = S.decodeState(location.search, cat); }
  catch (e) { decoded = { filters: S.emptyFilters(), selection: [], order: null }; }      // a broken link: start empty
  const { filters, selection, order } = decoded;
  state.filters = filters;
  // a hand-written link may name years the bank does not have: the filter takes the years the slider can show
  const [yearLo, yearHi] = yearIndices(filters);
  if (filters.yearFrom != null) filters.yearFrom = yearLo === 0 ? null : YEARS[yearLo];
  if (filters.yearTo != null) filters.yearTo = yearHi === YMAX ? null : YEARS[yearHi];
  // on arrival, what was typed while this script was on its way stays
  const box = $('bank-search');
  if (first && box.value.trim() && !filters.text) filters.text = box.value.trim(); else box.value = filters.text;
  state.selection = new Set(selection.filter(id => byId.has(id)));
  state.order = order ? order.filter(id => byId.has(id)) : null;
  if (state.order && !state.order.length) state.order = null;
  if ([...state.selection].some(id => byId.get(id).proposed)) state.filters.showProposed = true;   // a link to a proposed problem shows it
  state.all = false;
  for (const a of state.filters.area) reveal(a);        // the topic of a link can be seen in the tree
}
let urlTimer = null;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const qs = S.encodeState(state.filters, [...state.selection], state.order);
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }, 150);
}

/* ------------------------------------------------------------------ tags on a problem */
function tagBadge(type, slug, { clickable = false, typeLabel = S.TYPE_LABEL[type] } = {}) {
  const tag = S.getTag(cat, type, slug) || { name: slug };
  const b = el('span', { class: `bank-chip bank-chip-${type}`, 'data-tip': type === 'area' ? S.areaPath(cat, slug) : (tag.description || '') });   // the bubble: tips.js
  b.append(el('span', { class: 'bank-chip-type', text: typeLabel }), el('span', { text: tag.name }));
  if (clickable) {
    b.classList.add('bank-chip-clickable');
    b.setAttribute('role', 'button'); b.tabIndex = -1;      // a mouse shortcut: the keyboard picks tags in the search bar and the filters (fewer Tab stops per row)
    const add = (e) => { e.preventDefault(); e.stopPropagation(); pickTag(type, slug); listIntoView(); };
    b.addEventListener('click', add);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') add(e); });
  }
  return b;
}

/* A tag pressed on a problem, or picked among the suggestions of the search bar.  A topic is chosen as in the tree (one
   at a time, and the tree unfolds to it); any other tag joins its filter. */
function pickTag(type, slug) {
  if (!S.getTag(cat, type, slug)) return;
  const f = state.filters;
  if (type === 'area') { f.area = [slug]; state.all = false; reveal(slug); tree.linked = true; tree.phoneOpen = false; }
  else if (!f[type].includes(slug)) { f[type] = [...f[type], slug]; if (type === 'methods') f.showMethods = true; }
  update();
  // a topic far down the tree: brought into sight, lit (on a phone the tree has folded into its line)
  const lit = type === 'area' && !$('bank-tree-topics').hidden && $('bank-tree-topics').querySelector('.tt-name[aria-current]');
  if (lit) { const r = lit.getBoundingClientRect(); if (r.top < document.querySelector('.site-head').offsetHeight || r.bottom > innerHeight - 8) lit.scrollIntoView({ block: 'center', behavior: smooth() }); }
}

/* A tag pressed far down a list shrinks it: the top of the list comes back into view. */
function listIntoView() {
  const panel = $('bank-tree-panel'), r = panel.getBoundingClientRect(), bar = stickyBar();
  if (r.top < (bar ? bar.getBoundingClientRect().bottom : document.querySelector('.site-head').offsetHeight) || r.top > innerHeight) panel.scrollIntoView({ block: 'start', behavior: smooth() });
}

/* The difficulty is a human's rating.  Until someone rates a problem, its chip says "none" and carries the AI's
   estimate in small print; that estimate still drives the difficulty filter and the automatic PDF order. */
const diffName = slug => (S.getTag(cat, 'difficulty', slug) || { name: slug }).name;
function difficultyChip(p) {
  if (p.difficultySource === 'human') return tagBadge('difficulty', p.difficulty, { clickable: true });
  const chip = el('span', { class: 'bank-chip bank-chip-unrated' },
    el('span', { class: 'bank-chip-type', text: S.TYPE_LABEL.difficulty }), el('span', { text: 'None' }));
  if (p.difficultySource === 'ai') {
    chip.dataset.tip = 'AI difficulty rating';
    chip.append(el('span', { class: 'bank-ai', text: `AI: ${diffName(p.difficulty)}` }));
  }
  return chip;
}
const difficultyText = p => p.difficultySource === 'human' ? diffName(p.difficulty)
  : p.difficultySource === 'ai' ? `Difficulty none (AI: ${diffName(p.difficulty)})` : 'Difficulty none';

/* ------------------------------------------------------------------ the search bar: titles as you type, and the tags the words could mean */
/* What is typed filters the titles at once.  Under the bar, the tags those words could stand for: only tags that some
   problem has, each with its number of problems (methods only while they are shown). */
function listItems() {
  const q = $('bank-search').value;
  if (!S.normalize(q)) return [];
  const n = state.results.length;
  const types = state.filters.showMethods ? null : S.TAG_TYPES.filter(t => t !== 'methods');
  const tags = S.suggest(cat, q, state.filters, Infinity, types).filter(({ tag }) => countOf(tag.type, tag.slug) > 0).slice(0, 12)
    .map(({ tag }) => ({ tag, label: tag.name, count: countOf(tag.type, tag.slug), sub: tag.type === 'area' ? (tag.parent ? S.areaPath(cat, tag.slug) : tag.description || '') : tag.type === 'methods' ? tag.group : (tag.description || '') }));
  if (!n) return [{ header: `No title contains “${q.trim()}”.` + (tags.length ? ' Press Enter to filter by the first tag.' : '') }, ...tags];   // see Enter in wire()
  const head = { header: `${n} problem${n === 1 ? '' : 's'} with “${q.trim()}” in the title. Press Enter to see them.` };
  return tags.length ? [head, { header: 'Or filter by one of these tags' }, ...tags] : [head];
}

function renderList() {
  const box = $('bank-listbox'), input = $('bank-search');
  state.list.items = state.list.open ? listItems() : [];
  if (!state.list.items.length) {
    box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    return;
  }
  box.replaceChildren();
  state.list.items.forEach((it, i) => {
    if (it.header) { box.append(el('div', { class: 'bank-list-header', role: 'presentation', text: it.header })); return; }
    const row = el('div', { class: `bank-option bank-option-${it.tag.type}`, role: 'option', id: `bank-opt-${i}`, 'aria-selected': 'false', 'data-index': i },
      el('span', { class: 'bank-option-type', text: S.TYPE_LABEL[it.tag.type] }), el('span', { class: 'bank-option-label', text: it.label }),
      it.sub ? el('span', { class: 'bank-option-sub', text: it.sub }) : null, el('span', { class: 'bank-option-count', text: String(it.count) }));
    row.addEventListener('click', e => { e.stopPropagation(); chooseItem(i); });
    box.append(row);
  });
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  setActive(state.list.active, false);
  fitList();
}

function setActive(i, scroll = true) {
  const items = state.list.items;
  if (i < 0 || !items[i] || !items[i].tag) i = -1;
  state.list.active = i;
  document.querySelectorAll('#bank-listbox .bank-option-active').forEach(e => e.classList.remove('bank-option-active'));
  if (i >= 0) {
    const row = document.getElementById(`bank-opt-${i}`);
    if (row) { row.classList.add('bank-option-active'); if (scroll) row.scrollIntoView({ block: 'nearest' }); }
    $('bank-search').setAttribute('aria-activedescendant', `bank-opt-${i}`);
  } else $('bank-search').removeAttribute('aria-activedescendant');
}

function moveActive(delta) {
  const options = state.list.items.map((it, k) => (it.tag ? k : -1)).filter(k => k >= 0);
  if (!options.length) return;
  const pos = options.indexOf(state.list.active);
  const next = pos < 0 ? (delta > 0 ? 0 : options.length - 1) : Math.min(options.length - 1, Math.max(0, pos + delta));
  setActive(options[next]);
}

function openList() { state.list.open = true; state.list.active = -1; renderList(); fitList(true); }
/* On a small window, or over a phone's keyboard, the list would open below what can be seen: on opening, the search box goes up
   to the header; and whenever it is drawn, the list keeps to the room left below it. */
function fitList(scroll = false) {
  const box = $('bank-listbox');
  if (box.hidden) return;
  const vv = window.visualViewport, bottom = vv ? vv.height + vv.offsetTop : innerHeight;
  let top = box.getBoundingClientRect().top;
  if (scroll && top + box.offsetHeight > bottom) {
    const up = $('bank-searchbox').getBoundingClientRect().top - document.querySelector('.site-head').offsetHeight - 8;
    if (up > 0) { window.scrollBy(0, up); top -= up; }
  }
  box.style.setProperty('max-height', `${Math.max(120, Math.min(innerHeight * .6, bottom - top - 8))}px`);
}
function closeList() { state.list.open = false; state.list.active = -1; renderList(); }

function chooseItem(i) {
  const it = state.list.items[i];
  if (!it || !it.tag) return;
  const input = $('bank-search');
  input.value = '';
  state.filters.text = '';                  // the typed words were there to find this tag, not to search titles
  closeList();                              // gone from the screen at once: update() draws only an open list
  pickTag(it.tag.type, it.tag.slug);
  input.focus();
}

/* ------------------------------------------------------------------ the filters: a word each, and its menu */
/* Under the search bar, one word per filter.  A word opens its menu under it: every choice with the number of problems
   it would leave, whatever else is chosen, so that no choice is a dead end.  A filter that is set is filled, says what it
   keeps and carries a cross that clears it.  One rule, no "and" or "or" to choose: inside one filter any of its choices
   will do (Easy and Medium: problems that are either), and every filter set must hold (Easy and IMC: easy IMC problems). */

/* Origin years: two handles that step through the years that occur in the bank (not a linear scale: most problems are
   recent, a few are centuries old).  Both handles at the ends = no year filter. */
const YEARS = [...new Set(problems.map(p => p.originYear).filter(y => Number.isInteger(y)))].sort((a, b) => a - b);
const YMAX = Math.max(0, YEARS.length - 1);

function yearIndices(f) {
  let [from, to] = [f.yearFrom, f.yearTo];
  if (from != null && to != null && from > to) [from, to] = [to, from];
  let lo = from == null ? 0 : YEARS.findIndex(y => y >= from);
  let hi = to == null ? YMAX : YEARS.length - 1 - [...YEARS].reverse().findIndex(y => y <= to);
  if (lo < 0) lo = YMAX;
  if (hi > YMAX) hi = 0;
  return [lo, Math.max(lo, hi)];
}

const SOLVED = { all: 'Any', full: 'Full solution', incomplete: 'Incomplete solution' };      // the words of the row markers
const few = (names, word) => names.length <= 2 ? names.join(', ') : `${names.length} ${word}`;
const tagNames = (type, slugs) => [...cat.byType[type].values()].filter(t => slugs.includes(t.slug)).map(t => t.name);      // in the order of tags.yml
/* What would be left with one filter changed: the numbers beside the choices of a menu, and beside the topics of the tree. */
const without = change => S.filterProblems(problems, { ...state.filters, ...change }, cat);
function flip(type, slug) {
  const f = state.filters;
  f[type] = f[type].includes(slug) ? f[type].filter(s => s !== slug) : [...f[type], slug];
  update();
}

/* The pieces of a menu.  A choice is a tick box (or one of a set, `one`) with its number; none left: it steps back. */
function choice(key, label, n, on, pick, one = false) {
  const row = el('div', { class: 'bank-option' + (on ? ' bank-option-selected' : '') + (n || on ? '' : ' bank-option-none'), role: one ? 'radio' : 'checkbox', 'aria-checked': String(!!on), tabindex: '-1', 'data-opt': key },
    el('span', { class: 'bank-option-label', text: label }), el('span', { class: 'bank-option-count', text: String(n) }));
  row.addEventListener('click', pick);
  row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  return row;
}
const menuHeader = text => el('div', { class: 'bank-list-header', role: 'presentation', text });
const menuNote = text => el('p', { class: 'bank-menu-note', text });
function menuSwitch(id, label, on, change) {
  const sw = el('input', { type: 'checkbox', role: 'switch', id });
  sw.checked = on;
  sw.addEventListener('change', () => change(sw.checked));
  return el('div', { class: 'form-check form-switch' }, sw, el('label', { class: 'form-check-label', for: id, text: label }));
}

function yearsMenu(f) {
  let [lo, hi] = yearIndices(f);
  const ends = el('div', { class: 'bank-years' }, el('span'), el('span'));
  const box = el('div', { class: 'bank-range' }, el('div', { class: 'bank-range-track' }, el('div', { class: 'bank-range-fill' })));
  const handle = (id, name) => el('input', { type: 'range', class: 'bank-range-input', id, min: '0', max: String(YMAX), step: '1', 'aria-label': name });
  const from = handle('bank-year-lo', 'Origin year from'), to = handle('bank-year-hi', 'Origin year to');
  const draw = () => {
    box.style.setProperty('--lo', `${YMAX ? (lo / YMAX) * 100 : 0}%`);
    box.style.setProperty('--hi', `${YMAX ? (hi / YMAX) * 100 : 100}%`);
    from.style.setProperty('z-index', lo === YMAX ? '3' : 'auto');          // both at the end: the "from" handle must stay grabbable
    from.setAttribute('aria-valuetext', String(YEARS[lo])); to.setAttribute('aria-valuetext', String(YEARS[hi]));
    ends.firstChild.textContent = String(YEARS[lo]); ends.lastChild.textContent = String(YEARS[hi]);
  };
  const moved = e => {
    lo = Number(from.value); hi = Number(to.value);
    if (lo > hi) { if (e.target === from) { lo = hi; from.value = String(lo); } else { hi = lo; to.value = String(hi); } }     // the dragged handle stops at the other one
    const full = lo === 0 && hi === YMAX;
    f.yearFrom = full ? null : YEARS[lo];
    f.yearTo = full ? null : YEARS[hi];
    draw();
    update(false);          // the menu stays as it is: the handle being dragged is in it
  };
  from.value = String(lo); to.value = String(hi);
  from.addEventListener('input', moved); to.addEventListener('input', moved);
  box.append(from, to);
  draw();
  return [ends, el('div', { class: 'bank-menu-pad' }, box), menuNote('A problem with no known year always stays.')];
}

const FILTERS = [
  { key: 'difficulty', label: 'Difficulty', on: f => f.difficulty.length > 0, clear: f => { f.difficulty = []; },
    says: f => few(tagNames('difficulty', f.difficulty), 'difficulties'),
    menu: f => {
      const left = without({ difficulty: [] });
      return [...cat.byType.difficulty.values()].map(t => choice(t.slug, t.name, left.filter(p => p.difficulty === t.slug).length, f.difficulty.includes(t.slug), () => flip('difficulty', t.slug)));
    } },
  { key: 'origin', label: 'Origin', on: f => f.origin.length > 0, clear: f => { f.origin = []; },
    says: f => few(tagNames('origin', f.origin), 'origins'),
    menu: f => {
      const left = without({ origin: [] }), n = s => left.filter(p => p.origin === s || (p.alsoIn || []).includes(s)).length;
      const all = [...cat.byType.origin.values()].filter(t => countOf('origin', t.slug) > 0), out = [];
      for (const kind of new Set(all.map(t => t.kind))) {
        out.push(menuHeader(S.ORIGIN_KIND[kind] || kind), ...all.filter(t => t.kind === kind).map(t => choice(t.slug, t.name, n(t.slug), f.origin.includes(t.slug), () => flip('origin', t.slug))));
      }
      return out;
    } },
  { key: 'solved', label: 'Solution', on: f => f.solved !== 'all', clear: f => { f.solved = 'all'; }, says: f => SOLVED[f.solved],
    menu: f => {
      const left = without({ solved: 'all' });
      const full = left.filter(S.isComplete).length, n = { all: left.length, full, incomplete: left.length - full };
      return [...Object.keys(SOLVED).map(k => choice(k, SOLVED[k], n[k], f.solved === k, () => { f.solved = k; update(); }, true)),
        menuNote('Incomplete: the solution is unfinished, or not in the bank yet.')];
    } },
  YEARS.length > 1 && { key: 'years', label: 'Years', on: f => f.yearFrom != null || f.yearTo != null, clear: f => { f.yearFrom = null; f.yearTo = null; },
    says: f => { const [lo, hi] = yearIndices(f); return lo === hi ? String(YEARS[lo]) : `${YEARS[lo]} – ${YEARS[hi]}`; },
    menu: yearsMenu },
  { key: 'methods', label: 'Methods', on: f => f.showMethods, clear: f => { f.showMethods = false; f.methods = []; f.methodsInPdf = false; },
    says: f => f.methods.length ? few(tagNames('methods', f.methods), 'methods') : 'Methods shown',
    menu: f => {
      const out = [menuNote('A method can give the solution away, so methods stay hidden until you ask.'),
        menuSwitch('bank-show-methods', 'Show the methods', f.showMethods, on => { f.showMethods = on; if (!on) { f.methods = []; f.methodsInPdf = false; } update(); })];
      if (!f.showMethods) return out;
      out.push(menuSwitch('bank-methods-pdf', 'Also in the PDFs', f.methodsInPdf, on => { f.methodsInPdf = on; update(); }));
      const left = without({ methods: [] }), n = s => left.filter(p => p.methods.includes(s)).length;
      let group = null;
      for (const t of cat.byType.methods.values()) {
        if (!countOf('methods', t.slug)) continue;
        if (t.group !== group) { group = t.group; out.push(menuHeader(group)); }
        out.push(choice(t.slug, t.name, n(t.slug), f.methods.includes(t.slug), () => flip('methods', t.slug)));
      }
      return out;
    } },
  reviewed.length !== problems.length && { key: 'proposed', label: 'Proposed', on: f => f.showProposed, clear: f => { f.showProposed = false; }, says: () => 'Proposed shown',
    menu: f => [menuNote('Problems sent in that have not yet been checked.'), menuSwitch('bank-show-proposed', 'Show the proposed problems', f.showProposed, on => { f.showProposed = on; update(); })] },
].filter(Boolean);

/* The focus fell with what had it (a button gone, hidden or disabled): it is on the page itself. */
const lost = () => !document.activeElement || document.activeElement === document.body;
function focusFilter(key, cross = false) {
  const e = document.querySelector(`.bank-filter-${cross ? 'x' : 'word'}[data-filter="${key}"]`) || document.querySelector(`.bank-filter-word[data-filter="${key}"]`);
  if (e) e.focus({ preventScroll: true });
}
function renderFilters() {
  const f = state.filters, box = $('bank-filters'), had = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
  const again = had && had.dataset.filter ? [had.dataset.filter, had.classList.contains('bank-filter-x')] : null;
  const any = FILTERS.some(F => F.on(f)) || !!S.normalize(f.text);
  box.replaceChildren(...FILTERS.map(F => {
    const on = F.on(f), open = state.menu === F.key, says = on ? F.says(f) : F.label;
    return el('span', { class: 'bank-filter' + (on ? ' is-on' : '') },
      el('button', { type: 'button', class: 'bank-filter-word', 'data-filter': F.key, 'aria-expanded': String(open), 'aria-controls': 'bank-menu', 'aria-label': on && says !== F.label ? (says.startsWith(F.label) ? says : `${F.label}: ${says}`) : null,
        onclick: () => { state.menu = open ? null : F.key; renderFilters(); renderMenu(true); } }, says, el('span', { class: 'chev', 'aria-hidden': 'true' })),
      on ? el('button', { type: 'button', class: 'bank-filter-x', 'data-filter': F.key, 'aria-label': `Clear ${F.label}`, onclick: () => { F.clear(f); if (state.menu === F.key) state.menu = null; update(); focusFilter(F.key); } }, '×') : null);
  }), el('button', { type: 'button', id: 'bank-reset', class: 'btn btn-link bank-filters-clear' + (any ? '' : ' is-idle'), tabindex: any ? null : '-1', 'aria-hidden': any ? null : 'true',
    onclick: () => { clearFilters(); focusFilter(FILTERS[0].key); } }, 'Clear all'));      // its room kept while hidden: setting a first filter never wraps the row (site.css)
  if (again) focusFilter(...again);
}
/* The menu of the open word, under it; what had the keyboard in it keeps it. */
function renderMenu(enter = false) {
  const menu = $('bank-menu'), F = FILTERS.find(x => x.key === state.menu);
  menu.hidden = !F;
  if (!F) { menu.replaceChildren(); return; }
  const at = menu.scrollTop, had = menu.contains(document.activeElement) ? document.activeElement : null;
  const again = had && (had.dataset.opt != null ? `[data-opt="${had.dataset.opt}"]` : had.id ? `#${had.id}` : null);
  menu.replaceChildren(...F.menu(state.filters));
  // one Tab stop for its choices, the one in hand (or the first chosen, or the first): the arrows go through the others
  const rows = [...menu.querySelectorAll('.bank-option')], hold = (again && menu.querySelector(again)) || rows.find(r => r.getAttribute('aria-checked') === 'true') || rows[0];
  if (hold && hold.classList.contains('bank-option')) hold.tabIndex = 0; else if (rows[0]) rows[0].tabIndex = 0;
  menu.setAttribute('aria-label', F.label);
  const word = document.querySelector(`.bank-filter-word[data-filter="${F.key}"]`).parentElement;
  menu.style.setProperty('--at', `${Math.max(0, Math.min(word.offsetLeft - $('bank-filters').scrollLeft, $('bank-tools').clientWidth - menu.offsetWidth))}px`);
  // as tall as the room left on screen (above a phone's Create PDF bar), so that all of it can be reached without scrolling the page
  const vv = window.visualViewport, bar = $('bank-actions');
  let bottom = vv ? vv.height + vv.offsetTop : innerHeight;
  if (bar.classList.contains('has-ticks') && getComputedStyle(bar).position === 'fixed') bottom = Math.min(bottom, bar.getBoundingClientRect().top);
  menu.style.setProperty('max-height', `${Math.max(160, Math.min(.6 * innerHeight, 416, bottom - menu.getBoundingClientRect().top - 8))}px`);
  menu.scrollTop = at;
  const next = (again && menu.querySelector(again)) || (enter ? menu.querySelector('input, [tabindex="0"]') : null);
  if (next) next.focus({ preventScroll: true });
}
function closeMenu(refocus = false) {
  const key = state.menu;
  if (!key) return;
  state.menu = null;
  renderFilters(); renderMenu();
  if (refocus) focusFilter(key);
}
/* Clear all: the words and every filter; the topic chosen in the tree stays. */
function clearFilters() {
  const area = state.filters.area;
  state.filters = { ...S.emptyFilters(), area };
  $('bank-search').value = '';
  state.menu = null;
  update();
}

/* ------------------------------------------------------------------ Preview: one problem, read here */
/* The statement is typeset by pdfTeX (bank-compile.js makePreview) and drawn into the page by PDF.js (site/static/pdfjs/,
   copied by build.py; loaded on the first Preview): no frame, no toolbar, the page's own background and ink, and the size
   of the page's own text, which is Computer Modern too.  A text layer over the drawing lets it be selected and read
   aloud.  Where PDF.js cannot run, the browser's PDF frame as before.  The build has typeset every statement in advance
   (data.previews, C.pickPreview): a statement opens without the LaTeX engine, at once; the page typesets it itself only
   when that fails, or for a statement the build left out. */
let preview = null;         // {id, panel, btn, row, url, task, sheet, abort, status, done, measure, folding, watch}: one open at a time
const EASE = F.EASE;
const pxPerPt = () => (parseFloat(getComputedStyle(document.body).fontSize) || 18) / 10.95;   // the bank's \normalsize: 11pt class
const SHEET_PT = 426.79;    // the sheets' measure (preamble.tex: A4, 3 cm side margins): wider screens use it as it is
const PREVIEWS = data.previews || null;
const typeset = new Map();  // the URL of a PDF of the build's previews -> {bytes, task}: kept open, the next statement shares its fonts
/* A PDF of the build's previews, fetched whole and at once: with the drawing code (PDF.js), not after it (on slow 4G
   that halves the wait for a first statement). */
function typesetPdf(url) {
  let t = typeset.get(url);
  if (!t) {
    typeset.set(url, t = { task: null, bytes: fetch(new URL(url, document.baseURI)).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }) });
    t.bytes.catch(() => { if (typeset.get(url) === t) typeset.delete(url); });       // tried again at the next statement
  }
  return t;
}

let pdfjsLib = null, pdfWorker = null;
function loadPdfjs() {
  if (!pdfjsLib) {
    const v = data.pdfjs ? `?v=${encodeURIComponent(data.pdfjs)}` : '';
    pdfjsLib = import(new URL(`../pdfjs/pdf.min.mjs${v}`, import.meta.url).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL(`../pdfjs/pdf.worker.min.mjs${v}`, import.meta.url).href;
      // one worker for every statement, started once (otherwise each opening starts a new one and reads its 1 MB again:
      // measured on an iPhone, a statement drawn again in 113 ms instead of 226), and the page's own: given to each loading
      // task, which then cannot take it down when it ends (Safari, a statement reopened at once: "the worker is being
      // destroyed", and the plain PDF frame instead of the drawing)
      try { pdfWorker = new lib.PDFWorker({ port: new Worker(lib.GlobalWorkerOptions.workerSrc, { type: 'module' }) }); } catch (e) { pdfWorker = null; /* workerSrc then */ }
      return lib;
    });
    pdfjsLib.catch(() => { pdfjsLib = null; });       // tried again at the next Preview
  }
  return pdfjsLib;
}

/* The drawing code of the statements (PDF.js, some 540 KB) comes once a list has been on screen a moment, when the
   browser has nothing else to do and the connection does not ask to save data: a first statement then waits for its
   PDF alone (on slow 4G about 2 s instead of 5). */
let drawingAsked = false;
function prefetchDrawing() {
  if (drawingAsked) return;
  drawingAsked = true;
  try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) { /* ignore */ }
  const go = () => { loadPdfjs().catch(() => {}); };
  setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2000 }) : go()), 1500);
}

/* The measure of the statement, in pt: what the panel holds at the page's text size (the sheets' when it holds more). */
function panelWidth(panel) {
  const cs = getComputedStyle(panel);
  return panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}
function previewMeasure(panel) {           // 3 pt to spare: a line may end a hair past the measure
  return Math.max(150, Math.min(SHEET_PT, panelWidth(panel) / pxPerPt() - 2 * C.PREVIEW_MARGIN_PT - 3));
}

/* How magnified an element is shown: by a pinch on a trackpad (site.js lays the page out bigger, or scales it) and by a
   touch screen's own pinch (the visual viewport). */
const magnified = e => { const w = e.offsetWidth, vv = window.visualViewport; return (w ? Math.max(1, e.getBoundingClientRect().width / w) : 1) * Math.max(1, (vv && vv.scale) || 1); };
/* The most pixels a statement's drawing may have on this setup: on a phone or a tablet what Safari allows a canvas there
   (about 16.7 million: it refuses more); on a computer 48 million, which draws a long statement sharp at the largest zoom
   on a Retina screen (drawing that many takes some 50 ms, measured). */
const COARSE = matchMedia('(pointer: coarse)').matches;
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // an iPad says it is a Mac
const PIXELS = COARSE || IOS ? 16e6 : 48e6;

/* A page of a PDF into a canvas (as far right as the text goes), with its text layer.  `from`: {pdf}, the statement
   typeset here, or {url, page, fill}, a page of the build's previews (C.pickPreview), `fill` times the page's text size
   to fill the panel.  Resolves the element. */
async function drawSheet(mine, from) {
  const lib = await loadPdfjs();
  if (mine.task) { mine.task.destroy(); mine.task = null; }      // the drawing of an older measure
  // On a touch screen the glyphs are drawn as shapes: the statement's fonts added to the page would make it restyle all of
  // itself, a long task on a slow phone (measured on a low-end Android: 63-75 ms at each opening).  A computer keeps the
  // fonts' own drawing: shapes come out about 8% lighter.
  const opts = { useWasm: false, stopAtErrors: false, disableFontFace: COARSE, ...(pdfWorker ? { worker: pdfWorker } : {}) };
  let doc;
  if (from.url) {
    const t = typesetPdf(from.url);
    if (!t.task) {
      const bytes = await t.bytes;
      if (!t.task) {
        t.task = lib.getDocument({ ...opts, data: new Uint8Array(bytes) });
        t.task.promise.catch(() => { if (typeset.get(from.url) === t) typeset.delete(from.url); });
      }
    }
    doc = await t.task.promise;
  } else {
    mine.task = lib.getDocument({ ...opts, data: from.pdf.slice() });
    doc = await mine.task.promise;
  }
  const page = await doc.getPage(from.page || 1);
  const text = await page.getTextContent();
  const pt = page.getViewport({ scale: 1 });
  let right = 0;
  for (const it of text.items) if (it.str && it.width) right = Math.max(right, it.transform[4] + it.width);
  const w = Math.min(pt.width, Math.ceil((right || pt.width) + C.PREVIEW_MARGIN_PT));
  // a formula wider than a phone: the statement a little smaller, to fit (down to 70%; past that, it scrolls sideways)
  const s = Math.max(.7 * pxPerPt(), Math.min(pxPerPt() * (from.fill || 1), panelWidth(mine.panel) / w));
  mine.sheet = { page, w, h: pt.height, s, mag: 1, drawing: null };
  const canvas = await sheetCanvas(mine);
  const layer = el('div', { class: 'textLayer' });
  layer.style.setProperty('--total-scale-factor', String(s));
  await new lib.TextLayer({ textContentSource: text, container: layer, viewport: page.getViewport({ scale: s }) }).render();
  const sheet = el('div', { class: 'bank-sheet' }, canvas, layer);
  sheet.style.width = `${(w * s).toFixed(2)}px`;
  sheet.style.height = `${(pt.height * s).toFixed(2)}px`;
  return el('div', { class: 'bank-sheet-scroll' }, sheet);     // a formula wider than a phone: scrolled sideways
}

/* The drawing itself, with the pixels the screen shows: sharp on this screen at the page's size, on a touch screen still
   sharp at 1.5x zoom before anything is drawn again, and drawn again, sharp, once a pinch has magnified the page (site.js
   says so: 'pagezoom' below); within this setup's PIXELS.  A newer drawing ends an older one. */
async function sheetCanvas(mine) {
  const sheet = mine.sheet, mag = magnified(mine.panel);
  let k = sheet.s * (window.devicePixelRatio || 1) * Math.max(matchMedia('(pointer: coarse)').matches ? 1.5 : 1, mag);
  k = Math.min(k, Math.sqrt(PIXELS / (sheet.w * sheet.h)));
  const canvas = el('canvas', { 'aria-hidden': 'true' });
  canvas.width = Math.ceil(sheet.w * k); canvas.height = Math.ceil(sheet.h * k);
  if (sheet.drawing) sheet.drawing.cancel();
  sheet.mag = mag;
  const drawing = sheet.drawing = sheet.page.render({ canvasContext: canvas.getContext('2d'), viewport: sheet.page.getViewport({ scale: k }), background: 'rgba(0, 0, 0, 0)' });
  await drawing.promise;
  if (sheet.drawing === drawing) sheet.drawing = null;
  return canvas;
}

/* The page was magnified, or brought back (site.js says so when the pinch has ended): the statement on screen is drawn
   again for that size.  Only the drawing: the text laid over it is the page's own, and follows by itself. */
window.addEventListener('pagezoom', async () => {
  const mine = preview;
  if (!mine || !mine.sheet || mine.folding || Math.abs(magnified(mine.panel) / mine.sheet.mag - 1) < .05) return;
  try {
    const canvas = await sheetCanvas(mine);
    const old = mine.panel.querySelector('.bank-sheet canvas');
    if (preview === mine && old) { old.replaceWith(canvas); old.width = 0; old.height = 0; }
  } catch (e) { /* a newer drawing took its place, or the statement was closed */ }
});

/* The panel goes smoothly from its height before `change` to its height after, what `change` brings fading in. */
function morph(panel, change) {
  const from = panel.getBoundingClientRect().height;
  for (const a of panel.getAnimations()) a.cancel();       // an earlier one still running would hold the panel at its height: the panel jumped open late
  change();
  if (!panel.animate || reducedMotion()) return Promise.resolve();
  const to = panel.getBoundingClientRect().height;
  if (panel.lastElementChild) panel.lastElementChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  return panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 320, easing: EASE }).finished.catch(() => {});
}

/* A drawing nobody will see again gives back its memory at once (Safari on iOS counts every canvas against one budget). */
function freeCanvases(root) { for (const c of root.querySelectorAll('canvas')) { c.width = 0; c.height = 0; } }

function closePreview() {
  if (!preview) return;
  freeCanvases(preview.panel);
  preview.abort.abort();                        // a compile still waiting for the engine is dropped, not run for nothing
  if (preview.url) URL.revokeObjectURL(preview.url);
  if (preview.task) preview.task.destroy();
  if (preview.watch) preview.watch.disconnect();
  preview.panel.remove();
  preview.btn.setAttribute('aria-expanded', 'false');
  preview.btn.removeAttribute('aria-controls');
  preview = null;
}

/* The cross: the preview folds away, then goes. */
function foldPreview() {
  const mine = preview;
  mine.btn.setAttribute('aria-expanded', 'false');       // the cross goes at once
  if (!mine.panel.animate || reducedMotion()) { closePreview(); return; }
  const h = mine.panel.getBoundingClientRect().height;
  mine.folding = mine.panel.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px' }],
    { duration: 260, easing: EASE, fill: 'forwards' });
  mine.folding.finished.then(() => { if (preview === mine) closePreview(); }, () => {});
}

/* Drawn at the panel's measure, as the build typeset it or typeset here; again when that measure changes (a phone
   turned, a window made narrower). */
async function showStatement(mine, p, first) {
  const measure = previewMeasure(mine.panel);
  mine.measure = measure;
  let shown = null, by = 'build';
  const ready = C.pickPreview(PREVIEWS, p.id, measure);
  if (ready) {
    typesetPdf(ready.url);                      // on its way while the drawing code comes
    try { shown = await drawSheet(mine, ready); } catch (e) {
      if (preview !== mine) return;
      console.warn('the statement typeset by the build could not be drawn; typeset here instead', e);
    }
  }
  if (!shown) {
    by = 'browser';
    if (mine.ahead) { mine.ahead = false; mine.status.textContent = 'Compiling this problem…'; }     // the engine's news are for it now
    loadPdfjs().catch(() => {});                  // fetched while pdfTeX works
    const res = await C.compilePreview(p.id, { signal: mine.abort.signal, width: measure < SHEET_PT ? measure : null });
    if (preview !== mine) return;
    try { shown = await drawSheet(mine, { pdf: res.pdf }); } catch (e) {
      if (preview !== mine) return;
      console.warn('PDF.js could not draw the preview; the PDF frame instead', e);
      mine.url = mine.url || URL.createObjectURL(new Blob([res.pdf], { type: 'application/pdf' }));
      shown = el('div', {}, pdfLinks(mine.url, (S.normalize(p.title).replace(/ /g, '-') || 'problem') + '.pdf'));
      if (inlinePdf) shown.append(el('iframe', { class: 'bank-pdf bank-preview-pdf', src: mine.url, 'aria-label': `Preview of ${p.title}` }));
    }
  }
  if (preview !== mine) return;
  mine.done = true;
  mine.panel.dataset.typeset = by;              // by the build, or here (where it came from, for whoever looks)
  if (first) {
    await morph(mine.panel, () => mine.panel.replaceChildren(shown));
    if (preview === mine) mine.panel.scrollIntoView({ behavior: smooth(), block: 'nearest' });
  } else {       // typeset again for a new width (a window resized): the rows below glide to their new place
    const old = [...mine.panel.querySelectorAll('canvas')];
    await morph(mine.panel, () => mine.panel.replaceChildren(shown));
    for (const c of old) { c.width = 0; c.height = 0; }
  }
}

/* Open PDF and Download always; the PDF itself in the page only where the browser has a PDF viewer. */
function pdfLinks(url, filename) {
  return el('div', { class: 'bank-out-actions' },
    el('a', { class: 'btn btn-sm btn-outline-primary', href: url, target: '_blank', rel: 'noopener', text: 'Open PDF' }),
    el('a', { class: 'btn btn-sm btn-outline-primary', href: url, download: filename, text: 'Download PDF' }));
}

async function togglePreview(p, row, btn) {
  const wasOpen = preview && preview.row === row && !preview.folding;
  if (wasOpen) { foldPreview(); return; }
  closePreview();
  // typeset by the build, it comes in a moment: words only if that moment is long (a slow line).  What a Create will
  // need is fetched once it is drawn (the statement first), or at once when the statement waits for it too.
  const ahead = !!(PREVIEWS && PREVIEWS.ids.includes(p.id));
  if (!ahead) prefetch();
  const status = el('div', { class: 'small text-muted', role: 'status', text: ahead ? '' : 'Compiling this problem…' });
  const panel = el('div', { class: 'bank-preview-panel', id: `bank-preview-${p.id}` }, status);
  btn.setAttribute('aria-expanded', 'true');       // and the CSS gives the button a cross
  btn.setAttribute('aria-controls', panel.id);
  const mine = preview = { id: p.id, panel, btn, row, url: null, task: null, abort: new AbortController(), status, done: false, ahead };
  if (ahead) setTimeout(() => { if (preview === mine && !mine.done && status.isConnected && !status.textContent) status.textContent = 'Opening the statement…'; }, 500);
  morph(panel, () => row.append(panel));        // inside the problem's row (of the list or of the tree): not an extra item
  panel.scrollIntoView({ behavior: smooth(), block: 'nearest' });
  try {
    await showStatement(mine, p, true);
    prefetch();
    if (preview !== mine || !window.ResizeObserver) return;
    let timer = 0;
    mine.watch = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (preview === mine && !mine.folding && Math.abs(previewMeasure(panel) - mine.measure) > 6) showStatement(mine, p, false).catch(() => {});
      }, 250);
    });
    mine.watch.observe(panel);
  } catch (e) {
    if (preview !== mine) return;
    if (e && e.name === 'AbortError') { closePreview(); return; }       // the engine was reset under it: nothing will come
    mine.done = true;
    panel.replaceChildren(el('div', { class: 'alert alert-danger small mb-0', role: 'alert' }, 'Could not show this problem: ' + ((e && e.message) || e), resetLink(e)));
  }
}

/* ------------------------------------------------------------------ rendering: results */
/* A calm page: on arrival the tree of topics and no list.  The list comes, on the right of the tree, with a topic chosen
   there (or All problems), with typed words or with a filter.  Ticked problems stay ticked while no list is shown. */
function hasQuery() {              // words, or a filter that narrows; the topic is apart, the tree says it
  const f = state.filters;
  return !!S.normalize(f.text) || ['methods', 'difficulty', 'origin'].some(t => f[t].length > 0) || f.yearFrom != null || f.yearTo != null || f.solved !== 'all';
}
function listShown() { return shownTotal() > 0 && (state.all || state.filters.area.length > 0 || hasQuery()); }

/* Every row is built once (in ID order, the order of the results) and afterwards only hidden or shown: typing, filtering
   and ticking do not rebuild the list, and focus stays where it was.  They are built ahead, a few at a time while the
   browser has nothing else to do, so that the first list costs no more than any other; whatever is still missing when a
   list is shown is built at once. */
const rows = new Map();     // id -> {li, cb}
let built = 0;              // problems[0 .. built) have their row in the list
function buildRows(enough = () => false) {
  const part = document.createDocumentFragment();
  while (built < problems.length && !enough()) part.append(buildRow(problems[built++]));
  $('bank-results').append(part);
}
function buildRowsIdle() {
  if (built >= problems.length) return;
  const idle = window.requestIdleCallback || (fn => setTimeout(() => { const end = performance.now() + 8; fn({ timeRemaining: () => end - performance.now() }); }, 50));    // Safari has no idle callback
  idle(deadline => { buildRows(() => deadline.timeRemaining() < 3); buildRowsIdle(); });
}

function buildRow(p) {
  const cb = el('input', { type: 'checkbox', class: 'bank-check', id: `bank-p-${p.id}`, 'data-id': p.id, 'aria-label': `Select “${p.title}”` });
  cb.checked = state.selection.has(p.id);
  cb.addEventListener('change', () => {
    select([p.id], cb.checked); if (cb.checked) prefetch(); syncRow(p.id); renderSelectionState(); syncUrl();
    const bar = $('bank-actions');                       // a phone: the bar that comes up with the first tick must not cover it
    if (cb.checked && getComputedStyle(bar).position === 'fixed' && cb.getBoundingClientRect().bottom > bar.getBoundingClientRect().top) cb.closest('li').scrollIntoView({ block: 'nearest' });
  });
  const tags = el('span', { class: 'bank-tags' });
  for (const a of p.area) tags.append(tagBadge('area', a, { clickable: true }));
  if (p.origin) tags.append(tagBadge('origin', p.origin, { clickable: true }));
  for (const o of p.alsoIn || []) {             // shown when the Origin filter picked this problem through it
    const chip = tagBadge('origin', o, { clickable: true, typeLabel: 'Also in' });
    chip.classList.add('bank-chip-alsoin'); chip.dataset.slug = o; chip.hidden = true;
    tags.append(chip);
  }
  tags.append(difficultyChip(p));
  for (const m of p.methods) tags.append(tagBadge('methods', m, { clickable: true }));      // visible only while the methods are shown (CSS)
  // what these mean is said once, in the menu of the Solution filter
  const marker = p.solutionMasked ? el('span', { class: 'bank-marker bank-marker-masked', text: 'Solution under review' })
    : !S.isComplete(p) ? el('span', { class: 'bank-marker bank-marker-incomplete', text: 'Incomplete solution' }) : null;
  const review = data.index.preview ? el('span', { class: `bank-review bank-review-${p.review}`, 'data-tip': p.review === 'human' ? 'Checked by the club.' : 'Not checked yet.', text: `Review: ${p.review}` })
    : p.proposed ? el('span', { class: 'bank-review bank-review-proposed', 'data-tip': 'Sent in and not yet checked.', text: 'Proposed' }) : null;
  // no per-problem Edit link for now: it comes back with the administrator mode (TODO.md)
  const badge = p.provisional ? el('span', { class: 'bank-review bank-review-new', 'data-tip': 'Just proposed, not in the bank yet.', text: 'New' }) : null;
  // the title opens the statement under it (togglePreview), and closes it; the box beside it is the tick
  const title = el('button', { type: 'button', class: 'bank-row-title', 'aria-expanded': 'false' }, el('span', { class: 'bank-title', text: p.title }), el('span', { class: 'chev', 'aria-hidden': 'true' }));
  const li = el('li', { class: 'list-group-item bank-row' + (cb.checked ? ' bank-row-selected' : ''), 'data-id': p.id, hidden: true },
    cb,
    el('span', { class: 'bank-row-main' }, title, badge),
    el('span', { class: 'bank-row-tags' }, tags, marker, review));
  title.addEventListener('click', () => togglePreview(p, li, title));
  rows.set(p.id, { li, cb });
  return li;
}

function syncRow(id) {
  const r = rows.get(id);
  if (!r) return;
  const on = state.selection.has(id);
  if (r.cb.checked !== on) r.cb.checked = on;
  r.li.classList.toggle('bank-row-selected', on);
}

let shownKey = '';
function renderResults() {
  const f = state.filters;
  state.results = S.filterProblems(problems, f, cat);
  const shown = listShown(), list = $('bank-results'), total = shownTotal(), n = state.results.length;
  if (shown && built < problems.length) buildRows();
  const visible = new Set(shown ? state.results.map(p => p.id) : []);
  const key = shown ? `${f.area.join(',')}|${state.results.map(p => p.id).join(',')}` : '';
  if (key !== shownKey) {            // other problems: their list starts at the top (it scrolls in its own box on a computer)
    const moved = shown && shownKey.split('|')[0] !== key.split('|')[0];
    shownKey = key;
    $('bank-tree-panel').scrollTop = 0;
    if (moved && list.animate && !reducedMotion()) list.animate([{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE });   // another topic: its list comes in from the tree's side
  }
  if (preview && !visible.has(preview.id)) closePreview();
  for (const [id, r] of rows) {
    const on = visible.has(id);
    if (r.li.hidden === on) r.li.hidden = !on;
    syncRow(id);
  }
  list.classList.toggle('bank-show-methods', !!f.showMethods);
  for (const chip of list.querySelectorAll('.bank-chip-alsoin')) chip.hidden = !f.origin.includes(chip.dataset.slug);
  // the head of the list says what the list is; the line it hangs on takes the colour of its topic
  const where = tagNames('area', f.area);
  const counted = `${n} problem${n === 1 ? '' : 's'}${where.length ? ` in ${where.join(' and ')}` : ''}`;
  if ($('bank-count').textContent !== counted) $('bank-count').textContent = counted;      // (role=status: the same words are not read out again)
  $('bank-count').hidden = !shown;
  $('bank-select-all-wrap').hidden = !shown;
  $('bank-empty').hidden = !shown || n > 0;
  $('bank-none-published').hidden = total > 0;
  $('bank-tree').hidden = total === 0;
  $('bank-tree').classList.toggle('has-list', shown);
  if (shown) prefetchDrawing();
  const top = f.area.length === 1 ? (cat.ancestors.get(f.area[0]) || [])[0] || f.area[0] : null;
  const line = $('bank-tree').querySelector('.bank-left');         // its right edge is the line the list hangs on (site.css)
  if (top) line.setAttribute('data-topic', top); else line.removeAttribute('data-topic');
  F.paint(line, top && cat.byType.area.get(top));
  renderSelectionState();
}

function renderSelectionState() {
  const n = state.selection.size;
  const visible = listShown() ? state.results.map(p => p.id) : [];
  const visibleSelected = visible.filter(id => state.selection.has(id)).length;
  const all = $('bank-select-all');
  all.checked = visible.length > 0 && visibleSelected === visible.length;
  all.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
  all.disabled = visible.length === 0;
  $('bank-results-head').hidden = !listShown() && n === 0;
  $('bank-selected-count').textContent = n ? `${n} selected` : '';
  $('bank-clear-selection').hidden = n === 0;
  // busy: aria-disabled, not disabled, so a keyboard user's focus stays on the button while the PDF is made
  const create = $('bank-create');
  create.disabled = n === 0;
  create.classList.toggle('disabled', state.busy && n > 0);
  if (state.busy && n > 0) create.setAttribute('aria-disabled', 'true'); else create.removeAttribute('aria-disabled');
  const makeSolutions = $('bank-make-solutions');
  if (makeSolutions) makeSolutions.disabled = state.busy;
  // PDF order comes with the second tick, in a place kept for it beside Create PDF; while a PDF is made, Cancel has that place
  const order = $('bank-order-btn');
  order.textContent = state.order ? 'PDF order: yours' : 'PDF order';
  order.disabled = n < 2;
  order.classList.toggle('is-idle', n < 2);
  order.hidden = !!job;
  $('bank-cancel').hidden = !job;
  $('bank-actions').classList.toggle('has-ticks', n > 0 || !!job);
  if (n < 2 && !$('bank-order').hidden) toggleOrderPanel(false);
  else if (!$('bank-order').hidden && orderKey(pdfOrder()) !== orderShown) renderOrder();     // only when the ticks or their order changed
  // the solutions are offered for exactly the problems of the PDF on screen: once the ticks or their order change,
  // the offer goes (Create PDF again makes a new pair)
  if (lastCreate && !state.busy && !output.solutions && pdfOrder().join(',') !== lastCreate.ids.join(',')) {
    lastCreate = null;
    $('bank-out-solutions').hidden = true;
    $('bank-out-solutions').querySelector('.bank-out-body').replaceChildren();
  }
}

/* Everything that follows the filters, drawn again.  menu false: the open menu stays as it is (a handle of it is being dragged). */
function update(menu = true) {
  renderFilters();
  renderResults();
  renderTopics();
  if (menu) renderMenu();
  if (state.list.open) renderList();
  syncUrl();
}

/* ------------------------------------------------------------------ the tree of topics */
/* On the left the topics of tags.yml, each first level in its colour (site.css .bank-tree [data-topic]).  Two things on
   every line, All problems included.  The round button folds or unfolds what hangs under the line, one level: under All
   problems that is the tree itself, which comes and goes.  The name chooses: the problems of that topic (its sub-topics'
   too) are listed on the right, tied to the name by a line; a second click on the same name lets go of it.  One topic at
   a time: it is the Area filter (state.filters.area), so a link carries it.  The numbers follow the filters and the typed
   words: a topic with nothing left steps back.  The tree starts folded: its first line comes written in the page
   (build.py tree_top) and is drawn here again, the same, so that nothing jumps; the lines are site.css's. */
const ROOT = '';            // All problems, in tree.open
// The tree starts folded, All problems alone (Antoine, 2026-11-22): its + brings the topics; a link to a topic, or a search
// that finds one, unfolds what holds it (reveal).  linked: a name has just been chosen (its line draws itself)
const tree = { open: new Set(), counts: new Map(), linked: false, phoneOpen: false };
const PHONE = matchMedia('(max-width: 52rem)');
// the topics under one that hold problems, and a chosen one even without (a hand-written link: it shows, lit, faint)
const subTopics = slug => (slug ? cat.byType.area.get(slug).children : [...cat.byType.area.values()].filter(t => !t.parent).map(t => t.slug))
  .filter(c => countOf('area', c) > 0 || state.filters.area.some(a => a === c || (cat.ancestors.get(a) || []).includes(c)));
const foldLabel = (slug, open) => slug ? `${open ? 'Fold' : 'Unfold'} ${cat.byType.area.get(slug).name}` : open ? 'Fold the tree' : 'Unfold the tree';
/* What holds a topic unfolds, so that it can be seen. */
function reveal(slug) { for (const a of [...(cat.ancestors.get(slug) || []), ROOT]) tree.open.add(a); }

/* A click on a name. */
function chooseTopic(slug) {
  const f = state.filters;
  if (slug) { f.area = f.area.length === 1 && f.area[0] === slug ? [] : [slug]; state.all = false; }
  else { state.all = f.area.length > 0 || !state.all; f.area = []; }      // All problems lets go of the topic; clicked again, of itself
  tree.linked = true;
  tree.phoneOpen = false;
  const treeShown = PHONE.matches && !$('bank-tree-topics').hidden;
  update();
  // a phone: the tree has folded into its one line, which may now be far above the screen: back to it, the list under it
  if (treeShown && $('bank-tree-topics').hidden && $('bank-topicline').getBoundingClientRect().top < document.querySelector('.site-head').offsetHeight) $('bank-topicline').scrollIntoView({ block: 'start' });
  if (treeShown && $('bank-tree-topics').hidden && lost()) $('bank-topicline').focus({ preventScroll: true });    // the name pressed went with the tree
}

/* The tree.  Drawn from scratch only when what it holds changes (what is unfolded, and which topics have problems: the
   proposed ones count only when shown); otherwise brought up to date where it is (the numbers, the topics with nothing
   left, the light), so that a change costs little, nothing moves and nothing loses the keyboard. */
// (JSON: All problems is the empty name, which a plain join would not tell from nothing unfolded)
const drawnFor = () => `${state.filters.showProposed ? 1 : 0}|${JSON.stringify([...tree.open].sort())}`;
function renderTopics() {
  const f = state.filters, box = $('bank-tree-topics'), line = $('bank-topicline'), shown = listShown();
  const left = without({ area: [] });
  tree.counts = S.tagCounts(left, cat);
  tree.left = left.length;
  tree.lit = new Set(shown ? (f.area.length ? f.area : [ROOT]) : []);        // words or a filter alone list the whole bank: All problems is lit
  let again = null;
  if (tree.drawn !== drawnFor()) {
    const had = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
    again = had && (had.dataset.slug != null ? `.tt-name[data-slug="${had.dataset.slug}"]` : had.dataset.for != null ? `.tt-tg[data-for="${had.dataset.for}"]` : null);
    box.replaceChildren(topicItem(null));
    tree.drawn = drawnFor();
  } else {
    for (const name of box.querySelectorAll('.tt-name')) {
      const key = name.dataset.slug, n = key ? tree.counts.get('area:' + key) || 0 : tree.left, count = name.lastChild;
      if (count.textContent !== String(n)) count.textContent = String(n);
      name.closest('li').classList.toggle('tt-none', !n);
      light(name, tree.lit.has(key));
    }
  }
  tree.linked = false;
  // a phone: the list takes the tree's place once something is chosen; one line says where you are and brings the tree back
  const folded = PHONE.matches && shown && !tree.phoneOpen;
  box.hidden = folded;
  line.hidden = !folded;
  if (folded) line.replaceChildren(el('span', { text: f.area.length ? f.area.map(s => S.areaPath(cat, s)).join(' and ') : 'All problems' }), el('span', {}, 'Topics', el('span', { class: 'chev', 'aria-hidden': 'true' })));
  if (again && !folded) { const e = box.querySelector(again); if (e) e.focus({ preventScroll: true }); }
}
/* A name lit or not; one lit just now by a click draws its line to the list (site.css .is-new). */
function light(name, on) {
  if (on === name.hasAttribute('aria-current')) return;
  if (on) { name.setAttribute('aria-current', 'true'); name.classList.toggle('is-new', tree.linked); }
  else { name.removeAttribute('aria-current'); name.classList.remove('is-new'); }
}

/* A topic and, when unfolded, its sub-topics.  slug null: All problems, and under it the tree. */
function topicItem(slug) {
  const tag = slug ? cat.byType.area.get(slug) : null, key = slug || ROOT;
  const folds = subTopics(slug).length > 0, open = folds && tree.open.has(key), n = slug ? tree.counts.get('area:' + slug) || 0 : tree.left;
  const li = el('li', { class: (slug ? (folds ? '' : 'tt-leaf') : 'tt-root') + (n ? '' : ' tt-none'), 'data-topic': tag && !tag.parent ? slug : null });
  if (tag && !tag.parent) F.paint(li, tag);
  const row = el('div', { class: 'tt-row' });
  if (folds) {
    const tg = el('button', { type: 'button', class: 'tt-tg', 'data-for': key, 'aria-expanded': String(open), 'aria-label': foldLabel(slug, open) }, open ? '−' : '+');
    tg.addEventListener('click', () => toggleTopic(li, slug, tg));
    row.append(tg);
  } else row.append(el('span', { class: 'tt-dot', 'aria-hidden': 'true' }));
  const name = el('button', { type: 'button', class: 'tt-name', 'data-slug': key, 'aria-controls': 'bank-tree-panel' }, tag ? tag.name : 'All problems', el('span', { class: 'visually-hidden', text: ', ' }), el('span', { class: 'tt-count', text: String(n) }));
  light(name, tree.lit.has(key));
  name.addEventListener('click', () => chooseTopic(slug));
  row.append(name);
  li.append(row);
  if (open) li.append(branchList(slug));
  return li;
}
function branchList(slug) {
  const ul = el('ul');
  for (const c of subTopics(slug)) ul.append(topicItem(c));
  return ul;
}

/* + and −: what hangs under the line unfolds to its height (its items fading in), or folds away.  Folding closes every
   branch under the line too: unfolded again, it shows one level, whatever was open in it before (the whole tree, from the
   root, starts afresh). */
function toggleTopic(li, slug, tg) {
  const key = slug || ROOT, open = !tree.open.has(key);
  if (open) tree.open.add(key);
  else if (!slug) tree.open.clear();
  else for (const s of cat.desc.get(slug) || [slug]) tree.open.delete(s);
  tg.textContent = open ? '−' : '+';
  tg.setAttribute('aria-expanded', String(open));
  tg.setAttribute('aria-label', foldLabel(slug, open));
  const old = li.querySelector(':scope > ul:not(.tt-going)');
  if (open) {
    for (const going of li.querySelectorAll(':scope > ul.tt-going')) going.remove();      // unfolded again before it had folded
    const ul = branchList(slug); li.append(ul); slide(ul, true);
  }
  else if (old) {
    old.classList.add('tt-going');
    foldBranch(old).then(() => old.remove());
  }
  tree.drawn = drawnFor();         // what is on screen is the tree as it is now: what follows only brings it up to date
  if (!open) foldChoice(slug);
}
/* What is folded away cannot stay lit.  A topic hidden by a fold hands its light, and its list, to the line folded (to
   All problems when the whole tree folds away): the right side always shows what is lit, and what is lit can always be
   seen, with its line to the list. */
function foldChoice(slug) {
  const f = state.filters;
  const hidden = f.area.filter(a => !slug || (cat.ancestors.get(a) || []).includes(slug));
  if (!hidden.length) return;
  if (slug) f.area = [...new Set(f.area.map(a => (hidden.includes(a) ? slug : a)))];
  else { f.area = []; state.all = true; }
  tree.linked = true;
  update();
}
/* A branch slides open, or folds with what is open inside it: tree-fold.js, shared with the Propose page. */
const { slide, foldBranch } = F;

/* ------------------------------------------------------------------ selection + PDF order */
function select(ids, on) {
  if (!state.busy) setStatus('');                 // the last message is about a job that is over
  const removed = new Set();
  for (const id of ids) {
    if (on && !state.selection.has(id)) { state.selection.add(id); if (state.order) state.order.push(id); }
    else if (!on && state.selection.has(id)) { state.selection.delete(id); removed.add(id); }
  }
  if (state.order && removed.size) state.order = state.order.filter(x => !removed.has(x));
  if (state.order && !state.order.length) state.order = null;
}

/* The ticked problems in PDF order: the hand-made order if there is one, else the automatic one. */
function pdfOrder() {
  if (state.order) return state.order.filter(id => state.selection.has(id));
  return S.autoOrder([...state.selection], byId, cat);
}

function toggleOrderPanel(open) {
  const panel = $('bank-order');
  panel.hidden = !open;
  $('bank-order-btn').setAttribute('aria-expanded', String(open));
  if (open) {
    renderOrder();
    const r = panel.getBoundingClientRect();
    const bar = stickyBar();
    if (r.top < (bar ? bar.getBoundingClientRect().bottom : 0) || r.top > innerHeight) panel.scrollIntoView({ behavior: smooth(), block: 'start' });
  }
}

const HANDLE = () => el('span', { class: 'bank-order-handle', 'aria-hidden': 'true', title: 'Drag to move' }, '↕');

// what the open order panel shows, so it is drawn again only when that changes (not on every keystroke or Create)
let orderShown = '';
const orderKey = ids => (state.order ? 'yours:' : 'automatic:') + ids.join(',');

function renderOrder() {
  const list = $('bank-order-list');
  const ids = pdfOrder();
  orderShown = orderKey(ids);
  $('bank-order-mode').textContent = state.order ? 'your order' : 'automatic: easiest first, then by topic';
  $('bank-order-reset').disabled = !state.order;
  list.replaceChildren();
  ids.forEach((id, k) => {
    const p = byId.get(id);
    const move = (delta, pressed) => {
      const y0 = pressed.getBoundingClientRect().top;
      const next = [...ids];
      const j = k + delta;
      if (j < 0 || j >= next.length) return;
      [next[k], next[j]] = [next[j], next[k]];
      state.order = next;
      renderSelectionState(); syncUrl();                    // redraws the (open) order panel
      const btn = document.querySelector(`#bank-order-list li[data-id="${id}"] .bank-order-${delta < 0 ? 'up' : 'down'}`);
      const again = btn && !btn.disabled ? btn : document.querySelector(`#bank-order-list li[data-id="${id}"] .bank-order-${delta < 0 ? 'down' : 'up'}`);
      if (!again) return;
      again.focus({ preventScroll: true });
      // the row moved: the list scrolls so that the arrow is where the finger is, and the page does the rest
      list.scrollTop += again.getBoundingClientRect().top - y0;
      window.scrollBy(0, again.getBoundingClientRect().top - y0);
    };
    const handle = HANDLE();
    const li = el('li', { class: 'list-group-item bank-order-row', 'data-id': id },
      handle,
      el('span', { class: 'bank-order-pos', text: `${k + 1}.` }),
      el('span', { class: 'bank-title', text: p ? p.title : '' }),
      el('span', { class: 'bank-order-meta small text-muted', text: p ? [difficultyText(p), p.area[0] ? S.areaPath(cat, p.area[0]).split(' › ')[0] : ''].filter(Boolean).join(' · ') : '' }),
      el('button', { type: 'button', class: 'btn btn-sm bank-order-up', 'aria-label': `Move “${p ? p.title : ''}” up`, disabled: k === 0, onclick: e => move(-1, e.currentTarget) }, '↑'),
      el('button', { type: 'button', class: 'btn btn-sm bank-order-down', 'aria-label': `Move “${p ? p.title : ''}” down`, disabled: k === ids.length - 1, onclick: e => move(1, e.currentTarget) }, '↓'));
    handle.addEventListener('pointerdown', e => startDrag(e, li));
    list.append(li);
  });
}

/* Drag by the handle (mouse, pen or touch): the row follows the pointer; on release the new order is kept.
   Listeners sit on window: moving the row in the DOM would release a pointer capture on the handle.  Near the top or
   bottom edge of the list (or beyond it) the list scrolls by itself, so every row can be reached in one drag. */
function startDrag(e, li) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  const list = li.parentElement;
  li.classList.add('bank-order-dragging');
  let lastY = e.clientY, raf = 0;
  const place = () => {
    let before = null;
    for (const other of list.children) {
      if (other === li) continue;
      const r = other.getBoundingClientRect();
      if (lastY < r.top + r.height / 2) { before = other; break; }
    }
    if (before !== li.nextSibling) list.insertBefore(li, before);
  };
  const scroll = () => {
    const r = list.getBoundingClientRect();
    const edge = 32;
    const bottom = Math.min(r.bottom, innerHeight);       // in landscape the list is taller than the screen
    const step = lastY < r.top + edge ? -Math.min(24, r.top + edge - lastY) : lastY > bottom - edge ? Math.min(24, lastY - bottom + edge) : 0;
    if (step) { const before = list.scrollTop; list.scrollTop += step; if (list.scrollTop !== before) place(); }
    raf = requestAnimationFrame(scroll);
  };
  raf = requestAnimationFrame(scroll);
  const move = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    lastY = ev.clientY;
    place();
  };
  const end = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    li.classList.remove('bank-order-dragging');
    const ids = [...list.children].map(x => Number(x.dataset.id));
    if (ids.join(',') !== pdfOrder().join(',')) { state.order = ids; renderSelectionState(); syncUrl(); }
    else renderOrder();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------------------ Create → the problems PDF, solutions on demand */
const output = { problems: null, solutions: null };
let preambleText = null;
let preambleReady = Promise.resolve();            // needed only for the .tex link: the PDF does not wait for it to start
const preambleOrTimeout = () => Promise.race([preambleReady, new Promise(r => setTimeout(r, 1500))]);    // nor for long to show
let lastCreate = null;          // what the problems PDF on screen was built from; the solutions PDF reuses it

let busyLabel = '';              // what the status line says while pdfTeX works on the current Create
let job = null;                  // AbortController of the PDF being made (the Cancel button)
/* The status line is seen, not read out at each step (aria-live off: the engine's bytes and "k / n" move every 100 ms):
   a screen reader is told each new stage once, through #bank-announce (the numbers left out), and an error. */
let saidStage = '';
function setStatus(text, kind = 'muted') {
  const s = $('bank-status');
  s.textContent = text;
  const stage = text.replace(/[\d.,]+\s*(\/\s*[\d.,]+)?\s*(MB|KB|%)?/g, '').replace(/\s+/g, ' ').trim();
  if (stage && stage !== saidStage) $('bank-announce').textContent = stage;
  saidStage = stage;
  const was = s.className;
  s.className = 'bank-status small ' + (kind === 'muted' ? 'text-muted' : `text-${kind}-emphasis`);
  if (s.className !== was) syncStuckHeights();    // -emphasis: readable in dark mode too
}

function texFilename(ids, variant, ext) {
  return `moc-${variant}-${ids.length}p${ext}`;
}

function renderOutput(variant, res, err, idsForName) {
  const card = $(`bank-out-${variant}`);
  card.hidden = false;
  const body = card.querySelector('.bank-out-body');
  body.replaceChildren();
  for (const u of card._urls || []) URL.revokeObjectURL(u);
  card._urls = [];
  const mk = (bytes, type) => { const u = URL.createObjectURL(new Blob([bytes], { type })); card._urls.push(u); return u; };
  const ids = res ? res.ids : idsForName;
  const actions = res && res.pdf ? pdfLinks(mk(res.pdf, 'application/pdf'), texFilename(ids, variant, '.pdf')) : el('div', { class: 'bank-out-actions' });
  const tex = res ? res.mainTex : err && err.mainTex;
  if (tex) {
    actions.append(el('a', { class: 'btn btn-sm', href: mk(C.standaloneTex(tex, preambleText), 'text/plain'), download: texFilename(ids, variant, '.tex'), text: 'Download .tex',
      title: preambleText ? 'Standalone LaTeX source (preamble inlined)' : 'LaTeX source; needs preamble.tex from the repository next to it' }));
    if (/\\includegraphics\{fig(?:\d{4}|a-[a-z0-9-]+)-\d+\.pdf\}/.test(tex)) actions.append(el('span', { class: 'small text-muted align-self-center', text: 'The .tex references externalised figures (fig….pdf) that are not included.' }));
  }
  body.append(actions);
  if (res && res.pdf) {
    body.append(el('div', { class: 'small text-muted', text: `${ids.length} problem${ids.length === 1 ? '' : 's'}${res.pages ? `, ${res.pages} page${res.pages === 1 ? '' : 's'}` : ''}` }));
    if (inlinePdf) body.append(el('iframe', { class: 'bank-pdf', src: card._urls[0], 'aria-label': `${variant} PDF` }));
  } else if (err) {
    body.append(el('div', { class: 'alert alert-danger small mb-0', role: 'alert' }, el('strong', { text: 'Could not build this PDF. ' }), err.message, resetLink(err)));
  }
}

/* After an engine or compile failure: start again from a fresh download of the engine (not for a cancel, nor when
   the page itself is out of date, nor when the problem texts did not download). */
function resetLink(err) {
  if (err && (err.name === 'AbortError' || err.name === 'StaleError' || err.noReset)) return null;
  return el('button', { type: 'button', class: 'btn btn-link btn-sm p-0 ms-2 align-baseline bank-reset-engine', onclick: onResetEngine }, 'Reset the LaTeX engine');
}

async function onResetEngine() {
  if (state.busy) return;
  state.busy = true; busyLabel = '';
  renderSelectionState();
  setStatus('Resetting the LaTeX engine…');
  try {
    await C.resetEngine();
    setStatus('The LaTeX engine was reset. Try again.', 'success');
  } catch (e) {
    if (!(e && e.name === 'AbortError')) setStatus('The LaTeX engine could not be reset: ' + ((e && e.message) || e), 'danger');
  } finally {
    state.busy = false;
    renderSelectionState();
  }
}

/* The solutions PDF is never built by itself: it is offered here, for exactly the problems of the PDF above,
   so a projected or shared problem set can never give the solutions away by accident. */
function renderSolutionsOffer(ids) {
  const card = $('bank-out-solutions');
  card.hidden = false;
  for (const u of card._urls || []) URL.revokeObjectURL(u);
  card._urls = [];
  card.querySelector('.bank-out-body').replaceChildren(
    el('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', id: 'bank-make-solutions', onclick: onCreateSolutions }, 'Build the PDF with the solutions'));
}

/* Resolves 'ok', 'cancelled' or 'failed'. */
async function compileInto(variant, ids, showMethods, doneMessage, signal) {
  try {
    busyLabel = variant === 'problems' ? 'Compiling the problems PDF…' : 'Compiling the PDF with the solutions…';
    setStatus(busyLabel);
    $('bank-announce').textContent = '';
    const res = await C.compileSelection(ids, variant, { showMethods, signal });
    await preambleOrTimeout();
    output[variant] = res;
    renderOutput(variant, res, null, ids);
    // the PDF itself is the news: the status line goes quiet, and only a screen reader is told
    setStatus('');
    $('bank-announce').textContent = doneMessage;
    return 'ok';
  } catch (e) {
    const name = e && e.name;
    if (name === 'AbortError') { setStatus('Cancelled.'); return 'cancelled'; }
    const message = (e && e.message) || String(e);
    await preambleOrTimeout();
    let mainTex = e && e.mainTex;
    if (!mainTex && name !== 'StaleError') { try { mainTex = C.makeMain(await C.loadBodies(), ids, variant, { showMethods, appendix: C.loadedAppendix() }); } catch (e2) { /* no bodies */ } }
    renderOutput(variant, null, { name, message, mainTex }, ids);
    setStatus(`The ${variant === 'problems' ? 'problems' : 'solutions'} PDF could not be built: ${message.split('\n')[0]}` + (mainTex ? ' You can still download the .tex file.' : ''), 'danger');
    return 'failed';
  }
}

async function onCreate() {
  if (state.busy || state.selection.size === 0) return;
  state.busy = true;
  const mine = job = new AbortController();
  renderSelectionState();
  const ids = pdfOrder();
  const showMethods = state.filters.showMethods && state.filters.methodsInPdf;     // shown on screen is not printed: a switch of its own
  const before = { problems: output.problems, solutions: output.solutions, lastCreate };
  output.solutions = null;
  lastCreate = null;
  $('bank-output').hidden = false;
  $('bank-out-problems').hidden = false; $('bank-out-solutions').hidden = true;
  $('bank-out-problems').querySelector('.bank-out-body').replaceChildren(el('div', { class: 'small text-muted', text: 'Compiling…' }));
  $('bank-output').scrollIntoView({ behavior: smooth(), block: 'start' });
  try {
    try {
      setStatus('Loading problem texts…');
      C.prefetchEngine();                       // alongside the texts, not after them (a phone without a stored engine waits for them)
      preambleReady = C.loadPreamble().then(t => { preambleText = t; });     // it never rejects: without it the .tex link says so
      await Promise.race([C.loadBodies(), new Promise(resolve => mine.signal.addEventListener('abort', resolve, { once: true }))]);
    } catch (e) {
      const msg = (e && e.message) || String(e);        // bank-compile.js says it all ("Could not download the problem texts …")
      setStatus(msg, 'danger');
      renderOutput('problems', null, { name: e && e.name, message: msg, mainTex: null, noReset: true }, ids);
      return;
    }
    const done = mine.signal.aborted ? 'cancelled' : await compileInto('problems', ids, showMethods, 'The PDF is ready.', mine.signal);
    if (done === 'ok') {
      lastCreate = { ids, showMethods };
      renderSolutionsOffer(ids);
    } else if (done === 'cancelled') {
      setStatus('Cancelled.');
      if (before.problems && before.lastCreate) {         // the PDFs that were on screen come back
        output.problems = before.problems; output.solutions = before.solutions; lastCreate = before.lastCreate;
        renderOutput('problems', before.problems, null, lastCreate.ids);
        if (before.solutions) renderOutput('solutions', before.solutions, null, lastCreate.ids); else renderSolutionsOffer(lastCreate.ids);
      } else {
        $('bank-out-problems').hidden = true;
        $('bank-output').hidden = true;
      }
    }
  } finally {
    job = null;
    state.busy = false;
    renderSelectionState();
    if (mine.signal.aborted) focusCreate(); else focusOutput('problems');
  }
}

/* Cancel hides itself: a keyboard user goes back to Create. */
function focusCreate() {
  const a = document.activeElement;
  if (!a || a === document.body || a === $('bank-cancel')) $('bank-create').focus({ preventScroll: true });
}

/* When a PDF is ready, a keyboard user who is still on the button (or whose button was replaced) moves to its card,
   instead of Tabbing through the whole list to reach it. */
function focusOutput(variant) {
  const card = $(`bank-out-${variant}`);
  const a = document.activeElement;
  if (card.hidden || (a && a !== document.body && a !== $('bank-create') && !card.contains(a))) return;
  card.querySelector('.card-header').focus({ preventScroll: true });
  // in sight: on a phone the scroll aimed at it when Create was pressed stops short (rows above it drawn meanwhile, taller
  // than their estimate), and nothing seemed to happen
  const r = card.getBoundingClientRect();
  if (r.top < document.querySelector('.site-head').offsetHeight || r.top > innerHeight * .5) card.scrollIntoView({ block: 'start', behavior: smooth() });
}

async function onCreateSolutions() {
  if (state.busy || !lastCreate) return;
  state.busy = true;
  const mine = job = new AbortController();
  renderSelectionState();
  const { ids, showMethods } = lastCreate;
  const card = $('bank-out-solutions');
  card.hidden = false;
  card.querySelector('.bank-out-body').replaceChildren(el('div', { class: 'small text-muted', text: 'Compiling…' }));
  let done = 'failed';
  try {
    done = await compileInto('solutions', ids, showMethods, 'The PDF with the solutions is ready.', mine.signal);
    if (done === 'cancelled') renderSolutionsOffer(ids);        // the problems PDF is still there: offer again
  } finally {
    job = null;
    state.busy = false;
    renderSelectionState();
    if (done === 'cancelled') { const b = $('bank-make-solutions'); const a = document.activeElement; if (b && (!a || a === document.body || a === $('bank-cancel'))) b.focus({ preventScroll: true }); }
    else focusOutput('solutions');
  }
}

/* The engine (some 16 MB) and the problem texts are fetched ahead only on a clear sign that a PDF is coming: a first tick,
   a Preview (once its statement is drawn), the pointer or the focus on a Create that can be used.  Not on a mere scroll or click on the page, and for the
   engine not at all on a touch screen or a slow connection (C.mayPrefetchEngine): there, Create starts it. */
let prefetched = false;
function prefetch() {             // after the next frame: the tick or the click that asked for it shows first
  if (prefetched) return;
  prefetched = true;
  requestAnimationFrame(() => setTimeout(() => { C.prefetchEngine(); C.prefetchBodies(); }, 0));
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  const input = $('bank-search');
  // what is typed filters the titles live; the list under the bar offers the tags those words could mean
  input.addEventListener('input', () => { state.filters.text = input.value.trim(); state.list.open = true; state.list.active = -1; update(); });
  input.addEventListener('focus', () => { if (S.normalize(input.value) && !state.list.open) openList(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!state.list.open) openList(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (state.list.open) moveActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const best = !state.results.length ? state.list.items.findIndex(it => it.tag) : -1;
      if (state.list.active >= 0) chooseItem(state.list.active);     // a tag picked with the arrow keys
      else if (best >= 0) chooseItem(best);                          // no title contains the words: the best tag, not an empty list
      else {                                                        // otherwise the typed words stay as a title search
        closeList();
        if (matchMedia('(hover: none)').matches) input.blur();      // a phone's keyboard goes, and the results can be seen
      }
    } else if (e.key === 'Escape') { closeList(); }
  });
  // a click or a Tab away from the search bar closes its list; away from the filters, their menu.  The path of the click,
  // not its target: a word or a choice that was clicked has been drawn again by now, and the old one is nowhere
  document.addEventListener('click', e => {
    const path = e.composedPath();
    if (!path.includes($('bank-searchbox')) && !path.includes($('bank-listbox'))) closeList();
    if (state.menu && !path.includes($('bank-tools'))) closeMenu();
  });
  for (const id of ['bank-searchbox', 'bank-listbox']) {
    $(id).addEventListener('focusout', e => { if (state.list.open && !(e.relatedTarget && e.relatedTarget.closest('#bank-searchbox, #bank-listbox'))) closeList(); });
  }
  $('bank-tools').addEventListener('focusout', e => { if (state.menu && e.relatedTarget && !e.relatedTarget.closest('#bank-tools')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.menu) { e.preventDefault(); closeMenu(true); } });
  // in a menu the arrows go from one choice to the next (a year handle keeps them for itself)
  $('bank-menu').addEventListener('keydown', e => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.target.matches('input[type="range"]')) return;
    const stops = [...$('bank-menu').querySelectorAll('input, .bank-option')], i = stops.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const to = stops[Math.max(0, Math.min(stops.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (to.classList.contains('bank-option')) for (const r of $('bank-menu').querySelectorAll('.bank-option')) r.tabIndex = r === to ? 0 : -1;
    to.focus();
  });
  $('bank-searchbox').addEventListener('click', e => { if (e.target === e.currentTarget) input.focus(); });
  $('bank-listbox').addEventListener('mousedown', e => e.preventDefault());      // a click in the list keeps focus in the input

  $('bank-empty-clear').addEventListener('click', () => { clearFilters(); if (lost()) focusFilter(FILTERS[0].key); });
  $('bank-topicline').addEventListener('click', () => {         // the tree back: the topic chosen in it has the focus, in sight
    tree.phoneOpen = true; renderTopics();
    const box = $('bank-tree-topics'), lit = box.querySelector('.tt-name[aria-current]') || box.querySelector('.tt-name');
    if (lit) { lit.focus({ preventScroll: true }); lit.scrollIntoView({ block: 'nearest' }); }
  });
  PHONE.addEventListener('change', () => renderTopics());
  $('bank-clear-selection').addEventListener('click', () => {
    if (!state.busy) setStatus(''); state.selection.clear(); state.order = null; renderResults(); syncUrl();
    if (lost() && !$('bank-select-all').closest('[hidden]')) $('bank-select-all').focus({ preventScroll: true });    // the button pressed has gone
  });

  $('bank-select-all').addEventListener('change', e => {
    const ids = state.results.map(p => p.id);
    select(e.target.checked ? S.autoOrder(ids, byId, cat) : ids, e.target.checked);   // added at the end of a hand-made order
    if (e.target.checked) prefetch();
    renderResults(); syncUrl();
  });
  $('bank-create').addEventListener('click', onCreate);
  $('bank-cancel').addEventListener('click', () => { if (job) job.abort(); });
  for (const ev of ['pointerenter', 'focus']) $('bank-create').addEventListener(ev, () => { if (!$('bank-create').disabled) prefetch(); });
  $('bank-order-btn').addEventListener('click', () => toggleOrderPanel($('bank-order').hidden));
  $('bank-order-reset').addEventListener('click', () => { state.order = null; renderSelectionState(); syncUrl(); if (lost()) $('bank-order-btn').focus({ preventScroll: true }); });

  // engine progress: loading (for whatever waits), then "Compiling… [k / n]" for the job it belongs to (msg.job)
  C.onStatus(msg => {
    const compiling = msg.stage === 'compile';
    const step = compiling ? msg.text.replace(/^Compiling…\s*/, '') : '';          // "3 / 20" while the problems go by
    if (state.busy && (!compiling || msg.job !== 'preview')) setStatus(compiling && busyLabel ? busyLabel + (step ? ' ' + step : '') : msg.text);
    if (preview && !preview.done && !preview.ahead && (!compiling || msg.job === 'preview')) preview.status.textContent = compiling ? 'Compiling this problem…' : msg.text;
  });

  window.addEventListener('popstate', () => { loadFromUrl(); update(); });
  if (window.visualViewport) visualViewport.addEventListener('resize', () => fitList(true));      // a phone's keyboard opening or closing
}

/* exposed for the browser tests */
window.bank = { state, cat, problems, byId, S, C, update, output, pdfOrder };

// bank-compile.js refuses problem texts or an engine from another deploy than this page's (build.py writes both; absent = no check)
C.expectBuild({ build: data.build, engine: data.engine });
loadFromUrl(true);
wire();
update();
if (!C.engineSupported()) $('bank-engine-warning').hidden = false;
/* Once the row of filters is stuck under the header, it also hides what would pass between the header's capsules
   (.is-stuck in site.css).  Where it sticks depends on the header's height, so the watch starts again when that changes;
   on a phone it does not stick (site.css), and nothing is watched. */
function stickyBar() { const bar = $('bank-tools'); return getComputedStyle(bar).position === 'sticky' ? bar : null; }
let stuckAt = null, stuckBars = null;
function watchStuckBars() {
  const bar = stickyBar(), at = bar ? parseFloat(getComputedStyle(bar).top) || 0 : null;
  if (at === stuckAt) return;
  stuckAt = at;
  if (stuckBars) stuckBars.disconnect();
  stuckBars = null;
  $('bank-tools').classList.remove('is-stuck');
  if (!bar) return;
  stuckBars = new IntersectionObserver(entries => {
    for (const e of entries) e.target.classList.toggle('is-stuck', e.boundingClientRect.height > 0 && e.intersectionRatio < 1 && e.boundingClientRect.top <= at + 1);
  }, { rootMargin: `-${at + 1}px 0px 100000px 0px`, threshold: 1 });      // below the window counts as inside: only the top edge means stuck
  stuckBars.observe(bar);
}
watchStuckBars();
window.addEventListener('resize', watchStuckBars);

/* The row wraps when its content does not fit (several filters set, a narrow window), and a message can take several lines:
   the status line sticks under the row's real height, the list under both, and a focused element stops below all of it
   (site.css: --bar-h, --status-h). */
function syncStuckHeights() {
  // a magnified page keeps the sizes it had (site.js holdStuck): the list's box and the tree's column changing under the
  // fingers would move what they are pinching, and a shorter page would scroll; measured again when the pinch is over
  if (document.documentElement.classList.contains('is-zoomed')) return;
  const bar = stickyBar(), status = $('bank-status'), style = document.documentElement.style;
  const barH = bar ? bar.offsetHeight : 0;
  const statusH = getComputedStyle(status).position === 'sticky' ? status.offsetHeight : 0;
  if (style.getPropertyValue('--bar-h') !== `${barH}px`) style.setProperty('--bar-h', `${barH}px`);
  if (style.getPropertyValue('--status-h') !== `${statusH}px`) style.setProperty('--status-h', `${statusH}px`);
  // the list's column sticks under the row: the tree's column is made tall enough for it to travel as far as the tree
  // starts below that place (site.css .bank-left), so that the list stays in sight when the tree is short
  const rs = getComputedStyle($('bank-right'));
  const travel = rs.position === 'sticky' ? Math.max(0, Math.round($('bank-tree').getBoundingClientRect().top + scrollY - parseFloat(rs.top))) : 0;
  if (style.getPropertyValue('--list-travel') !== `${travel}px`) style.setProperty('--list-travel', `${travel}px`);
  const head = $('bank-results-head').offsetHeight;
  if (head && style.getPropertyValue('--list-head-h') !== `${head}px`) style.setProperty('--list-head-h', `${head}px`);
}
{
  const sizes = new ResizeObserver(syncStuckHeights);
  for (const e of [$('bank-tools'), $('bank-status'), $('bank-order')]) sizes.observe(e);      // the order panel moves the tree down
  window.addEventListener('resize', syncStuckHeights);
  let zoomed = false;
  new MutationObserver(() => {
    const now = document.documentElement.classList.contains('is-zoomed');
    if (now !== zoomed) { zoomed = now; syncStuckHeights(); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

document.documentElement.setAttribute('data-ready', '');          // site.js: from now on an error is not a failed page load
buildRowsIdle();
