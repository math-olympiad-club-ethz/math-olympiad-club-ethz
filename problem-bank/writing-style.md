# How the solutions of the bank are written

This guide was derived on 2026-10-01 from the 24 fully solved problems of the bank (0001, 0003, 0004, 0005, 0006, 0010, 0013, 0015, 0016, 0017, 0018, 0022, 0024, 0026, 0028, 0029, 0032, 0036, 0042, 0043, 0047, 0048, 0054, 0058) and from the shared result `appendix/double-orthogonal-complement.tex`. Their solutions were written by Antoine, the club president. Problems without a solution (18), partial ones (`status: partial`, 10), 0033 (placeholder text) and the 27 further problems with an entry in `known-errors.md` were left out on purpose: they were works in progress. Follow this guide when you write a statement or a solution for the bank, by hand or with an AI.

How to read the numbers. "12 in 5" means 12 occurrences in 5 of the 25 bodies (the 24 solutions and the shared result). Words are counted with the mathematics removed. Statement counts are over the 24 statements. Every quotation is copied from these files. The number in parentheses is the problem it comes from; "app" is the shared result.

## The rules in brief

1. Write "we" (103 times in 21 of 25 bodies). Never "I" (0).
2. Start with the first mathematical step. No solution copies its statement (0 of 24).
3. Write one continuous text: no `\section`, no "Answer:", no "Claim:", no lemma environment (0 each in the 24 solutions). 19 of the 24 solutions have no bold or italic label at all.
4. Separate blocks with a line that holds only `\\\\` (35 such lines in 17 bodies).
5. Justify each step where it is used: "since" (37 in 13), "because" (9 in 7), a parenthesis, or a named result ("By Rolle's theorem").
6. Put displays in `\[ ... \]`, each delimiter on its own line (113 and 112 of 114). Punctuate them: 100 of the 130 displays end with a period or a comma.
7. Link the steps with "Thus,", "Hence,", "Therefore," and "Since ..., we have".
8. End with one sentence that gives the answer or the claim in words, or with the target formula in a display (22 of 24 solutions).
9. In a statement, set up the objects with "Let" (12 of 24), ask with "Prove that", "Show that" or "Find all", and display the key formula.
10. Be precise with structures: neutral elements carry their structure (`0_K`, `1_R`), dimensions carry their field (`\dim_{\mathbb{R}}`), intervals use French brackets (`]0;1[`).

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
- **Named results are cited by name, in the sentence that uses them.** 18 citations in 12 bodies, and no `\cite`:
  - "By Bezout's Lemma," (0001); "By Rolle's theorem" (0015, 0017); "by Lagrange's theorem" (0036)
  - "The mean value theorem applied on the non empty interval yields" (0010)
  - "Now we apply L'Hôpital's theorem and obtain" (0013)
  - `Using Vieta’s formulas for this coefficient $a_k$, we obtain:` (0022)
  - "By the Cayley–Hamilton theorem" (0054); "by the rank–nullity theorem" (app)
  - "theorem" is lowercase in 10 of its 11 occurrences after a name. The exception is "The Chinese Remainder Theorem" (0054).
- **A classical fact that needs its own proof becomes a shared result**, cited in one sentence: `For a proof of this classical fact, see the Appendix [\appendixref{double-orthogonal-complement}].` (0018)
- **Routine checks are stated, not written out.** "It is easy to see that" (3), "It is easy to check that the solutions mentioned above work." (0006), "it is clear that" (2), "clearly" (6 in 5), "trivially" (0022), "By a trivial induction" (0024), "well known" (0024). "obviously": 0.
- **Facts a reader could stumble on are spelled out.** `Since \( + \) is commutative, we have:` (0042); `because we are working over \( \mathbb{F}_2 \).` (0018). Constructions are checked in full: 0032 verifies both the right and the left inverse, 0028 checks that its example satisfies the inequality and both boundary limits, 0036 counts the 40 commuting pairs of the quaternion group.
- **The scope of an argument is stated.** `This equation is valid for any finite group \(G\).` (0036, one of 3 such sentences there). 0032 works in "any (possibly non-commutative) unital ring" and ends with "Apply this result to". 0054 says "In fact, we prove that for any two polynomials". 0047 ends with a `\textit{Remark:}` that generalises the proof.
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

