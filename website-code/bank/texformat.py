#!/usr/bin/env python3
r"""Lay out the source of a LaTeX file of the bank so that it reads well in an editor: the indentation of
problem-bank/writing-style.md, section 7 ("Source layout"), by latexindent with latexindent.yaml (4 spaces per
nesting level), and every paragraph of a problem, a solution or a shared result refilled so that its lines are as
full as they can be within 100 characters (the rest of a file, such as the preamble, keeps its lines).

    python3 texformat.py FILE                 print the laid-out file (VS Code runs this on save)
    python3 texformat.py FILE... --write      rewrite the files in place; prints the ones that changed
    python3 texformat.py FILE... --check      exit status 1 if a file is not laid out yet

A paragraph (consecutive lines of text) is joined and refilled: each line takes as much of the text as fits, so
that no line could take a word from the next one. Lines that stay alone, never joined: blank lines, comment lines
(so the % header keeps one field per line), `\\\\` lines, \begin and \end lines, display delimiters \[ \] and
$$, labels such as \textit{Solution 1.}, and the contents of aligned formulas, matrices, tables, TikZ pictures, code
listings, algorithms and BibTeX blocks. An \item starts a new paragraph; a line ending with a comment or with \\
ends one. Double spaces inside a paragraph become single spaces. A line breaks only at a space outside braces and outside $ $ (where latexindent would indent the next
line), never right after \( or before \), and outside inline math when that costs at most an eighth of the line.
Only whitespace changes (a line break is a space for LaTeX). Running it twice changes nothing more.
Self-contained (standard library + latexindent), so VS Code can run it by its path.
"""
import collections
import os
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
CONFIG = HERE / "latexindent.yaml"
WIDTH = 100
NO_WRAP = {"bibentries", "tikzpicture", "tikzcd", "verbatim", "verbatim*", "Verbatim", "lstlisting", "minted", "comment",
           "filecontents", "filecontents*", "algorithm", "algorithmic", "align", "align*", "aligned", "alignat", "alignat*",
           "alignedat", "gather", "gather*", "gathered", "multline", "multline*", "split", "cases", "array",
           "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "tabular", "tabularx",
           "eqnarray", "eqnarray*", "flalign", "flalign*"}
BEGIN_END = re.compile(r"\\(begin|end)\{([^}]*)\}")
# only the text of these environments (a problem, its solution, a shared result) is refilled: the rest of a file (its
# % header, the preamble's commands, one per line) keeps its lines
CONTENT = {"problem", "solution", "appendixitem"}
DISPLAY = re.compile(r"(?<!\\)(?:\\\\)*\\[\[\]]")       # \[ or \], not the line break \\ followed by [
LABEL = re.compile(r"(?:\\noindent\s*)?\\textit\{[^{}]*\}")
# what may not start a line inside a paragraph (it would make that line stay alone or start a new paragraph)
STARTERS = ("\\item", "\\begin{", "\\end{", "\\[", "\\]", "\\)", "\\\\", "$$", "%", "[")


SIZER = re.compile(r"\\(?:left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|big|Big|bigg|Bigg)(?![A-Za-z])")
HIDE = {"[": "\u2045", "]": "\u2046"}                # stand-ins latexindent does not read as brackets


def hide_math_brackets(text):
    r"""The text with every [ and ] inside math or right after \left, \right, ... replaced by a stand-in. The house
    style writes intervals as \left]0;1\right[: latexindent would pair such reversed brackets with others, many lines
    away, as if they were optional arguments, and indent (or stop recognising a display) in between."""
    out, math, dollar = [], False, False
    for line in text.split("\n"):
        code = code_part(line)
        res, i = [], 0
        while i < len(code):
            c = code[i]
            if c == "\\":
                m = SIZER.match(code, i)
                if m:
                    res.append(m.group(0))
                    i = m.end()
                    if i < len(code) and code[i] in HIDE:
                        res.append(HIDE[code[i]])
                        i += 1
                    continue
                two = code[i:i + 2]
                if two in ("\\(", "\\["):
                    math = True
                elif two in ("\\)", "\\]"):
                    math = False
                res.append(two)
                i += 2
                continue
            if c == "$":
                dollar = not dollar
                step = 2 if code[i:i + 2] == "$$" else 1
                res.append(code[i:i + step])
                i += step
                continue
            res.append(HIDE[c] if c in HIDE and (math or dollar) else c)
            i += 1
        out.append("".join(res) + line[len(code):])
    return "\n".join(out)


