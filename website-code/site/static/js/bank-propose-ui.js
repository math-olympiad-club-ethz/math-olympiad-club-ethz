/* bank-propose-ui.js — the "Propose a problem" page (propose.html): a desk and a sheet.  On the left the problem is
   written: a title, the statement, and three lines that open in place (a solution, where it is from, what it is about);
   the rest waits under More details.  On the right the same problem is typeset by the in-browser pdfTeX (the Problems
   page's) and drawn with PDF.js, like the statements there.
   Sending (Antoine's choice, 2026-11-23, after trying the others): the share menu, with the PDF, the .tex file and the
   note in it (a click on Mail, the club's address copied to paste in To: the one way a page can put files into an
   email), and one line, "Problem: <title>"; without a share menu (Firefox) the files are saved and the mail app opens
   with that line.  No server, nothing stored but a draft on this device.
   Logic lives in bank-propose.js (pure, unit-tested); this file is only the DOM. */
// Loaded as bank-propose-ui.js?v=<build>: the other modules are imported with the same ?v= (see bank-propose.js).
const V = new URL(import.meta.url).search;
const [S, C, P, { parseBibEntries, parseBibText }, F] = await Promise.all(
  ['bank-search', 'bank-compile', 'bank-propose', 'bank-tex', 'tree-fold'].map(m => import(`./${m}.js${V}`)));

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

const data = JSON.parse($('propose-data').textContent);
const cat = S.buildCatalogue(data.tags);
const DRAFT_KEY = 'bank-propose-draft-v1';
const ADDRESS = $('pp-submit').dataset.address;
const { reducedMotion, EASE } = F;
const state = {
  bib: null,              // references.bib, parsed ({key: fields}); null until loaded (then \cite keys are checked)
  submitted: false,       // after the first Send, missing required fields are shown too
  // shownTex: the document whose result (drawing or error) is on the sheet; shownOk: true = it typeset, false = LaTeX
  // error, null = no verdict (engine failure, timeout); pdf, width: the last drawing that typeset, and its measure (null
  // = the bank's own); a4: the document sent by email, typeset ({tex, pdf, ok, log, lines}): the sheet's own when the
  // sheet has the bank's measure, otherwise made when sending.  running: one typesetting at a time, the newest text
  // after it (never a queue of old ones)
  preview: { shownTex: null, shownOk: null, shownStatus: ['', 'muted', ''], pdf: null, width: null, a4: null, drawn: null, timer: null, running: false, again: false },
  sendAnyway: null,       // the file the sender chose to send although its LaTeX does not typeset
};

/* ------------------------------------------------------------------ the trees: topics ("What is it about?") and methods */

/* As on the Problems page: a round button folds or unfolds one level (a fold closes what is open inside it, the deepest
   first: tree-fold.js), a name is chosen with a click and let go with another; several may be chosen.  At the end of each
   open branch, "New topic here" (or "New method here") names one the tree does not have: it hangs there, marked new and
   chosen, for the reviewer to add to tags.yml where it was put.
   nodes: the first level, [{key, name, slug (null: a group of methods, only folded), topic (its colour)}]; kids(key): the
   nodes under one; find(name): the slug of a tag of this tree with that name (named anew, it is chosen instead); path(slug):
   the keys to unfold for it to be seen. */
function choiceTree(root, { nodes, kids, find, path, word, onChange }) {
  const chosen = [], added = [], open = new Set();        // added: [{name, under: the key it hangs under, or null}]
  const label = (name, isOpen) => `${isOpen ? 'Fold' : 'Unfold'} ${name}`;
  function item(n) {
    const sub = kids(n.key), isOpen = sub.length > 0 && open.has(n.key);
    const li = el('li', { class: sub.length || !n.slug ? '' : 'tt-leaf', 'data-topic': n.topic || null });
    if (n.topic) F.paint(li, cat.byType.area.get(n.topic));
    const row = el('div', { class: 'tt-row' });
    if (sub.length || !n.slug) row.append(el('button', { type: 'button', class: 'tt-tg', 'data-for': n.key, 'aria-expanded': String(isOpen), 'aria-label': label(n.name, isOpen) }, isOpen ? '−' : '+'));
    else row.append(el('span', { class: 'tt-dot', 'aria-hidden': 'true' }));
    row.append(n.slug ? el('button', { type: 'button', class: 'tt-name', 'data-slug': n.slug, 'aria-pressed': String(chosen.includes(n.slug)) }, n.name)
      : el('button', { type: 'button', class: 'tt-name tt-group', 'data-for': n.key, 'aria-expanded': String(isOpen) }, n.name));
    li.append(row);
    if (isOpen) li.append(branch(n.key));
    return li;
  }
  function newItem(a) {
    return el('li', { class: 'tt-leaf tt-new' }, el('div', { class: 'tt-row' }, el('span', { class: 'tt-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'tt-name' }, a.name, el('span', { class: 'tt-new-mark', text: ' (new)' })),
      el('button', { type: 'button', class: 'tt-new-x', 'aria-label': `Remove the new ${word} ${a.name}`, onclick: () => {
        added.splice(added.indexOf(a), 1); render(); onChange();
        const line = root.querySelector(`.tt-add[data-under="${a.under === null ? '' : a.under}"] .tt-add-btn`); if (line) line.focus();
      } }, '×')));
  }
  function addLine(under) {
    const li = el('li', { class: 'tt-leaf tt-add', 'data-under': under === null ? '' : under });
    const btn = el('button', { type: 'button', class: 'tt-add-btn' }, `New ${word} here`);
    btn.addEventListener('click', () => askName(li, under));
    li.append(el('div', { class: 'tt-row' }, el('span', { class: 'tt-dot', 'aria-hidden': 'true' }), btn));
    return li;
  }
  const branch = under => el('ul', {}, ...kids(under).map(item), ...added.filter(a => a.under === under).map(newItem), addLine(under));
  function render() { root.replaceChildren(...nodes.map(item), ...added.filter(a => a.under === null).map(newItem), addLine(null)); }
  /* "New topic here": the line becomes a field for its name (Enter or Add; Escape, or leaving it empty, gives the line back) */
  function askName(li, under) {
    const row = li.querySelector('.tt-row'), was = [...row.childNodes];
    const input = el('input', { type: 'text', class: 'form-control form-control-sm tt-add-input', maxlength: String(P.MAX_NEW_TAG), autocomplete: 'off', 'aria-label': `The new ${word}'s name` });
    const ok = el('button', { type: 'button', class: 'btn btn-sm' }, 'Add');
    row.replaceChildren(was[0], input, ok);
    const back = (focus = true) => { row.replaceChildren(...was); if (focus) was[1].focus(); };
    const take = () => {
      const name = P.newTagName(input.value), key = name.toLowerCase();
      if (!name) { back(); return; }
      const known = find(name);
      if (known) { if (!chosen.includes(known)) chosen.push(known); for (const k of path(known)) open.add(k); }
      else if (!added.some(a => a.name.toLowerCase() === key)) added.push({ name, under });
      render(); onChange();
      const line = root.querySelector(`.tt-add[data-under="${under === null ? '' : under}"] .tt-add-btn`); if (line) line.focus();
    };
    ok.addEventListener('click', take);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); take(); } else if (e.key === 'Escape') { e.preventDefault(); back(); } });
    input.addEventListener('blur', () => setTimeout(() => { if (input.isConnected && !input.value.trim() && document.activeElement !== ok) back(false); }, 0));
    input.focus();
  }
  /* + and −, or a group's name: one level unfolds; a fold closes every branch inside it, the deepest first */
  function fold(key, li) {
    const opening = !open.has(key);
    const tg = li.querySelector(':scope > .tt-row > .tt-tg'), group = li.querySelector(':scope > .tt-row > .tt-group');
    const name = (li.querySelector(':scope > .tt-row > .tt-name') || {}).firstChild;
    if (opening) open.add(key); else for (const b of li.querySelectorAll('.tt-tg')) open.delete(b.dataset.for);
    if (tg) { tg.textContent = opening ? '−' : '+'; tg.setAttribute('aria-expanded', String(opening)); tg.setAttribute('aria-label', label(name ? name.textContent : '', opening)); }
    if (group) group.setAttribute('aria-expanded', String(opening));
    if (opening) {
      for (const going of li.querySelectorAll(':scope > ul.tt-going')) going.remove();    // unfolded again before it had folded
      const ul = branch(key); li.append(ul); F.slide(ul, true); return;
    }
    const ul = li.querySelector(':scope > ul:not(.tt-going)');
    if (ul) { ul.classList.add('tt-going'); F.foldBranch(ul).then(() => ul.remove()); }
  }
  root.addEventListener('click', e => {
    const t = e.target.closest('.tt-tg, .tt-group');
    if (t && root.contains(t)) { fold(t.dataset.for, t.closest('li')); return; }
    const name = e.target.closest('button.tt-name[data-slug]');
    if (!name || !root.contains(name)) return;
    const slug = name.dataset.slug, i = chosen.indexOf(slug);
    if (i >= 0) chosen.splice(i, 1); else chosen.push(slug);
    name.setAttribute('aria-pressed', String(i < 0));
    onChange();
  });
  render();
  return {
    get: () => [...chosen],
    set(slugs) {
      chosen.splice(0, chosen.length, ...(Array.isArray(slugs) ? slugs : []).filter(s => find(s, true)));
      for (const s of chosen) for (const k of path(s)) open.add(k);         // a chosen one is in sight
      render();
    },
    getNew: () => added.map(a => ({ ...a })),
    setNew(list) {
      added.splice(0, added.length, ...(Array.isArray(list) ? list : []).map(a => ({ name: P.newTagName(a.name), under: a.under || null })).filter(a => a.name));
      for (const a of added) if (a.under) { open.add(a.under); for (const k of path(a.under)) open.add(k); }
      render();
    },
    names: () => [...chosen.map(s => find(s, true)), ...added.map(a => a.name)],
  };
}

