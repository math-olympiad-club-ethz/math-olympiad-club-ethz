/* bank-propose-ui.js — the "Propose a problem" page (propose.html): the form, tag pickers from tags.yml, the live PDF
   preview (same in-browser pdfTeX as the Problems page), and the submission: the page writes the problem file
   new-<title>.tex, copies it to the clipboard and opens GitHub's "new file" page with that name; the contributor
   pastes it and GitHub opens a pull request.  No server, nothing stored except a draft in this browser.
   Logic lives in bank-propose.js (pure, unit-tested); this file is only the DOM. */
// Loaded as bank-propose-ui.js?v=<build>: the other modules are imported with the same ?v= (see bank-propose.js).
const V = new URL(import.meta.url).search;
const [S, C, P, { parseBibEntries, parseBibText }] = await Promise.all(
  ['bank-search', 'bank-compile', 'bank-propose', 'bank-tex'].map(m => import(`./${m}.js${V}`)));

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
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
// Without a built-in PDF viewer (Chrome for Android), a PDF in an iframe is downloaded instead of shown: links then.
const INLINE_PDF = navigator.pdfViewerEnabled !== false;
const state = {
  bib: null,              // references.bib, parsed ({key: fields}); null until loaded (then \cite keys are checked)
  submitted: false,       // after the first Send/Download, missing required fields are shown too
  // shownTex: the document whose result (PDF or error) is on screen; shownOk: true = it compiled, false = LaTeX error,
  // null = no verdict (engine failure, timeout); running: one compile at a time, the newest draft is compiled when it
  // ends (never a queue of old ones, so a stuck compile cannot take the next ones down with it)
  preview: { shownTex: null, shownOk: null, shownStatus: ['', 'muted'], url: null, timer: null, running: false },
};

/* ------------------------------------------------------------------ tag pickers (area, methods) */

