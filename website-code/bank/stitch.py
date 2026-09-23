"""Stitch problem bodies for the in-browser (BusyTeX / pdfTeX-in-WebAssembly) compile.

CI side.  Reads problems/NNNN-title.tex and writes

    site/static/bank/bodies.json          {"NNNN": {statement, solution|null, figures, title, origin, ...}}
    site/static/bank/figures/figNNNN-k.pdf externalised TikZ / tikz-cd / pgfplots pictures

Per body it (1) strips the header comments, (2) namespaces every \\label / \\ref / \\eqref / \\cref /
\\Cref / \\pageref / \\autoref / \\nameref / \\hyperref[..] key as pNNNN:key (duplicate labels exist across
problems), (3) externalises every tikzpicture / tikzcd block: compiled standalone with the LOCAL
pdflatex (author-mode preamble + preview, tightpage), cached by content hash, and replaced by
\\includegraphics{figNNNN-k.pdf}; (4) pre-resolves citations from references.bib and the problem's own
bibentries block (bank/bib.py): \\cite{a,b} becomes [1, 2] and a problemreferences list is appended
(statement citations after the statement, the rest after the solution); \\printbibliography / \\nocite are dropped.

The same module generates the stitched main.tex (make_main) that the browser compiles against the
precompiled format club.fmt (the format already contains \\documentclass + the STITCHED preamble):

    python3 -m bank.stitch build [--out site/static/bank] [--ids 1-20]
    python3 -m bank.stitch main --ids 1-20 --variant problems|solutions [--bodies site/static/bank/bodies.json]
    python3 -m bank.stitch main --ids 7,3,12 --variant problems           # the problems in exactly this order
    python3 -m bank.stitch main --ids all --variant solutions --standalone   # with \\documentclass+preamble (no .fmt)
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

from bank import paths  # noqa: E402  (bank/ is importable: python3 -m bank.stitch from website/)
sys.path.insert(0, paths.WEBSITE)
from bank import problems as P  # noqa: E402
from bank.bib import CITE_RE, DROP_RE, bib_block, format_entry, parse_bib, parse_bib_text  # noqa: E402,F401

CLUB_NAME = "Math Olympiad Club ETHZ"
DOCUMENTCLASS = r"\documentclass[11pt]{article}"

# ----------------------------------------------------------------------------------------------
# 1. bodies
# ----------------------------------------------------------------------------------------------

ENV_RE = {
    "problem": re.compile(r"\\begin\{problem\}(.*?)\\end\{problem\}", re.S),
    "solution": re.compile(r"\\begin\{solution\}(.*?)\\end\{solution\}", re.S),
}


def split_body(body):
    """(statement, solution|None) = inner text of the problem / solution environments.  The markers are looked for
    outside % comments: a commented-out \\end{problem} does not cut the statement short."""
    masked = P.mask_comments(body)
    m = ENV_RE["problem"].search(masked)
    statement = body[m.start(1):m.end(1)].strip("\n") if m else body.strip("\n")
    s = ENV_RE["solution"].search(masked)
    solution = body[s.start(1):s.end(1)].strip("\n") if s else None
    return statement, solution


# ---- label namespacing --------------------------------------------------------------------------
# TeX allows spaces before the argument ("\\label {x}"), cleveref an optional type ("\\label[lemma]{x}").  Bracketed
# arguments are bounded (many unclosed "\\ref[" would take quadratic time).  Same regexes in bank-tex.js::labelRefs.
REF_CMDS = (r"label|ref|eqref|pageref|autoref|nameref|cref|Cref|labelcref|labelcpageref|cpageref|Cpageref|namecref|"
            r"nameCref|lcnamecref|namecrefs|nameCrefs|lcnamecrefs|hypertarget|hyperlink")
LABEL_RE = re.compile(r"\\(" + REF_CMDS + r")(?![A-Za-z@])(\*?)[ \t\n]*(\[[^\]]{0,300}\])?[ \t\n]*\{([^{}]*)\}")
RANGE_RE = re.compile(r"\\(crefrange|Crefrange|cpagerefrange|Cpagerefrange)(?![A-Za-z@])(\*?)[ \t\n]*\{([^{}]*)\}[ \t\n]*\{([^{}]*)\}")
HYPERREF_RE = re.compile(r"\\hyperref[ \t\n]*\[([^\]]{0,300})\]")
TARGET_CMDS = ("label", "hypertarget")          # the rest of REF_CMDS refer to a target


def namespace_labels(tex, prefix):
    def keys(s):
        return ",".join(k if not k.strip() or k.strip().startswith(prefix + ":") else f"{prefix}:{k.strip()}"
                        for k in s.split(","))
    tex = LABEL_RE.sub(lambda m: f"\\{m.group(1)}{m.group(2)}{m.group(3) or ''}{{{keys(m.group(4))}}}", tex)
    tex = RANGE_RE.sub(lambda m: f"\\{m.group(1)}{m.group(2)}{{{keys(m.group(3))}}}{{{keys(m.group(4))}}}", tex)
    tex = HYPERREF_RE.sub(lambda m: f"\\hyperref[{keys(m.group(1))}]", tex)
    return tex


def label_refs(tex):
    """(targets, refs) of `tex`: targets = {key: offset} of \\label / \\hypertarget, refs = [(key, offset)] of every
    reference (\\ref, \\eqref, \\cref, ranges, \\hyperref[...], ...).  The validator uses it (bank/problems.py)."""
    targets, refs = {}, []

    def split(s):
        return [k.strip() for k in s.split(",") if k.strip()]
    for m in LABEL_RE.finditer(tex):
        for k in split(m.group(4)):
            if m.group(1) in TARGET_CMDS:
                targets.setdefault(k, m.start())
            else:
                refs.append((k, m.start()))
    for m in RANGE_RE.finditer(tex):
        refs += [(k, m.start()) for g in (3, 4) for k in split(m.group(g))]
    for m in HYPERREF_RE.finditer(tex):
        refs += [(k, m.start()) for k in split(m.group(1))]
    return targets, refs


# ---- figure externalisation ---------------------------------------------------------------------
FIG_ENVS = ("tikzpicture", "tikzcd")
# Definitions a figure may rely on, copied into its standalone document (see figure_context).
CONTEXT_CMDS = ("tikzset", "tikzstyle", "tikzcdset", "pgfplotsset", "usetikzlibrary", "usepgfplotslibrary",
                "pgfdeclarelayer", "pgfsetlayers", "pgfmathdeclarefunction", "newcommand", "renewcommand", "providecommand",
                "DeclareRobustCommand", "newenvironment", "renewenvironment", "def", "let", "newlength", "setlength",
                "definecolor", "colorlet")
CONTEXT_RE = re.compile(r"\\(" + "|".join(CONTEXT_CMDS) + r")(?![A-Za-z@])")
LIBRARY_CMDS = ("usetikzlibrary", "usepgfplotslibrary")

PREVIEW_DOC = r"""%(documentclass)s
\input{preamble}
\usepackage[active,tightpage]{preview}
\setlength\PreviewBorder{1pt}
%(libraries)s
\begin{document}
%(context)s
\begin{preview}%%
%(figure)s%%
\end{preview}
\end{document}
"""


def find_figures(tex):
    """Yield (start, end) spans of top-level tikzpicture / tikzcd environments (no nesting assumed).  A commented-out
    figure is not one: the markers are looked for outside % comments."""
    masked = P.mask_comments(tex)
    spans = []
    for env in FIG_ENVS:
        for m in re.finditer(r"\\begin\{" + env + r"\}", masked):
            e = masked.find("\\end{" + env + "}", m.end())
            if e < 0:
                continue
            spans.append((m.start(), e + len("\\end{" + env + "}")))
    spans.sort()
    # drop spans nested in an earlier one
    out, last_end = [], -1
    for s, e in spans:
        if s >= last_end:
            out.append((s, e))
            last_end = e
    return out


def _group_end(tex, i):
    """Offset just after the {...} group opening at tex[i] (None if it never closes); \\{ and \\} do not count."""
    depth, k = 0, i
    while k < len(tex):
        c = tex[k]
        if c == "\\":
            k += 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return k + 1
        k += 1
    return None


def _definition_end(tex, i):
    """End of the arguments of a definition command whose name ends at tex[i]: `*`, `=`, `#1`, [...] and {...} groups,
    and up to two control sequences before the first group (\\let\\a\\b, \\def\\x#1{..}, \\newcommand\\x[1]{..})."""
    end, n_cs, grouped = i, 0, False
    while True:
        j = i
        while j < len(tex) and tex[j] in " \t\n":
            j += 1
        if j >= len(tex):
            return end
        c = tex[j]
        if c == "{":
            k = _group_end(tex, j)
            grouped = True
        elif c == "[":
            k = tex.find("]", j)
            k = k + 1 if k >= 0 else None
        elif c in "*=":
            k = j + 1
        elif c == "#" and tex[j + 1:j + 2].isdigit():
            k = j + 2
        elif c == "\\" and not grouped and n_cs < 2:
            n_cs += 1
            m = re.compile(r"\\(?:[A-Za-z@]+|.)", re.S).match(tex, j)
            k = m.end() if m else None
        else:
            return end
        if k is None:
            return end
        i = end = k


def figure_context(tex, upto):
    """The definitions written before position `upto` (styles, macros, colours, libraries), outside comments and outside
    earlier figures: anywhere in a line, each taken whole with all its arguments (over several lines if needed).
    Returns (context, libraries); the libraries go into the figure document's preamble."""
    masked = P.mask_comments(tex[:upto])
    for s, e in find_figures(masked):        # an earlier figure keeps its own definitions
        masked = masked[:s] + re.sub(r"[^\n]", " ", masked[s:e]) + masked[e:]
    ctx, libs = [], []
    pos = 0
    while True:
        m = CONTEXT_RE.search(masked, pos)
        if not m:
            break
        end = _definition_end(masked, m.end())
        (libs if m.group(1) in LIBRARY_CMDS else ctx).append(tex[m.start():end])
        pos = end
    return "\n".join(ctx), "\n".join(libs)


def tex_env():
    """Environment of every pdflatex run on problem text (proofs, figures, bundle): the bank folder on the search paths,
    no file read or written outside the working folder (openin_any / openout_any = p: no absolute or ../ paths), no
    shell escape, and the clock fixed (SOURCE_DATE_EPOCH + FORCE_SOURCE_DATE) so the same input gives the same bytes."""
    env = dict(os.environ)
    env["TEXINPUTS"] = paths.BANK_DIR + ":" + env.get("TEXINPUTS", "")
    env["BIBINPUTS"] = paths.BANK_DIR + ":" + env.get("BIBINPUTS", "")
    env.update(openin_any="p", openout_any="p", shell_escape="f", SOURCE_DATE_EPOCH="0", FORCE_SOURCE_DATE="1")
    return env


PDFLATEX = ["pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error"]
COMPILE_TIMEOUT = 300                    # seconds, per pdflatex run


def _local_pdflatex(doc, workdir, jobname):
    with open(os.path.join(workdir, jobname + ".tex"), "w", encoding="utf-8") as f:
        f.write(doc)
    try:
        r = subprocess.run(PDFLATEX + [jobname + ".tex"], cwd=workdir, env=tex_env(), capture_output=True, text=True,
                           timeout=COMPILE_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"figure compile timed out after {COMPILE_TIMEOUT} s") from None
    pdf = os.path.join(workdir, jobname + ".pdf")
    if r.returncode != 0 or not os.path.exists(pdf):
        err = [l for l in r.stdout.split("\n") if l.startswith("!") or l.startswith("l.")]
        raise RuntimeError("figure compile failed:\n" + "\n".join(err[-8:]) + "\n" + r.stdout[-1200:])
    with open(pdf, "rb") as f:
        return f.read()


def externalise_figures(tex, pid, fig_dir, cache_dir, counter, log):
    """Replace every tikz block by \\includegraphics{figNNNN-k.pdf}; returns (tex, {name: info})."""
    figures = {}
    spans = find_figures(tex)
    if not spans:
        return tex, figures
    with open(paths.PREAMBLE_FILE, "rb") as f:
        preamble_hash = hashlib.sha256(f.read()).hexdigest()[:16]
    out, pos = [], 0
    for s, e in spans:
        counter[0] += 1
        name = f"fig{pid}-{counter[0]}.pdf"
        context, libs = figure_context(tex, s)
        doc = PREVIEW_DOC % {"documentclass": DOCUMENTCLASS, "libraries": libs, "context": context, "figure": tex[s:e]}
        h = hashlib.sha256((preamble_hash + doc).encode("utf-8")).hexdigest()
        cached = os.path.join(cache_dir, h + ".pdf")
        if os.path.exists(cached):
            with open(cached, "rb") as f:
                pdf = f.read()
        else:
            with tempfile.TemporaryDirectory() as d:
                pdf = _local_pdflatex(doc, d, "fig")
            os.makedirs(cache_dir, exist_ok=True)
            with open(cached, "wb") as f:
                f.write(pdf)
            log(f"  externalised {name} ({len(pdf)} bytes)")
        os.makedirs(fig_dir, exist_ok=True)
        with open(os.path.join(fig_dir, name), "wb") as f:
            f.write(pdf)
        figures[name] = {"bytes": len(pdf), "sha256": hashlib.sha256(pdf).hexdigest(), "url": "figures/" + name}
        out.append(tex[pos:s])
        out.append("\\includegraphics{%s}" % name)
        pos = e
    out.append(tex[pos:])
    return "".join(out), figures


# ---- citations ----------------------------------------------------------------------------------
# The BibTeX parser and the entry formatter live in bank/bib.py (shared with the validator).
def resolve_citations(statement, solution, bib, log, pid):
    """Replace \\cite{...} by [n] numbers; append problemreferences lists.  Numbers are shared between
    statement and solution (statement keys first)."""
    numbers = {}
    missing = []

    def sub(m):
        pre, post, keys = m.group(1), m.group(2), m.group(3)
        if post is None:      # \cite[post]{k}
            pre, post = None, pre
        nums = []
        for k in [k.strip() for k in keys.split(",") if k.strip()]:
            if k not in numbers:
                numbers[k] = len(numbers) + 1
                if k not in bib:
                    missing.append(k)
            nums.append(str(numbers[k]))
        txt = ", ".join(nums)
        if post:
            txt += ", " + post.strip()
        return "[%s]" % txt

    statement = DROP_RE.sub("", statement)
    statement = CITE_RE.sub(sub, statement)
    n_statement = len(numbers)
    if solution is not None:
        solution = DROP_RE.sub("", solution)
        solution = CITE_RE.sub(sub, solution)
    for k in missing:
        log(f"  {pid}: citation key '{k}' not in references.bib")

    def reflist(keys):
        items = "\n".join("\\refitem{%d} %s" % (numbers[k], format_entry(bib.get(k, {"title": k}))) for k in keys)
        return "\n\\begin{problemreferences}\n%s\n\\end{problemreferences}" % items

    ordered = sorted(numbers, key=numbers.get)
    if n_statement:
        statement = statement.rstrip() + reflist(ordered[:n_statement]) + "\n"
    if solution is not None and len(numbers) > n_statement:
        solution = solution.rstrip() + reflist(ordered[n_statement:]) + "\n"
    return statement, solution, len(numbers)


# ---- problem sources ----------------------------------------------------------------------------
def bank_sources(problems, tags):
    """Parsed problems (bank.problems) -> the source dicts build_bodies() needs.  Problems without an ID
    (new-*.tex not numbered yet, see bank/number.py) are skipped."""
    out = []
    for p in problems:
        if p["id"] is None:
            continue
        statement, solution = split_body(p["body"])
        if P.BLOCK_RE.search(P.mask_comments(statement)):     # second barrier after the validator: never leak a solution
            raise ValueError(f"{p['file']}: a \\begin/\\end{{solution|bibentries|problem}} inside the problem block")
        methods = [tags["methods"][m]["name"] for m in p["methods"] if m in tags["methods"]] if tags else list(p["methods"])
        out.append({"id": f"{p['id']:04d}", "title": p["title"], "origin": P.origin_label(p, tags) if tags else _raw_origin(p),
                    "status": p["status"], "methods": methods, "statement": statement, "solution": solution,
                    "bibtex": bib_block(p["body"]), "source": p["file"]})
    return out


def load_bank_problems(problems_dir, tags, include_new=False):
    """Read problems_dir.  include_new=True gives new-*.tex files their provisional numbers (preview builds)."""
    problems = P.load_problems(problems_dir)
    if include_new:
        from bank.number import assign_provisional_ids, read_last_id
        assign_provisional_ids(problems, read_last_id(problems_dir))
    return bank_sources(problems, tags)


def _raw_origin(p):
    s = " ".join(x for x in (p["origin"], p["origin_date"][:4] if p["origin_date"] else "") if x)
    if p["origin_number"]:
        s += (", " if s else "") + p["origin_number"]
    return s


def build_bodies(source, out_dir, ids=None, log=print):
    bib = parse_bib(paths.BIB_FILE)
    fig_dir = os.path.join(out_dir, "figures")
    cache_dir = os.path.join(paths.CACHE_DIR, "figures")
    bodies, stats = {}, {"problems": 0, "figures": 0, "citations": 0, "solutions": 0}
    for p in source:
        if ids and int(p["id"]) not in ids:
            continue
        pid, prefix = p["id"], "p" + p["id"]
        statement = namespace_labels(p["statement"], prefix)
        solution = namespace_labels(p["solution"], prefix) if p["solution"] is not None else None
        counter = [0]
        try:
            statement, figs = externalise_figures(statement, pid, fig_dir, cache_dir, counter, log)
            if solution is not None:
                solution, figs2 = externalise_figures(solution, pid, fig_dir, cache_dir, counter, log)
                figs.update(figs2)
        except RuntimeError as err:          # name the file: the message alone only shows the standalone figure's log
            raise RuntimeError(f"{p.get('source', pid)}: a TikZ figure does not compile on its own "
                               f"(definitions it needs must come before it in the same block):\n{err}") from None
        own = parse_bib_text(p.get("bibtex") or "")        # the problem's own bibentries block wins for this problem
        statement, solution, ncite = resolve_citations(statement, solution, {**bib, **own} if own else bib, log, pid)
        bodies[pid] = {"id": pid, "title": p["title"], "origin": p["origin"], "status": p["status"],
                       "methods": list(p.get("methods") or []),
                       "solved": solution is not None and p["status"] != "partial",
                       "statement": statement, "solution": solution, "figures": figs}
        stats["problems"] += 1
        stats["figures"] += len(figs)
        stats["citations"] += ncite
        stats["solutions"] += solution is not None
    return bodies, stats


# ----------------------------------------------------------------------------------------------
# 2. stitched main.tex
# ----------------------------------------------------------------------------------------------
def tex_escape(s):
    """Escape TeX specials in plain-text titles; already-escaped ones (legacy titles) are left alone."""
    return re.sub(r"(?<!\\)([&%$#_])", r"\\\1", s)


def make_main(bodies, ids, variant="problems", filters="", standalone=False, show_methods=False):
    """The document the browser compiles, problems in the order of `ids` (the page decides the order).
    With standalone=False it starts at \\begin{document}
    (\\documentclass + stitched preamble live in club.fmt); standalone=True adds them (plain pdflatex)."""
    assert variant in ("problems", "solutions")
    sel = [bodies[f"{i:04d}"] for i in ids if f"{i:04d}" in bodies]
    out = []
    if standalone:
        out += [DOCUMENTCLASS, r"\def\BankStitched{}", r"\input{preamble}"]
    out.append(r"\begin{document}")
    out += [r"\thispagestyle{empty}", r"\vspace*{\stretch{1}}", r"\begin{center}",
            r"{\Huge\bfseries %s}\\[2ex]" % CLUB_NAME,
            r"{\LARGE %s}\\[4ex]" % ("Problems" if variant == "problems" else "Problems and solutions"),
            r"{\large %d problem%s}\\[1ex]" % (len(sel), "" if len(sel) == 1 else "s")]
    if filters:
        out.append(r"{\normalsize Selection: %s}\\[1ex]" % tex_escape(filters))
    out += [r"\end{center}", r"\vspace*{\stretch{2}}", r"\newpage"]
    for k, b in enumerate(sel, 1):
        out.append(r"\bankproblem{%d}{%s}{%s}{%s}" % (k, tex_escape(b["title"]), tex_escape(b["origin"]), b["id"]))
        if show_methods and b.get("methods"):
            out.append(r"\bankmethods{%s}" % tex_escape(", ".join(b["methods"])))
        out.append(r"\begin{problem}")
        out.append(b["statement"])
        out.append(r"\end{problem}")
        if variant == "solutions":
            if b["solution"] is not None:
                out.append(r"\begin{solution}")
                out.append(b["solution"])
                out.append(r"\end{solution}")
                if b.get("status") == "partial":
                    out.append(r"\banknosolution")
            else:
                out.append(r"\banknosolution")
    out.append(r"\end{document}")
    return "\n".join(out) + "\n"


def parse_ids(spec, available=None):
    """'all' -> every available ID ascending; otherwise the IDs in the order written ('5,3,1-2' -> [5, 3, 1, 2];
    a range expands ascending; repeats are dropped)."""
    if spec in (None, "", "all"):
        return sorted(available) if available else []
    ids = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            ids.extend(range(int(a), int(b) + 1))
        elif part:
            ids.append(int(part))
    return list(dict.fromkeys(ids))


def _load_tags():
    try:
        from bank.tags import load_tags
        return load_tags(paths.TAGS_FILE)
    except Exception:
        return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="write bodies.json + figures/")
    b.add_argument("--problems-dir", default=paths.PROBLEMS_DIR)
    b.add_argument("--out", default=paths.BANK_DATA_DIR)
    b.add_argument("--ids", default="all")
    m = sub.add_parser("main", help="print a stitched main.tex")
    m.add_argument("--bodies", default=os.path.join(paths.BANK_DATA_DIR, "bodies.json"))
    m.add_argument("--ids", default="all", help="IDs in PDF order, e.g. 5,3,1-2 (default: all, ascending)")
    m.add_argument("--variant", choices=("problems", "solutions"), default="problems")
    m.add_argument("--filters", default="")
    m.add_argument("--standalone", action="store_true")
    m.add_argument("--show-methods", action="store_true", help="add the Methods line under each heading")
    a = ap.parse_args(argv)
    if a.cmd == "build":
        source = load_bank_problems(a.problems_dir, _load_tags())
        ids = set(parse_ids(a.ids, [int(p["id"]) for p in source]))
        bodies, stats = build_bodies(source, a.out, ids)
        os.makedirs(a.out, exist_ok=True)
        payload = {"meta": {"count": len(bodies), "source": "problems/", **stats},
                   "problems": bodies}
        path = os.path.join(a.out, "bodies.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=0, sort_keys=True)
        print(f"wrote {path}: {stats}")
        return 0
    with open(a.bodies, encoding="utf-8") as f:
        bodies = json.load(f)["problems"]
    ids = parse_ids(a.ids, [int(k) for k in bodies])
    sys.stdout.write(make_main(bodies, ids, a.variant, a.filters, a.standalone, a.show_methods))
    return 0


if __name__ == "__main__":
    sys.exit(main())
