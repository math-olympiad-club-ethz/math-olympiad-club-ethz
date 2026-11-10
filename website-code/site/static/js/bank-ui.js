/* bank-ui.js — the Problems page: tag search (accessible combobox), chips, advanced filters, live results,
   selection, the PDF order (automatic, or dragged by hand), and Create: the problems PDF, then the solutions PDF on request, compiled in the
   browser.  No framework, no build step.
   Data comes inline from <script type="application/json" id="bank-data"> written by build.py. */

// The page loads this file as bank-ui.js?v=<build>.  The other modules are imported with the same ?v= (a relative
// import does not inherit the query), so a browser never runs a cached module of the last deploy next to new ones.
const V = new URL(import.meta.url).search;
const [S, C] = await Promise.all([import(`./bank-search.js${V}`), import(`./bank-compile.js${V}`)]);

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
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; } };
const smooth = () => reducedMotion() ? 'auto' : 'smooth';
const state = {
  filters: S.emptyFilters(),
  selection: new Set(),
  order: null,            // null = automatic PDF order (S.autoOrder); otherwise the IDs in the order chosen by hand
  results: [],
  list: { open: false, mode: 'browse', items: [], active: -1, expanded: new Set(), collapsed: new Set(S.TAG_TYPES) },   // every section of the tag list starts closed
  busy: false,
  showAll: false,         // the list stays hidden until the visitor searches, filters or clicks Show all
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
}
let urlTimer = null;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const qs = S.encodeState(state.filters, [...state.selection], state.order);
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }, 150);
}

/* ------------------------------------------------------------------ rendering: chips */
function tagBadge(type, slug, { removable = false, clickable = false, typeLabel = S.TYPE_LABEL[type] } = {}) {
  const tag = S.getTag(cat, type, slug) || { name: slug };
  const b = el('span', { class: `bank-chip bank-chip-${type}`, 'data-tip': type === 'area' ? S.areaPath(cat, slug) : (tag.description || '') });   // the bubble: tips.js
  b.append(el('span', { class: 'bank-chip-type', text: typeLabel }), el('span', { text: tag.name }));
  if (removable) {
    b.append(el('button', { type: 'button', class: 'bank-chip-x', 'aria-label': `Remove ${tag.name}`, onclick: (e) => removeChip(e.currentTarget, type, slug) }, '×'));
  } else if (clickable) {
    b.classList.add('bank-chip-clickable');
    b.setAttribute('role', 'button'); b.tabIndex = -1;      // a mouse shortcut: the keyboard picks tags in the search bar (fewer Tab stops per row)
    const add = (e) => { e.preventDefault(); e.stopPropagation(); addFilterTag(type, slug); chipsIntoView(); };
    b.addEventListener('click', add);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') add(e); });
  }
  return b;
}

/* A tag pressed far down the list shrinks it: the chosen tag and the first results come into view. */
function chipsIntoView() {
  const box = $('bank-chips'), r = box.getBoundingClientRect();
  if (r.top < document.querySelector('.site-head').offsetHeight || r.bottom > innerHeight) box.scrollIntoView({ block: 'start', behavior: smooth() });
}

/* The difficulty is a human's rating.  Until someone rates a problem, its chip says "none" and carries the AI's
   estimate in small print; that estimate still drives the difficulty filter and the automatic PDF order. */
const diffName = slug => (S.getTag(cat, 'difficulty', slug) || { name: slug }).name;
function difficultyChip(p) {
  if (p.difficultySource === 'human') return tagBadge('difficulty', p.difficulty, { clickable: true });
  const chip = el('span', { class: 'bank-chip bank-chip-unrated' },
    el('span', { class: 'bank-chip-type', text: S.TYPE_LABEL.difficulty }), el('span', { text: 'None' }));
  if (p.difficultySource === 'ai') {
    chip.dataset.tip = `Not rated yet. The AI estimates: ${diffName(p.difficulty)}`;
    chip.append(el('span', { class: 'bank-ai', text: `AI: ${diffName(p.difficulty)}` }));
  }
  return chip;
}
const difficultyText = p => p.difficultySource === 'human' ? diffName(p.difficulty)
  : p.difficultySource === 'ai' ? `Difficulty none (AI: ${diffName(p.difficulty)})` : 'Difficulty none';

function renderChips() {
  const box = $('bank-chips');
  box.replaceChildren();
  for (const type of S.TAG_TYPES) for (const slug of state.filters[type]) box.append(tagBadge(type, slug, { removable: true }));
  box.hidden = box.childElementCount === 0;
}

/* The chips are redrawn when one is removed: a keyboard user lands on the chip that took its place (or the one
   before), else back in the search bar. */
function removeChip(btn, type, slug) {
  const xs = () => [...$('bank-chips').querySelectorAll('.bank-chip-x')];
  const i = xs().indexOf(btn);
  const hadFocus = document.activeElement === btn;
  removeFilterTag(type, slug);
  if (!hadFocus) return;
  const left = xs();
  if (left.length) left[Math.min(i, left.length - 1)].focus(); else focusSearch();
}
let quietFocus = false;             // focus moved by the page: do not pop the tag list open
function focusSearch() { quietFocus = true; try { $('bank-search').focus(); } finally { quietFocus = false; } }

