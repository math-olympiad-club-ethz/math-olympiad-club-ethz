#!/usr/bin/env python3
"""
Static site generator for the Math Olympiad Club at ETHZ website and problem bank.

    python3 build.py                 # full build: validate + compile every problem, site data, bundle, HTML
    python3 build.py --preview       # include unreviewed problems (with a review badge) — local review
    python3 build.py --no-compile    # skip the per-problem pdflatex proofs (fast local iteration)
    python3 build.py --no-bundle     # skip the in-browser engine bundle (site/static/busytex/ kept as is; built if
                                     # missing or made from an older preamble.tex)
    python3 build.py --assets DIR    # texlyre-busytex assets (default .cache/busytex-assets/busytex; downloaded if absent)

Steps (any failure stops the build — nothing deploys):
  1. tags.yml is loaded and checked.
  2. every problem-bank/problems/NNNN-title.tex (and proposed new-title.tex) is parsed and validated
     (file:line messages), IDs are unique, nothing else sits in problems/, _last-id.txt is sound; the same for the
     shared results of problem-bank/appendix/ (bank/appendix.py), which solutions cite with \\appendixref{name}.
  3. every problem is compiled standalone with pdflatex, with and without its solution (the solution with the shared
     results it cites), and every shared result on its own (successes are remembered in .cache/proofs/ by a hash of
     everything that goes in, so an unchanged problem is not compiled again).
  4. site data: site/static/bank/{tags.json,index.json,bodies.json,figures/} (every numbered problem, the unreviewed
     ones marked proposed, see bank/data.py; or all with --preview, where new-title.tex files appear under their provisional number, see bank/number.py).  bodies.json carries the CI-side transforms (namespaced labels, externalised
     TikZ figures, pre-resolved citations) and the shared results those problems cite ("appendix").  Then every
     statement typeset in advance for the Problems page's previews, site/static/bank/previews/ (bank/stitch.py::
     build_previews, cached in .cache/previews/): a measure that fails is left out with a warning (the page typesets
     those statements in the browser).
  5. the in-browser engine bundle site/static/busytex/ (trimmed TeX Live + format file), unless --no-bundle and
     the bundle exists and was made from the current preamble.tex.  The texlyre-busytex assets are checked against
     tools/busytex-assets.sha256 first.
  6. the HTML pages from templates/ into site/.
Everything this script writes (site/static/bank/, site/static/busytex/, site/*.html) is a build output and
git-ignored: CI runs the build and deploys its own copies. Only the sources are committed.
On main, CI first runs bank/leave_out.py, which deletes broken problem files from its own checkout (the run still
ends red), so one broken file no longer stops the deploy; this script itself stays strict.
"""
import argparse
import datetime
import glob
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys

from jinja2 import Environment, FileSystemLoader

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bank import appendix as A  # noqa: E402
from bank import paths  # noqa: E402
from bank import problems as P  # noqa: E402
from bank import sources  # noqa: E402
from bank import stitch  # noqa: E402
from bank.number import assign_provisional_ids, read_last_id  # noqa: E402
from bank.data import PROPOSED_NOTE, build_index, build_tag_catalogue, is_proposed, mask_solutions, visible_problems  # noqa: E402
from bank.tags import TagError, load_tags  # noqa: E402
from bank.validate import PROOF_CACHE, check_bank, compile_failures  # noqa: E402

ROOT = paths.WEBSITE
REPO = paths.REPO
OUTPUT_DIR = paths.SITE_DIR
STATIC_DIR = paths.STATIC_DIR
BANK_DATA_DIR = paths.BANK_DATA_DIR
TEMPLATES_DIR = paths.TEMPLATES_DIR
PROBLEMS_DIR = paths.PROBLEMS_DIR
DEFAULT_ASSETS = os.path.join(paths.CACHE_DIR, "busytex-assets", "busytex")
BODIES_WARN_BYTES = 2_000_000        # every visitor downloads bodies.json on the first Create / Preview
ASSETS_URL = "https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz"


def fail(msg):
    print(f"\n❌ {msg}")
    sys.exit(1)


def step(msg):
    print(f"\n== {msg}")


