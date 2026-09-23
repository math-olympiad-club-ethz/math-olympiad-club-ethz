/* compile-worker.js — pdfTeX (BusyTeX / WebAssembly) in a Web Worker for the problem bank.

   Protocol (postMessage):
     → {type:'init', base, force?}           load + cache the bundle, instantiate the engine (idempotent)
     ← {type:'progress', stage, loaded?, total?}   stage 'manifest' | 'download' (compressed bytes so far / expected,
                                             from manifest.json; only files not in the cache) | 'instantiate'
     ← {type:'ready', timings, download, version}   download: {bytes (transferred, compressed), fromCache: bool, files}
     → {type:'compile', id, mainTex, files?: {name: Uint8Array}, rerun?: true}
     ← {type:'started', id}                  pdfTeX starts (the engine is loaded): the page starts its timeout here
     ← {type:'marker', id, pid}              a line "BANK:<pid>" on the terminal (\typeout before each problem)
     ← {type:'result', id, version, exit, pdf?, log, passes:[ms], rerun:bool, pages, errors}
     ← {type:'error', id?, message}          message: a short sentence for the page (details go to the console)

   Assets (site/static/busytex/, built by tools/busytex_bundle.py): manifest.json, busytex.js.gz, busytex.wasm.gz,
   club.fmt.gz, club-texlive.data.gz (+ club-texlive.json index).  Everything is gzip'd on disk and decompressed
   here with DecompressionStream, so nothing depends on the server's Content-Encoding.  The compressed responses
   are stored in the Cache API ('bank-engine-<manifest.version>'); a second visit downloads only manifest.json.
   Every file is checked against its sha256 in manifest.json before it is used (from the network or from the cache):
   a damaged or stale copy is dropped and downloaded once more.

   Engine facts used here: busytex.js is a single-threaded Emscripten MODULARIZE build (no SharedArrayBuffer,
   no COOP/COEP needed).  callMain() mutates its argument (copy it).  State between runs is reset like
   busytex_pipeline.js does: snapshot the first 64 MB of the heap after init and restore it after each run.
   A document can write without end (\wlog or \write16 in a loop): the terminal output kept, the log read back and
   the files a run may write are all capped, so a runaway document cannot take the tab's memory.
*/
'use strict';

const MEM_HEADER = 2 ** 26;
const PROJECT = '/home/web_user/project_dir';
const FILES = ['busytex.js.gz', 'busytex.wasm.gz', 'club.fmt.gz', 'club-texlive.data.gz', 'club-texlive.json'];
const OUT_MAX = 131072, OUT_KEEP = 65536;              // terminal output kept per run: the last 64 to 128 kB
const LOG_TAIL = 131072;                               // bytes of main.log read back (errors and rerun hints are at the end)
const FILE_CAP = 16 * 2 ** 20, PDF_CAP = 128 * 2 ** 20; // largest file a run may write in the project dir (main.pdf: PDF_CAP)
let state = null;          // {manifest, Module, header, base}
let initPromise = null;
let currentJob = null;     // id of the compile running now (for the markers)
let capping = false;       // true while pdfTeX runs
const capped = new Set();  // files that hit the cap in this run

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

/* An error whose message is meant for the visitor; anything else is logged and replaced by a short sentence. */
function userError(message, cause) { const e = new Error(message); e.forUser = true; if (cause) e.cause = cause; return e; }
const RELOAD = 'Reload the page to try again.';

const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
async function streamToBytes(stream) { return new Uint8Array(await new Response(stream).arrayBuffer()); }

async function getManifest(base) {
  let r;
  try { r = await fetch(new URL(base + 'manifest.json', self.location.href).href, { cache: 'no-cache' }); }
  catch (e) { throw userError(`Could not download the LaTeX engine (network error). ${RELOAD}`, e); }
  if (!r.ok) throw userError(`Could not download the LaTeX engine (HTTP ${r.status} for manifest.json). ${RELOAD}`);
  const m = await r.json();
  if (!m || !m.version || !m.files) throw new Error('manifest.json has no version or files');
  return m;
}

/* The Cache API is optional: private windows (Firefox before 122) and blocked site data make it reject. */
async function openCache(name, force) {
  if (!self.caches) return null;
  try {
    if (force) await caches.delete(name);
    const cache = await caches.open(name);
    for (const k of await caches.keys()) if (k.startsWith('bank-engine-') && k !== name) { await caches.delete(k); await caches.delete('bank-pdfs'); }   // new engine → old PDFs are stale
    return cache;
  } catch (e) { console.warn('Cache API not available: the LaTeX engine is not stored', e); return null; }
}