/* ------------------------------------------------------------------ rendering: listbox (suggestions / browse) */
/* Only tags that some problem has are offered, each with its number of problems. */
function listItems() {
  const q = $('bank-search').value;
  if (S.normalize(q)) {
    state.list.mode = 'suggest';
    const n = state.results.length;
    // what the typed words already do (filter the titles), then the tags they could stand for (methods only when shown)
    const types = state.filters.showMethods ? null : S.TAG_TYPES.filter(t => t !== 'methods');
    const tags = S.suggest(cat, q, state.filters, Infinity, types).filter(({ tag }) => countOf(tag.type, tag.slug) > 0).slice(0, 12)
      .map(({ tag }) => ({ tag, label: tag.name, count: countOf(tag.type, tag.slug), sub: tag.type === 'area' ? (tag.parent ? S.areaPath(cat, tag.slug) : tag.description || '') : tag.type === 'methods' ? tag.group : (tag.description || '') }));
    if (!n) return [{ header: `No title contains “${q.trim()}”.` + (tags.length ? ' Press Enter to filter by the first tag.' : '') }, ...tags];   // see Enter in wire()
    const head = { header: `${n} problem${n === 1 ? '' : 's'} with “${q.trim()}” in the title. Press Enter to see them.` };
    return tags.length ? [head, { header: 'Or filter by one of these tags' }, ...tags] : [head];
  }
  state.list.mode = 'browse';
  const items = [];
  const selected = new Set(S.TAG_TYPES.flatMap(t => state.filters[t].map(s => t + ':' + s)));
  // each section can be folded by clicking its title; the first title also says what the numbers are
  const section = (key, header, list) => {
    if (!list.some(it => it.tag)) return;
    const collapsed = state.list.collapsed.has(key);
    items.push({ header, section: key, collapsed, countHead: !items.length });
    if (!collapsed) items.push(...list);
  };
  const option = (t, depth, sub = '') => ({ tag: t, depth, label: t.name, count: countOf(t.type, t.slug), sub, selected: selected.has(t.type + ':' + t.slug) });
  const areas = [];
  const pushArea = (slug, depth) => {
    const tag = cat.byType.area.get(slug);
    const kids = tag.children.filter(c => countOf('area', c) > 0);
    const open = state.list.expanded.has(slug);
    areas.push({ ...option(tag, depth), toggle: kids.length ? (open ? 'open' : 'closed') : null });
    if (open) for (const c of kids) pushArea(c, depth + 1);
  };
  for (const [slug, t] of cat.byType.area) if (!t.parent && countOf('area', slug) > 0) pushArea(slug, 0);
  section('area', 'Area', areas);
  if (state.filters.showMethods) {               // methods are spoilers: offered only while "Show methods" is on
    const methods = [];
    let group = null;
    for (const t of cat.byType.methods.values()) {
      if (!countOf('methods', t.slug)) continue;
      if (t.group !== group) { group = t.group; methods.push({ subheader: group }); }
      methods.push(option(t, 1));
    }
    section('methods', 'Methods', methods);
  }
  section('difficulty', 'Difficulty', [...cat.byType.difficulty.values()].filter(t => countOf('difficulty', t.slug)).map(t => option(t, 0, t.description)));
  section('origin', 'Origin', [...cat.byType.origin.values()].filter(t => countOf('origin', t.slug)).map(t => option(t, 0, t.description)));
  return items;
}

function renderList() {
  const box = $('bank-listbox');
  const input = $('bank-search');
  if (!state.list.open) {
    box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    return;
  }
  state.list.items = listItems();
  box.replaceChildren();
  let optIndex = 0;
  state.list.items.forEach((it, i) => {
    if (it.header && it.section) {
      // a section title is an option too, so the keyboard reaches it: Enter or → opens it, ← closes it
      const head = el('div', { class: 'bank-list-header bank-list-section', role: 'option', id: `bank-opt-${i}`, 'aria-selected': 'false', 'data-index': i,
        title: it.collapsed ? 'Show' : 'Hide', onclick: (e) => { e.stopPropagation(); toggleSection(it.section); } },
        el('span', { class: 'bank-list-caret', 'aria-hidden': 'true', text: it.collapsed ? '+' : '−' }), el('span', { text: it.header }),
        el('span', { class: 'visually-hidden', text: it.collapsed ? ' (collapsed)' : ' (expanded)' }));
      if (it.countHead) head.append(el('span', { class: 'bank-list-count-head', text: 'Problems' }));
      box.append(head);
      return;
    }
    if (it.header) { box.append(el('div', { class: 'bank-list-header', role: 'presentation', text: it.header })); return; }
    if ('subheader' in it) { box.append(el('div', { class: 'bank-list-subheader', role: 'presentation', text: it.subheader })); return; }
    optIndex++;
    const row = el('div', { class: `bank-option bank-option-${it.tag.type}` + (it.selected ? ' bank-option-selected' : ''), role: 'option', id: `bank-opt-${i}`,
      'aria-selected': it.selected ? 'true' : 'false', style: { '--depth': String(it.depth || 0) }, 'data-index': i });
    if (it.toggle) {       // a mouse target, not a button (no control inside an option): the keyboard opens a node with → and ←
      row.append(el('span', { class: 'bank-toggle', 'aria-hidden': 'true', title: (it.toggle === 'open' ? 'Collapse ' : 'Expand ') + it.label,
        onclick: (e) => { e.stopPropagation(); toggleExpand(it.tag.slug); } }, it.toggle === 'open' ? '−' : '+'));
    } else if (state.list.mode === 'browse' && it.tag.type === 'area') row.append(el('span', { class: 'bank-toggle bank-toggle-empty', 'aria-hidden': 'true' }));
    if (state.list.mode !== 'browse') row.append(el('span', { class: 'bank-option-type', text: S.TYPE_LABEL[it.tag.type] }));   // in the browse list the section title says it
    row.append(el('span', { class: 'bank-option-label', text: it.label }));
    if (it.toggle) row.append(el('span', { class: 'visually-hidden', text: it.toggle === 'open' ? ' (expanded)' : ' (collapsed)' }));
    if (it.sub) row.append(el('span', { class: 'bank-option-sub', text: it.sub }));
    row.append(el('span', { class: 'bank-option-count', text: String(it.count) }));
    row.addEventListener('click', e => { e.stopPropagation(); chooseItem(i); });
    box.append(row);
  });
  if (!optIndex && !state.list.items.some(it => it.section)) box.append(el('div', { class: 'bank-list-empty', role: 'presentation', text: state.list.mode === 'suggest' ? 'No tag matches.' : 'No tags.' }));
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  setActive(state.list.active, false);
  fitList();                                     // its room may have changed: a tag chosen adds a row of chips above it
}