/* The trees of this page: the topics of tags.yml as on the Problems page (each first-level topic in its colour), and the
   methods in their groups. */
function topicsTree() {
  const area = cat.byType.area;
  const asNode = t => ({ key: t.slug, name: t.name, slug: t.slug, topic: t.parent ? null : t.slug });
  return choiceTree($('pp-tree'), {
    nodes: [...area.values()].filter(t => !t.parent).map(asNode),
    kids: key => (key && area.has(key) ? (area.get(key).children || []).map(s => area.get(s)).filter(Boolean).map(asNode) : []),
    find: (name, bySlug) => {                             // bySlug: a slug -> its name; otherwise a name -> its slug
      if (bySlug) return area.has(name) ? area.get(name).name : null;
      const key = name.toLowerCase(), t = [...area.values()].find(a => a.name.toLowerCase() === key || a.slug === key);
      return t ? t.slug : null;
    },
    path: slug => (area.has(slug) ? cat.ancestors.get(slug) || [] : []),
    word: 'topic', onChange: () => onDraftChange(),
  });
}
function methodsTree() {
  const methods = cat.byType.methods, groups = [...new Set([...methods.values()].map(t => t.group))];
  return choiceTree($('pp-methods'), {
    nodes: groups.map(g => ({ key: `g:${g}`, name: g, slug: null })),
    kids: key => (key && key.startsWith('g:') ? [...methods.values()].filter(t => t.group === key.slice(2)).map(t => ({ key: t.slug, name: t.name, slug: t.slug })) : []),
    find: (name, bySlug) => {
      if (bySlug) return methods.has(name) ? methods.get(name).name : null;
      const key = name.toLowerCase(), t = [...methods.values()].find(m => m.name.toLowerCase() === key || m.slug === key);
      return t ? t.slug : null;
    },
    path: slug => (methods.has(slug) ? [`g:${methods.get(slug).group}`] : []),
    word: 'method', onChange: () => onDraftChange(),
  });
}

/* Difficulty: four words, one chosen or none (not rated). */
function difficultyChoices() {
  const box = $('pp-difficulty');
  for (const t of cat.byType.difficulty.values()) box.append(el('button', { type: 'button', class: 'pp-choice', 'data-value': t.slug, 'aria-pressed': 'false' }, t.name));
  box.addEventListener('click', e => {
    const b = e.target.closest('.pp-choice');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    for (const x of box.children) x.setAttribute('aria-pressed', String(x === b && on));
    onDraftChange();
  });
  return {
    get: () => { const b = box.querySelector('[aria-pressed="true"]'); return b ? b.dataset.value : ''; },
    set: v => { for (const x of box.children) x.setAttribute('aria-pressed', String(x.dataset.value === v)); },
  };
}

/* ------------------------------------------------------------------ the statement and the solution grow */

/* From 5 lines, each box grows with its text up to most of the window (then it scrolls): the whole problem in sight. */
function autosize(ta) {
  if (ta.hidden || !ta.offsetParent) return;
  const before = ta.style.getPropertyValue('height');
  ta.style.removeProperty('height');                      // its rows: the smallest it gets
  const least = ta.offsetHeight, most = Math.max(least, Math.round(window.innerHeight * .7));
  const want = ta.scrollHeight + ta.offsetHeight - ta.clientHeight;
  const h = Math.min(most, Math.max(least, want));
  ta.classList.toggle('is-full', want > most);
  if (h > least) ta.style.setProperty('height', `${h}px`); else if (before) ta.style.removeProperty('height');
}
const autosizeAll = () => { for (const ta of document.querySelectorAll('.pp-grow')) autosize(ta); };

/* ------------------------------------------------------------------ the three lines that open in place */

function openPart(name, open = true) {
  const btn = $(`pp-add-${name}`), box = $(`pp-${name}-box`);
  if (!btn || box.hidden === !open) return;
  btn.setAttribute('aria-expanded', String(open));
  box.hidden = !open;
  if (open) autosizeAll();
  if (open && box.animate && !reducedMotion()) box.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE });
}
function togglePart(name) {
  const open = $(`pp-${name}-box`).hidden;
  openPart(name, open);
  if (open) {
    const first = { solution: $('pp-solution'), from: $('pp-from'), note: $('pp-note') }[name] || $('pp-tree').querySelector('.tt-name');
    if (first) first.focus();
  }
}

/* What each closed line holds, said on the line itself. */
/* Words written only when they change: Safari drops a click on a line whose words were just written again (leaving a
   field writes them), and a screen reader would say them again. */