async function download(ctx, name, again) {
  const url = ctx.url(name);
  let resp;
  // a second try asks past every cache: a CDN edge that lags behind the deploy may still answer the plain URL
  try { resp = await fetch(again ? url + '?v=' + encodeURIComponent(ctx.manifest.version) : url, { cache: 'no-store' }); }
  catch (e) { throw userError(`Could not download the LaTeX engine (network error). ${RELOAD}`, e); }
  if (!resp.ok) throw userError(`Could not download the LaTeX engine (HTTP ${resp.status} for ${name}). ${RELOAD}`);
  // not awaited: the file is decompressed (and the wasm compiled) while it arrives, and progress is shown
  if (ctx.cache) ctx.puts[name] = ctx.cache.put(url, resp.clone()).catch(e => console.warn('cache.put failed', name, e));
  return resp;
}

async function forget(ctx, name) {
  if (!ctx.cache) return;
  try { await ctx.puts[name]; await ctx.cache.delete(ctx.url(name)); } catch (e) { /* ignore */ }
}

/* The decompressed bytes of one file; the wasm is compiled while it streams in (`compiling`, null if that failed). */
async function decode(ctx, name, resp, counted) {
  let body = resp.body;
  if (counted) body = body.pipeThrough(new TransformStream({ transform(chunk, c) { ctx.progress(chunk.byteLength); c.enqueue(chunk); } }));
  if (name.endsWith('.gz')) body = body.pipeThrough(new DecompressionStream('gzip'));
  if (name !== 'busytex.wasm.gz') return { bytes: await streamToBytes(body) };
  const [a, b] = body.tee();
  const compiling = WebAssembly.compileStreaming(new Response(a, { headers: { 'Content-Type': 'application/wasm' } }))
    .catch(e => { console.warn('compileStreaming failed, falling back', e); return null; });
  return { bytes: await streamToBytes(b), compiling };
}

async function intact(ctx, name, bytes) {
  const want = (ctx.manifest.files[name] || {}).sha256;
  if (!want || !(self.crypto && crypto.subtle)) return true;     // plain http: no SubtleCrypto (and no Cache API to poison either)
  return hex(await crypto.subtle.digest('SHA-256', bytes)) === want;
}

/* One engine file, checked against manifest.json.  A bad copy (damaged, stale, or planted in the cache) is deleted
   and fetched once more past the caches; if that one is bad too, the engine does not start. */
async function loadFile(ctx, name) {
  let failure = null;        // the last network download broke off (rather than arriving damaged)
  for (let attempt = 0; attempt < 2; attempt++) {
    const cached = attempt === 0 ? ctx.cached[name] : null;
    if (attempt > 0) ctx.addTotal(name);
    const resp = cached || await download(ctx, name, attempt > 0);
    let out = null;
    failure = null;
    try { out = await decode(ctx, name, resp, !cached); } catch (e) { console.warn('engine file unreadable', name, e); failure = cached ? null : e; }
    if (out && await intact(ctx, name, out.bytes)) {
      ctx.download.files[name] = { fromCache: !!cached };
      if (!out.compiling) return out;
      const module = (await out.compiling) || await WebAssembly.compile(out.bytes);
      return { module };
    }
    if (out) console.warn('engine file does not match manifest.json', name, cached ? '(cache)' : '(network)');
    await forget(ctx, name);
  }
  throw failure ? userError(`Could not download the LaTeX engine (network error). ${RELOAD}`, failure)
    : userError(`The LaTeX engine download was damaged. ${RELOAD}`);
}

