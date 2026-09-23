# Math Olympiad Club Zurich

The repository of the Math Olympiad Club at ETH Zürich: the club's documents, its problem bank and its
website (hosted on GitHub Pages).

**Website:** https://math-olympiad-club-ethz.github.io/math-olympiad-club-ethz/

**Repository owner:** GitHub organization [`math-olympiad-club-ethz`](https://github.com/math-olympiad-club-ethz)

| Where | What |
|---|---|
| [`association-documents/`](association-documents/) | The club as an association: statutes (`.tex` + PDF) and the signed founding minutes |
| [`problem-bank/`](problem-bank/) | The problem bank: one LaTeX file per problem, the tag list, preamble and bibliography, work in progress |
| [`website-code/`](website-code/) | The website: build script, templates, tests, and the generated pages deployed to GitHub Pages |

---

## For New Committee Members

### Getting access

Ask the current org owner to add you as a collaborator:
1. Go to https://github.com/orgs/math-olympiad-club-ethz/people
2. Click **Invite member** and enter the new member's GitHub username
3. Give them **Write** access (or **Admin** if they need to manage settings)

## How the problem bank works

The **Problems** page is a searchable problem bank. Every problem is one file in `problem-bank/problems/`
(`NNNN-short-title.tex`: a header of `%` comments, then `\begin{problem}…\end{problem}` and an optional
`\begin{solution}…\end{solution}`). `problem-bank/tags.yml` is the only list of allowed tags (areas as a tree, methods,
difficulty, origins). `website-code/build.py` validates every problem, compiles each one with pdflatex to prove it works,
and writes the site data; the page filters the problems in the browser. **Create** compiles the selection to the
problems PDF **in the browser** with pdfTeX compiled to WebAssembly
([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex), TeX Live 2026, AGPL-3.0 — its licence is shipped
with the bundle); a second button then builds the PDF with the solutions, only if asked. No server is involved and no
PDF is stored anywhere but in your browser's cache (the cover prints the current filters, so the same problems under
other filters give a different PDF).

Only problems whose header says `review: human` appear on the website. The repository itself is public: every
problem file, reviewed or not and solution included, can be read on GitHub (and stays in the git history). The PDF
lists the ticked problems easiest first (difficulty, then area, then ID); the **PDF order** button lets you drag them
into your own order, which is kept in the shareable link. The ID only names the file: the website never shows it.

### Add or improve a problem (no git needed)

- **+ Propose a problem** (Problems page) opens a form: statement and solution in LaTeX side by side, tags from
  `tags.yml`, history fields, BibTeX, and a live PDF preview. The page makes the file
  `problem-bank/problems/new-<title>.tex`, copies it and opens GitHub's "new file" page; the contributor pastes it and
  GitHub opens a pull request, which anyone can read at once (solution included). A free GitHub account is needed
  (otherwise: email olympiadclub@math.ethz.ch).
- To improve an existing problem (a tag, a second solution, a fix), edit its file on GitHub: that becomes a pull
  request too. (An Edit link per problem on the website comes with the planned administrator mode, see TODO.md.)
- Only people with write access merge. Merging = approved, not finished: the board can add tags or solutions later;
  `review: human` publishes the problem.
- After the merge, the Action `.github/workflows/number-new-problems.yml` renames `new-<title>.tex` to the next free
  `NNNN-<title>.tex` and redeploys the site. Nobody chooses a number.

Details (by hand, file format, review): [`problem-bank/README.md`](problem-bank/README.md).

### Run locally

```bash
cd website-code
pip install -r requirements.txt
npm ci
python3 build.py --preview --no-compile --no-bundle
python3 -m http.server 8000 --directory site
```
Then open http://localhost:8000/problems.html. (The first two commands are needed once.)

- `--preview` includes unreviewed problems (with a `review:` badge) so you can review in the real UI.
- Without `--no-compile` every problem is compiled with your local TeX Live (MacTeX) — what CI does.
- Without `--no-bundle` the in-browser engine bundle `website-code/site/static/busytex/` is (re)built: this downloads the
  texlyre-busytex assets once (≈520 MB, cached in `.cache/`, checked against `tools/busytex-assets.sha256`) and needs
  Node + TeX Live (≈40 s). You only need it after changing `preamble.tex`; when the bundle is missing (fresh clone) it
  is built even with `--no-bundle`, so the first build takes longer.
- `python3 -m bank.validate --compile` (in `website-code/`) validates and compiles the problem files alone.
- Tests: `npm test` (unit tests of the search, order and propose logic, JS/Python parity tests, Python validator
  tests, and headless-browser tests: the Problems page (filter, tick, order, both PDFs checked) and the Propose page
  (form, live preview, the generated file passes `bank.validate --compile`)).

### Repository structure

```
association-documents/      ← statutes.tex + statutes.pdf, signed founding minutes
problem-bank/
  problems/                 ← one .tex per problem; _template.tex; _preview.tex (VS Code)
  tags.yml, preamble.tex, references.bib
  work-in-progress/         ← problems still in construction (magic problems), git-ignored, local only
  known-errors.md           ← mistakes in statements/solutions still to fix (temporary)
  history-review.md         ← AI history pass results to review (temporary)
website-code/
  build.py                  ← validates, compiles, writes site data + engine bundle, renders templates/ into site/
  bank/                     ← Python library: paths, tags, problem parser/validator, stitch, data
  templates/                ← Jinja2 templates (base, index, problems, propose)
  site/                     ← the site as served (GitHub Pages); site/static/js/bank-*.js is the page's code
  tools/                    ← busytex_bundle.py (in-browser TeX engine bundle)
  tests/                    ← unit (node:test), python (unittest), e2e (Playwright)
.github/workflows/          ← deploy.yml: TeX Live + build + tests, any failure → nothing deploys;
                               number-new-problems.yml: new-<title>.tex → NNNN-<title>.tex after a merge
.github/CODEOWNERS          ← paths that run code (CI, site, local preview) need a code owner's review
.vscode/                    ← save a problem file and it compiles (LaTeX Workshop), see "Run locally"
TODO.md                     ← what is still open, across the whole repository
```

Everything the build writes is git-ignored and rebuilt by CI: the pages `website-code/site/*.html` themselves, the
site data `website-code/site/static/bank/`, the engine bundle `website-code/site/static/busytex/` and the download
cache `website-code/.cache/`. So is `problem-bank/inspiration/`, the reference material each member keeps locally.