const say = (e, text) => { if (e.textContent !== text) e.textContent = text; };
function renderSummaries(d) {
  say($('pp-add-solution').querySelector('.pp-add-label'), d.solution.trim() ? 'Solution' : 'Add a solution');
  const from = String(d.from || '').trim(), r = P.parseOrigin(from, cat);
  const read = r.known ? P.originLabel(cat, r.origin, r.originDate, r.originNumber) : from;
  const t = r.known && cat.byType.origin.get(r.origin), bare = t && !r.originDate && !r.originNumber && !OWN_KINDS.has(t.kind);
  say($('pp-from-sum'), read);
  say($('pp-from-read'), !from ? '' : bare ? `Then the year and the problem, as in ${usualForm(t)}.` : r.known ? `Read as ${read}.`
    : 'Not a competition we know: kept as written, as a reference.');
  const about = topics.names();
  say($('pp-about-sum'), about.length ? about.join(', ') : 'choose one');
  $('pp-about-sum').classList.toggle('is-wanted', !about.length);
  say($('pp-note-sum'), String(d.note || '').replace(/\s+/g, ' ').trim());
}

/* ------------------------------------------------------------------ "Where is it from?": the competitions the bank knows */

/* While the line names no competition yet, a list under it offers those of tags.yml (and one's own problem, folklore), the
   ones the bank has most problems from first, each with the form its problems have there (build.py origin_forms).  A
   competition picked writes its name; the line below then says what follows ("as in IMC 2012, Day 1, Problem 2"). */
const FORMS = data.originForms || {};
const OWN_KINDS = new Set(['original', 'folklore']), FROM_KINDS = new Set(['university', 'high-school', 'original', 'folklore']);
const usualForm = t => { const f = FORMS[t.slug] || {}; return P.originLabel(cat, t.slug, f.date || '2012', f.number || 'Problem 3'); };
const fromName = t => (t.kind === 'original' ? 'My own problem' : t.name);
const fromHint = t => (t.kind === 'original' ? 'one you made up' : t.kind === 'folklore' ? 'a classic, its source unknown' : usualForm(t));
const fromChoices = [...cat.byType.origin.values()].filter(t => FROM_KINDS.has(t.kind))
  .map((t, i) => ({ t, i, n: (FORMS[t.slug] || {}).n || 0, words: [t.name, t.slug.replace(/-/g, ' '), ...(t.aliases || []), fromName(t)].map(S.normalize).join(' ').split(' ') }))
  .sort((a, b) => b.n - a.n || a.i - b.i);
const fromList = { items: [], active: -1 };
function fromMatches(q) {
  const words = S.normalize(q).split(' ').filter(Boolean);
  return fromChoices.filter(c => words.every(w => c.words.some(x => x.startsWith(w)))).slice(0, 8).map(c => c.t);
}
function renderFromList() {
  const input = $('pp-from'), list = $('pp-from-list'), open = fromList.items.length > 0, was = !list.hidden;
  list.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (fromList.active >= 0 && open) input.setAttribute('aria-activedescendant', `pp-from-opt-${fromList.active}`); else input.removeAttribute('aria-activedescendant');
  list.replaceChildren(...fromList.items.map((t, i) => {
    const row = el('div', { id: `pp-from-opt-${i}`, class: 'bank-option' + (i === fromList.active ? ' bank-option-active' : ''), role: 'option', 'aria-selected': String(i === fromList.active) },
      el('span', { class: 'bank-option-label', text: fromName(t) }), el('span', { class: 'bank-option-sub', text: fromHint(t) }));
    row.addEventListener('mousedown', e => e.preventDefault());           // the line keeps the focus
    row.addEventListener('click', () => pickFrom(t));
    return row;
  }));
  if (!open) return;
  // in sight: the line goes up when the list would open below the screen (or under a phone's keyboard), and the list is
  // as tall as the room left under the line
  const vv = window.visualViewport, bottom = () => (vv ? vv.offsetTop + vv.height : innerHeight);
  if (!was && input.getBoundingClientRect().bottom + Math.min(list.scrollHeight, 240) > bottom()) input.scrollIntoView({ block: 'start' });
  list.style.setProperty('max-height', `${Math.max(140, Math.min(416, bottom() - input.getBoundingClientRect().bottom - 12))}px`);
}
function updateFromList() {
  const input = $('pp-from');
  fromList.items = document.activeElement === input && !P.parseOrigin(input.value, cat).known ? fromMatches(input.value) : [];
  fromList.active = Math.min(fromList.active, fromList.items.length - 1);
  renderFromList();
}
function closeFromList() { fromList.items = []; fromList.active = -1; renderFromList(); }
function pickFrom(t) {
  const input = $('pp-from');
  input.value = t.kind === 'original' ? 'My own problem' : t.kind === 'folklore' ? 'Folklore' : `${t.name} `;
  closeFromList();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  onDraftChange();
}
function wireFrom() {
  const input = $('pp-from');
  input.addEventListener('focus', updateFromList);
  input.addEventListener('input', updateFromList);
  input.addEventListener('blur', closeFromList);
  input.addEventListener('keydown', e => {
    const n = fromList.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) { updateFromList(); if (!fromList.items.length) return; }
      e.preventDefault();
      const m = fromList.items.length, step = e.key === 'ArrowDown' ? 1 : -1;
      fromList.active = fromList.active < 0 ? (step > 0 ? 0 : m - 1) : (fromList.active + step + m) % m;
      renderFromList();
    } else if (e.key === 'Enter' && n && fromList.active >= 0) { e.preventDefault(); pickFrom(fromList.items[fromList.active]); }
    else if (e.key === 'Escape' && n) { e.preventDefault(); closeFromList(); }
  });
}

/* ------------------------------------------------------------------ the form <-> a draft */

let topics = null, methods = null, difficulty = null;
const TEXT_FIELDS = { title: 'pp-title', statement: 'pp-statement', solution: 'pp-solution', references: 'pp-references', bibtex: 'pp-bibtex', from: 'pp-from',
  note: 'pp-note' };       // note: why the proposer likes it, sent beside the file (not in it)

/* What the form holds.  "Where is it from?" read as a competition gives the origin, its date and its number; new topics
   and methods keep where they were put (newAreaUnder: name -> the topic it hangs under; newMethodsUnder: name -> group). */
function readDraft() {
  const d = P.emptyDraft();
  for (const [k, id] of Object.entries(TEXT_FIELDS)) d[k] = $(id).value;
  const r = P.parseOrigin(d.from, cat);
  if (r.known) Object.assign(d, { origin: r.origin, originDate: r.originDate, originNumber: r.originNumber });
  d.difficulty = difficulty.get();
  d.area = topics.get();
  const na = topics.getNew(), nm = methods.getNew();
  d.newArea = na.map(a => a.name);
  d.newAreaUnder = Object.fromEntries(na.filter(a => a.under).map(a => [a.name, a.under]));
  d.methods = methods.get();
  d.newMethods = nm.map(a => a.name);
  d.newMethodsUnder = Object.fromEntries(nm.filter(a => a.under).map(a => [a.name, a.under.slice(2)]));
  return d;
}

/* The draft as the file holds it: math typed in $ … $ written the bank's way, \( … \) (bankDelimiters); "Where is it
   from?" not read as a competition goes to the references, as written; with no topic of the tree chosen, the topic a new
   one hangs under is the closest one (the file needs one of the tree). */
