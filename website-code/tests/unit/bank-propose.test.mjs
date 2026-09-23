// Unit tests of the "Propose a problem" logic (node --test): the generated file, the checks, the preview document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as S from '../../site/static/js/bank-search.js';
import * as P from '../../site/static/js/bank-propose.js';
import * as T from '../../site/static/js/bank-tex.js';

const cat = S.buildCatalogue({
  area: [
    { slug: 'number-theory', name: 'Number theory', description: '', aliases: [], parent: null, children: ['primes'], depth: 1 },
    { slug: 'primes', name: 'Primes', description: '', aliases: [], parent: 'number-theory', children: [], depth: 2 },
  ],
  methods: [{ slug: 'induction', name: 'Induction', description: '', aliases: [], group: 'Proof strategies' }],
  difficulty: ['easy', 'medium', 'hard', 'extreme'].map(s => ({ slug: s, name: s[0].toUpperCase() + s.slice(1), description: '', aliases: [] })),
  origin: [{ slug: 'putnam', name: 'Putnam', description: '', aliases: [], kind: 'university' }],
});
const draft = (o = {}) => ({ ...P.emptyDraft(), statement: 'Prove it.', area: ['primes'], ...o });
const fields = errors => errors.map(e => e.field);

test('the file: header in the layout of _template.tex, blank fields blank, no solution = no block', () => {
  assert.equal(P.problemFile(draft()), [
    '% title:          Untitled problem', '% area:           primes', '% methods:', '% difficulty:', '% difficulty-ai:', '% status:',
    '% review:         none', '% --- history: all optional, leave EMPTY if unknown ---', '% origin:', '% origin-date:', '% origin-number:',
    '% also-in:', '% taken-from:', '% references:', '% history:        none',
    '\\begin{problem}', 'Prove it.', '\\end{problem}', ''].join('\n'));
  const full = P.problemFile(draft({ title: '  Sum   of cubes ', statement: '\n\nLine 1\n\nLine 2  \n\n', solution: 'Sol.\n', area: ['primes', 'number-theory'],
    methods: ['induction'], difficulty: 'hard', origin: 'putnam', originDate: '1989', originNumber: 'A3', references: 'first\n\n second \n', bibtex: '@misc{k, title={T}}\n' }));
  assert.match(full, /^% title:          Sum of cubes\n% area:           primes, number-theory\n% methods:        induction\n% difficulty:     hard\n/);
  assert.match(full, /% origin:         putnam\n% origin-date:    1989\n% origin-number:  A3\n% also-in:\n% taken-from:\n% references:     first; second\n/);
  assert.ok(full.endsWith('\\begin{problem}\nLine 1\n\nLine 2\n\\end{problem}\n\\begin{solution}\nSol.\n\\end{solution}\n\\begin{bibentries}\n@misc{k, title={T}}\n\\end{bibentries}\n'));
  assert.ok(!P.problemFile(draft({ solution: '  \n ' })).includes('solution'));
});

test('file name: new-<kebab title>.tex; blank title = Untitled problem', () => {
  assert.equal(P.fileName(draft({ title: 'Sum of two cubes' })), 'new-sum-of-two-cubes.tex');
  assert.equal(P.fileName(draft()), 'new-untitled-problem.tex');
  assert.equal(P.fileName(draft({ title: "Théorème de Fermat's" })), 'new-theoreme-de-fermats.tex');
  assert.equal(P.kebab("Simon's favourite factoring trick"), 'simons-favourite-factoring-trick');
});

test('file name: letters without an ASCII decomposition are spelled out, not dropped', () => {
  const cases = { 'Straße über Öl': 'strasse-uber-ol', 'ÆØÅ æøå Œœ': 'aeoa-aeoa-oeoe', 'Σ-algebras and π': 'sigma-algebras-and-pi',
    'µ-law': 'mu-law', 'π and e': 'pi-and-e', 'φ and e': 'phi-and-e', 'αβγ': 'alphabetagamma', 'Łódź, Đakovo, Þórr': 'lodz-dakovo-thorr',
    'ẞ ı ŋ ħ ŧ ĸ ð': 'ss-i-ng-h-t-k-d', 'ϑ ϕ ϖ ϱ ϵ ς': 'theta-phi-pi-rho-epsilon-sigma', 'Ἀλφα ΆΩ': 'alphalambdaphialpha-alphaomega' };
  for (const [title, slug] of Object.entries(cases)) assert.equal(P.kebab(title), slug, title);
  assert.deepEqual(P.validateDraft(draft({ title: 'αβγ' }), cat), [], 'a Greek-only title is fine');
  assert.match(P.validateDraft(draft({ title: '!!!' }), cat)[0].message, /at least one Latin letter or digit/);
});

