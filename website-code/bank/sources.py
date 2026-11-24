"""Where a problem comes from, as the website and its PDFs say it: a name and one link.

A problem file says its origin twice.  The header fields `origin`, `origin-date` and `origin-number` say it in tags:
"IMC 2012, Day 2, Problem 2" (problems.origin_label).  The `references` line is the note of the history pass:

    Earliest known appearance (to the best of our knowledge): <the source> - <its link>; <another source> - <link>; ...

The note is a research record: it holds answers, working remarks and every page that was opened.  The site does not
show it.  It shows the source by name, as a link to where it can be read (source()):

  * a competition is named by its origin label;
  * a paper, a journal, a book or a historical text is named by the note, which starts with it as one would cite it
    (citation()): the tags of these (PUBLICATIONS) name a kind of source, "Research paper", not a source.  A note that
    does not start that way leaves the origin label, and the build says so (build.py);
  * the link is the first one of the note (link()).

Nothing is typed per problem here: change the header and the site follows.  How to write the line so that it reads
well: problem-bank/README.md ("What the website shows of them").

    python3 -m bank.sources            # every problem: its source and its link, as the site says them
    python3 -m bank.sources --check    # ask each link for its page too, and list the ones that do not answer

Links die (a site moves its files): run --check before a history pass, correct the headers it names.
"""
import argparse
import concurrent.futures
import re
import subprocess
import sys

from . import paths
from .problems import load_problems, origin_label, unprintable
from .tags import load_tags

# The origin tags that name a kind of publication (their `kind` in tags.yml): such a problem is named by its note.
PUBLICATIONS = {"book", "journal"}
PREFIX_RE = re.compile(r"^\s*Earliest known appearance\s*(?:\([^()]*\))?\s*:\s*", re.I)
NONE_FOUND_RE = re.compile(r"^(?:none|not)\s+(?:found|known)\b", re.I)
URL_RE = re.compile(r"https?://[^\s<>\"]+")
# Pages the site does not link to: copies of books put online without their publisher, and answers written for programs.
NOT_LINKED = ("vdoc.pub", "dokumen.pub", "pdfcoffee.com", "pdfdrive.com", "libgen.", "sci-hub.", "z-lib.", "zlibrary.",
              "annas-archive.", "google.com/books/feeds")
# A page for people where the note opened one for programs: a DOI's page, not its record at Crossref; a Putnam paper
# of Kedlaya's archive as its PDF, not its TeX source (the archive has both for every year).
FOR_READERS = [
    (re.compile(r"^https?://api\.crossref\.org/works/(10\.[^?#]+)$"), r"https://doi.org/\1"),
    (re.compile(r"^(https://kskedlaya\.org/putnam-archive/\d{4}s?)\.tex$"), r"\1.pdf"),
    (re.compile(r"^http://web\.archive\.org/"), "https://web.archive.org/"),
]
# Addresses a site no longer serves, and where the same thing is now (seen 2026-11-24, with --check).  The headers still
# carry the old ones: correct them there at the next history pass, then drop the line here (TODO.md).
MOVED = [
    # the IMC site keeps its papers under /archive/problems/<year>/ now, their names changed: the page of the year lists them
    (re.compile(r"^https?://(?:www\.)?imc-math\.org\.uk/imc(\d{4})/[^/?#]+\.pdf$"), r"https://www.imc-math.org.uk/?year=\1&item=problems"),
    # ICMC: /files/2024-2025/ICMC_8.2_paper.pdf is /files/8_2_paper.pdf
    (re.compile(r"^https?://(?:www\.)?icmathscomp\.org/files/\d{4}-\d{4}/ICMC_(\d+)\.(\d+)_(paper|solutions)\.pdf$"),
     r"https://icmathscomp.org/files/\1_\2_\3.pdf"),
]
MAX_CITATION = 280                                   # characters: three lines under a PDF heading
FORMULA = set("=≡≠≤≥<>+^_{}\\|∘∈")                   # a citation has no formula: one starts a remark
OPENING = {"(": ")", "[": "]"}
QUOTES = "'\"‘“"
# What a citation abbreviates in small letters at the start of a parenthesis: "(eds.)", "(vol. 2)".
ABBREVIATIONS = {"ed", "eds", "vol", "no", "pp", "p", "trans", "transl"}


def note(references):
    """The references line without its standing first words."""
    return PREFIX_RE.sub("", references or "", count=1).strip()


def _as_written(url):
    """A link as found in running text: without the punctuation that follows it there."""
    while url:
        last = url[-1]
        if last in ".,;:!?'" or (last in ")]" and url.count(last) > url.count("(["[")]".index(last)])):
            url = url[:-1]
        else:
            break
    return url