function fileDraft(d) {
  const out = { ...d, statement: P.bankDelimiters(d.statement), solution: P.bankDelimiters(d.solution) }, from = String(d.from || '').trim();
  if (from && !P.parseOrigin(from, cat).known) out.references = [d.references, from].filter(s => String(s || '').trim()).join('\n');
  if (!d.area.length) out.area = [...new Set(Object.values(d.newAreaUnder || {}))];
  return out;
}

function setDraft(d) {
  d = { ...P.emptyDraft(), from: '', ...d };
  if (!d.from && d.origin) d.from = P.originLabel(cat, d.origin, d.originDate, d.originNumber);    // a draft from before the one line
  for (const [k, id] of Object.entries(TEXT_FIELDS)) $(id).value = d[k] || '';
  difficulty.set(d.difficulty);
  topics.set(d.area);
  topics.setNew((d.newArea || []).map(name => ({ name, under: (d.newAreaUnder || {})[name] || null })));
  methods.set(d.methods);
  methods.setNew((d.newMethods || []).map(name => ({ name, under: (d.newMethodsUnder || {})[name] ? `g:${d.newMethodsUnder[name]}` : null })));
  if (String(d.solution || '').trim()) openPart('solution');
  if (String(d.note || '').trim()) openPart('note');
  autosizeAll();
  onDraftChange({ save: false });
}

/* ------------------------------------------------------------------ checks */

// Where each field's message leads: the element focused, and the line or the More details it waits behind.
const FIELD_INPUT = { title: 'pp-title', statement: 'pp-statement', solution: 'pp-solution', area: 'pp-add-about', methods: 'pp-methods',
  difficulty: 'pp-difficulty', origin: 'pp-from', originDate: 'pp-from', originNumber: 'pp-from', bibtex: 'pp-bibtex' };
const FIELD_PART = { solution: 'solution', area: 'about', origin: 'from', originDate: 'from', originNumber: 'from' };
const IN_DETAILS = new Set(['methods', 'difficulty', 'bibtex']);
const REQUIRED = new Set(['Write the problem statement (required).', 'Pick at least one area (required).']);
const SAY = { 'Write the problem statement (required).': 'Write the statement.', 'Pick at least one area (required).': 'Say what it is about: choose a topic in the list.',
  'Pick at least one existing area too, the closest one: the new area is proposed with it.': 'Choose the closest topic in the list too: the new one is proposed with it.' };

const appendixCatalogue = Array.isArray(data.appendix) ? data.appendix : [];   // shared results: [{name, title, cites, labels}]

function currentErrors(draft) {
  return P.validateDraft(fileDraft(draft), cat, state.bib ? Object.keys(state.bib) : null, appendixCatalogue);
}

function reveal(field) {
  if (FIELD_PART[field]) openPart(FIELD_PART[field]);
  if (IN_DETAILS.has(field)) $('pp-details').open = true;
  $(FIELD_INPUT[field]).focus();
}

const helpTexts = new Map();
let shownErrorsKey = null;
function showErrors(errors) {
  const shown = state.submitted ? errors : errors.filter(e => !REQUIRED.has(e.message));
  const ids = new Map();                                // field -> ids of its messages in the list below
  shown.forEach((e, i) => ids.set(e.field, [...(ids.get(e.field) || []), `pp-error-${i}`]));
  const fieldsOf = new Map();                           // an element -> the fields it stands for ("Where is it from?": three)
  for (const [field, id] of Object.entries(FIELD_INPUT)) fieldsOf.set(id, [...(fieldsOf.get(id) || []), field]);
  for (const [id, fields] of fieldsOf) {
    const input = $(id), mine = fields.flatMap(f => ids.get(f) || []), bad = mine.length > 0;
    if (!helpTexts.has(id)) helpTexts.set(id, input.getAttribute('aria-describedby'));   // the field's own help, from the page
    const described = [helpTexts.get(id), ...mine].filter(Boolean).join(' ');
    input.classList.toggle('is-invalid', bad);
    if (bad && /^(INPUT|TEXTAREA)$/.test(input.tagName)) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');   // (a button or a list cannot be invalid)
    if (described) input.setAttribute('aria-describedby', described); else input.removeAttribute('aria-describedby');
  }
  if (!shown.length && $('pp-submit-status').dataset.kind === 'fix') setSubmitStatus('');
  const key = shown.map(e => e.field + '|' + e.message).join('\n');
  if (key === shownErrorsKey) return shown;            // unchanged: do not rebuild (role=alert would be read out again)
  shownErrorsKey = key;
  const box = $('pp-errors');
  box.replaceChildren();
  if (shown.length) {
    box.append(el('strong', { text: shown.length === 1 ? 'One thing to do before sending:' : `${shown.length} things to do before sending:` }),
      el('ul', { class: 'mb-0' }, ...shown.map((e, i) => el('li', { id: `pp-error-${i}` }, el('a', { href: '#' + FIELD_INPUT[e.field], class: 'alert-link fw-normal',
        onclick: ev => { ev.preventDefault(); reveal(e.field); }, text: SAY[e.message] || e.message })))));
  }
  box.hidden = !shown.length;
  return shown;
}

/* ------------------------------------------------------------------ draft changes: summaries, autosave, the sheet */

function onDraftChange({ save = true } = {}) {
  const d = readDraft();
  $('pp-clear').hidden = !hasContent(d);                 // only when there is something to clear
  renderSummaries(d);
  const own = parseBibEntries(d.bibtex).map(([k]) => k).filter(Boolean);
  $('pp-bib-keys').textContent = own.length ? `Entries: ${own.join(', ')}. Cite them with \\cite{${own[0]}}.` : '';
  const diff = S.getTag(cat, 'difficulty', d.difficulty);
  $('pp-difficulty-help').textContent = diff ? diff.description : '';
  showErrors(currentErrors(d));
  if (save) { saveSoon(d); if (autoTypeset) previewHeld = false; }     // someone is writing: the sheet may follow
  schedulePreview();
}

/* The draft kept on this device: one slot (localStorage), written 400 ms after the last edit and at once when the tab
   is hidden or closed.  When another tab writes it, this tab says so (its own text stays in the form). */
let saveTimer = null, pendingDraft = null, savedJson = null;
function setSaved(text, kind = '') {
  const s = $('pp-saved');
  if (s.textContent !== text) s.textContent = text;     // role=status: the same words are not read out again
  s.dataset.kind = kind;
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!pendingDraft) return;
  const json = JSON.stringify(pendingDraft);
  pendingDraft = null;
  try {
    localStorage.setItem(DRAFT_KEY, json); savedJson = json; $('pp-other-tab').hidden = true;
    setSaved('Saved on this device', 'saved');
  } catch (e) {     // private mode, or the storage is full
    setSaved('Not saved: this browser keeps nothing here. Your text is lost when you leave the page.', 'unsaved');
  }
}
function saveSoon(d) {
  pendingDraft = d;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
const hasContent = d => Object.keys(P.emptyDraft()).some(k => (Array.isArray(d[k]) ? d[k].length : String(d[k] || '').trim()));

function restoreDraft() {
  let d = null;
  try { savedJson = localStorage.getItem(DRAFT_KEY); d = JSON.parse(savedJson || 'null'); } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || !hasContent(d)) return false;
  try { setDraft(d); } catch (e) { console.warn('saved draft ignored', e); setDraft(P.emptyDraft()); return true; }
  setSaved(d.sent ? 'Sent already? It stays saved on this device.' : 'Your draft is back. It is saved on this device.', 'restored');
  return true;                    // the form is filled, and checked once (setDraft)
}

