/* bank-search.js — the problem bank's search logic.  Pure functions, no DOM, no fetch:
   the same file is used by the page (as an ES module) and by the unit tests (node:test).

   Data shapes (produced by build.py):
     tags.json   {area:[{slug,name,description,aliases,parent,children,depth}], methods:[{…,group}],
                  difficulty:[…], origin:[{…,kind}]}
     index.json  {preview, count, problems:[{id,title,file,area:[],methods:[],difficulty,difficultySource,
                  origin,alsoIn:[],originDate,originYear,originLabel,hasSolution,partial,solved,review,provisional}]}
*/

export const TAG_TYPES = ['area', 'methods', 'difficulty', 'origin'];
export const TYPE_LABEL = { area: 'Area', methods: 'Methods', difficulty: 'Difficulty', origin: 'Origin' };

export const DEFAULT_FILTERS = Object.freeze({
  area: [], methods: [], difficulty: [], origin: [],
  text: '',             // what is typed in the search bar: matches the title
  op: 'and',            // AND/OR — applies to Area + Methods only
  showMethods: false,   // methods are spoilers: hidden by default in the list and the PDFs
  yearFrom: null, yearTo: null,   // origin-date range (years)
  solved: 'all',        // 'all' | 'full' | 'partial' | 'none' (solution), the words of the row markers
});

export function emptyFilters() {
  return { ...DEFAULT_FILTERS, area: [], methods: [], difficulty: [], origin: [] };
}

/* ------------------------------------------------------------------ catalogue */

export function buildCatalogue(tagsJson) {
  const byType = {};
  const all = [];
  for (const type of TAG_TYPES) {
    const map = new Map();
    for (const t of tagsJson[type] || []) {
      const tag = { ...t, type };
      tag.searchText = tagSearchWords(tag);
      map.set(t.slug, tag);
      all.push(tag);
    }
    byType[type] = map;
  }
  // area descendants (a node matches itself and every descendant)
  const desc = new Map();
  const walk = (slug) => {
    if (desc.has(slug)) return desc.get(slug);
    const set = new Set([slug]);
    const node = byType.area.get(slug);
    for (const c of (node && node.children) || []) for (const s of walk(c)) set.add(s);
    desc.set(slug, set);
    return set;
  };
  for (const slug of byType.area.keys()) walk(slug);
  // ancestors, for suggestions ("algeb" also proposes the children of Algebra) and for display paths
  const ancestors = new Map();
  for (const [slug, node] of byType.area) {
    const path = [];
    let p = node.parent;
    while (p) { path.unshift(p); p = (byType.area.get(p) || {}).parent; }
    ancestors.set(slug, path);
  }
  return { byType, all, desc, ancestors };
}

export function areaDescendants(cat, slug) {
  return Array.from(cat.desc.get(slug) || [slug]);
}

export function getTag(cat, type, slug) {
  const m = cat.byType[type];
  return m ? m.get(slug) || null : null;
}

export function areaPath(cat, slug) {
  return [...(cat.ancestors.get(slug) || []), slug].map(s => cat.byType.area.get(s)).filter(Boolean).map(t => t.name).join(' › ');
}

/* ------------------------------------------------------------------ matching */

function problemHasTag(problem, type, slug, cat) {
  if (type === 'area') {
    const set = cat.desc.get(slug);
    return set ? problem.area.some(a => set.has(a)) : problem.area.includes(slug);
  }
  if (type === 'methods') return problem.methods.includes(slug);
  return false;
}

/* Does the text typed in the search bar match this problem?  Every typed word must start a word of the title.
   Titles are the only text here: the statements are not in index.json (they are loaded only when a PDF is built),
   and the problem's ID is never searched or shown (it means nothing to visitors).  '' matches everything. */
export function matchesText(problem, query) {
  const q = normalize(query);
  if (!q) return true;
  const title = words(problem.title);
  return q.split(' ').filter(Boolean).every(w => title.some(t => t.startsWith(w)));
}

/* match = [title text] ∧ [Area+Methods: AND → every selected tag | OR → at least one]
         ∧ [difficulty ∈ selected, or any if none] ∧ [origin ∈ selected (origin or also-in), or any if none]
         ∧ [origin-year range] ∧ [full / partial / no solution / all]                                               */