function setActive(i, scroll = true) {
  const items = state.list.items;
  const options = items.map((it, k) => (it.tag || it.section ? k : -1)).filter(k => k >= 0);
  if (!options.length) { state.list.active = -1; $('bank-search').removeAttribute('aria-activedescendant'); return; }
  if (i < 0 || !items[i] || !(items[i].tag || items[i].section)) i = options.includes(i) ? i : -1;
  state.list.active = i;
  document.querySelectorAll('#bank-listbox .bank-option-active').forEach(e => e.classList.remove('bank-option-active'));
  if (i >= 0) {
    const row = document.getElementById(`bank-opt-${i}`);
    if (row) { row.classList.add('bank-option-active'); if (scroll) row.scrollIntoView({ block: 'nearest' }); }
    $('bank-search').setAttribute('aria-activedescendant', `bank-opt-${i}`);
  } else $('bank-search').removeAttribute('aria-activedescendant');
}

function moveActive(delta) {
  const options = state.list.items.map((it, k) => (it.tag || it.section ? k : -1)).filter(k => k >= 0);
  if (!options.length) return;
  const pos = options.indexOf(state.list.active);
  const next = pos < 0 ? (delta > 0 ? 0 : options.length - 1) : Math.min(options.length - 1, Math.max(0, pos + delta));
  setActive(options[next]);
}

function toggleSection(key) {
  if (state.list.collapsed.has(key)) state.list.collapsed.delete(key); else state.list.collapsed.add(key);
  renderList();
}

function toggleExpand(slug) {
  if (state.list.expanded.has(slug)) state.list.expanded.delete(slug); else state.list.expanded.add(slug);
  renderList();
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
  if (it && it.section) { toggleSection(it.section); return; }
  if (!it || !it.tag) return;
  const { type, slug } = it.tag;
  const wasSuggest = state.list.mode === 'suggest';
  const input = $('bank-search');
  input.value = '';
  state.filters.text = '';                  // the typed words were there to find this tag, not to search titles
  if (state.filters[type].includes(slug)) removeFilterTag(type, slug); else addFilterTag(type, slug);
  input.focus();
  if (wasSuggest) closeList(); else renderList();
}

/* ------------------------------------------------------------------ filters */
function addFilterTag(type, slug) {
  if (!S.getTag(cat, type, slug) || state.filters[type].includes(slug)) return;
  state.filters[type] = [...state.filters[type], slug];
  update();
}
function removeFilterTag(type, slug) {
  state.filters[type] = state.filters[type].filter(s => s !== slug);
  update();
}

/* Origin-year slider: two handles that step through the years that occur in the bank (not a linear scale: most
   problems are recent, a few are centuries old).  Both handles at the ends = no year filter (undated problems too). */
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

function drawYears(lo, hi) {
  const box = document.querySelector('#bank-year-box .bank-range');
  box.style.setProperty('--lo', `${YMAX ? (lo / YMAX) * 100 : 0}%`);
  box.style.setProperty('--hi', `${YMAX ? (hi / YMAX) * 100 : 100}%`);
  $('bank-year-lo').style.zIndex = lo === YMAX ? '3' : '';          // both at the end: the "from" handle must stay grabbable
  $('bank-year-lo').setAttribute('aria-valuetext', String(YEARS[lo]));
  $('bank-year-hi').setAttribute('aria-valuetext', String(YEARS[hi]));
  $('bank-year-label').textContent = YEARS.length ? `${YEARS[lo]} – ${YEARS[hi]}` : '';
}

function onYearInput(e) {
  let lo = Number($('bank-year-lo').value), hi = Number($('bank-year-hi').value);
  if (lo > hi) {                                   // the dragged handle stops at the other one
    if (e.target.id === 'bank-year-lo') { lo = hi; $('bank-year-lo').value = String(lo); } else { hi = lo; $('bank-year-hi').value = String(hi); }
  }
  const full = lo === 0 && hi === YMAX;
  state.filters.yearFrom = full ? null : YEARS[lo];
  state.filters.yearTo = full ? null : YEARS[hi];
  update();
}