test('checks: only the statement and one area are required', () => {
  assert.deepEqual(fields(P.validateDraft(P.emptyDraft(), cat, [])), ['statement', 'area']);
  assert.deepEqual(P.validateDraft(draft(), cat, []), []);
  assert.deepEqual(P.validateDraft(draft({ statement: '   \n ' }), cat, []).map(e => e.field), ['statement']);
});

test('checks: title, tags, date', () => {
  assert.deepEqual(fields(P.validateDraft(draft({ title: 'A_b & c' }), cat)), ['title']);
  assert.match(P.validateDraft(draft({ title: 'A_b & c' }), cat)[0].message, /cannot contain & _/);
  assert.deepEqual(fields(P.validateDraft(draft({ title: 'one two three four five six seven' }), cat)), ['title']);
  assert.deepEqual(fields(P.validateDraft(draft({ title: '!!!' }), cat)), ['title']);
  assert.deepEqual(fields(P.validateDraft(draft({ area: ['nope'], methods: ['nope'], difficulty: 'impossible', origin: 'nowhere' }), cat)),
    ['area', 'methods', 'difficulty', 'origin']);
  for (const ok of ['1989', '1989-12', '2024-02-29']) assert.deepEqual(P.validateDraft(draft({ originDate: ok }), cat), [], ok);
  for (const bad of ['89', '1989-13', '2023-02-29', '1989/12', '1989-1-2']) assert.deepEqual(fields(P.validateDraft(draft({ originDate: bad }), cat)), ['originDate'], bad);
});

test('checks: LaTeX the file cannot contain', () => {
  const msgs = s => P.validateDraft(draft({ statement: s }), cat).map(e => e.message).join('\n');
  assert.match(msgs('A\n\\end{problem}'), /Statement, line 2: remove \\end\{problem\}/);
  assert.match(msgs('\\usepackage{tikz}'), /\\usepackage cannot be used/);
  assert.match(msgs('x \\end{document}'), /\\end\{document\} cannot be used/);
  assert.match(msgs('\\tikz \\draw (0,0) -- (1,1);'), /inline \\tikz is not supported/);
  assert.equal(msgs('\\tikzset{x=1cm}\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}'), '');
  assert.match(P.validateDraft(draft({ solution: 'S\n\\begin{solution}' }), cat).map(e => e.message).join(), /Solution, line 2/);
});

test('checks: bibliography and citations', () => {
  assert.deepEqual(fields(P.validateDraft(draft({ bibtex: 'not bibtex' }), cat)), ['bibtex']);
  assert.deepEqual(fields(P.validateDraft(draft({ bibtex: '@article{a, title={x}} @book{a, title={y}}' }), cat)), ['bibtex']);
  assert.deepEqual(fields(P.validateDraft(draft({ bibtex: '\\end{bibentries}' }), cat)), ['bibtex', 'bibtex']);
  assert.deepEqual(fields(P.validateDraft(draft({ statement: 'See \\cite{x}.', solution: '\\cite[p.~2]{y,z}' }), cat, ['z'])), ['statement', 'solution']);
  assert.deepEqual(P.validateDraft(draft({ statement: 'See \\cite{x}.', bibtex: '@misc{x, title={X}}' }), cat, []), []);
  assert.deepEqual(P.validateDraft(draft({ statement: 'See \\cite{x}.' }), cat, null), [], 'references.bib not loaded: keys not checked');
});

test('preview document: club macros, heading line, figures as boxes (same line count), citations resolved', () => {
  const d = draft({ title: 'Cubes & squares', origin: 'putnam', originDate: '1989-12', originNumber: 'A3', methods: ['induction'],
    statement: 'Look \\cite{k}:\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n\\foo', solution: 'By \\cite{g}.', bibtex: '@misc{k, author={Doe, Jane}, title={Own}}' });
  const { tex, lines } = P.previewMain(d, cat, { g: { type: 'book', title: 'Global', year: '2000' } });
  const all = tex.split('\n');
  assert.equal(all[0], '\\begin{document}');
  assert.equal(all[1], '\\bankproblem{1}{Cubes \\& squares}{Putnam 1989, A3}{new}');
  assert.equal(all[2], '\\bankmethods{Induction}');
  assert.ok(!tex.includes('tikzpicture'));
  assert.ok(tex.includes(T.FIGURE_PLACEHOLDER));
  assert.equal(all[lines.statement[0] - 1], 'Look [1]:');
  assert.equal(all[lines.statement[0] - 1 + 4], '\\foo', 'line 5 of the statement is still line 5');
  assert.ok(tex.includes('\\refitem{1} Jane Doe, \\emph{Own},'));
  assert.equal(all[lines.solution[0] - 1], 'By [2].');
  assert.ok(tex.includes('\\refitem{2} \\emph{Global}, 2000.'));
  assert.ok(tex.endsWith('\\end{solution}\n\\end{document}\n'));
  assert.ok(P.previewMain(draft(), cat).tex.includes('\\end{problem}\n\\banknosolution\n\\end{document}'));
  assert.ok(P.previewMain(draft({ title: 'a{b}\\c' }), cat).tex.includes('\\bankproblem{1}{abc}{}{new}'));
});

