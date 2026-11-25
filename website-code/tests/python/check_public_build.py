"""Check the PUBLIC build (python3 build.py without --preview), the one CI deploys after the tests ran on the preview
build.

    python3 tests/python/check_public_build.py [--site site]

Exit 1 with one line per problem if the site holds more (or less) than the rule "every problem with a final number,
the ones without review: human marked proposed" allows (bank/data.py): the index problems.html carries inline (its
bank-data, read as the page reads it: page_data), bodies.json and figures/ must hold exactly those problems and the
shared results that the solutions of the reviewed ones cite (bank/appendix.py), the proposed ones marked as such in the
index and in their PDF origin line and without their solution (bank/data.py::mask_solutions), the index must be the
public one, both pages must carry the tag catalogue, the statements typeset in advance (static/bank/previews/,
bank/stitch.py::build_previews) must be those of the published problems, and the engine bundle must be complete.
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # website-code/
sys.path.insert(0, ROOT)
from bank import appendix as A  # noqa: E402
from bank import paths  # noqa: E402
from bank import problems as P  # noqa: E402
from bank.data import MASKED_SOLUTION, PROPOSED_NOTE, is_proposed, visible_problems  # noqa: E402
from bank.validate import problem_cites  # noqa: E402


def page_data(path, script_id):
    """The data a built page carries inline (build.py::render_pages), read as the page reads it: the text of its
    <script type="application/json" id="script_id">, parsed as JSON (the build writes every "<" in it as \\u003c, so
    nothing in it ends the script).  OSError when the page is missing; ValueError when the script is, or is not JSON."""
    with open(path, encoding="utf-8") as f:
        html = f.read()
    m = re.search(r'<script\b[^>]*\bid="%s"[^>]*>(.*?)</script>' % re.escape(script_id), html, re.S)
    if not m:
        raise ValueError(f'no <script type="application/json" id="{script_id}">')
    return json.loads(m.group(1))


def check(site_dir, problems, items=()):
    """[message] for every way `site_dir` differs from the public build of `problems` (parsed problem files) and the
    shared results `items` (bank/appendix.py::load_items)."""
    errors = []
    bank = os.path.join(site_dir, "static", "bank")

    def load(name):
        try:
            with open(os.path.join(bank, name), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError) as err:
            errors.append(f"static/bank/{name}: {err}")
            return None

    def inline(page, script_id):
        """What `page` carries inline, or None (a page that is missing is said further down)."""
        path = os.path.join(site_dir, page)
        if not os.path.isfile(path):
            return None
        try:
            got = page_data(path, script_id)
        except (OSError, ValueError) as err:
            errors.append(f"{page}: {err}")
            return None
        if not isinstance(got, dict):
            errors.append(f"{page}: its {script_id} is not a JSON object")
            return None
        return got

    want = sorted(p["id"] for p in visible_problems(problems, preview=False))
    proposed_ids = {p["id"] for p in visible_problems(problems, preview=False) if is_proposed(p)}
    data = inline("problems.html", "bank-data")
    index = data.get("index") if data is not None else None
    if data is not None and not isinstance(index, dict):
        errors.append("problems.html carries no index")
    if isinstance(index, dict):
        if index.get("preview") is not False:
            errors.append("problems.html: the index's 'preview' is not false (a preview build would be deployed)")
        got = [r.get("id") for r in index.get("problems", [])]
        if got != want or index.get("count") != len(want):
            errors.append(f"problems.html lists {got} (count {index.get('count')}), the published problems are {want}")
        hidden = [r.get("id") for r in index.get("problems", []) if r.get("provisional")]
        if hidden:
            errors.append(f"problems.html lists provisional problems (new-*.tex, not merged): {hidden}")
        unmarked = [r.get("id") for r in index.get("problems", []) if r.get("id") in proposed_ids and r.get("proposed") is not True]
        marked = [r.get("id") for r in index.get("problems", []) if r.get("id") not in proposed_ids and r.get("proposed")]
        if unmarked or marked:
            errors.append(f"problems.html: proposed must be true exactly for the problems without review: human "
                          f"(not marked: {unmarked}; marked but reviewed: {marked})")
        shown = [r.get("id") for r in index.get("problems", []) if r.get("id") in proposed_ids and r.get("hasSolution")]
        if shown:
            errors.append(f"problems.html: proposed problems listed with a solution (masked on the public site): {shown}")
    # the tag catalogue, which both pages carry
    for page, carried in (("problems.html", data), ("propose.html", inline("propose.html", "propose-data"))):
        if carried is not None and not (isinstance(carried.get("tags"), dict) and carried["tags"].get("area")):
            errors.append(f"{page} carries no tag catalogue")
    data = data or {}
    bodies = load("bodies.json")
    if bodies is not None:
        if bodies.get("build") and data.get("build") != bodies["build"]:
            errors.append("problems.html and static/bank/bodies.json come from different builds")
        appendix = bodies.get("appendix") or {}
        bodies = bodies.get("problems", {})
        if sorted(bodies) != [f"{i:04d}" for i in want]:
            errors.append(f"static/bank/bodies.json holds {sorted(bodies)}, the published problems are {want}")
        notes = {k: b.get("note") == PROPOSED_NOTE for k, b in bodies.items()}
        wrong = sorted(k for k, noted in notes.items() if noted != (int(k) in proposed_ids))
        if wrong:
            errors.append(f"static/bank/bodies.json: the PDF origin line must end with '{PROPOSED_NOTE}' (the note) exactly "
                          f"for the proposed problems: wrong in {wrong}")
        unsafe = sorted(k for k, b in bodies.items() if b.get("link") and not re.match(r"https?://\S+$", b["link"]))
        if unsafe:
            errors.append(f"static/bank/bodies.json: the link of a source must be one http(s) address: wrong in {unsafe}")
        leaked = sorted(k for k, b in bodies.items() if int(k) in proposed_ids and b.get("solution") not in (None, MASKED_SOLUTION))
        if leaked:
            errors.append(f"static/bank/bodies.json: the solutions of proposed problems must not be published: {leaked}")
        published = [p for p in visible_problems(problems, preview=False) if not is_proposed(p)]   # masked solutions cite nothing
        cites_of = {it["name"]: it["cites"] for it in items if it["name"]}
        want_results = sorted(A.closure([n for p in published for n in problem_cites(p)], cites_of))
        if sorted(appendix) != want_results:
            errors.append(f"static/bank/bodies.json holds the shared results {sorted(appendix)}, the published problems "
                          f"cite {want_results}")
        used = {name for b in list(bodies.values()) + list(appendix.values()) for name in (b.get("figures") or {})}
        fig_dir = os.path.join(bank, "figures")
        present = set(os.listdir(fig_dir)) if os.path.isdir(fig_dir) else set()
        if present - used:
            errors.append(f"static/bank/figures/ holds figures of no published problem or shared result: {sorted(present - used)}")
        if used - present:
            errors.append(f"static/bank/figures/ misses {sorted(used - present)}")
    # the statements typeset by the build: those of the published problems, the files the page names and no other
    previews = data.get("previews")
    pv_dir = os.path.join(bank, "previews")
    present = set(os.listdir(pv_dir)) if os.path.isdir(pv_dir) else set()
    if previews:
        if previews.get("ids") != want:
            errors.append(f"problems.html: the previews hold the statements of {previews.get('ids')}, the published problems are {want}")
        named = {os.path.basename(x.get("url", "")) for x in previews.get("measures", [])}
        if named - present:
            errors.append(f"static/bank/previews/ misses {sorted(named - present)}")
        if present - named:
            errors.append(f"static/bank/previews/ holds files the page does not name: {sorted(present - named)}")
    elif present:
        errors.append(f"static/bank/previews/ holds {sorted(present)}, but problems.html names no previews")
    for name in ("preamble.tex", "references.bib"):
        if not os.path.isfile(os.path.join(bank, name)):
            errors.append(f"static/bank/{name} is missing")
    for page in ("index.html", "problems.html", "propose.html"):
        if not os.path.isfile(os.path.join(site_dir, page)):
            errors.append(f"{page} is missing")
    engine = os.path.join(site_dir, "static", "busytex")
    try:
        with open(os.path.join(engine, "manifest.json"), encoding="utf-8") as f:
            manifest = json.load(f)
        if data.get("engine") != manifest["version"]:
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
    problems = P.load_problems(paths.PROBLEMS_DIR)
    errors = check(a.site, problems, A.load_items())
    for msg in errors:
        print(f"public build: {msg}")
    n = len(visible_problems(problems))
    print(f"public build: {len(errors)} problem(s) found" if errors else f"public build OK ({n} published problem(s))")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