def latexindent(text):
    """The text indented by latexindent with latexindent.yaml (leading spaces only)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "file.tex"
        src.write_text(hide_math_brackets(text), encoding="utf-8")
        # a fixed Perl hash seed: otherwise latexindent may give different outputs for the same input
        env = {**os.environ, "PERL_HASH_SEED": "0", "PERL_PERTURB_KEYS": "0"}
        run = subprocess.run(["latexindent", "-c", tmp + "/", f"-l={CONFIG}", str(src)],
                             capture_output=True, text=True, encoding="utf-8", env=env)
    if run.returncode != 0:
        sys.exit(f"texformat: latexindent failed: {run.stderr.strip()[-800:]}")
    return run.stdout.replace(HIDE["["], "[").replace(HIDE["]"], "]")


def code_part(line):
    """The line up to its comment: the first % not escaped by a backslash."""
    m = re.search(r"(?<!\\)(?:\\\\)*%", line)
    return line if m is None else line[:m.end() - 1]


def scan(s, math=False, dollar=False):
    r"""Walk s from a state (math: inside \( \) or \[ \]; dollar: inside $ $ or $$ $$). Return, for each position,
    whether a line may break there (a space outside braces opened in s and outside $ $) and whether it lies in
    math; the state at the end of s; and the brace depth at the end of s (negative: s closes braces opened before)."""
    ok, in_math, depth, i = [False] * len(s), [False] * len(s), 0, 0
    while i < len(s):
        c = s[i]
        in_math[i] = math or dollar
        if c == "\\":
            two = s[i:i + 2]
            if two in ("\\(", "\\["):
                math = True
            elif two in ("\\)", "\\]"):
                math = False
            i += 2                      # a control symbol (\{, \\, \$, \ ) or the first letter of a command
            continue
        if c == "$":
            dollar = not dollar
            i += 2 if s[i:i + 2] == "$$" else 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == " " and depth <= 0 and not dollar:
            ok[i] = True
        i += 1
    return ok, in_math, (math, dollar), depth


def balanced(s):
    """Whether s closes every environment it opens (and opens every one it closes)."""
    found = BEGIN_END.findall(s)
    return (collections.Counter(n for k, n in found if k == "begin")
            == collections.Counter(n for k, n in found if k == "end"))


def alone(s):
    """Whether the stripped line s always stays alone on its line."""
    return (not s or s.startswith("%") or s.startswith("$$") or s.endswith("$$") or s == "\\\\\\\\"
            or LABEL.fullmatch(s) is not None or DISPLAY.search(code_part(s)) is not None
            or BEGIN_END.match(s) is not None or not balanced(code_part(s)))


def break_point(s, room, state, strict=True):
    """Where to break s (index of a space) so that s[:index] fits in room; None if s has no usable space. Strict (in
    a paragraph): the line before the break must not be one that stays alone, nor the next one start like one."""
    code = code_part(s)
    ok, in_math, _, _ = scan(code, *state)

    def allowed(i):
        head, tail = code[:i].rstrip(), code[i:].lstrip()
        if not tail or tail.startswith(("\\)", "[", "%")) or head.endswith("\\("):
            return False
        return not strict or (not tail.startswith(STARTERS) and not head.endswith(("\\\\", "$$"))
                              and not alone(head.strip()))

    cands = [i for i in range(1, len(code)) if ok[i] and code[i - 1] != " "]
    fitting = [i for i in reversed(cands) if i <= room]           # from the right
    best = next((i for i in fitting if allowed(i)), None)
    if best is None:
        return next((i for i in cands if i > room and allowed(i)), None)   # a line too long: its first usable break
    if in_math[best]:                   # a formula is not cut when that saves at most an eighth of the line
        floor = room - room // 8
        alt = next((i for i in fitting if floor <= i < best and not in_math[i] and allowed(i)), None)
        if alt is not None:
            return alt
    return best


def fill(lines, state, strict=True):
    """The lines of one paragraph, joined and refilled within WIDTH."""
    first = lines[0]
    indent = first[:len(first) - len(first.lstrip())]
    cont = indent + "    " if strict and first.lstrip().startswith("\\item") else indent   # latexindent's \item rule
    rest, current, out = " ".join(line.strip() for line in lines), indent, []
    code = code_part(rest)
    if "\\verb" not in code:                       # several spaces are one space for LaTeX: keep a single one
        rest = re.sub(r"(?<=\S) {2,}(?=\S)", " ", code) + rest[len(code):]
    while len(current) + len(rest) > WIDTH:
        cut = break_point(rest, WIDTH - len(current), state, strict)
        if cut is None:
            break
        out.append(current + rest[:cut].rstrip())
        state = scan(rest[:cut], *state)[2]
        rest, current = rest[cut:].lstrip(), cont
    out.append(current + rest)
    return out


def reflow(text):
    out, envs, state = [], [], (False, False)
    para, para_state, depth, closed = [], None, 0, False
    for line in text.split("\n"):
        code, s = code_part(line), line.strip()
        found = BEGIN_END.findall(code)
        opened = [n for k, n in found if k == "begin"]
        ended = [n for k, n in found if k == "end"]
        # rows of an aligned formula, matrix or table that spans several lines stay as written
        protected = any(e in NO_WRAP for e in envs) or any(n in NO_WRAP and n not in ended for n in opened)
        if protected or alone(s) or not any(e in CONTENT for e in envs):
            if para:
                out.extend(fill(para, para_state))
                para = []
            # a long line that stays alone (a display on one line, ...) is still split, but never joined
            long_alone = (not protected and len(line) > WIDTH and not s.startswith("%")
                          and any(e in CONTENT for e in envs))
            out.extend(fill([line], state, strict=False) if long_alone else [line])
        else:
            joins = (para and not closed and not s.startswith("\\item") and depth <= 0 and not state[1])
            if not joins:
                if para:
                    out.extend(fill(para, para_state))
                para, para_state, depth = [], state, 0
            para.append(line)
            depth += scan(code, *state)[3]
            closed = code != line or s.endswith("\\\\")      # a comment or a forced line break ends the paragraph
        for kind, name in found:
            if kind == "begin":
                envs.append(name)
            elif name in envs:
                del envs[len(envs) - 1 - envs[::-1].index(name)]
        state = scan(code, *state)[2]
    if para:
        out.extend(fill(para, para_state))
    return "\n".join(out)


def join_lone_delimiters(text):
    r"""Join a line ending with \( to the next line, and a line starting with \) to the previous one, so that no
    inline formula is cut right at its delimiter (only where neither line is a comment and no comment is crossed)."""
    out = []
    for line in text.split("\n"):
        s = line.strip()
        prev = out[-1] if out else None
        if (prev is not None and s.startswith("\\)") and prev.strip() and not prev.lstrip().startswith("%")
                and code_part(prev) == prev):
            out[-1] = prev.rstrip() + " " + s
            continue
        if (prev is not None and prev.rstrip().endswith("\\(") and s and not s.startswith("%")
                and code_part(prev) == prev):
            out[-1] = prev.rstrip() + " " + s
            continue
        out.append(line)
    return "\n".join(out)


FOOT = {"{": "⦃", "}": "⦄"}                # stand-ins for the braces of \footnote{...}


def mask_footnotes(text):
    r"""The text with the two braces of every \footnote{...} replaced by stand-ins, so that the footnote's text is
    refilled like the text around it (a line never breaks inside braces; latexindent.yaml gives a footnote no extra
    indentation). Comments are skipped; escaped braces \{ \} are not braces."""
    out, stack, i, comment = list(text), [], 0, False
    while i < len(text):
        c = text[i]
        if c == "\n":
            comment = False
        elif comment:
            pass
        elif c == "%":
            comment = True
        elif c == "\\":
            if text.startswith("\\footnote{", i):
                out[i + len("\\footnote")] = FOOT["{"]
                stack.append(True)
                i += len("\\footnote{")
                continue
            i += 2
            continue
        elif c == "{":
            stack.append(False)
        elif c == "}" and stack:
            if stack.pop():
                out[i] = FOOT["}"]
        i += 1
    return "".join(out)


def unmask_footnotes(text):
    return text.replace(FOOT["{"], "{").replace(FOOT["}"], "}")


def lay_out(text):
    text = latexindent(join_lone_delimiters(text))
    for _ in range(5):
        refilled = unmask_footnotes(reflow(mask_footnotes(text)))
        if refilled == text:
            return text
        text = latexindent(refilled)
    return text


def main(argv):
    write, check = "--write" in argv, "--check" in argv
    files = [pathlib.Path(a) for a in argv if not a.startswith("--")]
    if not files or (not write and not check and len(files) != 1):
        sys.exit(__doc__)
    if not write and not check:
        sys.stdout.buffer.write(lay_out(files[0].read_text(encoding="utf-8")).encode("utf-8"))
        return 0
    todo = []
    for f in files:
        old = f.read_text(encoding="utf-8")
        new = lay_out(old)
        if new != old:
            todo.append(f)
            if write:
                f.write_text(new, encoding="utf-8")
    for f in todo:
        print(f"{'laid out' if write else 'not laid out'}: {f}")
    return 1 if check and todo else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
