"""Validate every problem file and every shared result; optionally compile each one standalone.

    python3 -m bank.validate                 # checks on problem-bank/problems/ and problem-bank/appendix/
    python3 -m bank.validate --compile       # + pdflatex each problem (with its solution) and each shared result
    python3 -m bank.validate --compile --no-solution   # also compile the statement-only variant
    python3 -m bank.validate ../problem-bank/problems/0042-*.tex   # only some files (new-*.tex too)
    python3 -m bank.validate ../problem-bank/appendix/spectral-mapping-theorem.tex  # a shared result (compiled on its own)
The shared results of problem-bank/appendix/ are checked with the problems (bank/appendix.py); a problem's proof
compile prints the results its solution cites, as the website does.  Given problem files, the results they cite are
checked too.
Exit status 1 if anything is wrong.  Messages are file:line: message.
"""
import argparse
import concurrent.futures
import functools
import hashlib
import os
import re
import subprocess
import sys
import tempfile

from . import appendix as A
from . import paths
from . import problems as P
from .bib import parse_bib
from .stitch import COMPILE_TIMEOUT, PDFLATEX, split_body, tex_env, tex_escape
from .tags import TagError, load_tags

ROOT = paths.WEBSITE
TEXROOT = paths.BANK_DIR      # where preamble.tex and references.bib live

WRAPPER = r"""\documentclass[11pt]{article}
%(stitched)s\input{preamble}
\begin{document}
\bankproblem{1}{%(title)s}{%(origin)s}{%(id)s}
\input{%(body)s}
%(appendix)s\end{document}
"""
# One shared result on its own: its heading, its text, and the results it cites (read from problem-bank/appendix/).
ITEM_WRAPPER = r"""\documentclass[11pt]{article}
\input{preamble}
\begin{document}
\bankappendixneed{%(name)s}\bankappendixall
\end{document}
"""
PROOF_CACHE_VERSION = "2"     # bump when the way proofs are compiled changes (it is part of every cache key)


def proof_sources(p, tags, with_solution=True, stitched=False):
    """(main.tex, body.tex) of the standalone proof.  body.tex keeps the file's line numbers, so pdflatex's
    file:line errors point into the problem file.  The statement-only variant is exactly the statement the
    website compiles (stitch.split_body), not the body minus a regex."""
    body = p["body"]
    if not with_solution:
        statement, _ = split_body(body)
        first = body.find(statement) if statement else 0
        body = "\n" * body[:max(first, 0)].count("\n") + "\\begin{problem}" + statement + "\\end{problem}\n"
    body = "\n" * (p["body_line"] - 1) + body
    main = WRAPPER % {"title": tex_escape(p["title"]), "origin": tex_escape(P.origin_label(p, tags)),
                      "id": "new" if p["id"] is None else f"{p['id']:04d}", "body": "body.tex",
                      "stitched": r"\def\BankStitched{}" + "\n" if stitched else "",
                      # the results the solution cites, read from problem-bank/appendix/ (author mode only)
                      "appendix": "\\bankappendixall\n" if with_solution and not stitched else ""}
    return main, body


def problem_cites(p):
    """The shared results the solution of problem `p` cites (bank/appendix.py), in order of first citation."""
    _, solution = split_body(p["body"])
    return A.cited_names(solution) if solution is not None else []


def _appendix_digest(names, items):
    """What the shared results `names` and those they cite put into a compile (part of the proof cache key)."""
    by_name = {it["name"]: it for it in items or () if it["name"]}
    used = sorted(A.closure(names or [], {k: v["cites"] for k, v in by_name.items()}))
    if not used:
        return ""
    h = hashlib.sha256()
    for n in used:
        h.update(n.encode() + b"\0" + by_name[n]["body"].encode("utf-8") + b"\0")
    return h.hexdigest()