export function matches(problem, filters, cat) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  if (!matchesText(problem, f.text)) return false;
  const sel = [...f.area.map(s => ['area', s]), ...f.methods.map(s => ['methods', s])];
  if (sel.length) {
    const hits = sel.map(([type, slug]) => problemHasTag(problem, type, slug, cat));
    if (f.op === 'or' ? !hits.some(Boolean) : !hits.every(Boolean)) return false;
  }
  if (f.difficulty.length && !f.difficulty.includes(problem.difficulty)) return false;   // unrated never matches a selection
  if (f.origin.length) {
    const ok = f.origin.includes(problem.origin) || (problem.alsoIn || []).some(o => f.origin.includes(o));
    if (!ok) return false;
  }
  if (f.yearFrom != null || f.yearTo != null) {
    const y = problem.originYear;
    if (y == null) return false;                       // undated problems match only when no year range is set
    const [from, to] = f.yearFrom != null && f.yearTo != null && f.yearFrom > f.yearTo ? [f.yearTo, f.yearFrom] : [f.yearFrom, f.yearTo];
    if (from != null && y < from) return false;
    if (to != null && y > to) return false;
  }
  if (f.solved === 'full' && !(problem.hasSolution && !problem.partial)) return false;
  if (f.solved === 'partial' && !(problem.hasSolution && problem.partial)) return false;
  if (f.solved === 'none' && problem.hasSolution) return false;
  return true;
}

/* Order of the results list = ID ascending (= order added).  (The PDF order is autoOrder() below.) */
export function sortProblems(list) {
  return [...list].sort((a, b) => a.id - b.id);
}
export function sortIds(ids) {
  return [...new Set(ids.map(Number))].sort((a, b) => a - b);
}

export function filterProblems(problems, filters, cat) {
  return sortProblems(problems.filter(p => matches(p, filters, cat)));
}

/* ------------------------------------------------------------------ suggestions */

/* Lower case, accents dropped, every run of non-letters/digits -> one space.  Letters of any script stay (φ, ø, ß):
   a query of symbols only ('∑', '^') normalizes to '' and filters nothing. */
export function normalize(s) {
  return String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function words(s) { return normalize(s).split(' ').filter(Boolean); }

function tagSearchWords(tag) {
  return {
    name: normalize(tag.name),
    nameWords: words(tag.name),
    slugWords: words(tag.slug),
    aliases: (tag.aliases || []).map(normalize),
    aliasWords: (tag.aliases || []).flatMap(words),
    descWords: words(tag.description),
  };
}

const TYPE_RANK = { area: 0, methods: 1, difficulty: 2, origin: 3 };

/* Score how well `qwords` (normalized query words) match one tag.  0 = no match. */
function scoreTag(tag, q, qwords, cat) {
  const t = tag.searchText;
  if (t.name === q) return 100;
  if (t.aliases.includes(q)) return 92;
  if (t.name.startsWith(q)) return 90;
  if (t.aliases.some(a => a.startsWith(q))) return 80;
  const allIn = (arr) => qwords.every(w => arr.some(x => x.startsWith(w)));
  if (allIn(t.nameWords)) return 70;
  if (allIn(t.aliasWords)) return 62;
  if (allIn(t.slugWords)) return 58;
  if (allIn([...t.nameWords, ...t.aliasWords, ...t.slugWords])) return 50;
  if (allIn(t.descWords)) return 30;
  if (tag.type === 'area') {                       // children of a matching area ("algeb…" → Group theory)
    for (const anc of cat.ancestors.get(tag.slug) || []) {
      const a = cat.byType.area.get(anc);
      if (a && (a.searchText.name.startsWith(q) || a.searchText.aliases.some(x => x.startsWith(q)))) return 20;
    }
  }
  return 0;
}

/* Suggestions for the search bar: matching names, slugs, descriptions and aliases; already-selected tags
   are excluded; `types` limits them to some tag types (e.g. ['area']).  Returns [{tag, score}] best first, at most `limit`. */
export function suggest(cat, query, filters = DEFAULT_FILTERS, limit = 12, types = null) {
  const q = normalize(query);
  if (!q) return [];
  const qwords = q.split(' ').filter(Boolean);
  const selected = new Set(TAG_TYPES.flatMap(type => (filters[type] || []).map(s => type + ':' + s)));
  const out = [];
  for (const tag of cat.all) {
    if (types && !types.includes(tag.type)) continue;
    if (selected.has(tag.type + ':' + tag.slug)) continue;
    const score = scoreTag(tag, q, qwords, cat);
    if (score > 0) out.push({ tag, score });
  }
  out.sort((a, b) => b.score - a.score || TYPE_RANK[a.tag.type] - TYPE_RANK[b.tag.type]
    || (a.tag.depth || 0) - (b.tag.depth || 0) || a.tag.name.localeCompare(b.tag.name));
  return out.slice(0, limit);
}

/* How many problems each tag would give on its own (the numbers next to the tags in the list): an area counts its
   descendants, an origin counts also-in sources, like matches().  Map 'type:slug' -> n; tags with no problem are absent. */
export function tagCounts(problems, cat) {
  const counts = new Map();
  const add = (key) => counts.set(key, (counts.get(key) || 0) + 1);
  for (const p of problems) {
    const areas = new Set();
    for (const a of p.area) { areas.add(a); for (const anc of cat.ancestors.get(a) || []) areas.add(anc); }
    for (const a of areas) add('area:' + a);
    for (const m of new Set(p.methods)) add('methods:' + m);
    if (p.difficulty) add('difficulty:' + p.difficulty);
    for (const o of new Set([p.origin, ...(p.alsoIn || [])].filter(Boolean))) add('origin:' + o);
  }
  return counts;
}

/* The GitHub page that edits a problem file (the Edit link of each row). */
export function githubEditUrl(gh, file) {
  return `https://github.com/${gh.repo}/edit/${gh.branch}/${gh.problemsPath}/${encodeURIComponent(file)}`;
}

/* ------------------------------------------------------------------ selection helpers */

export function formatRanges(ids) {
  const s = [...new Set(ids.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > i + 1 ? `${s[i]}-${s[j]}` : j === i + 1 ? `${s[i]},${s[j]}` : `${s[i]}`);
    i = j + 1;
  }
  return parts.join(',');
}

/* At most this many IDs come out of a URL list: a crafted link cannot make the page build millions of them. */
export const MAX_URL_IDS = 10000;

export function parseRanges(str) {
  return [...new Set(parseIdList(str))].sort((a, b) => a - b);
}

/* An ordered list of IDs, runs of 3+ consecutive increasing IDs written a-b: [7,3,4,5,1] -> "7,3-5,1".
   (formatRanges sorts; this keeps the order.) */
export function formatIdList(ids) {
  const s = uniqueIds(ids);
  const parts = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    if (j >= i + 2) { parts.push(`${s[i]}-${s[j]}`); i = j + 1; } else { parts.push(`${s[i]}`); i += 1; }
  }
  return parts.join(',');
}

