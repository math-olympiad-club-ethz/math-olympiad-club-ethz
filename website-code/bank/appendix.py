"""Shared results: the appendix of the problem bank (problem-bank/appendix/<name>.tex).

A result (a theorem, a lemma, a group of definitions with their proofs) is written once and cited from solutions with
\\appendixref{<name>}.  Every PDF whose solutions cite results ends with an Appendix that prints each of them once,
with the results they cite in turn, numbered A.1, A.2, ... in order of first citation (appendix_order); \\appendixref
prints that number as a link.

    problem-bank/appendix/<name>.tex     <name> = lowercase kebab-case, the permanent citation key (never rename it)

        % comments (source, notes): ignored
        \\begin{appendixitem}{<Title>}
        ... statement and proof, with the club's LaTeX (theorem, lemma, proof, equation, TikZ, \\cite) ...
        \\end{appendixitem}
        \\begin{bibentries}              optional, as in problem files
        ...
        \\end{bibentries}

Only \\appendixref decides which results a PDF prints and in which order: author mode (the local preview, the CI
proofs) can only follow \\appendixref, and the website does the same.  Labels: the labels of a result are its own (the
website prefixes them with a-<name>:).  A label that another file refers to is written with its full name
appendix:<name>:<key>, both where it is set and where it is used, and that file also cites the result with
\\appendixref{<name>}; the heading of the result itself is appendix:<name>.  Only solutions (and results) cite results:
a problems-only PDF has no appendix.
"""
import functools
import os
import re

from . import paths
from . import problems as P
from .bib import bib_block, parse_bib_entries

NAME_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
# \appendixref{<name>}; TeX allows spaces before the argument.  group(1) is None when there is no {...} (malformed).
# Same regex as site/static/js/bank-tex.js::APPENDIXREF_RE.
APPENDIXREF_RE = re.compile(r"\\appendixref(?![A-Za-z@])(?:[ \t\n]*\{([^{}]*)\})?")
LABEL_PREFIX = "appendix:"                   # global labels of the shared results: appendix:<name> and appendix:<name>:<key>
LOCAL_PREFIX = "a-"                          # the website's prefix for a result's own labels: a-<name>:<key>
# the \appendix command of LaTeX (not \appendixref): results live in problem-bank/appendix/ now
APPENDIX_CMD_RE = re.compile(r"\\appendix(?![A-Za-z@])")
ITEM_MARKER_RE = re.compile(r"\\(begin|end)\s*\{\s*appendixitem\s*\}")
ITEM_BLOCK_RE = re.compile(r"\\(begin|end)\s*\{\s*(appendixitem|bibentries|problem|solution)\s*\}")
TITLE_ARG_RE = re.compile(r"[ \t]*\{([^{}\n%]*)\}")
MAX_TITLE_WORDS = 8
HELPER_FILES = {"_template.tex", ".DS_Store"}


def ref_name(key):
    """The result a label key refers to: 'appendix:<name>' or 'appendix:<name>:<label>' -> <name>, else None."""
    if not key.startswith(LABEL_PREFIX):
        return None
    name = key[len(LABEL_PREFIX):].split(":", 1)[0]
    return name if NAME_RE.fullmatch(name) else None


def _one_line(s):
    return " ".join(s.split())


def citations(tex):
    """[(offset, name)] of every \\appendixref{name} in `tex` (comments masked), in text order.  Malformed calls (no
    argument, or not a result name) are left out; malformed_refs reports them.  Mirrored in
    bank-tex.js::appendixCitations."""
    masked = P.mask_comments(tex or "")
    return [(m.start(), m.group(1)) for m in APPENDIXREF_RE.finditer(masked)
            if m.group(1) is not None and NAME_RE.fullmatch(m.group(1))]


def cited_names(tex):
    """The results cited in `tex` with \\appendixref, in order of first citation, without repeats.  Mirrored in
    bank-tex.js::citedNames."""
    out = []
    for _, name in citations(tex):
        if name not in out:
            out.append(name)
    return out


