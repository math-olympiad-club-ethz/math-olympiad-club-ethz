/* bank-tex.js — what CI does to a problem body before the browser compiles it (bank/bib.py, bank/stitch.py),
   redone in the browser for the live preview of the "Propose a problem" page.  Pure functions, no DOM.
   parseBibEntries / formatEntry / resolveCitations mirror the Python side byte for byte (tests compare them).
   Figures are NOT externalised here (that needs TikZ, which the browser format does not load): each tikzpicture /
   tikzcd block becomes a placeholder box instead. */

/* Also \cite*{k} and the spaces TeX allows ("\cite [p.~3] {k}").  The optional [pre][post] notes are bounded (300
   characters): many unclosed "\cite[" would otherwise make the scan quadratic.  Same regex as bank/bib.py::CITE_RE. */
export const CITE_RE = /\\(?:cite|citep|citet|parencite|textcite|autocite|Cite|Parencite|Textcite|Autocite|supercite|footcite)\*?(?![A-Za-z@])[ \t\n]*(?:\[([^\]]{0,300})\][ \t\n]*)?(?:\[([^\]]{0,300})\][ \t\n]*)?\{([^{}]*)\}/g;
export const DROP_RE = /^[ \t]*\\(printbibliography|nocite\{[^}]*\}|bibliography\{[^}]*\}|bibliographystyle\{[^}]*\}|addbibresource\{[^}]*\})[^\n]*\n?/gm;
const BIB_BLOCK_RE = /\\begin\{bibentries\}([\s\S]*?)\\end\{bibentries\}/;

/* `tex` with every % comment replaced by spaces (same length and newlines, so offsets still point into `tex`); \% is a
   percent sign, \\% a line break and then a comment.  Mirrors bank/problems.py::mask_comments (written without its
   lookbehind, which Safari before 16.4 cannot parse). */
export function maskComments(tex) {
  return String(tex || '').replace(/(^|[^\\])((?:\\\\)*)%[^\n]*/g, (m, before, slashes) => before + slashes + ' '.repeat(m.length - before.length - slashes.length));
}

/* Python's whitespace (str.split / str.strip / re \s): JS \s has U+FEFF and lacks U+001C-U+001F and U+0085.  Used
   wherever the Python side calls strip() or split(), so that the page and CI read keys and fields the same way. */
const PY_WS = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const WS_RUN = new RegExp(`[${PY_WS}]+`, 'u');
const EDGES = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, 'gu');
export const pyStrip = s => s.replace(EDGES, '');                  // Python s.strip()
const RIGHT = new RegExp(`[${PY_WS}]+$`, 'u');
const pyRstrip = s => s.replace(RIGHT, '');                        // Python s.rstrip()
const squash = s => s.split(WS_RUN).filter(Boolean).join(' ');       // Python " ".join(s.split())
const ENTRY_RE = new RegExp(`^@([\\p{L}\\p{N}_]+)[${PY_WS}]*\\{`, 'u');
const FIELD_RE = new RegExp(`[${PY_WS}]*([\\p{L}\\p{N}_]+)[${PY_WS}]*=[${PY_WS}]*`, 'uy');
const BARE_RE = new RegExp(`[^,${PY_WS}]+`, 'uy');
const COMMA_RE = new RegExp(`[${PY_WS}]*,`, 'uy');

/* [[key, {type, field: value}]] in file order, duplicates kept.  Mirrors bank/bib.py::parse_bib_entries. */
export function parseBibEntries(text) {
  text = String(text || '');
  const entries = [];
  let i = 0;
  for (;;) {
    i = text.indexOf('@', i);
    if (i < 0) break;
    const m = ENTRY_RE.exec(text.slice(i));
    if (!m) { i += 1; continue; }
    const etype = m[1].toLowerCase();
    const j = i + m[0].length;
    let depth = 1, k = j;
    while (k < text.length && depth) { depth += text[k] === '{' ? 1 : text[k] === '}' ? -1 : 0; k += 1; }
    const body = text.slice(j, k - 1);
    i = k;
    if (etype === 'comment' || etype === 'preamble' || etype === 'string') continue;
    const comma = body.indexOf(',');
    const key = comma < 0 ? body : body.slice(0, comma);
    const rest = comma < 0 ? '' : body.slice(comma + 1);
    const fields = { type: etype };
    let pos = 0;
    while (pos < rest.length) {
      const fm = FIELD_RE; fm.lastIndex = pos;
      const f = fm.exec(rest);
      if (!f) break;
      const name = f[1].toLowerCase();
      pos = fm.lastIndex;
      if (pos >= rest.length) break;
      let val;
      if (rest[pos] === '{') {
        let d = 1, q = pos + 1;
        while (q < rest.length && d) { d += rest[q] === '{' ? 1 : rest[q] === '}' ? -1 : 0; q += 1; }
        val = rest.slice(pos + 1, q - 1);
        pos = q;
      } else if (rest[pos] === '"') {
        let q = rest.indexOf('"', pos + 1);
        if (q < 0) q = rest.length;
        val = rest.slice(pos + 1, q);
        pos = q + 1;
      } else {
        const vm = BARE_RE; vm.lastIndex = pos;
        const v = vm.exec(rest);
        if (!v) break;
        val = v[0];
        pos = vm.lastIndex;
      }
      fields[name] = squash(val);
      const cm = COMMA_RE; cm.lastIndex = pos;
      pos = cm.exec(rest) ? cm.lastIndex : rest.length;
    }
    entries.push([pyStrip(key), fields]);
  }
  return entries;
}

