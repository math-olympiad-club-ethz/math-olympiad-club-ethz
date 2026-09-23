"""Validator, derived fields, visibility rule, filename/title check, stitched document, proposed problems.
Run:  python3 -m unittest discover -s tests/python -v
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # website-code/
sys.path.insert(0, ROOT)
from bank import paths  # noqa: E402
from bank import problems as P  # noqa: E402
from bank import number  # noqa: E402
from bank.data import build_index, visible_problems  # noqa: E402
from bank.stitch import bank_sources, build_bodies, figure_context, find_figures, make_main, namespace_labels, parse_ids, resolve_citations, parse_bib, split_body  # noqa: E402
from bank.validate import proof_sources  # noqa: E402
from bank.tags import load_tags  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures", "broken")
CONTRIB = os.path.join(ROOT, "tests", "fixtures", "contrib")
TAGS = load_tags(paths.TAGS_FILE)
BIB_KEYS = set(parse_bib(paths.BIB_FILE))


def parse(name, folder=FIX):
    p = P.parse_problem_file(os.path.join(folder, name))
    P.validate(p, TAGS, BIB_KEYS)
    return p


def messages(p):
    return [m for _, m in p["errors"]]


class KebabAndFilename(unittest.TestCase):
    def test_kebab(self):
        self.assertEqual(P.kebab("Roots on the unit circle"), "roots-on-the-unit-circle")
        self.assertEqual(P.kebab("Simon's favourite factoring trick"), "simons-favourite-factoring-trick")
        self.assertEqual(P.kebab("Sudakov & Milojević, 2 planets!"), "sudakov-milojevic-2-planets")
        self.assertEqual(P.kebab("  Hello   World "), "hello-world")

    def test_good_file_has_no_errors(self):
        p = parse("0001-good-problem.tex")
        self.assertEqual(messages(p), [])
        self.assertEqual(p["id"], 1)
        self.assertTrue(p["solved"])
        self.assertEqual(p["difficulty_effective"], "easy")

    def test_filename_title_mismatch_prints_expected_name(self):
        p = parse("0002-wrong-title.tex")
        self.assertTrue(any("expected file name: 0002-another-title-entirely.tex" in m for m in messages(p)), messages(p))

    def test_malformed_filename(self):
        p = parse("bad-name.tex")
        self.assertIsNone(p["id"])
        self.assertTrue(any("file name must look like" in m for m in messages(p)))

    def test_title_too_long(self):
        p = parse("0007-a-very-long-title-with-far-too-many-words.tex")
        self.assertTrue(any("words" in m for m in messages(p)))


class HeaderValidation(unittest.TestCase):
    def test_bad_tags_and_enums(self):
        p = parse("0003-bad-tags.tex")
        msgs = "\n".join(messages(p))
        for needle in ("unknown area tag 'sequencez'", "unknown methods tag 'inductio'", "'difficulty-ai' must be one of",
                       "'status' must be one of", "'review' must be one of", "unknown origin 'nowhere'", "'origin-date' must be"):
            self.assertIn(needle, msgs)
        self.assertNotIn("algebra", msgs.split("unknown area tag")[-1][:12])   # 'algebra' is a valid tag

    def test_missing_area_unknown_key_preamble_and_two_solutions(self):
        p = parse("0004-no-area.tex")
        msgs = "\n".join(messages(p))
        self.assertIn("at least one '% area:' tag is required", msgs)
        self.assertIn("unknown header field 'titel'", msgs)
        self.assertIn("must not contain \\documentclass", msgs)
        self.assertIn("at most one \\begin{solution}", msgs)

    def test_partial_without_solution(self):
        p = parse("0005-partial-without-solution.tex")
        self.assertTrue(any("status: partial only makes sense" in m for m in messages(p)))

    def test_duplicate_ids(self):
        probs = [parse("0003-bad-tags.tex"), parse("0003-duplicate-id.tex")]
        dup = P.check_ids(probs)
        self.assertEqual(len(dup), 1)
        self.assertIn("duplicate ID 0003", dup[0][2])

    def test_blank_optional_fields_are_fine(self):
        p = parse("0002-wrong-title.tex")           # only the title/filename error
        self.assertEqual([m for m in messages(p) if "expected file name" not in m], [])
        self.assertEqual(p["difficulty_effective"], "unrated")
        self.assertEqual(p["review"], "none")
        self.assertFalse(p["has_solution"])


class Visibility(unittest.TestCase):
    def test_only_human_reviewed_are_published(self):
        good = parse("0001-good-problem.tex")       # review: human
        other = parse("0002-wrong-title.tex")       # review: none
        self.assertEqual([p["id"] for p in visible_problems([good, other])], [1])
        self.assertEqual([p["id"] for p in visible_problems([good, other], preview=True)], [1, 2])
        idx = build_index([other, good], TAGS, preview=True)
        self.assertEqual([r["id"] for r in idx["problems"]], [1, 2])      # sorted by ID
        self.assertEqual(idx["problems"][1]["difficulty"], "unrated")
        self.assertTrue(idx["preview"])
        self.assertEqual(build_index([other, good], TAGS)["count"], 1)


class Stitch(unittest.TestCase):
    def test_labels_are_namespaced(self):
        tex = r"\label{eq:1} see \eqref{eq:1} and \cref{lem} \hyperref[A1]{A.1} \begin{lemma}\label{lem}\end{lemma}"
        out = namespace_labels(tex, "p0042")
        self.assertIn(r"\label{p0042:eq:1}", out)
        self.assertIn(r"\eqref{p0042:eq:1}", out)
        self.assertIn(r"\cref{p0042:lem}", out)
        self.assertIn(r"\hyperref[p0042:A1]{A.1}", out)

    def test_citations_are_resolved(self):
        bib = parse_bib(paths.BIB_FILE)
        st, sol, n = resolve_citations("Text \\cite{solomon1967Hurwitz}.", "More \\cite{sato1972algebraic,solomon1967Hurwitz}.", bib, lambda *a: None, "0001")
        self.assertEqual(n, 2)                      # distinct keys
        self.assertIn("[1]", st)
        self.assertIn("[2, 1]", sol)
        self.assertIn(r"\begin{problemreferences}", sol)
        self.assertNotIn(r"\cite", st + sol)

    def test_make_main_variants_and_not_solved_marker(self):
        bodies = {"0001": {"id": "0001", "title": "A & B", "origin": "Putnam 1989, A3", "status": "", "methods": ["Induction"], "statement": "S1", "solution": "Sol1", "figures": {}},
                  "0002": {"id": "0002", "title": "T2", "origin": "", "status": "", "methods": [], "statement": "S2", "solution": None, "figures": {}},
                  "0003": {"id": "0003", "title": "T3", "origin": "", "status": "partial", "methods": [], "statement": "S3", "solution": "Sol3", "figures": {}}}
        pr = make_main(bodies, [3, 1, 2], "problems", filters="Area: X")
        self.assertIn(r"\bankproblem{1}{T3}{}{0003}", pr)          # order as given (caller sorts by ID)
        self.assertIn(r"\bankproblem{2}{A \& B}{Putnam 1989, A3}{0001}", pr)
        self.assertNotIn(r"\begin{solution}", pr)
        self.assertNotIn(r"\banknosolution", pr)
        self.assertIn("Selection: Area: X", pr)
        self.assertIn("3 problems", pr)
        so = make_main(bodies, [1, 2, 3], "solutions", show_methods=True)
        self.assertEqual(so.count(r"\banknosolution"), 2)            # unsolved + partial
        self.assertEqual(so.count(r"\begin{solution}"), 2)
        self.assertIn(r"\bankmethods{Induction}", so)
        self.assertNotIn(r"\bankmethods", make_main(bodies, [1], "solutions"))
        self.assertNotIn(r"\today", so)

    def test_make_main_keeps_the_given_order(self):
        bodies = {f"{i:04d}": {"id": f"{i:04d}", "title": f"T{i}", "origin": "", "status": "", "methods": [], "statement": f"S{i}",
                               "solution": None, "figures": {}} for i in (1, 2, 3)}
        tex = make_main(bodies, [3, 1, 2], "problems")
        self.assertLess(tex.index(r"\bankproblem{1}{T3}{}{0003}"), tex.index(r"\bankproblem{2}{T1}{}{0001}"))
        self.assertIn(r"\bankproblem{3}{T2}{}{0002}", tex)

    def test_parse_ids_keeps_the_written_order(self):
        self.assertEqual(parse_ids("5,3,1-2"), [5, 3, 1, 2])
        self.assertEqual(parse_ids("2,2,1"), [2, 1])
        self.assertEqual(parse_ids("all", [3, 1, 2]), [1, 2, 3])


class ProposedProblems(unittest.TestCase):
    """new-<title>.tex: accepted by the validator, numbered after the merge (bank/number.py)."""

    def test_new_file_is_valid_and_unnumbered(self):
        p = parse("new-a-proposed-problem.tex", CONTRIB)
        self.assertEqual(messages(p), [])
        self.assertTrue(p["new"])
        self.assertIsNone(p["id"])
        self.assertEqual(p["slug"], "a-proposed-problem")

    def test_blank_title_is_untitled_problem(self):
        p = parse("new-untitled-problem.tex", CONTRIB)
        self.assertEqual(messages(p), [])
        self.assertEqual(p["title"], "Untitled problem")
        self.assertFalse(p["has_solution"])

    def test_new_file_name_must_match_the_title(self):
        p = parse("new-wrong-name.tex", CONTRIB)
        self.assertTrue(any("expected file name: new-some-other-title.tex" in m for m in messages(p)), messages(p))

    def test_latex_rules(self):
        msgs = "\n".join(messages(parse("0010-bad-latex.tex", CONTRIB)))
        self.assertIn("citation key 'nowhere2020' is neither in references.bib", msgs)
        self.assertNotIn("\\begin\\{", msgs)                                  # messages show commands, not regexes
        self.assertIn("inline \\tikz is not supported", msgs)
        self.assertIn("must not contain \\begin{document} / \\end{document}", msgs)
        self.assertIn("BibTeX key(s) given twice in the bibentries block: twice", msgs)
        msgs = "\n".join(messages(parse("0011-empty-bib-block.tex", CONTRIB)))
        self.assertIn("the bibentries block contains no BibTeX entry", msgs)

    def test_rules_after_the_review(self):
        p = parse("new-late-cite.tex", CONTRIB)
        errs = {m: l for l, m in p["errors"]}
        msgs = "\n".join(errs)
        line = lambda needle: next(l for m, l in errs.items() if needle in m)
        self.assertEqual(line("citation key 'nokey'"), 14)                    # after the bibentries block: still the right line
        self.assertEqual(line("\\begin{document} / \\end{document}"), 14)   # "\end {document}" with a space
        self.assertEqual(line("without spaces"), 14)                          # "\begin {problem}"
        self.assertEqual(line("remove \\bibliography"), 15)
        self.assertIn("origin-number contains characters that cannot be printed", msgs)
        self.assertEqual(line("must not contain \\usepackage"), 10)           # BibTeX fields are printed in the reference list:
        self.assertEqual(line("inline \\tikz"), 10)                           # the same LaTeX rules apply to them
        self.assertEqual(p["n_problem_blocks"], 2)                            # TeX reads "\begin {problem}" as a second block
        self.assertIn("exactly one \\begin{problem}", msgs)

    def test_printable_titles(self):
        self.assertEqual(P.unprintable("Euler φ sums – Ωmega, naïve Łódź"), [])
        self.assertEqual(P.unprintable("√2 ≤ π^2"), ["^", "\u221a", "\u2264"])
        self.assertEqual(P.unprintable("Ħ ſ"), ["\u0126", "\u017f"])
        for t in TAGS.values():                                               # every tag name can be printed on a PDF cover
            for tag in t.values():
                self.assertEqual(P.unprintable(tag["name"], forbidden=set("\\{}~^")), [], tag["name"])

    def test_error_lines_point_into_the_file(self):
        p = parse("0010-bad-latex.tex", CONTRIB)
        lines = {m.split(" ")[0]: l for l, m in p["errors"]}
        self.assertEqual(lines["citation"], 4)
        self.assertEqual(lines["inline"], 4)

    def test_numbering_plan(self):
        probs = [parse("0001-good-problem.tex"), parse("0005-partial-without-solution.tex"),
                 parse("new-wrong-name.tex", CONTRIB), parse("new-a-proposed-problem.tex", CONTRIB)]
        plan = [(p["file"], pid, name) for p, pid, name in number.plan(probs)]
        self.assertEqual(plan, [("new-a-proposed-problem.tex", 6, "0006-a-proposed-problem.tex"),
                                ("new-wrong-name.tex", 7, "0007-some-other-title.tex")])     # the title decides the name
        number.assign_provisional_ids(probs)
        self.assertEqual([p["id"] for p in probs], [1, 5, 7, 6])
        self.assertTrue(probs[3]["provisional"])

    def test_numbers_are_never_reused(self):
        probs = [parse("0001-good-problem.tex"), parse("new-a-proposed-problem.tex", CONTRIB)]
        self.assertEqual(number.plan(probs, last_id=41)[0][1], 42)            # 42, not 2: 2..41 were given before
        with tempfile.TemporaryDirectory() as d:
            number.write_last_id(d, 17)
            self.assertEqual(number.read_last_id(d), 17)
            self.assertEqual(number.read_last_id(os.path.join(d, "missing")), 0)

    def test_number_cli_renames(self):
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as out:
            for f in ("new-a-proposed-problem.tex", "new-untitled-problem.tex"):
                shutil.copy(os.path.join(CONTRIB, f), d)
            shutil.copy(os.path.join(FIX, "0003-duplicate-id.tex"), d)
            number.write_last_id(d, 3)
            msg = os.path.join(out, "msg.txt")                                  # nothing but problem files in problems/
            r = subprocess.run([sys.executable, "-m", "bank.number", "--problems-dir", d, "--apply", "--no-git", "--message", msg],
                               cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertEqual(sorted(f for f in os.listdir(d) if f.endswith(".tex")),
                             ["0003-duplicate-id.tex", "0004-a-proposed-problem.tex", "0005-untitled-problem.tex"])
            with open(msg) as f:
                self.assertIn("new-untitled-problem.tex -> 0005-untitled-problem.tex", f.read())
            self.assertEqual(number.read_last_id(d), 5)                         # remembered: a deleted 0005 is not given again
            os.remove(os.path.join(d, "0005-untitled-problem.tex"))
            shutil.copy(os.path.join(CONTRIB, "new-untitled-problem.tex"), d)
            r = subprocess.run([sys.executable, "-m", "bank.number", "--problems-dir", d, "--apply", "--no-git"], cwd=ROOT, capture_output=True, text=True)
            self.assertIn("new-untitled-problem.tex -> 0006-untitled-problem.tex", r.stdout)
            r = subprocess.run([sys.executable, "-m", "bank.number", "--problems-dir", d, "--apply", "--no-git"], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0)
            self.assertIn("no new-*.tex file to number", r.stdout)                  # idempotent: a second run does nothing

    def test_number_cli_refuses_an_invalid_tree(self):
        """A proposal merged while its checks were red, a stray file, a broken _last-id.txt: nothing is renamed."""
        cases = [("new-wrong-name.tex", None, "3", "expected file name: new-some-other-title.tex"),
                 ("new-a-proposed-problem.tex", "new-forgotten-extension", "3", "not a problem file"),
                 ("new-a-proposed-problem.tex", None, "3 # highest", "must hold one number"),
                 ("new-a-proposed-problem.tex", None, "2", "below the highest problem number 0003"),
                 ("new-a-proposed-problem.tex", None, "9999", "no four-digit number left")]
        for new, stray, last, needle in cases:
            with self.subTest(needle), tempfile.TemporaryDirectory() as d:
                shutil.copy(os.path.join(CONTRIB, new), d)
                shutil.copy(os.path.join(FIX, "0003-duplicate-id.tex"), d)
                if stray:
                    shutil.copy(os.path.join(CONTRIB, new), os.path.join(d, stray))
                with open(os.path.join(d, number.LAST_ID_FILE), "w") as f:
                    f.write(last + "\n")
                before = sorted(os.listdir(d))
                r = subprocess.run([sys.executable, "-m", "bank.number", "--problems-dir", d, "--apply", "--no-git"],
                                   cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
                self.assertIn(needle, r.stdout)
                self.assertIn("nothing renamed", r.stdout)
                self.assertEqual(sorted(os.listdir(d)), before)

    def test_visibility_of_new_problems(self):
        good = parse("0001-good-problem.tex")
        new = parse("new-a-proposed-problem.tex", CONTRIB)
        new["review"] = "human"
        self.assertEqual(visible_problems([good, new]), [good])                    # no ID yet: never listed
        number.assign_provisional_ids([good, new])
        self.assertEqual(visible_problems([good, new]), [good])                    # provisional: preview only
        self.assertEqual(visible_problems([good, new], preview=True), [good, new])
        self.assertTrue(build_index([good, new], TAGS, preview=True)["problems"][1]["provisional"])

    def test_figure_context_takes_multiline_definitions_whole(self):
        from bank.stitch import figure_context
        tex = "\\newcommand{\\norm}[1]{%\n  \\left\\lVert #1\\right\\rVert}\n\\tikzset{\n  dot/.style={circle,fill}\n}\n\\usepgfplotslibrary{fillbetween}\nText % \\def\\x{\n\\begin{tikzpicture}"
        ctx, libs = figure_context(tex, len(tex))
        self.assertEqual(ctx, "\\newcommand{\\norm}[1]{%\n  \\left\\lVert #1\\right\\rVert}\n\\tikzset{\n  dot/.style={circle,fill}\n}")
        self.assertEqual(libs, "\\usepgfplotslibrary{fillbetween}")
        one_line = "\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\n\\tikzset{dot/.style={circle}}\n\\begin{tikzpicture}"
        self.assertEqual(figure_context(one_line, len(one_line))[0], "\\tikzset{dot/.style={circle}}")   # after a one-line figure

    def test_bibtex_titles_keep_inner_braces(self):
        from bank.bib import format_entry
        self.assertEqual(format_entry({"title": "On a theorem of {Euler}"}), "\\emph{On a theorem of {Euler}},")
        self.assertEqual(format_entry({"title": "{Protected Title}"}), "\\emph{Protected Title},")
        self.assertEqual(format_entry({"title": "{A} and {B}"}), "\\emph{{A} and {B}},")
        self.assertIn("\\nolinkurl{doi:10.1007/x_7}", format_entry({"doi": "10.1007/x_7"}))

    def test_own_bibentries_resolve_and_win_locally(self):
        p = parse("new-a-proposed-problem.tex", CONTRIB)
        number.assign_provisional_ids([p])
        with tempfile.TemporaryDirectory() as d:
            bodies, stats = build_bodies(bank_sources([p], TAGS), d, log=lambda *a: None)
        b = bodies["0001"]
        self.assertIn("Statement citing [1] and [2].", b["statement"])
        self.assertIn("Jane Doe, \\emph{Own Paper}", b["statement"])
        self.assertIn("\\emph{Local Override}", b["statement"])            # the file's own entry wins for this problem
        self.assertIn("Solution [1, p.~3].", b["solution"])
        self.assertNotIn("bibentries", b["statement"] + b["solution"])


HEADER = "% title:          Probe\n% area:           algebra\n"


def probe(body, header=HEADER, name="new-probe.tex"):
    """Parse + validate a problem file with this body (in a temporary folder); returns the parsed problem."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, name)
        with open(path, "w", encoding="utf-8") as f:
            f.write(header + body)
        p = P.parse_problem_file(path)
        P.validate(p, TAGS, BIB_KEYS)
        return p


