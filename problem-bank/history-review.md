# History review — problem bank

What the AI history pass (2026-09-22) changed in the problem headers, with its sources, and what you still
have to review. Set `history: human` in a problem's header once you accept its history. Delete this file when
every problem is reviewed.

Branch `problem-bank`, nothing committed.
Fields written: `origin`, `origin-date`, `origin-number`, `also-in`, `references`, and `history: ai` on all 80 problems.
Not touched: statements, solutions, titles, file names, area/methods, difficulty, review, taken-from.
`python3 -m bank.validate` prints "80 problem files, all good".

## How the values were obtained

- One research agent per source unit (58 units, 1–3 problems each), then an independent checker per unit that
  re-opened every cited page and dropped any value it could not confirm. When the checker changed a value, a second
  checker decided between the two (13 units).
- Then a manual review pass: merged the proposed slugs, restored three dropped club-source notes (0035, 0056, 0057),
  confirmed the eight Bernoulli problem numbers against the club's local solutions PDF
  (`inspiration/competitions/bernoulli/Bernoulli 2023-2024-2025-2026 Solutions.pdf`), cleared one misplaced number (0056).
- **Limit:** the account's web-search quota (200 searches) ran out during the checker phase. The checkers still
  re-opened every cited URL, but for these 63 problems the checker could not run its own search for an
  *older* source than the one proposed (the researcher's searches still apply):
  0001, 0002, 0003, 0004, 0006, 0007, 0008, 0009, 0011, 0012, 0013, 0014, 0015, 0016, 0018, 0019, 0021, 0022, 0023, 0024, 0027, 0028, 0029, 0030, 0033, 0035, 0036, 0037, 0038, 0039, 0041, 0042, 0043, 0044, 0046, 0047, 0048, 0050, 0052, 0053, 0054, 0055, 0057, 0058, 0059, 0060, 0061, 0062, 0063, 0064, 0068, 0069, 0070, 0071, 0072, 0073, 0074, 0075, 0076, 0077, 0078, 0079, 0080.
- Confidence (checker): high 52, medium 25, low 3
  (low: 0015, 0053, 0061).

## Known doubts — resolved

- **0001** — not IMO 1956 (there was none): IMO 1959 Problem 1, official PDF imo-official.org.
- **0010 / 0017** — both labels "Putnam and Beyond, Example p. 140" are correct: two worked Examples on p. 140
  (1st ed., Sect. 3.2.5). First appearances: 0010 D. Andrica, Revista Matematică Timișoara 1989, Problem 6143
  (attribution printed in Andreescu–Andrica, *360 Problems*; the RMT issue is not online); 0017 Romanian NMO 1984,
  grade XI, Problem 3 (original paper opened).
- **0057** — first appearance is Putnam 1971 A6. Bernoulli 2025 Problem 1 is a re-use (confirmed in the club PDF);
  Hongler's 2021 Analysis I lecture is where the club saw it (kept as "Club source").
- **0069** — not Putnam 1984 B3 (that is the binary-operation problem): Putnam 1982 B3.
- **0062** — not the AMM: *The Pentagon* (Kappa Mu Epsilon), Spring 2023, Problem 922, proposer T. P. Sharma.
- Other doubts from the migration report: 0002 1st All-Russian 1961 P5 confirmed; 0014 IMC 2014 Day 1 P4; 0018 Sutner 1988;
  0025 part 2 = IMO 2007 P5 (also-in imo); 0031 "BMO 2005" = British MO Round 2 2005 P1, "AMC 12 2012" = AMC 12B 2007
  P23; 0035 USAMO 2009 P6; 0038 Monge 1799; 0039 IMO Shortlist 1981 #18; 0040 Tournament of Towns Fall 2014;
  0046 Moscow MO 1949; 0047 the official IMC 2024 P6 *is* the bank's statement (the doubt was wrong); 0049 Makarov et al.
  1992, X.1.2; 0058/0059 Bulgarian Autumn 2023; 0063/0064 are ICMC 2025 Round 2 Problems 3 and 4 (not 1 and 2);
  0065 IMO 2025 P5; 0066/0067 Levi's book is *The Mathematical Mechanic* (club source), origins are Fermat / Apollonius.

## New origin slugs added to tags.yml

`romania-nmo`, `imo-shortlist`, `tournament-of-towns`, `moscow-mo`, `historical` (kind book: treatises, letters —
0034 Bernoulli–Goldbach 1728, 0066 Fermat, 0067 Apollonius), `paper` (kind journal: research article, because
`journal` is described as "problem section" — 0005, 0016, 0018, 0030, 0036).

## Still unknown

- **No origin:** 0015 (9^x+4^x+2^x = 8^x+6^x+1) — nothing found; not in Putnam and Beyond (full text grepped).
- **Origin without a date:** 0013 (Gazeta Matematică, proposer I. Tomescu, year/number not found), 0019, 0032, 0037,
  0048, 0052, 0053, 0060, 0061 (folklore), 0066, 0067 (historical, pre-modern).

## Established names found — NOT applied (title and file name unchanged)

| ID | current title | established name | source |
|---|---|---|---|
| 0005 | Formal power series over F2 | Baum–Sweet sequence | https://mathworld.wolfram.com/Baum-SweetSequence.html |
| 0018 | All-ones vector in the image | Sutner's theorem | https://arxiv.org/pdf/2605.11056 |
| 0030 | Finite order matrices congruent to identity | Minkowski's lemma | https://arxiv.org/pdf/1011.0346 |
| 0032 | Jacobson's lemma on invertibility | Jacobson's lemma | https://arxiv.org/pdf/1702.06271 |
| 0036 | Commuting probability of finite groups | 5/8 theorem | https://en.wikipedia.org/wiki/Commuting_probability |
| 0052 | Darboux-Picard injectivity theorem | Darboux-Picard theorem | https://arxiv.org/pdf/1409.5977 |
| 0055 | Prisoners and the light bulb | 100 prisoners and a light bulb | https://www.cut-the-knot.org/Probability/LightBulbs.shtml |
| 0066 | Fermat point of a triangle | Fermat point | https://en.wikipedia.org/wiki/Fermat_point |
| 0070 | Polynomial machine with two queries | Perplexing polynomial puzzle | https://repository.uantwerpen.be/docstore/d:irua:19549 |

## Questions for the maintainer

1. **Titles**: apply which of the names above? (each = title line + `mv` of the file, number kept.)
2. **Convention "first appearance of the result" vs "first time posed as a problem"**: the pass uses the result's
   paper when the statement *is* the published theorem (0005 Baum–Sweet 1976 / Putnam 1989 A6; 0016 Ivić–Mijajlović
   1995 / Bernoulli 2023 P2; 0018 Sutner 1988 / Bernoulli 2023 P3; 0030 Minkowski 1887 / Bernoulli 2024 P4; 0036
   Gustafson 1973) and the competition when it is only a special case of a theorem (0080 Bulgaria 2024 P5, special case
   of Frankl 1983). OK, or switch to competitions-first?
3. **New slugs** `paper` and `historical`: keep, or rather widen the `journal` description / use `book`? (0038 Monge
   1799 stayed `book`.)
4. **Folklore vs first verified appearance**: 0053 (only verified source: Vakil's Stanford Putnam masterclass,
   17 Nov 2003 — use `course` with that date?), 0048 (double-free sets, Wang 1989 not opened), 0045 (Clifford–Preston
   1961 book kept as origin; or folklore?), 0055 (folklore, earliest opened: Wu :: riddles 2002).
5. **0019**: the earliest record is your own MSE post (2025-04-01). Does your friend remember where it came from?
6. **0031** (collection): origin = first part (AMC 12B 2007 P23) or earliest part (AIME 1998 P14)?
7. **0010**: RMT year 1989 comes from a printed attribution; the same book dates RMT problem 6191 to 1987, so 1989 may
   be a misprint. Anyone with access to RMT?
8. **0020**: origin = Cover 1987 "Pick the largest number" (the randomized-switching version, which is the club's
   question) or the envelope paradox itself (Kraitchik 1953 / folklore)?
9. **taken-from** (outside this pass): the club sources are kept in references as "Club source: …" (Sudakov &
   Milojević 0035/0038/0039/0040; Hongler 0046/0051/0052/0056/0057; Wu 0032/0055; Levi 0066/0067; Vakil 0053).
   Move them to taken-from?
10. **Older-source searches**: re-run a search-only pass for the 63 problems listed above once the search
    quota resets?
11. **0025** holds two separate IMO problems (1988 P6 and 2007 P5): split into two files?

## Content issues

Moved to [`known-errors.md`](known-errors.md).

## Change table (old → new)

`history: none → ai` on all 80 files is not listed. References are truncated here; full text is in the files.
The URL column is the page the checker opened for that field (for references: the first cited URL).

| ID | field | old → new | reference | confidence |
|---|---|---|---|---|
| 0001 | origin-date | 1956 → 1959-07 | https://www.imo-official.org/editions/1959/ | high |
| 0001 | references | (empty) → IMO 1959 (1st IMO, Braşov, Romania, 21-31 July 1959), Problem 1, official English problem PDF - https://www.im… | https://www.imo-official.org/assets/documents/problems/1959/1959_eng.pdf | high |
| 0002 | references | (empty) → 1st All-Russian (All-Union) Mathematical Olympiad, Moscow 1961, Problem 5 (part a on the form-8 paper, part b… | https://olympiads.win.tue.nl/imo/soviet/RusMath.html | high |
| 0003 | origin-date | 1989 → 1989-12-02 | https://kskedlaya.org/putnam-archive/1989.pdf | high |
| 0003 | also-in | (empty) → book | https://assets.zyrosite.com/A1aw0O5jRBiVrR9D/complex-numbers-from-a-to-...-z-titu-andreescu-dorin-andri-dOqanMz8z3hx1Q5n.pdf | high |
| 0003 | references | (empty) → Putnam 1989, A3 (exam of 2 Dec 1989) - https://kskedlaya.org/putnam-archive/1989.pdf; Kalva archive (statement… | https://kskedlaya.org/putnam-archive/1989.pdf | high |
| 0004 | origin-date | 1994 → 1994-07-29 | https://www.imc-math.org.uk/imc1994/prob_sol.pdf | medium |
| 0004 | origin-number | 4 → Day 1, Problem 4 | https://www.imc-math.org.uk/imc1994/prob_sol.pdf | medium |
| 0004 | references | (empty) → IMC 1994 (1st IMC, Plovdiv), Day 1, Problem 4, official problems & solutions - https://www.imc-math.org.uk/imc… | https://www.imc-math.org.uk/imc1994/prob_sol.pdf | medium |
| 0005 | origin | putnam → paper | https://en.wikipedia.org/wiki/Baum%E2%80%93Sweet_sequence | medium |
| 0005 | origin-date | 1989 → 1976-05 | https://api.crossref.org/works/10.2307/1970953 | medium |
| 0005 | origin-number | A6 → Remark following Theorem 2, p. 598 | https://en.wikipedia.org/wiki/Baum%E2%80%93Sweet_sequence | medium |
| 0005 | also-in | (empty) → putnam | https://kskedlaya.org/putnam-archive/1989.pdf | medium |
| 0005 | references | (empty) → First appearance: L. E. Baum, M. M. Sweet, Continued Fractions of Algebraic Power Series in Characteristic 2,… | https://api.crossref.org/works/10.2307/1970953 | medium |
| 0006 | origin-date | 2018 → 2018-06-27 | https://web.archive.org/web/20220901163539/http://africamathunion.org/PAMO_2018_Problems_En.pdf | high |
| 0006 | references | (empty) → Pan African MO (PAMO) 2018, 26th edition, Nairobi, Day 1 (27 June 2018), Problem 1 - official paper from the f… | https://web.archive.org/web/20220901163539/http://africamathunion.org/PAMO_2018_Problems_En.pdf | high |
| 0007 | origin-date | 2012 → 2012-07-29 | https://www.imc-math.org.uk/imc2012/IMC2012-day2-solutions.pdf | high |
| 0007 | origin-number | B2 → Day 2, Problem 2 | https://www.imc-math.org.uk/imc2012/IMC2012-day2-solutions.pdf | high |
| 0007 | references | (empty) → IMC 2012 (19th IMC, Blagoevgrad, Bulgaria), Day 2 (29 July 2012), Problem 2, proposed by Christophe Debry (KU… | https://www.imc-math.org.uk/imc2012/IMC2012-day2-questions.pdf | high |
| 0008 | origin-date | 2018 → 2018-06-28 | https://web.archive.org/web/20220901163539/http://africamathunion.org/PAMO_2018_Problems_En.pdf | high |
| 0008 | references | (empty) → Pan African MO (PAMO) 2018, 26th edition, Nairobi, Day 2 (28 June 2018), Problem 5 - official paper from the f… | https://web.archive.org/web/20220901163539/http://africamathunion.org/PAMO_2018_Problems_En.pdf | high |
| 0009 | origin-date | 2019 → 2019-03 | https://almaty.fizmat.kz/ru/news/aziatsko-tikhookeanskaya-matematichesk/ | high |
| 0009 | references | (empty) → Silk Road Mathematical Competition (XVIII, 2019), Problem 3, author K. Satylkhanov (Сатылханов К.) - https://m… | https://matol.kz/olympiads/904 | high |
| 0010 | origin | book → journal | https://archive.org/download/360ProblemsForMathematicalContestsAndreescu/360%20Problems%20for%20Mathematical%20Contests%20%5BAndreescu%5D%20_djvu.txt | medium |
| 0010 | origin-date | (empty) → 1989 | https://archive.org/download/360ProblemsForMathematicalContestsAndreescu/360%20Problems%20for%20Mathematical%20Contests%20%5BAndreescu%5D%20_djvu.txt | medium |
| 0010 | origin-number | Example p. 140 → Problem 6143 | https://archive.org/download/360ProblemsForMathematicalContestsAndreescu/360%20Problems%20for%20Mathematical%20Contests%20%5BAndreescu%5D%20_djvu.txt | medium |
| 0010 | also-in | (empty) → book, course | https://mathematicalolympiads.files.wordpress.com/2012/08/putnam-and-beyond.pdf | medium |
| 0010 | references | Putnam and Beyond, Example p. 140 → D. Andrica, Revista Matematică Timișoara (RMT), No. 1-2 (1989), p. 67, Problem 6143 (attribution printed in An… | https://archive.org/download/360ProblemsForMathematicalContestsAndreescu/360%20Problems%20for%20Mathematical%20Contests%20%5BAndreescu%5D%20_djvu.txt | medium |
| 0011 | origin-date | 2011 → 2011-07-30 | https://www.imc-math.org.uk/imc2011/imc2011-day1-solutions.pdf | high |
| 0011 | origin-number | A2 → Day 1, Problem 2 | https://www.imc-math.org.uk/imc2011/imc2011-day1-solutions.pdf | high |
| 0011 | also-in | (empty) → course | https://web.archive.org/web/20240630003258id_/https://warwick.ac.uk/fac/sci/maths/research/events/seminars/areas/imc/2022-23/imc_linear_algebra.pdf | high |
| 0011 | references | (empty) → IMC 2011 (18th IMC, Blagoevgrad), Day 1, Problem 2, proposed by Moubinool Omarjee (Paris); official problems a… | https://www.imc-math.org.uk/imc2011/imc2011-day1-solutions.pdf | high |
| 0012 | origin-date | 2014 → 2014-08-01 | https://www.imc-math.org.uk/imc2014/IMC2014-day2-solutions.pdf | high |
| 0012 | origin-number | B2 → Day 2, Problem 2 | https://www.imc-math.org.uk/imc2014/IMC2014-day2-questions.pdf | high |
| 0012 | references | (empty) → IMC 2014 (21st IMC, Blagoevgrad), Day 2, Problem 2, proposed by Martin Niepel (Comenius University, Bratislava… | https://www.imc-math.org.uk/?year=2014&item=problems | high |
| 0013 | origin | book → journal | https://mathematicalolympiads.files.wordpress.com/2012/08/putnam-and-beyond.pdf | medium |
| 0013 | origin-number | 414 → (empty) | https://mathematicalolympiads.files.wordpress.com/2012/08/putnam-and-beyond.pdf | medium |
| 0013 | also-in | (empty) → book | https://mathematicalolympiads.files.wordpress.com/2012/08/putnam-and-beyond.pdf | medium |
| 0013 | references | Putnam and Beyond, Problem 414 → Gazeta Matematica (Bucharest), proposed by I. Tomescu, issue/year/number not identified (credited in the book'… | https://books.google.ch/books/about/Putnam_and_Beyond.html?id=eqnUG85ZIJMC | medium |
| 0014 | origin-date | 2014 → 2014-07-31 | https://www.imc-math.org.uk/imc2014/IMC2014-day1-solutions.pdf | high |
| 0014 | origin-number | A4 → Day 1, Problem 4 | https://www.imc-math.org.uk/imc2014/IMC2014-day1-questions.pdf | high |
| 0014 | references | (empty) → IMC 2014 (21st IMC, Blagoevgrad), Day 1, Problem 4, proposed by Javier Rodrigo (Universidad Pontificia Comilla… | https://www.imc-math.org.uk/?year=2014&item=problems | high |
| 0015 | references | (empty) → Method background (the rule of signs for exponential sums, which the solution's Rolle argument re-proves): G.J… | https://www.maths.lancs.ac.uk/~jameson/zeros.pdf | low |
| 0016 | origin | bernoulli → paper | https://arxiv.org/pdf/math/0312202 | medium |
| 0016 | origin-date | 2023 → 1995 | https://arxiv.org/pdf/math/0312202 | medium |
| 0016 | origin-number | 2 → (empty) | https://arxiv.org/pdf/math/0312202 | medium |
| 0016 | also-in | (empty) → bernoulli | https://memento.epfl.ch/event/bernoulli-competition-2023 | medium |
| 0016 | references | (empty) → Earliest opened appearance of the statement (as a lemma of the Kurepa left-factorial literature, !p = 0!+1!+..… | https://arxiv.org/pdf/math/0312202 | medium |
| 0017 | origin | book → romania-nmo | https://examenemate.wordpress.com/wp-content/uploads/2018/10/1984_nat_lic.pdf | high |
| 0017 | origin-date | (empty) → 1984 | https://examenemate.wordpress.com/wp-content/uploads/2018/10/1984_nat_lic.pdf | high |
| 0017 | origin-number | Example p. 140 → 11.3 | https://examenemate.wordpress.com/wp-content/uploads/2018/10/1984_nat_lic.pdf | high |
| 0017 | also-in | (empty) → book | https://mathematicalolympiads.files.wordpress.com/2012/08/putnam-and-beyond.pdf | high |
| 0017 | references | Putnam and Beyond, Example p. 140 → Romanian National Mathematical Olympiad (Olimpiada Națională de Matematică), final round (etapa națională) 198… | https://examenemate.wordpress.com/wp-content/uploads/2018/10/1984_nat_lic.pdf | high |
| 0018 | origin | bernoulli → paper | https://content.wolfram.com/sites/13/2018/02/02-1-1.pdf | high |
| 0018 | origin-date | 2023 → 1988 | https://content.wolfram.com/sites/13/2018/02/02-1-1.pdf | high |
| 0018 | origin-number | 3 → (empty) | https://content.wolfram.com/sites/13/2018/02/02-1-1.pdf | high |
| 0018 | also-in | (empty) → bernoulli | https://memento.epfl.ch/event/bernoulli-competition-2023 | high |
| 0018 | references | (empty) → K. Sutner, On σ-automata, Complex Systems 2 (1988) 1-28: 'the all-ones configuration 1 always has a predecesso… | https://content.wolfram.com/sites/13/2018/02/02-1-1.pdf | high |
| 0019 | origin | (empty) → folklore | https://math.stackexchange.com/questions/5051989/solve-the-differential-equation-f-f-f-circ-f | medium |
| 0019 | references | (empty) → Mathematics Stack Exchange, question 5051989 'Solve the differential equation f'=f/(f∘f)', posted 2025-04-01 b… | https://math.stackexchange.com/questions/5051989/solve-the-differential-equation-f-f-f-circ-f | medium |
| 0020 | origin | (empty) → book | https://isl.stanford.edu/~cover/papers/paper73.pdf | high |
| 0020 | origin-date | (empty) → 1987 | https://api.crossref.org/works/10.1007/978-1-4612-4808-8_43 | high |
| 0020 | origin-number | (empty) → Problem 5.1, p. 152 | https://isl.stanford.edu/~cover/papers/paper73.pdf | high |
| 0020 | also-in | (empty) → journal | https://web.archive.org/web/20170705165407/http://rspa.royalsocietypublishing.org/content/royprsa/early/2009/07/31/rspa.2009.0312.full.pdf | high |
| 0020 | references | (empty) → T. M. Cover, 'Pick the largest number', Problem 5.1, p. 152, in T. Cover & B. Gopinath (eds.), Open Problems i… | https://isl.stanford.edu/~cover/papers/paper73.pdf | high |
| 0021 | origin-date | 2018 → 2018-07-24 | https://www.imc-math.org.uk/imc2018/imc2018-day1-questions.pdf | high |
| 0021 | origin-number | A3 → Day 1, Problem 3 | https://www.imc-math.org.uk/imc2018/imc2018-day1-questions.pdf | high |
| 0021 | references | (empty) → IMC 2018 (Blagoevgrad), Day 1, Problem 3, proposed by Daniël Kroes (University of California, San Diego) - htt… | https://imc-math.org.uk/?item=prob3s&section=problems&year=2018 | high |
| 0022 | origin-date | 2005 → 2005-07 | https://www.imc-math.org.uk/imc2005/day1_solutions.pdf | high |
| 0022 | origin-number | A4 → Day 1, Problem 4 | https://www.imc-math.org.uk/imc2005/day1_solutions.pdf | high |
| 0022 | references | (empty) → IMC 2005 (12th IMC, Blagoevgrad, 22-28 July 2005), First Day, Problem 4, official problems & solutions - https… | https://www.imc-math.org.uk/imc2005/day1_solutions.pdf | high |
| 0023 | origin-date | 2005 → 2005-07 | https://www.imc-math.org.uk/imc2005/day1_solutions.pdf | high |
| 0023 | origin-number | A6 → Day 1, Problem 6 | https://www.imc-math.org.uk/imc2005/day1_solutions.pdf | high |
| 0023 | references | (empty) → IMC 2005 (12th IMC, Blagoevgrad, 22-28 July 2005), First Day, Problem 6, official problems & solutions - https… | https://www.imc-math.org.uk/imc2005/day1_solutions.pdf | high |
| 0024 | origin-date | 2023 → 2023-08-03 | https://www.imc-math.org.uk/imc2023/imc2023-day2-questions.pdf | high |
| 0024 | origin-number | B1 → Day 2, Problem 6 | https://www.imc-math.org.uk/?year=2023&section=problems&item=prob6q | high |
| 0024 | references | (empty) → IMC 2023, Day 2, Problem 6, proposed by Alex Avdiushenko (Neapolis University Paphos, Cyprus) - https://www.im… | https://www.imc-math.org.uk/?year=2023&section=problems&item=prob6q | high |
| 0025 | origin-date | 1988 → 1988-07-16 | https://imomath.com/othercomp/I/Imo1988.pdf | high |
| 0025 | also-in | (empty) → imo | https://www.imo-official.org/assets/documents/problems/2007/2007_eng.pdf | high |
| 0025 | references | Kevin Buzzard & Edward Crane → Part 1: IMO 1988 Problem 6 (Day II, 16 July 1988, Canberra), proposed by Stephan Beck (West Germany). Sources:… | https://www.imo-official.org/assets/documents/problems/1988/1988_eng.pdf | high |
| 0026 | origin-date | 2015 → 2015-07-29 | https://www.imc-math.org.uk/imc2015/imc2015-day1-questions.pdf | high |
| 0026 | origin-number | A3 → Day 1, Problem 3 | https://www.imc-math.org.uk/imc2015/imc2015-day1-questions.pdf | high |
| 0026 | references | (empty) → IMC 2015 (Blagoevgrad), Day 1, Problem 3, proposed by Gerhard Woeginger (Eindhoven University of Technology) -… | https://www.imc-math.org.uk/?year=2015&section=problems&item=prob3q | high |
| 0027 | origin-number | A2 → Day 1, Problem 2 | https://www.imc-math.org.uk/imc1999/prob_sol1.pdf | medium |
| 0027 | also-in | (empty) → book | http://users.uoa.gr/~dcheliotis/Andreescu%20T.%20Problems%20in%20Real%20Analysis%20-%20Advanced%20Calculus%20on%20the%20Real%20Axis%20(Springer%202009).pdf | medium |
| 0027 | references | (empty) → IMC 1999 (6th IMC, Keszthely), Day 1, Problem 2, official problems and solutions - https://www.imc-math.org.uk… | https://www.imc-math.org.uk/imc1999/prob_sol1.pdf | medium |
| 0028 | origin-date | 1994 → 1994-07-29 | https://www.imc-math.org.uk/imc1994/prob_sol.pdf | high |
| 0028 | origin-number | 2 → Day 1, Problem 2 | https://www.imc-math.org.uk/imc1994/prob_sol.pdf | high |
| 0028 | references | (empty) → IMC 1994 (1st IMC, Plovdiv), Day 1, Problem 2, official problems & solutions - https://www.imc-math.org.uk/imc… | https://www.imc-math.org.uk/imc1994/prob_sol.pdf | high |
| 0029 | origin-date | 2005 → 2005-07 | https://www.imc-math.org.uk/imc2005/day2_solutions.pdf | high |
| 0029 | origin-number | B3 → Day 2, Problem 3 | https://www.imc-math.org.uk/imc2005/day2_solutions.pdf | high |
| 0029 | references | (empty) → IMC 2005 (12th IMC, Blagoevgrad, 22-28 July 2005), Second Day, Problem 3, official problems & solutions - http… | https://www.imc-math.org.uk/imc2005/day2_solutions.pdf | high |
| 0030 | origin | bernoulli → paper | https://archive.org/stream/gesammelteabhand00minkuoft/gesammelteabhand00minkuoft_djvu.txt | high |
| 0030 | origin-date | 2024 → 1887 | https://archive.org/stream/gesammelteabhand00minkuoft/gesammelteabhand00minkuoft_djvu.txt | high |
| 0030 | origin-number | 4 → §1 | https://archive.org/stream/gesammelteabhand00minkuoft/gesammelteabhand00minkuoft_djvu.txt | high |
| 0030 | also-in | (empty) → bernoulli | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/ | high |
| 0030 | references | (empty) → First appearance: H. Minkowski, Ueber den arithmetischen Begriff der Aequivalenz und über die endlichen Gruppe… | https://gdz.sub.uni-goettingen.de/download/pdf/PPN243919689_0100/LOG_0041.pdf | high |
| 0031 | origin-date | 2012 → 2007 | https://web.archive.org/web/20250819013230/https://artofproblemsolving.com/wiki/index.php/2007_AMC_12B_Problems/Problem_23 | high |
| 0031 | origin-number | (empty) → 12B-23 | https://web.archive.org/web/20250819013230/https://artofproblemsolving.com/wiki/index.php/2007_AMC_12B_Problems/Problem_23 | high |
| 0031 | also-in | aime, jbmo → aime, bmo-uk, jbmo | https://web.archive.org/web/20250819012412/https://artofproblemsolving.com/wiki/index.php/1998_AIME_Problems/Problem_14 | high |
| 0031 | references | AMC 12 (2012), AIME (1998), BMO (2005), JBMO (2003), AIME (2… → Collection taken from Eugenis, 'Simon's Favorite Factoring Trick' (handout, 31 May 2015), Challenge Problems 1… | https://studymath.github.io/assets/docs/SFFT.pdf | high |
| 0032 | origin | (empty) → folklore | https://marktomforde.com/academic/miscellaneous/images/Elements-Halmos.pdf | medium |
| 0032 | also-in | (empty) → book | https://archive.org/download/linear-algebra-hoffman-and-kunze/Linear%20Algebra%20-%20Hoffman%20and%20Kunze_djvu.txt | medium |
| 0032 | references | Wu-Riddles → Folklore: Jacobson's lemma (1-ab invertible iff 1-ba invertible in a unital ring), usually attributed to N. Ja… | https://arxiv.org/pdf/1411.7847) | medium |
| 0033 | origin | (empty) → folklore | https://web.archive.org/web/20250818025840/https://www.ocf.berkeley.edu/~wwu/cgi-bin/yabb/YaBB.cgi?board=riddles_hard;action=display;num=1028142186 | medium |
| 0033 | origin-date | (empty) → 2002 | https://web.archive.org/web/20021007223120/http://www.ocf.berkeley.edu/~wwu/riddles/hard.shtml | medium |
| 0033 | also-in | (empty) → course | http://math.stanford.edu/~vakil/putnam04/04mc7.pdf | medium |
| 0033 | references | (empty) → Linear version (integer start, integer velocity): wu::riddles (William Wu, UC Berkeley), hard riddles, 'Sink T… | https://web.archive.org/web/20021007223120/http://www.ocf.berkeley.edu/~wwu/riddles/hard.shtml | medium |
| 0034 | origin | putnam → historical | https://archive.org/download/bub_gb_P2ThmkmB-UkC/bub_gb_P2ThmkmB-UkC_djvu.txt | high |
| 0034 | origin-date | 1960 → 1728-06-29 | https://archive.org/download/bub_gb_P2ThmkmB-UkC/bub_gb_P2ThmkmB-UkC_djvu.txt | high |
| 0034 | origin-number | B1 → Lettre XXIX, p. 262 | https://archive.org/download/historyoftheoryo02dickuoft/historyoftheoryo02dickuoft_djvu.txt | high |
| 0034 | also-in | (empty) → book, putnam | https://archive.org/download/bub_gb_ryM0Kh6yLkwC/bub_gb_ryM0Kh6yLkwC_djvu.txt | high |
| 0034 | references | also Putnam 1961, Problem A1 → First known appearance: Daniel Bernoulli, letter to Goldbach, St Petersburg, 29 June 1728 (Lettre XXIX in P.-H… | https://archive.org/download/bub_gb_P2ThmkmB-UkC/bub_gb_P2ThmkmB-UkC_djvu.txt | high |
| 0035 | origin | (empty) → usamo | https://web.archive.org/web/20250904024022/https://artofproblemsolving.com/wiki/index.php/2009_USAMO_Problems/Problem_6 | high |
| 0035 | origin-date | (empty) → 2009 | https://web.evanchen.cc/exams/USAMO-2009-notes.pdf | high |
| 0035 | origin-number | (empty) → 6 | https://web.evanchen.cc/exams/USAMO-2009-notes.pdf | high |
| 0035 | references | Sudakov & Milojević → USAMO 2009, Problem 6 (proposed by Gabriel Carroll) - https://web.archive.org/web/20250904024022/https://artof… | https://web.archive.org/web/20250904024022/https://artofproblemsolving.com/wiki/index.php/2009_USAMO_Problems/Problem_6 | high |
| 0036 | origin | oral-exam → paper | https://www.math.uakron.edu/~hungnguyen/papers/paper13.pdf | medium |
| 0036 | origin-date | (empty) → 1973-11 | https://api.crossref.org/works/10.1080/00029890.1973.11993437 | medium |
| 0036 | references | X-ENS orals → W. H. Gustafson, 'What is the probability that two group elements commute?', Amer. Math. Monthly 80(9) (Nov. 1… | https://api.crossref.org/works/10.1080/00029890.1973.11993437 | medium |
| 0037 | origin | book → folklore | https://arxiv.org/pdf/1202.5319 | medium |
| 0037 | also-in | (empty) → book | https://analysis.spbu.ru/bib_r.html | medium |
| 0037 | references | Selected Problems in Real Analysis → Classical result (every bijection of any set is a composition of two involutions). B. M. Makarov, M. G. Goluzi… | https://analysis.spbu.ru/bib_r.html | medium |
| 0038 | origin | (empty) → book | https://archive.org/stream/bub_gb_Tg-L1dslDaUC/bub_gb_Tg-L1dslDaUC_djvu.txt | medium |
| 0038 | origin-date | (empty) → 1799 | https://en.wikipedia.org/wiki/Gaspard_Monge | medium |
| 0038 | origin-number | (empty) → Art. 44, pp. 54-55 | https://archive.org/stream/jstor-2972054/2972054_djvu.txt | medium |
| 0038 | references | Sudakov & Milojević → G. Monge, Géométrie descriptive. Leçons données aux Écoles normales, l'an 3 de la République, Paris: Baudouin,… | https://archive.org/details/bub_gb_Tg-L1dslDaUC | medium |
| 0039 | origin | (empty) → imo-shortlist | https://archive.org/stream/compendium_201807/compendium_djvu.txt | high |
| 0039 | origin-date | (empty) → 1981 | https://archive.org/stream/compendium_201807/compendium_djvu.txt | high |
| 0039 | origin-number | (empty) → 18 | https://archive.org/stream/compendium_201807/compendium_djvu.txt | high |
| 0039 | also-in | (empty) → book | https://archive.org/stream/X87QHX87XQSH8XQ8HHXQSH8HQH8Q8H/Razvan%20Gelca,%20Titu%20Andreescu-Putnam%20and%20beyond-Springer%20(2007)_djvu.txt | high |
| 0039 | references | Sudakov & Milojević → IMO Shortlist 1981, Problem 18 (USSR), The IMO Compendium, Section 3.22.2 (Kalva numbers it 11) - https://arch… | https://archive.org/stream/compendium_201807/compendium_djvu.txt | high |
| 0040 | origin | (empty) → tournament-of-towns | https://www.turgor.ru/problems/36/index.php | high |
| 0040 | origin-date | (empty) → 2014-10-12 | https://www.turgor.ru/problems/36/index.php | high |
| 0040 | origin-number | (empty) → Fall, Senior O-Level, Problem 5 | https://www.math.toronto.edu/oz/turgor/archives/TT2014F_SOproblems.pdf | high |
| 0040 | references | Sudakov & Milojević → Tournament of Towns, 36th tournament, Fall 2014 (12 Oct 2014), grades 10-11 basic variant (Senior O-Level), Pr… | https://www.turgor.ru/problems/36/index.php | high |
| 0041 | origin-number | (empty) → Day 3, Problem 3 | https://web.archive.org/web/20260829190657/https://artofproblemsolving.com/downloads/printable_post_collections/4453 | high |
| 0041 | references | (empty) → Romania IMO Team Selection Test 1998, Day (Test) 3, Problem 3, proposed by Marius Cavachi - https://artofprobl… | https://artofproblemsolving.com/downloads/printable_post_collections/4453 | high |
| 0042 | origin-date | 1985 → 1985-12-07 | https://kskedlaya.org/putnam-archive/1985.pdf | high |
| 0042 | references | (empty) → 46th Putnam, 7 December 1985, Problem B6 - https://kskedlaya.org/putnam-archive/1985.pdf; solution in Kalva (J… | https://kskedlaya.org/putnam-archive/1985.pdf | high |
| 0043 | origin-date | 2001 → 2001-12-01 | https://kskedlaya.org/putnam-archive/2001.pdf | high |
| 0043 | references | (empty) → 62nd Putnam 2001 (Saturday, December 1, 2001), B3 - https://kskedlaya.org/putnam-archive/2001.pdf; solutions b… | https://kskedlaya.org/putnam-archive/2001.pdf | high |
| 0044 | origin-date | 2024 → 2024-06-03 | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/ | medium |
| 0044 | references | (empty) → Bernoulli Competition (EPFL Bernoulli Center), 3 June 2024, Problem 3 (checked in the club's copy of the offic… | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/ | medium |
| 0045 | origin | (empty) → book | https://www.google.com/books/feeds/volumes?q=%22Every+cancellative+periodic+semigroup+is+a+group%22&max-results=20 | medium |
| 0045 | origin-date | (empty) → 1961 | https://www.google.com/books/feeds/volumes?q=%22Every+cancellative+periodic+semigroup+is+a+group%22&max-results=20 | medium |
| 0045 | origin-number | (empty) → Exercise 6(c), Section 1.7 | https://www.google.com/books/feeds/volumes?q=%22A+periodic+semigroup+S+is+a+union+of+groups%22&max-results=20 | medium |
| 0045 | also-in | (empty) → putnam | https://kskedlaya.org/putnam-archive/1989.pdf | medium |
| 0045 | references | (empty) → A.H. Clifford & G.B. Preston, The Algebraic Theory of Semigroups, Vol. I (AMS Mathematical Surveys 7), 1961, S… | https://www.google.com/books/feeds/volumes?q=%22Every+cancellative+periodic+semigroup+is+a+group%22&max-results=20 | medium |
| 0046 | origin | (empty) → moscow-mo | https://old.mccme.ru/free-books/olymp/mmo-35-57.pdf | high |
| 0046 | origin-date | (empty) → 1949 | https://old.mccme.ru/free-books/olymp/mmo-35-57.pdf | high |
| 0046 | origin-number | (empty) → Round 2, Grades 7-8, Problem 3 | https://old.mccme.ru/free-books/olymp/mmo-35-57.pdf | high |
| 0046 | also-in | (empty) → putnam, book | https://prase.cz/kalva/putnam/psoln/psol737.html | high |
| 0046 | references | legacy note: came from a discussion with Clement Hongler in… → Moscow Mathematical Olympiad 1949 (XII), Round 2, Grades 7-8, Problem 3, also set as Grades 9-10, Problem 3 (1… | https://old.mccme.ru/free-books/olymp/mmo-35-57.pdf | high |
| 0047 | origin-date | 2024 → 2024-08-08 | https://www.imc-math.org.uk/imc2024/imc2024-day2-questions.pdf | high |
| 0047 | origin-number | B6 → Day 2, Problem 6 | https://www.imc-math.org.uk/?year=2024&section=problems&item=prob6q | high |
| 0047 | references | (empty) → IMC 2024, Second Day (August 8, 2024), Problem 6, proposed by Mehdi Golafshan & Markus A. Whiteland (Universit… | https://www.imc-math.org.uk/?year=2024&section=problems&item=prob6q | high |
| 0048 | origin | bernoulli → folklore | https://oeis.org/A050292 | medium |
| 0048 | origin-date | 2023 → (empty) | https://oeis.org/A050292 | medium |
| 0048 | origin-number | 1 → (empty) | https://oeis.org/A050292 | medium |
| 0048 | also-in | (empty) → bernoulli | https://memento.epfl.ch/event/bernoulli-competition-2023 | medium |
| 0048 | references | (empty) → Part (b) is the classical 'double-free set' problem: E. T. H. Wang, On double-free sets of integers, Ars Combi… | https://oeis.org/A050292 | medium |
| 0049 | origin | (empty) → book | https://vdoc.pub/documents/selected-problems-in-real-analysis-6tffcklec310 | medium |
| 0049 | origin-date | (empty) → 1992 | https://analysis.spbu.ru/bib_r.html | medium |
| 0049 | origin-number | (empty) → Problem X.1.2 | https://vdoc.pub/documents/selected-problems-in-real-analysis-6tffcklec310 | medium |
| 0049 | references | "Selected Real Analysis Problem" (legacy label; book not ide… → B. M. Makarov, M. G. Goluzina, A. A. Lodkin, A. N. Podkorytov, Selected Problems in Real Analysis (Russian ori… | https://vdoc.pub/documents/selected-problems-in-real-analysis-6tffcklec310 | medium |
| 0050 | origin-date | 2001 → 2001-12-01 | https://kskedlaya.org/putnam-archive/2001.pdf | high |
| 0050 | references | (empty) → 62nd Putnam 2001 (Saturday, December 1, 2001), B4 - https://kskedlaya.org/putnam-archive/2001.pdf; solutions b… | https://kskedlaya.org/putnam-archive/2001.pdf | high |
| 0051 | origin | (empty) → folklore | https://en.wikipedia.org/wiki/Reservoir_sampling | medium |
| 0051 | origin-date | (empty) → 1962 | https://en.wikipedia.org/wiki/Reservoir_sampling | medium |
| 0051 | also-in | (empty) → interview | https://leetcode.com/problems/linked-list-random-node/ | medium |
| 0051 | references | Hongler; Reservoir Sampling (Jeffrey S. Vitter) → Classical algorithm, reservoir sampling (the single-item case of Algorithm R). Earliest one-pass sampling meth… | https://api.crossref.org/works/10.1080/01621459.1962.10480667 | medium |
| 0052 | origin | (empty) → folklore | https://archive.org/download/ontheproblemofpl029131mbp/ontheproblemofpl029131mbp_djvu.txt | medium |
| 0052 | also-in | (empty) → book, course | https://archive.org/download/traitedanalyse0002pica/traitedanalyse0002pica_djvu.txt | medium |
| 0052 | references | Hongler → Classical theorem, attributed to Darboux, known as the Darboux-Picard theorem. Picard, Traité d'Analyse, t. II… | https://archive.org/download/traitedanalyse0002pica/traitedanalyse0002pica_djvu.txt | medium |
| 0053 | origin | (empty) → folklore | http://math.stanford.edu/~vakil/putnam03/03mc4.pdf | low |
| 0053 | also-in | (empty) → course | http://math.stanford.edu/~vakil/putnam03/03mc4.pdf | low |
| 0053 | references | (empty) → Ravi Vakil, Stanford Putnam seminar, Problem Solving Masterclass Week 4 (Monday 17 Nov 2003), Problem 4, prese… | http://math.stanford.edu/~vakil/putnam03/03mc4.pdf | low |
| 0054 | origin-date | 2024 → 2024-06-03 | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/ | medium |
| 0054 | references | (empty) → Bernoulli Competition (EPFL Bernoulli Center), 3 June 2024, Problem 1 (checked in the club's copy of the offic… | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/ | medium |
| 0055 | origin | (empty) → folklore | https://web.archive.org/web/20201109033456/https://www.ocf.berkeley.edu/~wwu/riddles/hard.shtml | medium |
| 0055 | origin-date | (empty) → 2002 | https://web.archive.org/web/20111109020821/http://www.ocf.berkeley.edu/%7Ewwu/cgi-bin/yabb/YaBB.cgi?board=riddles_hard;action=display;num=1027805293 | medium |
| 0055 | also-in | (empty) → journal | https://api.crossref.org/works/10.1007/BF02984862 | medium |
| 0055 | references | (empty) → William Wu, wu :: riddles, 'hard' page, '100 Prisoners and a Light Bulb' (our statement is adapted from it: so… | https://web.archive.org/web/20021007223120/http://www.ocf.berkeley.edu:80/~wwu/riddles/hard.shtml | medium |
| 0056 | origin | (empty) → journal | https://en.wikipedia.org/wiki/Secretary_problem | high |
| 0056 | origin-date | (empty) → 1960-02 | https://www.scientificamerican.com/article/mathematical-games-1960-02/ | high |
| 0056 | also-in | (empty) → book | https://en.wikipedia.org/wiki/Secretary_problem | high |
| 0056 | references | Hongler → Martin Gardner, Mathematical Games column 'A fifth collection of "brain-teasers"', Scientific American 202(2),… | https://www.scientificamerican.com/article/mathematical-games-1960-02/ | high |
| 0057 | origin | bernoulli → putnam | https://prase.cz/kalva/putnam/putn71.html | high |
| 0057 | origin-date | 2025 → 1971 | https://www.math.utoronto.ca/barbeau/putnamnumb.pdf | high |
| 0057 | origin-number | (empty) → A6 | https://prase.cz/kalva/putnam/psoln/psol716.html | high |
| 0057 | also-in | (empty) → bernoulli | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/ | high |
| 0057 | references | (empty) → Putnam 1971 (32nd), A6 - https://prase.cz/kalva/putnam/putn71.html (solution by finite differences and the mea… | https://prase.cz/kalva/putnam/putn71.html | high |
| 0058 | origin-date | (empty) → 2023-11 | https://klasirane.com/api/competitions/EMT/All/2023/12%20%D0%BA%D0%BB/probs | high |
| 0058 | references | (empty) → Autumn Mathematical Tournament "Acad. Stefan Dodunekov" (Есенен математически турнир „Академик Стефан Додунеко… | https://klasirane.com/api/competitions/EMT/All/2023/12%20%D0%BA%D0%BB/probs | high |
| 0059 | origin-date | (empty) → 2023-11 | https://klasirane.com/api/competitions/EMT/All/2023/12%20%D0%BA%D0%BB/probs | high |
| 0059 | references | (empty) → Autumn Mathematical Tournament "Acad. Stefan Dodunekov" (Есенен математически турнир „Академик Стефан Додунеко… | https://klasirane.com/api/competitions/EMT/All/2023/12%20%D0%BA%D0%BB/probs | high |
| 0060 | origin | (empty) → folklore | https://arxiv.org/pdf/1404.7198 | medium |
| 0060 | references | (empty) → Classical special case of Maxwell's problem on equilibrium points of point charges: Maxwell, A Treatise on Ele… | https://arxiv.org/pdf/math-ph/0409009 | medium |
| 0061 | origin | (empty) → folklore | https://en.wikipedia.org/wiki/Radius_of_curvature | low |
| 0061 | references | (empty) → Standard calculus formula R = (1+y'^2)^{3/2}/\|y''\| for the curvature radius of a graph - https://en.wikipedia.… | https://en.wikipedia.org/wiki/Radius_of_curvature | low |
| 0062 | origin-date | (empty) → 2023 | https://www.kappamuepsilon.org/Pentagon/Vol_82_Num_2_Spring_2023.pdf | high |
| 0062 | origin-number | 922 → Problem 922 | https://www.kappamuepsilon.org/Pentagon/Vol_82_Num_2_Spring_2023.pdf | high |
| 0062 | references | American Mathematical Monthly, Problem 922 (Toyesh Prakash S… → The Pentagon (Kappa Mu Epsilon), Vol. 82, No. 2, Spring 2023, The Problem Corner, Problem 922, proposed by Toy… | https://www.kappamuepsilon.org/Pentagon/Vol_82_Num_2_Spring_2023.pdf | high |
| 0063 | origin-date | 2025 → 2025-02-23 | https://icmathscomp.org/files/2024-2025/ICMC_8.2_paper.pdf | high |
| 0063 | origin-number | Round 2, Problem 1 → Round 2, Problem 3 | https://icmathscomp.org/files/2024-2025/ICMC_8.2_paper.pdf | high |
| 0063 | references | (empty) → ICMC 8 (2024-2025), Round Two, 23 February 2025, Problem 3 (proposed by Dylan Toh) - https://icmathscomp.org/f… | https://icmathscomp.org/files/2024-2025/ICMC_8.2_paper.pdf | high |
| 0064 | origin-date | 2025 → 2025-02-23 | https://icmathscomp.org/files/2024-2025/ICMC_8.2_paper.pdf | high |
| 0064 | origin-number | Round 2, Problem 2 → Round 2, Problem 4 | https://icmathscomp.org/files/2024-2025/ICMC_8.2_paper.pdf | high |
| 0064 | references | (empty) → ICMC 8 (2024-2025), Round Two, 23 February 2025, Problem 4 (proposed by Ishan Nath) - https://icmathscomp.org/… | https://icmathscomp.org/files/2024-2025/ICMC_8.2_paper.pdf | high |
| 0065 | origin-date | 2025 → 2025-07-16 | https://www.imo-official.org/assets/documents/problems/2025/2025_eng.pdf | high |
| 0065 | origin-number | (empty) → 5 | https://www.imo-official.org/assets/documents/problems/2025/2025_eng.pdf | high |
| 0065 | references | (empty) → IMO 2025 (Sunshine Coast, Australia), Day 2 (16 July 2025), Problem 5, proposed by Italy - https://www.imo-off… | https://www.imo-official.org/problems/2025/ | high |
| 0066 | origin | book → historical | https://archive.org/download/oeuvresdefermat01ferm/oeuvresdefermat01ferm_djvu.txt | medium |
| 0066 | also-in | (empty) → book | https://books.google.ch/books?id=2Jp3FKRcZbEC&jscmd=SearchWithinVolume2&q=find%20the%20point&scoring=r | medium |
| 0066 | references | The Mathematical Mechanics; legacy set note: physics-based p… → Fermat, 'Methodus de maxima et minima', closing challenge 'Datis tribus punctis, quartum reperire, a quo si du… | https://archive.org/download/oeuvresdefermat01ferm/oeuvresdefermat01ferm_djvu.txt | medium |
| 0067 | origin | book → historical | https://archive.org/download/treatiseonconics00apolrich/treatiseonconics00apolrich_djvu.txt | high |
| 0067 | origin-number | (empty) → Book III, Proposition 48 | https://archive.org/download/treatiseonconics00apolrich/treatiseonconics00apolrich_djvu.txt | high |
| 0067 | also-in | (empty) → book | https://books.google.ch/books?id=2Jp3FKRcZbEC&jscmd=SearchWithinVolume2&q=Let%20P%20be%20a%20point%20on%20an%20ellipse&scoring=r | high |
| 0067 | references | The Mathematical Mechanics; legacy set note: physics-based p… → Apollonius of Perga, Conics, Book III, Proposition 48 (late 3rd century BC): the focal distances of a point ma… | https://archive.org/download/treatiseonconics00apolrich/treatiseonconics00apolrich_djvu.txt | high |
| 0068 | origin | (empty) → journal | https://arxiv.org/pdf/math/0101168 | medium |
| 0068 | origin-date | (empty) → 1978-03 | https://api.crossref.org/works/10.2307/2321067 | medium |
| 0068 | origin-number | (empty) → Problem E2701 | https://arxiv.org/pdf/math/0101168 | medium |
| 0068 | references | (empty) → R. P. Stanley, Elementary Problem E2701, Amer. Math. Monthly 85 (1978), no. 3, p. 197: compute the volume of {… | https://api.crossref.org/works/10.2307/2321067 | medium |
| 0069 | origin-date | 1984 → 1982 | https://prase.cz/kalva/putnam/psoln/psol829.html | high |
| 0069 | references | (empty) → 43rd Putnam 1982, Problem B3 (answer 4(sqrt2 - 1)/3) - https://prase.cz/kalva/putnam/putn82.html ; Kalva solut… | https://prase.cz/kalva/putnam/putn82.html | high |
| 0070 | origin | (empty) → journal | https://gurmeet.net/puzzles/perplexing-polynomial/ | medium |
| 0070 | origin-date | (empty) → 2005-03 | https://gurmeet.net/puzzles/perplexing-polynomial/ | medium |
| 0070 | origin-number | (empty) → Vol. 36, No. 2, p. 100 (solution p. 159) | https://repository.uantwerpen.be/docstore/d:irua:19549 | medium |
| 0070 | references | (empty) → I. B. Keene, 'A Perplexing Polynomial Puzzle', College Math. J. 36(2), March 2005, p. 100, solution p. 159 (pr… | https://gurmeet.net/puzzles/perplexing-polynomial/ | medium |
| 0071 | origin-date | 2025 → 2025-05-27 | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/ | medium |
| 0071 | references | (empty) → Bernoulli Competition 2025 (EPFL Bernoulli Center, 27 May 2025), Problem 2 (club's copy of the official proble… | https://bernoulli.epfl.ch/youth-at-bernoulli/bernoulli-competition/. | medium |
| 0072 | origin-date | (empty) → 2009 | http://web.archive.org/web/20110915224316/http://www.msri.org/people/members/chillar/files/injectiveword.pdf | high |
| 0072 | origin-number | 11446 → Problem 11446 | http://web.archive.org/web/20110915224316/http://www.msri.org/people/members/chillar/files/injectiveword.pdf | high |
| 0072 | references | American Mathematical Monthly Vol. 116 No. 7, Problem 11446;… → American Mathematical Monthly, 2009, Problem 11446 (Vol. 116, No. 7, Aug.-Sep. 2009, per the legacy label), pr… | http://web.archive.org/web/20110915224316/http://www.msri.org/people/members/chillar/files/injectiveword.pdf | high |
| 0073 | origin-date | 2025 → 2025-04-05 | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2025/9-12%20%D0%BA%D0%BB/sol | high |
| 0073 | references | (empty) → 74th Bulgarian National Mathematical Olympiad (final round), Day 1 (5 April 2025), grades 9-12, Problem 1, pro… | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2025/9-12%20%D0%BA%D0%BB/sol | high |
| 0074 | origin-date | 2025 → 2025-04-05 | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2025/9-12%20%D0%BA%D0%BB/sol | high |
| 0074 | references | (empty) → 74th Bulgarian National Mathematical Olympiad (final round), Day 1 (5 April 2025), grades 9-12, Problem 2 (ans… | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2025/9-12%20%D0%BA%D0%BB/sol | high |
| 0075 | origin-date | 2025 → 2025-04-06 | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2025/9-12%20%D0%BA%D0%BB/sol | high |
| 0075 | references | (empty) → 74th Bulgarian National Mathematical Olympiad (final round), Day 2 (6 April 2025), grades 9-12, Problem 5, pro… | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2025/9-12%20%D0%BA%D0%BB/sol | high |
| 0076 | origin-date | 2024 → 2024-04-29 | https://bmo2024.org/wp-content/uploads/2024/05/BOM_english.pdf | high |
| 0076 | references | (empty) → 41st Balkan MO 2024 (Varna, Bulgaria, 29 April 2024), Problem 2 - official problems https://bmo2024.org/wp-con… | https://bmo2024.org/wp-content/uploads/2024/05/BOM_english.pdf | high |
| 0077 | origin-date | 2024 → 2024-04-29 | https://bmo2024.org/wp-content/uploads/2024/05/BOM_english.pdf | high |
| 0077 | references | (empty) → 41st Balkan MO 2024 (Varna, Bulgaria, 29 April 2024), Problem 3 - official problems https://bmo2024.org/wp-con… | https://bmo2024.org/wp-content/uploads/2024/05/BOM_english.pdf | high |
| 0078 | origin-date | 2024 → 2024-04-29 | https://bmo2024.org/wp-content/uploads/2024/05/BOM_english.pdf | high |
| 0078 | references | (empty) → 41st Balkan MO 2024 (Varna, Bulgaria, 29 April 2024), Problem 4 - official problems https://bmo2024.org/wp-con… | https://bmo2024.org/wp-content/uploads/2024/05/BOM_english.pdf | high |
| 0079 | references | (empty) → 73rd Bulgarian National Mathematical Olympiad (national round), 2024, Day 2, Problem 4, proposed by Borislav K… | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2024/9-12%20%D0%BA%D0%BB/sol | high |
| 0080 | references | (empty) → 73rd Bulgarian National Mathematical Olympiad (national round), 2024, Day 2, Problem 5, proposed by Danila Che… | https://klasirane.com/api/competitions/OLI/3-%D0%9D%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D0%B5%D0%BD%20%D0%BA%D1%80%D1%8A%D0%B3/2024/9-12%20%D0%BA%D0%BB/sol | high |