- The paragraph separator is a line holding only `\\\\`: 35 lines in 17 of 25 bodies. A blank line separates paragraphs of prose only in 0003 (2) and 0054 (4); the other 8 blank lines sit between list items or environments.
- A paragraph is one long source line, or one sentence per line. Prose is not wrapped at a fixed width (0 wrapped lines). 13 of 25 bodies have a line longer than 300 characters.
- Sentences run into displays and go on after them. 46 of the 130 displays are followed by lowercase text, most often "which" (11), "where" (8), "is" (5) and "since" (3). Example: `has at least \( 3 \) zeros, which then implies that` (0015).
- A single `\\` line break in prose is rare (3: twice in 0017, once in 0058).

### Headings and labels

- No `\section`, `\subsection` or `\paragraph` (0). No "Answer:", "Claim:" or "Case 1" label (0).
- 19 of 24 solutions have no bold or italic label. The 5 exceptions: `\item \textbf{Coefficient of \( X^{4n} \):}` (0005), `\item \textbf{Understanding \(\langle n \rangle\):}` (0043), `\textbf{Step 1.}` (0054), `\textit{Remark:}` (0047), `\textit{Alternate solution}` (0048). The shared result uses `\textit{Examples:}`, `\textbf{1.}` and `\textbf{2.}`.
- Multi-part problems: `\item[(a)]` and `\item[(b)]` inside an enumerate (0004), or plain "(a)" and "(b)" paragraphs (0048).

### Cases

- Cases are parallel paragraphs that start with "If", are worded almost identically and are separated by `\\\\` lines (0010, 0017). A short line closes them: "In all cases:" (0010), "Both cases are a contradiction." (0003). 0003 writes them as dash items: `- If $|z| > 1$, then $1 - |z|^2 < 0$, so $N < D$ and hence $|z^9| < 1$.`
- "If" starts a sentence 11 times in 6 bodies.
- Settle the degenerate case first and open the rest with "Else" (3: 0006, 0010, 0022) or "Otherwise" (1: 0047): `Else $f'(x)\neq 0$ and then the following set has non empty interior:` (0010).
- A two-way split can stay inside one sentence: `Then either \(\tilde{x}\) commutes with all elements` ... "or it does not" (0036).
- No `cases` environment and no case headings in the solutions (0).

### Lemmas and sub-claims

- No lemma, claim or proof environment in the 24 solutions (0). A sub-claim is announced in one sentence and proved in the flow:
  - "We claim there are no other roots. By Rolle's theorem," (0015)
  - "We claim that the element" (0032)
  - `We show that such $f$ must be unbounded on $[0,1] \cap \mathbb{Q}$. Indeed, if this is not the case, then` (0047)
  - "We argue that the tail" (0016); "Let us prove that" (0017)
- A general statement may be proved first and specialised in the last line: "Apply this result to the non-commutative unital ring" (0032).
- A classical fact with a long proof becomes a shared result in `appendix/`: a setting paragraph (`Let \( E \) be a vector space over a field \( K \)`), definitions with `:=`, then `\begin{theorem}[Double Orthogonal Complement]` and `\begin{proof}` (the only theorem and proof environments, 1 each). Solutions cite it with `\appendixref{...}`.

### Extras and length

- Extras come at the end: the sharpness part ("Equality is achieved when:" 0028; "This bound is tight:" 0029; "To show that the bound is tight, consider the non-commutative quaternion group" 0036) and remarks (`\textit{Remark:}` 0047). In 0028, 0036 and 0047 they open a new block after a `\\\\` line.
- Solutions have 17 to 343 words of prose (median 90.5) and 0 to 19 displays (median 4). The shared result has 313 words and 15 displays.

## 3. Linking the steps

