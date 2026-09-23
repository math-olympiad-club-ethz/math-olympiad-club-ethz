# Problem bank

One LaTeX file per problem in `problems/`, the list of allowed tags in `tags.yml`, the shared `preamble.tex`
and `references.bib`. The website (`../website-code/`) reads this folder; nothing here depends on the website.

```
problems/NNNN-short-title.tex   ← one problem (header in % comments, \begin{problem}, optional \begin{solution})
problems/new-short-title.tex    ← a proposed problem, not numbered yet (numbered automatically after the merge)
problems/_last-id.txt           ← highest number ever given (kept by the numbering Action; numbers are never reused)
problems/_template.tex          ← copy this to add a problem
problems/_preview.tex           ← wrapper used by VS Code to compile a single problem
tags.yml                        ← the ONLY list of allowed tags (areas as a tree, methods, difficulty, origins)
preamble.tex                    ← shared preamble (author/CI mode with TikZ + biblatex; stitched browser mode)
references.bib                  ← shared bibliography for \cite
work-in-progress/               ← problems still in construction (the magic problems); git-ignored, local only
known-errors.md                 ← mistakes found in statements/solutions, still to fix (temporary)
history-review.md               ← what the AI history pass changed, with sources; still to review (temporary)
inspiration/                    ← personal reference material, git-ignored
```

## Add a problem

**From the website (no git):** Problems page → **+ Propose a problem**. Write the statement (and, if you have
one, the solution), pick at least one area, check the live preview, then **Copy file and open GitHub**: paste the
file into GitHub's editor and click *Propose new file* → *Create pull request*. A free GitHub account is needed;
without one, email the file to olympiadclub@math.ethz.ch. The pull request, solution included, is public as soon as
it is opened and stays in the history, even if it is not merged.

**By hand:**

1. Copy `problems/_template.tex` to `problems/new-short-title.tex`, `short-title` = your title in kebab-case
   (lowercase ASCII, hyphens). Don't pick a number: after the merge, the GitHub Action
   `number-new-problems.yml` renames the file to the next free `NNNN-short-title.tex` (the number never changes
   afterwards). Renaming the title later = renaming the file.
2. Fill the header (`_template.tex` explains every field): at least one `area` slug from `tags.yml`; everything
   else is optional and may stay empty
   (a blank `title` means "Untitled problem", file `new-untitled-problem.tex`). `title` and `origin-number` are
   printed in the PDF headings, so they are plain text: letters (accents and Greek are fine), digits, punctuation;
   math symbols in words (not √ or ≤).
   Write the statement inside `\begin{problem}…\end{problem}` and, if you have one, the solution inside
   `\begin{solution}…\end{solution}` (after the problem block, not inside it; nothing outside the blocks but `%`
   comments). TikZ (inside `tikzpicture` / `tikzcd` environments, not inline `\tikz`) and `\cite` work as usual.
   Define macros with `\newcommand` inside the block. A PDF from the website holds many problems in one document, and
   CI compiles every file, so the validator rejects what could reach beyond the problem: `\def`, `\let`, `\global`,
   `\catcode`, `\csname`, `\makeatletter`, `\input`, `\includegraphics`, `\newtheorem`, `\today`, … (it names the
   command and the line).
3. Preview: save the file in VS Code (LaTeX Workshop builds it through `_preview.tex`), or run
   `cd website-code && python3 -m bank.validate --compile ../problem-bank/problems/new-*.tex`.
4. Open a pull request. CI validates the file, compiles it (also in the website's engine, under its future
   number) and prints exactly what is wrong (`file:line: message`).

**Bibliography:** `\cite{key}` needs `key` in `references.bib` or in an optional block at the end of the file,
used by that problem only (LaTeX skips it; the website turns citations into a numbered reference list; no
`\bibliography` / `\addbibresource` lines):

```latex
\begin{bibentries}
@article{key, author = {…}, title = {…}, journal = {…}, year = {…}}
\end{bibentries}
```

New tag or origin = one entry in `tags.yml` (slug, name, optional description and aliases).

## Improve a problem, review

- To change a problem, edit its file on GitHub (`problem-bank/problems/`); saving proposes the change as a pull
  request (an extra tag, a second solution, a fix).
- Only people with write access to the repository merge. Merging = approved, not finished: tags, solutions and
  history can be added later by anyone, through another pull request.
- `review: human` publishes the problem on the website.
- Two independent fields say who checked what:
  - `review` — the problem itself (statement, solution, tags): `none` nobody yet, `ai` a tool looked at it,
    `human` a board member accepted it → published.
  - `history` — only the history fields (`origin`, `origin-date`, `origin-number`, `also-in`, `taken-from`,
    `references`): `none` nobody looked, `ai` filled by an AI pass from sources it found (what it changed and how
    sure it was: [`history-review.md`](history-review.md)), `human` checked by a person against the source.
    `history` never decides whether a problem is published.

## Rules

- Statements and solutions are written by humans. Tools may only fill header fields.
- IDs are sequential integers without meaning, given automatically after the merge; they never change and are never reused.
- Every header field except `area` may be empty; an empty field never breaks anything.
- Only `review: human` problems appear on the website. The repository itself is public: every file here (unreviewed
  problems and their solutions, `known-errors.md`, `history-review.md`) can be read on GitHub, and stays in the history.
- The ID never appears on the website (list, search, PDFs); it only names the file.
