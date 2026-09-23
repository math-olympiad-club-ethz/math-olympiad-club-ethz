// Unit tests of the search logic (node --test).  No dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../../site/static/js/bank-search.js';

// a small catalogue in the shape of tags.json
const tagsJson = {
  area: [
    { slug: 'analysis', name: 'Analysis', description: 'Real and complex analysis.', aliases: ['calculus'], parent: null, children: ['real-analysis'], depth: 1 },
    { slug: 'real-analysis', name: 'Real analysis', description: '', aliases: [], parent: 'analysis', children: ['sequences', 'series'], depth: 2 },
    { slug: 'sequences', name: 'Sequences & recursive sequences', description: 'Limits of sequences.', aliases: ['sequence'], parent: 'real-analysis', children: [], depth: 3 },
    { slug: 'series', name: 'Series', description: 'Infinite series.', aliases: ['infinite sum'], parent: 'real-analysis', children: [], depth: 3 },
    { slug: 'algebra', name: 'Algebra', description: 'Groups, rings, fields.', aliases: ['abstract algebra'], parent: null, children: ['group-theory'], depth: 1 },
    { slug: 'group-theory', name: 'Group theory', description: 'Groups and subgroups.', aliases: [], parent: 'algebra', children: [], depth: 2 },
    { slug: 'linear-algebra', name: 'Linear algebra', description: 'Matrices.', aliases: ['matrix', 'matrices'], parent: null, children: [], depth: 1 },
    { slug: 'number-theory', name: 'Number theory', description: 'Integers.', aliases: ['nt'], parent: null, children: ['congruences'], depth: 1 },
    { slug: 'congruences', name: 'Congruences & modular arithmetic', description: '', aliases: ['modular arithmetic', 'mod'], parent: 'number-theory', children: [], depth: 2 },
  ],
  methods: [
    { slug: 'induction', name: 'Induction', description: 'Proof by induction.', aliases: ['inductive proof'], group: 'Proof strategies' },
    { slug: 'pigeonhole', name: 'Pigeonhole principle', description: '', aliases: ['php', 'dirichlet principle'], group: 'Proof strategies' },
    { slug: 'am-gm', name: 'AM–GM inequality', description: '', aliases: ['am-gm', 'amgm'], group: 'Inequalities' },
  ],
  difficulty: [
    { slug: 'easy', name: 'Easy', description: 'IMC P1–2', aliases: [] }, { slug: 'medium', name: 'Medium', description: '', aliases: [] },
    { slug: 'hard', name: 'Hard', description: '', aliases: [] }, { slug: 'extreme', name: 'Extreme', description: '', aliases: [] },
  ],
  origin: [
    { slug: 'imc', name: 'IMC', description: 'International Mathematics Competition', aliases: ['international mathematics competition'], kind: 'university' },
    { slug: 'putnam', name: 'Putnam', description: '', aliases: ['william lowell putnam'], kind: 'university' },
    { slug: 'imo', name: 'IMO', description: '', aliases: [], kind: 'high-school' },
  ],
};
const cat = S.buildCatalogue(tagsJson);
const P = (id, o = {}) => ({ id, title: `P${id}`, area: [], methods: [], difficulty: 'unrated', difficultySource: '', origin: '', alsoIn: [], originDate: '', originYear: null, hasSolution: false, partial: false, solved: false, review: 'human', ...o });
const problems = [
  P(1, { area: ['sequences'], methods: ['induction'], difficulty: 'easy', origin: 'imc', originYear: 2012, solved: true, hasSolution: true }),
  P(2, { area: ['series', 'congruences'], methods: ['induction', 'pigeonhole'], difficulty: 'hard', origin: 'putnam', alsoIn: ['imo'], originYear: 1989, solved: true, hasSolution: true }),
  P(3, { area: ['group-theory'], methods: [], difficulty: 'medium', origin: '', originYear: null, hasSolution: true, partial: true, solved: false }),
  P(4, { area: ['linear-algebra'], methods: ['am-gm'], difficulty: 'unrated', origin: 'imo', originYear: 2025, hasSolution: false, solved: false }),
];
const f = (o) => ({ ...S.emptyFilters(), ...o });

