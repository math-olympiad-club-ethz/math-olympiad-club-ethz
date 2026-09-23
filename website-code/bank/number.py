"""Give proposed problems their number.

A proposed problem arrives as problem-bank/problems/new-<title>.tex (from the website's "+" page, or by hand).
Once it is merged into main, the GitHub Action .github/workflows/number-new-problems.yml runs

    python3 -m bank.number --apply

which renames every new-*.tex to NNNN-<title>.tex with `git mv`: NNNN = the next number after the highest one
ever given (the largest of the highest existing ID, problems/_last-id.txt, which the same command updates, and the
highest number in the git history, so a deleted problem's number is never given again), new files taken in file-name
order, <title> = the kebab-case title.  It first validates the whole folder and renames nothing if anything is wrong.
Preview builds (build.py --preview) show new files under the same numbers, marked provisional.

    python3 -m bank.number                    # only print what would be renamed
    python3 -m bank.number --apply            # git mv
    python3 -m bank.number --apply --no-git   # plain rename (outside a git checkout)
"""
import argparse
import os
import re
import subprocess
import sys

from . import paths
from . import problems as P


LAST_ID_FILE = "_last-id.txt"        # in the problems folder; the underscore keeps it out of load_problems()


def read_last_id(problems_dir=paths.PROBLEMS_DIR):
    """The highest number ever given: 0 if the file is missing.  Lines starting with # are comments; anything else
    than one plain number raises ValueError (falling back to 0 would give old numbers out again)."""
    try:
        with open(os.path.join(problems_dir, LAST_ID_FILE), encoding="utf-8") as f:
            values = [l.strip() for l in f if l.strip() and not l.lstrip().startswith("#")]
    except FileNotFoundError:
        return 0
    if len(values) != 1 or not re.fullmatch(r"[0-9]+", values[0]):
        raise ValueError(f"{LAST_ID_FILE} must hold one number, the highest problem number ever given (found {values!r})")
    return int(values[0])


def check_last_id(problems_dir, problems):
    """[(path, line, message)]: _last-id.txt exists, is one number, is not below the highest ID, and the proposed
    problems still get four-digit numbers.  Run by the validator, build.py (every pull request) and the numbering."""
    path = os.path.join(problems_dir, LAST_ID_FILE)
    if not os.path.exists(path):
        return [(path, 1, f"{LAST_ID_FILE} is missing: it keeps the highest number ever given, so that no number is given twice")]
    try:
        last = read_last_id(problems_dir)
    except ValueError as err:
        return [(path, 1, str(err))]
    top = max((p["id"] for p in problems if p["id"] is not None and not p.get("provisional")), default=0)
    out = []
    if last < top:
        out.append((path, 1, f"{LAST_ID_FILE} says {last}, below the highest problem number {top:04d}: it must never go down"))
    new = [p for p in problems if p.get("new")]
    if new and max(last, top) + len(new) > P.MAX_ID:
        out.append((new[-1]["path"], 1, f"no four-digit number left for this problem (the next would be {max(last, top) + len(new)}; "
                                        f"at most {P.MAX_ID}); check {LAST_ID_FILE}"))
    return out


def history_max_id(problems_dir):
    """The highest NNNN of a problem file that ever existed in the git history (None outside a full git clone)."""
    try:
        def git(*args):
            return subprocess.run(["git", *args], cwd=problems_dir, capture_output=True, text=True, check=True).stdout
        if git("rev-parse", "--is-shallow-repository").strip() != "false":
            return None
        names = git("log", "--format=", "--name-only", "--no-renames", "--", ".").split("\n")
    except (OSError, subprocess.CalledProcessError):
        return None
    ids = [int(m.group(1)) for m in (P.FILENAME_RE.match(os.path.basename(n.strip())) for n in names) if m]
    return max(ids, default=0)


