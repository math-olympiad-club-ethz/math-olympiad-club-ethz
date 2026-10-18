# Checklist for a .tex file

What to check before a problem, a solution or a shared result is done. `writing-style.md` says how the text is
written; this list covers the mechanical checks, the ones a tool or a careful read can settle.

## Done by the formatter

`website-code/bank/texformat.py` does these; VS Code runs it on every Cmd+S (`.vscode/settings.json`). By hand:
`python3 website-code/bank/texformat.py FILE --write` (in the seminar folder: `python3 indent.py FILE --write`).

1. **Indentation**: 4 spaces per nesting level (section 7, item 14, of `writing-style.md`).
2. **Line width**: every paragraph refilled within 100 characters; lines that stay alone are listed in the guide.
3. **Double spaces**: a single space between words inside a paragraph.

## In the text

4. **Delimiters**: every pair of brackets in mathematics sized with `\left ... \right`, even around one symbol. The
   seminar's `leftright.py FILE --write` does it; reversed intervals are sized by hand: `\left]0;1\right[`.
5. **Math mode**: no mathematics outside `\( \)` or `\[ \]`, not even a single letter (`\( S \)`, not `S`); inline
   formulas with a space inside the delimiters (`\( \mathbb{R} \)`, not `\(\mathbb{R}\)`); never `$` or `$$` (the
   validator rejects them; a dollar sign is `\$`). A number the mathematics talks about is mathematics too:
   "characteristic `\( 2 \)`", "of degree `\( 2 \)`", "between `\( 1 \)` and `\( 100 \)`", "tends to `\( 0 \)`",
   "`\( +\infty \)`" (never "+ infinity" or "plus infinity"), "a tuple of `\( 1 \)`s"; point names and expressions
   too (`\( ABC \)`, `\( AP+BP+CP \)`). Names and counts in words stay text: "Solution 2", "Day 1", "IMO 1988",
   "two solutions", and code (`random_uniform[0,1]`).
6. **Monotonicity**: "increasing" and "strictly increasing", "decreasing" and "strictly decreasing" (never
   "non-decreasing" or "non-increasing"); where a step needs the strict version, the text says "strictly"
   (writing-style rule 15).
7. **Intervals**: always French notation, with `;` as the separator: `\left]a;b\right[`, `\left[a;b\right[`,
   `\llbracket 1;n \rrbracket`; never `(a, b)`, `[a, b)` or `(a, b]`. Brackets turned outward are sized by hand
   (`leftright.py` skips them). A pair `\left(a, b\right)`, a commutator or a polynomial ring `R\left[X,Y\right]` is
   not an interval.
8. **Labels and structure**: `\textit{Solution k.}` is never indented. After an environment (a remark, a lemma),
   write `\noindent\textit{Solution k.}`; no `\\\\` line right after a display or an environment.
   - Every solution is numbered from 1: `\textit{Solution 1.}`, `\textit{Solution 2.}`; never "Alternative
     solutions", "Second solution" or "Another proof" (a fact shared by some solutions is introduced by a plain
     sentence: "Solutions 2 and 3 both use the following fact:").
   - A remark or a note is a `remark` environment, never a `\textit{Remark:}` or "Note:" label.
   - No `\section`, `\subsection` or other heading in a problem file: the solution of a bonus question is labelled
     `\textit{Solution of the bonus.}`, alone on its line and followed by a `\\\\` line; a file holding two
     problems states them as parts.
   - Parts are `\item[(a)]`, `\item[(b)]` in the statement and "(a)", "(b)" in the solution, never "a)" or "1)".
9. **Stray characters and doubled words**: no character typed by accident or left over (a `§` slipped into
   `6§f'(0)`: look at every non-ASCII character; an extra parenthesis, as in `\)))`) and no word written twice
   ("from which they come from"). Apostrophes and quotes are ASCII (`'`, ``` `` ``` and `''`, not `’` or
   `“ ”`); no em dash (`—`): rephrase with commas or parentheses.
10. **The statement asks something**: "Show that", "Find all", "Determine whether", a question. When the source has
   no question, take it from the origin (as for the IMC problems behind Continuity 2 and 9).

## Building

11. **Compilation**: the file compiles without error and without a line running into the margin (overfull box):
    the preview on save, or `cd website-code && python3 -m bank.validate --compile FILE`. A long inline formula that
    runs into the margin goes into a display.
12. **Validator**: for a file of `problems/` or `appendix/`, `cd website-code && python3 -m bank.validate` passes.

## Language and mathematics

13. **Spelling**: every word of the prose (formulas left out) is a dictionary word or a name; British or American
    spelling, the same within a file.
14. **Mathematics**: every step is checked (the math check of each rewrite round): no false claim, no missing case,
    every limit and every cited theorem with its reason, the hypotheses of a theorem checked where it is used.
15. **Links**: a niche name (a less common theorem, a named class of numbers) is linked where it is named, with
    `\href{...}{name}` (writing-style.md, "A niche name gets its link").
16. **Citations**: every `\appendixref{<name>}` points to an existing result (`problem-bank/appendix/`, or the
    seminar's `appendix/` while a rewrite is in progress) whose statement is exactly what the solution uses.

## The header

17. **Title**: it names the mathematics, as the bank's titles do, with no meta words; plain text (it is printed in
    the PDF headings).
18. **Origin**: checked against the official paper, never only against a comment: the seminar repository's comments
    swapped IMC 2008 and IMC 2009 (Continuity 8 and 9). The earliest known source wins. `references` starts with
    "Earliest known appearance (to the best of our knowledge):".
19. **Review fields**: `difficulty` and `review: human` are set by Antoine (or a board member), never by a tool;
    `history: ai` stays until a person has checked the history fields.

## When it enters the bank

20. **Duplicates**: compare it with the bank's problems first; a duplicate is merged or replaces the bank's version
    (as Telescoping 3 and 7 did with 0007 and 0026).
21. **Number and file**: `cd website-code && python3 -m bank.number --apply --no-git` turns `new-<title>.tex` into
    `NNNN-<title>.tex` (plain rename, no git command; without `--no-git` it runs `git mv`); the first comment line
    (rewritten by AI, scan pages) goes, and the header keeps its
    `% --- history: all optional, leave EMPTY if unknown ---` line.
22. **Shared results**: a result of the seminar's `appendix/` that the problem cites moves to `problem-bank/appendix/`
    under the same name; after Antoine's review, only its first comment line stays
    (`% Shared result, cited from solutions with \appendixref{<name>}.`).
23. **Full check, then commits**: `cd website-code && python3 build.py --preview && npm test` passes (only now, not
    during the rewrite rounds); then a commit series, made after Antoine's OK, never pushed by a tool.
