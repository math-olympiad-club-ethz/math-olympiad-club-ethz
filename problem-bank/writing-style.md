# How the solutions of the bank are written

This guide was derived on 2026-10-01 from the 24 fully solved problems of the bank (0001, 0003, 0004, 0005, 0006, 0010, 0013, 0015, 0016, 0017, 0018, 0022, 0024, 0026, 0028, 0029, 0032, 0036, 0042, 0043, 0047, 0048, 0054, 0058) and from the shared result `appendix/double-orthogonal-complement.tex`. Their solutions were written by Antoine, the club president. Problems without a solution (18), partial ones (`status: partial`, 10), 0033 (placeholder text) and the 27 further problems with an entry in `known-errors.md` were left out on purpose: they were works in progress. Follow this guide when you write a statement or a solution for the bank, by hand or with an AI. A rule marked (Antoine, date) comes from his corrections of AI rewrites, from 2026-10-08 on.

**Every rule here is a suggestion to take into account, not a rock-solid law,** except where it says "never" or "always". Before applying one, consider the other options and keep the one that reads best in the context of the problem. This holds for the counts below and for the rules marked (Antoine, date).

How to read the numbers. "12 in 5" means 12 occurrences in 5 of the 25 bodies (the 24 solutions and the shared result). Words are counted with the mathematics removed. Statement counts are over the 24 statements. Every quotation is copied from these files. The number in parentheses is the problem it comes from; "app" is the shared result.

## The rules in brief

One line per rule; each is explained, with its examples, in the section given or in the sections below.

1. Write "we" (103 times in 21 of 25 bodies). Never "I" (0).
2. Start with the first mathematical step. No solution copies its statement (0 of 24).
3. Write one continuous text: no `\section`, no "Answer:", no "Claim:", no lemma environment (0 each in the 24 solutions). 19 of the 24 solutions have no label at all.
4. Separate blocks with a line that holds only `\\\\` (35 such lines in 17 bodies), never right after a display or an environment (section 2, "Paragraphs").
5. Justify each step where it is used: "since" (37 in 13), "because" (9 in 7), a parenthesis, or a named result ("By Rolle's theorem").
6. Put displays in `\[ ... \]`, each delimiter on its own line, and punctuate them as part of their sentence (section 7, "Punctuation inside displays").
7. Link the steps with "Thus,", "Hence,", "Therefore," and "Since ..., we have".
8. End with one sentence that gives the answer or the claim in words, or with the target formula in a display (22 of 24 solutions).
9. In a statement, set up the objects with "Let" (12 of 24), ask with "Prove that", "Show that" or "Find all", and display the key formula.
10. Be precise with structures: neutral elements carry their structure (`0_K`, `1_R`), dimensions carry their field (`\dim_{\mathbb{R}}`), intervals use French brackets with `;` (`\left]0;1\right[`; section 6).
11. Write every label of a solution in `\textit`, never in `\textbf`, and number the solutions when there are several: `\textit{Solution 1.}`, `\textit{Solution 2.}` (section 2, "Headings and labels" and "Several solutions").
12. Size every pair of delimiters in mathematics with `\left ... \right`, even around one symbol (always; Antoine, 2026-10-10; section 7, "Delimiter sizing").
13. Keep the source readable: 4 spaces per nesting level and every line within 100 characters; run `website-code/bank/texformat.py` on every file you write, as Cmd+S does in VS Code (always; Antoine, 2026-10-12; section 7, "Source layout").
14. Write inline mathematics as `\( ... \)`, with a space inside the delimiters, and displays as `\[ ... \]`: never `$ ... $` or `$$ ... $$` (always; Antoine, 2026-10-17; section 7, "Inline math").
15. Monotonicity has four words: "increasing", "strictly increasing", "decreasing" and "strictly decreasing"; never "non-decreasing" or "non-increasing" (always; Antoine, 2026-10-18; section 8, "Monotonicity").

## 1. Tone and voice

- **Person.** First person plural: "we" or "We" 103 times in 21 of 25 bodies. The 4 bodies without it are 0001 (a single sentence), 0010, 0043 and 0058. "I", "my" and "me": 0. The impersonal "one" is rare (8 in 4): `One has $P(X)=XQ(X)$` (0022), "one easily adapts the above proof" (0047).
- **Set-up steps are imperatives.**
  - `Plug in $y=-x$, and let $c=f(0)$.` (0006)
  - `Define the matrix \( A := \sum_{M \in G} M \in \mathbb{R}^{n \times n} \).` (0042)
  - "Take the probability space:" (0036); `Fix \(\tilde{x}\in G\).` (0036)
  - `Denote by \( S \) the \( \mathbb{R} \)-linear space of all real \( n \times n \) symmetric matrices;` (0029)
  - "Consider the polynomial" (0022)
  - "Let us" occurs 4 times in 3 bodies: "Let us introduce the function" (0015), "Let us prove that" (0017), `Let us compute \(|C|\):` (0036).
- **Register.** Formal and terse. The median sentence has about 9 words of prose (math not counted, 297 sentences). Sentences often open with a connective: "Since" 18, "Thus" 16, "Therefore" 14, "Then" 12, "Hence" 11 times at the start of a sentence.
- **Justify at the point of use, inside the sentence.**
  - "since" or "Since": 37 in 13. "because": 9 in 7. "as": `as $\mathbb{F}_{2}$ is a domain` (0005).
  - A parenthesis: `(as \( a_n \in \{0, 1\} \))` (0005), `(recall $n\geq 2$)` (0022), `(by the finiteness of \(G\))` (0036), `(since \( B \) is \( K \)-bilinear)` (app), "(which preserve determinants)" (0024).
  - A "where" clause after a display: `where the last equality follows from the fact $\lim_{\lambda\to +\infty}\ln f(\lambda)=+\infty$.` (0013)
- **Every limit gets its reason, even a standard one.** Consider justifying each limit where it is used, in one line, so that nothing is left to the reader's head: an elementary rewriting ("as \( \log\left(1+\frac{1}{n}\right) \to 0 \) and \( \log\left(n\right) \to +\infty \), \( \frac{\log\left(n+1\right)}{\log\left(n\right)} = 1+\frac{\log\left(1+\frac{1}{n}\right)}{\log\left(n\right)} \to 1 \)"), a theorem with its hypotheses ("the functions \( x \mapsto \log\left(x\right) \) and \( x \mapsto x \) are differentiable on \( \left]1;+\infty\right[ \), both tend to \( +\infty \) at \( +\infty \), the derivative of the second one is \( 1 \neq 0 \), and the quotient of their derivatives is \( \frac{1}{x} \to 0 \), so that, by L'Hôpital's theorem, \( \frac{\log\left(x\right)}{x} \to 0 \)"), or a derivative at a point ("as \( \log \) is differentiable at \( 1 \) with derivative \( 1 \), \( \frac{\log\left(1+t\right)}{t} = \frac{\log\left(1+t\right)-\log\left(1\right)}{t} \to 1 \)"). Before the squeeze theorem, write the limits of the bounds too: "Now, we know that \( \frac{a_\delta\left(n\right)-a_\delta\left(n-1\right)}{\delta\,n\,\log\left(1-\frac{1}{n}\right)} \to \frac{0}{\delta\,\log\left(e^{-1}\right)} = 0 \), so that, by the squeeze theorem, ...". (Antoine, 2026-10-11) When a limit is taken on both sides of an identity and the expression is not a standard one, say what converges, that it stays in the domain, and why the expression is continuous there (a denominator that stays away from 0): `(since \( 0<\frac{n+1}{n} \to 1 \), \( 0<n a_n \to L \) and \( \left(t, x\right) \mapsto \frac{t x^2}{1 + t x} \) is continuous on \( \mathbb{R}_{>0} \times \mathbb{R}_{\geq 0} \) (its denominator is at least \( 1 \)))`. For a standard continuous expression, "by continuity of exp" is enough. (Antoine, 2026-10-08)
- **Recall the standard facts, do not prove them.** The standard properties of the notions a proof uses are recalled, not proved (the limits of specific expressions still get their reason, see the previous rule). In a shared result, consider recalling them before the theorem, in prose and without labels such as "(F1)": "recall the limit inferior and the limit superior [display], which are both in \( \left[-\infty;+\infty\right] \). Recall also that \( \liminf_{n \to +\infty} x_n \leq \limsup_{n \to +\infty} x_n \) and \( \limsup_{n \to +\infty} \left(-x_n\right) = -\liminf_{n \to +\infty} x_n \), and that, for \( L \in \left[-\infty;+\infty\right] \), we have \( x_n \to L \) if and only if \( \liminf_{n \to +\infty} x_n = \limsup_{n \to +\infty} x_n = L \)"; a classical fact may be introduced by "it is standard that" ("it is standard that \( \lim_{n \to +\infty} b_n \) exists in \( \left[-\infty;+\infty\right] \) (it is \( \sup \operatorname{ran}\left(b\right) \) if \( b \) is increasing, ...)"). The proof then cites them without restating them: "(recalled above)", "From the properties of the limit superior and the limit inferior recalled above, ...", "using the properties of the limit superior". (Antoine, 2026-10-11)
- **Two names, one notion.** When a notion has two usual names, give both once, "the Darboux property, or intermediate value property", and do not prove an equivalence that is only a matter of wording. (Antoine, 2026-10-17)
- **Signs where they matter.** When an inequality is inverted (reciprocals) or an expression must stay in a domain, consider writing the sign in the formula itself: `\( 0<n\sqrt{n+1} \leq \sqrt{n}\left(n+1\right) \)`. (Antoine, 2026-10-08) To invert \( x \leq y \), the sign of the smaller side is what matters, so write \( 0 < x \leq y \): "\( 0 < \frac{a_{n-2}}{2^{n-2}} \leq L \)" gives \( \frac{2^{n-2}}{a_{n-2}} \geq \frac{1}{L} \), while "\( L \geq 1 \)" alone does not. To multiply an inequality, give the sign of the factor: "which is equivalent to (since \( a_\delta\left(n\right)-a_\delta\left(n-1\right) > 0 \))". Name the step: "by inverting the inequalities", "summing these inequalities". (Antoine, 2026-10-10 and 2026-10-11)
- **The same order on both sides.** In an inequality between two products, consider writing the factors in the same order on both sides, so that the comparison is visible at once: \( \log\left(1-\frac{1}{n}\right)\,S_\delta\left(n-1\right) \leq \log\left(1-\frac{1}{n}\right)\,n\,a_\delta\left(0\right) \). (Antoine, 2026-10-11)
- **Named results are cited by name, in the sentence that uses them.** 18 citations in 12 bodies, and no `\cite`:
  - "By Bezout's Lemma," (0001); "By Rolle's theorem" (0015, 0017); "by Lagrange's theorem" (0036)
  - "The mean value theorem applied on the non empty interval yields" (0010)
  - "Now we apply L'Hôpital's theorem and obtain" (0013)
  - `Using Vieta’s formulas for this coefficient $a_k$, we obtain:` (0022)
  - "By the Cayley–Hamilton theorem" (0054); "by the rank–nullity theorem" (app); "the orbit–stabiliser theorem gives:" (0036)
  - "theorem" is lowercase in 10 of its 11 occurrences after a name. The exception is "The Chinese Remainder Theorem" (0054).