/* "Start again" asks first, in a box of the page's own (the browser's would look like no other part of the site):
   Cancel has the focus; Escape, or a click beside the box, is Cancel too. */
function askStartOver() { if (hasContent(readDraft())) $('pp-confirm').showModal(); }
function startOver() {
  clearTimeout(saveTimer);                              // or the pending autosave would write the old draft back
  pendingDraft = null;
  try { localStorage.removeItem(DRAFT_KEY); savedJson = null; } catch (e) { /* ignore */ }
  state.submitted = false;
  state.sendAnyway = null;
  setDraft({ ...P.emptyDraft(), from: '' });
  for (const part of ['solution', 'from', 'about', 'note']) openPart(part, false);
  $('pp-details').open = false;
  clearPreview();
  state.preview.a4 = null;
  setSubmitStatus('');
  setSaved('');
  for (const id of ['pp-other-tab', 'pp-clear', 'pp-mail-help']) $(id).hidden = true;
  $('pp-title').focus();
}

/* ------------------------------------------------------------------ the sheet: the problem typeset */

/* Until the page knows whether the engine is stored, or as long as nobody has written: a restored draft alone does not
   start a 16 MB download.  autoTypeset: false where the visitor saves data (Save-Data, a slow line) and has no engine yet:
   the sheet waits for "Show it typeset", then follows the text like everywhere else. */
let previewHeld = true, autoTypeset = null;

function setPreviewStatus(text, kind = 'muted', st = '') {
  const s = $('pp-preview-status');
  s.dataset.state = st;
  if (s.textContent === text && s.className === `pp-status small text-${kind}`) return;    // aria-live: not read out again
  s.textContent = text;
  s.className = `pp-status small text-${kind}`;
}
function showPreviewStatus(text, kind, st) {
  state.preview.shownStatus = [text, kind, st];
  setPreviewStatus(text, kind, st);
}

const SHEET_PT = 426.79;                      // the sheets' measure (preamble.tex: A4, 3 cm side margins)
const LEFT_PT = 85.04, TOP_PT = 56.69, BOTTOM_PT = 56.69;     // preamble.tex: the text block starts 3 cm from the left, 2 cm from the top and bottom
const EDGE_PT = 4;                            // kept round the text, so that no glyph is cut
const pxPerPt = () => (parseFloat(getComputedStyle(document.body).fontSize) || 18) / 10.95;   // the bank's \normalsize: 11pt class

/* The measure the sheet is typeset at: its own width at the page's text size (pt), as the statements on the Problems page,
   or the bank's own (null) when the sheet is that wide.  The PDF sent by email always has the bank's (makeA4). */
function sheetRoom() {
  const box = $('pp-sheet'), cs = getComputedStyle(box);
  return box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}
function sheetMeasure() {
  const room = sheetRoom();
  if (!(room > 0)) return null;
  const m = Math.floor(room / pxPerPt() - 2 * EDGE_PT - 3);          // 3 pt to spare: a line may end a hair past the measure
  return m >= SHEET_PT ? null : Math.max(150, m);
}

/* The document of the draft now in the form, at the sheet's measure, or null when there is nothing to typeset. */
function currentPreview() {
  const d = readDraft();
  if (!d.statement.trim()) return null;
  const width = sheetMeasure();
  return { d, width, ...P.previewMain(fileDraft(d), cat, state.bib || {}, appendixCatalogue, { width }) };
}
/* The document sent by email: the bank's measure. */
const a4Document = () => P.previewMain(fileDraft(readDraft()), cat, state.bib || {}, appendixCatalogue);

function schedulePreview() {
  clearTimeout(state.preview.timer);
  const wanted = $('pp-statement').value.trim();
  $('pp-typeset-line').hidden = !(autoTypeset === false && previewHeld && wanted && C.engineSupported());
  if (previewHeld) return;
  state.preview.timer = setTimeout(() => runPreview(), 900);
}

/* What changes above the field being typed in must not push it away: on one column (a phone, a narrow window) the sheet is
   above More details.  Measured around the change itself, so that a scroll made in the meantime is never undone; on two
   columns the sheet is beside the fields and moves none of them. */
function keepInPlace(change) {
  const inUse = document.activeElement;
  const below = inUse && inUse !== document.body && getComputedStyle($('pp-form')).gridTemplateColumns.trim().split(/\s+/).length === 1
    && ($('pp-sheet').compareDocumentPosition(inUse) & Node.DOCUMENT_POSITION_FOLLOWING) ? inUse : null;
  const top = below && below.getBoundingClientRect().top;
  change();
  if (below) window.scrollBy(0, below.getBoundingClientRect().top - top);
}

function clearFieldErrors() { for (const box of ['statement', 'solution', 'bibtex']) { const e = $(`pp-${box}-error`); e.hidden = true; e.replaceChildren(); } }

function clearPreview() {
  const pv = state.preview;
  pv.shownTex = null; pv.shownOk = null; pv.pdf = null; pv.drawn = null;
  drawing++;                                            // a drawing under way is not shown
  freeCanvases($('pp-pages'));
  $('pp-pages').replaceChildren();
  $('pp-pages').hidden = true;
  $('pp-sheet-empty').hidden = false;
  $('pp-preview-error').hidden = true;
  clearFieldErrors();
  showPreviewStatus('', 'muted', '');
}

/* A LaTeX error, under the box it is in (the statement, the solution, the bibliography). */
function showLatexError(log, doc) {
  const x = P.explainLog(log, doc.lines, doc.d);
  const box = x && x.box ? x.box : 'statement';
  for (const other of ['statement', 'solution', 'bibtex']) if (other !== box) { const e = $(`pp-${other}-error`); e.hidden = true; e.replaceChildren(); }
  const where = !x ? '' : box === 'bibtex' ? 'In the reference list made from it: ' : x.line ? `Line ${x.line}: ` : '';
  let what = !x ? 'it does not typeset.' : x.unclosed ? 'something opened here is never closed (a $, \\[, { or \\begin{…}).' : x.message;
  if (!where) what = what.charAt(0).toUpperCase() + what.slice(1);
  const code = x && (x.unclosed ? x.message : x.source);                 // not the page's own \end{problem}
  const target = $(`pp-${box}-error`), key = `${box}|${where}${what}|${code || ''}`;
  if (target.dataset.key !== key || target.hidden) {                 // the same error again: not rebuilt, not read out again
    clearFieldErrors();
    target.replaceChildren(el('strong', { text: 'LaTeX error. ' }), `${where}${what}`, code ? el('code', { class: 'd-block mt-1', text: code }) : null);
    target.dataset.key = key;
    target.hidden = false;
  }
  if (box === 'solution') openPart('solution');
  if (box === 'bibtex') $('pp-details').open = true;
  return box === 'statement' ? 'the statement' : box === 'solution' ? 'the solution' : 'the bibliography (More details)';
}