function tagPicker(root, type, onChange) {
  const selected = [];
  const input = el('input', { id: `pp-${type}-input`, type: 'text', class: 'form-control form-control-sm pp-picker-input', role: 'combobox',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': `pp-${type}-list`, autocomplete: 'off', spellcheck: 'false',
    placeholder: type === 'area' ? 'Search areas or click to browse' : 'Search methods or click to browse' });
  const chips = el('div', { class: 'pp-chips', role: 'group', 'aria-label': type === 'area' ? 'Chosen areas' : 'Chosen methods' });
  const list = el('div', { id: `pp-${type}-list`, class: 'bank-listbox pp-listbox', role: 'listbox', 'aria-multiselectable': 'true', hidden: true });
  root.append(chips, input, list);
  let items = [], active = -1, open = false;
  const expanded = new Set();     // area nodes opened in the browse list: all closed at first, like on the Problems page
  const openGroups = new Set();   // method groups opened in the browse list: all closed at first

  const label = slug => (S.getTag(cat, type, slug) || { name: slug }).name;
  function renderChips() {
    chips.replaceChildren(...selected.map(slug => el('span', { class: `bank-chip bank-chip-${type}`, title: type === 'area' ? S.areaPath(cat, slug) : '' },
      el('span', { text: label(slug) }),
      el('button', { type: 'button', class: 'bank-chip-x', 'aria-label': `Remove ${label(slug)}`, onclick: () => remove(slug) }, '×'))));
  }
  function remove(slug) {                               // the chip goes away: focus the next one, or the search box
    const i = selected.indexOf(slug);
    toggle(slug);
    const next = chips.querySelectorAll('.bank-chip-x')[i];
    (next || input).focus();
  }
  function options() {
    const q = input.value;
    if (S.normalize(q)) {
      return S.suggest(cat, q, { ...S.emptyFilters(), [type]: [] }, 30, [type]).map(({ tag }) => ({ tag, depth: 0,
        sub: type === 'area' ? (tag.parent ? S.areaPath(cat, tag.slug) : tag.description) : tag.group }));
    }
    const out = [];
    if (type === 'area') {
      const push = (slug, depth) => {
        const t = cat.byType.area.get(slug);
        const kids = t.children || [];
        const isOpen = expanded.has(slug);
        out.push({ tag: t, depth, sub: '', toggle: kids.length ? (isOpen ? 'open' : 'closed') : null, browse: true });
        if (isOpen) for (const c of kids) push(c, depth + 1);
      };
      for (const [slug, t] of cat.byType.area) if (!t.parent) push(slug, 0);
    } else {
      let group = null;
      for (const t of cat.byType.methods.values()) {
        if (t.group !== group) { group = t.group; out.push({ groupHead: group, collapsed: !openGroups.has(group) }); }
        if (openGroups.has(group)) out.push({ tag: t, depth: 1, sub: '' });
      }
    }
    return out;
  }
  function renderList() {
    if (!open) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); return; }
    items = options();
    list.replaceChildren();
    items.forEach((it, i) => {
      if (it.groupHead) {                      // a method group: an option the keyboard reaches; Enter or → opens it, ← closes it
        const head = el('div', { id: `pp-${type}-opt-${i}`, class: 'bank-list-subheader bank-list-section' + (i === active ? ' bank-option-active' : ''), role: 'option', 'aria-selected': 'false' },
          el('span', { class: 'bank-list-caret', 'aria-hidden': 'true', text: it.collapsed ? '▸' : '▾' }), el('span', { text: it.groupHead }),
          el('span', { class: 'visually-hidden', text: it.collapsed ? ' (collapsed)' : ' (expanded)' }));
        head.addEventListener('mousedown', e => e.preventDefault());
        head.addEventListener('click', e => { e.stopPropagation(); choose(i); });
        list.append(head);
        return;
      }
      const on = selected.includes(it.tag.slug);
      const caret = it.toggle
        ? el('span', { class: 'bank-toggle', 'aria-hidden': 'true', title: it.toggle === 'open' ? 'Close' : 'Open', text: it.toggle === 'open' ? '▾' : '▸',
            onclick: (e) => { e.stopPropagation(); toggleNode(it.tag.slug); } })
        : it.browse ? el('span', { class: 'bank-toggle bank-toggle-empty', 'aria-hidden': 'true' }) : null;
      const row = el('div', { id: `pp-${type}-opt-${i}`, class: `bank-option bank-option-${type}` + (on ? ' bank-option-selected' : '') + (i === active ? ' bank-option-active' : ''),
        role: 'option', 'aria-selected': on ? 'true' : 'false', style: `--depth:${it.depth}` },
        caret, el('span', { class: 'bank-option-label', text: it.tag.name }),
        it.toggle ? el('span', { class: 'visually-hidden', text: it.toggle === 'open' ? ' (expanded)' : ' (collapsed)' }) : null,
        it.sub ? el('span', { class: 'bank-option-sub', text: it.sub }) : null);
      row.addEventListener('mousedown', e => e.preventDefault());
      row.addEventListener('click', e => { e.stopPropagation(); choose(i); });
      list.append(row);
    });
    if (!items.some(it => it.tag || it.groupHead)) list.append(el('div', { class: 'bank-list-empty', role: 'presentation', text: 'No tag matches. Try another word.' }));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0 && items[active] && (items[active].tag || items[active].groupHead)) input.setAttribute('aria-activedescendant', `pp-${type}-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }
  function move(delta) {
    const opts = items.map((it, k) => (it.tag || it.groupHead ? k : -1)).filter(k => k >= 0);
    if (!opts.length) return;
    const pos = opts.indexOf(active);
    active = opts[pos < 0 ? (delta > 0 ? 0 : opts.length - 1) : Math.min(opts.length - 1, Math.max(0, pos + delta))];
    renderList();
    const row = $(`pp-${type}-opt-${active}`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
  function toggle(slug) {
    const i = selected.indexOf(slug);
    if (i >= 0) selected.splice(i, 1); else selected.push(slug);
    renderChips(); if (open) renderList(); onChange();
  }
  function toggleNode(slug) { if (expanded.has(slug)) expanded.delete(slug); else expanded.add(slug); renderList(); }
  function toggleGroup(g) { if (openGroups.has(g)) openGroups.delete(g); else openGroups.add(g); renderList(); }
  function choose(i) {
    const it = items[i];
    if (it && it.groupHead) { toggleGroup(it.groupHead); input.focus(); return; }
    if (!it || !it.tag) return;
    const searching = !!S.normalize(input.value);
    toggle(it.tag.slug);
    if (searching) { input.value = ''; active = -1; open = false; renderList(); }
    input.focus();
  }
  input.addEventListener('focus', () => { open = true; renderList(); });
  input.addEventListener('click', () => { open = true; renderList(); });
  input.addEventListener('input', () => { open = true; active = -1; renderList(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open = true; move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const i = active >= 0 ? active : (S.normalize(input.value) ? items.findIndex(it => it.tag) : -1);
      if (i >= 0) choose(i);
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && open && items[active]) {
      const it = items[active], wantOpen = e.key === 'ArrowRight';          // otherwise the arrows move the text cursor
      if (it.toggle && (it.toggle === 'open') !== wantOpen) { e.preventDefault(); toggleNode(it.tag.slug); }
      else if (it.groupHead && it.collapsed === wantOpen) { e.preventDefault(); toggleGroup(it.groupHead); }
    } else if (e.key === 'Escape') { if (open) { e.preventDefault(); open = false; active = -1; renderList(); } }
    else if (e.key === 'Backspace' && !input.value && selected.length) toggle(selected[selected.length - 1]);
  });
  document.addEventListener('click', e => { if (!root.contains(e.target)) { open = false; active = -1; renderList(); } });
  root.addEventListener('focusout', e => { if (open && !root.contains(e.relatedTarget)) { open = false; active = -1; renderList(); } });
  return {
    get: () => [...selected],
    set(slugs) { selected.splice(0, selected.length, ...(slugs || []).filter(s => cat.byType[type].has(s))); renderChips(); renderList(); },
    input,
  };
}

/* ------------------------------------------------------------------ the form <-> a draft */

let pickers = null;
const TEXT_FIELDS = { title: 'pp-title', statement: 'pp-statement', solution: 'pp-solution', difficulty: 'pp-difficulty', origin: 'pp-origin',
  originDate: 'pp-origin-date', originNumber: 'pp-origin-number', references: 'pp-references', bibtex: 'pp-bibtex' };

function readDraft() {
  const d = P.emptyDraft();
  for (const [k, id] of Object.entries(TEXT_FIELDS)) d[k] = $(id).value;
  d.area = pickers.area.get();
  d.methods = pickers.methods.get();
  return d;
}

function setDraft(d) {
  d = { ...P.emptyDraft(), ...d };
  for (const [k, id] of Object.entries(TEXT_FIELDS)) $(id).value = d[k] || '';
  pickers.area.set(d.area);
  pickers.methods.set(d.methods);
  onDraftChange({ save: false });
}

function fillSelects() {
  const diff = $('pp-difficulty');
  diff.append(el('option', { value: '', text: 'not rated' }));
  for (const t of cat.byType.difficulty.values()) diff.append(el('option', { value: t.slug, text: t.name }));
  const origin = $('pp-origin');
  origin.append(el('option', { value: '', text: 'unknown' }));
  const KIND = { university: 'University competitions', 'high-school': 'Olympiads (high school)', book: 'Books', journal: 'Journals & papers',
    exam: 'Exams', course: 'Courses', folklore: 'Folklore', original: 'Original', interview: 'Interviews' };
  const groups = new Map();
  for (const t of cat.byType.origin.values()) {
    if (!groups.has(t.kind)) groups.set(t.kind, el('optgroup', { label: KIND[t.kind] || t.kind }));
    groups.get(t.kind).append(el('option', { value: t.slug, text: t.name, title: t.description || '' }));
  }
  for (const g of groups.values()) origin.append(g);
}

/* ------------------------------------------------------------------ checks */

const FIELD_INPUT = { title: 'pp-title', statement: 'pp-statement', solution: 'pp-solution', area: 'pp-area-input', methods: 'pp-methods-input',
  difficulty: 'pp-difficulty', origin: 'pp-origin', originDate: 'pp-origin-date', originNumber: 'pp-origin-number', bibtex: 'pp-bibtex' };
const REQUIRED = new Set(['Write the problem statement (required).', 'Pick at least one area (required).']);

function currentErrors(draft) {
  return P.validateDraft(draft, cat, state.bib ? Object.keys(state.bib) : null);
}

let shownErrorsKey = null;
function showErrors(errors) {
  const shown = state.submitted ? errors : errors.filter(e => !REQUIRED.has(e.message));
  const ids = new Map();                                // field -> ids of its messages in the list below
  shown.forEach((e, i) => ids.set(e.field, [...(ids.get(e.field) || []), `pp-error-${i}`]));
  for (const [field, id] of Object.entries(FIELD_INPUT)) {
    const input = $(id), bad = ids.has(field);
    input.classList.toggle('is-invalid', bad);
    if (bad) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', ids.get(field).join(' ')); }
    else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
  }
  if (!shown.length && $('pp-submit-status').dataset.kind === 'fix') setSubmitStatus('');
  const key = shown.map(e => e.field + '|' + e.message).join('\n');
  if (key === shownErrorsKey) return shown;            // unchanged: do not rebuild (role=alert would be read out again)
  shownErrorsKey = key;
  const box = $('pp-errors');
  box.replaceChildren();
  if (shown.length) {
    box.append(el('strong', { text: shown.length === 1 ? 'One thing to fix before sending:' : `${shown.length} things to fix before sending:` }),
      el('ul', { class: 'mb-0' }, ...shown.map((e, i) => el('li', { id: `pp-error-${i}` }, el('a', { href: '#' + FIELD_INPUT[e.field], class: 'alert-link fw-normal',
        onclick: ev => { ev.preventDefault(); $(FIELD_INPUT[e.field]).focus(); } , text: e.message })))));
  }
  box.hidden = !shown.length;
  return shown;
}

/* ------------------------------------------------------------------ draft changes: file name, file, autosave, preview */

function onDraftChange({ save = true } = {}) {
  const d = readDraft();
  $('pp-clear').hidden = !hasContent(d);                 // only when there is something to clear
  $('pp-filename').textContent = P.fileName(d);
  const own = parseBibEntries(d.bibtex).map(([k]) => k).filter(Boolean);
  $('pp-bib-keys').textContent = own.length ? `Entries: ${own.join(', ')}. Cite them with \\cite{${own[0]}}.` : '';
  if (!$('pp-file').hidden) $('pp-file').value = P.problemFile(d);
  const diff = S.getTag(cat, 'difficulty', d.difficulty);
  $('pp-difficulty-help').textContent = diff ? diff.description : '';
  showErrors(currentErrors(d));
  if (save) saveSoon(d);
  schedulePreview();
}

/* The draft kept in this browser: one slot (localStorage), written 400 ms after the last edit and at once when the tab
   is hidden or closed.  When another tab writes it, this tab says so (its own text stays in the form). */
let saveTimer = null, pendingDraft = null, savedJson = null;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!pendingDraft) return;
  const json = JSON.stringify(pendingDraft);
  pendingDraft = null;
  try { localStorage.setItem(DRAFT_KEY, json); savedJson = json; $('pp-other-tab').hidden = true; } catch (e) { /* private mode / quota */ }
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
  if (!d || typeof d !== 'object' || !hasContent(d)) return;
  setDraft(d);
  $('pp-draft-note').textContent = d.sent ? 'You already sent or downloaded this problem.' : 'Your draft was restored from this browser.';
  $('pp-draft-note').hidden = false;
}

function startOver() {
  if (hasContent(readDraft()) && !confirm('Clear the form and delete the draft saved in this browser?')) return;
  clearTimeout(saveTimer);                              // or the pending autosave would write the old draft back
  pendingDraft = null;
  try { localStorage.removeItem(DRAFT_KEY); savedJson = null; } catch (e) { /* ignore */ }
  state.submitted = false;
  setDraft(P.emptyDraft());
  clearPreview();
  setSubmitStatus('');
  for (const id of ['pp-draft-note', 'pp-other-tab', 'pp-open-fallback', 'pp-clear']) $(id).hidden = true;
  $('pp-title').focus();
}

/* ------------------------------------------------------------------ live preview */

function setPreviewStatus(text, kind = 'muted') {
  const s = $('pp-preview-status');
  if (s.textContent === text && s.className === `small text-${kind}`) return;    // aria-live: not read out again
  s.textContent = text;
  s.className = `small text-${kind}`;
}

function schedulePreview() {
  clearTimeout(state.preview.timer);
  if (!$('pp-auto').checked) { markIfStale(); return; }
  state.preview.timer = setTimeout(() => runPreview(), 900);
}

/* With "Update while typing" off: say when what is on screen is not the text in the form. */
function markIfStale() {
  const pv = state.preview;
  if ($('pp-auto').checked || pv.running || !C.engineSupported()) return;
  const cur = currentPreview();
  if (!cur) return;
  if (cur.tex !== pv.shownTex) setPreviewStatus('Out of date: click Update now', 'warning');
  else setPreviewStatus(...pv.shownStatus);
}

/* The preview document of the draft now in the form, or null when there is nothing to compile. */
function currentPreview() {
  const d = readDraft();
  return d.statement.trim() ? { d, ...P.previewMain(d, cat, state.bib || {}) } : null;
}

function clearPreview() {
  const pv = state.preview;
  if (pv.url) { URL.revokeObjectURL(pv.url); pv.url = null; }
  pv.shownTex = null; pv.shownOk = null;
  $('pp-pdf').hidden = true; $('pp-pdf').removeAttribute('src');
  $('pp-pdf-links').hidden = true;
  $('pp-preview-error').hidden = true;
  $('pp-preview-empty').hidden = false;
  showPreviewStatus('', 'muted');
}

function showPreviewStatus(text, kind) {
  state.preview.shownStatus = [text, kind];
  setPreviewStatus(text, kind);
}

/* The PDF in the frame, or (no built-in viewer) behind Open / Download links. */
function showPdf(url, d) {
  if (INLINE_PDF) {
    $('pp-pdf').src = url;
    $('pp-pdf').hidden = false;
  } else {
    $('pp-pdf-open').href = url;
    $('pp-pdf-download').href = url;
    $('pp-pdf-download').download = P.fileName(d).replace(/^new-/, '').replace(/\.tex$/, '.pdf');
    $('pp-pdf-links').hidden = false;
  }
  $('pp-preview-empty').hidden = true;
}

async function runPreview({ force = false } = {}) {
  const pv = state.preview;
  clearTimeout(pv.timer);
  if (!C.engineSupported()) { setPreviewStatus('This browser cannot run the LaTeX engine; you can still send the problem.', 'warning'); return; }
  const cur = currentPreview();
  if (pv.running) { pv.again = true; return; }          // compiled when the running one ends
  if (!cur) { clearPreview(); return; }
  if (cur.tex === pv.shownTex && !force) { setPreviewStatus(...pv.shownStatus); return; }
  pv.running = true; pv.again = false;
  setPreviewStatus('Compiling…');
  let r = null, error = null;
  try { r = await C.compileTex(cur.tex, { timeoutMs: pv.timeoutMs || 30000 }); } catch (e) { error = e; }
  pv.running = false;
  const now = currentPreview();
  if (!now) { clearPreview(); return; }
  if (now.tex !== cur.tex && $('pp-auto').checked) { runPreview(); return; }   // stale: compile the newer draft instead
  // (with "Update while typing" off, show what was asked for, marked out of date; "Update now" compiles the newer text)
  pv.shownTex = cur.tex;
  const errBox = $('pp-preview-error');
  if (error) {
    pv.shownOk = null;
    errBox.replaceChildren(el('strong', { text: 'The preview failed. ' }), ((error && error.message) || String(error)).split('\n')[0]);
    errBox.hidden = false;
    showPreviewStatus('Not updated', 'danger');
  } else if (r.exit === 0 && r.pdf) {
    pv.shownOk = true;
    if (pv.url) URL.revokeObjectURL(pv.url);
    pv.url = URL.createObjectURL(new Blob([r.pdf], { type: 'application/pdf' }));
    showPdf(pv.url, cur.d);
    errBox.hidden = true;
    const figs = (cur.d.statement + cur.d.solution).match(/\\begin\{(tikzpicture|tikzcd)\}/g);
    showPreviewStatus(`Updated (${r.passes.reduce((a, b) => a + b, 0)} ms)` + (figs ? ' · drawings are shown as boxes here' : ''), 'success');
  } else {
    pv.shownOk = false;
    const x = P.explainLog(r.log, cur.lines, cur.d);
    const where = !x || !x.box ? '' : x.box === 'bibtex' ? 'Bibliography (in the reference list made from it): '
      : `${x.box === 'statement' ? 'Statement' : 'Solution'}${x.line ? `, line ${x.line}` : ''}: `;
    const what = !x ? 'the compile failed' : x.unclosed ? 'something opened here is never closed (a $, \\[, { or \\begin{…}).' : x.message;
    const code = x && (x.unclosed ? x.message : x.source);                 // not the page's own \end{problem}
    errBox.replaceChildren(...[el('strong', { text: 'LaTeX error. ' }), `${where}${what}`,
      code ? el('code', { class: 'd-block mt-1', text: code }) : null,
      el('span', { class: 'd-block mt-1 text-muted', text: 'The last PDF that compiled stays below. Fix the error and the preview updates.' })].filter(Boolean));
    errBox.hidden = false;
    showPreviewStatus('Not updated: LaTeX error', 'danger');
  }
  if (pv.again) runPreview();
  else markIfStale();
}

/* ------------------------------------------------------------------ send: copy + open GitHub, download, show */

function checkBeforeSending() {
  state.submitted = true;
  const d = readDraft();
  const shown = showErrors(currentErrors(d));
  if (shown.length) {
    const first = $(FIELD_INPUT[shown[0].field]);
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('pp-errors').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    if (first) first.focus({ preventScroll: true });
    setSubmitStatus('Fix the points above first.', 'danger', 'fix');
    return null;
  }
  const warning = previewWarning();
  if (warning && !confirm(warning)) { setSubmitStatus(''); return null; }
  return d;
}

/* What the preview says about the text about to be sent ('' = nothing against it): a LaTeX error in exactly this
   text, or this text not previewed yet.  Silent when the engine cannot run or failed (no verdict there). */
function previewWarning() {
  const pv = state.preview, cur = currentPreview();
  if (!cur || !C.engineSupported()) return '';
  if (cur.tex === pv.shownTex) return pv.shownOk === false ? 'The preview shows a LaTeX error. Send anyway?' : '';
  if (pv.shownTex !== null && pv.shownOk === null) return '';
  return 'This version has not been previewed yet. Send anyway?';
}

/* After a copy or a download: the saved draft is marked, so that a reload does not present it as unsent work. */
function markSent(d) {
  pendingDraft = { ...d, sent: true };
  saveNow();
}

function setSubmitStatus(text, kind = 'muted', tag = '') {
  const s = $('pp-submit-status');
  s.textContent = text;
  s.className = `small text-${kind}`;
  s.dataset.kind = tag;
}

function legacyCopy(text) {
  const ta = el('textarea', { class: 'visually-hidden', readonly: true });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

async function onSubmit() {
  const d = checkBeforeSending();
  if (!d) return;
  const text = P.problemFile(d);
  const name = P.fileName(d);
  const url = P.githubNewFileUrl(data.github, name);
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = legacyCopy(text); }
  $('pp-github-link').href = url;
  $('pp-open-fallback').hidden = false;
  const w = window.open(url, '_blank');
  if (w) { try { w.opener = null; } catch (e) { /* cross-origin */ } }
  markSent(d);
  if (copied) setSubmitStatus(`Copied ${name}. Paste it into GitHub's editor, then click "Propose new file".`, 'success');
  else {
    showFile(true);
    $('pp-file').focus(); $('pp-file').select();
    setSubmitStatus('Could not copy automatically: the file is selected below, copy it with Ctrl+C / ⌘+C.', 'warning');
  }
}

