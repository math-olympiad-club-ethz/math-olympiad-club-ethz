"""Parse and validate problem files.

    problems/NNNN-title.tex   a numbered problem (NNNN = its ID, never changes)
    problems/new-title.tex    a proposed problem, not numbered yet: after it is merged into main, a GitHub
                              Action renames it to the next free NNNN-title.tex (bank/number.py)
"""
import datetime
import os
import re
import unicodedata

from .bib import CITE_RE, bib_block, parse_bib_entries

HEADER_KEYS = ["title", "area", "methods", "difficulty", "difficulty-ai", "status",
               "review", "origin", "origin-date", "origin-number", "also-in", "taken-from",
               "references", "history"]
LIST_KEYS = {"area", "methods", "also-in"}
ENUMS = {
    "difficulty": {"", "easy", "medium", "hard", "extreme"},
    "difficulty-ai": {"", "easy", "medium", "hard", "extreme"},
    "status": {"", "partial"},
    "review": {"", "none", "ai", "human"},
    "history": {"", "none", "ai", "human"},
}
FILENAME_RE = re.compile(r"^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.tex$")
NEW_FILENAME_RE = re.compile(r"^new-([a-z0-9]+(?:-[a-z0-9]+)*)\.tex$")
UNTITLED = "Untitled problem"          # the title of a problem whose title field is blank
HEADER_LINE_RE = re.compile(r"^%\s*([a-z][a-z-]*)\s*:(.*)$")
HEADER_ANY_CASE_RE = re.compile(r"^%\s*([A-Za-z][A-Za-z-]*)\s*:")
MAX_ID = 9999                          # IDs have four digits (FILENAME_RE)
TITLE_FORBIDDEN = set('\\&%#{}~^_$')
MAX_TITLE_WORDS = 6
# Characters the club preamble can print in a title, an origin number or a tag name (measured with pdflatex, T1 +
# utf8 + lmodern, Greek declared in preamble.tex).  Mirrored in site/static/js/bank-propose.js::unprintable.
_NOT_IN_T1 = set("\u0126\u0127\u0138\u013f\u0140\u0149\u0166\u0167\u017f")
_PRINTABLE_EXTRA = set("\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u00b7\u2022\u20ac\u201e\u201a\u00ab\u00bb\u2020\u2021\u2030"
                       "\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6\u03b7\u03b8\u03b9\u03ba\u03bb\u03bc\u03bd\u03be\u03bf\u03c0\u03c1\u03c2"
                       "\u03c3\u03c4\u03c5\u03c6\u03c7\u03c8\u03c9\u03d1\u03d5\u03d6\u03f1\u03f5\u0391\u0392\u0393\u0394\u0395\u0396"
                       "\u0397\u0398\u0399\u039a\u039b\u039c\u039d\u039e\u039f\u03a0\u03a1\u03a3\u03a4\u03a5\u03a6\u03a7\u03a8\u03a9")


def unprintable(text, forbidden=TITLE_FORBIDDEN):
    """Characters of `text` that must not appear in a PDF heading: TeX specials (`forbidden`) and characters the
    preamble's fonts cannot print (math symbols such as √ ≤ ∑).  Sorted, without repeats."""
    def ok(c):
        o = ord(c)
        return c not in forbidden and (0x20 <= o <= 0x7e or (0xa0 <= o <= 0x17f and c not in _NOT_IN_T1) or c in _PRINTABLE_EXTRA)
    return sorted({c for c in text if not ok(c)})



# Lowercase letters that NFKD does not reduce to ASCII: spelled out, so that they do not vanish from file names.
# Same table as site/static/js/bank-propose.js::TRANSLIT (applied after NFKD and lowercasing: Æ, ẞ, Σ, ά, µ too).
TRANSLIT = {"ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i", "ħ": "h",
            "ŧ": "t", "ŋ": "ng", "ĸ": "k", "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta",
            "η": "eta", "θ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi", "ο": "omicron",
            "π": "pi", "ρ": "rho", "ς": "sigma", "σ": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi",
            "ω": "omega"}