test('tree: selecting a node matches all its descendants', () => {
  assert.deepEqual(S.areaDescendants(cat, 'analysis').sort(), ['analysis', 'real-analysis', 'sequences', 'series']);
  assert.deepEqual(S.filterProblems(problems, f({ area: ['analysis'] }), cat).map(p => p.id), [1, 2]);
  assert.deepEqual(S.filterProblems(problems, f({ area: ['real-analysis'] }), cat).map(p => p.id), [1, 2]);
  assert.deepEqual(S.filterProblems(problems, f({ area: ['sequences'] }), cat).map(p => p.id), [1]);
});

test('empty filter lists every problem, in ID order', () => {
  const shuffled = [problems[2], problems[0], problems[3], problems[1]];
  assert.deepEqual(S.filterProblems(shuffled, f({}), cat).map(p => p.id), [1, 2, 3, 4]);
  assert.deepEqual(S.sortProblems(shuffled).map(p => p.id), [1, 2, 3, 4]);
});

test('AND/OR applies to Area + Methods only', () => {
  assert.deepEqual(S.filterProblems(problems, f({ area: ['series'], methods: ['induction'] }), cat).map(p => p.id), [2]);
  assert.deepEqual(S.filterProblems(problems, f({ area: ['series'], methods: ['induction'], op: 'or' }), cat).map(p => p.id), [1, 2]);
  assert.deepEqual(S.filterProblems(problems, f({ area: ['sequences', 'series'] }), cat).map(p => p.id), []);        // AND across two areas
  assert.deepEqual(S.filterProblems(problems, f({ area: ['sequences', 'series'], op: 'or' }), cat).map(p => p.id), [1, 2]);
});

test('difficulty and origin are always "any of the selected", combined with AND to the rest', () => {
  assert.deepEqual(S.filterProblems(problems, f({ difficulty: ['easy', 'hard'] }), cat).map(p => p.id), [1, 2]);
  assert.deepEqual(S.filterProblems(problems, f({ origin: ['imo'] }), cat).map(p => p.id), [2, 4]);     // also-in counts
  assert.deepEqual(S.filterProblems(problems, f({ origin: ['imo'], difficulty: ['hard'] }), cat).map(p => p.id), [2]);
  assert.deepEqual(S.filterProblems(problems, f({ area: ['analysis'], op: 'or', origin: ['imc'] }), cat).map(p => p.id), [1]);
});

test('unrated problems match only when no difficulty is selected', () => {
  assert.ok(S.matches(problems[3], f({}), cat));
  assert.ok(!S.matches(problems[3], f({ difficulty: ['easy', 'medium', 'hard', 'extreme'] }), cat));
});

test('origin-year range; an old link with an ID range (id=) is ignored', () => {
  assert.deepEqual(S.decodeState('id=2-3', cat).filters, S.emptyFilters());     // the ID means nothing to visitors
  assert.deepEqual(S.filterProblems(problems, f({ yearFrom: 2000 }), cat).map(p => p.id), [1, 4]);
  assert.deepEqual(S.filterProblems(problems, f({ yearFrom: 1980, yearTo: 1990 }), cat).map(p => p.id), [2]);
  assert.ok(!S.matches(problems[2], f({ yearTo: 3000 }), cat), 'undated problem never matches a year range');
});

test('solutions filter: full / partial / no solution / all (the words of the row markers)', () => {
  assert.deepEqual(S.filterProblems(problems, f({ solved: 'full' }), cat).map(p => p.id), [1, 2]);
  assert.deepEqual(S.filterProblems(problems, f({ solved: 'partial' }), cat).map(p => p.id), [3]);
  assert.deepEqual(S.filterProblems(problems, f({ solved: 'none' }), cat).map(p => p.id), [4]);
  assert.deepEqual(S.filterProblems(problems, f({ solved: 'all' }), cat).length, 4);
});