| Phrase | Count | Use | Example |
|---|---|---|---|
| since, Since | 37 in 13 | justification, before or inside a sentence | `Since \( N \in G \) was arbitrary, we have in particular` (0042) |
| which | 30 in 15 | goes on after a formula | `which is impossible since the left-hand side is strictly positive (as $k<n$).` (0022) |
| we have | 30 in 16 | leads into a display | "Hence, we have" (0016) |
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
| i.e. | 8 in 7 | restatement | `Assume that the formula holds for some $k \geq 1$, i.e.,` (0004) |
| Note that, Notice | 7 in 5 | a remark the next step needs | `Note that \( P(X) \) does not have any positive root because \( P(x) > 0 \) for every \( x > 0 \).` (0022) |
| again | 5 in 5 | the same tool once more | `has at least \( 2 \) zeros, which again implies that` (0015) |
| Else, Otherwise | 4 in 4 | the remaining case | `Else we have $f(x) = \pm 2$ for all $x$.` (0006) |
| However | 3 in 3 | a turn in the argument | `However, if $F^k \neq 0$ for all $k$, then` (0004) |
| Indeed | 3 in 3 | proves the previous sentence | `Indeed, since \( \dim\left(E\right) = \dim\left(E^{*}\right) \), injectivity of \( \varphi_E \) implies its surjectivity.` (app) |
| In total, Summarizing | 3 in 2 | gathers the facts | "In total:" (0022); "Summarizing, the only possible polynomials" (0022) |

- **Participles open a step:** "Using" (5), "Taking" (2), "Plugging in" (2), and once each "Multiplying", "Dividing", "Rearranging", "Applying", "Solving", "Combining". Examples: "Taking the modulus on both sides, we examine the numerator and denominator separately:" (0003); `Multiplying the given equation \( \alpha(X)^3 + X \alpha(X) + 1 = 0 \) by \( \alpha(X) \), we obtain:` (0005); "Rearranging, we find" (0022).
- **Before a display**, the clause ends with a colon (68 of 130 displays) or runs straight into it (41), as in "we have", "we obtain", "defined by", "implies that", "such that". 13 displays follow a comma and 7 follow another display.
- **Rare or absent:** "we get" (3), "we find" (1), "yields" (1), "it follows that" (1). "Finally", "Consequently", "whence", "thereby": 0. "Furthermore" never opens a sentence (0).

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
  - with "as desired." after the last check (3: 0036, twice in 0047);
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
- **Further hypotheses** come with "Suppose" or "suppose" (4: 0004, 0032, 0042, 0054): `Suppose the sum of the traces of all elements in \( G \) is zero:` (0042).
- **Other openings:** the task itself (`Prove that the fraction \(\frac{21n+4}{14n+3}\) is irreducible for every natural number \(n\).`, 0001), a definition (`For any real number $\lambda \geq 1$, denote by $f(\lambda)$ the real solution to the equation`, 0013), or a short story ("Ivan writes the matrix", 0024).
- **The task is an imperative or a question:** "Prove that" (10 statements), "Show that" (7 times in 5 statements), "Find all" (4), another "find" or "Find" (3: 0029, 0043, 0058), "Determine whether or not" (0026), or a direct question ("Can Ivan end up with the matrix", 0024; `What is the maximal cardinality of \( B \)?`, 0048).
- **The key formula is displayed:** 21 `\[ ... \]` displays in 14 statements, plus `$$` in 0006 and 0047. 12 of the 21 end with a period and 2 with a comma: `F \circ G - G \circ F = \alpha F.` (0004).
- **Quantifiers are written in words**, at the end of the sentence (4: 0001, 0006, 0010, 0028) or at its start (4: 0004, 0013, 0016, 0043): `for every natural number \(n\)` (0001), `for any real number $x$.` (0010), `for all $x, y \in \mathbb Z$.` (0006), `Show that for any odd prime \( p \), the integer` (0016).
- **Explain a term** in a parenthesis, a "where" clause or an example: `(Here, \( i \) is the imaginary unit satisfying \( i^2 = -1 \).)` (0003); "(The trace of a matrix is the sum of its diagonal entries.)" (0029); `where \( I_n \) is the identity matrix` (0032); `For example, \( a_{36} = 1 \) because \( 36 = 100100_2 \),` (0005).
- **Ask for sharpness explicitly:** `Prove that \( b - a \geq \pi \) and give an example where \( b - a = \pi \).` (0028); "and show that this bound is tight, i.e., provide an example where the bound is attained." (0036).
- **Parts and lists:** sub-questions as paragraphs "a) Show that" and "b) Show that" (0004), or "(a)" and "(b)" (0048). Conditions as an enumerate whose first item ends with ", and" (0022). A procedure as an itemize (0024).