def _clean_url(url):
    """The address the site links to for a link of a note: a page for people (FOR_READERS), where it is now (MOVED)."""
    url = _as_written(url)
    for old, new in FOR_READERS + MOVED:
        url = old.sub(new, url)
    return url


def _top_level(text, start=0):
    """(index, character) for each character of `text` outside parentheses and brackets, from `start`."""
    closing = []
    for i in range(start, len(text)):
        c = text[i]
        # "6(c)", "80(9)": a parenthesis that follows a letter or a digit is part of a word, unless one is open already
        if c in OPENING and (c != "(" or closing or i == 0 or not text[i - 1].isalnum()):
            closing.append(OPENING[c])
        elif closing and c == closing[-1]:
            closing.pop()
        elif not closing:
            yield i, c


def first_item(text):
    """The part of a note that is about its first source: up to the first semicolon (outside brackets) after which
    another source starts, with a capital letter.  A semicolon followed by a small letter is within a remark."""
    for i, c in _top_level(text):
        if c == ";" and text[i + 1:].lstrip()[:1].isupper():
            return text[:i]
    return text


def link(references, publication=False):
    """The link of the source: the first link of the note (for a publication, of its first source only: the next ones
    belong to other works).  None when the note says that no source was found, or holds no link the site shows."""
    text = note(references)
    if NONE_FOUND_RE.match(text):
        return None
    for m in URL_RE.finditer(first_item(text) if publication else text):
        url = _clean_url(m.group(0))
        if url and not any(h in url for h in NOT_LINKED):
            return url
    return None


def _is_remark(inside):
    """What a parenthesis holds: a remark, "(the root f of ...)", or a part of the citation, "(1976)", "(eds.)"."""
    words = inside.split()
    if not words or len(words) > 5 or any(c in inside for c in ":;") or FORMULA & set(inside):
        return True
    return words[0][0].islower() and words[0].rstrip(".,") not in ABBREVIATIONS


def _closing(text, i):
    """The index of the parenthesis that closes the one at `i`, -1 if none does."""
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "(":
            depth += 1
        elif text[j] == ")":
            depth -= 1
            if depth == 0:
                return j
    return -1


def _cut(text, start):
    """(citation, end): the citation that starts at `start` goes up to `end`, where the first remark begins: a
    semicolon, a colon before a quotation or a small letter, " - ", a DOI, a parenthesis that holds a remark."""
    for i, c in _top_level(text, start):
        rest = text[i + 1:]
        if (c == ";" or (c == ":" and rest[:1] == " " and (rest[1:2] in QUOTES or rest[1:2].islower()))
                or (c == " " and (rest[:2] == "- " or re.match(r"doi:|DOI[ :]", rest)))):
            return text[start:i], i
        if c == " " and rest[:1] == "(":
            close = _closing(text, i + 1)
            if close < 0 or _is_remark(text[i + 2:close]):
                return text[start:i], i
    return text[start:], len(text)


def _typography(text):
    """Quotation marks in pairs and the dash of a range, as a book prints them: 'x' -> ‘x’, "x" -> “x”, 593-610 ->
    593–610 (not a date or a number in several parts: 2025-04-01)."""
    text = re.sub(r"(?<![\d-])(\d+)-(\d+)(?![\d-])", "\\1–\\2", text)
    text = re.sub(r"(^|[\s(\[])\"(?=\S)(.+?)(?<=\S)\"(?=$|[\s.,;:)\]'])", "\\1“\\2”", text)
    return re.sub(r"(^|[\s(\[])'(?=\S)(.+?)(?<=\S)'(?=$|[\s.,;:)\]])", "\\1‘\\2’", text)


def citation(references):
    """The source as the note cites it: its first words, up to the first remark (_cut) or the first link.  "" when the
    note does not start with a citation."""
    text = note(references)
    m = URL_RE.search(text)
    if m:
        text = text[:m.start()]
    if NONE_FOUND_RE.match(text):
        return ""
    out, end = _cut(text, 0)
    if out[:1].islower():                           # a lead-in, "as a lemma of ... (...), A. Author, Title": after it
        m = re.match(r"\s*(?:\([^()]*(?:\([^()]*\)[^()]*)*\))?\s*[,:]\s+", text[end:])
        if m:
            out, _ = _cut(text, end + m.end())
    parts = out.split(", ")
    for k, part in enumerate(parts):                 # a formula: a remark without its parenthesis
        if FORMULA & set(part):
            parts = parts[:k]
            break
    out = ", ".join(parts).strip(" ,;:-–")
    if len(out) < 12 or len(out) > MAX_CITATION or not (out[0].isupper() or out[0].isdigit()):
        return ""
    return _typography(out)


