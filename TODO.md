# TODO — Math Olympiad Club ETHZ

Open work across the repository. Tick items off (`- [x]`) or delete them when done.

## Problem bank — publish

- [ ] Review the 80 problems and set `review: human` on each one you accept. Until then the public site shows
      **no problems** (only `review: human` is published; `python3 build.py --preview` shows all).
- [ ] After checking a problem's history header, set `history: human` (the AI pass set `history: ai`).
- [ ] 0081–0087 (VJIMC 2002–2014, added 2026-09-29/30): statement **and** solution written by AI at Antoine's request
      (see the `% AI-WRITTEN` comment in each file); review them like the others before `review: human`. Review
      `problem-bank/appendix/cauchy-group-theorem.tex` (also AI-written) with 0085 and 0087: it is published with the first of
      them to get `review: human`.

## Problem bank — decisions from the history pass (2026-09-22)

Details, sources and the full change table: [`problem-bank/history-review.md`](problem-bank/history-review.md).

- [ ] **Titles**: apply which established names? (title line + rename the file, number kept) — 0005 Baum–Sweet
      sequence, 0018 Sutner's theorem, 0030 Minkowski's lemma, 0032 Jacobson's lemma, 0036 5/8 theorem,
      0052 Darboux-Picard theorem, 0055 100 prisoners and a light bulb, 0066 Fermat point, 0070 Perplexing polynomial puzzle.
- [ ] **Origin rule**: first appearance of the *result* (research paper) or first time *posed as a problem*
      (competition)? Affects 0005, 0016, 0018, 0030, 0036, 0080, and 0081, 0085, 0087 (added 2026-09-30). For 0087
      also: the full statement first appears in Alon-Bourgain's preprint (Nov 2013), but Legendre (1825, §23) already
      proves the case of subgroups of odd prime index with the same argument. 0087 follows 0081 (origin = first paper
      with the full statement; earlier special cases in references); 0030 took Minkowski's special case instead.
- [ ] **New origin slugs** `paper` and `historical`: keep, or widen `journal` / use `book` instead?
- [ ] **Folklore or first verified source**: 0045, 0048, 0053, 0055.
- [ ] **0019**: the earliest record is Antoine's MSE post (2025) — ask the friend where the problem came from.
- [ ] **0031** (collection): origin = first part (AMC 12B 2007) or oldest part (AIME 1998)?
- [ ] **0010**: RMT year 1989 may be a misprint for 1987 — check a copy of Revista Matematică Timișoara.
- [ ] **0020**: origin = Cover 1987 ("Pick the largest number") or the older envelope paradox (Kraitchik 1953)?
- [ ] **taken-from**: move the "Club source: …" notes from `references` to `taken-from`
      (0032, 0035, 0038–0040, 0046, 0051–0053, 0055–0057, 0066, 0067).
- [ ] **Older-source searches**: re-run a search-only pass for the 63 problems listed in history-review.md
      (the web-search quota ran out during the checks).
- [ ] **0025**: split into two problems (IMO 1988 P6 and IMO 2007 P5)?

## Problem bank — LaTeX fixes (humans only)