## 6. Notation

| Object | Convention | Example |
|---|---|---|
| Number sets | `\mathbb` with braces (112 in 17; never without braces in a solution); a condition goes in a subscript | `\mathbb{R}_{>0}` (0015), `\mathbb{N}_{>0}` (0047), `\mathbb{Z}_{\geq0}` (0047), `\mathbb{N}_{\geq 1}` (app) |
| Real intervals | French brackets, an open end turned outward (12 in 5); parentheses once, `(5, 6)` (0017) | `]0;1[` (0016), `[1, +\infty[` (0013), `\left]a, b\right[` (0028) |
| Integer intervals | `\llbracket ... \rrbracket` (5 in 2) | `\llbracket 1,p-1\rrbracket` (0016), `\llbracket -K, K \rrbracket` (0047) |
| Infinity | `+\infty` in limits and intervals (23 of 33 uses of `\infty`); bare `\infty` only as the upper bound of a sum (9) | `\lim_{t \to +\infty} h(t) = +\infty` (0013) |
| Neutral elements | 0 and 1 carry their structure as a subscript | `0_{\mathbb{F}_2}` (0018), `1_{\mathbb{F}_2^n}` (0018), `0_K` (app), `1_R` (0032) |
| Zero and identity matrices | `\mathbf{0}_{n \times n}` (10 in 3); `I_n`, `I_4` | `\( V \cap S = \left\{ \mathbf{0}_{n \times n} \right\} \)` (0029) |
| Matrix spaces | `\mathbb{R}^{n \times n}`, `\mathrm{GL}_n` | `\( A := \sum_{M \in G} M \in \mathbb{R}^{n \times n} \)` (0042) |
| Base field | written on dimensions, determinants and adjectives | `\dim_{\mathbb{R}}\left( V \right)` (0029), `{\det}_{\mathbb{R}}\left(L(A)\right)` (0024), `\( K \)-bilinear` (app) |
| Algebraic structures | a tuple with the operations and neutral elements | `(R, +_R, \cdot_R, 0_R, 1_R)` (0032), `\left(G,\cdot,e_G\right)` (0036 statement) |
| Maps | `\to`, `\rightarrow`, `\longrightarrow` or `\colon`; `\mapsto` for the rule | `B \colon E \times E \to K` (app), `X \mapsto AX - XB` (0054) |
| Empty argument slot | `\cdot`, `-` or `\_` | `\langle \cdot, \cdot \rangle_{\mathbb{F}_2^n}` (0018), `B\left(-, v\right)` (app), `N \cdot \_` (0042) |
| Image, range, preimage | `\operatorname{Im}`, `\mathrm{ran}`; the image or preimage of a set takes square brackets | `\operatorname{Im}(A)` (0018), `f^{-1}[\{j\}]` (0047), `f\left[[0,1] \cap \mathbb{Q}\right]` (0047) |
| Sets and definitions | set-builder with `\mid` (12 of the 14 uses of `\mid`; a colon once, 0048); definitions with `:=` (14 in 6) | `\square_{\mathbb{N}} := \{ n^2 \mid n \in \mathbb{N} \}` (0006) |
| Disjoint unions | `\sqcup`, `\bigsqcup` (9 in 3) | `C = \bigsqcup_{x\in G} \left\{ x \right\} \times \mathrm{Stab}_{\phi}(x).` (0036) |
| Indices | sums from 0 (19 sums start at 0, 6 at 1); a natural number serves as an index set | `\sum_{i=0}^{n-1} v_i w_i` (0018), `\{\alpha_i\mid i\in n\}` (0022) |
| Logic | quantifier formulas in displays, `\rightarrow` inside a formula; `\implies` (3) or `\Rightarrow` (2) between steps | `\forall v\in K^n\left(\left(\forall w\in K^n \langle v,w\rangle_{K^n}=0_K\right) \rightarrow v=0_{K^n}\right)` (app) |
| Polynomials | capital `X` for the indeterminate, lowercase `x` for a value | `\( P(X) \) does not have any positive root because \( P(x) > 0 \)` (0022), `\mathbb{F}_{2}[[X]]` (0005) |
| Congruences and floors | `\equiv ... \pmod{p}`, `\left\lfloor ... \right\rfloor` | `\equiv \sum_{i=1}^{p-1} i! \pmod{p},` (0016) |
| Derivatives | primes, or an upright d | `f'(\lambda) = \frac{1}{h'(f(\lambda))}` (0013), `\frac{\mathrm{d}}{\mathrm{d}x}` (0028) |
| Composition | `\circ`, written every time (22 in 0004) | `F^k \circ G - G \circ F^k = \alpha k F^k.` (0004) |
| Products | `\cdot` between numbers and to separate factors (53 in 11) | `3 \cdot (14n+3) - 2 \cdot (21n + 4) = 1` (0001) |
| Special functions | indicator `\mathbbm{1}_{A}`; zero function `\underline{0}` or `f \equiv 0` | `2\mathbbm{1}_{A} - 2\mathbbm{1}_{\mathbb{Z} \setminus A}` (0006) |