def malformed_refs(tex):
    """[(offset, text)] of the \\appendixref calls without a {name} argument or with something that is not a name."""
    masked = P.mask_comments(tex or "")
    return [(m.start(), m.group(0)) for m in APPENDIXREF_RE.finditer(masked)
            if m.group(1) is None or not NAME_RE.fullmatch(m.group(1))]


def global_labels(it):
    """The labels of result `it` that other files may refer to: appendix:<name> (its heading) and the labels it sets
    with the full name appendix:<name>:<key>."""
    from .stitch import label_refs
    own = f"{LABEL_PREFIX}{it['name']}:"
    targets = label_refs(P.mask_comments(it["text"]))[0]
    return {f"{LABEL_PREFIX}{it['name']}"} | {k for k in targets if k.startswith(own)}


def catalogue(items):
    """{name: set of global labels} of the shared results (what problem files may refer to)."""
    return {it["name"]: global_labels(it) for it in items if it["name"]}


def check_text(tex, cat, allow_cites=True, own=None, labels=None):
    """Errors [(offset, message)] of the shared-result rules in one block of text (a statement, a solution, a
    bibentries block, or the inside of a result).  cat: {name: global labels} or None (names not checked).
    allow_cites False: the block may not cite results at all.  own: the name of the result this text belongs to
    (None for problem files, which may not set appendix: labels).  labels: the labels a reference in this block may
    use (default: those set in the block).  Mirrored in bank-propose.js::appendixErrors."""
    from .stitch import find_figures, label_refs
    out = []
    masked = P.mask_comments(tex)
    for pos, call in malformed_refs(tex):
        out.append((pos, f"{_one_line(call)}: write \\appendixref{{<name>}} with the name of a result (its file name without .tex)"))
    cites = citations(tex)
    cited = {n for _, n in cites}
    figures = find_figures(masked)
    in_figure = lambda pos: any(s <= pos < e for s, e in figures)
    unknown = set()                                   # each unknown name is reported once, like unknown \cite keys
    for pos, name in cites:
        if not allow_cites:
            out.append((pos, "only a solution may cite a result of the appendix (a problems-only PDF has no appendix)"))
        elif in_figure(pos):
            out.append((pos, "a drawing is made on its own, without the appendix: cite the result next to it, not inside it"))
        elif name == own:
            out.append((pos, "a result does not cite itself"))
        elif cat is not None and name not in cat and name not in unknown:
            unknown.add(name)
            out.append((pos, f"unknown result '{name}': there is no problem-bank/appendix/{name}.tex"))
    targets, refs = label_refs(masked)
    available = set(targets) if labels is None else set(labels)
    for key, pos in targets.items():
        name = ref_name(key)
        if key.startswith(LABEL_PREFIX) and (own is None or name != own or key == LABEL_PREFIX + own):
            out.append((pos, f"label '{key}': labels named appendix:... belong to the shared results (a result names its "
                             f"own labels appendix:<its name>:<key>)"))
    for key, pos in refs:
        if "#" in key:
            continue                                  # a macro parameter (\ref{#1} inside \newcommand)
        name = ref_name(key)
        if not key.startswith(LABEL_PREFIX):
            if key not in available:
                out.append((pos, f"'{key}' is not labelled in this file (a label of a shared result is referred to as "
                                 f"appendix:<name>:<key>)"))
            continue
        if own is not None and name == own:
            continue                                  # its own full labels: checked by the label rule above
        if not allow_cites:
            out.append((pos, "only a solution may refer to a result of the appendix (a problems-only PDF has no appendix)"))
        elif in_figure(pos):
            out.append((pos, "a drawing is made on its own, without the appendix: refer to the result next to it, not inside it"))
        elif name is None or (cat is not None and name not in cat):
            out.append((pos, f"'{key}': there is no such result in problem-bank/appendix/"))
        elif cat is not None and key not in cat[name]:
            out.append((pos, f"'{key}': problem-bank/appendix/{name}.tex sets no label with this full name "
                             f"(write \\label{{{key}}} there)"))
        elif name not in cited:
            out.append((pos, f"'{key}': cite the result with \\appendixref{{{name}}} in the same text too (the local "
                             "preview and the CI proof print only the results cited with \\appendixref)"))
    return out