def load_and_validate(tags):
    probs, items, errors = check_bank(tags, PROBLEMS_DIR)
    for path, line, msg in errors:
        print(f"{os.path.relpath(path, REPO)}:{line}: {msg}")
    if errors:
        fail(f"{len(errors)} problem(s) in the problem files and shared results — fix them (messages above are file:line: what is wrong)")
    n_new = sum(1 for p in probs if p["new"])
    print(f"{len(probs)} problem files valid" + (f" ({n_new} proposed new-*.tex, numbered after the merge)" if n_new else "")
          + f", {len(items)} shared result{'' if len(items) == 1 else 's'} in problem-bank/appendix/")
    return probs, items


def compile_all(probs, items, tags, jobs):
    failed, n_compiles = compile_failures(probs, items, tags, jobs, PROOF_CACHE)
    for p, ws, err in failed:
        tag = "shared result" if ws is None else "with solution" if ws else "statement only"
        print(f"FAIL {os.path.relpath(p['path'], REPO)} ({tag}):\n{err}\n")
    if failed:
        fail(f"{len(failed)} compile failure(s)")
    print(f"{n_compiles} standalone compiles OK")


def report_sources(problems, tags):
    """Say which problems the site cannot name by their source (bank/sources.py): a paper, a journal, a book or a
    historical text whose `references` line does not start with it as one would cite it (or cites it with a character
    a PDF heading cannot print).  Their heading keeps the origin label, "Research paper 1976"."""
    unnamed = []
    for p in problems:
        if (tags["origin"].get(p["origin"]) or {}).get("kind") in sources.PUBLICATIONS and not sources.source(p, tags)["cited"]:
            unnamed.append(f"{p['file']} ({P.origin_label(p, tags)})")
    if unnamed:
        print(f"ℹ️  sources: {len(unnamed)} problem(s) from a publication that the site cannot name, since their references line "
              "does not start with its citation (problem-bank/README.md says how to write it): " + ", ".join(unnamed))


def write_site_data(probs, items, tags, preview, jobs=4):
    os.makedirs(BANK_DATA_DIR, exist_ok=True)
    visible = visible_problems(probs, preview)
    index = build_index(probs, preview, tags)
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
    if not preview:                     # a PDF says it too: the origin line of a proposed problem ends with a note
        proposed = {f"{p['id']:04d}" for p in visible if is_proposed(p)}
        for s in source:
            if s["id"] in proposed:
                s["note"] = PROPOSED_NOTE
        mask_solutions(source, proposed)  # their statements only: the solutions stay in the .tex files
    report_sources(visible, tags)
    # the shared results these problems cite, and the ones those cite (bank/appendix.py): only those are published
    cites_of = {it["name"]: it["cites"] for it in items if it["name"]}
    wanted = A.closure([n for s in source for n in s["cites"]], cites_of)
    try:
        bodies, stats = stitch.build_bodies(source, BANK_DATA_DIR)
        appendix, astats = stitch.build_appendix(items, wanted, BANK_DATA_DIR)
    except RuntimeError as e:
        fail(str(e))
    # "build" = a hash of the texts; the page carries the same value and refuses texts of another deploy
    problems_json = json.dumps(bodies, ensure_ascii=False, separators=(",", ":"))
    appendix_json = json.dumps(appendix, ensure_ascii=False, separators=(",", ":"))
    build = hashlib.sha256((problems_json + "\0" + appendix_json).encode("utf-8")).hexdigest()[:16]
    payload = '{"build":%s,"problems":%s,"appendix":%s}' % (json.dumps(build), problems_json, appendix_json)
    with open(os.path.join(BANK_DATA_DIR, "bodies.json"), "w", encoding="utf-8") as f:
        f.write(payload)
    size = len(payload.encode("utf-8"))
    if size > BODIES_WARN_BYTES:
        print(f"⚠️  bodies.json is {size / 1e6:.1f} MB: every visitor downloads it on the first Create or Preview "
              f"(time to split it, e.g. one file per problem)")
    shutil.copyfile(paths.PREAMBLE_FILE, os.path.join(BANK_DATA_DIR, "preamble.tex"))   # "Download .tex", "Show available LaTeX"
    shutil.copyfile(paths.BIB_FILE, os.path.join(BANK_DATA_DIR, "references.bib"))      # \cite in the propose page's preview
    n_proposed = sum(1 for r in index["problems"] if r["proposed"])
    print(f"site data: {index['count']} problem(s) {'(PREVIEW: all, with review badges)' if preview else f'published ({n_proposed} proposed)'}, "
          f"{astats['results']} shared result(s) cited, "
          f"{stats['figures'] + astats['figures']} figure(s), {stats['citations'] + astats['citations']} citation(s), "
          f"{len(catalogue['area'])} area / {len(catalogue['methods'])} methods tags")
    # every statement typeset in advance, for the Problems page's previews (bank/stitch.py::build_previews)
    previews, missing = stitch.build_previews(bodies, BANK_DATA_DIR, jobs)
    for m in missing:
        print(f"⚠️  previews, {m}: the page typesets these statements in the browser")
    if previews:
        sizes = [os.path.getsize(os.path.join(OUTPUT_DIR, m["url"])) for m in previews["measures"]]
        print(f"previews: {len(previews['ids'])} statements at {len(sizes)} measures, {sum(sizes) / 1e6:.1f} MB in all")
    return index, catalogue, build, previews


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


