# TODO — Math Olympiad Club ETHZ

Open work across the repository. Tick items off (`- [x]`) or delete them when done.

## Problem bank — publish

- [ ] Review the 87 problems and set `review: human` on each one you accept (67 done in the last commit, 2026-10-06).
      Until then a problem shows on the site only as "proposed", behind its switch.
- [ ] **Back to `review: none` on 2026-10-17** (checklist pass; they show as proposed until fixed and reviewed again):
      - Antoine's 10 under review: 0003, 0011, 0023, 0030, 0032, 0033, 0040, 0054, 0061, 0072.
      - Unfinished or left-over text: 0012 ("for the same reason as the previous problem", there is none in the
        bank), 0031 (the AIME 1998 part stops before the answer, the BMO 2005 part has no solution), 0038 and 0039
        ("This solution needs to be written more formally"), 0050 (a sentence ends in "and then ."), 0063 and 0064
        ("to finish" in red), 0069 (the three limits and the final value are missing). The shared result
        `gelfond-schneider-theorem` has no proof yet ("Proof not yet written"); shared results have no review field.
      - The fixes listed below under "LaTeX fixes": 0045, 0049, 0056, 0057.
- [ ] **History check**: check the problems with `history: ai` and set `history: human` (36 on 2026-10-19: 0013, 0030–0031, 0052, 0056, 0062, 0081–0110).
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
- [ ] **Older-source searches**: re-run a search-only pass for the 63 problems listed in history-review.md
      (the web-search quota ran out during the checks).
- [ ] **0025**: split into two problems (IMO 1988 P6 and IMO 2007 P5)?

## Problem bank — LaTeX fixes (humans only)

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
- [ ] 0003 solution 2 seems not to follow the writing style: to be done by an agent and then put to be reviewed by human (the solution 2 only)
- [ ] **0056**: the solution is in French: translate it into English, keeping its parts (a) and (b). At its end, a
      French note to self ("Penser à peut-être faire une version du prophet inequality problem", and 3 links) is not
      solution text: move it out of the file. (Checklist pass, 2026-10-17.)
- [ ] **0049** (published): a note to Spas is left in a lemma environment ("Spas ? it would be nice if you could make
      a lemma where such a g exists ..."): remove it. The file also writes intervals both ways (`(a, b)`,
      `[0, +\infty)` and the French `]0;1[`) and still has a `\textit{Remark:}` label. (Checklist pass, 2026-10-17.)
- [ ] **0045**: a closing parenthesis is missing in the associativity formula (`\cdot((a,\cdot((b,c)))` should end
      with four); the conditions are a hand-made list ("-$...$" lines with `$$` displays); grammar slips ("i.e"
      without its dot, "each element have"). (Checklist pass, 2026-10-17.)
- [ ] **0057**: one parenthesis too many in `=(((n+2)^{\alpha}-(n+1)^{\alpha})-...`; typos "Cotninuing",
      "succesor", "balading n to infinity" (letting n tend to infinity); in the informal discussion, a sentence stops
      in the middle ("if 1<α<2 then 1^α=1 and") and there are many grammar slips.
      (Checklist pass, 2026-10-17.)
- [ ] **Left from the checklist pass on the reviewed problems** (2026-10-17 to 2026-10-19, steps 1-9 done): what
      touches the mathematics or the author's wording.
      - Math typos: 0009, line 45: "To have \(3^n + n > 6\)" covers a = 2 and a = 3, so \(a^n\)?; 0035, line 44: the
        right side of the ⇔ repeats the primed left side (drop its primes?), and lines 206-208: \(\Gamma_{A,n}\) for the
        \(\Gamma_{A_n,+}\) defined above?; 0037, line 199: \(f^{m+1}(\dots) = f(f^{-m}(\dots))\), so \(f^{m}\)?; 0055,
        line 69: \(100 \cdot \ln(99) + \gamma\) lacks its brackets, \(100 \cdot (\ln(99) + \gamma)\).
      - Wording: 0010 "the second derivative is positive" (nonnegative, as in the statement?); 0020 "we may tune";
        0024 "the corresponding logarithmic matrix satisfies" (matrices satisfy?); 0034 "in the hyperlink" and "For
        now, ... has been active"; 0035 "then, as we saw"; 0037 a clause without a verb (line 130); 0041 a run-on
        sentence (line 55); 0044 a sentence without its verbs, where N₂ is never introduced (lines 91-93);
        `capelli-lemma` "because then they are" and `field-norm` "multiplicities of each root" (agreement).
      - 0044 still labels a theorem and its proof `\textit{Theorem:}` and `\textit{Proof:}`.
      - 0014: a footnote ending on a display runs 4 pt into the margin (splitting the display changed nothing).
      - Uniformity: statements label their parts as "(a)" paragraphs (0002, 0004, 0044, 0048, 0051, 0084) or as
        `\item[(a)]` (0025, 0101, 0102, 0104, 0105). Keep both, or choose one?
      - The problems with `review: none`: their entries of the checklist report wait for their review
        (`problem-bank/seminar_antoine_problems_solutions/bank-checklist-report.md`, local).

## Seminar rewrites (local, `problem-bank/seminar_antoine_problems_solutions/`)

- [ ] Mean value theorem: Problems 1-4 entered the bank on 2026-10-19 as 0107-0110; Problems 5-10 are left. Then the
      other sheets: differential inequalities, integral inequalities, matrix algebra, determinant and trace,
      eigenvalues, rank, polynomials, permutations, mock competition, Series 7, 14 and 19, and the group theory bonus.
