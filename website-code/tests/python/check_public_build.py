"""Check the PUBLIC build (python3 build.py without --preview), the one CI deploys after the tests ran on the preview
build.

    python3 tests/python/check_public_build.py [--site site]

Exit 1 with one line per problem if the site holds more (or less) than the rule "only review: human problems with a
final number" allows: index.json, bodies.json and figures/ must hold exactly those problems, the pages must embed the
public index, and the engine bundle must be complete.
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # website-code/
sys.path.insert(0, ROOT)
from bank import paths  # noqa: E402
from bank import problems as P  # noqa: E402
from bank.data import visible_problems  # noqa: E402


def check(site_dir, problems):
    """[message] for every way `site_dir` differs from the public build of `problems` (parsed problem files)."""
    errors = []
    bank = os.path.join(site_dir, "static", "bank")

    def load(name):
        try:
            with open(os.path.join(bank, name), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError) as err:
            errors.append(f"static/bank/{name}: {err}")
            return None

    want = sorted(p["id"] for p in visible_problems(problems, preview=False))
    index = load("index.json")
    if index is not None:
        if index.get("preview") is not False:
            errors.append("static/bank/index.json: 'preview' is not false (a preview build would be deployed)")
        got = [r.get("id") for r in index.get("problems", [])]
        if got != want or index.get("count") != len(want):
            errors.append(f"static/bank/index.json lists {got} (count {index.get('count')}), the published problems are {want}")
        hidden = [r.get("id") for r in index.get("problems", []) if r.get("review") != "human" or r.get("provisional")]
        if hidden:
            errors.append(f"static/bank/index.json lists problems that are not published (not review: human, or provisional): {hidden}")
    bodies = load("bodies.json")
    html = ""
    try:
        with open(os.path.join(site_dir, "problems.html"), encoding="utf-8") as f:
            html = f.read()
        if '"preview":false' not in html or '"preview":true' in html:
            errors.append("problems.html does not embed the public index (preview: false)")
    except OSError:
        pass
    if bodies is not None:
        if bodies.get("build") and '"build":"%s"' % bodies["build"] not in html:
            errors.append("problems.html and static/bank/bodies.json come from different builds")
        bodies = bodies.get("problems", {})
        if sorted(bodies) != [f"{i:04d}" for i in want]:
            errors.append(f"static/bank/bodies.json holds {sorted(bodies)}, the published problems are {want}")
        used = {name for b in bodies.values() for name in (b.get("figures") or {})}
        fig_dir = os.path.join(bank, "figures")
        present = set(os.listdir(fig_dir)) if os.path.isdir(fig_dir) else set()
        if present - used:
            errors.append(f"static/bank/figures/ holds figures of no published problem: {sorted(present - used)}")
        if used - present:
            errors.append(f"static/bank/figures/ misses {sorted(used - present)}")
    for name in ("tags.json", "preamble.tex", "references.bib"):
        if not os.path.isfile(os.path.join(bank, name)):
            errors.append(f"static/bank/{name} is missing")
    for page in ("index.html", "problems.html", "propose.html"):
        if not os.path.isfile(os.path.join(site_dir, page)):
            errors.append(f"{page} is missing")
    engine = os.path.join(site_dir, "static", "busytex")
    try:
        with open(os.path.join(engine, "manifest.json"), encoding="utf-8") as f:
            manifest = json.load(f)
        if '"engine":"%s"' % manifest["version"] not in html:
            errors.append("problems.html does not name the engine in static/busytex/manifest.json")
        for name, info in manifest["files"].items():
            path = os.path.join(engine, name)
            if not os.path.isfile(path) or os.path.getsize(path) != info["bytes"]:
                errors.append(f"static/busytex/{name} is missing or not the size manifest.json says")
    except (OSError, ValueError, KeyError) as err:
        errors.append(f"static/busytex/manifest.json: {err}")
    return errors


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default=paths.SITE_DIR)
    a = ap.parse_args(argv)
    errors = check(a.site, P.load_problems(paths.PROBLEMS_DIR))
    for msg in errors:
        print(f"public build: {msg}")
    n = len(visible_problems(P.load_problems(paths.PROBLEMS_DIR)))
    print(f"public build: {len(errors)} problem(s) found" if errors else f"public build OK ({n} published problem(s))")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
