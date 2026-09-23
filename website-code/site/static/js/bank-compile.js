/* bank-compile.js — compiles a selection of problems to PDF in the browser (pdfTeX in WebAssembly,
   see compile-worker.js).  ES module used by bank-ui.js; makeMain() mirrors bank/stitch.py::make_main
   byte for byte (the Python side is what CI tests; tests compare the two).

   Paths are relative to the page (site/problems.html): static/js/compile-worker.js, static/busytex/,
   static/bank/bodies.json, static/bank/figures/.  No PDF is stored anywhere except the browser's caches. */

export const CLUB_NAME = 'Math Olympiad Club ETHZ';

// absolute URL for the engine: the worker resolves relative paths against its own location (static/js/), not the page's
const PATHS = { worker: 'static/js/compile-worker.js', bodies: 'static/bank/bodies.json', figures: 'static/bank/', preamble: 'static/bank/preamble.tex',
  get engine() { return new URL('static/busytex/', typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').href; } };
const COMPILE_TIMEOUT_MS = 240000;                     // a PDF: 60 s + 2 s per problem, at most this
const PREVIEW_TIMEOUT_MS = 60000;
const selectionTimeout = n => Math.min(COMPILE_TIMEOUT_MS, 60000 + 2000 * n);

const state = { worker: null, ready: null, readyInfo: null, initWaiting: false, bodies: null, bodiesPromise: null, figures: new Map(), seq: 0,
  queue: [], running: null, listeners: new Set(), failed: null, expect: {} };

export function onStatus(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
function emit(msg) { for (const fn of state.listeners) { try { fn(msg); } catch (e) { /* listener error */ } } }
export const fmtBytes = n => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' kB' : n + ' B';

/* Messages shown to visitors (the page puts them after "Could not …:"). */
const UNSUPPORTED = 'This browser cannot run the LaTeX engine.';
function abortError() { const e = new Error('Cancelled.'); e.name = 'AbortError'; return e; }
function staleError() { const e = new Error('The problem bank was updated. Reload the page.'); e.name = 'StaleError'; return e; }

/* Feature test: everything the worker needs.  Old browsers get a clear message and can still download .tex.
   (SubtleCrypto is not needed: without it, on a plain-http page, there is only no PDF cache.) */
export function engineSupported() {
  try {
    return typeof Worker === 'function' && typeof WebAssembly === 'object' && typeof DecompressionStream === 'function'
      && typeof TextDecoder === 'function';
  } catch (e) { return false; }
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
      emit({ kind: 'progress', stage: data.stage, text: engineText(data), loaded: data.loaded, total: data.total });
    } else if (data.type === 'ready') {
      state.readyInfo = data;
      state._resolveReady && state._resolveReady(data);
    } else if (data.type === 'started') {
      if (!job) return;
      job.timer = setTimeout(() => timedOut(job), job.timeoutMs);
      emit({ kind: 'progress', stage: 'compile', job: job.kind, text: 'Compiling…' });
    } else if (data.type === 'marker') {
      if (!job || !job.order) return;
      const k = job.order.indexOf(data.pid);
      if (k < 0) return;
      job.pid = data.pid;
      if (job.order.length > 1) emit({ kind: 'progress', stage: 'compile', job: job.kind, text: `Compiling… ${k + 1} / ${job.order.length}` });
    } else if (data.type === 'result') {
      if (job) finish(job, null, data);
    } else if (data.type === 'error') {
      if (job) { stopWorker({ keepInit: true }); finish(job, new Error(data.message)); }     // the engine may be broken: next job, fresh worker
      else if (data.id == null) { state.failed = data.message; state._rejectReady && state._rejectReady(new Error(data.message)); }
    }
  };
  w.onerror = e => {                         // the worker died or could not be parsed: fail the job and what waits on it
    console.error('LaTeX engine worker:', e && e.message);
    const err = new Error('The LaTeX engine stopped unexpectedly. Try again.');
    state.failed = err.message;
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
  state.worker = null; state.readyInfo = null;
  if (state.initWaiting && keepInit) { ensureWorker().postMessage({ type: 'init', base: PATHS.engine }); return; }
  state.ready = null; state.initWaiting = false;
  state._rejectReady && state._rejectReady(reason || new Error('The LaTeX engine was stopped. Try again.'));
}

/* Load (or reuse from the Cache API) the engine; idempotent.  Rejects with a readable message. */
export function initEngine({ force = false } = {}) {
  if (state.ready && !force) return state.ready;
  if (!engineSupported()) return Promise.reject(new Error(UNSUPPORTED));
  const w = ensureWorker();
  state.ready = new Promise((resolve, reject) => { state._resolveReady = resolve; state._rejectReady = reject; });
  state.initWaiting = true;
  const t0 = performance.now();
  w.postMessage({ type: 'init', base: PATHS.engine, force: !!force });
  const ready = state.ready = state.ready.then(
    info => { if (state.ready === ready) state.initWaiting = false; info.wallMs = Math.round(performance.now() - t0); emit({ kind: 'ready', info }); return info; },
    err => { if (state.ready === ready) { state.ready = null; state.initWaiting = false; } throw err; });
  return ready;
}

/* Prefetch on first interaction — skipped on data-saver connections.  Never throws. */
export function prefetchEngine() {
  try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) { /* ignore */ }
  if (!engineSupported()) return;
  initEngine().catch(() => { /* reported when the user actually clicks Create */ });
}

/* Queue a compile.  Options: timeoutMs (counted from the moment pdfTeX starts on it), signal (AbortSignal: a waiting
   job is dropped, a running one stops the worker; rejects with name 'AbortError'), order + names (the problem IDs in
   the document and their titles, to name the problem a stuck compile is in), label (what else to name), kind. */
function compileRaw(mainTex, files, { rerun = true, timeoutMs = COMPILE_TIMEOUT_MS, signal = null, order = null, names = null, label = '', kind = 'tex' } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const job = { id: ++state.seq, mainTex, files: files || {}, rerun, timeoutMs, signal, order, names, label, kind, resolve, reject, timer: null, pid: null, done: false };
    if (signal) { job.onAbort = () => cancelJob(job); signal.addEventListener('abort', job.onAbort); }
    state.queue.push(job);
    pump();
  });
}