def kebab(title):
    """Title -> filename slug: lowercase ASCII, hyphens.  Apostrophes vanish, other symbols
    become hyphens: "Simon's favourite factoring trick" -> simons-favourite-factoring-trick."""
    s = unicodedata.normalize("NFKD", title)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("'", "").replace("\u2019", "").lower()
    s = "".join(TRANSLIT.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


# % starts a comment unless it is escaped: \% is a percent sign, \\% a line break followed by a comment.
_COMMENT_RE = re.compile(r"(?<!\\)((?:\\\\)*)%[^\n]*")
# The block markers of a problem file (TeX also accepts spaces: "\begin {problem}").
BLOCK_RE = re.compile(r"\\(begin|end)\s*\{\s*(problem|solution|bibentries)\s*\}")


def mask_comments(tex):
    """`tex` with every % comment replaced by spaces: same length and newlines, so offsets found in it point into `tex`.
    Block markers, figures and definitions are looked for in what LaTeX reads, not in comments.
    Mirrored in site/static/js/bank-tex.js."""
    return _COMMENT_RE.sub(lambda m: m.group(1) + " " * (len(m.group(0)) - len(m.group(1))), tex)


def _split_list(v):
    return [x.strip() for x in v.split(",") if x.strip()]


def parse_problem_file(path):
    """Return a dict describing the file.  Never raises on bad content: problems are
    collected in p['errors'] as (line, message) tuples; more checks in validate()."""
    p = {"path": path, "file": os.path.basename(path), "errors": [], "header": {}, "header_lines": {}}
    m = FILENAME_RE.match(p["file"])
    n = None if m else NEW_FILENAME_RE.match(p["file"])
    p["id"] = int(m.group(1)) if m else None
    p["slug"] = m.group(2) if m else (n.group(1) if n else None)
    p["new"] = bool(n)                 # proposed, not numbered yet
    if not m and not n:
        p["errors"].append((1, "file name must look like 0042-roots-on-the-unit-circle.tex (four digits, hyphen, lowercase "
                               "kebab-case title), or new-roots-on-the-unit-circle.tex for a proposed problem not numbered yet"))
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as err:
        text = raw.decode("utf-8", errors="replace")
        p["errors"].append((raw[:err.start].count(b"\n") + 1, f"the file is not UTF-8 (byte 0x{raw[err.start]:02x}): save it as UTF-8"))
    if text.startswith("\ufeff"):             # a byte order mark would hide the first header line
        text = text[1:]
    text = text.replace("\r\n", "\n").replace("\r", "\n")      # universal newlines, as text-mode reading did
    lines = text.split("\n")
    body_start = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("%"):
            hm = HEADER_LINE_RE.match(s)
            if hm:
                key, val = hm.group(1), hm.group(2).strip()
                if key not in HEADER_KEYS:
                    p["errors"].append((i + 1, f"unknown header field '{key}' (allowed: {', '.join(HEADER_KEYS)})"))
                elif key in p["header"]:
                    p["errors"].append((i + 1, f"header field '{key}' given twice"))
                else:
                    p["header"][key] = val
                    p["header_lines"][key] = i + 1
            else:                               # "% Review: human" would otherwise be a plain comment, silently
                cm = HEADER_ANY_CASE_RE.match(s)
                if cm and cm.group(1).lower() in HEADER_KEYS:
                    p["errors"].append((i + 1, f"write the header field in lowercase: '% {cm.group(1).lower()}:' "
                                               "(as written, the line is ignored)"))
            continue
        if s == "":
            continue
        body_start = i
        break
    else:
        body_start = len(lines)
    p["body"] = "\n".join(lines[body_start:])
    p["body_line"] = body_start + 1
    h = p["header"]
    for k in LIST_KEYS:
        p[k.replace("-", "_")] = _split_list(h.get(k, ""))
    p["title"] = h.get("title", "").strip() or UNTITLED
    for k in ("difficulty", "difficulty-ai", "status", "review", "history", "origin",
              "origin-date", "origin-number", "taken-from", "references"):
        p[k.replace("-", "_")] = h.get(k, "").strip()
    p["review"] = p["review"] or "none"
    p["history"] = p["history"] or "none"
    body = p["body"]
    # block markers outside % comments: [(begin|end, problem|solution|bibentries, start, end)] in file order
    p["blocks"] = [(m.group(1), m.group(2), m.start(), m.end()) for m in BLOCK_RE.finditer(mask_comments(body))]
    begins = [b[1] for b in p["blocks"] if b[0] == "begin"]
    p["n_problem_blocks"] = begins.count("problem")
    p["n_solution_blocks"] = begins.count("solution")
    p["n_bib_blocks"] = begins.count("bibentries")
    # a solution written INSIDE the problem block would print in every problems-only PDF: it must start after \end{problem}
    end_p = next((b for b in p["blocks"] if b[:2] == ("end", "problem")), None)
    beg_s = next((b for b in p["blocks"] if b[:2] == ("begin", "solution")), None)
    p["solution_inside_problem"] = bool(beg_s and (not end_p or beg_s[2] < end_p[2]))
    p["has_solution"] = p["n_solution_blocks"] >= 1
    p["solved"] = p["has_solution"] and p["status"] != "partial"
    p["difficulty_effective"] = p["difficulty"] or p["difficulty_ai"] or "unrated"
    p["bibtex"] = bib_block(body)
    p["bib_entries"] = parse_bib_entries(p["bibtex"])
    return p


def without_bibentries(body):
    """The body with every bibentries block blanked out (its newlines kept, so line numbers still match)."""
    return re.sub(r"\\begin\{bibentries\}.*?\\end\{bibentries\}", lambda m: "\n" * m.group(0).count("\n"), body, flags=re.S)


DATE_RE = re.compile(r"([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?")


def _valid_date(s, allow_partial=False):
    """YYYY-MM-DD (or YYYY / YYYY-MM with allow_partial): ASCII digits and a real calendar date, year 0001 or later.
    One explicit grammar, so the answer does not depend on the Python version.  Mirrored in bank-propose.js::validDate."""
    m = DATE_RE.fullmatch(s)
    if not m or (not allow_partial and m.group(3) is None):
        return False
    try:
        datetime.date(int(m.group(1)), int(m.group(2) or 1), int(m.group(3) or 1))
    except ValueError:
        return False
    return True


# Preamble-only LaTeX (also with spaces TeX accepts, e.g. "\end {document}").  Same list in bank-propose.js.
FORBIDDEN_TEX = [
    (r"\\documentclass(?![A-Za-z@])", "\\documentclass"),
    (r"\\usepackage(?![A-Za-z@])", "\\usepackage"),
    (r"\\(begin|end)\s*\{\s*document\s*\}|\\(end|begin)document(?![A-Za-z@])", "\\begin{document} / \\end{document}"),
    (r"\\input\s*\{\s*preamble", "\\input{preamble}"),
    (r"\\maketitle(?![A-Za-z@])", "\\maketitle"),
]

# TeX that reaches beyond the problem's own text.  A PDF from the website is ONE document holding many problems, so a
# problem must not change the ones after it (global definitions, hooks, category codes, leaving its own group early,
# printing a heading), and CI compiles every problem on its runner, so it must not read or write other files.
# Checked on the whole body, comments and bibentries included, like FORBIDDEN_TEX.  Same list in bank-propose.js.
UNSAFE_TEX = [
    (r"\\(?:global|globaldefs|gdef|xdef|edef|def|let|futurelet|chardef|mathchardef|countdef|dimendef|skipdef|muskipdef|"
     r"toksdef|aftergroup|begingroup|csname|scantokens|catcode|makeatletter|makeatother|ExplSyntaxOn|everypar|everymath|"
     r"everydisplay|everyhbox|everyvbox|everycr|everyeof|everyjob|output|shipout|dump|batchmode|nonstopmode|scrollmode|"
     r"errorstopmode|AtBeginDocument|AtEndDocument|AtBeginShipout|AtBeginEnvironment|AtEndEnvironment|AddToHook|"
     r"AddToHookNext|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|"
     r"NewDocumentEnvironment|RenewDocumentEnvironment|ProvideDocumentEnvironment|DeclareDocumentEnvironment|"
     r"NewCommandCopy|RenewCommandCopy|DeclareCommandCopy|NewEnvironmentCopy|RenewEnvironmentCopy|"
     r"DeclareEnvironmentCopy)(?![A-Za-z@])|\\end[A-Za-z]+|\^\^",
     "it could change the other problems of a PDF (define macros with \\newcommand inside the block)"),
    (r"\\(?:begin|end)(?![A-Za-z@])(?![ \t\n]*\{[ \t\n]*[A-Za-z*]+[ \t\n]*\})",
     "write the environment name in braces right after it, e.g. \\begin{align*}"),
    (r"\\(?:newcounter|newlength|newtheorem|newsavebox|newif|newcount|newdimen|newskip|newmuskip|newtoks|newbox|"
     r"newread|newwrite|newlanguage|newfam|newinsert)(?![A-Za-z@])",
     "it defines a name for the whole PDF, which another problem may define too (use the club's environments, e.g. lemma)"),
    (r"\\(?:input|include|includegraphics|includeonly|InputIfFileExists|IfFileExists|lstinputlisting|verbatiminput|"
     r"VerbatimInput|openin|closein|read|readline|openout|closeout|write|immediate|ShellEscape)(?![A-Za-z@])",
     "a problem is one self-contained file (no other files, no images: draw with TikZ)"),
    (r"\\(?:today|year|month|day|time|pdf[A-Za-z]+)(?![A-Za-z@])",
     "the same problems must always give the same PDF (no date, clock, random numbers or pdfTeX primitives)"),
    (r"\\(?:[Bb]ank[A-Za-z]*|refitem)(?![A-Za-z@])|\{[ \t\n]*problemreferences[ \t\n]*\}",
     "it belongs to the website's PDF layout (headings, reference lists)"),
]
# The citation commands the website resolves (bank/bib.py::CITE_RE); \nocite is harmless.
SUPPORTED_CITES = {"cite", "citep", "citet", "parencite", "textcite", "autocite", "Cite", "Parencite", "Textcite",
                   "Autocite", "supercite", "footcite", "nocite"}
CITE_COMMAND_RE = re.compile(r"\\([A-Za-z]*[Cc]ite[A-Za-z]*)(?![A-Za-z@])")
# The order of the blocks: the problem, then optionally the solution, then optionally the bibentries (none nested).
_BLOCK_ORDERS = [[(k, n) for n in names for k in ("begin", "end")]
                 for names in (["problem"], ["problem", "solution"], ["problem", "bibentries"], ["problem", "solution", "bibentries"])]


def expected_file_name(p):
    """The file name the title asks for: NNNN-<kebab title>.tex, or new-<kebab title>.tex if not numbered yet."""
    return f"{'new' if p['id'] is None else format(p['id'], '04d')}-{kebab(p['title'])}.tex"


def _body_line(p, pos):
    return p["body_line"] + p["body"][:pos].count("\n")


def _block_order_error(blocks):
    """None, or the offset of the first block marker out of place (-1 when a marker is missing at the end)."""
    seq = [(k, n) for k, n, _, _ in blocks]
    if seq in _BLOCK_ORDERS:
        return None
    k = max(len(os.path.commonprefix([seq, order])) for order in _BLOCK_ORDERS)
    return blocks[k][2] if k < len(blocks) else -1


def validate(p, tags, bib_keys=None):
    """Append validation errors to p['errors'] (list of (line, message)).  Returns them.
    bib_keys: the keys of references.bib; when given, every \\cite key must exist there or in the
    problem's own bibentries block."""
    e = p["errors"]
    hl = p["header_lines"]

    def line(k):
        return hl.get(k, 1)

    bad = unprintable(p["title"])
    if bad:
        e.append((line("title"), f"title contains characters that cannot be printed in the heading {' '.join(bad)!r}; "
                                  "keep titles plain text (write math symbols in words)"))
    bad = unprintable(p["origin_number"])
    if bad:
        e.append((line("origin-number"), f"origin-number contains characters that cannot be printed in the heading {' '.join(bad)!r}; keep it plain text (e.g. A3, Problem 6)"))
    if len(p["title"].split()) > MAX_TITLE_WORDS:
        e.append((line("title"), f"title has {len(p['title'].split())} words; keep it to {MAX_TITLE_WORDS} or fewer"))
    if p["slug"] is not None and not kebab(p["title"]):
        e.append((line("title"), "the title needs at least one ASCII letter or digit (it gives the file name)"))
    elif p["slug"] is not None and kebab(p["title"]) != p["slug"]:
        e.append((line("title"), f"file name does not match the title; expected file name: {expected_file_name(p)}"))
    if not p["area"]:
        e.append((line("area") if "area" in hl else 1, "at least one '% area:' tag is required"))
    for a in p["area"]:
        if a not in tags["area"]:
            e.append((line("area"), f"unknown area tag '{a}' (add it to tags.yml or fix the spelling)"))
    for m in p["methods"]:
        if m not in tags["methods"]:
            e.append((line("methods"), f"unknown methods tag '{m}' (add it to tags.yml or fix the spelling)"))
    for k in ("area", "methods", "also-in"):
        items = p[k.replace("-", "_")]
        twice = sorted({x for x in items if items.count(x) > 1})
        if twice:
            e.append((line(k), f"'{k}' lists {', '.join(twice)} twice"))
    for k, allowed in ENUMS.items():
        v = p["header"].get(k, "").strip()
        if v not in allowed:
            e.append((line(k), f"'{k}' must be one of {sorted(x for x in allowed if x)} or empty, got '{v}'"))
    if p["origin_date"] and not _valid_date(p["origin_date"], allow_partial=True):
        e.append((line("origin-date"), f"'origin-date' must be YYYY, YYYY-MM or YYYY-MM-DD, got '{p['origin_date']}'"))
    if p["origin"] and p["origin"] not in tags["origin"]:
        e.append((line("origin"), f"unknown origin '{p['origin']}' (add it to tags.yml or fix the spelling)"))
    for o in p["also_in"]:
        if o not in tags["origin"]:
            e.append((line("also-in"), f"unknown origin '{o}' in also-in"))
    # The whole body, bibentries included: BibTeX fields are printed verbatim into the website's reference list.
    text = p["body"]

    def at(pos):                                 # line of an offset in `text` (same newlines as the body)
        return p["body_line"] + text[:pos].count("\n")

    blocks = p["blocks"]
    n_before = len(e)
    if p["n_problem_blocks"] != 1:
        e.append((p["body_line"], f"the file must contain exactly one \\begin{{problem}}...\\end{{problem}} block (found {p['n_problem_blocks']})"))
    if p["n_solution_blocks"] > 1:
        e.append((p["body_line"], f"at most one \\begin{{solution}} block is allowed (found {p['n_solution_blocks']})"))
    if p["n_bib_blocks"] > 1:
        e.append((p["body_line"], f"at most one \\begin{{bibentries}} block is allowed (found {p['n_bib_blocks']})"))
    if p["solution_inside_problem"]:
        e.append((p["body_line"], "the solution block must come after \\end{problem}, not inside the problem block (it would print in the problems-only PDF)"))
    structure_ok = len(e) == n_before
    if structure_ok:
        pos = _block_order_error(blocks)
        if pos is not None:
            structure_ok = False
            e.append((at(pos) if pos >= 0 else at(len(text.rstrip())),
                      "the blocks must be \\begin{problem}...\\end{problem}, then optionally \\begin{solution}...\\end{solution}, "
                      "then optionally \\begin{bibentries}...\\end{bibentries}, each closed before the next one starts"))
    masked = mask_comments(text)
    if structure_ok:
        # Only the inside of the blocks reaches the website: anything else (a macro, a hint) would be lost there.
        rest = list(masked)
        for i in range(0, len(blocks), 2):
            for j in range(blocks[i][2], blocks[i + 1][3]):
                if rest[j] != "\n":
                    rest[j] = " "
        rest = "".join(rest)
        for ln in sorted({at(m.start()) for m in re.finditer(r"\S+", rest)}):
            e.append((ln, "text outside the problem, solution and bibentries blocks does not reach the website: "
                          "move it into a block, or make it a % comment"))
        # The problems-only PDF and Preview hold the statement alone: a reference into the solution would print ??.
        from .stitch import label_refs
        statement = masked[blocks[0][3]:blocks[1][2]]
        solution = masked[blocks[2][3]:blocks[3][2]] if p["has_solution"] else ""
        st_targets, st_refs = label_refs(statement)
        so_targets = label_refs(solution)[0]
        reported = set()
        for k, pos in st_refs:
            if k not in st_targets and k in so_targets and k not in reported:
                reported.add(k)
                e.append((at(blocks[0][3] + pos), f"the statement refers to '{k}', which is labelled in the solution: the "
                                                  "problems-only PDF would print ?? (label it in the statement, or refer to it only in the solution)"))
    if p["status"] == "partial" and not p["has_solution"]:
        e.append((line("status"), "status: partial only makes sense when there is a (partial) solution block"))

    for rx, label in FORBIDDEN_TEX:
        mm = re.search(rx, text)
        if mm:
            e.append((at(mm.start()), f"problem files must not contain {label}: the preamble is added automatically"))
    for rx, why in UNSAFE_TEX:
        mm = re.search(rx, text)
        if mm:
            e.append((at(mm.start()), f"problem files must not contain {mm.group(0)}: {why}"))
    for mm in CITE_COMMAND_RE.finditer(text):
        if mm.group(1) not in SUPPORTED_CITES:
            e.append((at(mm.start()), f"\\{mm.group(1)} is not supported on the website: write \\cite{{key}} (or \\cite[p.~3]{{key}})"))
            break
    mm = re.search(r"\\(bibliography|addbibresource|bibliographystyle)\s*[\[{]", text)
    if mm:
        e.append((at(mm.start()), f"remove \\{mm.group(1)}: citations are resolved automatically from references.bib and the bibentries block"))
    for mm in re.finditer(r"\\(begin|end)(\s*\{\s*(problem|solution|bibentries)\s*\})", text):
        if mm.group(2) != "{" + mm.group(3) + "}":
            e.append((at(mm.start()), f"write \\{mm.group(1)}{{{mm.group(3)}}} without spaces"))
    mm = re.search(r"\\tikz(?![A-Za-z@])", text)
    if mm:
        e.append((at(mm.start()), "inline \\tikz is not supported: draw inside \\begin{tikzpicture}...\\end{tikzpicture} "
                                            "(the website turns tikzpicture and tikzcd environments into images)"))
    own = [k for k, _ in p["bib_entries"]]
    if p["bibtex"].strip() and not own:
        e.append((_body_line(p, p["body"].find("\\begin{bibentries}")), "the bibentries block contains no BibTeX entry (expected @article{key, author = {...}, ...})"))
    if any(not k for k in own):
        e.append((_body_line(p, p["body"].find("\\begin{bibentries}")), "a BibTeX entry in the bibentries block has no key (@article{key, ...})"))
    dup = sorted({k for k in own if k and own.count(k) > 1})
    if dup:
        e.append((_body_line(p, p["body"].find("\\begin{bibentries}")), f"BibTeX key(s) given twice in the bibentries block: {', '.join(dup)}"))
    if bib_keys is not None:
        known = set(bib_keys) | set(own)
        reported = set()
        cited = without_bibentries(text)          # same newlines as the body: its own offsets give the line
        for m in CITE_RE.finditer(cited):
            for k in (k.strip() for k in m.group(3).split(",")):
                if k and k not in known and k not in reported:
                    reported.add(k)
                    e.append((p["body_line"] + cited[:m.start()].count("\n"), f"citation key '{k}' is neither in references.bib nor in this file's bibentries block"))
    return e


def check_ids(problems):
    """Cross-file checks: duplicate IDs.  Returns list of (path, line, message)."""
    out, seen = [], {}
    for p in problems:
        if p["id"] is None:
            continue
        if p["id"] in seen:
            out.append((p["path"], 1, f"duplicate ID {p['id']:04d}: also used by {seen[p['id']]}"))
        else:
            seen[p["id"]] = p["file"]
    return out


def origin_label(p, tags):
    """Human-readable origin for PDF headings: 'Putnam 1989, A3' (empty if unknown)."""
    if not p["origin"]:
        return ""
    name = tags["origin"][p["origin"]]["name"] if p["origin"] in tags["origin"] else p["origin"]
    parts = [name]
    if p["origin_date"]:
        parts.append(p["origin_date"][:4])
    s = " ".join(parts)
    if p["origin_number"]:
        s += f", {p['origin_number']}"
    return s


def load_problems(problems_dir="problems"):
    files = sorted(f for f in os.listdir(problems_dir) if f.endswith(".tex") and not f.startswith("_"))
    return [parse_problem_file(os.path.join(problems_dir, f)) for f in files]


# What may sit in problems/ besides the problem files: the helpers, and local leftovers that .gitignore keeps out of the
# repository (preview PDFs of _preview.tex, LaTeX aux files, Finder metadata, LaTeX Workshop save errors).
HELPER_FILES = {"_preview.tex", "_template.tex", "_last-id.txt", ".DS_Store"}
LOCAL_LEFTOVERS = (".pdf", ".synctex.gz", ".synctex(busy)", ".aux", ".log", ".out", ".fls", ".fdb_latexmk", ".bbl", ".bcf",
                   ".blg", ".run.xml", ".toc", ".xdv", ".dvi", "-SAVE-ERROR")


def stray_files(problems_dir="problems"):
    """(path, line, message) for every entry of problems/ that is neither a problem file nor a helper.  load_problems
    reads only *.tex, so a file whose extension was forgotten or mistyped (new-foo, 0081-x.TEX) would otherwise be
    skipped silently, and a latexmkrc there would run on the maintainer's machine at the next preview."""
    out = []
    for f in sorted(os.listdir(problems_dir)):
        path = os.path.join(problems_dir, f)
        if f in HELPER_FILES or f.endswith(LOCAL_LEFTOVERS):
            continue
        if f.endswith(".tex") and not f.startswith("_") and os.path.isfile(path):
            continue                            # a problem file: parse_problem_file checks its name
        out.append((path, 1, "not a problem file: problems are named NNNN-title.tex or new-title.tex, and nothing else "
                             "belongs in this folder"))
    return out
