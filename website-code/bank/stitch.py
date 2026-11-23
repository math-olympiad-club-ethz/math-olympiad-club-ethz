"""Stitch problem bodies for the in-browser (BusyTeX / pdfTeX-in-WebAssembly) compile.

CI side.  Reads problems/NNNN-title.tex (and the shared results appendix/<name>.tex) and writes

    site/static/bank/bodies.json          {"build", "problems": {"NNNN": {statement, solution|null, cites, figures, title,
                                           origin, ...}}, "appendix": {name: {title, text, cites, figures}}}
    site/static/bank/figures/figNNNN-k.pdf externalised TikZ / tikz-cd / pgfplots pictures (figa-<name>-k.pdf: results)

Per body it (1) strips the header comments, (2) namespaces every \\label / \\ref / \\eqref / \\cref /
\\Cref / \\pageref / \\autoref / \\nameref / \\hyperref[..] key as pNNNN:key (duplicate labels exist across
problems), (3) externalises every tikzpicture / tikzcd block: compiled standalone with the LOCAL
pdflatex (author-mode preamble + preview, tightpage), cached by content hash, and replaced by
\\includegraphics{figNNNN-k.pdf}; (4) pre-resolves citations from references.bib and the problem's own
bibentries block (bank/bib.py): \\cite{a,b} becomes [1, 2] and a problemreferences list is appended
(statement citations after the statement, the rest after the solution); \\printbibliography / \\nocite are dropped;
(5) records the shared results the solution cites (bank/appendix.py, "cites").  build_appendix does the same for the
shared results of problem-bank/appendix/ (bodies.json "appendix"); make_main appends the cited ones to a solutions PDF.

The same module generates the stitched main.tex (make_main) that the browser compiles against the
precompiled format club.fmt (the format already contains \\documentclass + the STITCHED preamble):

    python3 -m bank.stitch main --ids 1-20 --variant problems|solutions [--bodies site/static/bank/bodies.json]
    python3 -m bank.stitch main --ids 7,3,12 --variant problems           # the problems in exactly this order
    python3 -m bank.stitch main --ids all --variant solutions --standalone   # with \\documentclass+preamble (no .fmt)
    python3 -m bank.stitch preview --id 7 [--width 200]                       # one statement's preview (makePreview)

build_previews typesets every statement in advance for the Problems page's previews (make_previews).
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

from bank import paths
from bank import problems as P
from bank import appendix as A
from bank.bib import CITE_RE, DROP_RE, bib_block, format_entry, parse_bib, parse_bib_text

CLUB_NAME = "Math Olympiad Club at ETHZ"
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
    """Prefix every label key with `prefix`:.  Keys of the shared results (appendix:<name>...) are global: a solution
    refers to them by their full name, so they are left as written."""
    def keys(s):
        return ",".join(k if not k.strip() or k.strip().startswith(prefix + ":") or k.strip().startswith(A.LABEL_PREFIX)
                        else f"{prefix}:{k.strip()}" for k in s.split(","))
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
        r = subprocess.run(PDFLATEX + [jobname + ".tex"], cwd=workdir, env=tex_env(), capture_output=True, text=True, errors="replace",
                           timeout=COMPILE_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"figure compile timed out after {COMPILE_TIMEOUT} s") from None
    pdf = os.path.join(workdir, jobname + ".pdf")
    if r.returncode != 0 or not os.path.exists(pdf):
        err = [l for l in r.stdout.split("\n") if l.startswith("!") or l.startswith("l.")]
        raise RuntimeError("figure compile failed:\n" + "\n".join(err[-8:]) + "\n" + r.stdout[-1200:])
    with open(pdf, "rb") as f:
        return f.read()


def externalise_figures(tex, pid, fig_dir, cache_dir, counter):
    """Replace every tikz block by \\includegraphics{fig<pid>-k.pdf} (figNNNN-k.pdf, or figa-<name>-k.pdf for a shared
    result); returns (tex, {name: info})."""
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
        os.makedirs(fig_dir, exist_ok=True)
        with open(os.path.join(fig_dir, name), "wb") as f:
            f.write(pdf)
        figures[name] = {"sha256": hashlib.sha256(pdf).hexdigest(), "url": "figures/" + name}
        out.append(tex[pos:s])
        out.append("\\includegraphics{%s}" % name)
        pos = e
    out.append(tex[pos:])
    return "".join(out), figures


# ---- citations ----------------------------------------------------------------------------------
# The BibTeX parser and the entry formatter live in bank/bib.py (shared with the validator).
def resolve_citations(statement, solution, bib):
    """Replace \\cite{...} by [n] numbers; append problemreferences lists.  Numbers are shared between
    statement and solution (statement keys first)."""
    numbers = {}

    def sub(m):
        pre, post, keys = m.group(1), m.group(2), m.group(3)
        if post is None:      # \cite[post]{k}
            pre, post = None, pre
        nums = []
        for k in [k.strip() for k in keys.split(",") if k.strip()]:
            if k not in numbers:
                numbers[k] = len(numbers) + 1
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
        methods = [tags["methods"][m]["name"] for m in p["methods"] if m in tags["methods"]]
        out.append({"id": f"{p['id']:04d}", "title": p["title"], "origin": P.origin_label(p, tags),
                    "status": p["status"], "methods": methods, "statement": statement, "solution": solution,
                    "cites": A.cited_names(solution) if solution is not None else [],
                    "bibtex": bib_block(p["body"]), "source": p["file"]})
    return out


def build_bodies(source, out_dir):
    bib = parse_bib(paths.BIB_FILE)
    fig_dir = os.path.join(out_dir, "figures")
    cache_dir = os.path.join(paths.CACHE_DIR, "figures")
    bodies, stats = {}, {"figures": 0, "citations": 0}
    for p in source:
        pid, prefix = p["id"], "p" + p["id"]
        statement = namespace_labels(p["statement"], prefix)
        solution = namespace_labels(p["solution"], prefix) if p["solution"] is not None else None
        counter = [0]
        try:
            statement, figs = externalise_figures(statement, pid, fig_dir, cache_dir, counter)
            if solution is not None:
                solution, figs2 = externalise_figures(solution, pid, fig_dir, cache_dir, counter)
                figs.update(figs2)
        except RuntimeError as err:          # name the file: the message alone only shows the standalone figure's log
            raise RuntimeError(f"{p.get('source', pid)}: a TikZ figure does not compile on its own "
                               f"(definitions it needs must come before it in the same block):\n{err}") from None
        own = parse_bib_text(p.get("bibtex") or "")        # the problem's own bibentries block wins for this problem
        statement, solution, ncite = resolve_citations(statement, solution, {**bib, **own} if own else bib)
        bodies[pid] = {"id": pid, "title": p["title"], "origin": p["origin"], "status": p["status"],
                       "methods": list(p.get("methods") or []),
                       "statement": statement, "solution": solution, "cites": list(p.get("cites") or []), "figures": figs}
        stats["figures"] += len(figs)
        stats["citations"] += ncite
    return bodies, stats


def build_appendix(items, names, out_dir):
    """The shared results `names` (see bank/appendix.py) as the browser needs them: {name: {title, text, cites, figures}},
    sorted by name.  Like a problem body: its own labels namespaced as a-<name>:key (the global ones, appendix:<name>:key,
    stay as written), TikZ externalised to figures/figa-<name>-k.pdf, citations pre-resolved with a
    reference list at the end of the result."""
    bib = parse_bib(paths.BIB_FILE)
    fig_dir = os.path.join(out_dir, "figures")
    cache_dir = os.path.join(paths.CACHE_DIR, "figures")
    by_name = {it["name"]: it for it in items}
    out, stats = {}, {"results": 0, "figures": 0, "citations": 0}
    for name in sorted(names):
        it = by_name[name]
        text = namespace_labels(it["text"], A.LOCAL_PREFIX + name)
        try:
            text, figs = externalise_figures(text, "a-" + name, fig_dir, cache_dir, [0])
        except RuntimeError as err:
            raise RuntimeError(f"{it['file']}: a TikZ figure does not compile on its own "
                               f"(definitions it needs must come before it in the same block):\n{err}") from None
        own = parse_bib_text(it.get("bibtex") or "")
        text, _, ncite = resolve_citations(text, None, {**bib, **own} if own else bib)
        out[name] = {"title": it["title"], "text": text, "cites": list(it["cites"]), "figures": figs}
        stats["results"] += 1
        stats["figures"] += len(figs)
        stats["citations"] += ncite
    return out, stats


# ----------------------------------------------------------------------------------------------
# 2. stitched main.tex
# ----------------------------------------------------------------------------------------------
def tex_escape(s):
    """Escape TeX specials in plain-text titles; an already-escaped one is left alone (mirrored in bank-compile.js)."""
    return re.sub(r"(?<!\\)([&%$#_])", r"\\\1", s)


def make_main(bodies, ids, variant="problems", filters="", standalone=False, show_methods=False, appendix=None):
    """The document the browser compiles, problems in the order of `ids` (the page decides the order).
    With standalone=False it starts at \\begin{document}
    (\\documentclass + stitched preamble live in club.fmt); standalone=True adds them (plain pdflatex).
    appendix: the shared results ({name: entry}, bodies.json "appendix"); a solutions PDF whose solutions cite some
    ends with them (bank/appendix.py::appendix_order).  A PDF that cites none is the same as without `appendix`."""
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
    order = A.appendix_order(sel, appendix) if variant == "solutions" and appendix else []
    if order:
        out.append(r"\bankappendix")
        for name in order:
            a = appendix[name]
            out += [r"\bankappendixitem{%s}" % name, r"\begin{appendixitem}{%s}" % tex_escape(a["title"]), a["text"],
                    r"\end{appendixitem}"]
    out.append(r"\end{document}")
    return "\n".join(out) + "\n"


# ---- the statements typeset in advance: the previews of the Problems page ---------------------------------------------
# The page shows a statement under its title, typeset at the measure its panel holds (bank-ui.js::showStatement).  The
# build typesets every statement at PREVIEW_MEASURES, 10 % apart: one PDF per measure, a statement per page, its fonts
# once.  The page draws the page of the measure nearest its own, a little bigger or smaller to fill the panel (5 % at
# most), and needs neither the LaTeX engine nor the problem texts for it.  Each page is the one the browser's
# makePreview would typeset alone (bank-compile.js; make_preview is its twin, the parity test compares them).
PREVIEW_MARGIN_PT = 2                    # bank-compile.js::PREVIEW_MARGIN_PT
PREVIEW_LEAST_PT, SHEET_PT = 150, 426.79   # bank-ui.js::previewMeasure: the least, and the sheets' measure (A4, 3 cm margins)
PREVIEW_MEASURES = [round(PREVIEW_LEAST_PT * (SHEET_PT / PREVIEW_LEAST_PT) ** (k / 11), 2) for k in range(12)]
# A page as tall as any statement: one page each, never cut (its height is then set to where its text ends).  7000 pt
# keeps \pagetotal + \vsize within TeX's largest dimension.
PREVIEW_TALL = r"\textheight=7000pt\vsize=\textheight\csname @colht\endcsname=\textheight\csname @colroom\endcsname=\textheight"


def preview_head(width=None):
    """The lines before the first statement (bank-compile.js::previewHead).  width: the measure in pt, two decimals, or
    None for the sheets' own."""
    m = f"{PREVIEW_MARGIN_PT}pt"
    out = [r"\begin{document}", r"\pagestyle{empty}\raggedbottom"]
    if width:
        out.append(r"\ifdim%.2fpt<\textwidth\textwidth=%.2fpt\sloppy\fi" % (width, width))
    out += [r"\hsize=\textwidth\linewidth=\textwidth\columnwidth=\textwidth",
            r"\hoffset=\dimexpr%s-1in-\oddsidemargin\relax" % m,
            r"\voffset=\dimexpr%s-1in-\topmargin-\headheight-\headsep\relax" % m,
            r"\global\pdfpagewidth=560pt", PREVIEW_TALL]
    return out