function pump() {
  if (state.running || !state.queue.length) return;
  const job = state.running = state.queue.shift();
  try { ensureWorker().postMessage({ type: 'compile', id: job.id, mainTex: job.mainTex, files: job.files, rerun: job.rerun, base: PATHS.engine }); }
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

function cancelJob(job) {
  if (job.done) return;
  if (state.running === job) stopWorker({ keepInit: true });
  finish(job, abortError());
}

/* pdfTeX runs synchronously inside the worker: a document that never ends (e.g. \def\x{\x}\x) keeps it busy
   forever, so after the timeout the worker itself is stopped.  Only this job fails; waiting jobs go on. */
function timedOut(job) {
  if (state.running !== job) return;
  const title = (job.pid && job.names && job.names[job.pid]) || job.label;
  const err = new Error('The LaTeX compile took too long and was stopped.' + (title ? ` It got stuck in the problem “${title}”.` : ''));
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
  err.log = r.log; err.mainTex = mainTex;
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

/* Stitched document.  MUST stay identical to bank/stitch.py::make_main. */
export function makeMain(bodies, ids, variant, { filters = '', showMethods = false } = {}) {
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
  out.push('\\end{document}');
  return out.join('\n') + '\n';
}

/* The downloadable .tex: a standalone document.  The shared preamble is inlined when it could be fetched
   (build.py publishes it next to the data), otherwise it is \input and must sit next to the file.
   Externalised figures (figNNNN-k.pdf) are referenced, not embedded. */
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

/* The drawings (externalised TikZ, figNNNN-k.pdf) of these problems.  Fetched by content (?v=<sha256>): an edited
   drawing keeps its file name, and the browser's HTTP cache must not hand back the old one.  `verified` is false when
   a file's bytes do not match bodies.json (a deploy still arriving): such a PDF is shown but not cached. */
async function figureFiles(bodies, ids) {
  const files = {}; let verified = true;
  await Promise.all(ids.map(i => bodies[pad4(i)]).filter(Boolean).flatMap(b => Object.entries(b.figures || {}).map(async ([name, info]) => {
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
   problem, so a compile that never ends can say which problem it is stuck in.  On the \bankproblem line itself:
   the log's line numbers stay those of mainTex, and \typeout puts nothing in the PDF. */
const withMarkers = tex => tex.replace(/^\\bankproblem\{\d+\}.*\{(\d+)\}$/gm, (m, id) => `\\typeout{BANK:${id}}${m}`);

/* ------------------------------------------------------------------ finished-PDF cache (by selection hash) */

async function pdfCache() { try { return await caches.open('bank-pdfs'); } catch (e) { return null; } }
/* The engine bundle version (format file + preamble) is part of the PDF cache key: a new bundle must not
   serve PDFs made by the old one.  Read from manifest.json (tiny) so the key is stable across page loads;
   a PDF is stored only if the engine that compiled it has this version. */
let versionPromise = null;
function engineVersion() {
  if (!versionPromise) {
    versionPromise = fetch(PATHS.engine + 'manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).then(m => m.version || 'v')
      .catch(() => { versionPromise = null; return 'v'; });
  }
  return versionPromise;
}
/* The key also covers the figures' contents: an edited drawing keeps its file name (figNNNN-k.pdf), so mainTex alone
   would not change.  null without SubtleCrypto (plain-http pages): no PDF cache there. */
async function selectionKey(version, variant, mainTex, figures = '') {
  if (!hasSubtle()) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(version + '|' + variant + '|' + mainTex + '|' + figures));
  return `/bank/pdf/${hex(digest).slice(0, 32)}.pdf`;
}

/* Compile one variant for a list of IDs, in the order given (the page decides it: bank-search.js::autoOrder or
   the hand-made order).  Resolves {ids, variant, pdf, mainTex, pages, passes, fromCache, ms}.
   signal (AbortSignal): cancels; the promise then rejects with name 'AbortError'. */
export function compileSelection(ids, variant, { filtersText = '', showMethods = false, useCache = true, signal = null } = {}) {
  return untilAborted(selection(ids, variant, { filtersText, showMethods, useCache, signal }), signal);
}

async function selection(ids, variant, { filtersText, showMethods, useCache, signal }) {
  const t0 = performance.now();
  if (!engineSupported()) throw new Error(UNSUPPORTED);
  const bodies = await loadBodies();
  const sorted = [...new Set(ids.map(Number))];
  const sel = sorted.map(i => bodies[pad4(i)]);
  if (sel.some(b => !b)) throw staleError();        // listed on this page but not in bodies.json: the page is older than the data
  const mainTex = makeMain(bodies, sorted, variant, { filters: filtersText, showMethods });
  const figures = sel.flatMap(b => Object.entries(b.figures || {}).map(([n, f]) => `${n}:${f.sha256}`)).sort().join(',');
  const version = await engineVersion();
  const key = useCache ? await selectionKey(version, variant, mainTex, figures) : null;
  if (key) {
    const cache = await pdfCache();
    const hit = cache ? await cache.match(key).catch(() => null) : null;
    const pdf = hit ? new Uint8Array(await hit.arrayBuffer()) : null;
    if (pdf && pdf.length) return { ids: sorted, variant, pdf, mainTex, fromCache: true, passes: [], pages: null, ms: Math.round(performance.now() - t0) };
  }
  if (signal && signal.aborted) throw abortError();
  await initEngine();
  const { files, verified } = await figureFiles(bodies, sorted);
  const r = await compileRaw(withMarkers(mainTex), files, { timeoutMs: selectionTimeout(sorted.length), signal, kind: 'selection',
    order: sel.map(b => b.id), names: Object.fromEntries(sel.map(b => [b.id, b.title])) });
  checkEngine(r);
  if (r.exit !== 0 || !r.pdf || !r.pdf.length) throw compileError(r, mainTex);
  if (key && verified && r.version === version) {
    const cache = await pdfCache();          // opened now: starting the engine may have deleted 'bank-pdfs' meanwhile
    if (cache) { try { await cache.put(key, new Response(r.pdf, { headers: { 'Content-Type': 'application/pdf' } })); } catch (e) { /* quota */ } }
  }
  return { ids: sorted, variant, pdf: r.pdf, mainTex, fromCache: false, passes: r.passes, rerun: r.rerun, pages: r.pages, ms: Math.round(performance.now() - t0) };
}

/* One problem on its own, for the "Preview" button in the results list: the statement only — a preview never
   shows a solution — and no cover page.  Not part of the stitched document, so makeMain (and its Python twin)
   stay untouched. */
export function makePreview(bodies, id) {
  const b = bodies[pad4(id)];
  if (!b) throw staleError();                      // listed on the page but not in bodies.json
  const out = ['\\begin{document}', '\\thispagestyle{empty}',
    `\\noindent{\\Large\\bfseries ${texEscape(b.title)}}\\par`];
  if (b.origin) out.push(`\\noindent{\\small\\textcolor{gray}{${texEscape(b.origin)}}}\\par`);
  out.push('\\addvspace{0.5\\baselineskip}', '\\begin{problem}', b.statement, '\\end{problem}', '\\end{document}');
  return out.join('\n') + '\n';
}

/* Compile that one-problem document.  Resolves {id, pdf, mainTex, pages, ms}.  signal: as for compileSelection. */
export function compilePreview(id, { signal = null } = {}) {
  return untilAborted(preview(Number(id), signal), signal);
}

async function preview(id, signal) {
  const t0 = performance.now();
  if (!engineSupported()) throw new Error(UNSUPPORTED);
  const bodies = await loadBodies();
  const mainTex = makePreview(bodies, id);
  if (signal && signal.aborted) throw abortError();
  await initEngine();
  const { files } = await figureFiles(bodies, [id]);
  const r = await compileRaw(mainTex, files, { timeoutMs: PREVIEW_TIMEOUT_MS, signal, kind: 'preview', label: bodies[pad4(id)].title });
  checkEngine(r);
  if (r.exit !== 0 || !r.pdf || !r.pdf.length) throw compileError(r, mainTex);
  return { id, pdf: r.pdf, mainTex, pages: r.pages, ms: Math.round(performance.now() - t0) };
}

/* Compile any document against the club format (the propose page's live preview).  No PDF cache.
   Resolves the worker's result {exit, pdf|null, log, errors, passes, pages}; rejects only if the engine fails. */
export async function compileTex(mainTex, { files = {}, timeoutMs = 60000, signal = null } = {}) {
  if (!engineSupported()) throw new Error(UNSUPPORTED);
  await untilAborted(initEngine(), signal);
  return compileRaw(mainTex, files, { timeoutMs, signal, kind: 'tex' });
}

export async function clearCaches() {
  try {
    if (!self.caches) return;
    for (const k of await caches.keys()) if (k.startsWith('bank-')) await caches.delete(k);
  } catch (e) { /* Cache API refused: nothing stored */ }
  state.ready = null; state.readyInfo = null;
}

/* "Reset the LaTeX engine": stop it (jobs in progress end with an AbortError), forget every stored engine file,
   drawing and PDF, then download and start the engine again.  Resolves like initEngine(). */
export async function resetEngine() {
  const jobs = [state.running, ...state.queue].filter(Boolean);
  state.queue = [];
  stopWorker({ reason: abortError() });
  for (const job of jobs) finish(job, abortError());
  await clearCaches();
  state.figures.clear();
  versionPromise = null;
  return initEngine({ force: true });
}

/* exposed for the browser tests */
export const _state = state;
