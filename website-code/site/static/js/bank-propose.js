/* bank-propose.js — the "Propose a problem" page's logic: a draft (what the form holds) becomes the problem file
   problem-bank/problems/new-<title>.tex, is checked with the same rules as bank/problems.py::validate, and is turned
   into the document the live preview compiles.  Pure functions, no DOM (unit-tested with node:test).

   draft = {title, statement, solution, area: [slugs], methods: [slugs], difficulty, origin, originDate, originNumber,
            references, bibtex}          (strings; everything except statement + one area may be blank) */
// The page loads the modules as <name>.js?v=<build>; a relative import does not inherit the query, so they are imported
// with the same ?v= (one copy of each module, never a cached one of the last deploy next to new ones).
const V = new URL(import.meta.url).search;
const [{ texEscape }, { CITE_RE, DROP_RE, citeKeys, labelRefs, maskComments, parseBibEntries, parseBibText, placeholderFigures, pyStrip,
  resolveCitations }] = await Promise.all([import(`./bank-compile.js${V}`), import(`./bank-tex.js${V}`)]);

export const UNTITLED = 'Untitled problem';            // bank/problems.py::UNTITLED
export const MAX_TITLE_WORDS = 6;
const TITLE_FORBIDDEN = '\\&%#{}~^_$';
const DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme'];

export function emptyDraft() {
  return { title: '', statement: '', solution: '', area: [], methods: [], difficulty: '', origin: '', originDate: '',
    originNumber: '', references: '', bibtex: '' };
}

/* Lowercase letters that NFKD does not reduce to ASCII: spelled out, so that they do not vanish from file names.
   Same table as bank/problems.py::TRANSLIT (applied after NFKD and lowercasing, so Æ, ẞ, Σ, ά, µ are covered too). */
export const TRANSLIT = {"ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i", "ħ": "h",
  "ŧ": "t", "ŋ": "ng", "ĸ": "k", "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta",
  "η": "eta", "θ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi", "ο": "omicron",
  "π": "pi", "ρ": "rho", "ς": "sigma", "σ": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi",
  "ω": "omega"};

