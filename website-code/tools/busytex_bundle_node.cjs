#!/usr/bin/env node
// Node half of tools/busytex_bundle.py: everything that needs the WebAssembly pdfTeX itself.
//
//   node tools/busytex_bundle_node.cjs <job.json>
//
// job.json (written by busytex_bundle.py):
//   { "assetsDir": ".../busytex",                 busytex.js/.wasm + texlive-{basic,recommended,extra}.{js,data}
//     "dataPackages": ["texlive-basic.js", ...],
//     "localTexmf": "/usr/local/texlive/2025/texmf-dist",
//     "localFiles": ["tex/latex/stmaryrd/stmaryrd.sty", ...],   files absent from the WASM TeX Live, taken locally
//     "extraFiles": {"fonts/pk/ljfour/public/bbm/bbm10.657pk": "/abs/path"},   e.g. harvested PK bitmaps
//     "preamble": "/abs/preamble.tex",
//     "ini": "club.ini text",
//     "docs": [{"name": "all_problems", "tex": "/abs/main.tex", "files": {"fig0041-1.pdf": "/abs/..."}}],
//     "out": "/abs/staging" }
//
// It (1) mounts the LZ4 data packages exactly like busytex_pipeline.js, (2) injects the local files into a
// second texmf tree with an ls-R, (3) builds club.fmt with `pdftex -ini &pdflatex club.ini -recorder`,
// (4) compiles every doc against club.fmt with -recorder (rerun once if LaTeX asks), (5) unions all recorded
// INPUT files, applies the completion policy (all .tfm of the used font families, .pfb of the used shapes at
// every size, .fd / mt-*.cfg / lstlang*.sty siblings), and (6) writes the selected files, club.fmt, a trimmed
// pdftex.map, texmf.cnf and files.json / report.json into <out>.  Paths of both trees are merged into one
// texmf-dist/ tree (the browser bundle has a single tree at /texlive/texmf-dist).
'use strict';
const fs = require('fs');
const path = require('path');

const FMT_STOCK = '/texlive/texmf-dist/texmf-var/web2c/pdftex/pdflatex.fmt';
const PROJECT = '/home/web_user/project_dir';
const LOCAL_TREE = '/texmf/texmf-dist';
const RERUN = ['Rerun to get', 'Label(s) may have changed', 'rerunfilecheck', 'run LaTeX again'];
const ENV = {
  TEXMFDIST: '/texlive/texmf-dist:' + LOCAL_TREE,
  TEXMFVAR: '/texlive/texmf-dist/texmf-var',
  TEXMFCACHE: '/texlive/texmf-dist/texmf-var',
  TEXMFCNF: '/texlive/texmf-dist/web2c',
  TEXMFLOG: '/tmp/texmf.log',
  TEXLIVE_REMOTE_ENDPOINT: '',
  SOURCE_DATE_EPOCH: '0',
  FORCE_SOURCE_DATE: '1',          // \time/\day/\year dumped into club.fmt too: same sources => same engine version
};

