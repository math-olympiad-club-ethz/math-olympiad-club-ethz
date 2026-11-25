// The data a built page carries inline (build.py::render_pages): problems.html its bank-data (the tag catalogue, the
// index, the build), propose.html its propose-data.  Read as the page reads it: the text of its
// <script type="application/json" id="…">, JSON.parse'd (the build writes every "<" in it as \u003c, so nothing in it
// ends the script).  Throws when the page or its script is missing.
import { readFileSync } from 'node:fs';

export function pageData(file, id) {
  const html = readFileSync(file, 'utf8');
  const m = new RegExp(`<script\\b[^>]*\\bid="${id}"[^>]*>([^]*?)</script>`).exec(html);
  if (!m) throw new Error(`${file} carries no <script type="application/json" id="${id}">`);
  return JSON.parse(m[1]);
}