/* {key: fields}; a later duplicate wins. */
export function parseBibText(text) {
  const out = Object.create(null);
  for (const [k, f] of parseBibEntries(text)) out[k] = f;
  return out;
}

export function bibBlock(body) {
  const m = BIB_BLOCK_RE.exec(String(body || ''));
  return m ? m[1] : '';
}

/* Every citation key in `tex`, in order of first use. */
export function citeKeys(tex) {
  const out = [];
  for (const m of String(tex || '').matchAll(CITE_RE)) {
    for (let k of m[3].split(',')) { k = pyStrip(k); if (k && !out.includes(k)) out.push(k); }
  }
  return out;
}

/* '{Title}' -> 'Title' (repeatedly), only when one balanced group wraps it all: 'On {Euler}' stays.  Mirrors bib.py::_unwrap. */
function unwrap(t) {
  while (t.length >= 2 && t[0] === '{' && t[t.length - 1] === '}') {
    let depth = 0;
    for (const c of t.slice(1, -1)) {
      depth += c === '{' ? 1 : c === '}' ? -1 : 0;
      if (depth < 0) return t;
    }
    if (depth) return t;
    t = t.slice(1, -1);
  }
  return t;
}

const AND_RE = new RegExp(`[${PY_WS}]+and[${PY_WS}]+`, 'u');
function authors(s) {
  const out = s.split(AND_RE).map(a => {
    a = pyStrip(a);
    const c = a.indexOf(',');
    if (c >= 0) a = pyStrip(`${pyStrip(a.slice(c + 1))} ${pyStrip(a.slice(0, c))}`);
    return a;
  });
  if (out.length <= 2) return out.join(' and ');
  return out.slice(0, -1).join(', ') + ', and ' + out[out.length - 1];
}

/* Plain LaTeX text for one entry (numeric style).  Mirrors bank/bib.py::format_entry. */
export function formatEntry(e) {
  const parts = [];
  if (e.author) parts.push(authors(e.author) + ',');
  if (e.title) parts.push(`\\emph{${unwrap(e.title)}},`);
  if (e.journal) {
    let j = e.journal;
    if (e.volume) j += ` \\textbf{${e.volume}}`;
    if (e.number) j += ` (${e.number})`;
    if (e.year) j += `, ${e.year}`;
    if (e.pages) j += `, pp.~${e.pages}`;
    parts.push(j + '.');
  } else {
    const tail = [e.publisher, e.howpublished, e.year].filter(Boolean);
    if (tail.length) parts.push(tail.join(', ') + '.');
  }
  if (e.eprint && (e.archiveprefix || '').toLowerCase() === 'arxiv') parts.push(`arXiv:${e.eprint}.`);
  if (e.doi) parts.push(`\\href{https://doi.org/${e.doi}}{\\nolinkurl{doi:${e.doi}}}.`);      // DOIs may contain _
  else if (e.url) parts.push(`\\url{${e.url}}.`);
  if (e.note && !e.note.includes('arXiv')) parts.push(e.note + '.');
  return parts.join(' ');
}

/* \cite{a,b} -> [1, 2] (numbers shared by statement and solution, statement keys first), problemreferences lists
   appended; \printbibliography & co. dropped.  Mirrors bank/stitch.py::resolve_citations.
   Returns {statement, solution, count, missing: [keys not in bib]}. */
