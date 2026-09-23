"""Validate every problem file; optionally compile each one standalone.

    python3 -m bank.validate                 # header/tag/filename checks on problem-bank/problems/
    python3 -m bank.validate --compile       # + pdflatex each problem (with its solution)
    python3 -m bank.validate --compile --no-solution   # also compile the statement-only variant
    python3 -m bank.validate ../problem-bank/problems/0042-*.tex   # only some files (new-*.tex too)
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
\end{document}
"""
PROOF_CACHE_VERSION = "1"     # bump when the way proofs are compiled changes (it is part of every cache key)


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
                      "stitched": r"\def\BankStitched{}" + "\n" if stitched else ""}
    return main, body


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


def compile_problem(p, tags, with_solution=True, stitched=False, keep_log=None, cache_dir=None):
    """Compile one problem standalone with pdflatex.  Returns (ok, error_excerpt).
    cache_dir: remember successful compiles there (by a hash of everything that goes in) and skip them next time."""
    main, body = proof_sources(p, tags, with_solution, stitched)
    marker = None
    if cache_dir:
        key = hashlib.sha256((_tex_inputs_digest() + "\0" + main + "\0" + body).encode("utf-8")).hexdigest()
        marker = os.path.join(cache_dir, key)
        if os.path.exists(marker):
            return True, ""
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "body.tex"), "w", encoding="utf-8") as f:
            f.write(body)
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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="problem files (default: all of problems/)")
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
    if a.files:
        probs = [P.parse_problem_file(f) for f in a.files]
    else:
        probs = P.load_problems(paths.PROBLEMS_DIR)
    bib_keys = set(parse_bib(paths.BIB_FILE))
    n_err = 0
    for p in probs:
        P.validate(p, tags, bib_keys)
        for line, msg in sorted(p["errors"]):
            print(f"{p['path']}:{line}: {msg}")
            n_err += 1
    for path, line, msg in (P.check_ids(probs) if a.files else folder_errors(paths.PROBLEMS_DIR, probs)):
        print(f"{path}:{line}: {msg}")
        n_err += 1
    if a.compile and n_err == 0:
        jobs = []
        for p in probs:
            jobs.append((p, True))
            if a.no_solution and p["has_solution"]:
                jobs.append((p, False))
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.jobs) as ex:
            futs = {ex.submit(compile_problem, p, tags, ws, a.stitched): (p, ws) for p, ws in jobs}
            for fut in concurrent.futures.as_completed(futs):
                p, ws = futs[fut]
                ok, err = fut.result()
                tag = "with solution" if ws else "statement only"
                if ok:
                    print(f"OK   {p['file']} ({tag})")
                else:
                    n_err += 1
                    print(f"FAIL {p['path']} ({tag}):\n{err}\n")
    print(f"{len(probs)} problem files, {n_err} problem(s) found" if n_err else f"{len(probs)} problem files, all good")
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