# ---- files ------------------------------------------------------------------------------------------------------------
def parse_item_file(path):
    """A result file -> dict (never raises on bad content: problems go to it['errors'] as (line, message)).
    it['text'] is the inside of the appendixitem block (after the title argument), it['text_start'] its offset."""
    it = {"path": path, "file": os.path.basename(path), "errors": [], "title": "", "text": "", "text_start": 0,
          "bibtex": "", "bib_entries": [], "cites": []}
    base = it["file"][:-4] if it["file"].endswith(".tex") else it["file"]
    it["name"] = base if NAME_RE.fullmatch(base) and it["file"].endswith(".tex") else None
    if it["name"] is None:
        it["errors"].append((1, "file name must be the result's name in lowercase kebab-case, e.g. "
                                "spectral-mapping-theorem.tex (it is the key solutions cite with \\appendixref)"))
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as err:
        text = raw.decode("utf-8", errors="replace")
        it["errors"].append((raw[:err.start].count(b"\n") + 1, f"the file is not UTF-8 (byte 0x{raw[err.start]:02x}): save it as UTF-8"))
    if text.startswith("\ufeff"):
        text = text[1:]
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    it["body"] = text
    masked = P.mask_comments(text)
    it["blocks"] = [(m.group(1), m.group(2), m.start(), m.end()) for m in ITEM_BLOCK_RE.finditer(masked)]
    seq = [(k, n) for k, n, _, _ in it["blocks"]]
    it["structure_ok"] = seq in ([("begin", "appendixitem"), ("end", "appendixitem")],
                                 [("begin", "appendixitem"), ("end", "appendixitem"), ("begin", "bibentries"), ("end", "bibentries")])
    if it["structure_ok"]:
        begin, end = it["blocks"][0], it["blocks"][1]
        m = TITLE_ARG_RE.match(masked, begin[3])
        it["title_ok"] = bool(m)
        start = m.end() if m else begin[3]
        if m:
            it["title"] = text[m.start(1):m.end(1)].strip()
        inner = text[start:end[2]]
        lead = len(inner) - len(inner.lstrip("\n"))
        it["text"] = inner.strip("\n")
        it["text_start"] = start + lead
        it["bibtex"] = bib_block(text)
        it["bib_entries"] = parse_bib_entries(it["bibtex"])
        it["cites"] = [n for n in cited_names(it["text"]) if n != it["name"]]
    return it


def load_items(appendix_dir=None):
    """Every result of the folder (files not starting with _), by file name; [] if there is no folder."""
    appendix_dir = appendix_dir or paths.APPENDIX_DIR
    if not os.path.isdir(appendix_dir):
        return []
    files = sorted(f for f in os.listdir(appendix_dir) if f.endswith(".tex") and not f.startswith("_"))
    return [parse_item_file(os.path.join(appendix_dir, f)) for f in files]


@functools.lru_cache(maxsize=None)
def _cached_folder(appendix_dir):
    return tuple(load_items(appendix_dir))


def folder_items():
    """load_items() of problem-bank/appendix/, read once per process (for callers that need them only for cache keys)."""
    return list(_cached_folder(paths.APPENDIX_DIR))


def names_of(items):
    return {it["name"] for it in items if it["name"]}


