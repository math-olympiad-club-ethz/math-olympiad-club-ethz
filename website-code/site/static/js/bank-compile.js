/* bank-compile.js — compiles a selection of problems to PDF in the browser (pdfTeX in WebAssembly,
   see compile-worker.js).  ES module used by bank-ui.js and by the Propose page (bank-propose-ui.js, bank-propose.js);
   makeMain() mirrors bank/stitch.py::make_main
   byte for byte (the Python side is what CI tests; tests compare the two).

   Paths are relative to the page (site/problems.html): static/js/compile-worker.js, static/busytex/,
   static/bank/bodies.json, static/bank/figures/.  No PDF is stored anywhere except the browser's caches. */

const CLUB_NAME = 'Math Olympiad Club at ETHZ';

// absolute URL for the engine: the worker resolves relative paths against its own location (static/js/), not the page's
const PATHS = { worker: 'static/js/compile-worker.js', bodies: 'static/bank/bodies.json', figures: 'static/bank/', preamble: 'static/bank/preamble.tex',
  get engine() { return new URL('static/busytex/', typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').href; } };
const COMPILE_TIMEOUT_MS = 240000;                     // a PDF: 60 s + 2 s per problem or shared result, at most this
const PREVIEW_TIMEOUT_MS = 60000;
const selectionTimeout = n => Math.min(COMPILE_TIMEOUT_MS, 60000 + 2000 * n);

const state = { worker: null, ready: null, initWaiting: false, bodies: null, appendix: null, bodiesPromise: null, figures: new Map(), seq: 0,
  queue: [], running: null, listeners: new Set(), expect: {} };

export function onStatus(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
function emit(msg) { for (const fn of state.listeners) { try { fn(msg); } catch (e) { /* listener error */ } } }
const fmtBytes = n => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' kB' : n + ' B';

/* Messages shown to visitors (the page puts them after "Could not …:"). */
const UNSUPPORTED = 'This browser cannot run the LaTeX engine.';
function abortError() { const e = new Error('Cancelled.'); e.name = 'AbortError'; return e; }
function staleError() { const e = new Error('The problem bank was updated. Reload the page.'); e.name = 'StaleError'; return e; }

/* Feature test: everything the worker needs.  Old browsers get a clear message and can still download .tex.
   (SubtleCrypto is not needed: without it, on a plain-http page, there is only no PDF cache.) */
export function engineSupported() {
  return typeof Worker === 'function' && typeof WebAssembly === 'object' && typeof DecompressionStream === 'function';
}
const hasSubtle = () => { try { return typeof crypto !== 'undefined' && !!crypto.subtle; } catch (e) { return false; } };
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

/* The page's build, from its bank-data (build.py): {build, engine}.  When given, problem texts or a LaTeX engine
   from another deploy are refused with "reload the page" instead of being mixed with this page's list. */
export function expectBuild({ build = null, engine = null } = {}) { state.expect = { build, engine }; }

function engineText(d) {
  if (d.stage === 'download' && d.total) return `Loading the LaTeX engine… ${fmtBytes(d.loaded)} / ${fmtBytes(d.total)}`;
  if (d.stage === 'instantiate') return 'Starting the LaTeX engine…';
  return 'Loading the LaTeX engine…';
}

/* One worker, one job in it at a time: jobs wait here (a job still waiting can be dropped), and a job's timeout
   starts when pdfTeX starts on it, so a slow or stuck job never eats another one's time or kills it. */
function ensureWorker() {
  if (state.worker) return state.worker;
  // same ?v=<asset version> as this module (set by the page), so a deploy never pairs a new page with an old worker
  let v = '';
  try { v = new URL(import.meta.url).search; } catch (e) { /* not a URL (tests) */ }
  const w = new Worker(PATHS.worker + v);
  w.onmessage = ({ data }) => {
    if (w !== state.worker) return;
    const job = state.running && data.id === state.running.id ? state.running : null;
    if (data.type === 'progress') {
      emit({ stage: data.stage, text: engineText(data) });
    } else if (data.type === 'ready') {
      state._resolveReady && state._resolveReady();
    } else if (data.type === 'started') {
      if (!job) return;
      job.timer = setTimeout(() => timedOut(job), job.timeoutMs);
      emit({ stage: 'compile', job: job.kind, text: 'Compiling…' });
    } else if (data.type === 'marker') {
      if (!job || !job.order) return;
      const k = job.order.indexOf(data.pid);
      if (k < 0) return;
      job.pid = data.pid;
      const problems = job.order.filter(p => !isResultMarker(p)).length;
      if (isResultMarker(data.pid)) emit({ stage: 'compile', job: job.kind, text: 'Compiling… appendix' });
      else if (problems > 1) emit({ stage: 'compile', job: job.kind, text: `Compiling… ${k + 1} / ${problems}` });
    } else if (data.type === 'result') {
      if (job) finish(job, null, data);
    } else if (data.type === 'error') {
      if (job) { stopWorker({ keepInit: true }); finish(job, new Error(data.message)); }     // the engine may be broken: next job, fresh worker
      else if (data.id == null) state._rejectReady && state._rejectReady(new Error(data.message));
    }
  };
  w.onerror = e => {                         // the worker died or could not be parsed: fail the job and what waits on it
    console.error('LaTeX engine worker:', e && e.message);
    const err = new Error('The LaTeX engine stopped unexpectedly. Try again.');
    const job = state.running;
    stopWorker({ reason: err });
    if (job) finish(job, err);
  };
  state.worker = w;
  return w;
}

/* Stop the worker (the only way to end a running pdfTeX); the next job starts a fresh one (the engine files come
   from the browser cache, so that takes seconds, not a new download).  An engine load in progress is either sent
   again to the fresh worker (keepInit) or failed with `reason`.  Jobs are left to the caller. */
function stopWorker({ keepInit = false, reason = null } = {}) {
  const w = state.worker;
  try { if (w) w.terminate(); } catch (e) { /* ignore */ }
  state.worker = null;
  if (state.initWaiting && keepInit) { ensureWorker().postMessage({ type: 'init', base: PATHS.engine }); return; }
  state.ready = null; state.initWaiting = false;
  state._rejectReady && state._rejectReady(reason || new Error('The LaTeX engine was stopped. Try again.'));
}

/* Load (or reuse from the Cache API) the engine; idempotent.  Rejects with a readable message. */
function initEngine() {
  if (state.ready) return state.ready;
  if (!engineSupported()) return Promise.reject(new Error(UNSUPPORTED));
  const w = ensureWorker();
  state.ready = new Promise((resolve, reject) => { state._resolveReady = resolve; state._rejectReady = reject; });
  state.initWaiting = true;
  w.postMessage({ type: 'init', base: PATHS.engine });
  const ready = state.ready = state.ready.then(
    () => { if (state.ready === ready) state.initWaiting = false; armIdleStop(); },
    err => { if (state.ready === ready) { state.ready = null; state.initWaiting = false; } throw err; });
  return ready;
}

/* Whether the engine (some 16 MB: build.py engine_download_mb) may be fetched ahead, before anyone has asked for a PDF: not on data saver, on a slow
   connection or on a touch screen, where a tick must not start a download that size. Create PDF, and the Propose page's sheet, start it. */
export function mayPrefetchEngine() {
  try {
    const c = navigator.connection;
    if (c && (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ''))) return false;
    if (window.matchMedia('(pointer: coarse)').matches) return false;
  } catch (e) { /* ignore */ }
  return true;
}

/* Whether the whole engine is already stored in this browser, from an earlier visit. */
export async function engineStored() {
  try {
    if (!self.caches) return false;
    const cache = await caches.open('bank-engine');
    const hits = await Promise.all(['busytex.js.gz', 'busytex.wasm.gz', 'club.fmt.gz', 'club-texlive.data.gz', 'club-texlive.json'].map(n => cache.match(PATHS.engine + n)));
    return hits.every(Boolean);
  } catch (e) { return false; }
}

/* Prefetch on first interaction (see mayPrefetchEngine), or, where it may not, an engine already stored here: that costs no
   download.  Never throws. */
export function prefetchEngine() {
  if (!engineSupported()) return;
  const start = () => initEngine().catch(() => { /* reported when the user actually clicks Create */ });
  if (mayPrefetchEngine()) start();
  else engineStored().then(stored => { if (stored) start(); });
}

/* The problem texts too (bodies.json, about 160 KB compressed), so the first Create waits for neither.  Same rules:
   skipped on data-saver connections, never throws (a failed download is retried and reported by the Create). */
export function prefetchBodies() {
  try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) { /* ignore */ }
  loadBodies().catch(() => { /* reported when the user actually clicks Create */ });
}

/* Queue a compile.  Options: timeoutMs (counted from the moment pdfTeX starts on it), signal (AbortSignal: a waiting
   job is dropped, a running one stops the worker, except a preview, see cancelJob; rejects with name 'AbortError'), order + names (the problem IDs in
   the document and their titles, to name the problem a stuck compile is in), label (what else to name), kind. */
function compileRaw(mainTex, files, { timeoutMs = COMPILE_TIMEOUT_MS, signal = null, order = null, names = null, label = '', kind = 'tex' } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const job = { id: ++state.seq, mainTex, files: files || {}, timeoutMs, signal, order, names, label, kind, resolve, reject, timer: null, pid: null, done: false };
    if (signal) { job.onAbort = () => cancelJob(job); signal.addEventListener('abort', job.onAbort); }
    state.queue.push(job);
    pump();
  });
}

