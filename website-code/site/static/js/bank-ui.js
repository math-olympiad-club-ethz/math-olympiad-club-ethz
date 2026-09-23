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
const counts = S.tagCounts(problems, cat);                  // problems per tag: the list offers only tags that have some
const countOf = (type, slug) => counts.get(type + ':' + slug) || 0;
const inlinePdf = navigator.pdfViewerEnabled !== false;     // no built-in PDF viewer (Chrome on Android): links, no frame
const smooth = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; } catch (e) { return 'auto'; } };
const state = {
  filters: S.emptyFilters(),
  selection: new Set(),
  order: null,            // null = automatic PDF order (S.autoOrder); otherwise the IDs in the order chosen by hand
  results: [],
  list: { open: false, mode: 'browse', items: [], active: -1, expanded: new Set(), collapsed: new Set(S.TAG_TYPES) },   // every section of the tag list starts closed
  busy: false,
  showAll: false,         // the list stays hidden until the visitor searches, filters or clicks Show all
};

function loadFromUrl() {
  let decoded;
  try { decoded = S.decodeState(location.search, cat); }
  catch (e) { decoded = { filters: S.emptyFilters(), selection: [], order: null }; }      // a broken link: start empty
  const { filters, selection, order } = decoded;
  state.filters = filters;
  $('bank-search').value = filters.text;
  state.selection = new Set(selection.filter(id => byId.has(id)));
  state.order = order ? order.filter(id => byId.has(id)) : null;
  if (state.order && !state.order.length) state.order = null;
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
  const b = el('span', { class: `bank-chip bank-chip-${type}`, title: type === 'area' ? S.areaPath(cat, slug) : (tag.description || '') });
  b.append(el('span', { class: 'bank-chip-type', text: typeLabel }), el('span', { text: tag.name }));
  if (removable) {
    b.append(el('button', { type: 'button', class: 'bank-chip-x', 'aria-label': `Remove ${tag.name}`, onclick: (e) => removeChip(e.currentTarget, type, slug) }, '×'));
  } else if (clickable) {
    b.classList.add('bank-chip-clickable');
    b.setAttribute('role', 'button'); b.tabIndex = -1;      // a mouse shortcut: the keyboard picks tags in the search bar (fewer Tab stops per row)
    const add = (e) => { e.preventDefault(); e.stopPropagation(); addFilterTag(type, slug); };
    b.addEventListener('click', add);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') add(e); });
  }
  return b;
}

/* The difficulty is a human's rating.  Until someone rates a problem, its chip says "none" and carries the AI's
   estimate in small print; that estimate still drives the difficulty filter and the automatic PDF order. */