@functools.lru_cache(maxsize=None)
def _tex_inputs_digest():
    """What besides the problem decides a proof: preamble.tex, references.bib and the TeX installation."""
    h = hashlib.sha256(PROOF_CACHE_VERSION.encode())
    for f in (paths.PREAMBLE_FILE, paths.BIB_FILE):
        with open(f, "rb") as fh:
            h.update(fh.read())
    try:
        h.update(subprocess.run(["pdflatex", "--version"], capture_output=True, text=True).stdout.encode())
    except OSError:
        pass
    return h.hexdigest()


def compile_problem(p, tags, with_solution=True, stitched=False, keep_log=None, cache_dir=None, items=None):
    """Compile one problem standalone with pdflatex.  Returns (ok, error_excerpt).
    cache_dir: remember successful compiles there (by a hash of everything that goes in) and skip them next time.
    items: the shared results (bank/appendix.py::load_items, default: the folder); the ones the solution cites are
    part of the cache key."""
    main, body = proof_sources(p, tags, with_solution, stitched)
    extra = (_appendix_digest(problem_cites(p), A.folder_items() if items is None else items)
             if with_solution and not stitched else "")
    return _compile(main, {"body.tex": body}, extra, keep_log, cache_dir)


def compile_item(it, items=None, keep_log=None, cache_dir=None):
    """Compile one shared result on its own (author mode, with the results it cites).  Returns (ok, error_excerpt)."""
    main = ITEM_WRAPPER % {"name": it["name"]}
    return _compile(main, {}, _appendix_digest([it["name"]], A.folder_items() if items is None else items), keep_log, cache_dir)


def _compile(main, files, extra_key, keep_log, cache_dir):
    marker = None
    if cache_dir:
        key = hashlib.sha256((_tex_inputs_digest() + "\0" + main + "\0" + "\0".join(files[k] for k in sorted(files))
                              + "\0" + extra_key).encode("utf-8")).hexdigest()
        marker = os.path.join(cache_dir, key)
        if os.path.exists(marker):
            return True, ""
    with tempfile.TemporaryDirectory() as d:
        for name, text in files.items():
            with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                f.write(text)
        with open(os.path.join(d, "main.tex"), "w", encoding="utf-8") as f:
            f.write(main)
        try:
            r = subprocess.run(PDFLATEX + ["-file-line-error", "main.tex"],
                               cwd=d, env=tex_env(), capture_output=True, text=True, timeout=COMPILE_TIMEOUT)
            out = r.stdout
            code = r.returncode
        except subprocess.TimeoutExpired:
            return False, f"pdflatex timed out after {COMPILE_TIMEOUT} s"
        if keep_log:
            try:
                with open(os.path.join(d, "main.log"), encoding="utf-8", errors="replace") as f:
                    open(keep_log, "w").write(f.read())
            except OSError:
                pass
        if code == 0 and os.path.exists(os.path.join(d, "main.pdf")):
            if marker:
                os.makedirs(cache_dir, exist_ok=True)
                open(marker, "w").close()
            return True, ""
        err = [l for l in out.split("\n") if re.match(r"^(\./|!|.*:\d+: )", l) or "Emergency stop" in l]
        return False, "\n".join(err[-12:]) or out[-1500:]


def folder_errors(problems_dir, probs):
    """Checks of the problems folder as a whole: duplicate IDs, stray files, _last-id.txt.  [(path, line, message)]"""
    from .number import check_last_id
    return P.check_ids(probs) + P.stray_files(problems_dir) + check_last_id(problems_dir, probs)


def merged_items(items):
    """The results of problem-bank/appendix/, with `items` in place of the files of the same name."""
    merged = {it["name"]: it for it in A.load_items() if it["name"]}
    merged.update({it["name"]: it for it in items if it["name"]})
    return list(merged.values())


