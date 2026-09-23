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

- [ ] **0062**: the "not transcendental" claim is probably false (The Pentagon's editor note, 2024) — ask only for irrationality?
- [ ] **0065**: typos "inekcalaty" → "inekoalaty", "suitable x_m" → "x_n".
- [ ] **0074**: typo "cost pf".
- [ ] **0080**: m is a natural number in the original; typo "for elements".
- [ ] **0052**: the statement only assumes the closed disc in U.
- [ ] The 142 known content errors listed in [`problem-bank/known-errors.md`](problem-bank/known-errors.md).
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

- [ ] Commit the reorganisation, the problem bank, the history pass and the website in a series of commits grouped
      by theme on branch `problem-bank`, push the branch, and merge it into `main` only at the very end — that
      merge is what replaces the live site.
- [x] `.gitignore` decided (2026-09-22): signed minutes public, `website-code/site/*.html` ignored, `* 2.*` narrowed
      to the build folders.
- [ ] Cleanup left, all outside the repository (the maintainer's local notes): move the folder out of iCloud and delete
      the `* 2.*` copies (after the push), old Playwright browsers, the backup tarball, the `inspiration/` questions.