async function runPreview({ force = false } = {}) {
  const pv = state.preview;
  clearTimeout(pv.timer);
  if (!C.engineSupported()) { setPreviewStatus('This browser cannot typeset LaTeX. You can still send your problem: we typeset it.', 'warning'); return; }
  if (pv.running) { pv.again = true; return; }          // typeset when the running one ends
  const cur = currentPreview();
  if (!cur) { clearPreview(); return; }
  if (cur.tex === pv.shownTex && !force) { setPreviewStatus(...pv.shownStatus); return; }
  pv.running = true; pv.again = false;
  $('pp-preview-status').dataset.state = 'running';
  const busy = setTimeout(() => { if (pv.running) setPreviewStatus('Typesetting…', 'muted', 'running'); }, 600);   // a quick one says nothing
  loadPdfjs().catch(() => {});                          // on its way while pdfTeX works, not after
  let r = null, error = null;
  try { r = await C.compileTex(cur.tex, { timeoutMs: pv.timeoutMs || 30000 }); } catch (e) { error = e; }
  pv.running = false;
  clearTimeout(busy);
  const now = currentPreview();
  if (!now) { clearPreview(); return; }
  if (now.tex !== cur.tex) { runPreview(); return; }  // written meanwhile: the newer text instead
  pv.shownTex = cur.tex;
  const errBox = $('pp-preview-error');
  if (error) {
    pv.shownOk = null;
    keepInPlace(() => {
      errBox.replaceChildren(el('strong', { text: 'The sheet could not be typeset. ' }), (error.message || String(error)).split('\n')[0]);
      errBox.hidden = false;
      showPreviewStatus('Not up to date', 'danger', 'failed');
    });
  } else if (r.exit === 0 && r.pdf) {
    pv.shownOk = true;
    if (cur.width === null) pv.a4 = { tex: cur.tex, pdf: r.pdf, ok: true, log: '', lines: cur.lines };
    keepInPlace(() => { errBox.hidden = true; clearFieldErrors(); });
    await showPages(r.pdf, cur.width);
    showPreviewStatus(cur.figures ? 'Drawings are boxes here; the website draws them.' : '', 'muted', 'ok');
  } else {
    pv.shownOk = false;
    if (cur.width === null) pv.a4 = { tex: cur.tex, pdf: null, ok: false, log: r.log, lines: cur.lines };
    keepInPlace(() => {
      const where = showLatexError(r.log, cur);
      $('pp-pages').classList.add('is-stale');         // the last sheet that typeset stays, greyed
      showPreviewStatus(`Not up to date: a LaTeX error in ${where}.`, 'danger', 'error');
    });
  }
  if (pv.again) runPreview();
}

/* ---- drawing it: PDF.js, like the statements on the Problems page (bank-ui.js) */
let pdfjsLib = null, pdfWorker = null;
function loadPdfjs() {
  if (!pdfjsLib) {
    const v = data.pdfjs ? `?v=${encodeURIComponent(data.pdfjs)}` : '';
    pdfjsLib = import(new URL(`../pdfjs/pdf.min.mjs${v}`, import.meta.url).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL(`../pdfjs/pdf.worker.min.mjs${v}`, import.meta.url).href;
      // the page's own worker, given to each loading task (see bank-ui.js loadPdfjs: Safari, "the worker is being destroyed")
      try { pdfWorker = new lib.PDFWorker({ port: new Worker(lib.GlobalWorkerOptions.workerSrc, { type: 'module' }) }); } catch (e) { pdfWorker = null; /* workerSrc then */ }
      return lib;
    });
    pdfjsLib.catch(() => { pdfjsLib = null; });       // tried again at the next drawing
  }
  return pdfjsLib;
}
/* How magnified the sheet is shown: by a pinch on a trackpad (site.js) and by a touch screen's own pinch. */
const magnified = e => { const w = e.offsetWidth, vv = window.visualViewport; return (w ? Math.max(1, e.getBoundingClientRect().width / w) : 1) * Math.max(1, (vv && vv.scale) || 1); };
const COARSE = matchMedia('(pointer: coarse)').matches;
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const PIXELS = COARSE || IOS ? 16e6 : 48e6;          // as bank-ui.js: what Safari allows a canvas on a phone; more on a computer
function freeCanvases(root) { for (const c of root.querySelectorAll('canvas')) { c.width = 0; c.height = 0; } }

/* The pages of the PDF, each cut to its text (the bank's sheet without its margins and its page number), as wide as the
   sheet allows and never wider than the page's text size; sharp at the zoom shown.  A newer drawing ends an older one:
   resolves null then. */
let drawing = 0;
async function drawPages(pdf, measure) {
  const mine = ++drawing;
  const lib = await loadPdfjs();
  const task = lib.getDocument({ data: pdf.slice(), useWasm: false, stopAtErrors: false, disableFontFace: COARSE, ...(pdfWorker ? { worker: pdfWorker } : {}) });
  try {
    const doc = await task.promise;
    const pages = [];
    let right = LEFT_PT + measure;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const h = page.getViewport({ scale: 1 }).height;
      let top = Infinity, bottom = -Infinity;
      for (const it of (await page.getTextContent()).items) {
        if (!it.str || !it.str.trim()) continue;
        const base = h - it.transform[5], size = it.height || Math.abs(it.transform[3]) || 10;
        if (base > h - BOTTOM_PT + 4) continue;                 // the page number, under the text block
        top = Math.min(top, base - size); bottom = Math.max(bottom, base + .3 * size);
        right = Math.max(right, it.transform[4] + it.width);
      }
      if (top < bottom) pages.push({ page, top: top - EDGE_PT, bottom: bottom + EDGE_PT });
      else pages.push({ page, top: TOP_PT - EDGE_PT, bottom: h - BOTTOM_PT + EDGE_PT });       // no text (a drawing alone): its whole text block
      if (drawing !== mine) return null;
    }
    const box = $('pp-pages'), left = LEFT_PT - EDGE_PT, w = right + EDGE_PT - left;
    const s = Math.min(pxPerPt(), sheetRoom() / w), mag = magnified(box);
    let k = s * (window.devicePixelRatio || 1) * Math.max(COARSE ? 1.5 : 1, mag);
    k = Math.min(k, Math.sqrt(PIXELS / Math.max(1, pages.reduce((a, p) => a + w * (p.bottom - p.top), 0))));
    const canvases = [];
    for (const p of pages) {
      const c = el('canvas', { 'aria-hidden': 'true' });
      c.width = Math.ceil(w * k); c.height = Math.ceil((p.bottom - p.top) * k);
      c.style.setProperty('width', `${(w * s).toFixed(2)}px`);
      c.style.setProperty('height', `${((p.bottom - p.top) * s).toFixed(2)}px`);
      canvases.push(c);
      await p.page.render({ canvasContext: c.getContext('2d'), viewport: p.page.getViewport({ scale: k, offsetX: -left * k, offsetY: -p.top * k }),
        background: 'rgba(0, 0, 0, 0)' }).promise;
      if (drawing !== mine) { for (const x of canvases) { x.width = 0; x.height = 0; } return null; }
    }
    return { canvases, mag };
  } finally { task.destroy(); }
}

async function showPages(pdf, width) {
  const pv = state.preview, box = $('pp-pages');
  let shown;
  try { shown = await drawPages(pdf, width === null ? SHEET_PT : width); } catch (e) {
    console.warn('PDF.js could not draw the sheet; a link to the PDF instead', e);
    if (pv.url) URL.revokeObjectURL(pv.url);
    pv.url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    shown = { canvases: [el('p', { class: 'small' }, el('a', { href: pv.url, target: '_blank', rel: 'noopener', text: 'Open the PDF' }))], mag: 1 };
  }
  if (!shown) return;                                   // a newer drawing took its place
  const old = [...box.querySelectorAll('canvas')];
  keepInPlace(() => {
    box.replaceChildren(...shown.canvases);
    box.hidden = false;
    box.classList.remove('is-stale');
    $('pp-sheet-empty').hidden = true;
  });
  for (const c of old) { c.width = 0; c.height = 0; }
  pv.pdf = pdf; pv.width = width; pv.drawn = { mag: shown.mag, room: sheetRoom() };
}