test('a TeX error in the log is located in the form', () => {
  const lines = { statement: [5, 9], solution: [12, 14] };
  const log = 'This is pdfTeX\n! Undefined control sequence.\nl.13 \\foo\n          bar\n';
  assert.deepEqual(P.explainLog(log, lines), { message: 'Undefined control sequence.', box: 'solution', line: 2, source: '\\foo', unclosed: false });
  assert.deepEqual(P.explainLog('! LaTeX Error: Environment x undefined.\n\nSee the manual\nl.6 \\begin{x}', lines),
    { message: 'LaTeX Error: Environment x undefined.', box: 'statement', line: 2, source: '\\begin{x}', unclosed: false });
  assert.equal(P.explainLog('all fine', lines), null);
  assert.equal(P.explainLog('! Emergency stop.\nl.2 \\bankproblem', lines).box, null);
});

test('an unclosed $, { or environment points at its box, not at the page\'s own \\end{problem}', () => {
  const d = draft({ statement: 'First line\nx $a', solution: 'Sol \\textbf{b' });
  const { tex, lines } = P.previewMain(d, cat);
  const all = tex.split('\n');
  assert.equal(all[lines.statement[3] - 1], '\\end{problem}');
  assert.equal(all[lines.solution[3] - 1], '\\end{solution}');
  // pdflatex's log for these three mistakes (the l.N line is the page's \end{problem} / \end{solution}, or missing)
  const dollar = P.explainLog(`! Missing $ inserted.\n<inserted text> \n                $\nl.${lines.statement[3]} \\end{problem}\n`, lines, d);
  assert.deepEqual(dollar, { message: 'Missing $ inserted.', box: 'statement', line: null, source: '', unclosed: true });
  const env = P.explainLog(`! LaTeX Error: \\begin{itemize} on input line ${lines.statement[0] + 1} ended by \\end{problem}.\n\nSee the LaTeX manual\n\nl.${lines.statement[3]} \\end{problem}\n`, lines, d);
  assert.deepEqual(env, { message: 'LaTeX Error: \\begin{itemize} ended by \\end{problem}.', box: 'statement', line: 2, source: '', unclosed: true });
  const brace = P.explainLog('! File ended while scanning use of \\textbf .\n<inserted text> \n                \\par \n<*> main.tex\n', lines, d);
  assert.deepEqual([brace.box, brace.line, brace.unclosed], ['solution', null, true]);
  assert.equal(P.explainLog('! File ended while scanning use of \\textbf .\n<*> main.tex\n', lines, draft({ statement: '\\{ 50\\% {a} % {' })).box, null,
    'balanced braces: no guess');
  assert.equal(P.explainLog('! Font lmbsy10 at 657 not found.\n', lines, d).box, null, 'other errors without a line: no guess');
});

test('GitHub new-file link (the Edit links are bank-search.js::githubEditUrl)', () => {
  const gh = { repo: 'math-olympiad-club-ethz/math-olympiad-club-ethz', branch: 'main', problemsPath: 'problem-bank/problems' };
  assert.equal(P.githubNewFileUrl(gh, 'new-sum-of-two-cubes.tex'),
    'https://github.com/math-olympiad-club-ethz/math-olympiad-club-ethz/new/main/problem-bank/problems?filename=new-sum-of-two-cubes.tex');
});

test('figures: top-level tikzpicture / tikzcd spans, nested ones inside', () => {
  const tex = 'a\\begin{tikzpicture}x\\begin{tikzcd}y\\end{tikzcd}\\end{tikzpicture}b\\begin{tikzcd}\nz\n\\end{tikzcd}';
  assert.equal(T.findFigures(tex).length, 2);
  const r = T.placeholderFigures(tex);
  assert.equal(r.figures, 2);
  assert.equal(r.tex.split('\n').length, tex.split('\n').length);
  assert.ok(r.tex.startsWith('a' + T.FIGURE_PLACEHOLDER + 'b%\n%\n' + T.FIGURE_PLACEHOLDER));
  // a diagram in display math: no empty line (= \par, fatal in math) where the figure ended
  const disp = T.placeholderFigures('Consider\n\\[\n\\begin{tikzcd}\nA \\arrow[r] & B\n\\end{tikzcd}\n\\]\nok').tex;
  assert.equal(disp, 'Consider\n\\[\n%\n%\n' + T.FIGURE_PLACEHOLDER + '\n\\]\nok');
  assert.ok(!disp.split('\n').some(l => l === ''));
});

