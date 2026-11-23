// Minimal static file server for the tests (serves site/ like GitHub Pages would).  No compression by default;
// { gzip: true } compresses text files for a client that asks for it, as GitHub Pages does (the lag test, perf.mjs).
import http from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.gz': 'application/gzip', '.pdf': 'application/pdf', '.png': 'image/png', '.txt': 'text/plain', '.tex': 'text/plain', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.tex']);

export function startServer(root, port = 0, { gzip = false } = {}) {
  const zipped = new Map();          // file -> its gzip, made once
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, path);
    let st;
    try { st = statSync(file); } catch (e) { res.writeHead(404); res.end('not found'); return; }
    if (st.isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); res.end(); return; }
    const head = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (gzip && TEXT.has(extname(file)) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      if (!zipped.has(file)) zipped.set(file, gzipSync(readFileSync(file)));
      const body = zipped.get(file);
      res.writeHead(200, { ...head, 'Content-Encoding': 'gzip', 'Content-Length': body.length, Vary: 'Accept-Encoding' });
      res.end(body);
      return;
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, close: () => new Promise(r => server.close(r)) })));
}