test('suggestions: names, slugs, descriptions and aliases; children of a matching area; selected tags excluded', () => {
  const names = q => S.suggest(cat, q).map(s => s.tag.name);
  assert.deepEqual(names('abstract algebra'), ['Algebra', 'Group theory']);
  assert.deepEqual(names('algeb').slice(0, 2), ['Algebra', 'Linear algebra']);
  assert.ok(names('algeb').includes('Group theory'));
  assert.ok(names('matrix').includes('Linear algebra'));
  assert.ok(names('modular').includes('Congruences & modular arithmetic'));
  assert.ok(names('php').includes('Pigeonhole principle'));
  assert.ok(names('AM-GM').includes('AM–GM inequality'));
  assert.ok(names('international').includes('IMC'));
  assert.ok(names('infinite series').includes('Series'));
  assert.deepEqual(names(''), []);
  assert.ok(!S.suggest(cat, 'algebra', f({ area: ['algebra'] })).map(s => s.tag.slug).includes('algebra'));
});

test('the search bar text matches titles only', () => {
  const list = [P(7, { title: 'Fermat point of a triangle' }), P(12, { title: 'Roots on the unit circle' }), P(142, { title: 'The inekoalaty game' })];
  const titles = (q) => S.filterProblems(list, f({ text: q }), cat).map(p => p.id);
  assert.deepEqual(titles(''), [7, 12, 142]);                      // no text = no filtering
  assert.deepEqual(titles('fermat'), [7]);
  assert.deepEqual(titles('FERM'), [7]);                           // case and prefixes
  assert.deepEqual(titles('unit circle'), [12]);                   // every word must match
  assert.deepEqual(titles('circle unit'), [12]);                   // in any order
  assert.deepEqual(titles('circle fermat'), []);
  assert.deepEqual(titles('0007'), []);                            // the ID is never searched
  assert.deepEqual(titles('142'), []);
  assert.ok(S.matchesText(P(9, { title: 'Cyclic equation for 2024 reals' }), '2024'));   // numbers in the title count
  assert.deepEqual(titles('inekoalaty'), [142]);
  assert.deepEqual(titles('nothing here'), []);
  assert.ok(S.matchesText(P(1, { title: 'Sums of two cubes' }), 'cube'));        // a prefix of a word
  assert.ok(!S.matchesText(P(1, { title: 'Sums of two cubes' }), 'cubed'));      // not the other way round
});

test('URL state round-trips and drops unknown slugs', () => {
  const filters = f({ area: ['series'], methods: ['induction'], difficulty: ['hard'], origin: ['putnam'], text: 'unit circle', op: 'or', showMethods: true, yearFrom: null, yearTo: 2000, solved: 'none' });
  const sel = [3, 1, 2, 7, 9, 10, 11];
  const qs = S.encodeState(filters, sel);
  const back = S.decodeState(qs, cat);
  assert.deepEqual(back.filters, filters);
  assert.deepEqual(back.selection, [1, 2, 3, 7, 9, 10, 11]);
  assert.equal(S.encodeState(S.emptyFilters(), []), '');
  assert.deepEqual(S.decodeState('?a=series,nope&d=hard&x=1&sel=abc,4', cat), { filters: f({ area: ['series'], difficulty: ['hard'] }), selection: [4], order: null });
  assert.deepEqual(S.decodeState('', cat).filters, S.emptyFilters());
});

test('suggestions can be limited to some tag types', () => {
  assert.deepEqual(S.suggest(cat, 'algebra', S.emptyFilters(), 12, ['area']).map(s => s.tag.type).filter(t => t !== 'area'), []);
  assert.deepEqual(S.suggest(cat, 'induc', S.emptyFilters(), 12, ['methods']).map(s => s.tag.slug), ['induction']);
  assert.deepEqual(S.suggest(cat, 'induc', S.emptyFilters(), 12, ['area']), []);
});