/* "7,3-5,1" -> [7, 3, 4, 5, 1]: the written order, repeats dropped; a descending range (5-3) counts down. */
export function parseIdList(str) {
  const out = new Set();
  for (const part of String(str || '').split(',')) {
    if (out.size >= MAX_URL_IDS) break;
    const p = part.trim();
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) continue;       // past 2^53, k++ would stall
      const step = a <= b ? 1 : -1;
      for (let k = a; (step > 0 ? k <= b : k >= b) && out.size < MAX_URL_IDS; k += step) out.add(k);
    } else if (/^\d+$/.test(p) && Number.isSafeInteger(Number(p))) out.add(Number(p));
  }
  return [...out];
}

function uniqueIds(ids) {
  return [...new Set((ids || []).map(Number).filter(Number.isInteger))];
}

/* ------------------------------------------------------------------ PDF order */

/* The automatic order of the ticked problems in the PDFs: increasing difficulty (human, else AI; unrated last),
   ties by area (order of the top-level areas in tags.yml, from the problem's FIRST area), then by ID.
   `byId`: Map id -> index row.  The one place that decides the automatic order. */
export function autoOrder(ids, byId, cat) {
  const diff = new Map([...cat.byType.difficulty.keys()].map((slug, i) => [slug, i]));
  const roots = [...cat.byType.area.values()].filter(t => !t.parent).map(t => t.slug);
  const rootRank = new Map(roots.map((slug, i) => [slug, i]));
  const areaRank = (p) => {
    const a = p && p.area && p.area[0];
    if (!a || !cat.byType.area.has(a)) return roots.length;
    const root = (cat.ancestors.get(a) || [])[0] || a;
    return rootRank.has(root) ? rootRank.get(root) : roots.length;
  };
  const key = (id) => {
    const p = byId.get(id);
    return [p && diff.has(p.difficulty) ? diff.get(p.difficulty) : diff.size, areaRank(p), id];
  };
  return uniqueIds(ids).map(id => ({ id, k: key(id) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2]).map(x => x.id);
}

/* ------------------------------------------------------------------ URL state (shareable) */

function intOrNull(s) { return /^\d+$/.test(s || '') && Number.isSafeInteger(Number(s)) ? Number(s) : null; }

/* filters + selection (+ a hand-made PDF order) → query string (no leading '?').  Defaults are omitted so an empty
   filter gives ''.  With an order, sel lists the IDs in that order and ord=manual says so; without, sel is sorted
   and the PDF uses autoOrder(). */
export function encodeState(filters, selection = [], order = null) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const p = new URLSearchParams();
  if (f.area.length) p.set('a', f.area.join(','));
  if (f.methods.length) p.set('m', f.methods.join(','));
  if (f.difficulty.length) p.set('d', f.difficulty.join(','));
  if (f.origin.length) p.set('o', f.origin.join(','));
  if (normalize(f.text)) p.set('q', f.text);          // symbols only search nothing: not worth a URL
  if (f.op === 'or') p.set('op', 'or');
  if (f.showMethods) p.set('sm', '1');
  if (f.yearFrom != null || f.yearTo != null) p.set('y', `${f.yearFrom ?? ''}-${f.yearTo ?? ''}`);
  if (f.solved !== 'all') p.set('s', f.solved);
  if (order && order.length) { p.set('sel', formatIdList(order)); p.set('ord', 'manual'); }
  else if (selection && selection.length) p.set('sel', formatRanges(selection));
  return p.toString().replace(/%2C/g, ',').replace(/%2D/g, '-');
}