def write_last_id(problems_dir, last_id):
    with open(os.path.join(problems_dir, LAST_ID_FILE), "w", encoding="utf-8") as f:
        f.write("# Highest problem number ever given (website-code/bank/number.py updates it). Numbers are never reused,\n"
                "# even when a problem is deleted.\n%d\n" % last_id)


def plan(problems, last_id=0):
    """[(problem, id, new file name)] for every new-*.tex, in file-name order."""
    used = [p["id"] for p in problems if p["id"] is not None]
    nxt = max(max(used, default=0), last_id) + 1
    out = []
    for p in sorted((p for p in problems if p.get("new")), key=lambda p: p["file"]):
        slug = P.kebab(p["title"]) or p["slug"]
        out.append((p, nxt, f"{nxt:04d}-{slug}.tex"))
        nxt += 1
    return out


def assign_provisional_ids(problems, last_id=0):
    """Preview builds: give every new-*.tex the number it will get after the merge (p['provisional'] = True)."""
    for p, pid, _ in plan(problems, last_id):
        p["id"] = pid
        p["provisional"] = True
    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--problems-dir", default=paths.PROBLEMS_DIR)
    ap.add_argument("--apply", action="store_true", help="rename the files (default: only print the plan)")
    ap.add_argument("--no-git", action="store_true", help="with --apply: plain rename instead of git mv")
    ap.add_argument("--message", help="with --apply: also write a commit message to this file")
    a = ap.parse_args(argv)
    from .bib import parse_bib
    from .tags import load_tags
    from .validate import folder_errors
    problems = P.load_problems(a.problems_dir)
    # Never number (and push) a tree the build would reject, e.g. a proposal merged while its checks were red.
    tags, bib_keys = load_tags(paths.TAGS_FILE), set(parse_bib(paths.BIB_FILE))
    errors = [(p["path"], line, msg) for p in problems for line, msg in P.validate(p, tags, bib_keys)]
    errors += folder_errors(a.problems_dir, problems)
    try:
        last_id = read_last_id(a.problems_dir)
    except ValueError:
        last_id = 0                             # reported by folder_errors
    if a.apply and not a.no_git:
        # git history is the real record of the numbers given: it covers a _last-id.txt lowered together with the
        # deletion of the top problem, and shows a value raised by hand (all later numbers would jump).
        top = history_max_id(a.problems_dir)
        if top is not None and last_id > top:
            errors.append((os.path.join(a.problems_dir, LAST_ID_FILE), 1, f"{LAST_ID_FILE} says {last_id}, but the highest "
                           f"number ever given (git history) is {top}: set it back to {top}"))
        last_id = max(last_id, top or 0)
    if errors:
        for path, line, msg in sorted(errors):
            print(f"{path}:{line}: {msg}")
        print(f"{len(errors)} problem(s) found: nothing renamed")
        return 1
    todo = plan(problems, last_id)
    if not todo:
        print("no new-*.tex file to number")
        return 0
    lines = []
    for p, pid, name in todo:
        dst = os.path.join(os.path.dirname(p["path"]), name)
        if os.path.exists(dst):
            print(f"{dst} already exists; not renaming {p['file']}")
            return 1
        lines.append(f"{p['file']} -> {name}")
        print(("renamed " if a.apply else "would rename ") + lines[-1])
        if a.apply:
            if a.no_git:
                os.rename(p["path"], dst)
            else:
                subprocess.run(["git", "mv", p["file"], name], cwd=os.path.dirname(p["path"]), check=True)
    if a.apply:
        write_last_id(a.problems_dir, max(last_id, todo[-1][1]))
        if not a.no_git:
            subprocess.run(["git", "add", LAST_ID_FILE], cwd=a.problems_dir, check=True)
    if a.apply and a.message:
        title = f"Number {len(todo)} new problem{'s' if len(todo) > 1 else ''}"
        with open(a.message, "w", encoding="utf-8") as f:
            f.write(title + "\n\n" + "\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