/* The sheet changed width (a window resized, a phone turned): drawn again at its size, or typeset again when its measure
   changes.  A pinch ended (site.js 'pagezoom'): drawn again, sharp at that zoom. */
let resizeTimer = 0;
function onSheetResize() {
  const pv = state.preview;
  if (!pv.pdf || !pv.drawn || Math.abs(sheetRoom() - pv.drawn.room) < 2) return;
  const width = sheetMeasure();
  if (width !== pv.width && (width === null || pv.width === null || Math.abs(width - pv.width) > 6)) { runPreview(); return; }
  showPages(pv.pdf, pv.width);
}
window.addEventListener('pagezoom', () => {
  const pv = state.preview;
  if (pv.pdf && pv.drawn && Math.abs(magnified($('pp-pages')) / pv.drawn.mag - 1) > .05) showPages(pv.pdf, pv.width);
});

/* ---- the PDF sent, at the bank's measure: the sheet's own when it has that measure, otherwise typeset ahead when the
   pointer reaches Send, or at the click. */
let a4Pending = null;                                   // the one under way: asked again (the pointer on Send, then the click), waited for
async function makeA4() {
  const doc = a4Document(), pv = state.preview;
  if (pv.a4 && pv.a4.tex === doc.tex) return pv.a4;
  if (a4Pending && a4Pending.tex === doc.tex) return a4Pending.promise;
  const promise = C.compileTex(doc.tex, { timeoutMs: 30000 }).then(r => {
    const ok = r.exit === 0 && !!r.pdf, a4 = { tex: doc.tex, pdf: ok ? r.pdf : null, ok, log: r.log, lines: doc.lines };
    if (a4Document().tex === doc.tex) pv.a4 = a4;
    return a4;
  });
  a4Pending = { tex: doc.tex, promise };
  try { return await promise; } finally { if (a4Pending && a4Pending.promise === promise) a4Pending = null; }
}
/* ------------------------------------------------------------------ send */

function setSubmitStatus(text, kind = 'muted', tag = '') {
  const s = $('pp-submit-status');
  s.textContent = text;
  s.className = `small text-${kind}`;
  s.dataset.kind = tag;
}

function checkBeforeSending() {
  state.submitted = true;
  const d = readDraft();
  const shown = showErrors(currentErrors(d));
  if (shown.length) {
    $('pp-errors').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    $('pp-errors').tabIndex = -1;                 // the focus goes where the eye is sent: the list's links lead to each field
    $('pp-errors').focus({ preventScroll: true });
    setSubmitStatus('', 'muted', 'fix');
    return null;
  }
  return d;
}

/* After a send, a copy or a download: the saved draft is marked, so that a reload does not present it as unsent work. */
function markSent(d) {
  pendingDraft = { ...d, sent: true };
  saveNow();
}

function legacyCopy(text) {
  const ta = el('textarea', { class: 'visually-hidden', readonly: true }), had = document.activeElement;
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  if (had && had.focus) had.focus({ preventScroll: true });             // the focus goes back where it was
  return ok;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return legacyCopy(text); }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob), a = el('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* Send (Antoine's choice, 2026-11-23): the share menu, the one way a page can put files into an email.  The PDF, the
   .tex file and the note (when written) go in it; a click on Mail opens the email with them attached and one line,
   "Problem: <title>"; the club's address is copied first, to paste in To (a share cannot address it).  Where there is no
   share menu (Firefox), the files are saved and the mail app opens with that line, address included; the proposer drags
   them in. */
const mailto = msg => `mailto:${ADDRESS}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`;
const listed = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]);
/* Chrome shares no .tex file: its canShare says yes, then share() refuses it, the tap spent (measured in Chrome 153, on
   Android and computers).  There the same file goes as .tex.txt (the club drops the .txt); Safari takes it as it is. */
const CHROMIUM = !!navigator.userAgentData;              // Chrome, Edge, Opera, Samsung Internet (not iOS: WebKit there)
const asTxt = files => files.map(f => (/\.tex$/.test(f.name) ? new File([f], `${f.name}.txt`, { type: 'text/plain' }) : f));
function shareable(files) {
  if (!navigator.share || !navigator.canShare) return null;
  for (const list of CHROMIUM ? [asTxt(files)] : [files, asTxt(files)]) {
    try { if (navigator.canShare({ files: list })) return list; } catch (e) { /* a canShare that does not know files */ }
  }
  return null;
}
/* The PDF, typeset ahead when the pointer reaches Send (or a finger touches it), so that it is ready at the click. */
function prepareA4Now() {
  if (previewHeld || !C.engineSupported() || !$('pp-statement').value.trim()) return;
  makeA4().catch(() => {});
}
async function sendToClub() {
  const btn = $('pp-submit');
  if (btn.getAttribute('aria-disabled') === 'true') return;      // preparing the PDF already
  const d = checkBeforeSending();
  if (!d) return;
  const fd = fileDraft(d), tex = P.problemFile(fd), cur = currentPreview();
  let latexError = !!cur && cur.tex === state.preview.shownTex && state.preview.shownOk === false;   // what the sheet shows for exactly this text
  let pdf = null, prepared = false;
  if (!latexError && C.engineSupported()) {
    let a4 = state.preview.a4 && state.preview.a4.tex === a4Document().tex ? state.preview.a4 : null;
    if (!a4) {                                          // not typeset at the bank's measure yet: the PDF first
      btn.setAttribute('aria-disabled', 'true');         // (not disabled: the focus would leave it)
      setSubmitStatus('Preparing the PDF…');
      $('pp-typeset-line').hidden = true;
      let toldAt = 0;
      const off = C.onStatus(m => { const at = performance.now(); if (at - toldAt > 1500) { toldAt = at; setSubmitStatus(m.text.replace(/^Compiling/, 'Preparing the PDF'), 'muted'); } });
      try { a4 = await makeA4(); } catch (e) { a4 = null; }
      off();
      btn.removeAttribute('aria-disabled');
      prepared = true;
      if (a4 && autoTypeset === false) startTypesetting();       // the engine is here now: the sheet follows the text
      // a long wait (the engine downloaded on a phone) spends the click: neither the menu nor the mail app would open
      if (a4 && a4.ok && navigator.userActivation && !navigator.userActivation.isActive) { setSubmitStatus('The PDF is ready. Press Send to the club again.', 'success', 'again'); return; }
    }
    if (a4 && !a4.ok) { showLatexError(a4.log, { lines: a4.lines, d }); latexError = true; }
    else pdf = a4 && a4.pdf;
  }
  if (latexError && state.sendAnyway !== tex) {
    state.sendAnyway = tex;
    setSubmitStatus('Its LaTeX has an error (see under the box). Fix it, or press Send to the club again to send it as it is.', 'danger', 'latex');
    return;
  }
  const note = String(d.note || '').trim();
  const files = [pdf && new File([pdf], P.pdfName(fd), { type: 'application/pdf' }), new File([tex], P.fileName(fd), { type: 'text/plain' }),
    note && new File([note + '\n'], P.noteName(fd), { type: 'text/plain' })].filter(Boolean);
  const msg = P.emailMessage(fd), shared = shareable(files);
  if (shared) {
    const copied = await copyText(ADDRESS);
    setSubmitStatus(copied ? 'Choose Mail: the files are attached. The club\'s address is copied: paste it in To.' : `Choose Mail: the files are attached. Send it to ${ADDRESS}.`, 'muted', 'share');
    try {
      await navigator.share({ files: shared, title: msg.subject, text: msg.body });
      markSent(d);
      setSubmitStatus('Thank you. We read every proposal and answer you by email.', 'success', 'sent');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') { setSubmitStatus('Not sent. Press Send to the club when you are ready.', 'muted', 'cancelled'); return; }
      if (e && e.name === 'NotAllowedError' && prepared) { setSubmitStatus('The PDF is ready. Press Send to the club again.', 'success', 'again'); return; }
      // the menu refused (a file it will not take): the mail app instead, below
    }
  }
  // no share menu (Firefox): the files saved, the mail app opened with the line written
  for (const f of files) download(f, f.name);
  const a = el('a', { href: mailto(msg), hidden: true });
  document.body.append(a);                              // (Firefox follows no click on a link outside the page)
  a.click();
  a.remove();
  markSent(d);
  const names = files.map(f => f.name), these = names.length === 1 ? 'the file' : `the ${['', '', 'two', 'three'][names.length]} files`;
  setSubmitStatus(`Your mail app opens. Drag ${these} just saved (${listed(names)}) into it, then press Send.`, 'success', 'mail');
  $('pp-mail-help').hidden = false;
}