class BlockStructure(unittest.TestCase):
    """The problem block, then the solution, then the bibentries: nothing nested, nothing outside, comments ignored."""

    def test_valid_layouts(self):
        for body in ("\\begin{problem}\nS.\n\\end{problem}\n",
                     "\\begin{problem}\nS.\n\\end{problem}\n% a comment between\n\n\\begin{solution}\nT.\n\\end{solution}\n",
                     "\\begin{problem}\nS \\cite{own}.\n\\end{problem}\n\\begin{bibentries}\n@misc{own, title={X}}\n\\end{bibentries}\n"):
            self.assertEqual(messages(probe(body)), [], body)

    def test_solution_inside_the_problem_block_is_rejected(self):
        p = probe("\\begin{problem}\nStatement.\n\\begin{solution}\nSECRET\n\\end{solution}\n\\end{problem}\n")
        self.assertTrue(p["solution_inside_problem"])
        self.assertTrue(any("not inside the problem block" in m for m in messages(p)), messages(p))

    def test_wrong_order_nesting_and_missing_ends(self):
        for body, line in (("\\begin{solution}\nT.\n\\end{solution}\n\\begin{problem}\nS.\n\\end{problem}\n", 3),
                           ("\\begin{problem}\nS.\n\\begin{bibentries}\n@misc{a, title={x}}\n\\end{bibentries}\n\\end{problem}\n", 5),
                           ("\\begin{problem}\nS.\n\\end{problem}\n\\begin{bibentries}\n@misc{a, title={x}}\n\\end{bibentries}\n"
                            "\\begin{solution}\nT.\n\\end{solution}\n", 9),
                           ("\\begin{problem}\nS.\n", 4)):
            p = probe(body)
            errs = [(l, m) for l, m in p["errors"] if "the blocks must be" in m or "not inside the problem block" in m]
            self.assertEqual(len(errs), 1, (body, p["errors"]))
            if "the blocks must be" in errs[0][1]:
                self.assertEqual(errs[0][0], line, body)

    def test_text_outside_the_blocks_is_rejected_with_its_line(self):
        p = probe("\\newcommand{\\myset}{\\mathbb{R}}\n\\begin{problem}\nLet $f\\colon\\myset\\to\\myset$.\n\\end{problem}\n"
                  "Hint between the blocks.\n\\begin{solution}\nT.\n\\end{solution}\n")
        lines = sorted(l for l, m in p["errors"] if "outside the problem, solution and bibentries blocks" in m)
        self.assertEqual(lines, [3, 7])                                    # file lines (two header lines first)

    def test_commented_markers_are_ignored(self):
        p = probe("\\begin{problem}\nFirst line. % old version ended here: \\end{problem}\nSecond line.\n\\end{problem}\n"
                  "% \\begin{solution}\n% a draft idea\n% \\end{solution}\n")
        self.assertEqual(messages(p), [])
        self.assertFalse(p["has_solution"])                               # a commented-out draft does not make it solved
        statement, solution = split_body(p["body"])
        self.assertIn("Second line.", statement)                          # not cut at the commented \\end{problem}
        self.assertIsNone(solution)
        self.assertEqual(P.mask_comments("a \\% b % c\n\\\\% d\ne"), "a \\% b    \n\\\\   \ne")

    def test_commented_figure_is_not_a_figure(self):
        tex = "Real text.\n% \\begin{tikzpicture}\n% \\draw (0,0)--(1,1);\n% \\end{tikzpicture}\nMore.\n"
        self.assertEqual(find_figures(tex), [])
        tex2 = "% old: \\begin{tikzpicture}\nKEEP THIS LINE.\n\\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}"
        [(s, e)] = find_figures(tex2)
        self.assertTrue(tex2[s:].startswith("\\begin{tikzpicture}\\draw"))
        self.assertIn("KEEP THIS LINE.", tex2[:s])

    def test_statement_only_proof_compiles_what_the_site_compiles(self):
        p = parse("0001-good-problem.tex")
        main, body = proof_sources(p, TAGS, with_solution=False)
        self.assertNotIn("Solution.", body)
        self.assertEqual(body.split("\n")[6], "\\begin{problem}Statement.\\end{problem}")   # file line 7: errors point into the file
        main, body = proof_sources(p, TAGS, with_solution=True)
        self.assertEqual(body.split("\n")[5], "\\begin{problem}")                    # file line 6

    def test_a_statement_referring_to_a_label_in_the_solution(self):
        p = probe("\\begin{problem}\nFind $x$; see \\eqref{eq:answer} and Lemma~\\ref{lem:key}.\n\\end{problem}\n"
                  "\\begin{solution}\n\\begin{lemma}\\label{lem:key} L.\\end{lemma}\n\\begin{equation}\\label{eq:answer} x=1\\end{equation}\n\\end{solution}\n")
        errs = [(l, m) for l, m in p["errors"] if "which is labelled in the solution" in m]
        self.assertEqual([m.split("'")[1] for _, m in errs], ["eq:answer", "lem:key"])
        self.assertEqual(errs[0][0], 4)
        ok = probe("\\begin{problem}\n\\begin{equation}\\label{eq:a} x\\end{equation}\nSee \\eqref{eq:a}.\n\\end{problem}\n"
                   "\\begin{solution}\n\\begin{equation}\\label{eq:b} y\\end{equation} By \\eqref{eq:a} and \\eqref{eq:b}.\n\\end{solution}\n")
        self.assertEqual(messages(ok), [])