/* query string → {filters, selection, order}.  order = the hand-made PDF order (ord=manual), else null.
   Tolerant: unknown slugs are dropped when a catalogue is given. */
export function decodeState(qs, cat = null) {
  const p = new URLSearchParams(String(qs || '').replace(/^\?/, ''));
  const f = emptyFilters();
  const list = (key, type) => (p.get(key) || '').split(',').map(s => s.trim()).filter(Boolean)
    .filter(s => !cat || cat.byType[type].has(s));
  f.area = list('a', 'area');
  f.methods = list('m', 'methods');
  f.difficulty = list('d', 'difficulty');
  f.origin = list('o', 'origin');
  f.text = String(p.get('q') || '').slice(0, 120);        // a crafted link cannot carry an endless query
  f.op = p.get('op') === 'or' ? 'or' : 'and';
  f.showMethods = p.get('sm') === '1';
  const range = (key) => {
    const m = /^(\d*)-(\d*)$/.exec(p.get(key) || '');
    return m ? [intOrNull(m[1]), intOrNull(m[2])] : [null, null];
  };
  [f.yearFrom, f.yearTo] = range('y');
  f.solved = ['full', 'partial', 'none'].includes(p.get('s')) ? p.get('s') : 'all';
  if (p.get('ord') === 'manual') {
    const order = parseIdList(p.get('sel'));
    return { filters: f, selection: [...order].sort((a, b) => a - b), order: order.length ? order : null };
  }
  return { filters: f, selection: parseRanges(p.get('sel')), order: null };
}

/* Human-readable description of the active filters.  (The site no longer prints it on the PDF cover.)  The typed text
   appears reduced to a-z, 0-9 and spaces (nothing LaTeX could read as a command or fail to typeset), and the methods
   only when "Show methods" is on: they are spoilers. */
export function describeFilters(filters, cat) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const names = (type, slugs) => slugs.map(s => (getTag(cat, type, s) || { name: s }).name).join(', ');
  const parts = [];
  const text = normalize(f.text).replace(/[^a-z0-9 ]+/g, '').replace(/ +/g, ' ').trim();
  if (text) parts.push(`Title: ${text}`);
  const am = [];
  if (f.area.length) am.push('Area: ' + names('area', f.area));
  if (f.methods.length) am.push('Methods: ' + (f.showMethods ? names('methods', f.methods) : 'hidden'));
  if (am.length) parts.push(am.join('; ') + (am.length > 1 || f.area.length + f.methods.length > 1 ? (f.op === 'or' ? ' (any of)' : ' (all of)') : ''));
  if (f.difficulty.length) parts.push('Difficulty: ' + names('difficulty', f.difficulty));
  if (f.origin.length) parts.push('Origin: ' + names('origin', f.origin));
  if (f.yearFrom != null || f.yearTo != null) parts.push(`Origin year ${f.yearFrom ?? ''}–${f.yearTo ?? ''}`);
  if (f.solved !== 'all') parts.push({ full: 'Full solution', partial: 'Partial solution', none: 'No solution' }[f.solved]);
  return parts.length ? parts.join(' · ') : 'no filter (all problems)';
}
