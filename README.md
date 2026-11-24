# Math Olympiad Club at ETHZ

The repository of the Math Olympiad Club at ETH Zürich: the club's documents, its problem bank and its website (hosted on GitHub Pages).

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

The **Problems** page is a searchable problem bank. Every problem is one file in `problem-bank/problems/` (`NNNN-short-title.tex`: a header of `%` comments, then `\begin{problem}…\end{problem}` and an optional `\begin{solution}…\end{solution}`). `problem-bank/tags.yml` is the only list of allowed tags (areas as a tree, methods, difficulty, origins). `website-code/build.py` validates every problem, compiles each one with pdflatex to prove it works, and writes the site data; the page filters the problems in the browser. A click on a problem's title shows its statement, typeset by the build in advance (every statement at twelve widths, from a phone's to a sheet's: no engine to download for it), and under it where the problem comes from: its source by name, as a link to where it can be read (the PDF headings carry the same link). **Create PDF** compiles the selection to the problems PDF **in the browser** with pdfTeX compiled to WebAssembly ([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex), TeX Live 2026, AGPL-3.0 — its licence is shipped with the bundle); a second button then builds the PDF with the solutions, only if asked. No server is involved and no PDF is stored anywhere but in your browser's cache.

Problems whose header says `review: human` appear on the website as they are; the others are "proposed", shown only once the visitor turns on **Show the proposed problems** (the Proposed filter of the Problems page), with a "proposed" badge and a note on their PDF heading. The repository itself is public: every problem file, reviewed or not and solution included, can be read on GitHub (and stays in the git history). The PDF lists the ticked problems easiest first (difficulty, then area, then ID); the **PDF order** button lets you drag them into your own order, which is kept in the shareable link. The ID only names the file: the website never shows it.

### Add or improve a problem (no git needed)

- **Propose a problem** (in the site's header) opens a page where the problem is written in LaTeX and typeset as it is written (the in-browser pdfTeX of the Problems page). Only the statement and its topic are needed; a solution, where it comes from (one line, such as "IMC 2012, Problem 3"), why the proposer likes it, methods, difficulty, references and BibTeX are optional, and a topic or a method the tree lacks can be named where it belongs. **Send to the club** opens the device's share menu with the PDF, the problem file `new-<title>.tex` and the proposer's note (a .txt, when written): a click on Mail gives an email with them attached and one line, "Problem: <title>"; the club's address is copied, to paste in To. Without a share menu (Firefox) the files are saved and the mail app opens with that line. A page cannot put files into an email any other way. Whoever reads it adds the .tex to `problem-bank/problems/`; new tags are named in a comment line of its header.
- To improve an existing problem (a tag, a second solution, a fix), edit its file on GitHub: that becomes a pull request. (An Edit link per problem on the website comes with the planned administrator mode, see TODO.md.)
- Only people with write access merge. Merging = approved, not finished: we can add tags or solutions later; until `review: human`, the problem shows on the website as "proposed" (behind its switch).
- After the merge, the Action `.github/workflows/number-new-problems.yml` renames `new-<title>.tex` to the next free `NNNN-<title>.tex` and redeploys the site. Nobody chooses a number.

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
- Without `--no-bundle` the in-browser engine bundle `website-code/site/static/busytex/` is (re)built: this downloads the texlyre-busytex assets once (≈520 MB, cached in `.cache/`, checked against `tools/busytex-assets.sha256`) and needs Node + TeX Live (≈40 s). You only need it after changing `preamble.tex`; when the bundle is missing (fresh clone) or was made from an older `preamble.tex`, it is built even with `--no-bundle`, so that build takes longer.
- `python3 -m bank.validate --compile` (in `website-code/`) validates and compiles the problem files and the shared results alone.
- Tests: `npm test` (unit tests of the search, order and propose logic, JS/Python parity tests, Python validator tests, and headless-browser tests: the Problems page (filter, tick, order, both PDFs checked) and the Propose page (form, live preview, the generated file passes `bank.validate --compile`)).

### Repository structure

```
association-documents/      ← statutes.tex + statutes.pdf, signed founding minutes
problem-bank/
  problems/                 ← one .tex per problem; _template.tex; _preview.tex (VS Code)
  appendix/                 ← shared results (theorem + proof), cited from solutions with \appendixref{name}
  tags.yml, preamble.tex, references.bib
  work-in-progress/         ← problems still in construction (magic problems), git-ignored, local only
  known-errors.md           ← mistakes in statements/solutions still to fix (temporary)
  history-review.md         ← AI history pass results to review (temporary)
website-code/
  build.py                  ← validates, compiles, writes site data + engine bundle, renders templates/ into site/
  bank/                     ← Python library: paths, tags, problem parser/validator, shared results, stitch, data
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

Everything the build writes is git-ignored and rebuilt by CI: the pages `website-code/site/*.html` themselves, the site data `website-code/site/static/bank/`, the engine bundle `website-code/site/static/busytex/` and the download cache `website-code/.cache/`. So is `problem-bank/inspiration/`, the reference material each member keeps locally.