class UnsafeTeX(unittest.TestCase):
    """What a problem must not contain: it could change the other problems of a stitched PDF, or reach the CI runner."""

    REJECTED = [r"\gdef\bankx{A}", r"\global\everypar{X}", r"\xdef\x{y}", r"\def\x{y}", r"\let\epsilon\varepsilon",
                r"\makeatletter\def\@currenvir{document}", r"\csname enddocument\endcsname", r"\endinput", r"\endgroup x",
                r"\aftergroup\x", r"\catcode`\|=0", r"\scantokens{x}", r"^^5cgdef", r"\AtEndDocument{X}", r"\AddToHook{shipout}{X}",
                r"\everypar{X}", r"\output={}", r"\RenewDocumentEnvironment{solution}{}{}{}", r"\NewDocumentCommand{\x}{}{}",
                r"\ExplSyntaxOn", r"\end{\x}", r"\begin\x", r"\def\a{\end}", r"\bankproblem{9}{Fake}{}{0001}", r"\banknosolution",
                r"\renewcommand{\bankmethods}[1]{}", r"\begin{problemreferences}", r"\refitem{1}", r"\newtheorem{conj}{Conjecture}",
                r"\newcounter{c}", r"\newlength{\l}", r"\input{/etc/hostname}", r"\input{../../preamble}", r"\include{x}",
                r"\includegraphics{/tmp/x.pdf}", r"\openin1=/etc/passwd", r"\read1 to\x", r"\immediate\write18{ls}", r"\write\x{y}",
                r"\verbatiminput{x}", r"\lstinputlisting{x}", r"\today", r"\the\year", r"\the\time", r"\pdfuniformdeviate 100",
                r"\pdfsetrandomseed 1", r"\pdffiledump length 10 {/etc/passwd}", r"\citeauthor{solomon1967Hurwitz}",
                r"\fullcite{solomon1967Hurwitz}", r"\cites{a}{b}"]
    ACCEPTED = [r"\newcommand{\R}{\mathbb{R}}", r"\renewcommand{\phi}{\varphi}", r"\DeclareRobustCommand{\x}{y}",
                r"$a \times b \leq \left( c \right) \deg f \det A$", r"\begin{align*} x \end{align*}", r"\begin{enumerate}[label=(\alph*)]\item x\end{enumerate}",
                r"\setcounter{enumi}{2}", r"\definecolor{c}{rgb}{1,0,0}", r"\href{https://en.wikipedia.org/wiki/Legendre%27s_formula}{L}",
                r"\cite*{solomon1967Hurwitz}", r"\parencite[p.~3]{solomon1967Hurwitz}", r"\nocite{solomon1967Hurwitz}",
                r"\label{a} \ref{a} \hyperref[a]{x}", r"\EndIf \EndWhile", r"\appendix", r"\footnote{x}", r"\@."]

    def test_rejected(self):
        for snippet in self.REJECTED:
            with self.subTest(snippet):
                p = probe("\\begin{problem}\n" + snippet + "\n\\end{problem}\n")
                self.assertTrue(any(l == 4 for l, m in p["errors"]), p["errors"])

    def test_accepted(self):
        for snippet in self.ACCEPTED:
            with self.subTest(snippet):
                self.assertEqual(messages(probe("\\begin{problem}\n" + snippet + "\n\\end{problem}\n")), [])

    def test_bibentries_fields_are_checked_too(self):
        p = probe("\\begin{problem}\nS \\cite{b1}.\n\\end{problem}\n\\begin{bibentries}\n@misc{b1, title = {A \\gdef trap}}\n\\end{bibentries}\n")
        self.assertTrue(any("\\gdef" in m for m in messages(p)), messages(p))

    def test_every_problem_of_the_bank_passes(self):
        probs = P.load_problems(paths.PROBLEMS_DIR)
        for p in probs:
            P.validate(p, TAGS, BIB_KEYS)
        self.assertEqual([(p["file"], p["errors"]) for p in probs if p["errors"]], [])

    @unittest.skipUnless(shutil.which("pdflatex"), "needs pdflatex")
    def test_ci_pdflatex_cannot_read_outside_its_folder(self):
        from bank.stitch import _local_pdflatex
        with tempfile.TemporaryDirectory() as secret_dir, tempfile.TemporaryDirectory() as work:
            secret = os.path.join(secret_dir, "secret.tex")
            with open(secret, "w") as f:
                f.write("RUNNERSECRET\n")
            doc = "\\documentclass{article}\\begin{document}\\input{" + secret + "}\\end{document}\n"
            with self.assertRaises(RuntimeError):
                _local_pdflatex(doc, work, "fig")