async function createEngine(assetsDir, dataPackages) {
  const factory = require(path.join(assetsDir, 'busytex.js'));
  const holder = { preRun: [], calledRun: false, locateFile: f => path.join(assetsDir, f) };
  globalThis.BusytexPipeline = holder;              // file_packager scripts push runWithFS() onto holder.preRun
  for (const pkg of dataPackages) { const rp = require.resolve(path.join(assetsDir, pkg)); delete require.cache[rp]; require(rp); }
  let stdout = '', stderr = '';
  const M = await factory({
    thisProgram: '/bin/busytex', noInitialRun: true, locateFile: f => path.join(assetsDir, f),
    print: t => { stdout += t + '\n'; }, printErr: t => { stderr += t + '\n'; }, setStatus: () => {},
    preRun: [m => {
      Object.assign(m.ENV, ENV);
      m.FS.createPath('/', PROJECT.slice(1), true, true);
      m.FS_createPath = m.FS.createPath; m.FS_createDataFile = m.FS.createDataFile;
      m.FS_createPreloadedFile = m.FS.createPreloadedFile; m.FS_createLazyFile = m.FS.createLazyFile; m.FS_unlink = m.FS.unlink;
      Object.setPrototypeOf(holder, m);
      for (const hook of holder.preRun) hook(m);
    }],
  });
  const header = Uint8Array.from(M.HEAPU8.slice(0, 2 ** 26));
  M.exec = args => {                                  // callMain MUTATES its argument → pass a copy
    stdout = ''; stderr = '';
    const t = Date.now();
    const exit_code = M.callMain([...args]);
    M._flush_streams();
    const ms = Date.now() - t;
    M.HEAPU8.fill(0); M.HEAPU8.set(header);           // busytex_pipeline.js' state reset between runs
    return { exit_code, stdout, stderr, ms };
  };
  M.readText = p => (M.FS.analyzePath(p).exists ? M.FS.readFile(p, { encoding: 'utf8' }) : null);
  M.readBytes = p => (M.FS.analyzePath(p).exists ? M.FS.readFile(p, { encoding: 'binary' }) : null);
  M.writeFile = (p, data) => { M.FS.createPath('/', path.posix.dirname(p).slice(1), true, true); M.FS.writeFile(p, data); };
  M.listDir = d => { try { return M.FS.readdir(d).filter(n => n !== '.' && n !== '..').map(n => d + '/' + n).filter(p => !M.FS.isDir(M.FS.stat(p).mode)); } catch (e) { return []; } };
  M.clearProject = () => { for (const f of M.FS.readdir(PROJECT)) if (f !== '.' && f !== '..') M.FS.unlink(PROJECT + '/' + f); };
  return M;
}

function writeLsR(M, root) {
  const lines = ['% ls-R -- filename database for kpathsea; do not change this line.'];
  const walk = dir => {
    const names = M.FS.readdir(dir).filter(n => n !== '.' && n !== '..');
    lines.push((dir === root ? './' : './' + dir.slice(root.length + 1)) + ':');
    lines.push(...names, '');
    for (const n of names) { const p = dir + '/' + n; if (M.FS.isDir(M.FS.stat(p).mode)) walk(p); }
  };
  walk(root);
  M.FS.writeFile(root + '/ls-R', lines.join('\n') + '\n');
}

function recordedInputs(M, flsPath) {
  const fls = M.readText(flsPath) || '';
  return fls.split('\n').filter(l => l.startsWith('INPUT ')).map(l => l.slice(6).trim());
}