Absolute values and cardinalities use bars: `|G|` inline, `\left| G \right|` in the formal files (0036, 0042). The conjugate and the imaginary part of a complex number are `\bar{z}` and `\Im z` (0003).

## 7. LaTeX habits

1. **Displays.** `\[ ... \]` holds 114 of the 130 displays, with `\[` and `\]` each alone on its line (113 and 112 of 114). The others: `$$...$$` (6, on one line, 5 of them without punctuation), `align*` (4: 0003, 0004, 0036), `equation*` (3, 0003), `equation` with `\label` and `\tag` (3, 0036). Inside `\[ ... \]`, a multi-line chain may use `\begin{aligned}` (2, 0032).
2. **Long chains** are split into two consecutive `\[ ... \]` blocks, the second starting with `=` or `\equiv` (6 bodies: 0006, 0013, 0015, 0016, 0036, app), or aligned on `&=` (0004, 0032, 0036).
3. **Punctuation inside displays.** 69 of 130 displays end with a period and 31 with a comma. After a comma the sentence goes on in lowercase on the next line (30 of 31; the other comma-ended display is followed by a second display).
4. **Introducing a display:** a colon (68 of 130), or the clause runs straight in (41).
5. **Inline math.** `\( ... \)` 418 times, `$...$` 207 times. `\( ... \)` has a space inside the delimiters in 341 of 418 cases (`\( a_n \)`); `$...$` never has one (0 of 207: `$n\geq 2$`). 10 bodies mix both, sometimes in one sentence: `Since \( \alpha(X) \neq 0 \) and $\mathbb{F}_{2}[[X]]$ is a domain as $\mathbb{F}_{2}$ is a domain, we must obtain:` (0005).
6. **Paragraph separator:** a line holding only `\\\\` (35 in 17).
7. **Delimiter sizing.** `\left ... \right` 288 times in 16 bodies, even around one symbol: `\log_2\left(2\right)` (0024), `\dim\left(E\right)` (app). None in 9 bodies (0001, 0003, 0004, 0005, 0013, 0043, 0048, 0054, 0058). `\big` once (app); `\Big` and `\bigl`: 0.
8. **Commands.** `\frac` only (151; `\dfrac`, `\tfrac`, `\displaystyle`: 0). `\leq` 66, `\geq` 27, `\neq` 11 (`\le`, `\ge`, `\ne`: 0). `\dots` 7, `\cdots` 3 (0016), `\ldots` 4 (0043, 0048). `:=` 14 (`\coloneqq`: 0). `\cdot` 53 in 11. `\quad` 21 in 7, between formulas on one display line: `N = 121 + 100|z|^2 + 220 \Im z, \quad D = 100 + 121|z|^2 + 220 \Im z,` (0003).
9. **Operator names.** `\operatorname{...}` (15 in 4: Im, tr, diag, ran) and `\mathrm{...}` (35 in 4: Stab, Orb, tr, ran, Mat, GL, Aut, Ens, d) are both used. Built-in commands otherwise: `\ker`, `\dim`, `\det`, `\ln`, `\log_2`, `\Im`, `\lim`.
10. **Equation numbers.** `\label`, `\tag` and `\eqref` occur 3 times each, all in 0036. Elsewhere an earlier formula is named in words: "Dividing the second equation by the first, we obtain" (0022); `Using the defining relation for \( f(\lambda) \), we see that for $\lambda \geq 1$:` (0013).
11. **Text commands.** `\textbf` (11 in 4) and `\textit` (4 in 3) serve only as labels; `\emph`: 0. `\href` 2 times, for an outside definition: `\href{https://en.wikipedia.org/wiki/Dense_order}{dense order}` (0047). `\footnote` 2 times (0036, app), for a side construction. `\appendixref` once (0018). `\textcolor` 90 times, only in 0032.
12. **Lists.** `enumerate` 3 times (the parts of 0004, the steps of 0043, the theorem of app), `itemize` once (0005).
13. **Hyphen after math.** A compound with a math prefix keeps the hyphen outside the math (28 in 6): `$\mathbb{F}_{2}$-vector space` (0018), `an $n^2$-dimensional space` (0004), `\( \mathbb{R} \)-linear` (0042). 0018 twice puts it inside the math (`$\mathbb{F}_2-$subspace`); do not copy that.
14. **Source layout.** Prose lines are not wrapped (0). The body is indented by 4 spaces in 3 bodies (0001, 0003, 0016) and inside the enumerate of 0004 and 0043; the other bodies start at column 0.
15. **Characters.** Apostrophes are ASCII 7 times (`Bezout's`, `Rolle's`) and curly 5 times (`Vieta’s`, `problem’s`). A result named after two people or two notions takes an en dash: "rank–nullity theorem" (app), "orbit–stabiliser theorem" (0036), "Cayley–Hamilton theorem" (0054). The LaTeX dashes `--` and `---`: 0.