async function init(base, force) {
  const t = {}; const T0 = performance.now(); const mark = (k, t0) => { t[k] = Math.round(performance.now() - t0); };
  post({ type: 'progress', stage: 'manifest' });
  const manifest = await getManifest(base);
  const cache = await openCache('bank-engine-' + manifest.version, force);
  const size = n => (manifest.files[n] || {}).bytes || 0;
  const ctx = { base, manifest, cache, cached: {}, puts: {}, url: n => new URL(base + n, self.location.href).href,
    download: { bytes: 0, fromCache: true, files: {} }, loaded: 0, total: 0, lastPost: 0 };
  ctx.progress = n => {
    ctx.loaded += n; ctx.download.bytes += n;
    const now = performance.now();
    if (now - ctx.lastPost >= 100 || ctx.loaded >= ctx.total) { ctx.lastPost = now; post({ type: 'progress', stage: 'download', loaded: ctx.loaded, total: Math.max(ctx.total, ctx.loaded) }); }
  };
  ctx.addTotal = n => { ctx.total += size(n); ctx.download.fromCache = false; };

  // 1. what the cache already holds, then the rest from the network, all in parallel; the wasm is compiled while it
  //    streams out of the gunzip, and every file is checked before it is used.
  const t0 = performance.now();
  if (cache) await Promise.all(FILES.map(async n => { try { ctx.cached[n] = (await cache.match(ctx.url(n))) || null; } catch (e) { ctx.cached[n] = null; } }));
  for (const n of FILES) if (!ctx.cached[n]) ctx.addTotal(n);
  if (ctx.total) post({ type: 'progress', stage: 'download', loaded: 0, total: ctx.total });
  const [js, wasm, fmt, data, idx] = await Promise.all(FILES.map(n => loadFile(ctx, n)));
  mark('downloadDecompressCheckCompileWasm', t0);
  const jsText = new TextDecoder().decode(js.bytes);
  const index = JSON.parse(new TextDecoder().decode(idx.bytes));
  const fmtBytes = fmt.bytes, dataBytes = data.bytes, wasmModule = wasm.module;

  // 2. the Emscripten factory: busytex.js declares `var busytex = ...` and has a UMD tail that is inert in a worker.
  post({ type: 'progress', stage: 'instantiate' });
  const t1 = performance.now();
  if (typeof self.busytex !== 'function' || force) (0, eval)(jsText);
  const factory = self.busytex;
  let stdout = '', stderr = '';
  let instantiateFailed;
  const failed = new Promise((_, reject) => { instantiateFailed = reject; });
  const Module = await Promise.race([failed, factory({
    thisProgram: '/bin/busytex',
    noInitialRun: true,
    print: s => {
      stdout += s + '\n'; if (stdout.length > OUT_MAX) stdout = stdout.slice(-OUT_KEEP);
      if (currentJob !== null && s.startsWith('BANK:')) { const m = /^BANK:(\d+)\s*$/.exec(s); if (m) post({ type: 'marker', id: currentJob, pid: m[1] }); }
    },
    printErr: s => { stderr += s + '\n'; if (stderr.length > OUT_MAX) stderr = stderr.slice(-OUT_KEEP); },
    setStatus: () => {},
    locateFile: f => base + f,
    instantiateWasm(imports, done) { WebAssembly.instantiate(wasmModule, imports).then(inst => done(inst, wasmModule)).catch(instantiateFailed); return {}; },
    preRun: [M => {
      Object.assign(M.ENV, manifest.env);
      const tm = performance.now();
      // 3. mount the trimmed TeX Live tree: plain MEMFS files viewing into the one decompressed blob (no copy)
      const dirs = new Set(['/']);
      const mkdirp = d => { if (dirs.has(d)) return; mkdirp(d.slice(0, d.lastIndexOf('/')) || '/'); if (!M.FS.analyzePath(d).exists) M.FS.mkdir(d); dirs.add(d); };
      for (const f of index.files) {
        const i = f.filename.lastIndexOf('/');
        const dir = f.filename.slice(0, i); mkdirp(dir);
        M.FS.createDataFile(dir, f.filename.slice(i + 1), dataBytes.subarray(f.start, f.end), true, false, true);
      }
      const fp = manifest.fmt_path; const fi = fp.lastIndexOf('/'); mkdirp(fp.slice(0, fi));
      M.FS.createDataFile(fp.slice(0, fi), fp.slice(fi + 1), fmtBytes, true, false, true);
      mkdirp(PROJECT);
      mkdirp('/bin'); if (!M.FS.analyzePath('/bin/busytex').exists) M.FS.writeFile('/bin/busytex', '');   // kpathsea needs SELFAUTOLOC = dirname(argv[0])
      t.mount = Math.round(performance.now() - tm);
    }],
  })]);
  mark('instantiateAndMount', t1);
  capWrites(Module.FS);
  const header = Uint8Array.from(Module.HEAPU8.subarray(0, MEM_HEADER));
  state = { manifest, Module, header, base, io: () => ({ stdout, stderr }), reset: () => { stdout = ''; stderr = ''; } };
  t.total = Math.round(performance.now() - T0);
  post({ type: 'ready', timings: t, download: ctx.download, version: manifest.version, files: index.files.length });
}

/* While pdfTeX runs, a write that would make a file in the project dir larger than its cap fails with ENOSPC
   (pdfTeX goes on without it).  Emscripten's own syscalls call FS.write, so wrapping it here is enough. */
function capWrites(FS) {
  const write = FS.write;
  FS.write = function (stream, buffer, offset, length, position) {
    if (capping && stream && typeof stream.path === 'string' && stream.path.startsWith(PROJECT + '/')) {
      const end = (typeof position === 'number' ? position : stream.position) + length;
      if (end > (stream.path === PROJECT + '/main.pdf' ? PDF_CAP : FILE_CAP)) { capped.add(stream.path); throw new FS.ErrnoError(28); }
    }
    return write.apply(this, arguments);
  };
}

