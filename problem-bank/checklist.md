# Checklist for a .tex file

What to check before a problem, a solution or a shared result is done. `writing-style.md` says how the text is
written; this list covers the mechanical checks, the ones a tool or a careful read can settle.
Each rule is stated once: where an item names a section of `writing-style.md`, the rule and its examples are there.

## Done by the formatter

`website-code/bank/texformat.py` does these; VS Code runs it on every Cmd+S (`.vscode/settings.json`). By hand:
`python3 website-code/bank/texformat.py FILE --write` (in the seminar folder: `python3 indent.py FILE --write`).

1. **Indentation**: 4 spaces per nesting level (`writing-style.md`, section 7, "Source layout").
2. **Line width**: every paragraph refilled within 100 characters; lines that stay alone are listed in the guide.
3. **Double spaces**: a single space between words inside a paragraph.

## In the text

4. **Delimiters**: every pair of brackets in mathematics sized with `\left ... \right`, even around one symbol. The
   seminar's `leftright.py FILE --write` does it; reversed intervals are sized by hand: `\left]0;1\right[`. A pair sized
   with `\big`, `\Big`, `\bigl`, `\Bigl`, `\bigg` or `\Bigg` counts as unsized (`leftright.py` skips it): it becomes
   `\left ... \right`.
5. **Math mode**: no mathematics outside `\( \)` or `\[ \]`, not even a single letter (`\( S \)`, not `S`); inline
   formulas with a space inside the delimiters (`\( \mathbb{R} \)`, not `\(\mathbb{R}\)`); never `$` or `$$` (the
   validator rejects them; a dollar sign is `\$`). A number the mathematics talks about is mathematics too:
   "characteristic `\( 2 \)`", "of degree `\( 2 \)`", "between `\( 1 \)` and `\( 100 \)`", "tends to `\( 0 \)`",
   "`\( +\infty \)`" (never "+ infinity" or "plus infinity"), "a tuple of `\( 1 \)`s"; point names and expressions
   too (`\( ABC \)`, `\( AP+BP+CP \)`). Names and counts in words stay text: "Solution 2", "Day 1", "IMO 1988",
   "two solutions", and code (`random_uniform[0,1]`). The symbols `\forall` and `\exists` appear only in a display or
   inside a set-builder; in an inline formula of the prose they become "for all" and "there exists"
   (`writing-style.md`, section 6, "Logic").
6. **Monotonicity**: "increasing" and "strictly increasing", "decreasing" and "strictly decreasing" (never
   "non-decreasing" or "non-increasing"); where a step needs the strict version, the text says "strictly"
   (`writing-style.md`, rule 15 and section 8).
7. **Intervals**: always French notation, with `;` as the separator: `\left]a;b\right[`, `\left[a;b\right[`,
   `\llbracket 1;n \rrbracket`; never `(a, b)`, `[a, b)` or `(a, b]` (`writing-style.md`, section 6; their sizing:
   item 4). A pair `\left(a, b\right)`, a commutator or a polynomial ring `R\left[X,Y\right]` is not an interval.
8. **Labels and structure**: `\textit{Solution k.}` is never indented. After an environment (a remark, a lemma),
   write `\noindent\textit{Solution k.}`; no `\\\\` line right after a display or an environment.
   - Every solution is numbered from 1: `\textit{Solution 1.}`, `\textit{Solution 2.}`; never "Alternative
     solutions", "Second solution" or "Another proof" (a fact shared by some solutions is introduced by a plain
     sentence: "Solutions 2 and 3 both use the following fact:").
   - A remark or a note is a `remark` environment, never a `\textit{Remark:}` or "Note:" label.
   - No `\section`, `\subsection` or other heading in a problem file: the solution of a bonus question is labelled
     `\textit{Solution of the bonus.}`, alone on its line and followed by a `\\\\` line; a file holding two
     problems states them as parts.
   - Parts are labelled "(a)", "(b)" (paragraphs or `\item[(a)]`), never "a)" or "1)" (`writing-style.md`,
     section 2, "Parts").
9. **Stray characters and doubled words**: no character typed by accident or left over (a `§` slipped into
   `6§f'(0)`: look at every non-ASCII character; an extra parenthesis, as in `\)))`, or a doubled pair, as in `\log\left(\left(x\right)\right)`) and no word written twice
   ("from which they come from"). Apostrophes and quotes are ASCII (`'`, ``` `` ``` and `''`, not `’` or
   `“ ”`); never straight double quotes (`"naive"` prints as two closing quotes: write ``` ``naive'' ```); no
   em dash (`—`): rephrase with commas or parentheses; no LaTeX dash `--` in a compound word (`two-move`, not
   `two--move`; `writing-style.md`, section 7, "Characters").