- [ ] Guide proposals waiting for Antoine's answer: "Checking an example" (announce the hypotheses being checked,
      "First, ... Second, ...", and tie the example back to the claim; Continuity 7); the sin² + cos² shortcut as an
      example under "Look for the shortest argument" (Continuity 7); "Shorten the detours, not the author's chain"
      (Continuity 9); the formatter adding the spaces inside `\( \)` on every Cmd+S.

## Problem bank — tags (minor, ideas 2026-10-06)

- [ ] **Areas vs methods**: there are too many areas (themes), and some area tags are really methods. Go through the
      `area` tree of `problem-bank/tags.yml`, move those tags to `methods` and update the problems that use them.
- [ ] **Aliases that should be tags of their own**: e.g. the Euclidean algorithm (gcd) and Bézout's lemma must stay
      separate. The methods `gcd` and `bezout` already exist, but the area "Divisibility & gcd" also lists `gcd`,
      `euclidean algorithm` and `bezout` among its aliases. Check whether other aliases hide a separate tag
      (hopefully an isolated case).

## Problem bank — later

- [ ] To be done by Antoine: must review all current problems and solutions and precisely identify the partial one, the ai one and the unsolved one. Be sure that fully solved one together with their statement really are good. This cannot be done by an AI. THen Anotine must provide/finish the partial solution/empty solutions. 
- [ ] Magic problems (hat problems, picture hanging) in `problem-bank/work-in-progress/magic/`: separate category, not migrated yet.
- [ ] Later (Antoine, 2026-10-07): stress-test the website with several agents (bugs, speed, …). The numbering Action
      `number-new-problems.yml` has never run yet: the first real proposal merged into `main` is its first test.
- [ ] Idea (Antoine, 2026-09-22), not now: review problems **from the website** — an administrator mode behind a
      password where a board member sets `review: human`, edits tags or fixes a statement without going through
      GitHub. Needs thought: a static GitHub Pages site has no server and no safe place for a password.
      With it comes back the **Edit** link next to each problem (removed from the Problems page on 2026-09-23 until then).
- [ ] Later: CI posts the compiled PDF of a proposed problem on its pull request.
- [x] Idea (Antoine, 2026-09-23): a **"proposed"** tag. Done 2026-10-07: the public build publishes
      every numbered problem; the ones without `review: human` carry a "proposed" badge, are listed only behind the
      "Show proposed problems" switch of the Filters menu (off by default, in the link as `pr=1`, turned on by a link
      that ticks one), and their PDF heading says "proposed, not reviewed yet". To show them to everyone instead:
      `showProposed: true` in `bank-search.js::DEFAULT_FILTERS`.
- [x] Raised by Spas (2026-09-28), again on 2026-10-06: **one broken problem blocked the whole site.** Done
      2026-10-06. On `main`, CI first runs `python3 -m bank.leave_out --delete`: the build's own checks
      (validation, pdflatex, TikZ figures), then every broken problem file or shared result is deleted from the CI
      checkout, with the problems that cite a broken result. The build, the tests and the deploy run on the rest; the
      job "left-out" then turns the run red, and the build job's summary names each file and its error. Nothing
      deploys, as before, when more than 5 problems break at once or the cause is tags.yml, references.bib or
      `_last-id.txt`. Pull requests stay strict. Locally, `python3 -m bank.leave_out` lists what a deploy would leave
      out. The browser test no longer uses fixed problem numbers.
- Shared **appendix of reusable results** (`problem-bank/appendix/`, see problem-bank/README.md, "Shared results"), follow-ups:
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

## Website — Propose page (ideas, 2026-10-06)

- [x] **Origin fields** (done 2026-10-06): "Competition or source", "Date" (e.g. 1989 or 1989-12-02)
      and "Problem number" (e.g. A3 or Problem 6), each with its example under the field.
- [x] **Propose a tag** (done 2026-10-06): typing a name that is no tag offers "Propose “…” as a new
      area" (or method); it shows as a chip marked "new" and goes into the file as one comment line of the header,
      `% Proposed new tags, not in tags.yml yet (a board member adds them): …`, which the validator skips. The reviewer
      adds the tag to `tags.yml` and to the problem. An existing tag is never offered as new.

## Website — later

- [ ] Idea (Antoine, 2026-09-22), not now: a **track record** page listing what club members achieved in
      competitions (IMC, ICMC, …). The 2025 lines about IMC and ICMC were removed from the home page for that reason.

- [ ] look at the picture image.png stored in the repo (only on Antoine local machine), it contains some task tod o given by Georg.

- Website speed pass (2026-10-02), follow-ups:
  - [x] Logos (2026-10-07): the 1024 px club logo originals, light and dark, moved to
        `association-documents/logo/` (kept for events, never deployed); the site keeps only what it uses, made from
        them at a size sharp on every screen: header logo 176 px WebP (was 96), sponsor logo 512 px WebP (was 400),
        link preview 600 px on the site's background (was a transparent 280). Unused copies deleted (git history keeps
        them, and Jane Street's official 2968 px logo files: `static/images/LOGO_stacked_w_registration_*`).

## Repository

- [ ] Local `inspiration/` folder (each member's own, git-ignored), later: are the two images of the Bernoulli 2026 P5
      solution the same write-up; have the problems in `proposals/` been added to the bank; is
      `competitions/putnam/Very Nice Putnam problem.png` in the bank; clean the old 2025 notes in `problem_collection.tex`.