/* The engine keeps 200 to 300 MB while it is alive, and a phone closes tabs that keep too much: after 2 minutes without a job
   (30 s when the page is hidden) it is stopped. The next job starts it again from the browser's cache, in about a second. */
let idleStop = 0;
function armIdleStop() {
  clearTimeout(idleStop);
  if (!state.worker || state.running || state.queue.length) return;
  idleStop = setTimeout(() => {
    if (!state.running && !state.queue.length && !state.initWaiting) stopWorker();
  }, document.hidden ? 30000 : 120000);
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', armIdleStop);

function pump() {
  clearTimeout(idleStop);
  if (state.running || !state.queue.length) { armIdleStop(); return; }
  const job = state.running = state.queue.shift();
  try { ensureWorker().postMessage({ type: 'compile', id: job.id, mainTex: job.mainTex, files: job.files, base: PATHS.engine }); }
  catch (e) { console.error(e); finish(job, new Error(UNSUPPORTED)); }
}

function finish(job, err, value) {
  if (job.done) return;
  job.done = true;
  clearTimeout(job.timer);
  if (job.signal) job.signal.removeEventListener('abort', job.onAbort);
  if (state.running === job) state.running = null;
  else { const i = state.queue.indexOf(job); if (i >= 0) state.queue.splice(i, 1); }
  if (err) job.reject(err); else job.resolve(value);
  pump();
}

/* A running PDF can only be stopped with its worker.  A running preview is one short statement: its caller is told at
   once, but the engine finishes it (its result is dropped, its timeout still guards it), so that closing a preview or
   opening the next one does not cost an engine start. */
function cancelJob(job) {
  if (job.done) return;
  if (state.running === job) {
    if (job.kind === 'preview') {
      if (job.signal) job.signal.removeEventListener('abort', job.onAbort);
      job.reject(abortError());
      return;
    }
    stopWorker({ keepInit: true });
  }
  finish(job, abortError());
}

/* pdfTeX runs synchronously inside the worker: a document that never ends (e.g. \def\x{\x}\x) keeps it busy
   forever, so after the timeout the worker itself is stopped.  Only this job fails; waiting jobs go on. */
function timedOut(job) {
  if (state.running !== job) return;
  const title = (job.pid && job.names && job.names[job.pid]) || job.label;
  const where = job.pid && isResultMarker(job.pid) ? 'the shared result' : 'the problem';
  const err = new Error('The LaTeX compile took too long and was stopped.' + (title ? ` It got stuck in ${where} “${title}”.` : ''));
  err.name = 'TimeoutError';
  stopWorker({ keepInit: true });
  finish(job, err);
}

/* Resolve like `p`, or reject with an AbortError as soon as `signal` aborts. */
function untilAborted(p, signal) {
  if (!signal) return p;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    p.then(v => { signal.removeEventListener('abort', onAbort); resolve(v); }, e => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

/* A result from an engine other than the one this page was built with (a deploy in between): reload. */
function checkEngine(r) {
  if (state.expect.engine && r.version && r.version !== state.expect.engine) throw staleError();
}

function compileError(r, mainTex) {
  const err = new Error('The LaTeX compile failed.\n' + (r.errors || []).join('\n'));
  err.mainTex = mainTex;
  return err;
}

/* ------------------------------------------------------------------ bodies + main.tex */

export async function loadBodies() {
  if (state.bodies) return state.bodies;
  if (!state.bodiesPromise) {
    state.bodiesPromise = fetch(PATHS.bodies, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(`Could not download the problem texts (HTTP ${r.status}).`); return r.json(); },
        () => { throw new Error('Could not download the problem texts (network error).'); })
      .then(j => {
        if (!j || typeof j.problems !== 'object') throw new Error('Could not read the problem texts.');
        if (state.expect.build && j.build && j.build !== state.expect.build) throw staleError();
        state.appendix = j.appendix && typeof j.appendix === 'object' ? j.appendix : {};
        return (state.bodies = j.problems);
      })
      .catch(e => { state.bodiesPromise = null; throw e.name === 'SyntaxError' ? new Error('Could not read the problem texts.') : e; });
  }
  return state.bodiesPromise;
}

/* Escape TeX specials in plain text; already-escaped ones are left alone.  Same result as bank/stitch.py::tex_escape
   (which uses a lookbehind; no lookbehind here: Safari before 16.4 cannot parse one, and the whole page would fail). */
export const texEscape = s => String(s).replace(/\\?[&%$#_]/g, m => (m.length === 2 ? m : '\\' + m));
const pad4 = i => String(i).padStart(4, '0');

/* The shared results (problem-bank/appendix/) loaded with the bodies: {name: {name, title, text, cites, figures}}. */
export const loadedAppendix = () => state.appendix || {};

/* The results a solutions PDF prints, in order: those cited by its printed solutions (PDF order), then the results
   those cite, as they are met.  Mirrors bank/appendix.py::appendix_order. */
export function appendixOrder(sel, appendix) {
  const has = n => Object.prototype.hasOwnProperty.call(appendix, n);
  const order = [];
  for (const b of sel) {
    if (b.solution === null || b.solution === undefined) continue;
    for (const n of b.cites || []) if (has(n) && !order.includes(n)) order.push(n);
  }
  for (let k = 0; k < order.length; k++) for (const n of appendix[order[k]].cites || []) if (has(n) && !order.includes(n)) order.push(n);
  return order;
}

/* Stitched document.  MUST stay identical to bank/stitch.py::make_main.  `appendix`: the shared results; a solutions
   PDF whose solutions cite some ends with them. */
export function makeMain(bodies, ids, variant, { filters = '', showMethods = false, appendix = null } = {}) {
  const sel = ids.map(i => bodies[pad4(i)]).filter(Boolean);
  const out = ['\\begin{document}', '\\thispagestyle{empty}', '\\vspace*{\\stretch{1}}', '\\begin{center}',
    `{\\Huge\\bfseries ${CLUB_NAME}}\\\\[2ex]`,
    `{\\LARGE ${variant === 'problems' ? 'Problems' : 'Problems and solutions'}}\\\\[4ex]`,
    `{\\large ${sel.length} problem${sel.length === 1 ? '' : 's'}}\\\\[1ex]`];
  if (filters) out.push(`{\\normalsize Selection: ${texEscape(filters)}}\\\\[1ex]`);
  out.push('\\end{center}', '\\vspace*{\\stretch{2}}', '\\newpage');
  sel.forEach((b, k) => {
    out.push(`\\bankproblem{${k + 1}}{${texEscape(b.title)}}{${texEscape(b.origin)}}{${b.id}}`);
    if (showMethods && b.methods && b.methods.length) out.push(`\\bankmethods{${texEscape(b.methods.join(', '))}}`);
    out.push('\\begin{problem}', b.statement, '\\end{problem}');
    if (variant === 'solutions') {
      if (b.solution !== null && b.solution !== undefined) {
        out.push('\\begin{solution}', b.solution, '\\end{solution}');
        if (b.status === 'partial') out.push('\\banknosolution');
      } else out.push('\\banknosolution');
    }
  });
  const order = variant === 'solutions' && appendix ? appendixOrder(sel, appendix) : [];
  if (order.length) {
    out.push('\\bankappendix');
    for (const name of order) {
      const a = appendix[name];
      out.push(`\\bankappendixitem{${name}}`, `\\begin{appendixitem}{${texEscape(a.title)}}`, a.text, '\\end{appendixitem}');
    }
  }
  out.push('\\end{document}');
  return out.join('\n') + '\n';
}

/* The downloadable .tex: a standalone document.  The shared preamble is inlined when it could be fetched
   (build.py publishes it next to the data), otherwise it is \input and must sit next to the file.
   Externalised figures (figNNNN-k.pdf, figa-<name>-k.pdf) are referenced, not embedded. */
let preamblePromise = null;
export function loadPreamble() {
  if (!preamblePromise) {
    preamblePromise = fetch(PATHS.preamble).then(r => (r.ok ? r.text() : null)).catch(() => null)
      .then(t => { if (t === null) preamblePromise = null; return t; });          // a failed fetch is retried next time
  }
  return preamblePromise;
}
export function standaloneTex(mainTex, preambleText = null) {
  const pre = preambleText ? '% ---- preamble.tex (inlined) ----\n' + preambleText + '\n% ---- end of preamble ----\n' : '\\input{preamble}\n';
  return '\\documentclass[11pt]{article}\n\\def\\BankStitched{}\n' + pre + mainTex;
}

/* The drawings (externalised TikZ, figNNNN-k.pdf, figa-<name>-k.pdf) of these problems and shared results (entries of
   bodies.json).  Fetched by content (?v=<sha256>): an edited drawing keeps its file name, and the browser's HTTP cache
   must not hand back the old one.  `verified` is false when a file's bytes do not match bodies.json (a deploy still
   arriving): such a PDF is shown but not cached. */
async function figureFiles(entries) {
  const files = {}; let verified = true;
  await Promise.all(entries.filter(Boolean).flatMap(b => Object.entries(b.figures || {}).map(async ([name, info]) => {
    const key = name + ':' + (info.sha256 || '');
    if (!state.figures.has(key)) state.figures.set(key, fetchFigure(info).catch(e => { state.figures.delete(key); throw e; }));   // a failed fetch is retried next time
    const f = await state.figures.get(key);
    if (!f.verified) { verified = false; if (f.checked) state.figures.delete(key); }
    files[name] = f.bytes;
  })));
  return { files, verified };
}

async function fetchFigure(info) {
  const url = PATHS.figures + info.url + (info.sha256 ? '?v=' + info.sha256.slice(0, 16) : '');
  const get = async mode => {
    let r;
    try { r = await fetch(url, mode ? { cache: mode } : {}); } catch (e) { throw new Error('A drawing could not be downloaded (network error).'); }
    if (!r.ok) throw new Error(`A drawing could not be downloaded (HTTP ${r.status}).`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const matches = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes)) === info.sha256;
  let bytes = await get();
  if (!info.sha256 || !hasSubtle()) return { bytes, verified: false, checked: false };
  if (await matches(bytes)) return { bytes, verified: true, checked: true };
  bytes = await get('reload');
  return { bytes, verified: await matches(bytes), checked: true };
}

/* The compiled document (not the .tex offered for download) prints "BANK:<id>" on the terminal before each
   problem and "BANK:a-<name>" before each shared result, so a compile that never ends can say where it is stuck.
   On the \bankproblem / \bankappendixitem line itself: the log's line numbers stay those of mainTex, and \typeout
   puts nothing in the PDF. */
const withMarkers = tex => tex.replace(/^\\bankproblem\{\d+\}.*\{(\d+)\}$/gm, (m, id) => `\\typeout{BANK:${id}}${m}`)
  .replace(/^\\bankappendixitem\{([a-z0-9-]+)\}$/gm, (m, name) => `\\typeout{BANK:a-${name}}${m}`);
const isResultMarker = pid => String(pid).startsWith('a-');

/* ------------------------------------------------------------------ finished-PDF cache (by selection hash) */

async function pdfCache() { try { return await caches.open('bank-pdfs'); } catch (e) { return null; } }
/* The engine bundle version (a hash of its five files) is part of the PDF cache key: a new bundle must not
   serve PDFs made by the old one.  The page knows it (expectBuild), which saves a round trip before each first Create;
   else it is read from manifest.json (tiny).  A PDF is stored only if the engine that compiled it has this version. */
let versionPromise = null;
function engineVersion() {
  if (state.expect.engine) return Promise.resolve(state.expect.engine);
  if (!versionPromise) {
    versionPromise = fetch(PATHS.engine + 'manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).then(m => m.version || 'v')
      .catch(() => { versionPromise = null; return 'v'; });
  }
  return versionPromise;
}
/* The key also covers the figures' contents: an edited drawing keeps its file name (figNNNN-k.pdf, figa-<name>-k.pdf), so mainTex alone
   would not change.  null without SubtleCrypto (plain-http pages): no PDF cache there. */
async function selectionKey(version, variant, mainTex, figures = '') {
  if (!hasSubtle()) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(version + '|' + variant + '|' + mainTex + '|' + figures));
  return `/bank/pdf/${hex(digest).slice(0, 32)}.pdf`;
}
const figureStamp = entries => entries.flatMap(b => Object.entries(b.figures || {}).map(([n, f]) => `${n}:${f.sha256}`)).sort().join(',');
/* The PDF stored under `key` (null: none, or no cache here), and storing one: the browser keeps the last PDFS_KEPT
   (problem sets and previewed statements alike), the oldest going first. */
const PDFS_KEPT = 60;
async function storedPdf(key) {
  if (!key) return null;
  const cache = await pdfCache();
  const hit = cache ? await cache.match(key).catch(() => null) : null;
  const pdf = hit ? new Uint8Array(await hit.arrayBuffer()) : null;
  return pdf && pdf.length ? pdf : null;
}
async function storePdf(key, pdf) {
  if (!key) return;
  const cache = await pdfCache();            // opened now: starting the engine may have deleted 'bank-pdfs' meanwhile
  if (!cache) return;
  try {
    await cache.put(key, new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } }));
    const keys = await cache.keys();         // in the order they were stored
    for (const k of keys.slice(0, Math.max(0, keys.length - PDFS_KEPT))) await cache.delete(k);
  } catch (e) { /* quota */ }
}

/* Compile one variant for a list of IDs, in the order given (the page decides it: bank-search.js::autoOrder or
   the hand-made order).  Resolves {ids, variant, pdf, mainTex, pages, passes, fromCache, ms}.
   signal (AbortSignal): cancels; the promise then rejects with name 'AbortError'. */
export function compileSelection(ids, variant, { showMethods = false, signal = null } = {}) {
  return untilAborted(selection(ids, variant, { showMethods, signal }), signal);
}

async function selection(ids, variant, { showMethods, signal }) {
  const t0 = performance.now();
  if (!engineSupported()) throw new Error(UNSUPPORTED);
  const bodies = await loadBodies();
  const sorted = [...new Set(ids.map(Number))];      // the order given, each ID once
  const sel = sorted.map(i => bodies[pad4(i)]);
  if (sel.some(b => !b)) throw staleError();        // listed on this page but not in bodies.json: the page is older than the data
  const appendix = loadedAppendix();
  if (variant === 'solutions' && sel.some(b => b.solution != null && (b.cites || []).some(n => !Object.prototype.hasOwnProperty.call(appendix, n)))) {
    throw staleError();                            // a cited shared result is missing: texts of two different deploys
  }
  const mainTex = makeMain(bodies, sorted, variant, { showMethods, appendix });
  const resultNames = variant === 'solutions' ? appendixOrder(sel, appendix) : [];
  const results = resultNames.map(n => appendix[n]);
  const version = await engineVersion();
  const key = await selectionKey(version, variant, mainTex, figureStamp([...sel, ...results]));
  const stored = await storedPdf(key);
  if (stored) return { ids: sorted, pdf: stored, mainTex, fromCache: true, passes: [], pages: null, ms: Math.round(performance.now() - t0) };
  if (signal && signal.aborted) throw abortError();
  const [{ files, verified }] = await Promise.all([figureFiles([...sel, ...results]), initEngine()]);     // the drawings arrive while the engine starts
  // the timeout counts the shared results too (each is a page or two of text)
  const r = await compileRaw(withMarkers(mainTex), files, { timeoutMs: selectionTimeout(sorted.length + results.length), signal, kind: 'selection',
    order: [...sel.map(b => b.id), ...resultNames.map(n => `a-${n}`)],
    names: Object.fromEntries([...sel.map(b => [b.id, b.title]), ...resultNames.map(n => [`a-${n}`, appendix[n].title])]) });
  checkEngine(r);
  if (r.exit !== 0 || !r.pdf || !r.pdf.length) throw compileError(r, mainTex);
  if (verified && r.version === version) await storePdf(key, r.pdf);
  return { ids: sorted, pdf: r.pdf, mainTex, fromCache: false, passes: r.passes, pages: r.pages, ms: Math.round(performance.now() - t0) };
}

/* One problem on its own, for the "Preview" button in the results list: the statement only — a preview never shows a
   solution, and its row already shows the title and the origin.  Not part of the stitched document, so makeMain (and its
   Python twin) stay untouched.
   bank-ui.js draws it into the page, so the page is the text with 2 pt round it, not an A4 sheet.  `width` (pt, two
   decimals) is the measure when the screen is narrower than the sheets (a phone; \sloppy then, against lines that stick
   out); otherwise the lines break as in a problem set.  The page is wider than the measure, for a formula that sticks
   out all the same: bank-ui.js draws only as far as the text goes.  It is as tall as any statement (PREVIEW_TALL: one
   page, never cut), and ends where its text ends, footnotes included: with \raggedbottom they come right below the
   text, as long as the page ends on a bare \penalty (\end{document}'s \newpage adds a \vfil that pushes them down).
   The build typesets every statement so in advance (bank/stitch.py::make_previews, from the same head and page, its
   twins preview_head and preview_page): see pickPreview. */
export const PREVIEW_MARGIN_PT = 2;
const PREVIEW_TALL = '\\textheight=7000pt\\vsize=\\textheight\\csname @colht\\endcsname=\\textheight\\csname @colroom\\endcsname=\\textheight';
export function previewHead(width = null) {
  const m = `${PREVIEW_MARGIN_PT}pt`;
  const out = ['\\begin{document}', '\\pagestyle{empty}\\raggedbottom'];
  if (width > 0) out.push(`\\ifdim${width.toFixed(2)}pt<\\textwidth\\textwidth=${width.toFixed(2)}pt\\sloppy\\fi`);
  out.push('\\hsize=\\textwidth\\linewidth=\\textwidth\\columnwidth=\\textwidth',
    `\\hoffset=\\dimexpr${m}-1in-\\oddsidemargin\\relax`,
    `\\voffset=\\dimexpr${m}-1in-\\topmargin-\\headheight-\\headsep\\relax`,
    '\\global\\pdfpagewidth=560pt', PREVIEW_TALL);
  return out;
}
export function previewPage(statement) {
  const m = `${PREVIEW_MARGIN_PT}pt`;
  return [`\\global\\pdfpageheight=\\dimexpr\\textheight+2\\dimexpr${m}\\relax\\relax`, '\\begin{problem}', statement, '\\end{problem}',
    `\\par\\ifdim\\pagegoal<\\maxdimen\\global\\pdfpageheight=\\dimexpr\\pagetotal+\\pagedepth+\\vsize-\\pagegoal+2\\dimexpr${m}\\relax\\relax\\fi`,
    '\\penalty-10000'];
}
export function makePreview(bodies, id, { width = null } = {}) {
  const b = bodies[pad4(id)];
  if (!b) throw staleError();                      // listed on the page but not in bodies.json
  return [...previewHead(width), ...previewPage(b.statement), '\\end{document}'].join('\n') + '\n';
}

/* The statement of problem `id` as the build typeset it (the page's data "previews", bank/stitch.py::build_previews:
   one PDF per measure, 10 % apart, page k the statement of ids[k-1]), at the measure nearest to `measure` (in proportion):
   {url, page, pt, fill}, fill being how much bigger (or smaller) to draw it to fill that measure.  null when there is
   none: the page then typesets it itself (compilePreview). */
export function pickPreview(previews, id, measure) {
  const k = previews && previews.ids ? previews.ids.indexOf(Number(id)) : -1;
  if (k < 0 || !previews.measures.length || !(measure > 0)) return null;
  let best = null;
  for (const m of previews.measures) if (!best || Math.abs(Math.log(m.pt / measure)) < Math.abs(Math.log(best.pt / measure))) best = m;
  return { url: best.url, page: k + 1, pt: best.pt, fill: measure / best.pt };
}

/* Compile that one-problem document.  Resolves {pdf}.  signal: as for compileSelection; width: as for makePreview.
   A statement already typeset at this measure (in this visit or an earlier one) comes from the PDF cache: reopening a
   preview starts no engine and waits for nothing. */
export function compilePreview(id, { signal = null, width = null } = {}) {
  return untilAborted(preview(Number(id), signal, width), signal);
}

async function preview(id, signal, width) {
  if (!engineSupported()) throw new Error(UNSUPPORTED);
  // not stored yet (a first statement: some 16 MB), the engine is fetched with the problem texts, not after them; stored,
  // it waits (the statement may come from the PDF cache, with no engine to start)
  engineStored().then(stored => { if (!stored && !(signal && signal.aborted)) initEngine().catch(() => {}); });
  const bodies = await loadBodies();
  const mainTex = makePreview(bodies, id, { width }), body = bodies[pad4(id)];
  const version = await engineVersion();
  const key = await selectionKey(version, 'preview', mainTex, figureStamp([body]));
  const stored = await storedPdf(key);
  if (stored) return { pdf: stored };
  if (signal && signal.aborted) throw abortError();
  const [{ files, verified }] = await Promise.all([figureFiles([body]), initEngine()]);
  const r = await compileRaw(mainTex, files, { timeoutMs: PREVIEW_TIMEOUT_MS, signal, kind: 'preview', label: body.title });
  checkEngine(r);
  if (r.exit !== 0 || !r.pdf || !r.pdf.length) throw compileError(r, mainTex);
  if (verified && r.version === version) await storePdf(key, r.pdf);
  return { pdf: r.pdf };
}

/* Compile any document against the club format (the propose page's live preview).  No PDF cache.
   Resolves the worker's result {exit, pdf|null, log, errors, passes, pages}; rejects only if the engine fails. */
export async function compileTex(mainTex, { timeoutMs = 60000 } = {}) {
  if (!engineSupported()) throw new Error(UNSUPPORTED);
  await initEngine();
  return compileRaw(mainTex, {}, { timeoutMs, kind: 'tex' });
}

/* "Reset the LaTeX engine": stop it (jobs in progress end with an AbortError), forget every stored engine file,
   drawing and PDF, then download and start the engine again.  Resolves like initEngine(). */
export async function resetEngine() {
  const jobs = [state.running, ...state.queue].filter(Boolean);
  state.queue = [];
  stopWorker({ reason: abortError() });
  for (const job of jobs) finish(job, abortError());
  try {
    if (self.caches) for (const k of await caches.keys()) if (k.startsWith('bank-')) await caches.delete(k);
  } catch (e) { /* Cache API refused: nothing stored */ }
  state.figures.clear();
  versionPromise = null;
  return initEngine();
}

/* exposed for the browser tests */
export const _state = state;