class CitationsAndLabels(unittest.TestCase):
    def test_starred_and_spaced_cite_are_resolved(self):
        bib = parse_bib(paths.BIB_FILE)
        st, _, n = resolve_citations("A \\cite*{solomon1967Hurwitz}, B \\cite [p.~3] {sato1972algebraic}.", None, bib, lambda *a: None, "1")
        self.assertIn("A [1], B [2, p.~3].", st)
        self.assertEqual(n, 2)

    def test_label_forms_are_namespaced(self):
        out = namespace_labels("\\label {a} \\label[lemma]{b} \\ref {a} \\crefrange{a}{b} \\namecref{b} \\hyperref [a]{t} \\Cpageref{a,b}", "p0001")
        self.assertEqual(out, "\\label{p0001:a} \\label[lemma]{p0001:b} \\ref{p0001:a} \\crefrange{p0001:a}{p0001:b} "
                              "\\namecref{p0001:b} \\hyperref[p0001:a]{t} \\Cpageref{p0001:a,p0001:b}")


    def test_unclosed_brackets_stay_fast(self):
        """Bracketed arguments are bounded: many unclosed \\cite[ / \\ref[ / \\hyperref[ must not take quadratic time."""
        import time
        from bank.bib import CITE_RE
        from bank.stitch import label_refs
        for run in (lambda: list(CITE_RE.finditer("\\cite[" * 16000)), lambda: label_refs("\\ref[" * 20000),
                    lambda: label_refs("\\hyperref[" * 20000)):
            t0 = time.time()
            run()
            self.assertLess(time.time() - t0, 1.0)


