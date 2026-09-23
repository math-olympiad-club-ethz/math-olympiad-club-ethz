#!/usr/bin/env python3
"""
Static site generator for the Math Olympiad Club ETHZ website and problem bank.

    python3 build.py                 # full build: validate + compile every problem, site data, bundle, HTML
    python3 build.py --preview       # include unreviewed problems (with a review badge) — local review
    python3 build.py --no-compile    # skip the per-problem pdflatex proofs (fast local iteration)
    python3 build.py --no-bundle     # skip the in-browser engine bundle (site/static/busytex/ kept as is; built if missing)
    python3 build.py --assets DIR    # texlyre-busytex assets (default .cache/busytex-assets; downloaded if absent)

Steps (any failure stops the build — nothing deploys):
  1. tags.yml is loaded and checked.
  2. every problem-bank/problems/NNNN-title.tex (and proposed new-title.tex) is parsed and validated
     (file:line messages), IDs are unique, nothing else sits in problems/, _last-id.txt is sound.
  3. every problem is compiled standalone with pdflatex, with and without its solution (successes are remembered
     in .cache/proofs/ by a hash of everything that goes in, so an unchanged problem is not compiled again).
  4. site data: site/static/bank/{tags.json,index.json,bodies.json,figures/} (published problems only,
     or all with --preview, where new-title.tex files appear under their provisional number, see bank/number.py).  bodies.json carries the CI-side transforms (namespaced labels, externalised
     TikZ figures, pre-resolved citations).
  5. the in-browser engine bundle site/static/busytex/ (trimmed TeX Live + format file), unless --no-bundle and
     the bundle exists.  The texlyre-busytex assets are checked against tools/busytex-assets.sha256 first.
  6. the HTML pages from templates/ into site/.
Everything this script writes (site/static/bank/, site/static/busytex/, site/*.html) is a build output and
git-ignored: CI runs the build and deploys its own copies. Only the sources are committed.
"""
import argparse
import concurrent.futures
import glob
import hashlib
import json
import os
import shutil
import subprocess
import sys

from jinja2 import Environment, FileSystemLoader

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bank import paths  # noqa: E402
from bank import problems as P  # noqa: E402
from bank import stitch  # noqa: E402
from bank.bib import parse_bib  # noqa: E402
from bank.number import assign_provisional_ids, read_last_id  # noqa: E402
from bank.data import build_index, build_tag_catalogue, visible_problems  # noqa: E402
from bank.tags import TagError, load_tags  # noqa: E402
from bank.validate import compile_problem, folder_errors  # noqa: E402

ROOT = paths.WEBSITE
REPO = paths.REPO
OUTPUT_DIR = paths.SITE_DIR
STATIC_DIR = paths.STATIC_DIR
BANK_DATA_DIR = paths.BANK_DATA_DIR
TEMPLATES_DIR = paths.TEMPLATES_DIR
PROBLEMS_DIR = paths.PROBLEMS_DIR
DEFAULT_ASSETS = os.path.join(paths.CACHE_DIR, "busytex-assets", "busytex")
PROOF_CACHE = os.path.join(paths.CACHE_DIR, "proofs")
BODIES_WARN_BYTES = 2_000_000        # every visitor downloads bodies.json on the first Create / Preview
ASSETS_URL = "https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz"


def fail(msg):
    print(f"\n❌ {msg}")
    sys.exit(1)


def step(msg):
    print(f"\n== {msg}")


def load_and_validate(tags):
    probs = P.load_problems(PROBLEMS_DIR)
    bib_keys = set(parse_bib(paths.BIB_FILE))
    n_err = 0
    for p in probs:
        P.validate(p, tags, bib_keys)
        for line, msg in sorted(p["errors"]):
            print(f"{os.path.relpath(p['path'], REPO)}:{line}: {msg}")
            n_err += 1
    for path, line, msg in folder_errors(PROBLEMS_DIR, probs):
        print(f"{os.path.relpath(path, REPO)}:{line}: {msg}")
        n_err += 1
    if n_err:
        fail(f"{n_err} problem(s) in the problem files — fix them (messages above are file:line: what is wrong)")
    n_new = sum(1 for p in probs if p["new"])
    print(f"{len(probs)} problem files valid" + (f" ({n_new} proposed new-*.tex, numbered after the merge)" if n_new else ""))
    return probs


