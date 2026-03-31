# Math Olympiad Club Zurich

A static website for the Math Olympiad Club Zurich, hosted on GitHub Pages.

**URL:** https://math-olympiad-club-ethz.github.io/math-olympiad-club-ethz/

**Repository owner:** GitHub organization [`math-olympiad-club-ethz`](https://github.com/math-olympiad-club-ethz)

---

## For New Committee Members

### Getting access

Ask the current org owner to add you as a collaborator:
1. Go to https://github.com/orgs/math-olympiad-club-ethz/people
2. Click **Invite member** and enter the new member's GitHub username
3. Give them **Write** access (or **Admin** if they need to manage settings)

## How It Works

This site is **statically generated** — no server required. When you push changes to `main`, GitHub Actions automatically rebuilds and deploys the site.

### Repository structure

```
templates/          ← Jinja2 HTML templates (source)
  base.html         ← Shared layout (navbar, footer, dark mode)
  index.html        ← Homepage template
  problems.html     ← Problems page template
docs/               ← Generated output (served by GitHub Pages)
  index.html        ← Generated homepage
  problems.html     ← Generated problems page
  static/
    css/custom.css  ← Styles
    images/         ← Logo, sponsor images
    uploads/problems/ ← PDFs organized by semester/problemset
build.py            ← Static site generator
compile_and_clean.py← LaTeX → PDF compiler
preamble.tex        ← Shared LaTeX preamble
```

---

## Adding New Problems

1. Create a subfolder under `docs/static/uploads/problems/` (e.g. `fall_2025/problemset_5/`)
2. Put your `.tex` files there
3. Run `python compile_and_clean.py` to compile them into PDFs
4. Commit and push — **GitHub Actions automatically runs `build.py` and deploys the site**

> **You do NOT need to run `build.py` locally.** The GitHub Actions workflow runs it for you on every push to `main`. Running it locally is only useful to preview the site before pushing.

## Local Preview (optional)

```bash
pip install jinja2
python build.py
# Open docs/index.html in browser, or:
cd docs && python -m http.server 8000
```

## Utility Scripts

### `compile_and_clean.py`
Compiles LaTeX `.tex` files into PDFs:
- Installs required LaTeX packages from `preamble.tex`
- Compiles all `.tex` files to PDF using `latexmk`
- Cleans up auxiliary files, leaving only PDFs

### `preamble.tex`
Shared LaTeX preamble with common packages and custom commands for problem documents.

### `build.py`
Static site generator — scans `docs/static/uploads/problems/` and generates HTML files in `docs/`.