export function resolveCitations(statement, solution, bib) {
  const numbers = new Map();
  const missing = [];
  const sub = (_m, a, b, keys) => {
    let post = b;
    if (post === undefined) post = a;               // \cite[post]{k}; a prenote \cite[pre][post]{k} is dropped
    const nums = [];
    for (let k of keys.split(',')) {
      k = pyStrip(k);
      if (!k) continue;
      if (!numbers.has(k)) { numbers.set(k, numbers.size + 1); if (!Object.hasOwn(bib, k)) missing.push(k); }
      nums.push(String(numbers.get(k)));
    }
    let txt = nums.join(', ');
    if (post) txt += ', ' + pyStrip(post);
    return `[${txt}]`;
  };
  statement = statement.replace(DROP_RE, '').replace(CITE_RE, sub);
  const nStatement = numbers.size;
  if (solution !== null && solution !== undefined) solution = solution.replace(DROP_RE, '').replace(CITE_RE, sub);
  const reflist = keys => '\n\\begin{problemreferences}\n' + keys.map(k => `\\refitem{${numbers.get(k)}} ${formatEntry(Object.hasOwn(bib, k) ? bib[k] : { title: k })}`).join('\n') + '\n\\end{problemreferences}';
  const ordered = [...numbers.keys()];
  if (nStatement) statement = pyRstrip(statement) + reflist(ordered.slice(0, nStatement)) + '\n';
  if (solution !== null && solution !== undefined && numbers.size > nStatement) solution = pyRstrip(solution) + reflist(ordered.slice(nStatement)) + '\n';
  return { statement, solution, count: numbers.size, missing };
}

/* ------------------------------------------------------------------ figures */

const FIG_ENVS = ['tikzpicture', 'tikzcd'];

/* [start, end) spans of top-level tikzpicture / tikzcd environments; a commented-out figure is not one.
   Mirrors bank/stitch.py::find_figures. */
export function findFigures(tex) {
  const masked = maskComments(tex);
  const spans = [];
  for (const env of FIG_ENVS) {
    const open = `\\begin{${env}}`, close = `\\end{${env}}`;
    for (let s = masked.indexOf(open); s >= 0; s = masked.indexOf(open, s + 1)) {
      const e = masked.indexOf(close, s + open.length);
      if (e >= 0) spans.push([s, e + close.length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out = [];
  let last = -1;
  for (const [s, e] of spans) if (s >= last) { out.push([s, e]); last = e; }
  return out;
}

/* Works in text and in math mode; the drawing itself is compiled by CI (TikZ is not in the browser format). */
export const FIGURE_PLACEHOLDER = '\\fbox{\\parbox{0.6\\linewidth}{\\centering\\small\\textit{TikZ drawing: not drawn in this preview. The website compiles it when the problem is added.}}}';

/* Replace every figure by the placeholder, keeping the number of lines (so error line numbers still match).  The
   padding comes first, so no empty line (= \par, fatal inside \[ … \]) appears where the figure ended. */
export function placeholderFigures(tex) {
  let out = '', pos = 0, n = 0;
  for (const [s, e] of findFigures(tex)) {
    out += tex.slice(pos, s) + '%\n'.repeat((tex.slice(s, e).match(/\n/g) || []).length) + FIGURE_PLACEHOLDER;
    pos = e; n += 1;
  }
  return { tex: out + tex.slice(pos), figures: n };
}

/* ------------------------------------------------------------------ labels and references */

/* TeX allows spaces before the argument ("\label {x}"), cleveref an optional type ("\label[lemma]{x}").
   Same regexes as bank/stitch.py (LABEL_RE, RANGE_RE, HYPERREF_RE). */
const REF_CMDS = 'label|ref|eqref|pageref|autoref|nameref|cref|Cref|labelcref|labelcpageref|cpageref|Cpageref|namecref|'
  + 'nameCref|lcnamecref|namecrefs|nameCrefs|lcnamecrefs|hypertarget|hyperlink';
const LABEL_RE = new RegExp(`\\\\(${REF_CMDS})(?![A-Za-z@])(\\*?)[ \\t\\n]*(\\[[^\\]]{0,300}\\])?[ \\t\\n]*\\{([^{}]*)\\}`, 'g');
const RANGE_RE = /\\(crefrange|Crefrange|cpagerefrange|Cpagerefrange)(?![A-Za-z@])(\*?)[ \t\n]*\{([^{}]*)\}[ \t\n]*\{([^{}]*)\}/g;
const HYPERREF_RE = /\\hyperref[ \t\n]*\[([^\]]{0,300})\]/g;
const TARGET_CMDS = ['label', 'hypertarget'];

/* {targets: {key: offset} of \label / \hypertarget, refs: [[key, offset]] of every reference}.  Mirrors
   bank/stitch.py::label_refs. */
export function labelRefs(tex) {
  const targets = Object.create(null), refs = [];
  const split = s => s.split(',').map(pyStrip).filter(Boolean);
  for (const m of tex.matchAll(LABEL_RE)) {
    for (const k of split(m[4])) {
      if (TARGET_CMDS.includes(m[1])) { if (!(k in targets)) targets[k] = m.index; }
      else refs.push([k, m.index]);
    }
  }
  for (const m of tex.matchAll(RANGE_RE)) for (const g of [3, 4]) for (const k of split(m[g])) refs.push([k, m.index]);
  for (const m of tex.matchAll(HYPERREF_RE)) for (const k of split(m[1])) refs.push([k, m.index]);
  return { targets, refs };
}