def bundle_is_current():
    """True if site/static/busytex/ exists and its format file was built from the current preamble.tex (a format
    made from an older preamble lacks the new macros: every PDF using them would fail in the browser)."""
    try:
        with open(os.path.join(paths.BUSYTEX_DIR, "manifest.json"), encoding="utf-8") as f:
            built_from = json.load(f).get("preamble_sha256")
        with open(paths.PREAMBLE_FILE, "rb") as f:
            return built_from == hashlib.sha256(f.read()).hexdigest()
    except (OSError, ValueError, AttributeError):
        return False


def engine_version():
    """manifest.json's version of the engine bundle in site/static/busytex/ (None if there is no bundle)."""
    try:
        with open(os.path.join(paths.BUSYTEX_DIR, "manifest.json"), encoding="utf-8") as f:
            return json.load(f).get("version")
    except (OSError, ValueError):
        return None


def engine_download_mb():
    """What the in-browser engine downloads the first time, in MB, from its manifest (the Propose page says it where a
    visitor saving data is asked first); None without a bundle."""
    try:
        with open(os.path.join(paths.BUSYTEX_DIR, "manifest.json"), encoding="utf-8") as f:
            return max(1, round(sum(f["bytes"] for f in json.load(f)["files"].values()) / 1e6))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


# The club's address: the foot of every page, and where the Propose page sends a proposal
CLUB_EMAIL = "olympiadclub@math.ethz.ch"
# Where the site is served (GitHub Pages of the repository): the social preview's image needs a whole address
SITE_URL = "https://{}.github.io/{}/".format(*paths.GITHUB_REPO.split("/"))

PDFJS_PACKAGE = os.path.join(ROOT, "node_modules", "pdfjs-dist")


def copy_pdfjs():
    """PDF.js (npm package pdfjs-dist, pinned in package.json; its legacy build, which older Safari runs too) into
    site/static/pdfjs/, with its licence: it draws a problem's preview into the Problems page.  Returns its version,
    which the page puts on the files' address (?v=), so a new release is never mixed with a cached one."""
    try:
        with open(os.path.join(PDFJS_PACKAGE, "package.json"), encoding="utf-8") as f:
            version = json.load(f)["version"]
    except (OSError, ValueError):
        fail("node_modules/pdfjs-dist is missing: run `npm ci` in website-code/ first")
    out = os.path.join(STATIC_DIR, "pdfjs")
    os.makedirs(out, exist_ok=True)
    for src, dst in (("legacy/build/pdf.min.mjs", "pdf.min.mjs"), ("legacy/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"),
                     ("LICENSE", "LICENSE")):
        shutil.copyfile(os.path.join(PDFJS_PACKAGE, src), os.path.join(out, dst))
    return version