## 8. Vocabulary

| Prefer | Count | Rather than | Example |
|---|---|---|---|
| "we have", "we obtain" | 30 in 16; 13 in 8 | "we get" (3), "we find" (1), "yields" (1) | `Plugging in $y=0$, we have $f(x)^2 = \frac{c^2}{2} + c$.` (0006) |
| "It is easy to see that", "it is clear that", "clearly", "trivially", "well known" | 3; 2; 6 in 5; 1; 1 | "obviously" (0) | `It is easy to see that $\langle \cdot, \cdot \rangle_{\mathbb{F}_2^n}$ is $\mathbb{F}_{2}$-bilinear` (0018) |
| "strictly" (increasing, decreasing, positive) | 12 in 5 | n/a | "is strictly positive as long as" (0029) |
| "bigger", "smaller" | 2; 1 | "greater" (1), "larger" (0) | `is certainly bigger than $0$` (0016) |
| "non-degenerate", "non-commutative", "non-decreasing", "non-empty" | 7; 6; 1; 1 | "non empty" (2, both in 0010) | "is non-decreasing on" (0028) |
| "Else" to open the remaining case | 3 | "Otherwise" (1, 0047) | `Else we have $f(x) = \pm 2$ for all $x$.` (0006) |
| "the given ..." to point back to a hypothesis | 6 in 5 | n/a | `By the given assumption, we have $L(F) = \alpha F$.` (0004) |
| "the equation from the statement", "the problem’s statement" | 3 (0017); 1 (0016) | "the claim" (0) | `The fact that \(x\) satisfies the equation from the statement translates to \(f(5) = f(6)\).` (0017) |
| "Plug in", "Plugging in", "plug" | 4 in 2 | "Substituting" (0) | `Plugging in $x=0$ in this gives $c^2=\frac{c^2}{2}+c$, hence $c=0$ or $c=2$.` (0006) |
| "without loss of generality", spelled out | 2 | "WLOG" (0) | `say (without loss of generality) \( \alpha_{n-1} \)` (0022) |
| "i.e.," | 8 in 7 | "e.g." (0), "resp." (0) | "i.e., the eigenvalues of the matrix" (0042) |
| "which is a contradiction", "a contradiction to our assumptions" | "contradiction" 7 in 5 | "absurd" (0) | "which is a contradiction." (0017) |
| "tight", "attained", "achieved" | 2; 1; 1 | "sharp" (0), "optimal" (0) | "Hence, the bound is attained." (0036) |
| "group morphism" | 2 (0024) | "homomorphism" (0) | "This suggests the need for a group morphism." (0024) |
| "standard binary product" | 2 (0018, app) | "dot product" (0) | "Define the standard binary product" (0018) |
| "as desired", "as required" | 3; 1 | "QED" (0) | `Take $a = 0$ and $c = 1$, then $a < b < c$ and $f(a), f(c) \leq f(b)$, as desired.` (0047) |
| "brute force (finitely many possibilities)" for a finite check left to the reader | 1 | n/a | "can then be explicitly found by brute force (finitely many possibilities)" (0022) |
| a named result with a lowercase "theorem" | 10 of 11 | "Theorem" (1) | "the orbit–stabiliser theorem gives:" (0036) |