def compile_all(probs, tags, jobs):
    jobs_list = [(p, True) for p in probs] + [(p, False) for p in probs if p["has_solution"]]
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as ex:
        futs = {ex.submit(compile_problem, p, tags, ws, cache_dir=PROOF_CACHE): (p, ws) for p, ws in jobs_list}
        for fut in concurrent.futures.as_completed(futs):
            p, ws = futs[fut]
            ok, err = fut.result()
            if not ok:
                failed.append((p, ws, err))
    for p, ws, err in failed:
        print(f"FAIL {os.path.relpath(p['path'], REPO)} ({'with solution' if ws else 'statement only'}):\n{err}\n")
    if failed:
        fail(f"{len(failed)} compile failure(s)")
    print(f"{len(jobs_list)} standalone compiles OK")


def write_site_data(probs, tags, preview):
    os.makedirs(BANK_DATA_DIR, exist_ok=True)
    visible = visible_problems(probs, preview)
    index = build_index(probs, tags, preview)
    catalogue = build_tag_catalogue(tags)
    with open(os.path.join(BANK_DATA_DIR, "tags.json"), "w", encoding="utf-8") as f:
        json.dump(catalogue, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(BANK_DATA_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    # bodies + figures (only the visible problems)
    fig_dir = os.path.join(BANK_DATA_DIR, "figures")
    if os.path.isdir(fig_dir):
        shutil.rmtree(fig_dir)
    os.makedirs(fig_dir, exist_ok=True)
    source = stitch.bank_sources(visible, tags)
    try:
        bodies, stats = stitch.build_bodies(source, BANK_DATA_DIR, log=lambda *a: None)
    except RuntimeError as e:
        fail(str(e))
    # "build" = a hash of the problem texts; the page carries the same value and refuses texts of another deploy
    problems_json = json.dumps(bodies, ensure_ascii=False, separators=(",", ":"))
    build = hashlib.sha256(problems_json.encode("utf-8")).hexdigest()[:16]
    payload = '{"build":%s,"problems":%s}' % (json.dumps(build), problems_json)
    with open(os.path.join(BANK_DATA_DIR, "bodies.json"), "w", encoding="utf-8") as f:
        f.write(payload)
    size = len(payload.encode("utf-8"))
    if size > BODIES_WARN_BYTES:
        print(f"⚠️  bodies.json is {size / 1e6:.1f} MB: every visitor downloads it on the first Create or Preview "
              f"(time to split it, e.g. one file per problem)")
    shutil.copyfile(paths.PREAMBLE_FILE, os.path.join(BANK_DATA_DIR, "preamble.tex"))   # "Download .tex", "Show available LaTeX"
    shutil.copyfile(paths.BIB_FILE, os.path.join(BANK_DATA_DIR, "references.bib"))      # \cite in the propose page's preview
    print(f"site data: {index['count']} problem(s) {'(PREVIEW: all, with review badges)' if preview else 'published'}, "
          f"{stats['figures']} figure(s), {stats['citations']} citation(s), {len(catalogue['area'])} area / {len(catalogue['methods'])} methods tags")
    return index, catalogue, build


def ensure_assets(assets_dir):
    if os.path.isdir(assets_dir) and os.path.exists(os.path.join(assets_dir, "busytex.wasm")):
        return assets_dir
    step(f"downloading the texlyre-busytex assets (~520 MB, once) to {os.path.dirname(assets_dir)}")
    os.makedirs(os.path.dirname(assets_dir), exist_ok=True)
    tar = os.path.join(os.path.dirname(assets_dir), "busytex-assets.tar.gz")
    subprocess.run(["curl", "-L", "--fail", "--progress-bar", "-o", tar, ASSETS_URL], check=True)
    subprocess.run(["tar", "-xzf", tar, "-C", os.path.dirname(assets_dir)], check=True)
    os.remove(tar)
    if not os.path.exists(os.path.join(assets_dir, "busytex.wasm")):
        fail(f"assets extracted but {assets_dir}/busytex.wasm is missing")
    return assets_dir


def build_bundle(assets_dir):
    cmd = [sys.executable, os.path.join(ROOT, "tools", "busytex_bundle.py"), "--assets", assets_dir, "--bodies", os.path.join(BANK_DATA_DIR, "bodies.json")]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        fail("the engine bundle failed to build (see tools/busytex_bundle.py output above)")


def engine_version():
    """manifest.json's version of the engine bundle in site/static/busytex/ (None if there is no bundle)."""
    try:
        with open(os.path.join(paths.BUSYTEX_DIR, "manifest.json"), encoding="utf-8") as f:
            return json.load(f).get("version")
    except (OSError, ValueError):
        return None


def asset_version():
    """A short hash of the page scripts and styles: the pages load them with ?v=<it> (templates), so a browser never
    mixes cached files of the last deploy with new ones."""
    h = hashlib.sha256()
    for f in sorted(glob.glob(os.path.join(STATIC_DIR, "js", "*.js")) + [os.path.join(STATIC_DIR, "css", "custom.css")]):
        with open(f, "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()[:10]


def render_pages(index, catalogue, preview, build=None):
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=False)

    def url_for(endpoint, **kw):
        if "filename" in kw:
            return f"static/{kw['filename']}"
        return "index.html" if endpoint == "home" else f"{endpoint}.html"

    github = {"repo": paths.GITHUB_REPO, "branch": paths.GITHUB_BRANCH, "problemsPath": paths.PROBLEMS_REPO_PATH}

    def inline_json(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")   # no "</script" or "<!--" inside

    # build / engine: the problem texts and the LaTeX engine this page was built with (bank-compile.js::expectBuild)
    bank_data = inline_json({"tags": catalogue, "index": index, "github": github, "build": build, "engine": engine_version()})
    propose_data = inline_json({"tags": catalogue, "github": github})
    pages = [("index.html", {"page": "home"}),
             ("problems.html", {"page": "problems", "page_title": "Problems", "bank_data_json": bank_data, "preview": preview}),
             ("propose.html", {"page": "propose", "page_title": "Propose a problem", "propose_data_json": propose_data})]
    version = asset_version()
    for name in os.listdir(OUTPUT_DIR):
        if name.endswith(".html"):
            os.remove(os.path.join(OUTPUT_DIR, name))
    for template_name, context in pages:
        html = env.get_template(template_name).render(url_for=url_for, asset_version=version, **context)
        with open(os.path.join(OUTPUT_DIR, template_name), "w", encoding="utf-8") as f:
            f.write(html)
        print(f"built site/{template_name}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", action="store_true", help="include unreviewed problems (local review mode)")
    ap.add_argument("--no-compile", action="store_true", help="skip the per-problem pdflatex proofs")
    ap.add_argument("--no-bundle", action="store_true", help="skip building site/static/busytex/ (still built when missing)")
    ap.add_argument("--assets", default=DEFAULT_ASSETS, help="texlyre-busytex assets directory")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    a = ap.parse_args(argv)

    step("tags.yml")
    try:
        tags = load_tags(paths.TAGS_FILE)
    except TagError as e:
        fail(f"tags.yml is invalid:\n{e}")
    print({k: len(v) for k, v in tags.items()})

    step("problem files")
    probs = load_and_validate(tags)
    if a.preview:
        assign_provisional_ids(probs, read_last_id())   # new-*.tex under the number they will get after the merge

    if not a.no_compile:
        step("compiling every problem standalone (with and without solution)")
        compile_all(probs, tags, a.jobs)

    step("site data")
    index, catalogue, build = write_site_data(probs, tags, a.preview)

    missing = not os.path.exists(os.path.join(paths.BUSYTEX_DIR, "manifest.json"))
    if not a.no_bundle or missing:           # a fresh clone has none: Create / Preview and the browser tests need it
        step("in-browser engine bundle" + (" (missing, so built despite --no-bundle)" if a.no_bundle else ""))
        build_bundle(ensure_assets(a.assets))

    step("HTML pages")
    render_pages(index, catalogue, a.preview, build)
    print(f"\n🎉 Site built in 'website-code/site/'{' (preview)' if a.preview else ''}. Serve it with: python3 -m http.server 8000 --directory website-code/site")


if __name__ == "__main__":
    main()