/* ------------------------------------------------------------------ LaTeX help */

async function showLatex() {
  const dlg = $('pp-latex');
  dlg.showModal();
  const pre = $('pp-preamble');
  if (pre.dataset.loaded) return;
  const text = await C.loadPreamble();
  pre.textContent = text || 'Could not load preamble.tex. It is in the repository: problem-bank/preamble.tex.';
  if (text) pre.dataset.loaded = '1';
}

/* ------------------------------------------------------------------ wiring */

let growTimer = 0;
function startTypesetting() {                          // "Show it typeset": from now on the sheet follows the text
  autoTypeset = true;
  previewHeld = false;
  $('pp-typeset-line').hidden = true;
  runPreview();
}

function wire() {
  topics = topicsTree();
  methods = methodsTree();
  difficulty = difficultyChoices();
  for (const ta of document.querySelectorAll('.pp-grow')) ta.addEventListener('input', () => autosize(ta));
  $('pp-details').addEventListener('toggle', () => { if ($('pp-details').open) autosizeAll(); });
  window.addEventListener('resize', () => { clearTimeout(growTimer); growTimer = setTimeout(autosizeAll, 150); });
  for (const id of Object.values(TEXT_FIELDS)) {
    $(id).addEventListener('input', () => onDraftChange());
    $(id).addEventListener('change', () => onDraftChange());
  }
  for (const part of ['solution', 'from', 'about', 'note']) $(`pp-add-${part}`).addEventListener('click', () => togglePart(part));
  $('pp-typeset').addEventListener('click', startTypesetting);
  $('pp-submit').addEventListener('click', () => { sendToClub().catch(e => setSubmitStatus(`Could not send: ${(e && e.message) || e}`, 'danger')); });
  for (const ev of ['pointerenter', 'focus', 'touchstart']) $('pp-submit').addEventListener(ev, prepareA4Now, { passive: true });
  wireFrom();
  $('pp-clear').addEventListener('click', askStartOver);
  $('pp-confirm-yes').addEventListener('click', () => { $('pp-confirm').close(); startOver(); });
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('storage', e => {             // another tab saved (or cleared) the draft
    if (e.storageArea === localStorage && (e.key === DRAFT_KEY || e.key === null) && e.newValue !== savedJson) $('pp-other-tab').hidden = false;
  });
  $('pp-show-latex').addEventListener('click', showLatex);
  for (const dlg of [$('pp-latex'), $('pp-confirm')]) {     // the page's boxes: closed by their × or Cancel, Escape, or a click beside them
    const outside = (e) => { const r = dlg.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    let pressedOutside = false;                         // a text selection that ends past the <pre> must not close it
    dlg.addEventListener('pointerdown', e => { pressedOutside = e.target === dlg && outside(e); });
    dlg.addEventListener('click', e => {
      if (e.target.closest('[data-close]') || (pressedOutside && e.target === dlg && outside(e))) dlg.close();
      pressedOutside = false;
    });
  }
  $('pp-form').addEventListener('submit', e => e.preventDefault());    // (Enter in a field; no inline handler: CSP)
  let toldAt = 0;                                       // the engine's progress, at most every 1.5 s (a screen reader hears each one)
  C.onStatus(msg => {
    const at = performance.now();
    if (!state.preview.running || (/\d/.test(msg.text) && at - toldAt < 1500)) return;
    toldAt = at;
    setPreviewStatus(msg.text.replace(/^Compiling/, 'Typesetting'), 'muted', 'running');   // (the engine's words are the Problems page's)
  });
  // The engine (about 16 MB) is fetched on intent only: writing a statement where that is cheap, or "Show it typeset".
  let prefetched = false;
  const prefetch = () => { if (prefetched || autoTypeset === false) return; prefetched = true; C.prefetchEngine(); };
  $('pp-statement').addEventListener('input', prefetch);
  for (const ev of ['pointerenter', 'focus']) $('pp-typeset').addEventListener(ev, () => { if (!prefetched) { prefetched = true; C.prefetchEngine(); } });
  if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(onSheetResize, 200); }).observe($('pp-sheet'));
  if (!C.engineSupported()) setPreviewStatus('This browser cannot typeset LaTeX. You can still send your problem: we typeset it.', 'warning');
}

async function loadBib() {
  try {
    const r = await fetch('static/bank/references.bib', { cache: 'no-cache' });
    state.bib = r.ok ? parseBibText(await r.text()) : null;
  } catch (e) { state.bib = null; }
  onDraftChange({ save: false });
}

wire();
if (!restoreDraft()) onDraftChange({ save: false });
loadBib();
// With the engine stored, typesetting is free: the sheet shows at once. Without it, the sheet waits for the first edit,
// on a phone too: sending needs the engine anyway (the PDF).  Only where the visitor saves data (Save-Data, a 2G or 3G
// connection) does it wait for "Show it typeset".
const savingData = () => {
  try { const c = navigator.connection; return !!(c && (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || '') || (c.downlink > 0 && c.downlink < 1.5))); }
  catch (e) { return false; }
};                                                      // (downlink: a slow line that Chrome still calls 4g)
C.engineStored().then(stored => {
  if (stored) { autoTypeset = true; previewHeld = false; schedulePreview(); }
  else if (savingData()) { autoTypeset = false; schedulePreview(); }
  else autoTypeset = true;
});

/* exposed for the browser tests */
window.propose = { state, readDraft, setDraft, fileDraft, P,
  upToDate: () => { const c = currentPreview(); return !!c && c.tex === state.preview.shownTex && !state.preview.running; } };

document.documentElement.setAttribute('data-ready', '');          // site.js: from now on an error is not a failed page load