- **A niche name gets its link.** When a solution names a notion or a result that a reader may not know (a less common theorem, a named class of numbers, a named game), link it where it is named: `These are called \href{https://en.wikipedia.org/wiki/Pisot%E2%80%93Vijayaraghavan_number}{Pisot–Vijayaraghavan numbers}.` (0053), `\href{https://en.wikipedia.org/wiki/Dense_order}{dense order}` (0047). Standard names (the mean value theorem, Bezout's lemma) need no link. (Antoine, 2026-10-18)
- **A classical fact that needs its own proof becomes a shared result**, cited in one sentence: `For a proof of this classical fact, see the Appendix [\appendixref{double-orthogonal-complement}].` (0018) A classical theorem that several problems use (the Stolz–Cesàro theorem) becomes a shared result too, stated in its most general usual form (for Stolz–Cesàro: both cases, the infinite limit and 0/0, with the limit inferior and the limit superior) and proved in full; a solution cites it in the sentence that applies it: "the Stolz–Cesàro theorem [\appendixref{stolz-cesaro-theorem}] applies to ..., which means that it is sufficient to show that ...". (Antoine, 2026-10-10) A shared result, a file of `appendix/`, has a setting paragraph (`Let \( E \) be a vector space over a field \( K \)`), definitions with `:=`, then `\begin{theorem}[Double Orthogonal Complement]` and `\begin{proof}` (the only theorem and proof environments of the bank of 2026-10-01).
- **The hypotheses of a cited theorem are checked where it is used.** When a solution applies a theorem (a shared result or a classical one), consider saying at that point why each of its hypotheses holds, and naming the objects it is applied to: "As \( \log|_{\mathbb{N}_{\geq 2}} \) is strictly increasing, \( 0 \notin \operatorname{ran}\left(\log|_{\mathbb{N}_{\geq 2}}\right) \) and \( \log\left(n\right) \overset{n \to +\infty}{\longrightarrow} +\infty \), the Stolz–Cesàro theorem [\appendixref{stolz-cesaro-theorem}] applies to \( \left\langle a_\delta\left(n\right)^2 \,\middle|\, n \in \mathbb{N}_{\geq 2} \right\rangle \) and \( \log|_{\mathbb{N}_{\geq 2}} \)". (Antoine, 2026-10-10)
- **The elementary computation first.** When a finite computation suffices (an exact telescoping sum), consider it before a heavier tool (power series, a theorem on infinite series): \( \sum_{k=3}^{n} \frac{k-2}{2^k} = \sum_{k=3}^{n} \left(\frac{k-1}{2^{k-1}}-\frac{k}{2^k}\right) = \frac{1}{2}-\frac{n}{2^n} \). (Antoine, 2026-10-10)
- **Routine checks are stated, not written out.** A routine step may name its method in a few words: "we easily have (also by induction)", "we also easily get by induction" (Antoine, 2026-10-10), "where the first equality follows by induction" (Antoine, 2026-10-11). This holds for routine inductions and identities; bounds and limits are written out (see "Nothing done in the head" and "Every limit gets its reason, even a standard one"). Examples: "It is easy to check that the solutions mentioned above work." (0006), "By a trivial induction" (0024); the words for it are in section 8.
- **Nothing done in the head.** Consider writing each bound as its chain rather than stating its result, so that no step has to be done mentally: "\( \frac{a_\delta\left(n-1\right)}{a_\delta\left(n\right)} = 1-\frac{a_\delta\left(n\right)-a_\delta\left(n-1\right)}{a_\delta\left(n\right)} \), where \( 0 < \frac{a_\delta\left(n\right)-a_\delta\left(n-1\right)}{a_\delta\left(n\right)} \leq \frac{1}{n\,a_\delta\left(0\right)\,a_\delta\left(n\right)} \leq \frac{1}{n\,a_\delta\left(0\right)^2} \), so that \( 1-\frac{1}{n\,a_\delta\left(0\right)^2} \leq \frac{a_\delta\left(n-1\right)}{a_\delta\left(n\right)} < 1 \)", rather than the last inequality alone. (Antoine, 2026-10-11) Likewise, write the equality that a chain of inequalities gives before using it: "\( \frac{1}{2} \leq \int_0^1 f\left(x\right) \,\mathrm{d}x \leq \left|\int_0^1 f\left(x\right) \,\mathrm{d}x\right| \leq \frac{1}{2} \), so that \( \int_0^1 f\left(x\right) \,\mathrm{d}x = \frac{1}{2} \), and hence ..." (Antoine, 2026-10-19; Mean value theorem 2) Also, rather than "the same computation as above gives" or "(standard)", consider writing the short chain itself: \( 0 \leq L^2-L-\frac{1}{2} = \left(L-\frac{1+\sqrt{3}}{2}\right)\left(L-\frac{1-\sqrt{3}}{2}\right) \) rather than "has roots ..., is monic (standard)". (Antoine, 2026-10-10)
- **Reuse what was shown: "(seen above)".** When a fact was already proved, consider citing it with "(seen above)" instead of proving it again, and still give the reason for each new step: "as \( S_\delta\left(n-1\right) \geq n\,a_\delta\left(0\right) > 0 \) for all \( n \in \mathbb{N}_{\geq 3} \) (seen above), it does not take the value \( 0 \) and converges to \( +\infty \)". A paragraph that restates known facts at length can be compacted this way. (Antoine, 2026-10-10 and 2026-10-11)
- **The form the next step uses.** Consider ending a computation in the form the next sentence uses, so that the reader sees the match: \( \frac{1}{L}\left(\sum_{k=0}^{n-1} \frac{1}{k+1}\right) = \frac{1}{L}\left(\sum_{k=1}^{n} \frac{1}{k}\right) \), just before "as \( \sup\left\{ \sum_{k=1}^{N} \frac{1}{k} \,\middle|\, N \in \mathbb{N}_{\geq 1} \right\} = +\infty \)". (Antoine, 2026-10-11)
- **Facts a reader could stumble on are spelled out.** `Since \( + \) is commutative, we have:` (0042); `because we are working over \( \mathbb{F}_2 \).` (0018); why two polynomial functions have the same coefficients: "This is an equality of polynomial functions over \( \mathbb{R} \), so the natural polynomial from which they come must be the same (because \( \mathbb{R} \) has infinitely many elements). Therefore, the coefficients must be the same" (Continuity 2; Antoine, 2026-10-17). Constructions are checked in full: 0032 verifies both the right and the left inverse, 0028 checks that its example satisfies the inequality and both boundary limits, 0036 counts the 40 commuting pairs of the quaternion group.
- **A definition is shown to make sense before it is made.** Before defining a map by a formula, show that the formula makes sense (a non-zero denominator, a positive argument of a logarithm), then say so: "is well defined", "the (therefore well-defined) functions". (Antoine, 2026-10-08)
- **Every formula carries its quantifier.** A formula with a free variable says in words where that variable lives: "for all \( n \in \mathbb{N}_{\geq 3} \), we have", also in front of a list of definitions. (Antoine, 2026-10-08) In a part of a proof about one \( n \), consider "Fix \( n \in \mathbb{N}_{\geq 3} \)" at its start rather than a quantifier in every formula. Keep long expressions written out: do not name them with a new letter (`N := ...`) that the author did not use. (Antoine, 2026-10-09)
- **The scope of an argument is stated.** `This equation is valid for any finite group \(G\).` (0036, one of 3 such sentences there). 0032 proves its claim in "any (possibly non-commutative) unital ring" and specialises it in its last line: "Apply this result to the non-commutative unital ring". 0054 says "In fact, we prove that for any two polynomials". 0047 ends with a remark that generalises the proof.
- **A few lively words, sparingly** (6 in 5 bodies): "the amazing idea of treating the numbers 4, 5, 6 as variables" (0017), "the very useful-to-know" (0022), "The key insight is to recognize that" (0024), "we define boldly" (0024), "But we can do better:" (0036), "(crucially finite)" (app). One question is put to the reader: "Are there other solutions? The answer is no" (0017).

## 2. Structure of a solution

### Openings

Start with the first move. No solution copies its statement (0 of 24). The 24 openings are of five kinds:

- **Announce the goal or the method** (5: 0003, 0004, 0005, 0024, 0032): `We begin by analyzing the properties of the coefficients \( a_n \).` (0005); `We prove the result by induction on $k$.` (0004); `We show that starting from \( A = \begin{bmatrix} 2 & 2 \\ 3 & 4 \end{bmatrix} \), Ivan cannot reach the matrix` ... (0024).
- **Introduce the main object** (5: 0013, 0018, 0026, 0036, 0042): `Define the standard binary product on the finite dimensional $\mathbb{F}_{2}$-vector space \( \mathbb{F}_2^n \), i.e.,` (0018); "Take the probability space:" (0036); "The characteristic polynomial of the linear recurrence is:" (0026).
- **Clear the easy part first** (6: 0010, 0015, 0017, 0022, 0029, 0047). The obvious solutions: `It is easy to see that \( x = 0 \), \( x = 1 \), and \( x = 2 \) are solutions.` (0015). The degenerate case: `If $x$ is such that $f'(x) = 0$, then the relation holds with equality.` (0010); `If $n=1$, then trivially the only such polynomial is $X$.` (0022). Existence: `For \( \left\{ \mathbf{0}_{n \times n} \right\} \), we have` (0029).
- **Compute at once** (4: 0001, 0006, 0016, 0028): "First note that:" (0016); "From the inequality, we obtain:" (0028).
- **Other formats** (4: 0043, 0048, 0054, 0058); see section 11.

In a find-all problem, show the obvious solutions, then say that there are no others: "We claim there are no other roots." (0015); "Are there other solutions? The answer is no, but to prove it we use" (0017).

### Paragraphs

- **The paragraph separator is a line holding only `\\\\`** (35 lines in 17 of 25 bodies), **never right after a display**: `\[ ... \]` already leaves enough space, and a `\\\\` line after it adds an empty line, so the next block starts directly on the line after `\]` (Antoine, 2026-10-09). Nor right after an environment, where it does not compile (see "Several solutions"). A blank line separates paragraphs of prose only in 0003 (2) and 0054 (4); the other 8 blank lines sit between list items or environments. The formatter lays out the source lines of a paragraph (section 7, "Source layout").
- A single `\\` line break in prose is rare (3: twice in 0017, once in 0058).
- **Computation first, consequence after.** Finish a computation in its own chain, including the last simplification. The step that draws a consequence from it (a bound for every N, then a limit) starts from the result in a new sentence and doesn't write the same expression again. A trivial last comparison may close the chain itself (`= 2 - \frac{2}{\sqrt{N+1}} \leq 2`). (Antoine, 2026-10-08)

### Headings and labels

- No `\section`, `\subsection` or `\paragraph` (0). No "Answer:", "Claim:" or "Case 1" label (0).
- 19 of 24 solutions have no label. The 5 exceptions: `\item \textit{Coefficient of \( X^{4n} \):}` (0005), `\item \textit{Understanding \(\langle n \rangle\):}` (0043), `\textit{Step 1.}` (0054), `\textit{Remark:}` (0047), `\textit{Solution 2.}` (0048). The shared result uses `\textit{Examples:}`, `\textit{1.}` and `\textit{2.}`.
- Labels are always in `\textit`, never in `\textbf`. Most solutions already used `\textit` (0027, 0030, 0041, 0047); the `\textbf` labels (0005, 0043, 0054, the shared result and a few others) were turned into `\textit` on 2026-10-02, in every problem and shared result. This concerns solutions only: a label inside a statement (`\textbf{Bonus:}`) stays as it is.
- **Remarks always go in the remark environment** of the preamble, `\begin{remark} ... \end{remark}`, never in a `\textit{Remark:}` label. (Antoine, 2026-10-09)
- **Parts of a long proof.** Step headings are not part of the style. But when a long proof, or its end, would be confusing without them, consider a sentence that announces the plan ("The rest of the exercise is to show that ..., and then to show that ...") and a `\textit` label for each part (`\textit{If \( n \geq 2 \), then \( r_n \in \llbracket 0;n-1 \rrbracket \) and \( 2^{\left(2^{r_n}\right)}+1 \) is a factor.}`). (Antoine, 2026-10-09)
- **Parts.** A multi-part problem labels its parts "(a)", "(b)": as paragraphs (6 statements, among them 0004 and 0048) or as `\item[(a)]`, `\item[(b)]` in an enumerate (5 statements, and the solution of 0004); the solution follows the parts with "(a)" and "(b)" (0048). Never "a)" or "1)" (checklist pass, 2026-10-17).

### Several solutions

- Number every solution, the first one too: `\textit{Solution 1.}`, `\textit{Solution 2.}`, ... Never "Second solution", "Alternate solution" or "Alternative proof". A short name may follow the number: `\textit{Solution 1. of $A=I_n$}` (0030).
- The label stands alone on its line and a `\\\\` line follows it; the solution starts on the next line. If the solution opens with an environment, the `\\\\` line is left out (`\textit{Solution 2.}` directly followed by `\begin{lemma}`, 0041).
- Between two solutions, the `\\\\` line comes directly under the last line of text, never after an empty line: a `\\\\` after an empty line does not compile ("There's no line here to end"). After a display `\]` there is no `\\\\` line: the label follows the display directly (0027). After an environment (a remark, a lemma, ...), the label would start an indented paragraph: write `\noindent\textit{Solution 2.}` there, with no `\\\\` line between `\end{remark}` and the label (a `\\\\` line right after an environment does not compile either). (Antoine, 2026-10-17)
- A setting shared by all the solutions comes first, without a label, and `\textit{Solution 1.}` follows it (0046).
- In a multi-part problem every part numbers its own solutions: "(a)" alone on its line, then `\textit{Solution 1.}` (0048).
- **A solution of your own, as an LLM.** The author's solution comes first and stays. Consider adding a solution of your own only when it is genuinely and clearly shorter or simpler than the author's, and check that claim honestly once both are written with the same care: in Telescoping 12, a route announced as "the shortest" turned out about as long as the author's once every bound and limit was justified. It comes as a second solution, not as a correction of a solution that works. Write it in the voice of the author's solution: the same moves and the same words in the same order ("We want to show that ...", "Now, it suffices to show that the two terms ... have as limit \( 2 \) and \( 1 \) respectively, as \( n \to +\infty \).", "Lastly, for the first term, ...", "Therefore, by the two reductions above, ..."), so that the two can be compared line by line. Say in a `%` comment above its label that it is not in the author's notes: `% Solution 2 is not in the notebook: written by AI on 2026-10-10 at Antoine's request; he chose to keep both solutions.` (Antoine, 2026-10-11)

```latex
\begin{solution}
\textit{Solution 1.}
\\\\
Since \( A \equiv I_n \pmod{m} \), there exists ...
... Thus, \( A = I_n \).
\\\\
\textit{Solution 2.}
\\\\
Let \( \alpha \) be an eigenvalue of \( A \). ...
\[
\ldots
\]
\textit{Solution 3.}
\\\\
...
\end{solution}
```

### Cases

- Cases are parallel paragraphs that start with "If", are worded almost identically and are separated by `\\\\` lines (0010, 0017). A short line closes them: "In all cases:" (0010), "Both cases are a contradiction." (0003). 0003 writes them as dash items: `- If $|z| > 1$, then $1 - |z|^2 < 0$, so $N < D$ and hence $|z^9| < 1$.`
- "If" starts a sentence 11 times in 6 bodies.
- Settle the degenerate case first and open the rest with "Else" (3: 0006, 0010, 0022) or "Otherwise" (1: 0047): `Else $f'(x)\neq 0$ and then the following set has non empty interior:` (0010).
- A two-way split can stay inside one sentence: `Then either \(\tilde{x}\) commutes with all elements` ... "or it does not" (0036).
- **Degenerate cases covered by a convention.** When a formula also covers a degenerate case through a convention, consider saying so: "(for \( n = 0 \) this works: recall that the empty product is \( 1 \))" (Antoine, 2026-10-09), "(and it is true even for \( n = 0 \): recall that the empty sum is \( 0 \))" (Antoine, 2026-10-11).
- No `cases` environment and no case headings in the solutions (0).

### Lemmas and sub-claims

- No lemma, claim or proof environment in the 24 solutions (0). A sub-claim is announced in one sentence and proved in the flow:
  - "We claim there are no other roots. By Rolle's theorem," (0015)
  - "We claim that the element" (0032)
  - `We show that such $f$ must be unbounded on $[0,1] \cap \mathbb{Q}$. Indeed, if this is not the case, then` (0047)
  - "We argue that the tail" (0016); "Let us prove that" (0017)
- **Inductions in prose.** Consider naming the two parts of an induction in the prose, without labels: "For the base case \( n = 1 \), ...", "Now, for the induction step, let \( n \in \mathbb{N}_{\geq 1} \) with ...". The base case checks exactly the claim at its first value ("\( 2a_1 = 4 \leq 4 = a_2 \)" for the claim \( 2a_n \leq a_{n+1} \)), and the induction hypothesis is the claim itself (\( \leq \), not \( < \)). (Antoine, 2026-10-10)
- **Announce the useful form of a claim.** When a claim will be used later in an equivalent form, consider stating that form where the claim is announced: "We prove by induction that \( 2a_n \leq a_{n+1} \) (equivalently \( \frac{a_n}{2^n} \leq \frac{a_{n+1}}{2^{n+1}} \), i.e., \( \left\langle \frac{a_n}{2^n} \,\middle|\, n \in \mathbb{N}_{\geq 1} \right\rangle \) is increasing) for all \( n \in \mathbb{N}_{\geq 1} \)." (Antoine, 2026-10-10)
- **Look for the shortest argument.** When a second result follows from the computation of the first (the same identity with the inequality reversed), consider reusing that computation, with the identity numbered, rather than building new machinery: in Telescoping 11 the lower bound \( L \geq 1+\frac{1}{2L} \) reuses the identity of the upper bound with \( \frac{1}{L} \leq \frac{2^{n-2}}{a_{n-2}} \leq 1 \). (Antoine, 2026-10-10) Keep only the side of an estimate that the proof uses: from the continuity of \( f \) at \( a \), Continuity 5 needs only \( f\left(x\right) > f\left(a\right)-\frac{f\left(a\right)-f\left(b\right)}{2} = \frac{f\left(a\right)+f\left(b\right)}{2} > f\left(b\right) \), not the whole interval around \( f\left(a\right) \). (Antoine, 2026-10-17)
- **Reductions from the goal; the claim before its tools.** Consider writing a proof as a chain of reductions that starts from the goal: "We want to show that \( \left\langle \frac{a_\delta\left(n\right)^2}{\log\left(n\right)} \,\middle|\, n \in \mathbb{N}_{\geq 2} \right\rangle \) converges to \( 2 \).", then why a tool applies, then "which means that it is sufficient to show that ...". Do the computation at a fixed index ("Fix \( n \in \mathbb{N}_{\geq 3} \). Then ..."), prove each remaining fact where it is first needed, and close by pointing back: "Therefore, by the two reductions above, ... converges to \( 2 \)." Avoid building the tools first (bounds, auxiliary limits) and showing only at the end why they were needed: the reader then cannot see where the proof is going. (Antoine, 2026-10-11) Example (Darboux's theorem, a shared result): "We show that \( f'\left[J\right] \) is an interval. By the characterisation of the intervals recalled above, this is equivalent to showing that \( \left[u;v\right] \subset f'\left[J\right] \) for all \( u, v \in f'\left[J\right] \). If \( u > v \), then ..., so that it is sufficient to treat the case \( u < v \). Clearly, it is sufficient to show that ... It is then sufficient to show the stronger statement that ..." (Antoine, 2026-10-17) When a solution proves several claims, consider opening each part with its claim, then defining the objects the part uses: "We show that there exists a unique \( \alpha \in \left[0;1\right] \) such that \( f\left(\alpha\right) = \alpha \). Define \( g := f-\mathrm{Id}_{\left[0;1\right]} \), which is continuous on ...", then "We now show that there exists a unique \( \beta \) ... Define \( h := ... \)", rather than defining \( g \) first and saying only afterwards what it is for. (Antoine, 2026-10-19; Mean value theorem 1)
- **The idea, then the formal proof.** When the idea of an argument fits in a sentence or two, consider stating it first, in words: "The idea is that, as \( f \) is continuous on the compact interval \( \left[x_0;b\right] \), it attains its maximum on this interval at a point other than \( b \), which is therefore a shadow point; a point where \( f \) is bigger than this maximum can only lie further than \( b \), so that \( b \) is a shadow point, which is a contradiction." Then write the formal proof so that it follows the idea step by step, in the same order and with the same words, one sentence per step (the maximum is attained at \( x_1 \); \( x_1 \neq b \), so \( x_1 \) is a shadow point; there is a \( y_1 \) with \( f\left(y_1\right) > M \); \( y_1 \) cannot lie in \( \left[x_0;b\right] \), so \( y_1 > b \); hence \( b \) is a shadow point). A justification longer than a few words gets its own sentence, not a long parenthesis inside the step. The formal part may be announced: "At this point, we could say that we have proved (a), but, as an exercise, we write what we just said more formally." (Antoine, 2026-10-17; Continuity 5)
- **Easy parts and symmetries first.** When a statement has several parts, consider disposing first, in one sentence, of what follows from facts already recalled ("From the properties of the limit superior and the limit inferior recalled above, the middle inequality and the last statement of the theorem follow."), then reducing by symmetry, saying why the hypotheses are kept: "Moreover, the first inequality is the last inequality applied to \( \left(-a, b\right) \). Indeed, this pair satisfies the same hypotheses as \( \left(a, b\right) \), ...", then stating what remains: "Hence, it is sufficient to show the last inequality of the chain". An obvious identity behind a symmetry may be called clear, while the hypotheses it keeps are still listed: "It is clear that replacing \( \left(a, b\right) \) by \( \left(-a, -b\right) \) changes neither the quotients nor the difference quotients, and that it keeps the hypotheses: ...". (Antoine, 2026-10-11) A symmetry may also exchange the roles of two points: "It is clear that replacing \( \left(f, y, a, b\right) \) by \( \left(-f, -y, b, a\right) \) keeps the hypotheses (...) and the conclusion (...). Hence, making this replacement if \( a > b \), we may assume that \( a < b \)" (Darboux's theorem; Antoine, 2026-10-17)
- **The pieces of a limit and their targets.** When an expression is split into several terms, consider saying first what each one tends to, then treating them in turn: "Now, it suffices to show that the three terms \( ... \), \( ... \), and \( ... \) have as limit \( 1 \), \( 1 \), and \( 0 \) respectively, as \( n \to +\infty \). For the first term, ... For the third term, ...". Treat the easy terms first; the term that needs a new reduction (a second use of a theorem) comes last, in its own paragraph: "Lastly, for the second term, ...". Inside such a part, "For the first one" and "For the second one" keep its own pieces apart from the outer terms. (Antoine, 2026-10-11)
- **Every claim of the statement gets its sentence.** Consider proving each part of the statement explicitly in the solution, even a short one, so that no part is left to the reader: "Notice that \(a_n>0\) for all \( n \in \mathbb{N}_{\geq 1} \), so that \( a_{2^n} \neq 0 \) for all \( n \in \mathbb{N} \)." (Antoine, 2026-10-08)

### Extras and length

- Extras come at the end: the sharpness part ("Equality is achieved when:" 0028; "This bound is tight:" 0029; "To show that the bound is tight, consider the non-commutative quaternion group" 0036) and remarks (in the remark environment, see "Headings and labels"). In 0028, 0036 and 0047 they open a new block after a `\\\\` line.
- **Side details in footnotes.** A detail that a reader can skip (a definition spelled out in full, the justification of a standard fact) may go in a footnote, `\footnote{...}`, as in 15 of the bank's problems; the formatter refills its text. Example: the open-set definition of a limit and its sequential characterisation, in the footnote of Darboux's theorem. (Antoine, 2026-10-17)
- Solutions have 17 to 343 words of prose (median 90.5) and 0 to 19 displays (median 4). The shared result has 313 words and 15 displays.

## 3. Linking the steps

| Phrase | Count | Use | Example |
|---|---|---|---|
| since, Since | 37 in 13 | justification, before or inside a sentence | `Since \( N \in G \) was arbitrary, we have in particular` (0042) |
| which | 30 in 15 | goes on after a formula | `which is impossible since the left-hand side is strictly positive (as $k<n$).` (0022) |
| we have | 30 in 16 | leads into a display | "Hence, we have" (0016); `Plugging in $y=0$, we have $f(x)^2 = \frac{c^2}{2} + c$.` (0006) |
| so, So | 28 in 14 | short consequence | `so the GCD of the numerator and denominator is $1$` (0001) |
| Thus, thus | 20 in 14 | consequence; "Thus," in 13 of the 16 capitalised uses | `Thus, the general form of $F(n)$ is given by:` (0026) |
| Hence, hence | 18 in 13 | consequence; "Hence," in 8 of the 11 capitalised uses | `Hence, there must exist some $k \geq 1$ such that $F^k = 0$.` (0004) |
| Therefore | 15 in 11 | end of a step; "Therefore," 10 times, "Therefore:" before a display 2 times | `Therefore, \( a_0 = 0 \), and one of the roots of \( P(X) \)` (0022) |
| then, Then | 40 in 15 | "If ..., then"; "Then" opens the next step | `Then $j = f(a) = f(b) = f(c)$, a contradiction to our assumptions on $f$.` (0047) |
| we obtain | 13 in 8 | after a manipulation | "Dividing the second equation by the first, we obtain" (0022) |
| where | 13 in 10 | definition or justification after a display | `where we used that there are $p-(i+1)$ factors in $\frac{(p-1)!}{i!}$` (0016) |
| Now, now | 11 in 11 | opens a new step | `Now, if \( A \) is a symmetric matrix, then:` (0029) |
| In particular | 10 in 5 | a special case of what was just shown | `In particular, \( \mathrm{ran}\left( N \cdot \_ \right) = G \).` (0042) |
| because | 9 in 7 | justification | `because the second derivative is positive, $f'$ is increasing;` (0010) |
| i.e. | 8 in 7 | restatement; "e.g." and "resp.": 0 | `Assume that the formula holds for some $k \geq 1$, i.e.,` (0004) |
| Note that, Notice | 7 in 5 | a remark the next step needs | `Note that \( P(X) \) does not have any positive root because \( P(x) > 0 \) for every \( x > 0 \).` (0022) |
| again | 5 in 5 | the same tool once more | `has at least \( 2 \) zeros, which again implies that` (0015) |
| Else, Otherwise | 4 in 4 | the remaining case | `Else we have $f(x) = \pm 2$ for all $x$.` (0006) |
| However | 3 in 3 | a turn in the argument | `However, if $F^k \neq 0$ for all $k$, then` (0004) |
| Indeed | 3 in 3 | proves the previous sentence | `Indeed, since \( \dim\left(E\right) = \dim\left(E^{*}\right) \), injectivity of \( \varphi_E \) implies its surjectivity.` (app) |
| In total, Summarizing | 3 in 2 | gathers the facts | "In total:" (0022); "Summarizing, the only possible polynomials" (0022) |

- **Participles open a step:** "Using" (5), "Taking" (2), "Plugging in" (2), and once each "Multiplying", "Dividing", "Rearranging", "Applying", "Solving", "Combining". Examples: "Taking the modulus on both sides, we examine the numerator and denominator separately:" (0003); `Multiplying the given equation \( \alpha(X)^3 + X \alpha(X) + 1 = 0 \) by \( \alpha(X) \), we obtain:` (0005); "Rearranging, we find" (0022).
- **Before a display**, the clause ends with a colon (68 of 130 displays) or runs straight into it (41), as in "we have", "we obtain", "defined by", "implies that", "such that". 13 displays follow a comma and 7 follow another display.
- **Rare or absent:** "we get" (3), "we find" (1), "yields" (1), "it follows that" (1). "Consequently", "whence", "thereby": 0. "Finally," (0 in the bank) may open the last step (Antoine, 2026-10-10). "Furthermore" never opens a sentence (0).
- **Commas after openers.** A word that opens a sentence takes a comma: "Now,", "Thus,", "Hence,", "Therefore,", "Finally,", "First,". In prose, "i.e." takes a comma on both sides (", i.e., "); between two formulas of a display, `\quad \text{i.e.} \quad` stays without commas. (Antoine, 2026-10-10)
- **Precise links.** When a derived statement is the target only up to an equivalence (a change of sign, a reciprocal), consider saying so: "which is equivalent to the first inequality" rather than "which is the first inequality". (Antoine, 2026-10-11)
- **Repeated connectives.** When the same connective would come twice in a row ("i.e. … i.e.", "Now … Now"), consider varying it ("i.e. … that is"), and keep the repetition if it reads better. (Antoine, 2026-10-08)
- **Antoine's phrases** (from his rewrites of 2026-10; use them where they fit): "which means that it is sufficient to show that" after "the ... theorem applies to ..." (rather than a colon); "For the first term, it is clear since" followed by the display of the limit; "Towards this goal, fix ..." to start the proof of the reduced statement; "..., which, by the three reductions above, concludes the proof." (Antoine, 2026-10-11) His other phrases come with their rules in sections 1 and 2.

## 4. Concluding

- **End on the answer.** In 22 of 24 solutions the last sentence states the result in the words of the question, or the last display is the target formula. The two exceptions end on the check of an example (0028) and on the specialisation of a general result (0032).
- **Find-all problems give the complete answer** (4 of 4):
  - `This is a contradiction to the assumptions hence the solutions of the original equation are exactly \( \{0, 1, 2\} \).` (0015)
  - `So the only solutions to the given equation are \(x = 0\) and \(x = 1\).` (0017)
  - "These polynomials can then be explicitly found by brute force (finitely many possibilities), and they form exactly the set:" followed by the set in a display (0022)
  - an equality of sets in two displays, after "It is easy to check that the solutions mentioned above work. Thus:" (0006)
- **Problems that ask for a value or for yes or no** (0026, 0029, 0043, 0048, 0058) restate the answer in a full sentence, except 0043, which ends on its display: `Therefore, the maximum \( \mathbb{R} \)-dimension of subspaces \( V \) satisfying the given condition is \( \frac{n(n-1)}{2} \).` (0029); `Therefore, the maximum possible cardinality of \( B \) is \(50\).` (0048); `Since $1$ is rational, the sum is rational.` (0026). 0013 does the same for its limit: "Therefore, the required limit is equal to 1."
- **Proofs end in one of these ways:**
  - on the target display, followed at most by "as required." (0005, 0010, 0018);
  - with "as desired." after the last check (3: 0036, twice in 0047): `Take $a = 0$ and $c = 1$, then $a < b < c$ and $f(a), f(c) \leq f(b)$, as desired.` (0047);
  - with a short closing clause: "and this concludes." (0042), "This shows the problem’s statement." (0016), `This proves that Ivan cannot transform \( A \) into \( B \).` (0024), `Thus, we conclude that $|z| = 1$ for all roots $z$.` (0003), `Such an \( R \) satisfies the required property.` (0054).
- **Contradiction first, result second**, in two sentences: "Both cases are a contradiction. Thus, we conclude that" (0003); "which is a contradiction. This shows that a third solution to the equation from the statement does not exist." (0017).
- **A sharpness part closes on the example:** "Hence, the bound is attained." (0036).
- **A sub-argument closes with a short clause:** "This completes the induction step, proving the result." (0004); "which gives our desired equality." (app); `a contradiction to our assumptions on $f$.` (0047).
- **Never:** an end-of-proof mark (`\qed`, `\blacksquare`, `\square` and "QED": 0), "In conclusion" (0), "To sum up" (0). A boxed answer occurs only in 0048 (`\boxed{67}`, 2 times).

## 5. Statements

- **Short.** 7 to 57 words of prose (median 15.5), 1 to 5 sentences (median 2). No source, hint, answer or difficulty in any statement (0 of 24).
- **Set-up first.** 12 of 24 statements open with "Let". The set-up sentence gives the type or the domain of the objects:
  - `Let \( n \in \mathbb{N}_{>0} \) and \( A, B \in \mathbb{R}^{n \times n} \) be real matrices.` (0032)
  - `Let \(\left(G,\cdot,e_G\right)\) be a finite non-commutative group.` (0036)
  - `Let $f : \mathbb{R} \to \mathbb{R}$ be a twice-differentiable function, with positive second derivative.` (0010)
- **Plain words for the hypotheses.** Consider stating the regularity of a function in words rather than with function spaces: "Let \( f \colon \left[0;1\right] \longrightarrow \left[0;1\right] \) be continuous, differentiable on \( \left]0;1\right[ \), with \( \left|f'\left(x\right)\right| \neq 1 \) for all \( x \in \left]0;1\right[ \)" rather than \( f \in C^0\left(\left[0;1\right],\left[0;1\right]\right) \) with \( f|_{\left]0;1\right[} \in D^1\left(\left]0;1\right[,\left[0;1\right]\right) \). (Antoine, 2026-10-19; Mean value theorem 1)
- **Further hypotheses** come with "Suppose" or "suppose" (4: 0004, 0032, 0042, 0054): `Suppose the sum of the traces of all elements in \( G \) is zero:` (0042).
- **Other openings:** the task itself (`Prove that the fraction \(\frac{21n+4}{14n+3}\) is irreducible for every natural number \(n\).`, 0001), a definition (`For any real number $\lambda \geq 1$, denote by $f(\lambda)$ the real solution to the equation`, 0013), or a short story ("Ivan writes the matrix", 0024).
- **The task is an imperative or a question:** "Prove that" (10 statements), "Show that" (7 times in 5 statements), "Find all" (4), another "find" or "Find" (3: 0029, 0043, 0058), "Determine whether or not" (0026), or a direct question ("Can Ivan end up with the matrix", 0024; `What is the maximal cardinality of \( B \)?`, 0048).
- **The key formula is displayed:** 21 `\[ ... \]` displays in 14 statements, plus `$$` in 0006 and 0047. 12 of the 21 end with a period and 2 with a comma: `F \circ G - G \circ F = \alpha F.` (0004).
- **Quantifiers are written in words**, at the end of the sentence (4: 0001, 0006, 0010, 0028) or at its start (4: 0004, 0013, 0016, 0043): `for every natural number \(n\)` (0001), `for any real number $x$.` (0010), `for all $x, y \in \mathbb Z$.` (0006), `Show that for any odd prime \( p \), the integer` (0016).
- **Explain a term** in a parenthesis, a "where" clause or an example: `(Here, \( i \) is the imaginary unit satisfying \( i^2 = -1 \).)` (0003); "(The trace of a matrix is the sum of its diagonal entries.)" (0029); `where \( I_n \) is the identity matrix` (0032); `For example, \( a_{36} = 1 \) because \( 36 = 100100_2 \),` (0005).
- **Ask for sharpness explicitly:** `Prove that \( b - a \geq \pi \) and give an example where \( b - a = \pi \).` (0028); "and show that this bound is tight, i.e., provide an example where the bound is attained." (0036).
- **Parts and lists:** sub-questions as parts "(a)", "(b)" (section 2, "Parts"). Conditions as an enumerate whose first item ends with ", and" (0022). A procedure as an itemize (0024).

## 6. Notation

| Object | Convention | Example |
|---|---|---|
| Number sets | `\mathbb` with braces (112 in 17; never without braces in a solution); a condition goes in a subscript | `\mathbb{R}_{>0}` (0015), `\mathbb{N}_{>0}` (0047), `\mathbb{Z}_{\geq0}` (0047), `\mathbb{N}_{\geq 1}` (app) |
| Real intervals | always French brackets with `;` as the separator, an open end turned outward, sized by hand (always; Antoine, 2026-10-17; checklist items 4 and 7); in the bank of 2026-10-01, French brackets 12 times in 5 bodies and parentheses once, `(5, 6)` (0017) | `\left]0;1\right[` (0016), `\left[1;+\infty\right[` (0013), `\left]a;b\right[` (0028) |
| Integer intervals | `\llbracket ... \rrbracket` with `;` (5 in 2); `\llbracket 0;n \rrbracket` rather than `\mathbb{N}_{\leq n}` (Antoine, 2026-10-09) | `\llbracket 1;p-1 \rrbracket` (0016), `\llbracket -K;K \rrbracket` (0047) |
| Infinity | `+\infty` in limits and intervals (23 of 33 uses of `\infty`); bare `\infty` only as the upper bound of a sum (9) | `\lim_{t \to +\infty} h(t) = +\infty` (0013) |
| Neutral elements | 0 and 1 carry their structure as a subscript | `0_{\mathbb{F}_2}` (0018), `1_{\mathbb{F}_2^n}` (0018), `0_K` (app), `1_R` (0032) |
| Zero and identity matrices | `\mathbf{0}_{n \times n}` (10 in 3); `I_n`, `I_4` | `\( V \cap S = \left\{ \mathbf{0}_{n \times n} \right\} \)` (0029) |
| Matrix delimiters | round brackets, `pmatrix`, not `bmatrix`; a determinant is a function of the matrix and keeps its own parentheses around it: `{\det}_{\mathbb{Q}\left(X\right)}\left(\begin{pmatrix} ... \end{pmatrix}\right)` (Antoine, 2026-10-08) | `A := \begin{pmatrix} \frac{5}{2} & -1 \\ 1 & 0 \end{pmatrix}` |
| Matrix spaces | `\mathbb{R}^{n \times n}`, `\mathrm{GL}_n` | `\( A := \sum_{M \in G} M \in \mathbb{R}^{n \times n} \)` (0042) |
| Base field | written on dimensions, determinants and adjectives | `\dim_{\mathbb{R}}\left( V \right)` (0029), `{\det}_{\mathbb{R}}\left(L(A)\right)` (0024), `\( K \)-bilinear` (app) |
| Algebraic structures | a tuple with the operations and neutral elements | `(R, +_R, \cdot_R, 0_R, 1_R)` (0032), `\left(G,\cdot,e_G\right)` (0036 statement) |
| Maps | `\to`, `\rightarrow`, `\longrightarrow` or `\colon` (one choice within a solution); `\mapsto` for the rule | `B \colon E \times E \to K` (app), `X \mapsto AX - XB` (0054) |
| Empty argument slot | `\cdot`, `-` or `\_` | `\langle \cdot, \cdot \rangle_{\mathbb{F}_2^n}` (0018), `B\left(-, v\right)` (app), `N \cdot \_` (0042) |
| Image, range, preimage | `\operatorname{Im}`, `\mathrm{ran}`; the image or preimage of a set takes square brackets | `\operatorname{Im}(A)` (0018), `f^{-1}[\{j\}]` (0047), `f\left[[0,1] \cap \mathbb{Q}\right]` (0047) |
| Sets and definitions | set-builder with `\mid` (12 of the 14 uses of `\mid`; a colon once, 0048); definitions with `:=` (14 in 6) | `\square_{\mathbb{N}} := \{ n^2 \mid n \in \mathbb{N} \}` (0006) |
| Disjoint unions | `\sqcup`, `\bigsqcup` (9 in 3) | `C = \bigsqcup_{x\in G} \left\{ x \right\} \times \mathrm{Stab}_{\phi}(x).` (0036) |
| Indices | sums from 0 (19 sums start at 0, 6 at 1; lists and matrix entries from 1: `x_1 < \dots < x_n` (0015), `(a_{ij})_{1 \leq i, j \leq n}` (0018), `x_1, \ldots, x_m` (0048)); a natural number serves as an index set | `\sum_{i=0}^{n-1} v_i w_i` (0018), `\{\alpha_i\mid i\in n\}` (0022) |
| Logic | quantifier formulas in displays, `\rightarrow` inside a formula; `\implies` (3: 0022, app) or `\Rightarrow` (2: 0036) between steps, and `\Longleftrightarrow` (app), `\Leftrightarrow` (0036) or `\leftrightarrow` (0032) for an equivalence; one choice within a solution | `\forall v\in K^n\left(\left(\forall w\in K^n \langle v,w\rangle_{K^n}=0_K\right) \rightarrow v=0_{K^n}\right)` (app) |
| Polynomials | capital `X` for the indeterminate, lowercase `x` for a value | `\( P(X) \) does not have any positive root because \( P(x) > 0 \)` (0022), `\mathbb{F}_{2}[[X]]` (0005) |
| Sums of differences | parentheses around a summand that is a difference (Antoine, 2026-10-08) | `\sum_{n=0}^{N} \left(\frac{1}{b_n - 1} - \frac{1}{b_{n+1} - 1}\right)` |
| Congruences and floors | `\equiv ... \pmod{p}`, `\left\lfloor ... \right\rfloor` | `\equiv \sum_{i=1}^{p-1} i! \pmod{p},` (0016) |
| Derivatives | primes, or an upright d | `f'(\lambda) = \frac{1}{h'(f(\lambda))}` (0013), `\frac{\mathrm{d}}{\mathrm{d}x}` (0028) |
| Composition | `\circ`, written every time (22 in 0004) | `F^k \circ G - G \circ F^k = \alpha k F^k.` (0004) |
| Products | `\cdot` between numbers and to separate factors (53 in 11) | `3 \cdot (14n+3) - 2 \cdot (21n + 4) = 1` (0001) |
| Exponential | `\exp(x)`, not `e^x`; `e` only for `\exp(1)` (Antoine, 2026-10-08) | `\exp\left(a_{n-1}\right) - a_{n-1} > 1`, `e - \exp\left(a_{N+1}\right)` |
| Special functions | indicator `\mathbbm{1}_{A}`; zero function `\underline{0}` or `f \equiv 0` | `2\mathbbm{1}_{A} - 2\mathbbm{1}_{\mathbb{Z} \setminus A}` (0006) |

**Quantities that depend on \( n \).** Consider writing a quantity that depends on \( n \) as a sequence defined once, at the start of the solution (`r_{-} \colon \mathbb{N} \to \mathbb{N}`, `n \mapsto v_2\left(n+1\right)`, then `r_n`), rather than as a letter (`r`) fixed along the way. (Antoine, 2026-10-09)

**Distinct letters.** Consider not reusing the letter of a summation index for another quantified variable in the same sentence: "for all \( k \in \mathbb{N} \) \( a_{2^k} \neq 0 \) and that \( \sum_{n=0}^{+\infty} \frac{1}{a_{2^n}} \) converges". (Antoine, 2026-10-08)

Absolute values and cardinalities use bars: `|G|` inline, `\left| G \right|` in the formal files (0036, 0042). The conjugate and the imaginary part of a complex number are `\bar{z}` and `\Im z` (0003).

## 7. LaTeX habits

1. **Displays.** Always `\[ ... \]`, never `$$` (rule 14). In the bank of 2026-10-01, `\[ ... \]` held 114 of the 130 displays, with `\[` and `\]` each alone on its line (113 and 112 of 114). The others: `$$...$$` (6, on one line, 5 of them without punctuation), `align*` (4: 0003, 0004, 0036), `equation*` (3, 0003), `equation` with `\label` and `\tag` (3, 0036). Inside `\[ ... \]`, a multi-line chain may use `\begin{aligned}` (2, 0032).
2. **Long chains** are split into two consecutive `\[ ... \]` blocks, the second starting with its relation (`=`, `\equiv`, `\subset`, `\cap`) (6 bodies: 0006, 0013, 0015, 0016, 0036, app), or aligned on `&=` (0004, 0032, 0036). When an inline formula makes a line overflow (a sequence \( \left\langle ... \right\rangle \) after "it is sufficient to show that"), consider moving it into a display, the sentence going on after it ("converges to \( 1 \)."). (Antoine, 2026-10-10)
3. **Punctuation inside displays.** A display is part of its sentence and is punctuated like one: it ends with "," when the sentence goes on after it (`\]`, then "and we conclude", "which gives"), with "." when the sentence ends there (the next one starts "It follows that"), and with no mark when the next words finish its clause (`\]`, then "is positive since"); the last row of a `cases` takes that mark, and its other rows end with "," (checklist pass, 2026-10-19). Sentences run into displays and go on after them: in the bank of 2026-10-01, 46 of the 130 displays were followed by lowercase text, most often "which" (11), "where" (8), "is" (5) and "since" (3), as in `has at least \( 3 \) zeros, which then implies that` (0015); 69 of the 130 displays ended with a period and 31 with a comma, and after a comma the sentence went on in lowercase on the next line (30 of 31; the other comma-ended display is followed by a second display). How a display is introduced: section 3.
4. **Inline math.** Always `\( ... \)` with a space inside the delimiters, never `$` (rule 14; Antoine, 2026-10-17): the whole bank was converted on 2026-10-17, and the validator rejects a `$` (checklist item 5, which also says what goes into math mode). In the bank of 2026-10-01: `\( ... \)` 418 times, `$...$` 207 times. `\( ... \)` has a space inside the delimiters in 341 of 418 cases (`\( a_n \)`); `$...$` never has one (0 of 207: `$n\geq 2$`). 10 bodies mix both, sometimes in one sentence: `Since \( \alpha(X) \neq 0 \) and $\mathbb{F}_{2}[[X]]$ is a domain as $\mathbb{F}_{2}$ is a domain, we must obtain:` (0005).
5. **Delimiter sizing.** Always (Antoine, 2026-10-10): every pair of parentheses, brackets or braces in mathematics is sized with `\left ... \right`, even around one symbol: `\log\left(n\right)`, `X^{\left(2^n\right)}`, `\left\{0\right\}`. The only exception is a pair that spans an `&` or a `\\` line break, which `\left ... \right` cannot do. A French interval is sized too: `\left]0;+\infty\right[` (the seminar's `leftright.py` skips reversed intervals, so size them by hand). In the bank: `\left ... \right` 288 times in 16 bodies, even around one symbol: `\log_2\left(2\right)` (0024), `\dim\left(E\right)` (app). None in 9 bodies (0001, 0003, 0004, 0005, 0013, 0043, 0048, 0054, 0058). `\big` once (app); `\Big` and `\bigl`: 0.
6. **Commands.** `\frac` only (151; `\dfrac`, `\tfrac`, `\displaystyle`: 0). `\leq` 66, `\geq` 27, `\neq` 11 (`\le`, `\ge`, `\ne`: 0). `\dots` 7, `\cdots` 3 (0016), `\ldots` 4 (0043, 0048). `:=` 14 (`\coloneqq`: 0). `\cdot` 53 in 11. `\quad` 21 in 7, between formulas on one display line: `N = 121 + 100|z|^2 + 220 \Im z, \quad D = 100 + 121|z|^2 + 220 \Im z,` (0003). `\iff` and `\Longrightarrow`: 0; `\varepsilon`, `\mathfrak` and `\overline`: 0.
7. **Operator names.** `\operatorname{...}` (15 in 4: Im, tr, diag, ran) and `\mathrm{...}` (35 in 4: Stab, Orb, tr, ran, Mat, GL, Aut, Ens, d) are both used. Built-in commands otherwise: `\ker`, `\dim`, `\det`, `\ln`, `\log_2`, `\Im`, `\lim`. Keep one choice within a solution (`\operatorname{tr}` in 0029 and `\mathrm{tr}` in 0042; `\operatorname{ran}` in 0047 and `\mathrm{ran}` in 0042).
8. **Equation numbers.** `\label`, `\tag` and `\eqref` occur 3 times each, all in 0036. Elsewhere an earlier formula is named in words: "Dividing the second equation by the first, we obtain" (0022); `Using the defining relation for \( f(\lambda) \), we see that for $\lambda \geq 1$:` (0013). Equation numbers are not part of the style in general, but a general, useful identity that later steps reuse (for example by evaluating it) is numbered with `\begin{equation} ... \label{...} \end{equation}` and cited with `\eqref`, especially when there are several of them, so that the reader always knows which equation is meant: "evaluating \eqref{eq:tel9-first} at \( 2 \) gives". (Antoine, 2026-10-09)
9. **Text commands.** `\textit` serves only as labels (17 in 6; see "Headings and labels"): no bold or italic marks emphasis inside a sentence (`\emph`: 0). `\href` 2 times, for a niche name (see "A niche name gets its link"). `\footnote` for side details (2 times in the 24 solutions of 2026-10-01: 0036, app; in 15 bank problems today, and in Darboux's theorem; see "Side details in footnotes"). `\appendixref` once (0018). `\textcolor` 90 times, only in 0032 (not part of the style).
10. **Lists.** `enumerate` 3 times (the parts of 0004, the steps of 0043, the theorem of app), `itemize` once (0005).
11. **Hyphen after math.** A compound with a math prefix keeps the hyphen outside the math (28 in 6): `$\mathbb{F}_{2}$-vector space` (0018), `an $n^2$-dimensional space` (0004), `\( \mathbb{R} \)-linear` (0042). 0018 had it twice inside the math (`\mathbb{F}_2-` before "subspace"), fixed on 2026-10-19.
12. **Source layout.** The source must read well in an editor (Antoine, 2026-10-12): every file is laid out by `website-code/bank/texformat.py`, which VS Code also runs on Cmd+S (`.vscode/settings.json`), so that a file you write keeps its layout when someone saves it. Run `python3 website-code/bank/texformat.py FILE --write` (or the seminar's `indent.py`) on every file you write, after `leftright.py`. What it does:
    - **Indentation**, by latexindent with `website-code/bank/latexindent.yaml`: 4 spaces per nesting level. The `%` header and the `\begin`/`\end` lines of `problem`, `solution` and `appendixitem` at column 0, their bodies at 4 spaces, the body of each nested environment (`theorem`, `proof`, `remark`, `enumerate`, `aligned`, ...) 4 spaces further, the contents of a display `\[ ... \]` 4 spaces further than its delimiters (`\[` and `\]` alone on their lines), and the lines that continue an `\item` 4 spaces further than the `\item`.
    - **Line width**: every paragraph is refilled within 100 characters: its lines are joined and each line takes as much of the text as fits, so that no line could take a word from the next one. A line breaks at a space, never inside braces `{...}` or `$...$` (latexindent would indent the next line, and a later save would move it again), never right after `\(` or right before `\)`, and outside inline math when that costs at most an eighth of the line. A line break is a space for LaTeX, so the PDF does not change.
    - **Never joined**: blank lines, comment lines (so the `%` header keeps one field per line), `\\\\` lines, `\begin` and `\end` lines, display delimiters `\[`, `\]` and `$$`, labels such as `\textit{Solution 1.}`, and the contents of aligned formulas, matrices, tables, TikZ pictures, code listings, algorithms and BibTeX blocks. An `\item` starts a new paragraph; a line that ends with a comment or with `\\` ends one. What has no usable space (a long URL, a long formula with no space outside braces) stays longer than 100 characters.
    - Only whitespace changes, and running it twice changes nothing more (checked on the 97 problems and 12 shared results: the same PDF text). Keep `\\\\` lines, `\textit{Solution k.}` labels and blank lines as they are: the tool does not touch them.
    In the bank of 2026-10-01, prose lines were not wrapped (a paragraph was one long source line or one sentence per line, and 13 of 25 bodies had a line longer than 300 characters), and the body was indented by 4 spaces in only 3 bodies (0001, 0003, 0016).
13. **Characters.** Apostrophes and quotes are ASCII, double quotes as ``` ``...'' ```, never straight double quotes and never an em dash (checklist item 9). In the bank of 2026-10-01, apostrophes were ASCII 7 times (`Bezout's`, `Rolle's`) and curly 5 times (`Vieta’s`, `problem’s`; 0036 had both "Lagrange's" and "Lagrange’s"), and the em dash occurred 4 times, all in 0036. A result named after two people or two notions takes an en dash: "rank–nullity theorem" (app), "orbit–stabiliser theorem" (0036), "Cayley–Hamilton theorem" (0054). A compound word takes a hyphen, never the LaTeX dash `--`: "two-move game" (0070, fixed on 2026-10-19); `---`: 0.

## 8. Vocabulary

| Prefer | Count | Rather than | Example |
|---|---|---|---|
| "It is easy to see that", "it is clear that", "clearly", "trivially", "well known" | 3; 2; 6 in 5; 1; 1 | "obviously" (0) | `It is easy to see that $\langle \cdot, \cdot \rangle_{\mathbb{F}_2^n}$ is $\mathbb{F}_{2}$-bilinear` (0018) |
| "increasing", "strictly increasing", "decreasing", "strictly decreasing" (rule 15; see "Monotonicity" below) | 12 in 5 for "strictly" | "non-decreasing", "non-increasing" (0 since 2026-10-18) | "is strictly positive as long as" (0029) |
| "bigger", "smaller" | 2; 1 | "greater" (1), "larger" (0) | `is certainly bigger than $0$` (0016) |
| "non-degenerate", "non-commutative", "non-empty" | 7; 6; 1 | "non empty" (2, both in 0010) | "non-degenerate" (app) |
| "the given ..." to point back to a hypothesis | 6 in 5 | n/a | `By the given assumption, we have $L(F) = \alpha F$.` (0004) |
| "the equation from the statement", "the problem’s statement" | 3 (0017); 1 (0016) | "the claim" (0) | `The fact that \(x\) satisfies the equation from the statement translates to \(f(5) = f(6)\).` (0017) |
| "Plug in", "Plugging in", "plug" | 4 in 2 | "Substituting" (0) | `Plugging in $x=0$ in this gives $c^2=\frac{c^2}{2}+c$, hence $c=0$ or $c=2$.` (0006) |
| "without loss of generality", spelled out | 2 | "WLOG" (0) | `say (without loss of generality) \( \alpha_{n-1} \)` (0022) |
| "which is a contradiction", "a contradiction to our assumptions" | "contradiction" 7 in 5 | "absurd" (0) | "which is a contradiction." (0017) |
| "tight", "attained", "achieved" | 2; 1; 1 | "sharp" (0), "optimal" (0) | "Hence, the bound is attained." (0036) |
| "group morphism" | 2 (0024) | "homomorphism" (0) | "This suggests the need for a group morphism." (0024) |
| "standard binary product" | 2 (0018, app) | "dot product" (0) | "Define the standard binary product" (0018) |
| "brute force (finitely many possibilities)" for a finite check left to the reader | 1 | n/a | "can then be explicitly found by brute force (finitely many possibilities)" (0022) |

- **Monotonicity has four words**: "increasing" (\( x \leq y \) implies \( f\left(x\right) \leq f\left(y\right) \)), "strictly increasing" (\( x < y \) implies \( f\left(x\right) < f\left(y\right) \)), "decreasing" and "strictly decreasing", for functions and sequences alike; never "non-decreasing", "non-increasing", "weakly" or "monotonically" (always; Antoine, 2026-10-18). A step that needs the strict version says "strictly": "\( \left(n+1\right)^{\alpha}-n^{\alpha} \) is positive since \( x \mapsto x^{\alpha} \) is strictly increasing" (0057). The bank and the seminar rewrites were changed on 2026-10-18.
- Phrasings shaped by French belong to the voice and may stay: "the equation from the statement" (0017), "composed uniquely of" (0018 statement), "applied on the non empty interval" (0010), "the affine function" (0017).
- **Spelling and hyphenation vary between files**: -ize in 0005 ("analyzing"), 0022 ("Summarizing") and 0024 ("recognize"), -ise in 0036 ("stabiliser", "centre", "realise"); "finite dimensional" (0018, app) and "finite-dimensional" (0004). Keep one choice within a file (checklist item 14).

## 9. What the solutions do not do

Counts are over the 25 bodies unless stated. The other things the solutions never do are stated with their topics in the sections above.

- No source, competition or book named inside a solution (0 hits for Putnam, IMO, IMC, Bernoulli, olympiad, competition, official, book).
- No macro definitions: `\newcommand` (0).
- No figures: `tikz`, `\includegraphics` (0).
- No contraction such as "n't" in a solution (0; one "doesn't" in the 0048 statement).

## 10. Examples

Ten verbatim excerpts. Line numbers refer to the files on 2026-10-01; trailing spaces are removed. They show the structure and the voice; their LaTeX predates rules 12 to 15 (`$`, `$$`, unsized brackets, `bmatrix`): never copy it.

**Cases as parallel paragraphs (0010, lines 35 to 40).**

```latex
\\\\
If $f'(x)>0$ then $c\in [\,x,\, x+ f'(x)\,]$ and because the second derivative is positive, $f'$ is increasing; hence $0<f'(x) < f'(c)$. Therefore $f(x + f'(x)) - f(x)>0$.
\\\\
If $f'(x)<0$ then $c\in [\,x+ f'(x),\, x\,]$ and because the second derivative is positive, $f'$ is increasing; hence $f'(c) < f'(x)<0$. Therefore $f(x + f'(x)) - f(x)>0$.
\\\\
In all cases: $$f(x + f'(x)) \geq f(x)$$
```

**A chain over two displays, then the answer in words (0013, lines 35 to 41).**

```latex
Now we apply L'Hôpital's theorem and obtain
\[
\lim_{\lambda \to +\infty} \frac{f(\lambda)}{\frac{\lambda}{\ln \lambda}} = \lim_{\lambda \to +\infty} \frac{\frac{1}{\lambda}}{\frac{1}{f(\lambda)} \cdot \frac{1}{2 + \ln f(\lambda)}} = \lim_{\lambda \to +\infty} \frac{f(\lambda)}{\lambda} (2 + \ln f(\lambda))\]
\[
= \lim_{\lambda \to +\infty} \frac{2 + \ln f(\lambda)}{1 + \ln f(\lambda)} = 1+\lim_{\lambda \to +\infty}\frac{1}{1+\ln f(\lambda)}=1,
\]
where the last equality follows from the fact $\lim_{\lambda\to +\infty}\ln f(\lambda)=+\infty$. Therefore, the required limit is equal to 1.
```

**A sentence that runs through a display, then the exact answer (0015, lines 42 to 48).**

```latex
has at least \( 2 \) zeros, which again implies that
\[
h_{8} h_{6} h_{1} f(x) = \ln\left( \frac{9}{8} \right) \ln\left( \frac{9}{6} \right) \ln(9) 9^x + \ln\left( \frac{4}{8} \right) \ln\left( \frac{4}{6} \right) \ln(4) 4^x + \ln\left( \frac{2}{8} \right) \ln\left( \frac{2}{6} \right) \ln(2) 2^x
\]
has at least \( 1 \) zero.
\\\\
The function \( h_{8} h_{6} h_{1} f(x) \) is of the form \( k_{2} 2^x + k_{4} 4^x + k_{9} 9^x \), for $k_2, k_4, k_9>0$ and hence is always positive. Therefore, \( h_{8} h_{6} h_{1} f(x) \) cannot have any real zero. This is a contradiction to the assumptions hence the solutions of the original equation are exactly \( \{0, 1, 2\} \).
```

**Justifications after each display, then a one-line ending (0016, lines 48 to 59).**

```latex
    Now note that for each $0\leq j\leq p-1$ we have $j\equiv -(p-j)\pmod{p}$ and thus for fixed $0\leq i < p-1$:
    \[
        \frac{(-1)^i (p-1)!}{i!} = (-1)^i (i+1)(i+2)\cdots(p-1) \]
    \[
        \equiv (-1)^i (p-(i+1))(p-(i+2))\cdots 2 \cdot 1 \cdot (-1)^{p-(i+1)} \equiv (p-(i+1))! \pmod{p},
    \]
    where we used that there are $p-(i+1)$ factors in $\frac{(p-1)!}{i!}$ and the fact that \( p \) is odd again. Hence, we have
    \[
        \left\lfloor \frac{(p-1)!}{e} \right\rfloor \equiv \sum_{i=0}^{p-2} (p-(i+1))! \equiv \sum_{i=1}^{p-1} i! \pmod{p},
    \]
    since $i\mapsto p-(i+1)$ is a bijection from $\llbracket 0,p-2\rrbracket$ to $\llbracket 1,p-1\rrbracket$.
    This shows the problem’s statement.
```

**Formal register, ending on the target display (0018, lines 33 to 44).**

```latex
Now write \( A = (a_{ij})_{1 \leq i, j \leq n} \) with \( a_{ii} = 1_{\mathbb{F}_2} \) and \( a_{ij} = a_{ji} \). Then we have for any \( v \in \mathbb{F}_2^n \),
\[
\langle v, Av \rangle_{\mathbb{F}_2^n} = \sum_{0 \leq i, j \leq n-1} v_i v_j a_{ij} = \sum_{i=0}^{n-1} v_i^2 + 2 \sum_{0\leq i < j\leq n-1} v_i v_j a_{ij} = \sum_{i=0}^{n-1} v_i = \left\langle v, 1_{\mathbb{F}_2^n} \right\rangle_{\mathbb{F}_2^n},
\]
because we are working over \( \mathbb{F}_2 \). In particular for any \( z \in \operatorname{Im}(A)^\perp\subset \mathbb{F}_2^n \),
\[
\langle z, 1_{\mathbb{F}_2^n} \rangle_{\mathbb{F}_2^n} = \langle z, Az \rangle_{\mathbb{F}_2^n} = 0_{\mathbb{F}_2},
\]
since \( Az \in \operatorname{Im}(A) \) and $z\in \operatorname{Im}(A)^{\perp}$. As $z\in \operatorname{Im}(A)^{\perp}$ was arbitrary, we must have
\[
1_{\mathbb{F}_2^n}\in \left(\operatorname{Im}(A)^{\perp}\right)^{\perp} = \operatorname{Im}(A).
\]
```

**The degenerate case first, a named result inside the sentence (0022, lines 29 to 35).**

```latex
Let $n\geq 1$. If $n=1$, then trivially the only such polynomial is $X$. Else, $n\geq 2$, and let $P(X)$ be a polynomial of degree $n$ satisfying the conditions. Note that \( P(X) \) does not have any positive root because \( P(x) > 0 \) for every \( x > 0 \). Thus, we can represent the roots as \( -\alpha_i \) for \( i = 0,1, \dots, n-1 \), where \( \{\alpha_i\mid i\in n\}\subset\mathbb{Q}_{+}\).
\\\\
If \( a_0 \neq 0 \), then the roots are strictly positive $\{\alpha_i\mid i\in n\}\subset\mathbb{Q}_{>0}$, and condition 1 gives that there exists some \( k \in \mathbb{N} \) with \( 1 \leq k \leq n-1 \) such that \( a_k = 0 \). Using Vieta’s formulas for this coefficient $a_k$, we obtain:
\[
    \sum_{\substack{S\subset n\\|S|=n-k}}\left(\prod_{i\in S}\alpha_i\right)= \frac{a_k}{a_n}=0,
\]
which is impossible since the left-hand side is strictly positive (as $k<n$). Therefore, \( a_0 = 0 \), and one of the roots of \( P(X) \), say (without loss of generality) \( \alpha_{n-1} \), must be zero.
```

**Motivation before a construction (0024, lines 35 to 38).**

```latex
Notice first that the allowed operations preserve the positivity of entries; all matrices Ivan can reach have only positive entries. The key insight is to recognize that the operations resemble standard row/column addition/subtraction operations (which preserve determinants), but here addition/subtraction is replaced by multiplication/division. This suggests the need for a group morphism. Hence, we define boldly for any matrix \( X = \begin{bmatrix} x_{11} & x_{12} \\ x_{21} & x_{22} \end{bmatrix} \in \mathbb{R}_{>0}^{2 \times 2} \) with positive entries, the following auxiliary logarithmic transformation matrix:
\[
L(X) = \begin{bmatrix} \log_2\left(x_{11}\right) & \log_2\left(x_{12}\right) \\ \log_2\left(x_{21}\right) & \log_2\left(x_{22}\right) \end{bmatrix}.
\]
```

**A bound, its sharpness, then the answer (0029, lines 40 to 51).**

```latex
Denote by \( S \) the \( \mathbb{R} \)-linear space of all real \( n \times n \) symmetric matrices; its \( \mathbb{R} \)-dimension is clearly \( \frac{n(n+1)}{2} \).
Since \( V \cap S = \left\{ \mathbf{0}_{n \times n} \right\} \), we have
\[
    \dim_{\mathbb{R}}\left( V \right) + \dim_{\mathbb{R}}\left( S \right) \leq n^2,
\]
which gives
\[
    \dim_{\mathbb{R}}\left( V \right) \leq n^2 - \frac{n(n+1)}{2} = \frac{n(n-1)}{2}.
\]
Thus, the maximum \( \mathbb{R} \)-dimension is bounded above by \( \frac{n(n-1)}{2} \). This bound is tight: the space of strictly upper triangular matrices clearly has \( \mathbb{R} \)-dimension \( \frac{n(n-1)}{2} \) and satisfies the given condition.
\\\\
Therefore, the maximum \( \mathbb{R} \)-dimension of subspaces \( V \) satisfying the given condition is \( \frac{n(n-1)}{2} \).
```

**Facts named in passing, and a closing clause (0042, lines 35 to 41).**

```latex
In particular, \( A^{2} - \left| G \right| A = \mathbf{0}_{n \times n} \), which implies that the minimal polynomial of \( A \), denoted \( P_{\min, A}(X) \in \mathbb{R}[X] \), divides \( X\left( X - \left| G \right| \right) \). In particular, since the roots of the minimal polynomial of a matrix over a field are precisely the roots of its characteristic polynomial (i.e., the eigenvalues of the matrix), it follows that all eigenvalues of \( A \) are either \( 0 \) or \( \left| G \right| \geq 1 \).
\\\\
Denote by \( m_0(A) := \dim_{\mathbb{R}} \left( \ker\left( A \right) \right) \) and \( m_{\left| G \right|}(A) := \dim_{\mathbb{R}} \left( \ker\left( A - \left| G \right| I \right) \right) \) the respective geometric multiplicities. Since the trace of a matrix equals the sum of its eigenvalues (by Vieta’s formula), and the trace map \( \mathrm{tr} \) is \( \mathbb{R} \)-linear, the condition
\[
0 = \sum_{M \in G} \mathrm{tr}\left( M \right) = \mathrm{tr}\left( A \right) = m_{0}(A) \cdot 0 + m_{\left| G \right|}(A) \cdot \left| G \right| = m_{\left| G \right|}(A) \cdot \left| G \right|,
\]
implies that there are no eigenvalues of \(A\) equal to \( \left| G \right| \); \(m_{\left| G \right|}(A) = 0\). Hence all eigenvalues of \( A \) are \( 0 \). Thus \( P_{\min, A}(X) = X \), which means \( \mathbf{0}_{n \times n} = P_{\min, A}(A) = A = \sum_{M \in G} M\), and this concludes.
```

**The end of a proof in the shared result (app, lines 83 to 87).**

```latex
Since \( Q^{\perp}\subset E \) is a \( K \)-subspace, we must have:
    \[
\dim\left(\left(Q^{\perp}\right)^{\perp}\right) = \dim\left(E\right) - \dim\left(Q^{\perp}\right) = \dim\left(E\right) - \left(\dim\left(E\right) - \dim\left(Q\right)\right) = \dim\left(Q\right).
    \]
    We conclude \( Q = \left(Q^{\perp}\right)^{\perp} \) since \( Q \subset \left(Q^{\perp}\right)^{\perp} \) and they have the same (crucially finite) dimension.
```

## 11. Differences between solutions

**Dominant and minority formats.** 20 of the 24 solutions follow the habits above. Four read differently; prefer the dominant habits to theirs:

- 0043: an enumerate of four steps with labels (`\item \textit{Decomposing the Sum:}`), short imperatives ("Group terms by", "Split into two reindexed sums:"), no "we", no punctuation in its 5 displays, no closing sentence.
- 0048: chattier and partly impersonal ("One can easily construct a legal set", "That leaves proving that one cannot do better."), parts "(a)" and "(b)", two solutions in each part (`\textit{Solution 1.}`, `\textit{Solution 2.}`; until 2026-10-02 the second one was an inline `\textit{Alternate solution}`), the answer in `\boxed{67}`.
- 0054: `\textit{Step 1.}` and `\textit{Step 2.}` with blank lines, `\mathrm{Mat}_{n \times n}(\mathbb{C})`, `\mathbb{C}[x]`, `w^t`, no `\left`.
- 0058: a two-line sketch (55 words) that opens with a formula, says "by a simple derivative test" and has no display.

**Three registers inside the dominant group.** 0022, 0029 and 0036 mix the second with passages of the third.

- Terse computation with little prose, as in 0001, 0006 and 0010.
- Guided prose that announces each step, as in 0003, 0005, 0015, 0017, 0024 and 0036.
- Formal and set-theoretic, as in 0018, 0032, 0042, 0047 and app: quantifier formulas, subscripted neutral elements, structures as tuples, `\left ... \right` everywhere.

**Habits that still vary from file to file**: the implication and equivalence arrows and the map arrows (section 6, "Logic" and "Maps"), the operator names (section 7, "Operator names"), the index base (section 6, "Indices"), the spelling and the hyphenation (section 8). Keep one choice within a solution. When unsure, follow the rules in brief at the top.