def validate_item(it, bib_keys=None, cat=None):
    """Append validation errors to it['errors'] and return them.  bib_keys: keys of references.bib; cat: catalogue()
    of all results (unknown names and labels are errors when given)."""
    e = it["errors"]
    text = it["body"]

    def at(pos):
        return text[:pos].count("\n") + 1

    masked = P.mask_comments(text)
    if not it["structure_ok"]:
        bad = next((b for b in it["blocks"] if b[1] in ("problem", "solution")), None)
        if bad:
            e.append((at(bad[2]), f"a result file must not contain a {bad[1]} block: write the result inside "
                                  "\\begin{appendixitem}{Title} ... \\end{appendixitem}"))
        else:
            e.append((at(it["blocks"][0][2]) if it["blocks"] else 1,
                      "a result file is one block \\begin{appendixitem}{Title} ... \\end{appendixitem}, optionally followed by "
                      "one \\begin{bibentries} ... \\end{bibentries} block"))
        return e
    begin = it["blocks"][0]
    if not it.get("title_ok"):
        e.append((at(begin[2]), "the title must be plain text in braces right after the block marker, on the same line: "
                                "\\begin{appendixitem}{Spectral Mapping Theorem}"))
    elif not it["title"]:
        e.append((at(begin[2]), "the title (\\begin{appendixitem}{Title}) is empty"))
    else:
        bad = P.unprintable(it["title"])
        if bad:
            e.append((at(begin[2]), f"title contains characters that cannot be printed in the heading {' '.join(bad)!r}; "
                                    "keep titles plain text (write math symbols in words)"))
        if len(it["title"].split()) > MAX_TITLE_WORDS:
            e.append((at(begin[2]), f"title has {len(it['title'].split())} words; keep it to {MAX_TITLE_WORDS} or fewer"))
    # only % comments outside the blocks
    rest = list(masked)
    for i in range(0, len(it["blocks"]), 2):
        for j in range(it["blocks"][i][2], it["blocks"][i + 1][3]):
            if rest[j] != "\n":
                rest[j] = " "
    for ln in sorted({at(m.start()) for m in re.finditer(r"\S+", "".join(rest))}):
        e.append((ln, "text outside the appendixitem and bibentries blocks is ignored: move it into the block, or make it a % comment"))
    for rx, label in P.FORBIDDEN_TEX:
        mm = re.search(rx, text)
        if mm:
            e.append((at(mm.start()), f"result files must not contain {label}: the preamble is added automatically"))
    for rx, why in P.UNSAFE_TEX:
        mm = re.search(rx, text)
        if mm:
            e.append((at(mm.start()), f"result files must not contain {mm.group(0)}: {why}"))
    mm = APPENDIX_CMD_RE.search(masked)
    if mm:
        e.append((at(mm.start()), "\\appendix is not needed: the file is already a result of the appendix"))
    for mm in P.CITE_COMMAND_RE.finditer(text):
        if mm.group(1) not in P.SUPPORTED_CITES:
            e.append((at(mm.start()), f"\\{mm.group(1)} is not supported on the website: write \\cite{{key}} (or \\cite[p.~3]{{key}})"))
            break
    mm = re.search(r"\\(bibliography|addbibresource|bibliographystyle)\s*[\[{]", text)
    if mm:
        e.append((at(mm.start()), f"remove \\{mm.group(1)}: citations are resolved automatically from references.bib and the bibentries block"))
    for mm in re.finditer(r"\\(begin|end)(\s*\{\s*(appendixitem|bibentries)\s*\})", text):
        if mm.group(2) != "{" + mm.group(3) + "}":
            e.append((at(mm.start()), f"write \\{mm.group(1)}{{{mm.group(3)}}} without spaces"))
    mm = re.search(r"\\tikz(?![A-Za-z@])", text)
    if mm:
        e.append((at(mm.start()), "inline \\tikz is not supported: draw inside \\begin{tikzpicture}...\\end{tikzpicture}"))
    own = [k for k, _ in it["bib_entries"]]
    bib_line = at(text.find("\\begin{bibentries}")) if "\\begin{bibentries}" in text else 1
    if it["bibtex"].strip() and not own:
        e.append((bib_line, "the bibentries block contains no BibTeX entry (expected @article{key, author = {...}, ...})"))
    if any(not k for k in own):
        e.append((bib_line, "a BibTeX entry in the bibentries block has no key (@article{key, ...})"))
    dup = sorted({k for k in own if k and own.count(k) > 1})
    if dup:
        e.append((bib_line, f"BibTeX key(s) given twice in the bibentries block: {', '.join(dup)}"))
    if bib_keys is not None:
        known = set(bib_keys) | set(own)
        from .bib import CITE_RE
        cited = re.sub(r"\\begin\{bibentries\}.*?\\end\{bibentries\}", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
        reported = set()
        for m in CITE_RE.finditer(cited):
            for k in (k.strip() for k in m.group(3).split(",")):
                if k and k not in known and k not in reported:
                    reported.add(k)
                    e.append((at(m.start()), f"citation key '{k}' is neither in references.bib nor in this file's bibentries block"))
    # shared-result rules, block by block: the result's text, then its bibentries block (which cites nothing)
    blocks = [(it["text_start"], it["text"], True)]
    if len(it["blocks"]) == 4:
        s, t = it["blocks"][2][3], it["blocks"][3][2]
        blocks.append((s, text[s:t], False))
    for start, block, allow in blocks:
        for pos, msg in check_text(block, cat, allow_cites=allow, own=it["name"]):
            e.append((at(start + pos), msg))
    return e


def cycle_errors(items):
    """[(path, line, message)] for results that cite each other in a circle (a -> b -> a), at the line of the
    \\appendixref that closes the circle's first step."""
    by_name = {it["name"]: it for it in items if it["name"]}
    out, state, stack = [], {}, []

    def visit(n):
        state[n] = 1
        stack.append(n)
        for m in by_name[n]["cites"]:
            if m not in by_name or m == n:
                continue
            if state.get(m) == 1:
                cyc = stack[stack.index(m):] + [m]
                first = by_name[cyc[0]]
                pos = next((p for p, name in citations(first["text"]) if name == cyc[1]), 0)
                line = first["body"][:first["text_start"] + pos].count("\n") + 1
                out.append((first["path"], line, "results cite each other in a circle: " + " -> ".join(cyc)))
            elif not state.get(m):
                visit(m)
        stack.pop()
        state[n] = 2

    for n in sorted(by_name):
        if not state.get(n):
            visit(n)
    return out


def stray_files(appendix_dir=None):
    """(path, line, message) for every entry of the appendix folder that is neither a result file nor a helper."""
    appendix_dir = appendix_dir or paths.APPENDIX_DIR
    if not os.path.isdir(appendix_dir):
        return []
    out = []
    for f in sorted(os.listdir(appendix_dir)):
        path = os.path.join(appendix_dir, f)
        if f in HELPER_FILES or f.endswith(P.LOCAL_LEFTOVERS):
            continue
        if f.endswith(".tex") and not f.startswith("_") and os.path.isfile(path):
            continue                              # a result file: parse_item_file checks its name
        out.append((path, 1, "not a result file: results are named <name>.tex (lowercase kebab-case), and nothing else "
                             "belongs in this folder"))
    return out


# ---- which results a PDF holds ----------------------------------------------------------------------------------------
def closure(names, cites_of):
    """`names` plus every result they cite, transitively (unknown names are dropped).  cites_of: name -> [names]."""
    seen, todo = [], [n for n in names if n in cites_of]
    while todo:
        n = todo.pop(0)
        if n in seen:
            continue
        seen.append(n)
        todo += [m for m in cites_of[n] if m in cites_of and m not in seen]
    return seen


def appendix_order(sel, appendix):
    """The results a stitched PDF prints, in order: first those cited by its printed solutions, in PDF order, then the
    results those cite, appended as they are met (a queue).  sel = bodies in PDF order; appendix = name -> entry with
    'cites'.  Names missing from `appendix` are skipped; cycles end.  Mirrored in bank-compile.js::appendixOrder."""
    order = []
    for b in sel:
        if b.get("solution") is not None:
            for n in b.get("cites") or []:
                if n in appendix and n not in order:
                    order.append(n)
    k = 0
    while k < len(order):
        for n in appendix[order[k]].get("cites") or []:
            if n in appendix and n not in order:
                order.append(n)
        k += 1
    return order