function onDownload(e) {
  const d = checkBeforeSending();
  if (!d) { e.preventDefault(); return; }
  const a = $('pp-download');
  if (a._url) URL.revokeObjectURL(a._url);
  a._url = URL.createObjectURL(new Blob([P.problemFile(d)], { type: 'text/plain' }));
  a.href = a._url;
  a.download = P.fileName(d);
  setSubmitStatus('');
  markSent(d);
}

function showFile(open) {
  const ta = $('pp-file');
  ta.hidden = !open;
  $('pp-show-file').setAttribute('aria-expanded', String(open));
  $('pp-show-file').textContent = open ? 'Hide the file' : 'Show the file';
  if (open) ta.value = P.problemFile(readDraft());
}

/* ------------------------------------------------------------------ "Show available LaTeX" */

async function showLatex() {
  const dlg = $('pp-latex');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  const pre = $('pp-preamble');
  if (pre.dataset.loaded) return;
  const text = await C.loadPreamble();
  pre.textContent = text || 'Could not load preamble.tex. It is in the repository: problem-bank/preamble.tex.';
  if (text) pre.dataset.loaded = '1';
}

/* ------------------------------------------------------------------ wiring */

function wire() {
  pickers = { area: tagPicker($('pp-area'), 'area', () => onDraftChange()), methods: tagPicker($('pp-methods'), 'methods', () => onDraftChange()) };
  fillSelects();
  for (const id of Object.values(TEXT_FIELDS)) {
    $(id).addEventListener('input', () => onDraftChange());
    $(id).addEventListener('change', () => onDraftChange());
  }
  $('pp-auto').addEventListener('change', () => { if ($('pp-auto').checked) runPreview(); else markIfStale(); });
  $('pp-refresh').addEventListener('click', () => runPreview({ force: true }));
  $('pp-submit').addEventListener('click', onSubmit);
  $('pp-download').addEventListener('click', onDownload);
  $('pp-show-file').addEventListener('click', () => showFile($('pp-file').hidden));
  $('pp-clear').addEventListener('click', startOver);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('storage', e => {             // another tab saved (or cleared) the draft
    if (e.storageArea === localStorage && (e.key === DRAFT_KEY || e.key === null) && e.newValue !== savedJson) $('pp-other-tab').hidden = false;
  });
  $('pp-show-latex').addEventListener('click', showLatex);
  const dlg = $('pp-latex');
  const outside = (e) => { const r = dlg.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  let pressedOutside = false;                         // a text selection that ends past the <pre> must not close it
  dlg.addEventListener('pointerdown', e => { pressedOutside = e.target === dlg && outside(e); });
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-close]') || (pressedOutside && e.target === dlg && outside(e))) dlg.close ? dlg.close() : dlg.removeAttribute('open');
    pressedOutside = false;
  });
  $('pp-form').addEventListener('submit', e => e.preventDefault());    // (Enter in a field; no inline handler: CSP)
  C.onStatus(msg => { if (msg.kind === 'progress' && state.preview.running) setPreviewStatus(msg.text); });
  // The engine (about 25 MB) is fetched on intent only: writing a statement, or reaching for Update now.
  let prefetched = false;
  const prefetch = () => { if (prefetched) return; prefetched = true; C.prefetchEngine(); };
  $('pp-statement').addEventListener('input', prefetch);
  for (const ev of ['pointerenter', 'focus']) $('pp-refresh').addEventListener(ev, prefetch);
  if (!C.engineSupported()) setPreviewStatus('This browser cannot run the LaTeX engine; you can still send the problem.', 'warning');
}

async function loadBib() {
  try {
    const r = await fetch('static/bank/references.bib', { cache: 'no-cache' });
    state.bib = r.ok ? parseBibText(await r.text()) : null;
  } catch (e) { state.bib = null; }
  onDraftChange({ save: false });
}

wire();
restoreDraft();
onDraftChange({ save: false });
loadBib();

/* exposed for the browser tests */
window.propose = { state, readDraft, setDraft, runPreview, P };