- Phrasings shaped by French belong to the voice and may stay: "the equation from the statement" (0017), "composed uniquely of" (0018 statement), "applied on the non empty interval" (0010), "the affine function" (0017).
- Typos not to copy: "Lets make a simple analysis" (0017) and "lets take" (0018), for "Let us".
- Spelling varies between files; see section 11.

## 9. What the solutions do not do

Counts are over the 25 bodies unless stated.

- No "I", "my" or "me" (0).
- No copy of the statement at the start (0 of 24).
- No source, competition or book named inside a solution (0 hits for Putnam, IMO, IMC, Bernoulli, olympiad, competition, official, book).
- No end-of-proof mark: `\qed`, `\blacksquare`, `\square`, "QED" (0).
- No sectioning (`\section`, `\subsection`, `\paragraph`: 0). No "Answer:", "Claim:" or "Case 1" label (0).
- No lemma, claim or proof environment inside a solution (0).
- No macro definitions: `\newcommand` (0).
- No `\cite` (0): results are named in words.
- No `\emph` (0). No bold or italic for emphasis inside a sentence: all 15 uses of `\textbf` and `\textit` are labels.
- No `\dfrac`, `\tfrac`, `\displaystyle` (0). No `\le`, `\ge`, `\ne` (0). No `\iff`, `\Longrightarrow` (0). No `\varepsilon`, `\mathfrak`, `\overline` (0).
- No `cases` environment in a solution (0; one in the 0005 statement).
- No figures: `tikz`, `\includegraphics` (0).
- No contraction such as "n't" in a solution (0; one "doesn't" in the 0048 statement).
- No "obviously", "WLOG", "e.g.", "Finally", "Consequently", "In conclusion", "To sum up" (0 each).
- No LaTeX dash ligatures `--` or `---` (0). The em dash character occurs 4 times, all in 0036; do not use it.
- No prose wrapped at a fixed width (0).
- Each in one body only, so not part of the style: equation numbers (0036), coloured symbols (0032), boxed answers (0048), "Step" headings (0054).

## 10. Examples