class FigureContext(unittest.TestCase):
    def test_definitions_anywhere_in_a_line_but_not_in_comments_or_earlier_figures(self):
        tex = ("Throughout, \\renewcommand{\\phi}{\\varphi}we write $\\phi$.\n\\let\\epsilon\\varepsilon\nText % \\def\\x{1}\n"
               "\\begin{tikzpicture}\\tikzset{inner/.style={red}}\\end{tikzpicture} and \\definecolor{c}{rgb}{1,0,0}.\n")
        ctx, libs = figure_context(tex, len(tex))
        self.assertEqual(ctx.split("\n"), ["\\renewcommand{\\phi}{\\varphi}", "\\let\\epsilon\\varepsilon", "\\definecolor{c}{rgb}{1,0,0}"])
        self.assertEqual(libs, "")


class HeaderAndDates(unittest.TestCase):
    def test_dates(self):
        for d in ("1989", "1989-12", "1989-12-02", "2024-02-29", "0050-01-01", "0001"):
            self.assertTrue(P._valid_date(d, allow_partial=True), d)
        for d in ("20240102", "2024-W01-1", "2024-W01", "\u0661\u0669\u0668\u0669", "\uff11\uff19\uff18\uff19", "0000", "1989-13",
                  "1989-02-30", "2023-02-29", "89", "1989-1", " 1989"):
            self.assertFalse(P._valid_date(d, allow_partial=True), d)
        self.assertFalse(P._valid_date("1989-12"))                           # full dates only without allow_partial

    def test_bom_capitals_titles_and_encoding(self):
        p = probe("\\begin{problem}\nS.\n\\end{problem}\n", header="\ufeff" + HEADER)
        self.assertEqual(messages(p), [])                                   # a BOM no longer hides the header
        self.assertEqual(p["title"], "Probe")
        p = probe("\\begin{problem}\nS.\n\\end{problem}\n", header=HEADER + "% Review:         human\n")
        self.assertEqual([(l, m.split(":")[0]) for l, m in p["errors"]], [(3, "write the header field in lowercase")])
        self.assertEqual(p["review"], "none")
        p = probe("\\begin{problem}\nS.\n\\end{problem}\n", header="% title: \u6570\u5b66 !\n% area: algebra\n")
        self.assertIn("the title needs at least one ASCII letter or digit (it gives the file name)", messages(p))
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "new-probe.tex")
            with open(path, "wb") as f:
                f.write(HEADER.encode() + b"\\begin{problem}\nCaf\xe9.\n\\end{problem}\n")
            p = P.parse_problem_file(path)
            self.assertEqual(p["errors"], [(4, "the file is not UTF-8 (byte 0xe9): save it as UTF-8")])

    def test_duplicate_list_entries(self):
        p = probe("\\begin{problem}\nS.\n\\end{problem}\n", header="% title: Probe\n% area: algebra, algebra\n% methods: induction, induction\n")
        self.assertEqual(sorted(m for m in messages(p)), ["'area' lists algebra twice", "'methods' lists induction twice"])


