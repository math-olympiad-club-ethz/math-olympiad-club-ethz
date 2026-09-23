"""BibTeX for the problem bank: the shared references.bib and the optional per-problem block

    \\begin{bibentries}
    @article{key, author = {...}, title = {...}, ...}
    \\end{bibentries}

at the end of a problem file (entries used only by that problem; LaTeX skips the block, see preamble.tex).
The browser mirror of this module is site/static/js/bank-tex.js (parity-tested).
"""
import re

BIB_BLOCK_RE = re.compile(r"\\begin\{bibentries\}(.*?)\\end\{bibentries\}", re.S)
# Also \cite*{k} and the spaces TeX allows ("\cite [p.~3] {k}"); other biblatex commands are rejected by the validator.
# The optional notes are bounded (many unclosed "\cite[" would take quadratic time).  Same regex in bank-tex.js.
CITE_RE = re.compile(r"\\(?:cite|citep|citet|parencite|textcite|autocite|Cite|Parencite|Textcite|Autocite|supercite|footcite)"
                     r"\*?(?![A-Za-z@])[ \t\n]*(?:\[([^\]]{0,300})\][ \t\n]*)?(?:\[([^\]]{0,300})\][ \t\n]*)?\{([^{}]*)\}")
DROP_RE = re.compile(r"^[ \t]*\\(printbibliography|nocite\{[^}]*\}|bibliography\{[^}]*\}|bibliographystyle\{[^}]*\}|addbibresource\{[^}]*\})[^\n]*\n?", re.M)


def parse_bib_entries(text):
    """Tiny BibTeX parser: [(key, {"type": t, field: value})] in file order (duplicates kept).
    Tolerates stray braces between entries; @comment / @preamble / @string are skipped."""
    entries = []
    i = 0
    while True:
        i = text.find("@", i)
        if i < 0:
            break
        m = re.match(r"@(\w+)\s*\{", text[i:])
        if not m:
            i += 1
            continue
        etype = m.group(1).lower()
        j = i + m.end()
        depth, k = 1, j
        while k < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[k], 0)
            k += 1
        body = text[j:k - 1]
        i = k
        if etype in ("comment", "preamble", "string"):
            continue
        key, _, rest = body.partition(",")
        fields = {"type": etype}
        pos = 0
        while pos < len(rest):
            fm = re.compile(r"\s*(\w+)\s*=\s*", re.S).match(rest, pos)
            if not fm:
                break
            name = fm.group(1).lower()
            pos = fm.end()
            if pos >= len(rest):
                break
            if rest[pos] == "{":
                depth, q = 1, pos + 1
                while q < len(rest) and depth:
                    depth += {"{": 1, "}": -1}.get(rest[q], 0)
                    q += 1
                val = rest[pos + 1:q - 1]
                pos = q
            elif rest[pos] == '"':
                q = rest.find('"', pos + 1)
                if q < 0:
                    q = len(rest)
                val = rest[pos + 1:q]
                pos = q + 1
            else:
                vm = re.compile(r"[^,\s]+").match(rest, pos)
                if not vm:
                    break
                val = vm.group(0)
                pos = vm.end()
            fields[name] = " ".join(val.split())
            cm = re.compile(r"\s*,").match(rest, pos)
            pos = cm.end() if cm else len(rest)
        entries.append((key.strip(), fields))
    return entries


def parse_bib_text(text):
    """{key: fields}; a later duplicate key wins."""
    return {k: f for k, f in parse_bib_entries(text)}


def parse_bib(path):
    with open(path, encoding="utf-8") as f:
        return parse_bib_text(f.read())


def bib_block(body):
    """Inner text of the problem's bibentries block ('' if none)."""
    m = BIB_BLOCK_RE.search(body)
    return m.group(1) if m else ""


def cite_keys(tex):
    """Every citation key used in `tex`, in order of first use."""
    out = []
    for m in CITE_RE.finditer(tex):
        for k in m.group(3).split(","):
            k = k.strip()
            if k and k not in out:
                out.append(k)
    return out


def _unwrap(t):
    """'{Title}' -> 'Title' (repeatedly), but only when one balanced group wraps it all: 'On {Euler}' stays."""
    while len(t) >= 2 and t[0] == "{" and t[-1] == "}":
        depth = 0
        for c in t[1:-1]:
            depth += {"{": 1, "}": -1}.get(c, 0)
            if depth < 0:
                return t
        if depth:
            return t
        t = t[1:-1]
    return t


def _authors(s):
    out = []
    for a in re.split(r"\s+and\s+", s):
        a = a.strip()
        if "," in a:
            last, first = [x.strip() for x in a.split(",", 1)]
            a = f"{first} {last}".strip()
        out.append(a)
    if len(out) <= 2:
        return " and ".join(out)
    return ", ".join(out[:-1]) + ", and " + out[-1]


def format_entry(e):
    """Plain LaTeX text for one bibliography entry (numeric style)."""
    parts = []
    if e.get("author"):
        parts.append(_authors(e["author"]) + ",")
    if e.get("title"):
        parts.append("\\emph{%s}," % _unwrap(e["title"]))
    if e.get("journal"):
        j = e["journal"]
        if e.get("volume"):
            j += " \\textbf{%s}" % e["volume"]
        if e.get("number"):
            j += " (%s)" % e["number"]
        if e.get("year"):
            j += ", %s" % e["year"]
        if e.get("pages"):
            j += ", pp.~%s" % e["pages"]
        parts.append(j + ".")
    else:
        tail = []
        if e.get("publisher"):
            tail.append(e["publisher"])
        if e.get("howpublished"):
            tail.append(e["howpublished"])
        if e.get("year"):
            tail.append(e["year"])
        if tail:
            parts.append(", ".join(tail) + ".")
    if e.get("eprint") and e.get("archiveprefix", "").lower() == "arxiv":
        parts.append("arXiv:%s." % e["eprint"])
    if e.get("doi"):
        parts.append("\\href{https://doi.org/%s}{\\nolinkurl{doi:%s}}." % (e["doi"], e["doi"]))    # DOIs may contain _
    elif e.get("url"):
        parts.append("\\url{%s}." % e["url"])
    if e.get("note") and "arXiv" not in e["note"]:
        parts.append(e["note"] + ".")
    return " ".join(parts)