10. **Punctuation and notation in formulas**: a formula is part of its sentence and is punctuated like one.
    - Every display is punctuated as its sentence requires, and so is every row of a `cases` (`writing-style.md`,
      section 7, "Punctuation inside displays").
    - A sentence never stops before its main clause: "while the player does not know `\( \alpha \)`, they still
      know ...", not "... `\( \alpha \)`. They still know ...".
    - No mark inside a formula that is not mathematics (`\( a,b,c \) are`, not `\( a,b,c, \) are`), no comma before
      a parenthesis that follows a formula, and none before a defining "if" ("is squarefree if it"). Two formulas
      side by side are separated by a word or a comma ("for all `\( k \in \mathbb{N} \)`, `\( a_{2^k} \neq 0 \)`");
      after "For any ..." in a list item, a comma, not ";".
    - One notation for one thing: a list of terms is `a_1, a_2, \dots`; a pair is written as a pair
      (`\left(p_i, q_i\right) \in \mathbb{Z}^{*} \times \mathbb{N}^{*}`); a one-sided limit is marked once
      (`x \underset{>}{\to} 0`, not also `0^+`).
    - A formula used as a prefix takes a hyphen outside the math: `\( \mathbb{F}_2 \)-subspace` (`writing-style.md`,
      section 7, "Hyphen after math").
    - A definition puts the defined name on the left, `k := f\left(a\right) = f\left(b\right)`; `=:` only when the
      formula goes on with the name, `f\left(a\right) = f\left(b\right) =: k \in \mathbb{R}` (`writing-style.md`,
      section 6, "Sets and definitions").
    - No reason or value written over or under a relation (`\overset{\text{clear}}{=}`, `\underset{...}{\leq}`,
      `\underbrace{...}_{...}`): it goes into the sentence. Only a limit arrow keeps its label:
      `\overset{n \to +\infty}{\longrightarrow}`.
    - A name of several letters is upright: `\mathrm{Id}`, `\mathrm{cte}_k`, `\operatorname{ran}` (`writing-style.md`,
      section 7, "Operator names").
11. **The statement asks something**: "Show that", "Find all", "Determine whether", a question. When the source has
   no question, take it from the origin (as for the IMC problems behind Continuity 2 and 9).

## Building

12. **Compilation**: the file compiles without error and without a line running into the margin (overfull box):
    the preview on save, or `cd website-code && python3 -m bank.validate --compile FILE`. A long formula is fixed as
    `writing-style.md`, section 7, "Long chains" says (an inline formula into a display, a display split in
    two); a long row of a `cases` gets a continuation row; a remark in `\text{...}` inside a display moves to
    the sentence after it. The preamble's `\emergencystretch` already
    lets a paragraph be set a little looser rather than overflow.
13. **Validator**: for a file of `problems/` or `appendix/`, `cd website-code && python3 -m bank.validate` passes.

## Language and mathematics

14. **Spelling**: every word of the prose (formulas left out) is a dictionary word or a name; British or American
    spelling, the same within a file (`writing-style.md`, section 8). The abbreviations of the notes are written out:
    "the mean value theorem" (MVT), "the intermediate value theorem" (IVT), "the fundamental theorem of calculus"
    (FTC, FTA), "integration by parts" (IBP), "ordinary differential equation" (ODE), "the Cauchy–Schwarz
    inequality" (CS), "theorem" (Thm) (`writing-style.md`, section 1, "Named results").
15. **Mathematics**: every step is checked (the math check of each rewrite round): no false claim, no missing case,
    every limit and every cited theorem with its reason, the hypotheses of a theorem checked where it is used. A
    rewrite that reads the scan differently from its transcription (a sign, a parenthesis, an argument) says so in the
    seminar's `TO-CHECK.md`.
16. **Links**: a niche name (a less common theorem, a named class of numbers) is linked where it is named, with
    `\href{...}{name}` (writing-style.md, "A niche name gets its link").
17. **Citations**: every `\appendixref{<name>}` points to an existing result (`problem-bank/appendix/`, or the
    seminar's `appendix/` while a rewrite is in progress) whose statement is exactly what the solution uses.

## The header

18. **Title**: it names the mathematics, as the bank's titles do, with no meta words; plain text (it is printed in
    the PDF headings).
19. **Origin**: checked against the official paper, never only against a comment: the seminar repository's comments
    swapped IMC 2008 and IMC 2009 (Continuity 8 and 9). The earliest known source wins. `references` starts with
    "Earliest known appearance (to the best of our knowledge):".
20. **Review fields**: `difficulty` and `review: human` are set by Antoine (or a board member), never by a tool;
    `history: ai` stays until a person has checked the history fields.

## When it enters the bank

21. **Duplicates**: compare it with the bank's problems first; a duplicate is merged or replaces the bank's version
    (as Telescoping 3 and 7 did with 0007 and 0026).
22. **Number and file**: `cd website-code && python3 -m bank.number --apply --no-git` turns `new-<title>.tex` into
    `NNNN-<title>.tex` (plain rename, no git command; without `--no-git` it runs `git mv`); the first comment line
    (rewritten by AI, scan pages) goes, and the header keeps its
    `% --- history: all optional, leave EMPTY if unknown ---` line.
23. **Shared results**: a result of the seminar's `appendix/` that the problem cites moves to `problem-bank/appendix/`
    under the same name; after Antoine's review, only its first comment line stays
    (`% Shared result, cited from solutions with \appendixref{<name>}.`).
24. **Full check, then commits**: `cd website-code && python3 build.py --preview && npm test` passes (only now, not
    during the rewrite rounds); then a commit series, made after Antoine's OK, never pushed by a tool.