class Tags(unittest.TestCase):
    def load(self, edit):
        import yaml
        from bank.tags import TagError
        with open(paths.TAGS_FILE, encoding="utf-8") as f:
            raw = yaml.safe_load(f)
        edit(raw)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "tags.yml")
            with open(path, "w", encoding="utf-8") as f:
                yaml.safe_dump(raw, f, allow_unicode=True)
            try:
                load_tags(path)
                return ""
            except TagError as err:
                return str(err)

    def test_slugs_groups_and_clashes(self):
        self.assertEqual(self.load(lambda raw: None), "")
        self.assertIn("bad slug '\u0430lgebra'", self.load(lambda raw: raw["area"].append({"slug": "\u0430lgebra", "name": "Algebra"})))
        self.assertIn("bad slug '-x--'", self.load(lambda raw: raw["area"].append({"slug": "-x--", "name": "X"})))
        self.assertIn("bad slug 'x\u00b2'", self.load(lambda raw: raw["area"].append({"slug": "x\u00b2", "name": "X"})))
        self.assertIn("(area/difficulty): ['easy']", self.load(lambda raw: raw["area"].append({"slug": "easy", "name": "Easy"})))
        self.assertIn("group name must be a non-empty string", self.load(lambda raw: raw["methods"][0].update(group="")))


