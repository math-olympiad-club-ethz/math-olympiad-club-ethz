// Minimal static file server for the tests (serves site/ like GitHub Pages would, no compression).
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.gz': 'application/gzip', '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.tex': 'text/plain' };

export function startServer(root, port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, path);
    let st;
    try { st = statSync(file); } catch (e) { res.writeHead(404); res.end('not found'); return; }
    if (st.isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, close: () => new Promise(r => server.close(r)) })));
}