function readAdvanced() {
  const f = state.filters;
  f.showMethods = $('bank-show-methods').checked;
  if (!f.showMethods) f.methods = [];            // hidden methods filter nothing: their chips go too
  f.methodsInPdf = f.showMethods && $('bank-methods-pdf').checked;
  f.showProposed = $('bank-show-proposed').checked;
  f.op = $('bank-op-or').checked ? 'or' : 'and';
  f.solved = document.querySelector('input[name="bank-solved"]:checked').value;
  update();
}

function writeAdvanced() {
  const f = state.filters;
  $('bank-show-methods').checked = f.showMethods;
  $('bank-methods-pdf').checked = f.methodsInPdf;
  setMethodsPdf(f.showMethods);
  $('bank-show-proposed').checked = f.showProposed;
  $('bank-op-and').checked = f.op !== 'or'; $('bank-op-or').checked = f.op === 'or';
  $('bank-op-help').textContent = f.op === 'or' ? 'Problems with at least one of the tags.' : 'Problems with all the tags.';
  if (YEARS.length > 1) {
    const [lo, hi] = yearIndices(f);
    $('bank-year-lo').max = $('bank-year-hi').max = String(YMAX);
    $('bank-year-lo').value = String(lo); $('bank-year-hi').value = String(hi);
    drawYears(lo, hi);
  }
  document.querySelector(`input[name="bank-solved"][value="${f.solved}"]`).checked = true;
  const n = (f.op === 'or' ? 1 : 0) + (f.showMethods ? 1 : 0) + (f.methodsInPdf ? 1 : 0) + (f.showProposed ? 1 : 0) + (f.yearFrom != null || f.yearTo != null ? 1 : 0) + (f.solved !== 'all' ? 1 : 0);
  $('bank-filter-count').textContent = n ? String(n) : '';
  $('bank-filter-count').hidden = !n;
}

/* "In the PDFs" comes and goes with "Show": it unfolds beside it (under it on a narrow screen) to its exact size, pushing
   what follows aside along one smooth curve while it fades in; folding is the same, backwards, from wherever it is.  At
   once while the menu is closed, and for those who ask for less motion. */
let fold = null;            // {anim, open}: the unfolding or folding under way
function setMethodsPdf(open) {
  const el = $('bank-methods-pdf-option');
  if (open === (fold ? fold.open : !el.hidden)) return;
  const box = el.parentElement, wide = getComputedStyle(box).flexDirection !== 'column';
  const dim = wide ? 'width' : 'height', edge = wide ? 'marginLeft' : 'marginTop';
  const at = el.hidden ? 0 : el.getBoundingClientRect()[dim];
  if (fold) fold.anim.cancel();
  fold = null;
  el.hidden = false;
  const size = el.getBoundingClientRect()[dim];
  if (!el.animate || $('bank-advanced').hidden || !size || reducedMotion()) { el.hidden = !open; return; }
  const gap = parseFloat(getComputedStyle(box)[wide ? 'columnGap' : 'rowGap']) || 0;
  // folded, it takes no room, not even the gap before it (its own margin is -4px: site.css .bank-fold)
  const frame = s => ({ [dim]: `${s}px`, [edge]: `${-4 - gap * (1 - s / size)}px`, opacity: s / size });
  const anim = el.animate([frame(at), frame(open ? size : 0)], { duration: open ? 380 : 280, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both' });
  fold = { anim, open };
  anim.finished.then(() => {
    if (!fold || fold.anim !== anim) return;
    fold = null;
    el.hidden = !open;
    anim.cancel();
  }, () => {});
}

function resetFilters() {
  state.filters = S.emptyFilters();
  $('bank-search').value = '';
  update();
}

/* ------------------------------------------------------------------ Preview: one problem, read here */
/* The statement is typeset by pdfTeX (bank-compile.js makePreview) and drawn into the page by PDF.js (site/static/pdfjs/,
   copied by build.py; loaded on the first Preview): no frame, no toolbar, the page's own background and ink, and the size
   of the page's own text, which is Computer Modern too.  A text layer over the drawing lets it be selected and read
   aloud.  Where PDF.js cannot run, the browser's PDF frame as before. */
let preview = null;         // {id, panel, btn, url, task, abort, status, done, measure, folding, watch}: one open at a time
const EASE = 'cubic-bezier(.4, 0, .2, 1)';
const pxPerPt = () => (parseFloat(getComputedStyle(document.body).fontSize) || 18) / 10.95;   // the bank's \normalsize: 11pt class
const SHEET_PT = 426.79;    // the sheets' measure (preamble.tex: A4, 3 cm side margins): wider screens use it as it is

let pdfjsLib = null;
function loadPdfjs() {
  if (!pdfjsLib) {
    const v = data.pdfjs ? `?v=${encodeURIComponent(data.pdfjs)}` : '';
    pdfjsLib = import(new URL(`../pdfjs/pdf.min.mjs${v}`, import.meta.url).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL(`../pdfjs/pdf.worker.min.mjs${v}`, import.meta.url).href;
      return lib;
    });
    pdfjsLib.catch(() => { pdfjsLib = null; });       // tried again at the next Preview
  }
  return pdfjsLib;
}

/* The measure of the statement, in pt: what the panel holds at the page's text size (the sheets' when it holds more). */
function panelWidth(panel) {
  const cs = getComputedStyle(panel);
  return panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}
function previewMeasure(panel) {           // 3 pt to spare: a line may end a hair past the measure
  return Math.max(150, Math.min(SHEET_PT, panelWidth(panel) / pxPerPt() - 2 * C.PREVIEW_MARGIN_PT - 3));
}

/* The page of the PDF into a canvas (as far right as the text goes), with its text layer.  Resolves the element. */
async function drawSheet(mine, pdf) {
  const lib = await loadPdfjs();
  if (mine.task) mine.task.destroy();              // the drawing of an older measure
  mine.task = lib.getDocument({ data: pdf.slice(), useWasm: false, stopAtErrors: false });
  const doc = await mine.task.promise;
  const page = await doc.getPage(1);
  const text = await page.getTextContent();
  const pt = page.getViewport({ scale: 1 });
  let right = 0;
  for (const it of text.items) if (it.str && it.width) right = Math.max(right, it.transform[4] + it.width);
  const w = Math.min(pt.width, Math.ceil((right || pt.width) + C.PREVIEW_MARGIN_PT));
  // a formula wider than a phone: the statement a little smaller, to fit (down to 70%; past that, it scrolls sideways)
  const s = Math.max(.7 * pxPerPt(), Math.min(pxPerPt(), panelWidth(mine.panel) / w));
  // sharp on this screen, and on a touch screen still sharp at 1.5x zoom; at most 12 million pixels
  let k = s * (window.devicePixelRatio || 1) * (matchMedia('(pointer: coarse)').matches ? 1.5 : 1);
  k = Math.min(k, Math.sqrt(12e6 / (w * pt.height)));
  const canvas = el('canvas', { 'aria-hidden': 'true' });
  canvas.width = Math.ceil(w * k); canvas.height = Math.ceil(pt.height * k);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: k }), background: 'rgba(0, 0, 0, 0)' }).promise;
  const layer = el('div', { class: 'textLayer' });
  layer.style.setProperty('--total-scale-factor', String(s));
  await new lib.TextLayer({ textContentSource: text, container: layer, viewport: page.getViewport({ scale: s }) }).render();
  const sheet = el('div', { class: 'bank-sheet' }, canvas, layer);
  sheet.style.width = `${(w * s).toFixed(2)}px`;
  sheet.style.height = `${(pt.height * s).toFixed(2)}px`;
  return el('div', { class: 'bank-sheet-scroll' }, sheet);     // a formula wider than a phone: scrolled sideways
}