class ProblemsFolder(unittest.TestCase):
    def test_stray_files(self):
        with tempfile.TemporaryDirectory() as d:
            for f in ("new-foo", "0081-x.TEX", "new-foo.tex.txt", ".latexmkrc", "_other.tex", "0001-good-problem.tex", "new-x.tex",
                      "_preview.tex", "_template.tex", "_last-id.txt", "0001-good-problem.pdf", "0001-good-problem.synctex.gz", ".DS_Store"):
                open(os.path.join(d, f), "w").close()
            os.mkdir(os.path.join(d, "sub"))
            self.assertEqual(sorted(os.path.basename(path) for path, _, _ in P.stray_files(d)),
                             [".latexmkrc", "0081-x.TEX", "_other.tex", "new-foo", "new-foo.tex.txt", "sub"])
        self.assertEqual(P.stray_files(paths.PROBLEMS_DIR), [])

    def test_last_id_checks(self):
        probs = [parse("0003-duplicate-id.tex"), parse("new-a-proposed-problem.tex", CONTRIB)]
        with tempfile.TemporaryDirectory() as d:
            self.assertIn("is missing", number.check_last_id(d, probs)[0][2])
            for text, needle in (("80 # highest\n", "must hold one number"), ("2\n", "below the highest problem number 0003"),
                                 ("9999\n", "no four-digit number left"), ("", "must hold one number")):
                with open(os.path.join(d, number.LAST_ID_FILE), "w") as f:
                    f.write(text)
                self.assertIn(needle, " ".join(m for _, _, m in number.check_last_id(d, probs)), text)
            number.write_last_id(d, 3)
            self.assertEqual(number.check_last_id(d, probs), [])
            with open(os.path.join(d, number.LAST_ID_FILE), "w") as f:
                f.write("80 # highest\n")
            with self.assertRaises(ValueError):
                number.read_last_id(d)                                      # never silently 0: numbers would be given again