test('titles and origin numbers: only characters the PDF headings can print', () => {
  assert.deepEqual(P.unprintable('Euler φ sums – Ωmega, naïve Łódź'), []);
  assert.deepEqual(P.unprintable('√2 ≤ π^2'), ['^', '\u221a', '\u2264']);
  const f = o => P.validateDraft(draft(o), cat).map(e => e.field);
  assert.deepEqual(f({ title: '√2 is irrational' }), ['title']);
  assert.deepEqual(f({ title: 'Euler φ sums' }), []);
  assert.deepEqual(f({ originNumber: 'A^2' }), ['originNumber']);
  assert.deepEqual(f({ originNumber: 'Problem 6, Day 2' }), []);
});

test('checks: spaced \\end {document}, bibliography commands, the Bibliography box', () => {
  const msgs = (o) => P.validateDraft(draft(o), cat).map(e => e.field + ': ' + e.message).join('\n');
  assert.match(msgs({ statement: 'A \\end {problem}\\end {document}' }), /statement: Statement, line 1: remove \\end \{problem\}/);
  assert.match(msgs({ statement: 'A \\end {problem}\\end {document}' }), /\\end\{document\} cannot be used/);
  assert.match(msgs({ statement: 'A\n\\bibliography{references}' }), /line 2: remove \\bibliography/);
  assert.match(msgs({ solution: '\\addbibresource{x.bib}' }), /solution: .*remove \\addbibresource/);
  // BibTeX fields are printed in the reference list: the same LaTeX rules apply to them
  assert.match(msgs({ statement: 'See \\cite{b1}.', bibtex: '@misc{b1,\n title = {Why not \\usepackage{tikz}}}' }), /bibtex: Bibliography, line 2: \\usepackage cannot be used/);
  assert.match(msgs({ bibtex: '@misc{b1, title = {Drawing \\tikz here}}' }), /bibtex: .*\\tikz cannot be used/);
  assert.equal(msgs({ statement: 'See \\cite{b1}.', bibtex: '@misc{b1, title = {On a theorem of {Euler}}, doi = {10.1/a_b}}' }), '');
  assert.match(msgs({ bibtex: '@misc{a, title={x}}\n\\end {bibentries}' }), /bibtex: Remove/);
});

test('preview: error lines count from the top of the box (leading blank lines, dropped \\nocite lines); reference lists map to the Bibliography box', () => {
  const { tex, lines } = P.previewMain(draft({ statement: '\n\nFirst\n\\nocite{x}\nB \\bad', bibtex: '@misc{k, title={K_x}}', solution: 'S \\cite{k}' }), cat, {});
  const all = tex.split('\n');
  const at = (key, boxLine) => lines[key][0] + boxLine - 1 - lines[key][2];      // main.tex line of a textarea line
  assert.equal(all[at('statement', 5) - 1], 'B \\bad');
  assert.deepEqual(P.explainLog(`! Undefined control sequence.\nl.${at('statement', 5)} B \\bad`, lines).line, 5);
  const refLine = lines.refs[0][0];
  assert.match(all[refLine - 1], /problemreferences/);
  assert.equal(P.explainLog(`! Missing $ inserted.\nl.${refLine + 1} \\refitem{1}`, lines).box, 'bibtex');
});

test('preview: a \\cite spread over lines keeps the line numbers after it', () => {
  const st = 'By \\cite[Theorem 3.2 and\nLemma 4]{a,\nb} we get\n\\undefinedZ here.';
  const { tex, lines } = P.previewMain(draft({ statement: st }), cat, { a: { title: 'A' }, b: { title: 'B' } });
  const n = lines.statement[0] + 3;                                   // textarea line 4
  assert.equal(tex.split('\n')[n - 1], '\\undefinedZ here.');
  assert.equal(P.explainLog(`! Undefined control sequence.\nl.${n} \\undefinedZ`, lines).line, 4);
  assert.match(tex, /By %\n%\n\[1, 2, Theorem 3\.2 and Lemma 4\] we get/);          // 2 line breaks moved in front
});