/* The panel goes smoothly from its height before `change` to its height after, what `change` brings fading in. */
function morph(panel, change) {
  const from = panel.getBoundingClientRect().height;
  change();
  if (!panel.animate || reducedMotion()) return Promise.resolve();
  const to = panel.getBoundingClientRect().height;
  if (panel.lastElementChild) panel.lastElementChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  return panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 320, easing: EASE }).finished.catch(() => {});
}

function closePreview() {
  if (!preview) return;
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

/* Typeset at the panel's measure and drawn; again when that measure changes (a phone turned, a window made narrower). */
async function showStatement(mine, p, first) {
  const measure = previewMeasure(mine.panel);
  mine.measure = measure;
  loadPdfjs().catch(() => {});                  // fetched while pdfTeX works
  const res = await C.compilePreview(p.id, { signal: mine.abort.signal, width: measure < SHEET_PT ? measure : null });
  if (preview !== mine) return;
  let shown;
  try { shown = await drawSheet(mine, res.pdf); } catch (e) {
    if (preview !== mine) return;
    console.warn('PDF.js could not draw the preview; the PDF frame instead', e);
    mine.url = mine.url || URL.createObjectURL(new Blob([res.pdf], { type: 'application/pdf' }));
    shown = el('div', {}, pdfLinks(mine.url, (S.normalize(p.title).replace(/ /g, '-') || 'problem') + '.pdf'));
    if (inlinePdf) shown.append(el('iframe', { class: 'bank-pdf bank-preview-pdf', src: mine.url, 'aria-label': `Preview of ${p.title}` }));
  }
  if (preview !== mine) return;
  mine.done = true;
  if (first) {
    await morph(mine.panel, () => mine.panel.replaceChildren(shown));
    if (preview === mine) mine.panel.scrollIntoView({ behavior: smooth(), block: 'nearest' });
  } else mine.panel.replaceChildren(shown);
}

/* Open PDF and Download always; the PDF itself in the page only where the browser has a PDF viewer. */
function pdfLinks(url, filename) {
  return el('div', { class: 'bank-out-actions' },
    el('a', { class: 'btn btn-sm btn-outline-primary', href: url, target: '_blank', rel: 'noopener', text: 'Open PDF' }),
    el('a', { class: 'btn btn-sm btn-outline-primary', href: url, download: filename, text: 'Download PDF' }));
}

async function togglePreview(p, row, btn) {
  const wasOpen = preview && preview.id === p.id && !preview.folding;
  if (wasOpen) { foldPreview(); return; }
  closePreview();
  prefetch();
  const status = el('div', { class: 'small text-muted', role: 'status', text: 'Compiling this problem…' });
  const panel = el('div', { class: 'bank-preview-panel', id: `bank-preview-${p.id}` }, status);
  btn.setAttribute('aria-expanded', 'true');       // and the CSS gives the button a cross
  btn.setAttribute('aria-controls', panel.id);
  const mine = preview = { id: p.id, panel, btn, url: null, task: null, abort: new AbortController(), status, done: false };
  morph(panel, () => row.append(panel));        // inside the problem's row: not an extra item of the list
  panel.scrollIntoView({ behavior: smooth(), block: 'nearest' });
  try {
    await showStatement(mine, p, true);
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
/* A calm page: no list until the visitor asks for one (typed words, a tag, a filter, or Show all).  Ticked problems
   stay ticked while the list is hidden, and the bar with Create PDF stays. */
function hasQuery() {
  const f = state.filters;
  return !!S.normalize(f.text) || S.TAG_TYPES.some(t => f[t].length > 0) || f.yearFrom != null || f.yearTo != null || f.solved !== 'all';
}
function listShown() { return shownTotal() > 0 && (state.showAll || hasQuery()); }

/* Every row is built once, the first time the list is shown (in ID order, the order of the results), and afterwards
   only hidden or shown: typing, filtering and ticking do not rebuild the list, and focus stays where it was. */
const rows = new Map();     // id -> {li, cb}

function buildRow(p) {
  const cb = el('input', { type: 'checkbox', class: 'bank-check', id: `bank-p-${p.id}`, 'data-id': p.id, 'aria-label': `Select “${p.title}”` });
  cb.addEventListener('change', () => { select([p.id], cb.checked); if (cb.checked) prefetch(); syncRow(p.id); renderSelectionState(); syncUrl(); });
  const tags = el('span', { class: 'bank-tags' });
  for (const a of p.area) tags.append(tagBadge('area', a, { clickable: true }));
  if (p.origin) tags.append(tagBadge('origin', p.origin, { clickable: true }));
  for (const o of p.alsoIn || []) {             // shown when the Origin filter picked this problem through it
    const chip = tagBadge('origin', o, { clickable: true, typeLabel: 'Also in' });
    chip.classList.add('bank-chip-alsoin'); chip.dataset.slug = o; chip.hidden = true;
    tags.append(chip);
  }
  tags.append(difficultyChip(p));
  for (const m of p.methods) tags.append(tagBadge('methods', m, { clickable: true }));      // visible only with "Show methods" (CSS)
  const marker = p.solutionMasked ? el('span', { class: 'bank-marker bank-marker-masked', 'data-tip': 'The solution is published once it has been reviewed', text: 'Solution under review' })
    : !p.hasSolution ? el('span', { class: 'bank-marker bank-marker-unsolved', 'data-tip': 'No solution in the bank yet', text: 'No solution' })
    : p.partial ? el('span', { class: 'bank-marker bank-marker-partial', 'data-tip': 'The solution is unfinished', text: 'Partial solution' }) : null;
  const review = data.index.preview ? el('span', { class: `bank-review bank-review-${p.review}`, 'data-tip': p.review === 'human' ? 'Reviewed by a board member' : 'Not reviewed by the board yet', text: `Review: ${p.review}` })
    : p.proposed ? el('span', { class: 'bank-review bank-review-proposed', 'data-tip': 'Not reviewed by the board yet: it may contain mistakes', text: 'Proposed' }) : null;
  // no per-problem Edit link for now: it comes back with the administrator mode (TODO.md)
  const edit = p.provisional ? el('span', { class: 'bank-review bank-review-new', 'data-tip': 'Proposed problem, not merged yet', text: 'New' }) : null;
  const previewBtn = el('button', { type: 'button', class: 'btn btn-sm btn-link bank-preview-btn', 'aria-expanded': 'false', 'aria-label': `Preview “${p.title}”`, text: 'Preview' });
  const li = el('li', { class: 'list-group-item bank-row', 'data-id': p.id, hidden: true },
    cb,
    el('span', { class: 'bank-row-main' },
      el('label', { class: 'bank-row-title', for: `bank-p-${p.id}` }, el('span', { class: 'bank-title', text: p.title }))),
    el('span', { class: 'bank-row-tags' }, tags, marker, review),
    el('span', { class: 'bank-row-actions' }, previewBtn, edit));
  previewBtn.addEventListener('click', () => togglePreview(p, li, previewBtn));
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
  state.results = S.filterProblems(problems, state.filters, cat);
  const shown = listShown();
  const list = $('bank-results');
  if (shown && !rows.size) {
    const all = document.createDocumentFragment();
    for (const p of problems) all.append(buildRow(p));
    list.append(all);
  }
  const visible = new Set(shown ? state.results.map(p => p.id) : []);
  const key = shown ? state.results.map(p => p.id).join(',') : '';
  if (key !== shownKey) { shownKey = key; list.scrollTop = 0; }      // other problems: their list starts at the top (it scrolls in its own box on a computer)
  if (preview && !visible.has(preview.id)) closePreview();
  for (const [id, r] of rows) {
    const on = visible.has(id);
    if (r.li.hidden === on) r.li.hidden = !on;
    syncRow(id);
  }
  list.classList.toggle('bank-show-methods', !!state.filters.showMethods);
  for (const chip of list.querySelectorAll('.bank-chip-alsoin')) chip.hidden = !state.filters.origin.includes(chip.dataset.slug);
  const total = shownTotal();
  $('bank-count').textContent = `${state.results.length} of ${total} problem${total === 1 ? '' : 's'}`;
  $('bank-count').hidden = !shown;
  $('bank-hide-all').hidden = !(shown && state.showAll && !hasQuery());      // back to the calm page
  $('bank-select-all-wrap').hidden = !shown;
  $('bank-idle-count').textContent = `${total} problem${total === 1 ? '' : 's'}.`;
  $('bank-idle').hidden = shown || total === 0;
  $('bank-empty').hidden = !shown || state.results.length > 0;
  $('bank-none-published').hidden = total > 0;
  renderSelectionState();
}

function renderSelectionState() {
  const n = state.selection.size;
  const visible = state.results.map(p => p.id);
  const visibleSelected = visible.filter(id => state.selection.has(id)).length;
  const all = $('bank-select-all');
  all.checked = visible.length > 0 && visibleSelected === visible.length;
  all.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
  all.disabled = visible.length === 0;
  $('bank-results-head').hidden = problems.length === 0 || (n === 0 && !listShown() && !job);
  $('bank-selected-count').textContent = n ? `${n} selected` : '';
  $('bank-clear-selection').hidden = n === 0;
  // busy: aria-disabled, not disabled, so a keyboard user's focus stays on the button while the PDF is made
  const create = $('bank-create');
  create.disabled = n === 0;
  create.classList.toggle('disabled', state.busy && n > 0);
  if (state.busy && n > 0) create.setAttribute('aria-disabled', 'true'); else create.removeAttribute('aria-disabled');
  $('bank-cancel').hidden = !job;                  // while a PDF is being made
  const makeSolutions = $('bank-make-solutions');
  if (makeSolutions) makeSolutions.disabled = state.busy;
  $('bank-order-btn').disabled = n < 2;
  $('bank-order-btn').textContent = state.order ? 'PDF order: yours' : 'PDF order: automatic';
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

function update() {
  renderChips();
  writeAdvanced();
  renderResults();
  if (state.list.open) renderList();
  syncUrl();
}

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
    if (r.top < stickyBar().getBoundingClientRect().bottom || r.top > innerHeight) panel.scrollIntoView({ behavior: smooth(), block: 'start' });
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
  $('bank-order-mode').textContent = state.order ? 'your order' : 'automatic: easiest first, then by area';
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
function setStatus(text, kind = 'muted') {
  const s = $('bank-status');
  s.textContent = text;
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
    const info = res.fromCache ? 'from cache' : `${res.passes.length} pass${res.passes.length === 1 ? '' : 'es'}, ${(res.ms / 1000).toFixed(1)} s`;
    body.append(el('div', { class: 'small text-muted', text: `${ids.length} problem${ids.length === 1 ? '' : 's'}${res.pages ? `, ${res.pages} pages` : ''} · ${info}` }));
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

/* The engine (about 17 MB) and the problem texts are fetched ahead only on a clear sign that a PDF is coming: a first tick,
   a Preview, the pointer or the focus on a Create that can be used.  Not on a mere scroll or click on the page, and for the
   engine not at all on a touch screen or a slow connection (C.mayPrefetchEngine): there, Create starts it. */
let prefetched = false;
function prefetch() { if (prefetched) return; prefetched = true; C.prefetchEngine(); C.prefetchBodies(); }

/* ------------------------------------------------------------------ wiring */
function wire() {
  const input = $('bank-search');
  input.addEventListener('focus', () => { if (!quietFocus) openList(); });
  input.addEventListener('click', () => { if (!state.list.open) openList(); });        // focus has just opened it
  // what is typed filters the titles live; the list below still offers the tags those words could mean.
  // The chips and the Filters panel do not depend on the text: only the results, the list and the URL are redrawn.
  input.addEventListener('input', () => { state.filters.text = input.value.trim(); state.list.open = true; state.list.active = -1; renderResults(); renderList(); syncUrl(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!state.list.open) openList(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (state.list.open) moveActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const best = state.list.mode === 'suggest' && !state.results.length ? state.list.items.findIndex(it => it.tag) : -1;
      if (state.list.active >= 0) chooseItem(state.list.active);     // a tag picked with the arrow keys
      else if (best >= 0) chooseItem(best);                          // no title contains the words: the best tag, not an empty list
      else {                                                        // otherwise the typed words stay as a title search
        closeList();
        if (matchMedia('(hover: none)').matches) input.blur();      // a phone's keyboard goes, and the results can be seen
      }
    } else if (e.key === 'Escape') { closeList(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const it = state.list.items[state.list.active];
      if (it && it.toggle) { e.preventDefault(); const open = it.toggle === 'open'; if ((e.key === 'ArrowRight') !== open) toggleExpand(it.tag.slug); }
      else if (it && it.section) { e.preventDefault(); if ((e.key === 'ArrowRight') === it.collapsed) toggleSection(it.section); }
    } else if (e.key === 'Backspace' && input.value === '' && !e.repeat) {   // held down to clear the words: it stops at the tags
      for (const type of [...S.TAG_TYPES].reverse()) { const arr = state.filters[type]; if (arr.length) { removeFilterTag(type, arr[arr.length - 1]); break; } }
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#bank-searchbox, #bank-listbox')) closeList(); });
  for (const id of ['bank-searchbox', 'bank-listbox']) {                     // Tab away from the search bar closes the list
    $(id).addEventListener('focusout', e => { if (state.list.open && !(e.relatedTarget && e.relatedTarget.closest('#bank-searchbox, #bank-listbox'))) closeList(); });
  }
  $('bank-searchbox').addEventListener('click', e => { if (e.target === e.currentTarget) input.focus(); });
  $('bank-listbox').addEventListener('mousedown', e => e.preventDefault());      // a click in the list keeps focus in the input

  $('bank-filter-btn').addEventListener('click', () => {
    const panel = $('bank-advanced');
    panel.hidden = !panel.hidden;
    $('bank-filter-btn').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) $('bank-show-methods').focus();
  });
  for (const id of ['bank-show-methods', 'bank-methods-pdf', 'bank-show-proposed', 'bank-op-and', 'bank-op-or']) $(id).addEventListener('change', readAdvanced);
  $('bank-proposed-option').hidden = reviewed.length === problems.length;     // the switch only when there is something behind it
  $('bank-year-box').hidden = YEARS.length < 2;                       // nothing to choose between
  for (const id of ['bank-year-lo', 'bank-year-hi']) { $(id).max = String(YMAX); $(id).addEventListener('input', onYearInput); }
  document.querySelectorAll('input[name="bank-solved"]').forEach(r => r.addEventListener('change', readAdvanced));
  $('bank-reset').addEventListener('click', resetFilters);
  $('bank-clear-selection').addEventListener('click', () => { if (!state.busy) setStatus(''); state.selection.clear(); state.order = null; renderResults(); syncUrl(); });

  $('bank-select-all').addEventListener('change', e => {
    const ids = state.results.map(p => p.id);
    select(e.target.checked ? S.autoOrder(ids, byId, cat) : ids, e.target.checked);   // added at the end of a hand-made order
    if (e.target.checked) prefetch();
    renderResults(); syncUrl();
  });
  $('bank-create').addEventListener('click', onCreate);
  $('bank-cancel').addEventListener('click', () => { if (job) job.abort(); });
  for (const ev of ['pointerenter', 'focus']) $('bank-create').addEventListener(ev, () => { if (!$('bank-create').disabled) prefetch(); });
  $('bank-show-all').addEventListener('click', () => { state.showAll = true; update(); });
  $('bank-hide-all').addEventListener('click', () => { state.showAll = false; update(); $('bank-show-all').focus(); });
  $('bank-order-btn').addEventListener('click', () => toggleOrderPanel($('bank-order').hidden));
  $('bank-order-reset').addEventListener('click', () => { state.order = null; renderSelectionState(); syncUrl(); });

  // engine progress: loading (for whatever waits), then "Compiling… [k / n]" for the job it belongs to (msg.job)
  C.onStatus(msg => {
    if (msg.kind !== 'progress') return;
    const compiling = msg.stage === 'compile' || /^Compiling/.test(msg.text);
    const step = compiling ? msg.text.replace(/^Compiling…\s*/, '') : '';          // "3 / 20" while the problems go by
    if (state.busy && (!compiling || msg.job !== 'preview')) setStatus(compiling && busyLabel ? busyLabel + (step ? ' ' + step : '') : msg.text);
    if (preview && !preview.done && (!compiling || msg.job === 'preview')) preview.status.textContent = compiling ? 'Compiling this problem…' : msg.text;
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
/* Once the bar above the results is stuck under the header, it also hides the rows that would pass between the header's
   capsules (.is-stuck in site.css).  Which of the two sticks depends on the width (see .bank-bar there), and where it
   sticks on the header's height, so the watch starts again when that changes. */
function stickyBar() { return document.querySelector(matchMedia('(max-width: 62rem)').matches ? '.bank-actions' : '.bank-bar'); }
let stuckAt = null, stuckBars = null;
function watchStuckBars() {
  const at = parseFloat(getComputedStyle(document.querySelector('.bank-bar')).top) || 0;
  if (at === stuckAt) return;
  stuckAt = at;
  if (stuckBars) stuckBars.disconnect();
  stuckBars = new IntersectionObserver(entries => {
    for (const e of entries) e.target.classList.toggle('is-stuck', e.boundingClientRect.height > 0 && e.intersectionRatio < 1 && e.boundingClientRect.top <= at + 1);
  }, { rootMargin: `-${at + 1}px 0px 100000px 0px`, threshold: 1 });      // below the window counts as inside: only the top edge means stuck
  for (const bar of document.querySelectorAll('.bank-bar, .bank-actions')) stuckBars.observe(bar);
}
watchStuckBars();
window.addEventListener('resize', watchStuckBars);

/* The bar wraps when its content does not fit (Cancel showing, a narrow window), and a message can take several lines: the
   status line sticks under the bar's real height, and a focused element stops below all of it (site.css: --bar-h, --status-h). */
function syncStuckHeights() {
  const bar = stickyBar(), status = $('bank-status'), style = document.documentElement.style;
  const barH = bar.offsetHeight && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
  const statusH = getComputedStyle(status).position === 'sticky' ? status.offsetHeight : 0;
  if (style.getPropertyValue('--bar-h') !== `${barH}px`) style.setProperty('--bar-h', `${barH}px`);
  if (style.getPropertyValue('--status-h') !== `${statusH}px`) style.setProperty('--status-h', `${statusH}px`);
}
{
  const sizes = new ResizeObserver(syncStuckHeights);
  for (const e of [document.querySelector('.bank-bar'), document.querySelector('.bank-actions'), $('bank-status')]) sizes.observe(e);
  window.addEventListener('resize', syncStuckHeights);
  let zoomed = false;
  new MutationObserver(() => {
    const now = document.documentElement.classList.contains('is-zoomed');
    if (now !== zoomed) { zoomed = now; syncStuckHeights(); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

document.documentElement.setAttribute('data-ready', '');          // site.js: from now on an error is not a failed page load
