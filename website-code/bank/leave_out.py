"""Leave broken problems out of a deploy instead of stopping the whole site (.github/workflows/deploy.yml, main only).

    python3 -m bank.leave_out            # list what a deploy would leave out today (changes nothing)
    python3 -m bank.leave_out --delete   # GitHub Actions only: delete those files from the CI checkout

build.py stops at the first broken problem file and the deploy needs the build, so one wrong edit on main used to stop
every deploy until someone fixed it (raised by Spas, 2026-09-28).  On main, CI runs this first.  It applies the build's
own checks to every problem file and shared result of problem-bank/:
  1. validation against tags.yml and references.bib, and the folder checks (bank/validate.py::check_bank);
  2. the standalone pdflatex compiles (bank/validate.py::compile_failures, with the build's proof cache, so the build
     then compiles nothing twice);
  3. the TikZ figures, externalised as the build does for the site (bank/stitch.py, with the build's figure cache).
A file that fails is left out, and so is every shared result or problem that cites a left-out result.  With --delete
the files are removed from the throwaway checkout: the strict build, the tests and the deploy then run on the rest of
the bank, and the job "left-out" of deploy.yml turns the run red, naming the files to fix.  Pull requests do not run
this: they stay strict.

Nothing is left out (exit 1, nothing deploys, as before) when the cause is not one problem file: tags.yml or
references.bib does not load, _last-id.txt is wrong, or more than MAX_LEFT_OUT problem files break at once (a broken
preamble.tex, references.bib or a tag renamed in tags.yml is then the likely cause).  A failure that only the full
build sees (the engine bundle compiles all problems together) still stops the deploy.

In GitHub Actions it also writes the step summary, error annotations on the files, and the step outputs
left_out=<number of files> and files=<JSON list of repository paths>.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile

from . import appendix as A
from . import paths
from . import problems as P
from . import stitch
from .number import assign_provisional_ids, read_last_id
from .tags import TagError, load_tags
from .validate import check_bank, compile_failures, problem_cites

MAX_LEFT_OUT = 5          # problem files; more broken at once: a shared file is the likely cause, so stop instead


def repo_path(path):
    return os.path.relpath(path, paths.REPO).replace(os.sep, "/")


def spread(bad_problems, bad_results, problem_cites_of, result_cites_of):
    """What to leave out, from what failed.  bad_problems: paths of the problem files that failed; bad_results: names of
    the shared results that failed; problem_cites_of: {problem path: names its solution cites}; result_cites_of:
    {result name: names it cites}.  A result is left out if it failed or cites a left-out result (so, through others,
    any failed one); a problem if it failed or cites a left-out result.
    Returns (problem paths, result names, {problem path or result name: why it is left out})."""
    results, why = set(bad_results), {}
    grew = True
    while grew:
        grew = False
        for name in sorted(result_cites_of):
            if name in results:
                continue
            hit = next((c for c in result_cites_of[name] if c in results), None)
            if hit:
                results.add(name)
                why[name] = f"cites the shared result {hit}, which is left out"
                grew = True
    problems = set(bad_problems)
    for path in sorted(problem_cites_of):
        if path in problems:
            continue
        hit = next((c for c in problem_cites_of[path] if c in results), None)
        if hit:
            problems.add(path)
            why[path] = f"cites the shared result {hit}, which is left out"
    return problems, results, why


def _cites(p):
    try:
        return problem_cites(p)
    except Exception:       # a file too broken to split: it has validation errors anyway
        return []


def plan(jobs=None, problems_dir=None, compile=True):
    """({path: [(line or None, message)]} of the files to leave out, fatal), where fatal is None, or the reason why
    leaving files out cannot help (then nothing may deploy).  compile=False skips steps 2 and 3 (for the tests)."""
    problems_dir = problems_dir or paths.PROBLEMS_DIR
    try:
        tags = load_tags(paths.TAGS_FILE)
    except TagError as e:
        return {}, f"problem-bank/tags.yml is invalid, and every problem depends on it:\n{e}"
    try:
        probs, items, errors = check_bank(tags, problems_dir)
    except (OSError, ValueError) as e:
        return {}, f"the problem bank does not load (references.bib?): {e}"

    broken = {}                                    # path -> [(line, message)]

    def note(path, line, msg):
        broken.setdefault(path, []).append((line, msg))

    prob_paths = {p["path"] for p in probs}
    item_by_path = {it["path"]: it for it in items}
    strays = {s[0] for s in P.stray_files(problems_dir) + A.stray_files()}
    fatal = []
    for path, line, msg in errors:
        if path in prob_paths or path in item_by_path or path in strays:
            note(path, line, msg)
        else:                                      # _last-id.txt: not one problem file
            fatal.append(f"{repo_path(path)}:{line}: {msg}")
    if fatal:
        return broken, "this is not one broken problem file:\n" + "\n".join(fatal)

    def left_out():
        bad_r = {item_by_path[p]["name"] for p in broken if p in item_by_path and item_by_path[p]["name"]}
        lp, lr, why = spread({p for p in broken if p in prob_paths}, bad_r, {p["path"]: _cites(p) for p in probs},
                             {it["name"]: list(it["cites"]) for it in items if it["name"]})
        lr_paths = {it["path"] for it in items if it["name"] in lr} | {p for p in broken if p in item_by_path}
        return lp, lr_paths, why

    if compile:
        lp, lr_paths, _ = left_out()
        rest_p = [p for p in probs if p["path"] not in lp]
        rest_i = [it for it in items if it["path"] not in lr_paths]
        assign_provisional_ids(rest_p, read_last_id(problems_dir))      # as the preview build does before compiling
        failed, _ = compile_failures(rest_p, rest_i, tags, jobs or os.cpu_count() or 4)
        for obj, ws, err in sorted(failed, key=lambda f: f[0]["path"]):
            what = "on its own" if ws is None else "with its solution" if ws else "statement only"
            note(obj["path"], None, f"pdflatex fails ({what}):\n{err}")
        lp, lr_paths, _ = left_out()
        rest_p = [p for p in rest_p if p["path"] not in lp]
        rest_i = [it for it in rest_i if it["path"] not in lr_paths]
        with tempfile.TemporaryDirectory() as d:  # the site's figures, as write_site_data makes them (cached by content)
            for p in rest_p:
                try:
                    stitch.build_bodies(stitch.bank_sources([p], tags), d, log=lambda *a: None)
                except (RuntimeError, ValueError) as e:
                    note(p["path"], None, str(e))
            for it in rest_i:
                if it["name"]:
                    try:
                        stitch.build_appendix(rest_i, [it["name"]], d, log=lambda *a: None)
                    except RuntimeError as e:
                        note(it["path"], None, str(e))

    lp, lr_paths, why = left_out()
    by_name = {it["name"]: it["path"] for it in items if it["name"]}
    for key, reason in sorted(why.items()):
        note(key if key in prob_paths else by_name[key], None, reason)
    n_problems = sum(1 for path in broken if path in prob_paths)
    broken = dict(sorted(broken.items()))
    if n_problems > MAX_LEFT_OUT:
        return broken, (f"{n_problems} problem files fail at once, and at most {MAX_LEFT_OUT} are left out: the cause "
                        f"is likely a shared file (preamble.tex, references.bib, a tag renamed in tags.yml)")
    return broken, None


# ---- reporting ---------------------------------------------------------------------------------------------------
def _data(s):           # GitHub workflow command, message part
    return s.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def _prop(s):           # GitHub workflow command, property value
    return _data(s).replace(":", "%3A").replace(",", "%2C")


def report(left, fatal, ci, deleting):
    for path in left:
        print(f"✗ {repo_path(path)}")
        for line, msg in left[path]:
            where = f"{repo_path(path)}:{line}: " if line else f"{repo_path(path)}: "
            print("    " + where + msg.replace("\n", "\n    "))
            if ci:
                title = "Broken problem file" if fatal else "Left out of the site"
                props = f"file={_prop(repo_path(path))}" + (f",line={line}" if line else "") + f",title={_prop(title)}"
                print(f"::error {props}::{_data(msg)}")
    if fatal:
        print(f"\n❌ Nothing is left out, nothing may deploy: {fatal}")
    elif left:
        verb = "Left out of this deploy" if deleting else "A deploy would leave out"
        print(f"\n⚠️  {verb}: {len(left)} file(s). The rest of the bank deploys; fix these and push again.")
    else:
        print("Nothing to leave out: every problem file and shared result passes the build's checks.")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if ci and summary and (left or fatal):
        out = ["### Nothing deployed" if fatal else "### Problems left out of this deploy", ""]
        out.append(fatal.replace("\n", "  \n") if fatal else
                   "The site was deployed without these files. Fix them and push: the next deploy brings them back.")
        out.append("")
        for path in left:
            out.append(f"- `{repo_path(path)}`")
            for line, msg in left[path]:
                out += ["", "  ~~~", *("  " + l for l in ((f"line {line}: " if line else "") + msg).split("\n")), "  ~~~"]
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(out) + "\n")


def delete(left):
    """Remove the files (CI checkout only).  Only entries of problems/ or appendix/ are ever touched."""
    roots = {os.path.realpath(paths.PROBLEMS_DIR), os.path.realpath(paths.APPENDIX_DIR)}
    for path in left:
        if os.path.realpath(os.path.dirname(os.path.abspath(path))) not in roots:
            raise RuntimeError(f"refusing to delete {path}: not in problem-bank/problems/ or problem-bank/appendix/")
        if os.path.isdir(path) and not os.path.islink(path):
            shutil.rmtree(path)
        elif os.path.lexists(path):
            os.remove(path)
        print(f"deleted from this checkout: {repo_path(path)}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--delete", action="store_true", help="delete the files to leave out (GitHub Actions only)")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    a = ap.parse_args(argv)
    ci = os.environ.get("GITHUB_ACTIONS") == "true"
    if a.delete and not ci:
        print("--delete runs only in GitHub Actions: here it would delete files of your working copy.\n"
              "Without --delete, this lists what a deploy would leave out.")
        return 2
    try:
        left, fatal = plan(a.jobs)
    except Exception as e:      # anything unexpected: stop, as the build would
        left, fatal = {}, f"the checks themselves failed: {type(e).__name__}: {e}"
    report(left, fatal, ci, a.delete)
    if fatal:
        return 1
    if a.delete:
        delete(left)
    out = os.environ.get("GITHUB_OUTPUT")
    if ci and out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"left_out={len(left)}\n")
            f.write("files=" + json.dumps([repo_path(p) for p in left]) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