Ten verbatim excerpts. Line numbers refer to the files on 2026-10-01; trailing spaces are removed.

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

- 0043: an enumerate of four steps with bold labels (`\item \textbf{Decomposing the Sum:}`), short imperatives ("Group terms by", "Split into two reindexed sums:"), no "we", no punctuation in its 5 displays, no closing sentence.
- 0048: chattier and partly impersonal ("One can easily construct a legal set", "That leaves proving that one cannot do better."), parts "(a)" and "(b)", two `\textit{Alternate solution}` paragraphs, the answer in `\boxed{67}`.
- 0054: `\textbf{Step 1.}` and `\textbf{Step 2.}` with blank lines, `\mathrm{Mat}_{n \times n}(\mathbb{C})`, `\mathbb{C}[x]`, `w^t`, no `\left`.
- 0058: a two-line sketch (55 words) that opens with a formula, says "by a simple derivative test" and has no display.

**Three registers inside the dominant group.** 0022, 0029 and 0036 mix the second with passages of the third.

- Terse computation with little prose, as in 0001, 0006 and 0010.
- Guided prose that announces each step, as in 0003, 0005, 0015, 0017, 0024 and 0036.
- Formal and set-theoretic, as in 0018, 0032, 0042, 0047 and app: quantifier formulas, subscripted neutral elements, structures as tuples, `\left ... \right` everywhere.

**Habits that vary from file to file.** Keep one choice within a solution.

| Habit | Variants |
|---|---|
| Inline math | only `$` in 6 bodies (0001, 0003, 0004, 0010, 0026, 0058); only `\(` in 9 (0024, 0028, 0029, 0032, 0036, 0042, 0043, 0048, 0054); both in 10 |
| Spelling | -ize in 0005 ("analyzing"), 0022 ("Summarizing") and 0024 ("recognize"); -ise in 0036 ("stabiliser", "centre", "realise") |
| Implication between displayed steps | `\implies` (0022, app), `\Rightarrow` (0036) |
| Equivalence | `\Longleftrightarrow` (app), `\Leftrightarrow` (0036), `\leftrightarrow` (0032) |
| Operator names | `\operatorname{tr}` (0029) and `\mathrm{tr}` (0042); `\operatorname{ran}` (0047) and `\mathrm{ran}` (0042) |
| Map arrows | `\to` (0006, 0047, 0054, app), `\rightarrow` (0013, 0015, 0042, app), `\longrightarrow` (0036), `\colon` (app) |
| Delimiter sizing | no `\left` in 9 bodies; 95 in app |
| Index base | from 0 in 0018, 0029 and app; from 1 in 0015 (`x_1 < \dots < x_n`), in the matrix entries of 0018 (`(a_{ij})_{1 \leq i, j \leq n}`) and in 0048 (`x_1, \ldots, x_m`) |
| Apostrophes | ASCII 7 times, curly 5 times; 0036 has both "Lagrange's" and "Lagrange’s" |
| Hyphenation | "non empty" and "non-empty" both in 0010; "finite dimensional" (0018, app) and "finite-dimensional" (0004) |
| Intervals | French brackets (12 in 5), parentheses once (`(5, 6)`, 0017) |
| Indentation | 4 spaces throughout in 3 bodies (0001, 0003, 0016); column 0 in the others, except inside lists |

**When unsure, choose the dominant form.**

1. `\( ... \)` with inner spaces for inline math (418 of the 625 inline formulas).
2. `\[ ... \]` on their own lines, punctuated.
3. A `\\\\` line between blocks.
4. "we", with "Thus,", "Hence,", "Therefore," and "Since ..., we have".
5. Justification inside the sentence: "since", "because", a parenthesis, or a named result with a lowercase "theorem".
6. Cases as "If" paragraphs; the remaining case opens with "Else".
7. The answer to a find-all problem as an explicit set, with "exactly".
8. French intervals and `+\infty`; `\leq` and `\geq`; neutral elements with a subscript.
9. A one-sentence ending.
10. No headings, no numbered equations, no end-of-proof mark.