test('checks: TeX that would reach beyond the problem (other problems of a PDF, files, dates, the page layout)', () => {
  const msgs = o => P.validateDraft(draft(o), cat).map(e => `${e.field}: ${e.message}`).join('\n');
  assert.match(msgs({ statement: 'A\n\\def\\x{1}' }), /^statement: Statement, line 2: \\def cannot be used: it could change the other problems/m);
  assert.match(msgs({ statement: 'x % \\gdef\\y{2}' }), /\\gdef cannot be used/, 'comments count too (like CI)');
  assert.match(msgs({ solution: '\\begin align' }), /^solution: Solution, line 1: write the environment name in braces right after \\begin/m);
  assert.match(msgs({ statement: '\\newtheorem{claim}{Claim}' }), /\\newtheorem cannot be used: it defines a name for the whole PDF/);
  assert.match(msgs({ statement: '\\input{../x}' }), /\\input cannot be used: a problem is one self-contained text/);
  assert.match(msgs({ statement: '\\today' }), /\\today cannot be used/);
  assert.match(msgs({ statement: '\\bankmethods{x}' }), /\\bankmethods cannot be used: it belongs to the website's PDF layout/);
  assert.match(msgs({ statement: '\\citeauthor{k}', bibtex: '@misc{k, title={K}}' }), /\\citeauthor is not supported on the website/);
  assert.match(msgs({ bibtex: '@misc{k, note = {\\def\\a{}}}' }), /^bibtex: Bibliography, line 1: \\def cannot be used/m);
  assert.match(msgs({ statement: 'By \\ref{lem}.', solution: '\\label{lem}' }), /^statement: Statement, line 1: "lem" is labelled in the solution/m);
  assert.match(msgs({ area: ['primes', 'primes'] }), /^area: primes is chosen twice/m);
  // fine: \newcommand, \times, \left, spaced \begin {align*}, \cite*, a reference inside a comment, a label in the statement
  assert.equal(msgs({ statement: '\\newcommand{\\x}{1} $a \\times \\left( b \\right)$ \\begin {align*} x \\end{align*} \\cite*{k} % \\ref{lem}',
    solution: '\\label{lem} \\ref{lem}', bibtex: '@misc{k, title={K}}' }), '');
  assert.equal(msgs({ statement: '\\label{s} \\ref{s}', solution: '\\label{s}' }), '');
  assert.match(msgs({ statement: '% \\label{s}\n\\ref{s}', solution: '\\label{s}' }), /line 2: "s" is labelled in the solution/, 'a commented-out label does not count');
});

test('BibTeX keys and fields are trimmed with Python\'s whitespace (CI reads the file with Python)', () => {
  // Python's str.strip() removes U+001C-U+001F and U+0085 but not U+FEFF; JS trim() does the opposite
  assert.deepEqual(T.parseBibEntries('@misc{k\u001f, title={x}} @misc{\u0085j\ufeff, title = {a\u001eb\ufeffc}}').map(([k, f]) => [k, f.title]),
    [['k', 'x'], ['j\ufeff', 'a b\ufeffc']]);
  assert.deepEqual(T.citeKeys('\\cite{k\u001f, \u3000j} \\cite{i\ufeff}'), ['k', 'j', 'i\ufeff']);
  assert.deepEqual(P.validateDraft(draft({ statement: 'See \\cite{k}.', bibtex: '@misc{k\u001f, title={x}}' }), cat, []), []);
  assert.deepEqual(fields(P.validateDraft(draft({ statement: 'See \\cite{k}.', bibtex: '@misc{k\ufeff, title={x}}' }), cat, [])), ['statement'],
    'a key ending in U+FEFF is not k (for CI either)');
});

test('many unclosed \\cite[ stay fast (the optional notes are bounded)', () => {
  const t0 = performance.now();
  const d = draft({ statement: 'x \\cite['.repeat(20000) + ' \\cite{k}', bibtex: '@misc{k, title={K}}' });   // no ] after them
  P.validateDraft(d, cat, []);
  P.previewMain(d, cat);
  assert.ok(performance.now() - t0 < 2000, `took ${Math.round(performance.now() - t0)} ms`);
  assert.deepEqual(T.citeKeys('\\cite[p.~3][see]{a} \\cite[' + 'x'.repeat(300) + ']{b} \\cite[' + 'x'.repeat(301) + ']{c}'), ['a', 'b']);
});

test('no regex lookbehind in the page scripts (Safari before 16.4 cannot parse it: the whole page would fail)', () => {
  const dir = new URL('../../site/static/js/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) assert.ok(!/\(\?<[!=]/.test(readFileSync(new URL(f, dir), 'utf8')), f);
});