function runTeX(args) {
  const { Module } = state;
  state.reset(); capped.clear();
  const t0 = performance.now();
  let exit;
  capping = true;
  try {
    exit = Module.callMain([...args]);         // copy: callMain unshifts thisProgram into its argument
    Module._flush_streams();
  } finally { capping = false; }
  const ms = Math.round(performance.now() - t0);
  Module.HEAPU8.fill(0); Module.HEAPU8.set(state.header);
  return { exit, ms, ...state.io() };
}

/* The end of a (possibly huge) file, without reading the rest. */
function readTail(FS, path, max) {
  if (!FS.analyzePath(path).exists) return '';
  const size = FS.stat(path).size, n = Math.min(size, max), buf = new Uint8Array(n);
  const st = FS.open(path, 'r');
  try { FS.read(st, buf, 0, n, size - n); } finally { FS.close(st); }
  const text = new TextDecoder().decode(buf);
  return size > n ? `[log truncated: ${size} bytes, the last ${n} kept]\n` + text.slice(text.indexOf('\n') + 1) : text;
}

function clearProject(FS) {
  for (const f of FS.readdir(PROJECT)) if (f !== '.' && f !== '..') FS.unlink(PROJECT + '/' + f);
}

function compile(id, mainTex, files, rerun) {
  const { Module, manifest } = state; const FS = Module.FS;
  clearProject(FS);
  FS.writeFile(PROJECT + '/main.tex', mainTex);
  for (const [n, data] of Object.entries(files || {})) FS.writeFile(PROJECT + '/' + n, data);
  FS.chdir(PROJECT);
  post({ type: 'started', id });
  const passes = []; let log = ''; let exit = 0; let didRerun = false; let last = null;
  currentJob = id;
  try {
    for (let pass = 0; pass < 3; pass++) {
      last = runTeX(manifest.pdftex_args); passes.push(last.ms); exit = last.exit;
      log = readTail(FS, PROJECT + '/main.log', LOG_TAIL);
      try { FS.unlink(PROJECT + '/main.log'); } catch (e) { /* no log */ }
      if (exit !== 0 || rerun === false) break;
      if (!manifest.rerun_patterns.some(p => log.includes(p))) break;
      didRerun = true;
    }
  } finally { currentJob = null; }
  const pdfPath = PROJECT + '/main.pdf';
  let pdf = exit === 0 && FS.analyzePath(pdfPath).exists ? FS.readFile(pdfPath, { encoding: 'binary' }) : null;
  const pages = Number((log.match(/Output written on main\.pdf \((\d+) pages?/) || [])[1] || 0);
  const errors = log.split('\n').filter(l => l.startsWith('!'));
  // a document that ships no page leaves an empty main.pdf (exit 0): that is a failure, not a blank PDF
  if (pdf && (pdf.length === 0 || /^No pages of output\.$/m.test(log) || /^No pages of output\.$/m.test(last.stdout))) { pdf = null; if (!errors.length) errors.push('! No pages of output.'); }
  if (capped.has(pdfPath)) { pdf = null; errors.push('! The PDF is too large.'); }
  clearProject(FS);                              // big files a run wrote are freed now, not at the next compile
  const msg = { type: 'result', id, version: manifest.version, exit, pdf, log, passes, rerun: didRerun, pages, errors,
    stdoutTail: (last && last.stdout || '').slice(-3000), stderrTail: (last && last.stderr || '').slice(-3000) };
  post(msg, pdf ? [pdf.buffer] : []);
}

function ensureInit(base, force) {
  if (!initPromise || force) initPromise = init(base || '../static/busytex/', force).catch(e => { initPromise = null; throw e; });
  return initPromise;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      if (initPromise && !data.force) {          // already initialised (or in progress): answer once it is ready
        await initPromise;
        post({ type: 'ready', timings: {}, download: { bytes: 0, fromCache: true, files: {} }, version: state.manifest.version, cached: true });
        return;
      }
      await ensureInit(data.base, data.force);    // init() posts 'ready' itself
    } else if (data.type === 'exec') {            // debugging / tests: run any applet, e.g. ['kpsewhich', 'article.cls']
      if (!state) await ensureInit(data.base);
      post({ type: 'result', id: data.id, ...runTeX(data.args) });
    } else if (data.type === 'compile') {
      if (!state) await ensureInit(data.base);
      compile(data.id, data.mainTex, data.files, data.rerun);
    }
  } catch (e) {
    console.error('LaTeX engine:', e);             // the details (and the stack) stay in the console
    const message = e && e.forUser ? e.message
      : data.type === 'init' || !state ? `The LaTeX engine could not start. ${RELOAD}` : 'The LaTeX engine failed. Try again.';
    post({ type: 'error', id: data.id, message });
  }
};