/* Title -> file-name slug.  Mirrors bank/problems.py::kebab. */
export function kebab(title) {
  return [...String(title || '').normalize('NFKD').replace(/\p{Mn}/gu, '').toLowerCase()].map(c => TRANSLIT[c] || c).join('')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
export const effectiveTitle = draft => oneLine(draft.title) || UNTITLED;
export const fileName = draft => `new-${kebab(effectiveTitle(draft)) || 'untitled-problem'}.tex`;

/* Text of a LaTeX box as it goes into the file: no leading blank lines, no trailing whitespace. */
const block = s => String(s || '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
/* References: one line in the header; the lines of the box are joined with "; ". */
const refsLine = s => String(s || '').split(/\r?\n/).map(oneLine).filter(Boolean).join('; ');

/* Human-readable origin, "Putnam 1989, A3".  Mirrors bank/problems.py::origin_label. */
export function originLabel(cat, origin, originDate, originNumber) {
  if (!origin) return '';
  const t = cat.byType.origin.get(origin);
  let s = [t ? t.name : origin, ...(originDate ? [originDate.slice(0, 4)] : [])].join(' ');
  if (originNumber) s += `, ${originNumber}`;
  return s;
}

/* ------------------------------------------------------------------ the file */

const header = (key, value) => (value ? `% ${key}:`.padEnd(18) + value : `% ${key}:`);

/* The problem file, in the layout of problems/_template.tex.  Blank fields stay blank; no solution = no block. */
export function problemFile(draft) {
  const d = { ...emptyDraft(), ...draft };
  const lines = [
    header('title', effectiveTitle(d)),
    header('area', d.area.join(', ')),
    header('methods', d.methods.join(', ')),
    header('difficulty', d.difficulty),
    header('difficulty-ai', ''),
    header('status', ''),
    header('review', 'none'),
    '% --- history: all optional, leave EMPTY if unknown ---',
    header('origin', d.origin),
    header('origin-date', oneLine(d.originDate)),
    header('origin-number', oneLine(d.originNumber)),
    header('also-in', ''),
    header('taken-from', ''),
    header('references', refsLine(d.references)),
    header('history', 'none'),
    '\\begin{problem}', block(d.statement), '\\end{problem}',
  ];
  if (block(d.solution)) lines.push('\\begin{solution}', block(d.solution), '\\end{solution}');
  if (block(d.bibtex)) lines.push('\\begin{bibentries}', block(d.bibtex), '\\end{bibentries}');
  return lines.join('\n') + '\n';
}

/* ------------------------------------------------------------------ checks (same rules as the CI validator) */

/* YYYY, YYYY-MM or YYYY-MM-DD: ASCII digits and a real calendar date, year 0001 or later.  Mirrors
   bank/problems.py::_valid_date (allow_partial). */
export function validDate(s) {
  const m = /^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?$/.exec(s);
  if (!m) return false;
  const [y, mo, da] = [+m[1], +(m[2] || 1), +(m[3] || 1)];
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, da);                    // (Date.UTC would read the years 0-99 as 1900-1999)
  return y >= 1 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === da;
}

/* Characters the club preamble can print in a title or an origin number: TeX specials (`forbidden`) and characters the
   fonts cannot print (math symbols such as √ ≤ ∑) are returned, sorted.  Mirrors bank/problems.py::unprintable. */
const NOT_IN_T1 = 'ĦħĸĿŀŉŦŧſ';
const PRINTABLE_EXTRA = '–—‘’“”…·•€„‚«»†‡‰'
  + 'αβγδεζηθικλμνξοπρς'
  + 'στυφχψωϑϕϖϱϵΑΒΓΔΕΖ'
  + 'ΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
export function unprintable(text, forbidden = TITLE_FORBIDDEN) {
  const ok = (c) => {
    const o = c.codePointAt(0);
    return !forbidden.includes(c) && ((o >= 0x20 && o <= 0x7e) || (o >= 0xa0 && o <= 0x17f && !NOT_IN_T1.includes(c)) || PRINTABLE_EXTRA.includes(c));
  };
  return [...new Set([...String(text || '')].filter(c => !ok(c)))].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

/* Preamble-only LaTeX, also with the spaces TeX accepts ("\end {document}").  Same list as bank/problems.py::FORBIDDEN_TEX. */
const FORBIDDEN_TEX = [
  [/\\documentclass(?![A-Za-z@])/, '\\documentclass'],
  [/\\usepackage(?![A-Za-z@])/, '\\usepackage'],
  [/\\(begin|end)\s*\{\s*document\s*\}|\\(end|begin)document(?![A-Za-z@])/, '\\begin{document} / \\end{document}'],
  [/\\input\s*\{\s*preamble/, '\\input{preamble}'],
  [/\\maketitle(?![A-Za-z@])/, '\\maketitle'],
];
/* TeX that reaches beyond the problem's own text: a PDF from the website is ONE document holding many problems, and CI
   compiles every problem on its runner.  Same regexes as bank/problems.py::UNSAFE_TEX (checked there on the whole body,
   comments and bibentries included). */
const UNSAFE_TEX = [
  [new RegExp('\\\\(?:global|globaldefs|gdef|xdef|edef|def|let|futurelet|chardef|mathchardef|countdef|dimendef|skipdef|muskipdef|'
    + 'toksdef|aftergroup|begingroup|csname|scantokens|catcode|makeatletter|makeatother|ExplSyntaxOn|everypar|everymath|'
    + 'everydisplay|everyhbox|everyvbox|everycr|everyeof|everyjob|output|shipout|dump|batchmode|nonstopmode|scrollmode|'
    + 'errorstopmode|AtBeginDocument|AtEndDocument|AtBeginShipout|AtBeginEnvironment|AtEndEnvironment|AddToHook|'
    + 'AddToHookNext|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|'
    + 'NewDocumentEnvironment|RenewDocumentEnvironment|ProvideDocumentEnvironment|DeclareDocumentEnvironment|'
    + 'NewCommandCopy|RenewCommandCopy|DeclareCommandCopy|NewEnvironmentCopy|RenewEnvironmentCopy|'
    + 'DeclareEnvironmentCopy)(?![A-Za-z@])|\\\\end[A-Za-z]+|\\^\\^'),
   c => `${c} cannot be used: it could change the other problems of a PDF (define macros with \\newcommand in the text)`],
  [/\\(?:begin|end)(?![A-Za-z@])(?![ \t\n]*\{[ \t\n]*[A-Za-z*]+[ \t\n]*\})/,
   c => `write the environment name in braces right after ${c}, e.g. \\begin{align*}`],
  [/\\(?:newcounter|newlength|newtheorem|newsavebox|newif|newcount|newdimen|newskip|newmuskip|newtoks|newbox|newread|newwrite|newlanguage|newfam|newinsert)(?![A-Za-z@])/,
   c => `${c} cannot be used: it defines a name for the whole PDF (use the club's environments, e.g. lemma)`],
  [/\\(?:input|include|includegraphics|includeonly|InputIfFileExists|IfFileExists|lstinputlisting|verbatiminput|VerbatimInput|openin|closein|read|readline|openout|closeout|write|immediate|ShellEscape)(?![A-Za-z@])/,
   c => `${c} cannot be used: a problem is one self-contained text (no other files, no images: draw with TikZ)`],
  [/\\(?:today|year|month|day|time|pdf[A-Za-z]+)(?![A-Za-z@])/,
   c => `${c} cannot be used: the same problems must always give the same PDF (no date, clock or random numbers)`],
  [/\\(?:[Bb]ank[A-Za-z]*|refitem)(?![A-Za-z@])|\{[ \t\n]*problemreferences[ \t\n]*\}/,
   c => `${c} cannot be used: it belongs to the website's PDF layout`],
];
/* The citation commands the website resolves (bank-tex.js::CITE_RE); \nocite is harmless.  Same as bank/problems.py. */
const SUPPORTED_CITES = new Set(['cite', 'citep', 'citet', 'parencite', 'textcite', 'autocite', 'Cite', 'Parencite', 'Textcite',
  'Autocite', 'supercite', 'footcite', 'nocite']);
const CITE_COMMAND_RE = /\\([A-Za-z]*[Cc]ite[A-Za-z]*)(?![A-Za-z@])/g;
const STRUCTURE = /\\(begin|end)\s*\{\s*(problem|solution|bibentries)\s*\}/;
const BIB_COMMANDS = /\\(bibliography|addbibresource|bibliographystyle)\s*[[{]/;
const lineOf = (text, i) => text.slice(0, i).split('\n').length;

/* The rules of bank/problems.py that apply to every text box (statement, solution and the Bibliography box: its fields
   are printed into the reference list).  `where(i)` = "Statement, line 3" for the offset i. */
function texErrors(text, where) {
  const out = [];
  for (const [rx, message] of UNSAFE_TEX) {
    const m = rx.exec(text);
    if (m) out.push(`${where(m.index)}: ${message(m[0])}.`);
  }
  const m = [...text.matchAll(CITE_COMMAND_RE)].find(c => !SUPPORTED_CITES.has(c[1]));
  if (m) out.push(`${where(m.index)}: \\${m[1]} is not supported on the website: write \\cite{key} (or \\cite[p.~3]{key}).`);
  return out;
}

/* [{field, message}] — empty = the file will pass the CI validator.  `bibKeys`: keys of references.bib
   (null = not loaded: \cite keys are not checked). */
export function validateDraft(draft, cat, bibKeys = null) {
  const d = { ...emptyDraft(), ...draft };
  const errors = [];
  const err = (field, message) => errors.push({ field, message });

  const title = effectiveTitle(d);
  let bad = unprintable(title);
  if (bad.length) err('title', `The title cannot contain ${bad.join(' ')}: keep it plain text (write math symbols in words).`);
  const words = title.split(' ').length;
  if (words > MAX_TITLE_WORDS) err('title', `The title has ${words} words; keep it to ${MAX_TITLE_WORDS} or fewer.`);
  if (!kebab(title)) err('title', 'The title needs at least one Latin letter or digit.');

  if (!block(d.statement)) err('statement', 'Write the problem statement (required).');
  for (const field of ['statement', 'solution']) {
    const text = String(d[field] || '');
    const where = (i) => `${field === 'statement' ? 'Statement' : 'Solution'}, line ${lineOf(text, i)}`;
    let m = STRUCTURE.exec(text);
    if (m) err(field, `${where(m.index)}: remove ${m[0]}; the page adds the problem / solution / bibliography blocks itself.`);
    for (const [rx, label] of FORBIDDEN_TEX) {
      m = rx.exec(text);
      if (m) err(field, `${where(m.index)}: ${label} cannot be used; only the club's LaTeX is available (see "Show available LaTeX").`);
    }
    m = BIB_COMMANDS.exec(text);
    if (m) err(field, `${where(m.index)}: remove \\${m[1]}; citations are resolved automatically (put the entries in the Bibliography box).`);
    m = /\\tikz(?![A-Za-z@])/.exec(text);
    if (m) err(field, `${where(m.index)}: inline \\tikz is not supported; draw inside \\begin{tikzpicture} … \\end{tikzpicture}.`);
    for (const message of texErrors(text, where)) err(field, message);
  }
  {                                                     // the problems-only PDF holds the statement alone: a reference
    const st = labelRefs(maskComments(d.statement));    // into the solution would print ??
    const soTargets = labelRefs(maskComments(d.solution)).targets;
    const reported = new Set();
    for (const [k, i] of st.refs) {
      if (k in st.targets || !(k in soTargets) || reported.has(k)) continue;
      reported.add(k);
      err('statement', `Statement, line ${lineOf(String(d.statement), i)}: "${k}" is labelled in the solution, and the problems-only PDF `
        + 'would print ?? (label it in the statement, or refer to it only in the solution).');
    }
  }

  if (!d.area.length) err('area', 'Pick at least one area (required).');
  for (const a of d.area) if (!cat.byType.area.has(a)) err('area', `Unknown area "${a}".`);
  for (const m of d.methods) if (!cat.byType.methods.has(m)) err('methods', `Unknown method "${m}".`);
  for (const k of ['area', 'methods']) {
    const twice = [...new Set(d[k].filter((x, i) => d[k].indexOf(x) !== i))].sort();
    if (twice.length) err(k, `${twice.join(', ')} ${twice.length > 1 ? 'are' : 'is'} chosen twice.`);
  }
  if (d.difficulty && !DIFFICULTIES.includes(d.difficulty)) err('difficulty', `Unknown difficulty "${d.difficulty}".`);
  if (d.origin && !cat.byType.origin.has(d.origin)) err('origin', `Unknown origin "${d.origin}".`);
  const date = oneLine(d.originDate);
  if (date && !validDate(date)) err('originDate', 'Write the date as YYYY, YYYY-MM or YYYY-MM-DD (e.g. 1989, 1989-12 or 1989-12-02).');
  bad = unprintable(oneLine(d.originNumber));
  if (bad.length) err('originNumber', `The number cannot contain ${bad.join(' ')}: keep it plain text (e.g. A3, Problem 6).`);

  const bib = String(d.bibtex || '');
  if (/\\(begin|end)\s*\{\s*bibentries\s*\}/.test(bib)) err('bibtex', 'Remove \\begin{bibentries} / \\end{bibentries}; paste only the BibTeX entries.');
  {                                                     // BibTeX fields are printed into the reference list: same LaTeX rules
    let m = /\\(begin|end)\s*\{\s*(problem|solution)\s*\}/.exec(bib);
    if (m) err('bibtex', `Bibliography, line ${lineOf(bib, m.index)}: remove ${m[0]}.`);
    for (const [rx, label] of FORBIDDEN_TEX) {
      m = rx.exec(bib);
      if (m) err('bibtex', `Bibliography, line ${lineOf(bib, m.index)}: ${label} cannot be used.`);
    }
    m = BIB_COMMANDS.exec(bib);
    if (m) err('bibtex', `Bibliography, line ${lineOf(bib, m.index)}: remove \\${m[1]}.`);
    m = /\\tikz(?![A-Za-z@])/.exec(bib);
    if (m) err('bibtex', `Bibliography, line ${lineOf(bib, m.index)}: \\tikz cannot be used here.`);
    for (const message of texErrors(bib, i => `Bibliography, line ${lineOf(bib, i)}`)) err('bibtex', message);
  }
  const own = parseBibEntries(bib).map(([k]) => k);
  if (pyStrip(block(bib)) && !own.length) err('bibtex', 'No BibTeX entry found. Entries look like @article{key, author = {…}, title = {…}, year = {…}}.');
  if (own.some(k => !k)) err('bibtex', 'A BibTeX entry has no key (write @article{key, …}).');
  const dup = [...new Set(own.filter((k, i) => k && own.indexOf(k) !== i))].sort();
  if (dup.length) err('bibtex', `BibTeX key${dup.length > 1 ? 's' : ''} given twice: ${dup.join(', ')}.`);
  if (bibKeys !== null) {
    const known = new Set([...bibKeys, ...own]);
    for (const field of ['statement', 'solution']) {
      for (const k of citeKeys(d[field])) if (!known.has(k)) err(field, `\\cite{${k}}: no BibTeX entry with this key. Add it in the Bibliography box.`);
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ live preview */

const leadingBlankLines = s => { const m = /^(?:[ \t]*\n)+/.exec(String(s || '').replace(/\r\n?/g, '\n')); return m ? m[0].split('\n').length - 1 : 0; };
/* \printbibliography / \nocite lines are dropped by the citation step; blank them first so the line count stays.
   A \cite spread over lines is put on one line, the lost line breaks moved in front of it as comment lines. */
const keepLines = t => t.replace(DROP_RE, m => (m.endsWith('\n') ? '%\n' : '%'))
  .replace(CITE_RE, m => { const k = (m.match(/\n/g) || []).length; return k ? '%\n'.repeat(k) + m.replace(/\s*\n\s*/g, ' ') : m; });

/* The document the preview compiles against the club format (same macros as the bank PDFs, heading "Problem 1. Title").
   Figures become placeholders (no TikZ in the browser), citations are resolved like CI does.
   Returns {tex, lines}: lines.statement / lines.solution = [first, last, lead, end] (1-based lines of main.tex holding
   that box; lead = blank lines dropped at the top of the box; end = the page's own \end{problem} / \end{solution} line),
   lines.refs = [[first, last], …] (reference lists made from the Bibliography box and references.bib). */
export function previewMain(draft, cat, globalBib = {}) {
  const d = { ...emptyDraft(), ...draft };
  const bib = Object.assign(Object.create(null), globalBib, parseBibText(d.bibtex));      // the draft's own entries win
  const st = keepLines(placeholderFigures(block(d.statement)).tex);
  const so = block(d.solution) ? keepLines(placeholderFigures(block(d.solution)).tex) : null;
  const r = resolveCitations(st, so, bib);
  const title = effectiveTitle(d).replace(/[\\{}~^]/g, '');
  const methods = d.methods.map(m => (cat.byType.methods.get(m) || { name: m }).name);
  const out = ['\\begin{document}', `\\bankproblem{1}{${texEscape(title)}}{${texEscape(originLabel(cat, d.origin, oneLine(d.originDate), oneLine(d.originNumber)))}}{new}`];
  if (methods.length) out.push(`\\bankmethods{${texEscape(methods.join(', '))}}`);
  const lines = { statement: null, solution: null, refs: [] };
  const push = (key, text, own, lead) => {
    const first = out.join('\n').split('\n').length + 1;
    const last = first + text.split('\n').length - 1;
    const mine = own.split('\n').length;                  // the box's own lines; a reference list may follow them
    out.push(text);
    lines[key] = [first, Math.min(last, first + mine - 1), lead, last + 1];
    if (last > first + mine - 1) lines.refs.push([first + mine, last]);
  };
  out.push('\\begin{problem}');
  push('statement', r.statement, st, leadingBlankLines(d.statement));
  out.push('\\end{problem}');
  if (r.solution !== null) { out.push('\\begin{solution}'); push('solution', r.solution, so, leadingBlankLines(d.solution)); out.push('\\end{solution}'); }
  else out.push('\\banknosolution');
  out.push('\\end{document}');
  return { tex: out.join('\n') + '\n', lines };
}

/* True when `text` opens more braces than it closes (\{ \} and % comments do not count). */
const opensBraces = text => [...String(text || '').replace(/\\[\\{}%]|%[^\n]*/g, '')]
  .reduce((depth, c) => depth + (c === '{' ? 1 : c === '}' ? -1 : 0), 0) > 0;

/* The first TeX error of a preview log, located in the form:
   {message, box: 'statement'|'solution'|'bibtex'|null, line (in that box, or null), source, unclosed}.
   unclosed: a $, \[, { or environment opened in that box is never closed (TeX reports it on the page's own
   \end{problem} / \end{solution} line, or at the end of the file with no line; `draft` then tells which box). */
export function explainLog(log, lines, draft = null) {
  const all = String(log || '').split('\n');
  const i = all.findIndex(l => l.startsWith('!'));
  if (i < 0) return null;
  let message = all[i].replace(/^!\s*/, '').trim();
  let box = null, line = null, source = '', unclosed = false, located = false;
  const boxLine = (key, n) => { const r = lines && lines[key]; return r && n >= r[0] && n <= r[1] ? n - r[0] + 1 + (r[2] || 0) : null; };
  for (let k = i + 1; k < Math.min(all.length, i + 40); k++) {
    const m = /^l\.(\d+)\s?(.*)$/.exec(all[k]);
    if (!m) continue;
    located = true;
    const n = Number(m[1]);
    source = m[2];
    for (const key of ['statement', 'solution']) {
      const r = lines && lines[key];
      if (!r) continue;
      if (boxLine(key, n) !== null) { box = key; line = boxLine(key, n); }
      else if (n === (r[3] || r[1] + 1)) { box = key; unclosed = true; source = ''; }
    }
    if (!box && lines && (lines.refs || []).some(([a, b]) => n >= a && n <= b)) box = 'bibtex';
    break;
  }
  if (unclosed) {                       // "\begin{itemize} on input line 7 ended by \end{problem}": that line is in the box
    const m = / on input line (\d+)/.exec(message);
    if (m && boxLine(box, Number(m[1])) !== null) { line = boxLine(box, Number(m[1])); message = message.replace(m[0], ''); }
  }
  if (!located && draft && /^File ended while scanning/.test(message)) {
    box = ['statement', 'solution'].find(key => opensBraces(draft[key])) || null;
    unclosed = !!box;
  }
  return { message, box, line, source, unclosed };
}

/* ------------------------------------------------------------------ GitHub link (the Edit links: bank-search.js::githubEditUrl) */

/* gh = {repo: 'owner/name', branch: 'main', problemsPath: 'problem-bank/problems'} (written by build.py). */
export function githubNewFileUrl(gh, name) {
  return `https://github.com/${gh.repo}/new/${gh.branch}/${gh.problemsPath}?filename=${encodeURIComponent(name)}`;
}