def asset_version():
    """A short hash of the page scripts and styles: the pages load them with ?v=<it> (templates), so a browser never
    mixes cached files of the last deploy with new ones."""
    h = hashlib.sha256()
    for f in sorted(glob.glob(os.path.join(STATIC_DIR, "js", "*.js")) + glob.glob(os.path.join(STATIC_DIR, "css", "*.css"))):
        with open(f, "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()[:10]


def tree_top(index):
    """The root of the Problems page's tree of topics, written into the page so that nothing jumps when its script
    arrives (the tree starts folded; bank-ui.js draws the same row): the number of problems a visitor sees first (the
    reviewed ones), whether they have topics at all (no topic: no tree), and whether some problems are proposed (their
    filter word is written in the page too)."""
    shown = [p for p in index["problems"] if not p.get("proposed")]
    return {"bank_topics": any(p["area"] for p in shown), "bank_total": len(shown), "bank_proposed": len(shown) < len(index["problems"])}


def origin_forms(probs):
    """How the bank numbers each source's problems, for "Where is it from?" on the Propose page (bank-propose-ui.js lists the
    sources the bank has most problems from first and, once one is chosen, shows its form): {slug: {"n": its problems,
    "date": a year, "number": its most common form of problem number, as one of its problems has it}}."""
    shape = lambda s: re.sub(r"\d+", "#", s)
    seen = {}
    for p in probs:
        if not p.get("origin"):
            continue
        o = seen.setdefault(p["origin"], {"n": 0, "forms": {}, "ex": {}})
        o["n"] += 1
        num = (p.get("origin_number") or "").strip()
        if num:
            k, year = shape(num), (p.get("origin_date") or "")[:4]
            o["forms"][k] = o["forms"].get(k, 0) + 1
            if year >= o["ex"].get(k, ("", ""))[0]:
                o["ex"][k] = (year, num)          # the latest problem of that form
    out = {}
    for slug, o in seen.items():
        out[slug] = {"n": o["n"]}
        if o["forms"]:
            k = max(o["forms"], key=lambda f: (o["forms"][f], f))
            out[slug]["date"], out[slug]["number"] = o["ex"][k]
    return out


def font_ranges(css_path=os.path.join(paths.SITE_DIR, "static", "css", "fonts.css")):
    """The code points of the web fonts' basic files and of their second files, from the unicode-ranges of fonts.css
    (those of tools/subset_fonts.py)."""
    with open(css_path, encoding="utf-8") as f:
        css = f.read()
    basic, more = set(), set()
    for url, ranges in re.findall(r'src: url\("([^"]+)"\)[^}]*?unicode-range: ([^;]+);', css):
        for part in ranges.split(","):
            lo, _, hi = part.strip()[2:].partition("-")
            (more if "-ext" in url else basic).update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return basic, more


def check_fonts(catalogue, index, pages=()):
    """The web fonts' basic files hold every character the site's own text shows (tools/subset_fonts.py): say which
    tag, title or page brings one they lack, as its pages would download a second font file for it (or draw it in
    another font, when the fonts have no glyph for it).  The name of a source, shown under an opened statement, is not
    the site's own text: the letters of its authors are what the second files are for, and only one that no file
    holds is reported."""
    basic, more = font_ranges()
    texts = [(t[k], t["name"] if k == "name" else f"the description of {t['slug']}") for tags in catalogue.values()
             for t in tags for k in ("name", "description") if t.get(k)]
    texts += [(p["title"], p["title"]) for p in index["problems"]]
    cited = [(p["source"], f"the source of {p['title']}") for p in index["problems"] if p.get("source")]
    for name in pages:
        with open(os.path.join(OUTPUT_DIR, name), encoding="utf-8") as f:
            page = re.sub(r"<(script|style)\b.*?</\1>", " ", f.read(), flags=re.S)
        texts.append((html.unescape(re.sub(r"<[^>]+>", " ", page)), name))
    second, none = {}, {}
    for own, some in ((True, texts), (False, cited)):
        for text, where in some:
            for ch in text:
                if ord(ch) in basic or not ch.isprintable():
                    continue
                if ord(ch) not in more:
                    none.setdefault(ch, where)
                elif own:
                    second.setdefault(ch, where)
    if second:
        print("⚠️  web fonts: " + ", ".join(f"{ch} ({w})" for ch, w in second.items()) + " not in their basic files: a page "
              "that shows one downloads one more font file (about 30 KB). Add it to RANGES in tools/subset_fonts.py and "
              "to fonts.css, and cut the fonts again.")
    if none:
        print("ℹ️  web fonts: no glyph for " + ", ".join(f"{ch} ({w})" for ch, w in none.items()) + ": the browser draws "
              f"{'it' if len(none) == 1 else 'them'} in another font.")


def render_pages(index, catalogue, build=None, items=(), pdfjs=None, forms=None, previews=None):
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=False)

    def url_for(endpoint, **kw):
        if "filename" in kw:
            return f"static/{kw['filename']}"
        return "index.html" if endpoint == "home" else f"{endpoint}.html"

    def inline_json(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")   # no "</script" or "<!--" inside

    # build / engine: the problem texts and the LaTeX engine this page was built with (bank-compile.js::expectBuild);
    # pdfjs: the version of site/static/pdfjs/ (bank-ui.js draws the previews with it); previews: the statements as the
    # build typeset them (bank-compile.js::pickPreview)
    bank_data = inline_json({"tags": catalogue, "index": index, "build": build, "engine": engine_version(),
                             "pdfjs": pdfjs, "previews": previews})
    # the shared results a proposed solution may cite with \appendixref{name}: names, titles, the results they cite and
    # the labels a solution may refer to (texts are not needed); the page lists them in its writing rules
    results = [{"name": it["name"], "title": it["title"], "cites": list(it["cites"]), "labels": sorted(A.global_labels(it))}
               for it in items if it["name"]]
    # pdfjs: the Propose page draws its sheet with it too
    # what the Propose page reads of tags.yml: names and the trees, the origins' aliases (where it is from), the difficulty
    # levels' descriptions; not the topics' and methods' descriptions and aliases (half the page)
    slim = lambda tags, drop: [{k: v for k, v in t.items() if k not in drop} for t in tags]
    propose_tags = {"area": slim(catalogue["area"], {"description", "aliases"}), "methods": slim(catalogue["methods"], {"description", "aliases"}),
                    "difficulty": catalogue["difficulty"], "origin": slim(catalogue["origin"], {"description"})}
    propose_data = inline_json({"tags": propose_tags, "appendix": results, "pdfjs": pdfjs, "originForms": forms or {}})
    pages = [("index.html", {"page": "home"}),
             ("problems.html", {"page": "problems", "page_title": "Problems", "bank_data_json": bank_data, **tree_top(index)}),
             ("propose.html", {"page": "propose", "page_title": "Propose a problem", "propose_data_json": propose_data,
                               "appendix_results": results, "engine_mb": engine_download_mb()})]
    version = asset_version()
    for name in os.listdir(OUTPUT_DIR):
        if name.endswith(".html"):
            os.remove(os.path.join(OUTPUT_DIR, name))
    for template_name, context in pages:
        html = env.get_template(template_name).render(url_for=url_for, asset_version=version, club_email=CLUB_EMAIL, site_url=SITE_URL,
                                                      year=datetime.date.today().year, **context)   # site.js updates the year
        with open(os.path.join(OUTPUT_DIR, template_name), "w", encoding="utf-8") as f:
            f.write(html)
        print(f"built site/{template_name}")
    # GitHub Pages serves this for a wrong address, at any depth: so its links are absolute (and the CSP has base-uri 'none')
    root = "/" + paths.GITHUB_REPO.split("/")[1] + "/"
    html = env.get_template("404.html").render(url_for=lambda endpoint, **kw: root + url_for(endpoint, **kw), asset_version=version,
                                               club_email=CLUB_EMAIL, site_url=SITE_URL, year=datetime.date.today().year, page="404", page_title="Page not found")
    with open(os.path.join(OUTPUT_DIR, "404.html"), "w", encoding="utf-8") as f:
        f.write(html)
    print("built site/404.html")


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
    probs, items = load_and_validate(tags)
    if a.preview:
        assign_provisional_ids(probs, read_last_id())   # new-*.tex under the number they will get after the merge

    if not a.no_compile:
        step("compiling every problem standalone (with and without solution) and every shared result")
        compile_all(probs, items, tags, a.jobs)

    step("site data")
    index, catalogue, build, previews = write_site_data(probs, items, tags, a.preview, a.jobs)

    # a fresh clone has no bundle, and one made from an older preamble.tex lacks its new macros: Create / Preview and
    # the browser tests need a current one
    stale = not bundle_is_current()
    if not a.no_bundle or stale:
        step("in-browser engine bundle" + (" (missing or built from an older preamble.tex, so built despite --no-bundle)"
                                           if a.no_bundle else ""))
        build_bundle(ensure_assets(a.assets))

    step("PDF.js (draws the previews)")
    pdfjs = copy_pdfjs()
    print(f"pdfjs-dist {pdfjs} → site/static/pdfjs/")

    step("HTML pages")
    render_pages(index, catalogue, build, items, pdfjs, origin_forms(probs), previews)
    check_fonts(catalogue, index, ("index.html", "problems.html", "propose.html", "404.html"))
    print(f"\n🎉 Site built in 'website-code/site/'{' (preview)' if a.preview else ''}. Serve it with: python3 -m http.server 8000 --directory website-code/site")


if __name__ == "__main__":
    main()