def appendix_errors(items, bib_keys, whole_folder=True):
    """Validate the shared results `items` (bank/appendix.py) against all results (merged_items), references.bib, and
    results citing each other in a circle; for the whole folder, also stray files.  [(path, line, message)]"""
    everything = merged_items(items)
    cat = A.catalogue(everything)
    out = []
    for it in items:
        A.validate_item(it, bib_keys, cat)
        out += [(it["path"], line, msg) for line, msg in sorted(it["errors"])]
    given = {it["path"] for it in items}
    out += [c for c in A.cycle_errors(everything) if whole_folder or c[0] in given]
    if whole_folder:
        out += A.stray_files()
    return out


def _is_item_path(f):
    return os.path.dirname(os.path.realpath(f)) == os.path.realpath(paths.APPENDIX_DIR)


def _looks_like_item(f):
    try:
        with open(f, encoding="utf-8", errors="replace") as fh:
            return bool(A.ITEM_MARKER_RE.search(P.mask_comments(fh.read())))
    except OSError:
        return False


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="problem files or shared results (default: all of problems/ and appendix/)")
    ap.add_argument("--compile", action="store_true", help="compile each problem standalone (with solution)")
    ap.add_argument("--no-solution", action="store_true", help="with --compile: also compile the statement-only variant")
    ap.add_argument("--stitched", action="store_true", help="with --compile: use the website (stitched) preamble mode")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--tags", default=paths.TAGS_FILE)
    a = ap.parse_args(argv)
    try:
        tags = load_tags(a.tags)
    except TagError as e:
        print(f"{a.tags}: {e}")
        return 1
    n_err = 0
    if a.files:
        probs, items = [], []
        for f in a.files:
            if _is_item_path(f):
                items.append(A.parse_item_file(f))
            elif _looks_like_item(f):
                print(f"{f}:1: a shared result must be in problem-bank/appendix/ (its file name is its citation key)")
                n_err += 1
            else:
                probs.append(P.parse_problem_file(f))
        compile_items = list(items)
        # the results the given problems cite, and those they cite, are checked with them
        by_name = {it["name"]: it for it in merged_items(items)}
        wanted = A.closure([n for p in probs for n in problem_cites(p)], {k: v["cites"] for k, v in by_name.items()})
        items += [by_name[n] for n in wanted if n not in {it["name"] for it in items}]
    else:
        probs = P.load_problems(paths.PROBLEMS_DIR)
        items = compile_items = A.load_items()
    all_items = merged_items(items)
    bib_keys = set(parse_bib(paths.BIB_FILE))
    cat = A.catalogue(all_items)
    for p in probs:
        P.validate(p, tags, bib_keys, cat)
        for line, msg in sorted(p["errors"]):
            print(f"{p['path']}:{line}: {msg}")
            n_err += 1
    for path, line, msg in ((P.check_ids(probs) if a.files else folder_errors(paths.PROBLEMS_DIR, probs))
                            + appendix_errors(items, bib_keys, whole_folder=not a.files)):
        print(f"{path}:{line}: {msg}")
        n_err += 1
    if a.compile and n_err == 0:
        jobs = []
        for p in probs:
            jobs.append((p, True))
            if a.no_solution and p["has_solution"]:
                jobs.append((p, False))
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.jobs) as ex:
            futs = {ex.submit(compile_problem, p, tags, ws, a.stitched, items=all_items): (p, ws) for p, ws in jobs}
            if not a.stitched:           # a result compiles in author mode (the website's text is made by the build)
                futs.update({ex.submit(compile_item, it, all_items): (it, None) for it in compile_items})
            for fut in concurrent.futures.as_completed(futs):
                p, ws = futs[fut]
                ok, err = fut.result()
                tag = "shared result" if ws is None else "with solution" if ws else "statement only"
                if ok:
                    print(f"OK   {p['file']} ({tag})")
                else:
                    n_err += 1
                    print(f"FAIL {p['path']} ({tag}):\n{err}\n")
    what = f"{len(probs)} problem files" + (f", {len(items)} shared result{'' if len(items) == 1 else 's'}" if items else "")
    print(f"{what}, {n_err} problem(s) found" if n_err else f"{what}, all good")
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