function compileDoc(M, name, tex, files, fmt, report) {
  M.clearProject();
  M.writeFile(PROJECT + '/main.tex', tex);
  for (const [n, p] of Object.entries(files || {})) M.writeFile(PROJECT + '/' + n, fs.readFileSync(p));
  M.FS.chdir(PROJECT);
  const args = ['pdflatex', '-interaction=nonstopmode', '-halt-on-error', '-recorder', '--fmt', fmt, 'main.tex'];
  const passes = []; let log = ''; let exit = 0; const inputs = new Set();
  for (let i = 0; i < 3; i++) {
    const r = M.exec(args); passes.push(r.ms); exit = r.exit_code;
    log = M.readText(PROJECT + '/main.log') || '';
    for (const p of recordedInputs(M, PROJECT + '/main.fls')) inputs.add(p);
    if (exit !== 0) break;
    if (!RERUN.some(p => log.includes(p))) break;
  }
  const pages = Number((log.match(/Output written on main\.pdf \((\d+) pages?/) || [])[1] || 0);
  const errors = log.split('\n').filter(l => l.startsWith('!'));
  report.docs.push({ name, exit, passes, pages, errors: errors.slice(0, 10), pdfBytes: (M.readBytes(PROJECT + '/main.pdf') || []).length });
  console.log(`  ${name}: exit ${exit}, ${passes.length} pass(es) ${passes.join('+')} ms, ${pages} pages, ${errors.length} errors`);
  if (exit !== 0) console.log(errors.join('\n'));
  return { inputs, pdf: M.readBytes(PROJECT + '/main.pdf'), log };
}

(async () => {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const t0 = Date.now();
  const M = await createEngine(job.assetsDir, job.dataPackages);
  console.log(`engine + ${job.dataPackages.length} data packages ready in ${Date.now() - t0} ms`);

  // (2) local files → second tree
  const provenance = {};
  for (const rel of job.localFiles || []) { M.writeFile(LOCAL_TREE + '/' + rel, fs.readFileSync(path.join(job.localTexmf, rel))); provenance[LOCAL_TREE + '/' + rel] = 'local:' + path.join(job.localTexmf, rel); }
  for (const [rel, abs] of Object.entries(job.extraFiles || {})) { M.writeFile(LOCAL_TREE + '/' + rel, fs.readFileSync(abs)); provenance[LOCAL_TREE + '/' + rel] = 'extra:' + abs; }
  writeLsR(M, LOCAL_TREE);
  // the full local map is visible from the project dir only while building (TEXMFDOTDIR first in TEXFONTMAPS)
  const localMap = fs.readFileSync(job.localPdftexMap, 'utf8');
  const wasmMap = M.readText('/texlive/texmf-dist/texmf-var/fonts/map/pdftex/updmap/pdftex.map') || '';

  // (3) format
  const report = { docs: [], fmt: {} };
  M.clearProject();
  M.writeFile(PROJECT + '/club.ini', job.ini);
  M.writeFile(PROJECT + '/preamble.tex', fs.readFileSync(job.preamble, 'utf8'));
  M.writeFile(PROJECT + '/pdftex.map', localMap);
  M.FS.chdir(PROJECT);
  const rf = M.exec(['pdftex', '-ini', '-interaction=nonstopmode', '-halt-on-error', '-recorder', '-jobname=club', '-progname=pdflatex', '&pdflatex', 'club.ini']);
  const fmt = M.readBytes(PROJECT + '/club.fmt');
  if (rf.exit_code !== 0 || !fmt) { console.error(rf.stdout.slice(-3000)); throw new Error('format build failed'); }
  const inputs = new Set(recordedInputs(M, PROJECT + '/club.fls'));
  report.fmt = { ms: rf.ms, bytes: fmt.length, log: (M.readText(PROJECT + '/club.log') || '').split('\n').filter(l => /^!|Warning/.test(l)).slice(0, 20) };
  console.log(`club.fmt: ${fmt.length} bytes in ${rf.ms} ms`);
  M.writeFile('/club.fmt', fmt);

  // (4) recorder compiles
  fs.mkdirSync(path.join(job.out, 'pdf'), { recursive: true });
  for (const d of job.docs) {
    const files = { ...(d.files || {}) };
    const r = compileDoc(M, d.name, fs.readFileSync(d.tex, 'utf8'), { ...files, 'pdftex.map': job.localPdftexMap }, '/club.fmt', report);
    for (const p of r.inputs) inputs.add(p);
    if (r.pdf) fs.writeFileSync(path.join(job.out, 'pdf', d.name + '.pdf'), r.pdf);
    fs.writeFileSync(path.join(job.out, 'pdf', d.name + '.log'), r.log);
  }

  // (5) selection + completion policy
  const isTree = p => p.startsWith('/texlive/texmf-dist/') || p.startsWith(LOCAL_TREE + '/');
  const selected = new Set([...inputs].filter(p => isTree(p) && !p.endsWith('.fmt') && !/texmf-var\/fonts\/map\//.test(p)));
  const base = p => path.posix.basename(p);
  const shapes = new Set([...selected].filter(p => p.endsWith('.pfb')).map(p => base(p).replace(/\.pfb$/, '').replace(/\d+$/, '')));
  const families = new Set();      // e.g. 'public/lm', 'public/amsfonts/symbols'
  for (const p of selected) { const m = p.match(/\/fonts\/(type1|tfm|pk)\/(.+)\/[^/]+$/); if (m && (m[1] !== 'tfm' || /\/bbm$/.test(m[2]) || [...selected].some(q => q.endsWith('.pfb') && q.includes('/type1/' + m[2] + '/')))) families.add(m[2].replace(/^ljfour\//, '')); }
  const fontRoots = ['/texlive/texmf-dist/fonts', LOCAL_TREE + '/fonts'];
  for (const fam of families) for (const root of fontRoots) {
    for (const p of M.listDir(`${root}/tfm/${fam}`)) if (p.endsWith('.tfm')) selected.add(p);
    for (const p of M.listDir(`${root}/vf/${fam}`)) if (p.endsWith('.vf')) selected.add(p);
    for (const p of M.listDir(`${root}/type1/${fam}`)) if (p.endsWith('.pfb') && shapes.has(base(p).replace(/\.pfb$/, '').replace(/\d+$/, ''))) selected.add(p);
  }
  for (const p of M.listDir('/texlive/texmf-dist/fonts/enc/dvips/lm')) if (p.endsWith('.enc')) selected.add(p);
  const texDirs = new Set([...selected].filter(p => /\/tex\/(latex|generic)\//.test(p)).map(p => path.posix.dirname(p)));
  for (const d of texDirs) for (const p of M.listDir(d)) {
    if (p.endsWith('.fd') || (/\/microtype$/.test(d) && /\/mt-[^/]*\.cfg$/.test(p)) || (/\/listings$/.test(d) && /\/lstlang\d\.sty$/.test(p))) selected.add(p);
  }
  // texmf.cnf (the .fmt depends on its memory settings) — always the WASM one
  selected.add('/texlive/texmf-dist/web2c/texmf.cnf');
  selected.delete('/texlive/texmf-dist/texmf-var/fonts/map/pdftex/updmap/pdftex.map');

  // (6) export.  Both trees → texmf-dist/...
  const outTree = path.join(job.out, 'texmf-dist');
  const filesOut = [];
  for (const p of [...selected].sort()) {
    const rel = p.replace(/^\/texlive\/texmf-dist\//, '').replace(new RegExp('^' + LOCAL_TREE.replace(/\//g, '\\/') + '\\/'), '');
    const bytes = M.readBytes(p);
    if (!bytes) { console.warn('  missing in FS:', p); continue; }
    const dest = path.join(outTree, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    filesOut.push({ path: rel, bytes: bytes.length, from: provenance[p] || 'wasm:' + p, recorded: inputs.has(p) });
  }
  // trimmed pdftex.map: every line that references one of our .pfb files (WASM map first, local map for the rest)
  const pfbs = new Set(filesOut.filter(f => f.path.endsWith('.pfb')).map(f => base(f.path)));
  const mapLines = [];
  const seen = new Set();
  for (const src of [wasmMap, localMap]) for (const line of src.split('\n')) {
    const m = line.match(/<\[?([^\s<>]+\.pfb)/); if (!m || !pfbs.has(m[1])) continue;
    const tfm = line.split(/\s+/)[0]; if (seen.has(tfm)) continue; seen.add(tfm); mapLines.push(line);
  }
  const mapRel = 'fonts/map/pdftex/updmap/pdftex.map';
  fs.mkdirSync(path.join(outTree, path.dirname(mapRel)), { recursive: true });
  fs.writeFileSync(path.join(outTree, mapRel), mapLines.join('\n') + '\n');
  filesOut.push({ path: mapRel, bytes: Buffer.byteLength(mapLines.join('\n') + '\n'), from: 'generated (trimmed from WASM + local pdftex.map)', recorded: true });
  fs.writeFileSync(path.join(job.out, 'club.fmt'), fmt);
  fs.writeFileSync(path.join(job.out, 'files.json'), JSON.stringify({ files: filesOut, shapes: [...shapes], families: [...families], mapLines: mapLines.length }, null, 1));
  fs.writeFileSync(path.join(job.out, 'report.json'), JSON.stringify(report, null, 1));
  const total = filesOut.reduce((a, f) => a + f.bytes, 0);
  console.log(`selected ${filesOut.length} files, ${(total / 1e6).toFixed(2)} MB raw (recorded ${filesOut.filter(f => f.recorded).length}); map lines ${mapLines.length}; families ${[...families].join(', ')}`);
  process.exitCode = 0;   // Emscripten's exit() sets process.exitCode to the last TeX run's status
})().catch(e => { console.error('FAILED', e); process.exit(1); });