def source(p, tags):
    """{"label", "url", "cited"} of the parsed problem `p`.  label: its origin as the PDF headings and the Problems
    page print it ("" if unknown); url: where it can be read, or None; cited: the label is the note's citation (False
    for a publication whose note does not start with one that a PDF can print: its label is its origin label)."""
    label = origin_label(p, tags)
    if not label:
        return {"label": "", "url": None, "cited": False}
    publication = (tags["origin"].get(p["origin"]) or {}).get("kind") in PUBLICATIONS
    cited = False
    if publication:
        named = citation(p["references"])
        if named and not unprintable(named, forbidden=set("\\{}~^")):      # the other TeX specials are escaped
            label, cited = named, True
    return {"label": label, "url": link(p["references"], publication), "cited": cited}


# What a link keeps as it is inside \href{...} in a heading; every other character goes as %XX.
_URL_KEEP = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._:/?#[]@!*+,;=%&")


def tex_url(url):
    """A link as \\href takes it inside the argument of a heading: characters TeX would read (spaces, ~ ^ { } \\ $,
    quotes, parentheses, letters outside ASCII) as %XX, then \\% \\# \\& \\_.  Mirrored in bank-compile.js::texUrl."""
    out = "".join(c if c in _URL_KEEP else "".join("%%%02X" % b for b in c.encode("utf-8")) for c in url)
    return re.sub(r"[%#&_]", lambda m: "\\" + m.group(0), out)


# ---- the command: what the site says of every problem, and whether its links still answer -------------------------
USER_AGENT = "Mozilla/5.0 (compatible; link check)"


def answer(url, timeout=25):
    """How the page at `url` answers a program: its HTTP status after redirections (0: no answer).  Asked with curl,
    which reads certificates as a browser does (Python refuses the chain of some of these sites)."""
    status = 0
    for how in (["-I"], ["-r", "0-1023"]):           # its headers; some servers refuse that: then its first bytes
        try:
            r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-L", "--max-time", str(timeout), "-A", USER_AGENT, "-w", "%{http_code}", *how, url],
                               capture_output=True, text=True, timeout=timeout + 10)
            status = int(r.stdout.strip() or 0)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            status = 0
        if 200 <= status < 300:
            break
    return status


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="ask each link for its page; exit 1 if one is gone")
    a = ap.parse_args(argv)
    tags = load_tags(paths.TAGS_FILE)
    rows = []
    for p in load_problems(paths.PROBLEMS_DIR):
        src = source(p, tags)
        publication = (tags["origin"].get(p["origin"]) or {}).get("kind") in PUBLICATIONS
        text = note(p["references"])
        written = next((_as_written(m.group(0)) for m in URL_RE.finditer(first_item(text) if publication else text)), None)
        rows.append({"file": p["file"], **src, "moved": written if src["url"] and written and any(old.match(written) for old, _ in MOVED) else None})
    for r in rows:
        print(f"{r['file'][:4]}  {r['label'] or '(no origin)'}\n      {r['url'] or '(no link)'}")
    moved = [r for r in rows if r["moved"]]
    if moved:
        print(f"\n{len(moved)} header(s) carry an address its site no longer serves (the site links where it is now, MOVED): "
              + ", ".join(r["file"][:4] for r in moved))
    if not a.check:
        return 0
    urls = sorted({r["url"] for r in rows if r["url"]})
    print(f"\nasking {len(urls)} pages…", flush=True)
    with concurrent.futures.ThreadPoolExecutor(3) as pool:        # more at once, and some servers stop answering
        answers = dict(zip(urls, pool.map(answer, urls)))
    gone = [(u, s) for u, s in answers.items() if s in (404, 410)]
    unsure = [(u, s) for u, s in answers.items() if not 200 <= s < 300 and s not in (404, 410)]
    files = lambda u: ", ".join(r["file"][:4] for r in rows if r["url"] == u)
    for u, s in unsure:                              # 403: a site that turns programs away; 0 or 5xx: no answer this time
        print(f"did not answer a program ({s or 'nothing'}; open it in a browser to be sure): {files(u)}  {u}")
    for u, s in gone:
        print(f"GONE ({s}): {files(u)}  {u}")
    print(f"{len(urls) - len(gone) - len(unsure)} answer, {len(unsure)} did not answer a program, {len(gone)} gone")
    return 1 if gone else 0


if __name__ == "__main__":
    sys.exit(main())
