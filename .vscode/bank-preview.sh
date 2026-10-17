#!/bin/sh
# Live preview of a problem-bank file in VS Code: LaTeX Workshop's "external build" (.vscode/settings.json) runs this
# script from the workspace folder each time a .tex file is saved.
# A problem file has no \documentclass, so LaTeX Workshop finds no root file and does not tell which file was saved:
# the script compiles the .tex file saved last, when it is a bank problem (problem-bank/problems/NNNN-*.tex or
# new-*.tex), a shared result (problem-bank/appendix/<name>.tex) or a seminar sheet file
# (problem-bank/seminar_antoine_problems_solutions/<sheet>/<name>.tex) or a staged seminar-repo problem
# (problem-bank/topics-in-competition-seminar/<group>/<sheet>/<name>.tex), through problem-bank/problems/_preview.tex
# (the shared preamble). The PDF is written next to the .tex (git-ignored): open it once from the Explorer, it
# refreshes after every save. Any other .tex (statutes.tex, preamble.tex, templates, ...) is left alone.
PATH="/Library/TeX/texbin:/usr/local/bin:/opt/homebrew/bin:$PATH"
WS=$(pwd)

f=$(python3 - "$WS" <<'EOF'
import os, sys
ws, best = sys.argv[1], (0.0, "")
skip = {".git", "node_modules", ".cache", "inspiration", "site"}
for d, dirs, files in os.walk(ws):
    dirs[:] = [x for x in dirs if x not in skip]
    for n in files:
        if n.endswith(".tex"):
            p = os.path.join(d, n)
            m = os.path.getmtime(p)
            if m > best[0]:
                best = (m, p)
print(best[1])
EOF
)

case "$f" in
    "$WS"/problem-bank/problems/[0-9][0-9][0-9][0-9]-*.tex | "$WS"/problem-bank/problems/new-*.tex | \
    "$WS"/problem-bank/appendix/[a-z0-9]*.tex | "$WS"/problem-bank/seminar_antoine_problems_solutions/*/[a-z0-9]*.tex | \
    "$WS"/problem-bank/topics-in-competition-seminar/*/*/[a-z0-9]*.tex) ;;
    *)
        echo "bank-preview: the last saved .tex is not a problem, a shared result or a seminar file: nothing to build."
        echo "  ($f)"
        exit 0 ;;
esac

dir=$(dirname "$f")
name=$(basename "$f" .tex)
echo "bank-preview: $f"
cd "$WS/problem-bank" || exit 1
# -bibtex-: no biber run (it fails on some Macs); a \cite then shows its key in the preview.
# shared results: problem-bank/appendix/ first, then the seminar's appendix/ (results not in the bank yet)
TEXINPUTS="$WS/problem-bank:$WS/problem-bank/seminar_antoine_problems_solutions:" BIBINPUTS="$WS/problem-bank:" latexmk -norc -pdf -bibtex- -f -interaction=nonstopmode \
    -synctex=1 -file-line-error "-usepretex=\\def\\bankfile{$dir/$name}" "-jobname=$name" "-outdir=$dir" \
    "$WS/problem-bank/problems/_preview.tex"
status=$?
# keep only the .tex, the .pdf and the .synctex.gz (Cmd-click in the PDF jumps to the source)
for ext in aux bbl bcf blg fdb_latexmk fls log out run.xml toc; do
    rm -f "$dir/$name.$ext"
done
exit $status