- [x] Pure typos in the problem files fixed (59 entries, 2026-09-23, with Antoine's OK; check the diff before committing).
- [ ] The 87 errors that need a mathematical fix, each with an AI **Proposal**, in
      [`problem-bank/known-errors.md`](problem-bank/known-errors.md). Plan (decided 2026-09-23, for later):
      - 13 are only cosmetic (unusual notation, compiles fine): delete those entries.
      - 6 need real missing maths (0014, 0033, 0034, 0038, 0039, 0056): mark the problems `status: partial`, drop the
        entries; 0069's entry too (already partial).
      - 68 concrete corrections in 34 problems: apply them all and read the diff, or go through them one by one.
- [ ] **0030, Antoine himself**: merge the two versions by hand, taking the best of each. Since the merge of GitHub
      main (2026-10-02), the file holds Antoine's full solution, then Spas and Ana's solutions appended as they are
      (after the comment `% ---- Solutions by Spas and Ana ...`: a Setup, Solutions 1–4, Counterexamples for m = 2). The
      file has duplicate solutions until then. Their `difficulty: hard` was taken; their `review: human` was not
      (`review: none` until the review is done).
- [ ] Missing solutions: 0052, 0060–0062, 0065–0068, 0071–0080.
- [ ] Partial solutions: 0019, 0031, 0034, 0038–0040, 0049, 0063, 0064, 0069.

## Problem bank — later

- [ ] Magic problems (hat problems, picture hanging) in `problem-bank/work-in-progress/magic/`: separate category, not migrated yet.
- [x] Website "+" flow: Propose page + Edit links + automatic numbering (2026-09-22).
- [ ] After the first push to `main`: check that the Action `number-new-problems.yml` can push (if `main` gets branch
      protection, let github-actions bypass it) — try it once with a test proposal.
- [ ] Idea (Antoine, 2026-09-22), not now: review problems **from the website** — an administrator mode behind a
      password where a board member sets `review: human`, edits tags or fixes a statement without going through
      GitHub. Needs thought: a static GitHub Pages site has no server and no safe place for a password.
      With it comes back the **Edit** link next to each problem (removed from the Problems page on 2026-09-23 until then).
- [ ] Later: CI posts the compiled PDF of a proposed problem on its pull request.
- [ ] Idea (Antoine, 2026-09-23): a **"proposed"** tag. Today a proposed problem stays invisible on the site until
      someone sets `review: human`. Instead it could be listed at once with a "proposed" badge, and lose it when
      reviewed. To decide: shown to everyone, or only behind a "show proposed problems" switch (unreviewed content,
      possibly wrong). Needs the build to publish `review: none` problems in that case.
- [ ] Raised by Spas (2026-09-28): **one broken problem blocks the whole site.** `build.py` stops at the first
      validation or pdflatex error in any problem file (`load_and_validate` / `compile_all` call `fail()`), and the
      deploy job needs the build, so nothing deploys, not even correct edits made later, until that file is fixed.
      This is the repository's own build design, not a GitHub Pages limit. Idea: deploy the site without the broken
      problems (named in the build log) while CI still shows them as failed, so they get fixed. To decide: only on
      `main` or also for pull requests; how to report (red check, GitHub issue, note on the Problems page).
- [x] Shared **appendix of reusable results** (Antoine, 2026-09-30; built the night of 2026-09-30, not committed):
      `problem-bank/appendix/<name>.tex`, cited with `\appendixref{<name>}`, printed once per PDF as A.1, A.2, …
      (see problem-bank/README.md, "Shared results"). The appendices of 0018, 0030, 0034, 0041 moved there verbatim
      (10 results) plus Cauchy's theorem (AI-written, from 0085). Follow-ups:
  - [ ] Gauss's Lemma (I, II, III) is cited by name in 0035 and 0041 but never stated or proved anywhere: a candidate
        result for the library (a human writes it).
  - [ ] Candidates found inside solutions (could become shared results): 0049 (injective continuous => monotone;
        periodic point => fixed point; iterative square roots), 0030's footnote on Legendre's formula, the two
        footnotes of `appendix/unipotent-finite-order.tex` (commuting nilpotents; unit + nilpotent), 0070 (uniqueness
        of base-b expansion; evaluation at a transcendental is injective on N[X]), 0034 (definitions of real powers),
        0031 (Simon's factoring identity).
  - [ ] Two results have no proof: `appendix/spectral-mapping-theorem.tex` recalls the theorem without one, and
        `appendix/gelfond-schneider-theorem.tex` says "Proof not yet written" (0034's known error). Write the proofs,
        or cite a reference instead.

## Audit follow-ups (yours, 2026-09-23)

The audit's code fixes are done (report: session scratchpad `audit/REPORT.md`). Left for you:
- [ ] After the first push: on GitHub, add a ruleset on `main`: "Require a pull request before merging" +
      "Require review from Code Owners" (+ require the `build` check). `.github/CODEOWNERS` names you for `.github/`,
      `.vscode/`, `website-code/` and the preamble. Put GitHub Actions in the bypass list, or the numbering bot can
      no longer push its renames to `main`.

## Website — later

- [ ] Idea (Antoine, 2026-09-22), not now: a **track record** page listing what club members achieved in
      competitions (IMC, ICMC, …). The 2025 lines about IMC and ICMC were removed from the home page for that reason.

- [ ] look at the picture image.png stored in the repo (only on Antoine local machine), it contains some task tod o given by Georg.

## Repository

- [x] Reorganisation, problem bank, history pass and website committed as a themed series, merged into `main` and
      live (2026-09-23).
- [x] `.gitignore` decided (2026-09-22): signed minutes public, `website-code/site/*.html` ignored, `* 2.*` narrowed
      to the build folders.
- [ ] The repository stays in iCloud (decided 2026-09-23), which keeps making " 2" copies of files that change while
      it syncs. Check `git status` before `git add -A`. To delete the copies identical to their original:

      ```sh
      git ls-files --others --exclude-standard | grep ' 2\.' | while IFS= read -r d; do cmp -s "$d" "${d/ 2./.}" && rm -v "$d"; done
      ```
- [ ] Local `inspiration/` folder (each member's own, git-ignored), later: are the two images of the Bernoulli 2026 P5
      solution the same write-up; have the problems in `proposals/` been added to the bank; is
      `competitions/putnam/Very Nice Putnam problem.png` in the bank; clean the old 2025 notes in `problem_collection.tex`.