test('automatic PDF order: difficulty (unrated last), then top-level area in tags.yml order (first area), then ID', () => {
  const Q = (id, difficulty, area) => ({ ...P(id), difficulty, area });
  const rows = [Q(10, 'hard', ['group-theory']), Q(11, 'easy', ['number-theory']), Q(12, 'easy', ['series', 'algebra']),
    Q(13, 'unrated', ['analysis']), Q(14, 'easy', ['congruences']), Q(15, 'medium', []), Q(16, 'extreme', ['sequences']),
    Q(17, 'easy', ['linear-algebra']), Q(9, 'easy', ['real-analysis'])];
  const byId = new Map(rows.map(r => [r.id, r]));
  // roots in tags.json order: analysis, algebra, linear-algebra, number-theory
  assert.deepEqual(S.autoOrder([10, 11, 12, 13, 14, 15, 16, 17, 9], byId, cat), [9, 12, 17, 11, 14, 15, 10, 16, 13]);
  assert.deepEqual(S.autoOrder([13, 13, 9], byId, cat), [9, 13]);                   // repeats dropped
  assert.deepEqual(S.autoOrder([99, 9], byId, cat), [9, 99]);                       // unknown IDs last
});

test('ordered ID lists: runs of 3+ become ranges, the order is kept', () => {
  assert.equal(S.formatIdList([7, 3, 4, 5, 1, 9, 10]), '7,3-5,1,9,10');
  assert.deepEqual(S.parseIdList('7,3-5,1,9,10,3'), [7, 3, 4, 5, 1, 9, 10]);
  assert.deepEqual(S.parseIdList(S.formatIdList([5, 4, 3, 2, 1])), [5, 4, 3, 2, 1]);
});

test('URL state: a hand-made PDF order round-trips; without ord=manual the order is automatic', () => {
  const qs = S.encodeState(f({ area: ['series'] }), [1, 2, 3, 4, 9], [9, 1, 2, 3, 4]);
  assert.equal(qs, 'a=series&sel=9,1-4&ord=manual');
  const back = S.decodeState(qs, cat);
  assert.deepEqual(back.order, [9, 1, 2, 3, 4]);
  assert.deepEqual(back.selection, [1, 2, 3, 4, 9]);
  assert.equal(S.decodeState('sel=9,1-4', cat).order, null);
  assert.deepEqual(S.decodeState('sel=9,1-4', cat).selection, [1, 2, 3, 4, 9]);
  assert.equal(S.encodeState(S.emptyFilters(), [3, 1], null), 'sel=1,3');
});

test('URL lists are capped: a crafted ?sel= cannot freeze the page', () => {
  const huge = Array.from({ length: 200 }, (_, i) => `${i * 100000}-${i * 100000 + 99999}`).join(',');
  const t0 = Date.now();
  assert.ok(S.parseRanges(huge).length <= 10000);
  assert.ok(S.parseIdList(huge).length <= 10000);
  assert.ok(S.decodeState('sel=' + huge + '&ord=manual').order.length <= 10000);
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(S.parseIdList('9007199254740992-9007199254740993,5,99999999999999999999'), [5]);   // past 2^53 k++ would never end
});

test('range formatting', () => {
  assert.equal(S.formatRanges([1, 2, 3, 5, 7, 8, 8]), '1-3,5,7,8');
  assert.deepEqual(S.parseRanges('1-3, 5,7-8'), [1, 2, 3, 5, 7, 8]);
  assert.deepEqual(S.parseRanges('9-3'), [3, 4, 5, 6, 7, 8, 9]);           // a range written backwards still counts
  assert.deepEqual(S.parseIdList('5-3,9'), [5, 4, 3, 9]);                 // and keeps its order in a hand-made order
});

test('describeFilters: plain text only, methods only when shown', () => {
  assert.equal(S.describeFilters(S.emptyFilters(), cat), 'no filter (all problems)');
  assert.equal(S.describeFilters(f({ text: 'fermat', difficulty: ['hard'] }), cat), 'Title: fermat · Difficulty: Hard');
  assert.equal(S.describeFilters(f({ area: ['series'], methods: ['induction'], op: 'or', difficulty: ['hard'] }), cat),
    'Area: Series; Methods: hidden (any of) · Difficulty: Hard');                // methods are spoilers
  assert.equal(S.describeFilters(f({ methods: ['induction'], showMethods: true }), cat), 'Methods: Induction');
  // typed text never reaches LaTeX raw: \ { } ^ ~ $ # emoji and non-Latin letters are dropped
  assert.equal(S.describeFilters(f({ text: 'x^2 \\input{a} ~$#_ 🙂 Ωмега' }), cat), 'Title: x 2 input a');
  assert.equal(S.describeFilters(f({ text: '^{}🙂' }), cat), 'no filter (all problems)');
});