def preview_page(statement):
    """One statement on a page of its own, as tall as its text (bank-compile.js::previewPage)."""
    m = f"{PREVIEW_MARGIN_PT}pt"
    return [r"\global\pdfpageheight=\dimexpr\textheight+2\dimexpr%s\relax\relax" % m, r"\begin{problem}", statement,
            r"\end{problem}",
            r"\par\ifdim\pagegoal<\maxdimen\global\pdfpageheight=\dimexpr\pagetotal+\pagedepth+\vsize-\pagegoal+2\dimexpr%s\relax\relax\fi" % m,
            r"\penalty-10000"]


def make_preview(bodies, pid, width=None):
    """One statement's preview document, byte for byte bank-compile.js::makePreview."""
    return "\n".join(preview_head(width) + preview_page(bodies[f"{pid:04d}"]["statement"]) + [r"\end{document}"]) + "\n"


def make_previews(bodies, ids, width=None):
    """Every statement of `ids`, in this order, each on a page of its own typeset as make_preview typesets it alone: the
    counters start afresh on each (as under a \\bankproblem heading), and each page writes '<ID> <page>' to
    <jobname>.pages when it is shipped out.  For plain pdflatex (the documentclass and the stitched preamble included)."""
    out = [DOCUMENTCLASS, r"\def\BankStitched{}", r"\input{preamble}", r"\newwrite\bankpages",
           r"\immediate\openout\bankpages=\jobname.pages"] + preview_head(width)
    for pid in ids:
        b = bodies[f"{pid:04d}"]
        out += [r"\bankresetcounters", r"\write\bankpages{%s \the\value{page}}" % b["id"]] + preview_page(b["statement"])
    return "\n".join(out + [r"\end{document}"]) + "\n"