const diffName = slug => (S.getTag(cat, 'difficulty', slug) || { name: slug }).name;
function difficultyChip(p) {
  if (p.difficultySource === 'human') return tagBadge('difficulty', p.difficulty, { clickable: true });
  const chip = el('span', { class: 'bank-chip bank-chip-unrated' },
    el('span', { class: 'bank-chip-type', text: S.TYPE_LABEL.difficulty }), el('span', { text: 'none' }));
  if (p.difficultySource === 'ai') {
    chip.title = `Not rated yet. The AI estimates: ${diffName(p.difficulty)}`;
    chip.append(el('span', { class: 'bank-ai', text: `AI: ${diffName(p.difficulty).toLowerCase()}` }));
  }
  return chip;
}
const difficultyText = p => p.difficultySource === 'human' ? diffName(p.difficulty)
  : p.difficultySource === 'ai' ? `difficulty none (AI: ${diffName(p.difficulty).toLowerCase()})` : 'difficulty none';

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
    // what the typed words already do (filter the titles), then the tags they could stand for
    const tags = S.suggest(cat, q, state.filters, Infinity).filter(({ tag }) => countOf(tag.type, tag.slug) > 0).slice(0, 12)
      .map(({ tag }) => ({ tag, label: tag.name, count: countOf(tag.type, tag.slug), sub: tag.type === 'area' ? (tag.parent ? S.areaPath(cat, tag.slug) : tag.description || '') : tag.type === 'methods' ? tag.group : (tag.description || '') }));
    if (!n) return [{ header: `No title contains “${q.trim()}”.` + (tags.length ? ' Press Enter to filter by the first tag.' : '') }, ...tags];   // see Enter in wire()
    const head = { header: `${n} problem${n === 1 ? '' : 's'} with “${q.trim()}” in the title. Press Enter to see them.` };
    return tags.length ? [head, { header: 'or filter by one of these tags' }, ...tags] : [head];
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
  const methods = [];
  let group = null;
  for (const t of cat.byType.methods.values()) {
    if (!countOf('methods', t.slug)) continue;
    if (t.group !== group) { group = t.group; methods.push({ subheader: group }); }
    methods.push(option(t, 1));
  }
  section('methods', 'Methods (hidden in results unless "Show methods" is on)', methods);
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
        el('span', { class: 'bank-list-caret', 'aria-hidden': 'true', text: it.collapsed ? '▸' : '▾' }), el('span', { text: it.header }),
        el('span', { class: 'visually-hidden', text: it.collapsed ? ' (collapsed)' : ' (expanded)' }));
      if (it.countHead) head.append(el('span', { class: 'bank-list-count-head', text: 'problems' }));
      box.append(head);
      return;
    }
    if (it.header) { box.append(el('div', { class: 'bank-list-header', role: 'presentation', text: it.header })); return; }
    if ('subheader' in it) { box.append(el('div', { class: 'bank-list-subheader', role: 'presentation', text: it.subheader })); return; }
    it.optionIndex = optIndex++;
    const row = el('div', { class: `bank-option bank-option-${it.tag.type}` + (it.selected ? ' bank-option-selected' : ''), role: 'option', id: `bank-opt-${i}`,
      'aria-selected': it.selected ? 'true' : 'false', style: { '--depth': String(it.depth || 0) }, 'data-index': i });
    if (it.toggle) {       // a mouse target, not a button (no control inside an option): the keyboard opens a node with → and ←
      row.append(el('span', { class: 'bank-toggle', 'aria-hidden': 'true', title: (it.toggle === 'open' ? 'Collapse ' : 'Expand ') + it.label,
        onclick: (e) => { e.stopPropagation(); toggleExpand(it.tag.slug); } }, it.toggle === 'open' ? '▾' : '▸'));
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

function openList() { state.list.open = true; state.list.active = -1; renderList(); }
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
  f.op = $('bank-op-or').checked ? 'or' : 'and';
  f.solved = document.querySelector('input[name="bank-solved"]:checked').value;
  update();
}

function writeAdvanced() {
  const f = state.filters;
  $('bank-show-methods').checked = f.showMethods;
  $('bank-op-and').checked = f.op !== 'or'; $('bank-op-or').checked = f.op === 'or';
  $('bank-op-help').textContent = f.op === 'or' ? 'Problems with at least one of the tags.' : 'Problems with all the tags.';
  if (YEARS.length > 1) {
    const [lo, hi] = yearIndices(f);
    $('bank-year-lo').max = $('bank-year-hi').max = String(YMAX);
    $('bank-year-lo').value = String(lo); $('bank-year-hi').value = String(hi);
    drawYears(lo, hi);
  }
  document.querySelector(`input[name="bank-solved"][value="${f.solved}"]`).checked = true;
  const n = (f.op === 'or' ? 1 : 0) + (f.showMethods ? 1 : 0) + (f.yearFrom != null || f.yearTo != null ? 1 : 0) + (f.solved !== 'all' ? 1 : 0);
  $('bank-filter-count').textContent = n ? String(n) : '';
  $('bank-filter-count').hidden = !n;
}

function resetFilters() {
  state.filters = S.emptyFilters();
  $('bank-search').value = '';
  update();
}

/* ------------------------------------------------------------------ Preview: one problem, read here */
let preview = null;         // {id, panel, btn, url, abort, status, done}: at most one open at a time