test('symbols-only queries filter nothing and stay out of the URL; letters of any script are searchable', () => {
  assert.equal(S.normalize('∑ ^ {}'), '');
  assert.equal(S.normalize('Erdős–Ginzburg'), 'erdos ginzburg');
  assert.equal(S.normalize('φ(n) = n−1'), 'φ n n 1');
  assert.equal(S.encodeState(f({ text: '∑' }), []), '');
  assert.equal(S.encodeState(f({ text: 'φ' }), []), 'q=%CF%86');
  assert.ok(S.matchesText(P(1, { title: 'Euler φ and primes' }), 'φ'));
  assert.ok(!S.matchesText(P(1, { title: 'Sums of two cubes' }), 'φ'));
  const greek = S.buildCatalogue({ ...tagsJson, area: [...tagsJson.area, { slug: 'arith', name: 'Arithmetic functions (φ, σ)', description: '', aliases: [], parent: 'number-theory', children: [], depth: 2 }] });
  assert.ok(S.suggest(greek, 'φ').map(s => s.tag.slug).includes('arith'));
});

test('year range: written backwards it still counts; a huge year in the URL is dropped', () => {
  assert.deepEqual(S.filterProblems(problems, f({ yearFrom: 1990, yearTo: 1980 }), cat).map(p => p.id), [2]);
  assert.deepEqual(S.decodeState('y=' + '9'.repeat(400) + '-2000', cat).filters.yearFrom, null);
  assert.equal(S.decodeState('y=' + '9'.repeat(400) + '-2000', cat).filters.yearTo, 2000);
});

test('tag counts: areas count their descendants, origins count also-in', () => {
  const c = S.tagCounts(problems, cat);
  assert.equal(c.get('area:analysis'), 2);               // P1 (sequences) and P2 (series): once each
  assert.equal(c.get('area:real-analysis'), 2);
  assert.equal(c.get('area:number-theory'), 1);
  assert.equal(c.get('area:group-theory'), 1);
  assert.equal(c.get('methods:induction'), 2);
  assert.equal(c.get('origin:imo'), 2);                   // P4, and P2 through also-in
  assert.equal(c.get('difficulty:unrated'), 1);
  assert.equal(c.get('methods:nope'), undefined);
  for (const [key, n] of c) {                             // the same number as the filter gives
    const [type, slug] = key.split(':');
    if (type !== 'difficulty' || slug !== 'unrated') assert.equal(S.filterProblems(problems, f({ [type]: [slug] }), cat).length, n, key);
  }
});

test('GitHub edit link of a problem file', () => {
  assert.equal(S.githubEditUrl({ repo: 'o/r', branch: 'main', problemsPath: 'problem-bank/problems' }, '0001-a b.tex'),
    'https://github.com/o/r/edit/main/problem-bank/problems/0001-a%20b.tex');
});

test('the real tags.json catalogue from the build loads and is consistent', () => {
  let json;
  try { json = JSON.parse(readFileSync(new URL('../../site/static/bank/tags.json', import.meta.url), 'utf8')); } catch (e) { return; }  // not built yet
  const real = S.buildCatalogue(json);
  assert.ok(real.byType.area.size >= 100 && real.byType.methods.size >= 60 && real.byType.difficulty.size === 4 && real.byType.origin.size >= 30);
  for (const [slug, t] of real.byType.area) { for (const c of t.children) assert.equal(real.byType.area.get(c).parent, slug); assert.ok(t.depth <= 3); }
  assert.ok(S.suggest(real, 'abstract algebra').map(s => s.tag.slug).includes('algebra'));
  assert.ok(S.suggest(real, 'lte').map(s => s.tag.slug).includes('lte'));
});