@unittest.skipUnless(shutil.which("git"), "needs git")
class NumberingInGit(unittest.TestCase):
    """bank.number --apply as the Action runs it: git mv, _last-id.txt staged, the git history as the floor."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        self.dir = os.path.join(self.repo, "problems")
        os.mkdir(self.dir)
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@x", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@x")
        self.git = lambda *a: subprocess.run(["git", *a], cwd=self.repo, env=env, capture_output=True, text=True, check=True).stdout
        self.git("init", "-q")
        for i in (1, 2, 3):
            with open(os.path.join(FIX, "0003-duplicate-id.tex")) as f:
                text = f.read().replace("Duplicate id", f"Duplicate id {i}")
            with open(os.path.join(self.dir, f"{i:04d}-duplicate-id-{i}.tex"), "w") as f:
                f.write(text)
        number.write_last_id(self.dir, 3)
        self.git("add", "-A")
        self.git("commit", "-qm", "three problems")

    def tearDown(self):
        self.tmp.cleanup()

    def number(self):
        return subprocess.run([sys.executable, "-m", "bank.number", "--problems-dir", self.dir, "--apply"], cwd=ROOT, capture_output=True, text=True)

    def test_rename_is_staged(self):
        shutil.copy(os.path.join(CONTRIB, "new-a-proposed-problem.tex"), self.dir)
        self.git("add", "-A")
        self.git("commit", "-qm", "proposal")
        r = self.number()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("new-a-proposed-problem.tex -> 0004-a-proposed-problem.tex", r.stdout)
        staged = self.git("diff", "--cached", "--name-status")
        self.assertIn("0004-a-proposed-problem.tex", staged)
        self.assertIn("problems/_last-id.txt", staged)
        self.assertEqual(number.read_last_id(self.dir), 4)

    def test_history_is_the_floor_when_last_id_was_lowered(self):
        """0003 deleted and _last-id.txt lowered to 2 in the same pull request: 3 is still not given again."""
        os.remove(os.path.join(self.dir, "0003-duplicate-id-3.tex"))
        number.write_last_id(self.dir, 2)
        shutil.copy(os.path.join(CONTRIB, "new-a-proposed-problem.tex"), self.dir)
        self.git("add", "-A")
        self.git("commit", "-qm", "delete 0003, lower the counter, propose")
        r = self.number()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("-> 0004-a-proposed-problem.tex", r.stdout)
        self.assertEqual(number.read_last_id(self.dir), 4)

    def test_a_raised_counter_is_refused(self):
        number.write_last_id(self.dir, 50)
        shutil.copy(os.path.join(CONTRIB, "new-a-proposed-problem.tex"), self.dir)
        self.git("add", "-A")
        self.git("commit", "-qm", "raise the counter")
        r = self.number()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("the highest number ever given (git history) is 3", r.stdout)
        self.assertTrue(os.path.exists(os.path.join(self.dir, "new-a-proposed-problem.tex")))
        self.assertEqual(self.git("diff", "--cached", "--name-only"), "")


class PublicBuildCheck(unittest.TestCase):
    def test_check_catches_unpublished_content(self):
        sys.path.insert(0, os.path.join(ROOT, "tests", "python"))
        from check_public_build import check
        good, other = parse("0001-good-problem.tex"), parse("0002-wrong-title.tex")      # review: human / none
        with tempfile.TemporaryDirectory() as site:
            bank = os.path.join(site, "static", "bank")
            os.makedirs(os.path.join(bank, "figures"))
            os.makedirs(os.path.join(site, "static", "busytex"))

            def write(rel, data):
                with open(os.path.join(site, rel), "w", encoding="utf-8") as f:
                    f.write(data if isinstance(data, str) else json.dumps(data))
            write("static/bank/index.json", build_index([good, other], TAGS))
            write("static/bank/bodies.json", {"build": "b1", "problems": {"0001": {"figures": {"fig0001-1.pdf": {}}}}})
            write("static/bank/figures/fig0001-1.pdf", "%PDF")
            for f in ("static/bank/tags.json", "static/bank/preamble.tex", "static/bank/references.bib", "index.html", "propose.html"):
                write(f, "{}")
            write("problems.html", '<script>{"index":{"preview":false},"build":"b1","engine":"e1"}</script>')
            write("static/busytex/busytex.wasm.gz", "12345")
            write("static/busytex/manifest.json", {"version": "e1", "files": {"busytex.wasm.gz": {"bytes": 5}}})
            self.assertEqual(check(site, [good, other]), [])
            write("static/bank/figures/fig0002-1.pdf", "%PDF")                            # a figure of an unpublished problem
            write("static/bank/index.json", build_index([good, other], TAGS, preview=True))
            errors = "\n".join(check(site, [good, other]))
            self.assertIn("figures of no published problem: ['fig0002-1.pdf']", errors)
            self.assertIn("'preview' is not false", errors)
            write("static/bank/bodies.json", {"build": "b2", "problems": {"0001": {"figures": {"fig0001-1.pdf": {}}}}})
            self.assertIn("come from different builds", "\n".join(check(site, [good, other])))


if __name__ == "__main__":
    unittest.main()