function closePreview() {
  if (!preview) return;
  preview.abort.abort();                        // a compile still waiting for the engine is dropped, not run for nothing
  if (preview.url) URL.revokeObjectURL(preview.url);
  preview.panel.remove();
  preview.btn.setAttribute('aria-expanded', 'false');
  preview.btn.removeAttribute('aria-controls');
  preview = null;
}

/* Open PDF and Download always; the PDF itself in the page only where the browser has a PDF viewer. */
function pdfLinks(url, filename) {
  return el('div', { class: 'bank-out-actions' },
    el('a', { class: 'btn btn-sm btn-outline-primary', href: url, target: '_blank', rel: 'noopener', text: 'Open PDF' }),
    el('a', { class: 'btn btn-sm btn-outline-primary', href: url, download: filename, text: 'Download PDF' }));
}

async function togglePreview(p, row, btn) {
  const wasOpen = preview && preview.id === p.id;
  closePreview();
  if (wasOpen) return;
  prefetch();
  const status = el('div', { class: 'small text-muted', role: 'status', text: 'Compiling this problem…' });
  const panel = el('div', { class: 'bank-preview-panel', id: `bank-preview-${p.id}` }, status);
  row.append(panel);                            // inside the problem's row: not an extra item of the list
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-controls', panel.id);
  const mine = preview = { id: p.id, panel, btn, url: null, abort: new AbortController(), status, done: false };
  try {
    const res = await C.compilePreview(p.id, { signal: mine.abort.signal });
    if (preview !== mine) return;               // closed, or another Preview opened meanwhile
    mine.done = true;
    mine.url = URL.createObjectURL(new Blob([res.pdf], { type: 'application/pdf' }));
    panel.replaceChildren(pdfLinks(mine.url, (S.normalize(p.title).replace(/ /g, '-') || 'problem') + '.pdf'));
    if (inlinePdf) panel.append(el('iframe', { class: 'bank-pdf bank-preview-pdf', src: mine.url, title: `Preview of ${p.title}` }));
  } catch (e) {
    if (preview !== mine || (e && e.name === 'AbortError')) return;
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
function listShown() { return problems.length > 0 && (state.showAll || hasQuery()); }

/* Every row is built once, the first time the list is shown (in ID order, the order of the results), and afterwards
   only hidden or shown: typing, filtering and ticking do not rebuild the list, and focus stays where it was. */
const rows = new Map();     // id -> {li, cb}

function buildRow(p) {
  const cb = el('input', { type: 'checkbox', class: 'form-check-input bank-check', id: `bank-p-${p.id}`, 'data-id': p.id, 'aria-label': `Select “${p.title}”` });
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
  const marker = !p.hasSolution ? el('span', { class: 'bank-marker bank-marker-unsolved', title: 'No solution in the bank yet', text: 'no solution' })
    : p.partial ? el('span', { class: 'bank-marker bank-marker-partial', title: 'The solution is unfinished', text: 'partial solution' }) : null;
  const review = data.index.preview ? el('span', { class: `bank-review bank-review-${p.review}`, text: `review: ${p.review}` }) : null;
  // no per-problem Edit link for now: it comes back with the administrator mode (TODO.md)
  const edit = p.provisional ? el('span', { class: 'bank-review bank-review-new', title: 'Proposed problem, not merged yet', text: 'new' }) : null;
  const previewBtn = el('button', { type: 'button', class: 'btn btn-sm btn-link bank-preview-btn', 'aria-expanded': 'false', 'aria-label': `Preview “${p.title}”`,
    title: 'Read this problem here (statement only, compiled in your browser)', text: 'Preview' });
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
  if (preview && !visible.has(preview.id)) closePreview();
  for (const [id, r] of rows) {
    const on = visible.has(id);
    if (r.li.hidden === on) r.li.hidden = !on;
    syncRow(id);
  }
  list.classList.toggle('bank-show-methods', !!state.filters.showMethods);
  for (const chip of list.querySelectorAll('.bank-chip-alsoin')) chip.hidden = !state.filters.origin.includes(chip.dataset.slug);
  $('bank-count').textContent = `${state.results.length} of ${problems.length} problem${problems.length === 1 ? '' : 's'}`;
  $('bank-count').hidden = !shown;
  $('bank-hide-all').hidden = !(shown && state.showAll && !hasQuery());      // back to the calm page
  $('bank-select-all-wrap').hidden = !shown;
  $('bank-idle-count').textContent = `${problems.length} problem${problems.length === 1 ? '' : 's'}.`;
  $('bank-idle').hidden = shown || problems.length === 0;
  $('bank-empty').hidden = !shown || state.results.length > 0;
  $('bank-none-published').hidden = problems.length > 0;
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
  $('bank-results-head').hidden = problems.length === 0 || (n === 0 && !listShown());
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
  else if (!$('bank-order').hidden) renderOrder();
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
  if (open) renderOrder();
}

const HANDLE = () => el('span', { class: 'bank-order-handle', 'aria-hidden': 'true', title: 'Drag to move' }, '⠿');

function renderOrder() {
  const list = $('bank-order-list');
  const ids = pdfOrder();
  $('bank-order-mode').textContent = state.order ? 'your order' : 'automatic: easiest first, then by area';
  $('bank-order-reset').disabled = !state.order;
  list.replaceChildren();
  ids.forEach((id, k) => {
    const p = byId.get(id);
    const move = (delta) => {
      const next = [...ids];
      const j = k + delta;
      if (j < 0 || j >= next.length) return;
      [next[k], next[j]] = [next[j], next[k]];
      state.order = next;
      renderSelectionState(); syncUrl();                    // redraws the (open) order panel
      const btn = document.querySelector(`#bank-order-list li[data-id="${id}"] .bank-order-${delta < 0 ? 'up' : 'down'}`);
      (btn && !btn.disabled ? btn : document.querySelector(`#bank-order-list li[data-id="${id}"] .bank-order-${delta < 0 ? 'down' : 'up'}`))?.focus();
    };
    const handle = HANDLE();
    const li = el('li', { class: 'list-group-item bank-order-row', 'data-id': id },
      handle,
      el('span', { class: 'bank-order-pos', text: `${k + 1}.` }),
      el('span', { class: 'bank-title', text: p ? p.title : '' }),
      el('span', { class: 'bank-order-meta small text-muted', text: p ? [difficultyText(p), p.area[0] ? S.areaPath(cat, p.area[0]).split(' › ')[0] : ''].filter(Boolean).join(' · ') : '' }),
      el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary bank-order-up', 'aria-label': `Move “${p ? p.title : ''}” up`, disabled: k === 0, onclick: () => move(-1) }, '↑'),
      el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary bank-order-down', 'aria-label': `Move “${p ? p.title : ''}” down`, disabled: k === ids.length - 1, onclick: () => move(1) }, '↓'));
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
    const step = lastY < r.top + edge ? -Math.min(24, r.top + edge - lastY) : lastY > r.bottom - edge ? Math.min(24, lastY - r.bottom + edge) : 0;
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
let lastCreate = null;          // what the problems PDF on screen was built from; the solutions PDF reuses it

let busyLabel = '';              // what the status line says while pdfTeX works on the current Create
let job = null;                  // AbortController of the PDF being made (the Cancel button)
function setStatus(text, kind = 'muted') {
  const s = $('bank-status');
  s.textContent = text;
  s.className = 'bank-status small ' + (kind === 'muted' ? 'text-muted' : `text-${kind}-emphasis`);    // -emphasis: readable in dark mode too
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
  const ids = res ? res.ids : (idsForName || S.sortIds([...state.selection]));
  const actions = res && res.pdf ? pdfLinks(mk(res.pdf, 'application/pdf'), texFilename(ids, variant, '.pdf')) : el('div', { class: 'bank-out-actions' });
  const tex = res ? res.mainTex : err && err.mainTex;
  if (tex) {
    actions.append(el('a', { class: 'btn btn-sm btn-outline-secondary', href: mk(C.standaloneTex(tex, preambleText), 'text/plain'), download: texFilename(ids, variant, '.tex'), text: 'Download .tex',
      title: preambleText ? 'Standalone LaTeX source (preamble inlined)' : 'LaTeX source; needs preamble.tex from the repository next to it' }));
    if (/\\includegraphics\{fig\d{4}-\d+\.pdf\}/.test(tex)) actions.append(el('span', { class: 'small text-muted align-self-center', text: 'The .tex references externalised figures (fig….pdf) that are not included.' }));
  }
  body.append(actions);
  if (res && res.pdf) {
    const info = res.fromCache ? 'from cache' : `${res.passes.length} pass${res.passes.length === 1 ? '' : 'es'}, ${(res.ms / 1000).toFixed(1)} s`;
    body.append(el('div', { class: 'small text-muted', text: `${ids.length} problem${ids.length === 1 ? '' : 's'}${res.pages ? `, ${res.pages} pages` : ''} · ${info}` }));
    if (inlinePdf) body.append(el('iframe', { class: 'bank-pdf', src: card._urls[0], title: `${variant} PDF` }));
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
async function compileInto(variant, ids, filtersText, showMethods, doneMessage, signal) {
  try {
    busyLabel = variant === 'problems' ? 'Compiling the problems PDF…' : 'Compiling the PDF with the solutions…';
    setStatus(busyLabel);
    const res = await C.compileSelection(ids, variant, { filtersText, showMethods, signal });
    output[variant] = res;
    renderOutput(variant, res, null, ids);
    setStatus(doneMessage, 'success');
    return 'ok';
  } catch (e) {
    const name = e && e.name;
    if (name === 'AbortError') { setStatus('Cancelled.'); return 'cancelled'; }
    const message = (e && e.message) || String(e);
    let mainTex = e && e.mainTex;
    if (!mainTex && name !== 'StaleError') { try { mainTex = C.makeMain(await C.loadBodies(), ids, variant, { filters: filtersText, showMethods }); } catch (e2) { /* no bodies */ } }
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
  const filtersText = '';        // no "Selection" line on the cover: it described the filters, not the ticked problems, and could leak methods or carry raw search text
  const showMethods = state.filters.showMethods;
  output.solutions = null;
  lastCreate = null;
  $('bank-output').hidden = false;
  $('bank-out-problems').hidden = false; $('bank-out-solutions').hidden = true;
  $('bank-out-problems').querySelector('.bank-out-body').replaceChildren(el('div', { class: 'small text-muted', text: 'Compiling…' }));
  $('bank-output').scrollIntoView({ behavior: smooth(), block: 'start' });
  try {
    try {
      setStatus('Loading problem texts…');
      await C.loadBodies();
      preambleText = await C.loadPreamble();
    } catch (e) {
      const msg = (e && e.message) || String(e);        // bank-compile.js says it all ("Could not download the problem texts …")
      setStatus(msg, 'danger');
      renderOutput('problems', null, { name: e && e.name, message: msg, mainTex: null, noReset: true }, ids);
      return;
    }
    const done = mine.signal.aborted ? 'cancelled' : await compileInto('problems', ids, filtersText, showMethods, 'The PDF is ready.', mine.signal);
    if (done === 'ok') {
      lastCreate = { ids, filtersText, showMethods };
      renderSolutionsOffer(ids);
    } else if (done === 'cancelled') {
      $('bank-out-problems').hidden = true;
      $('bank-output').hidden = true;
      setStatus('Cancelled.');
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
  const { ids, filtersText, showMethods } = lastCreate;
  const card = $('bank-out-solutions');
  card.hidden = false;
  card.querySelector('.bank-out-body').replaceChildren(el('div', { class: 'small text-muted', text: 'Compiling…' }));
  let done = 'failed';
  try {
    done = await compileInto('solutions', ids, filtersText, showMethods, 'The PDF with the solutions is ready.', mine.signal);
    if (done === 'cancelled') renderSolutionsOffer(ids);        // the problems PDF is still there: offer again
  } finally {
    job = null;
    state.busy = false;
    renderSelectionState();
    if (done === 'cancelled') { const b = $('bank-make-solutions'); const a = document.activeElement; if (b && (!a || a === document.body || a === $('bank-cancel'))) b.focus({ preventScroll: true }); }
    else focusOutput('solutions');
  }
}

/* The engine (25 MB) is fetched ahead only on a clear sign that a PDF is coming: a first tick, a Preview, the pointer
   or the focus on Create.  Not on a mere scroll or click on the page. */
let prefetched = false;
function prefetch() { if (prefetched) return; prefetched = true; C.prefetchEngine(); }

/* ------------------------------------------------------------------ wiring */
function wire() {
  const input = $('bank-search');
  input.addEventListener('focus', () => { if (!quietFocus) openList(); });
  input.addEventListener('click', () => { if (!state.list.open) openList(); });        // focus has just opened it
  // what is typed filters the titles live; the list below still offers the tags those words could mean
  input.addEventListener('input', () => { state.filters.text = input.value.trim(); state.list.open = true; state.list.active = -1; update(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!state.list.open) openList(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (state.list.open) moveActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const best = state.list.mode === 'suggest' && !state.results.length ? state.list.items.findIndex(it => it.tag) : -1;
      if (state.list.active >= 0) chooseItem(state.list.active);     // a tag picked with the arrow keys
      else if (best >= 0) chooseItem(best);                          // no title contains the words: the best tag, not an empty list
      else closeList();                                             // otherwise the typed words stay as a title search
    } else if (e.key === 'Escape') { closeList(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const it = state.list.items[state.list.active];
      if (it && it.toggle) { e.preventDefault(); const open = it.toggle === 'open'; if ((e.key === 'ArrowRight') !== open) toggleExpand(it.tag.slug); }
      else if (it && it.section) { e.preventDefault(); if ((e.key === 'ArrowRight') === it.collapsed) toggleSection(it.section); }
    } else if (e.key === 'Backspace' && input.value === '') {
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
  for (const id of ['bank-show-methods', 'bank-op-and', 'bank-op-or']) $(id).addEventListener('change', readAdvanced);
  $('bank-year-box').hidden = YEARS.length < 2;                       // nothing to choose between
  for (const id of ['bank-year-lo', 'bank-year-hi']) { $(id).max = String(YMAX); $(id).addEventListener('input', onYearInput); }
  document.querySelectorAll('input[name="bank-solved"]').forEach(r => r.addEventListener('change', readAdvanced));
  $('bank-reset').addEventListener('click', resetFilters);
  $('bank-clear-selection').addEventListener('click', () => { state.selection.clear(); state.order = null; renderResults(); syncUrl(); });

  $('bank-select-all').addEventListener('change', e => {
    const ids = state.results.map(p => p.id);
    select(e.target.checked ? S.autoOrder(ids, byId, cat) : ids, e.target.checked);   // added at the end of a hand-made order
    if (e.target.checked) prefetch();
    renderResults(); syncUrl();
  });
  $('bank-create').addEventListener('click', onCreate);
  $('bank-cancel').addEventListener('click', () => { if (job) job.abort(); });
  for (const ev of ['pointerenter', 'focus']) $('bank-create').addEventListener(ev, prefetch);
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
}

/* exposed for the browser tests */
window.bank = { state, cat, problems, byId, S, C, update, compile: onCreate, compileSolutions: onCreateSolutions, output, pdfOrder };

// bank-compile.js refuses problem texts or an engine from another deploy than this page's (build.py writes both; absent = no check)
C.expectBuild({ build: data.build, engine: data.engine });
loadFromUrl();
wire();
update();
if (!C.engineSupported()) $('bank-engine-warning').hidden = false;
document.documentElement.setAttribute('data-ready', '');          // site.js: from now on an error is not a failed page load