def _compile_previews(doc, fig_dir):
    """pdflatex on a make_previews document, run again while LaTeX asks (cross-references).  Returns (pdf, pages): pages
    = [(ID, page)] in the order shipped."""
    env = tex_env()
    env["TEXINPUTS"] = fig_dir + ":" + env["TEXINPUTS"]           # the drawings, \includegraphics{figNNNN-k.pdf}
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "previews.tex"), "w", encoding="utf-8") as f:
            f.write(doc)
        for _ in range(3):
            try:
                r = subprocess.run(PDFLATEX + ["previews.tex"], cwd=d, env=env, capture_output=True, text=True, errors="replace",
                                   timeout=COMPILE_TIMEOUT)
            except subprocess.TimeoutExpired:
                raise RuntimeError(f"timed out after {COMPILE_TIMEOUT} s") from None
            if r.returncode != 0 or not os.path.exists(os.path.join(d, "previews.pdf")):
                err = [l for l in r.stdout.split("\n") if l.startswith("!") or l.startswith("l.")]
                raise RuntimeError("\n".join(err[-8:]) or r.stdout[-1200:])
            if "Rerun to get" not in r.stdout and "Label(s) may have changed" not in r.stdout:
                break
        with open(os.path.join(d, "previews.pdf"), "rb") as f:
            pdf = f.read()
        with open(os.path.join(d, "previews.pages"), encoding="utf-8") as f:
            pages = [(a, int(b)) for a, b in (line.split() for line in f if line.strip())]
    return pdf, pages


