# TODO — Math Olympiad Club ETHZ

Open work across the repository. Tick items off (`- [x]`) or delete them when done.

## Problem bank — publish

- [ ] Review the 80 problems and set `review: human` on each one you accept. Until then the public site shows
      **no problems** (only `review: human` is published; `python3 build.py --preview` shows all).
- [ ] After checking a problem's history header, set `history: human` (the AI pass set `history: ai`).

## Problem bank — decisions from the history pass (2026-09-22)

Details, sources and the full change table: [`problem-bank/history-review.md`](problem-bank/history-review.md).

- [ ] **Titles**: apply which established names? (title line + rename the file, number kept) — 0005 Baum–Sweet
      sequence, 0018 Sutner's theorem, 0030 Minkowski's lemma, 0032 Jacobson's lemma, 0036 5/8 theorem,
      0052 Darboux-Picard theorem, 0055 100 prisoners and a light bulb, 0066 Fermat point, 0070 Perplexing polynomial puzzle.
- [ ] **Origin rule**: first appearance of the *result* (research paper) or first time *posed as a problem*
      (competition)? Affects 0005, 0016, 0018, 0030, 0036, 0080.
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
- [ ] The 87 errors that need a mathematical fix, each with an AI **Proposal** to check, in
      [`problem-bank/known-errors.md`](problem-bank/known-errors.md) (among them 0062 "not transcendental", 0080 m a
      positive integer, 0052 closed disc in U).
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

## Audit follow-ups (yours, 2026-09-23)

The audit's code fixes are done (report: session scratchpad `audit/REPORT.md`). Left for you:
- [ ] After the first push: on GitHub, add a ruleset on `main`: "Require a pull request before merging" +
      "Require review from Code Owners" (+ require the `build` check). `.github/CODEOWNERS` names you for `.github/`,
      `.vscode/`, `website-code/` and the preamble. Put GitHub Actions in the bypass list, or the numbering bot can
      no longer push its renames to `main`.

## Website — later

- [ ] Idea (Antoine, 2026-09-22), not now: a **track record** page listing what club members achieved in
      competitions (IMC, ICMC, …). The 2025 lines about IMC and ICMC were removed from the home page for that reason.

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