def build_previews(bodies, out_dir, jobs=4):
    """The previews of every statement in `bodies`, one PDF per measure of PREVIEW_MEASURES, written to
    <out_dir>/previews/ under names that change with their content (GitHub Pages caches files for 10 minutes); cached by
    content in .cache/previews/.  Returns ({"ids": [...], "measures": [{"pt", "url"}]}, messages): page k of each PDF is
    the statement of ids[k-1].  A measure that cannot be made is left out, with a message: the page typesets the
    statements of a missing measure in the browser, as before."""
    from concurrent.futures import ThreadPoolExecutor
    ids = sorted(int(k) for k in bodies)
    fig_dir = os.path.join(out_dir, "figures")
    target = os.path.join(out_dir, "previews")
    if os.path.isdir(target):
        shutil.rmtree(target)
    os.makedirs(target)
    cache_dir = os.path.join(paths.CACHE_DIR, "previews")
    os.makedirs(cache_dir, exist_ok=True)
    with open(paths.PREAMBLE_FILE, "rb") as f:
        stamp = hashlib.sha256(f.read())
    for name in sorted(os.listdir(fig_dir)) if os.path.isdir(fig_dir) else []:
        with open(os.path.join(fig_dir, name), "rb") as f:
            stamp.update(name.encode() + b"\0" + hashlib.sha256(f.read()).digest())

    def one(pt):
        doc = make_previews(bodies, ids, None if pt == SHEET_PT else pt)
        key = hashlib.sha256(stamp.digest() + doc.encode("utf-8")).hexdigest()
        cached = os.path.join(cache_dir, key)
        if os.path.exists(cached + ".pdf") and os.path.exists(cached + ".json"):
            with open(cached + ".pdf", "rb") as f:
                pdf = f.read()
            with open(cached + ".json", encoding="utf-8") as f:
                pages = [tuple(x) for x in json.load(f)]
            for ext in (".pdf", ".json"):
                os.utime(cached + ext)                        # still in use: kept (see below)
        else:
            pdf, pages = _compile_previews(doc, fig_dir)
            with open(cached + ".pdf", "wb") as f:
                f.write(pdf)
            with open(cached + ".json", "w", encoding="utf-8") as f:
                json.dump(pages, f)
        if pages != [(f"{i:04d}", k) for k, i in enumerate(ids, 1)]:
            raise RuntimeError("a statement did not come out on exactly one page")
        name = f"statements-{pt:g}pt-{hashlib.sha256(pdf).hexdigest()[:10]}.pdf"
        with open(os.path.join(target, name), "wb") as f:
            f.write(pdf)
        return {"pt": pt, "url": "static/bank/previews/" + name}

    def attempt(pt):
        try:
            return one(pt), None
        except (RuntimeError, OSError) as e:                  # OSError: no pdflatex here
            return None, f"{pt:g} pt: {e}"

    with ThreadPoolExecutor(max_workers=max(1, jobs)) as pool:
        done = list(pool.map(attempt, PREVIEW_MEASURES)) if ids else []
    for name in os.listdir(cache_dir):                       # what no build has used for two weeks goes
        path = os.path.join(cache_dir, name)
        if os.path.getmtime(path) < time.time() - 14 * 86400:
            os.remove(path)
    measures = [m for m, _ in done if m]
    return {"ids": ids, "measures": measures} if measures else None, [e for _, e in done if e]


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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("main", help="print a stitched main.tex")
    m.add_argument("--bodies", default=os.path.join(paths.BANK_DATA_DIR, "bodies.json"))
    m.add_argument("--ids", default="all", help="IDs in PDF order, e.g. 5,3,1-2 (default: all, ascending)")
    m.add_argument("--variant", choices=("problems", "solutions"), default="problems")
    m.add_argument("--filters", default="")
    m.add_argument("--standalone", action="store_true")
    m.add_argument("--show-methods", action="store_true", help="add the Methods line under each heading")
    v = sub.add_parser("preview", help="print one statement's preview document (bank-compile.js::makePreview)")
    v.add_argument("--bodies", default=os.path.join(paths.BANK_DATA_DIR, "bodies.json"))
    v.add_argument("--id", type=int, required=True)
    v.add_argument("--width", type=float, default=None, help="the measure in pt (default: the sheets')")
    a = ap.parse_args(argv)
    with open(a.bodies, encoding="utf-8") as f:
        data = json.load(f)
    bodies = data["problems"]
    if a.cmd == "preview":
        sys.stdout.write(make_preview(bodies, a.id, a.width))
        return 0
    ids = parse_ids(a.ids, [int(k) for k in bodies])
    sys.stdout.write(make_main(bodies, ids, a.variant, a.filters, a.standalone, a.show_methods, data.get("appendix")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
