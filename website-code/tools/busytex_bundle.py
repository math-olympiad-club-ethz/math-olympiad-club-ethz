#!/usr/bin/env python3
"""Build site/static/busytex/ — the static, pre-compressed BusyTeX bundle the problem-bank page compiles with.

    python3 tools/busytex_bundle.py --assets <dir with busytex.js/.wasm + texlive-*.js/.data>
        [--bodies site/static/bank/bodies.json] [--out site/static/busytex] [--staging .cache/busytex-staging]

Output (all git-ignored build products):
    busytex.js.gz, busytex.wasm.gz      the texlyre-busytex engine (combined binary — no pdftex-only build exists)
    club.fmt.gz                          pdfTeX format = \\documentclass[11pt]{article} + STITCHED preamble.tex,
                                         built by the WASM engine itself (tools/busytex_bundle_node.cjs)
    club-texlive.data.gz, club-texlive.json   trimmed TeX Live tree (files opened while building the format and
                                         compiling every problem, + completion policy) in the Emscripten
                                         file_packager metadata shape {files:[{filename,start,end}]}, incl. ls-R,
                                         texmf.cnf and a trimmed pdftex.map
    manifest.json                        sizes + sha256 of everything (cache busting), env, paths
    LICENSE-texlyre-busytex.txt, NOTICE.txt
The build log (report.json + selected files) is written to <staging>/build-report.json, not deployed.
The assets are checked against tools/busytex-assets.sha256 first.  Dates are fixed (SOURCE_DATE_EPOCH=0,
FORCE_SOURCE_DATE=1), so the same sources give the same bundle and the same engine version.

Requires: node (>=18), a local TeX Live (pdflatex, kpsewhich; supplies stmaryrd / bbm / algorithmicx /
algorithms which are absent from the WASM TeX Live packages, and generates the bbm PK bitmaps).
"""
import argparse
import glob
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # website-code/
sys.path.insert(0, ROOT)
from bank import paths  # noqa: E402
from bank import stitch  # noqa: E402

DATA_PACKAGES = ["texlive-basic.js", "texlive-recommended.js", "texlive-extra.js"]
# Packages used by preamble.tex that the WASM TeX Live (scheme-basic + latexrecommended + latexextra +
# fontsrecommended) does not contain.  Whole directories are offered; the recorder decides what is kept.
LOCAL_DIRS = ["tex/latex/stmaryrd", "fonts/tfm/public/stmaryrd", "fonts/type1/public/stmaryrd",
              "tex/latex/bbm-macros", "fonts/tfm/public/bbm",
              "tex/latex/algorithmicx", "tex/latex/algorithms"]
LOCAL_SKIP_EXT = (".pfm", ".afm", ".txt", ".md", ".pdf", ".dvi", ".mf", ".map")
ASSET_HASHES = os.path.join(ROOT, "tools", "busytex-assets.sha256")
NODE_TIMEOUT = 1200                  # seconds for the WASM format build + recorder compiles (about 40 s locally)

INI = r"""% club.ini — precompiled preamble of the Math Olympiad Club ETHZ problem bank (stitched mode).
% Built by the WASM pdfTeX:  pdftex -ini -jobname=club -progname=pdflatex &pdflatex club.ini
\def\BankStitched{}
\documentclass[11pt]{article}
\input{preamble}
\dump
"""

# Exercises every construct of the LaTeX census so lazily-loaded files (lstlang*, .fd, mt-*.cfg, fonts at odd
# sizes) are recorded even if no current problem uses them.
CENSUS_DOC = r"""\begin{document}
\bankproblem{1}{Census test}{Putnam 1989, A3}{0000}
\bankproblem{2}{Proposed}{}{new}
\bankmethods{Induction, Pigeonhole principle}
\begin{problem}
$\llbracket a,b\rrbracket$, $\mathscr{F}$, $\mathbbm{1}_A$, ${\scriptstyle\mathbbm{1}}$, $f\colon\mathbb{R}\to\mathbb{R}$,
$\mathcal{A}\,\mathfrak{g}\,\mathbb{Z}\,\boldsymbol{x}\,\mathbf{v}\,\mathsf{T}\,\mathtt{x}$, $\lVert x\rVert$, $\coloneqq$,
$\varnothing\,\lesssim\,\square\,\blacksquare$.\footnote{A footnote with $\mathbbm{1}$.} \textcolor{red}{red} \textcolor{gray}{gray}
\textbf{bold} \textit{it} \emph{em} \textsc{sc} \texttt{tt} \textsf{sf} {\tiny tiny} {\scriptsize s} {\footnotesize f} {\small s}
{\large l} {\Large L} {\LARGE L} {\huge h} {\Huge H} {\bfseries\itshape bi} \underline{u}.
\textsl{sl} {\small\textsl{s}} \textsf{\textbf{sfb} \textit{sfi} \textsl{sfsl} \textsc{sfsc}} \texttt{\textbf{ttb} \textit{tti} \textsl{ttsl} \textsc{ttsc}}
\textbf{\textsl{bsl} \textsc{bsc}} {\small\textbf{b} \textsf{s} \texttt{t}} {\footnotesize\textit{i} \textsf{s} \texttt{t}} Greek: αβγ ΓΔ φσ τ.
\def\censusshapes{$\boldsymbol{\mathcal{A}\nabla\leq\sum\int\mathsf{T}\mathtt{x}}\,x_{\boldsymbol{\mathcal F}_{\boldsymbol{\mathcal F}}}\,\boldsymbol{\mathfrak g}_{\boldsymbol{\mathfrak g}_{\boldsymbol{\mathfrak g}}}$ \textsf{\textbf{\textit{sbi}} \textbf{\textsl{sbs}}} \texttt{\textbf{\textit{tbi}} \textbf{\textsl{tbs}}} \textsc{\textsl{scsl}} \textit{\textup{up}} {\fontshape{ui}\selectfont ui} {\boldmath$\mathbbm{1}_{\mathbbm{1}}\,x\,\mathcal{F}$}}
{\tiny\censusshapes} {\scriptsize\censusshapes} {\footnotesize\censusshapes} {\small\censusshapes} \censusshapes {\large\censusshapes} {\Large\censusshapes} {\LARGE\censusshapes} {\huge\censusshapes} {\Huge\censusshapes}
See \eqref{p0000:eq1}, \cref{p0000:eq1}, \Cref{p0000:thm}, \ref{p0000:item}, \hyperref[p0000:thm]{link}, \href{https://ethz.ch}{ETH}, \url{https://ethz.ch/a_b}.
\begin{align}\label{p0000:eq1} a &= b \\ c &= d \end{align}
\begin{equation*} \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix} \begin{bmatrix} a \\ b \end{bmatrix} \begin{vmatrix} 1 & 0 \\ 0 & 1\end{vmatrix} \end{equation*}
\[ f(x) = \begin{cases} 1 & x>0 \\ 0 & \text{else}\end{cases} \qquad \sum_{k=1}^{n} \binom{n}{k} \int_0^1 \frac{\partial f}{\partial x}\,dx \quad \left\lfloor \tfrac{a}{b} \right\rfloor \quad \overset{!}{=} \quad \xrightarrow{\;n\to\infty\;} \]
\begin{center}\begin{tabular}{c|cl} 1 & 2 & three \\ \hline 3 & 4 & five \end{tabular}\end{center}
\begin{enumerate}\item one \label{p0000:item} \item two \begin{enumerate}\item[(a)] nested \end{enumerate}\end{enumerate}
\begin{itemize}\item bullet \item[--] dash\end{itemize}
$\begin{array}{cc} a & b \end{array}$
{\tiny $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} {\scriptsize $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} {\footnotesize $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} {\small $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$ {\large $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} {\Large $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} {\LARGE $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} {\huge $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} {\Huge $\mathbbm{1}_{\mathbbm{1}_{\mathbbm{1}}}$} $\boldsymbol{\mathbbm{1}}$
\begin{figure}[h]\centering\rule{2cm}{1cm}\caption{A caption.}\label{p0000:fig}\end{figure} \Cref{p0000:fig}.
\begin{table}[h]\centering\begin{tabular}{ll}x&y\end{tabular}\caption{Table.}\label{p0000:tab}\end{table}
\end{problem}
\begin{solution}
\begin{algorithm}\caption{Euclid}\label{p0000:alg}\begin{algorithmic}[1]\Procedure{Euclid}{$a,b$}\State $r\gets a \bmod b$\While{$r\not=0$}\State $a\gets b$\EndWhile\If{$a<b$}\Return $b$\Else\Return $a$\EndIf\EndProcedure\end{algorithmic}\end{algorithm}
\begin{lstlisting}[style=mypython]
def f(x):
    '''doc'''
    return [x ** 2 for x in range(10)]  # comment
\end{lstlisting}
\begin{lstlisting}[language=C]
int main(void) { return 0; }
\end{lstlisting}
\begin{theorem}\label{p0000:thm} Hi. \end{theorem}
\begin{lemma} L. \end{lemma}
\begin{proposition} P. \end{proposition}
\begin{corollary} C. \end{corollary}
\begin{definition} D. \end{definition}
\begin{claim} Cl. \end{claim}
\begin{remark} R. \end{remark}
\begin{proof} Trivial. \end{proof}
\subsection*{Alternative solution} Text with a\footnote{second footnote} note.
\begin{comment}
hidden
\end{comment}
\begin{bibentries}
@article{key, title = {Skipped}}
\end{bibentries}
\usetikzlibrary{arrows.meta}\tikzset{x=1cm}\pgfplotsset{compat=1.18}
\fbox{\parbox{0.6\linewidth}{\centering\small\textit{TikZ drawing placeholder of the propose page's preview.}}} $\fbox{\parbox{3cm}{\small\textit{in math}}}$
\begin{problemreferences}\refitem{1} A. Author, \emph{Title}, Journal \textbf{1} (2000), pp.~1--2. \url{https://x.y}\end{problemreferences}
\end{solution}
\banknosolution
\end{document}
"""


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def verify_assets(assets_dir):
    """Every asset listed in tools/busytex-assets.sha256 must have exactly that SHA-256 (downloaded or cached)."""
    bad = []
    with open(ASSET_HASHES) as f:
        for line in f:
            if not line.strip() or line.startswith("#"):
                continue
            want, name = line.split()
            h = hashlib.sha256()
            try:
                with open(os.path.join(assets_dir, name), "rb") as fh:
                    for chunk in iter(lambda: fh.read(1 << 20), b""):
                        h.update(chunk)
            except OSError:
                bad.append(f"{name}: missing")
                continue
            if h.hexdigest() != want:
                bad.append(f"{name}: sha256 {h.hexdigest()}, expected {want}")
    return bad


def gz(data, level=9):
    return gzip.compress(data, compresslevel=level, mtime=0)


def local_texmf():
    return subprocess.check_output(["kpsewhich", "--var-value", "TEXMFDIST"], text=True).strip()


def local_files(texmf):
    out = []
    for d in LOCAL_DIRS:
        full = os.path.join(texmf, d)
        if not os.path.isdir(full):
            print(f"warning: local TeX Live lacks {d}", file=sys.stderr)
            continue
        for f in sorted(os.listdir(full)):
            if os.path.isfile(os.path.join(full, f)) and not f.endswith(LOCAL_SKIP_EXT):
                out.append(f"{d}/{f}")
    return out


def harvest_pk(docs, staging, log):
    """bbm has no Type 1 fonts: compile the documents locally with a scratch TEXMFVAR so mktexpk generates
    exactly the PK bitmaps pdfTeX will need, then ship them (fonts/pk/ljfour/public/bbm/bbmNN.DPIpk)."""
    var = os.path.join(staging, "texmfvar")
    os.makedirs(var, exist_ok=True)
    env = dict(stitch.tex_env(), TEXMFVAR=var)      # fixed dates: the PK files carry METAFONT's "output" time
    for name, tex, files in docs:
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "main.tex"), "w", encoding="utf-8") as f:
                f.write(stitch.DOCUMENTCLASS + "\n\\def\\BankStitched{}\n\\input{preamble}\n" + tex)
            for n, p in files.items():
                shutil.copy(p, os.path.join(d, n))
            for _ in range(2):
                r = subprocess.run(stitch.PDFLATEX + ["main.tex"], cwd=d, env=env, capture_output=True, text=True, timeout=600)
            log(f"  local pdflatex {name}: exit {r.returncode}")
            if r.returncode != 0:
                bad = [l for l in r.stdout.split("\n") if l.startswith("!") or l.startswith("l.")]
                log("    " + "\n    ".join(bad[-6:]))
    pk = {}
    for p in glob.glob(os.path.join(var, "fonts", "pk", "**", "*pk"), recursive=True):
        rel = os.path.relpath(p, var)          # fonts/pk/ljfour/public/bbm/bbm10.657pk
        pk[rel] = p
    log(f"  harvested {len(pk)} PK files: {', '.join(sorted(os.path.basename(x) for x in pk))}")
    return pk


def ls_r(paths):
    """kpathsea ls-R for a tree given its file paths (relative to the tree root)."""
    dirs = {}
    for p in paths:
        d, f = os.path.split(p)
        dirs.setdefault(d, set()).add(f)
        while d:
            parent, name = os.path.split(d)
            dirs.setdefault(parent, set()).add(name)
            d = parent
    lines = ["% ls-R -- filename database for kpathsea; do not change this line."]
    for d in sorted(dirs):
        lines.append(("./" + d if d else "./") + ":")
        lines.extend(sorted(dirs[d]))
        lines.append("")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--assets", required=True, help="directory holding busytex.js/.wasm and texlive-*.js/.data")
    ap.add_argument("--bodies", default=os.path.join(paths.BANK_DATA_DIR, "bodies.json"))
    ap.add_argument("--out", default=paths.BUSYTEX_DIR)
    ap.add_argument("--staging", default=os.path.join(paths.CACHE_DIR, "busytex-staging"))
    ap.add_argument("--keep-staging", action="store_true")
    a = ap.parse_args(argv)
    t0 = time.time()
    log = lambda *a: print(*a, flush=True)
    bad = verify_assets(a.assets)
    if bad:
        print(f"the texlyre-busytex assets in {a.assets} are not the pinned ones (tools/busytex-assets.sha256):\n  "
              + "\n  ".join(bad) + "\ndelete the folder to download them again", file=sys.stderr)
        return 1

    if not os.path.exists(a.bodies):
        log("bodies.json missing → bank.stitch build")
        stitch.main(["build", "--out", os.path.dirname(a.bodies)])
    with open(a.bodies, encoding="utf-8") as f:
        bodies = json.load(f)["problems"]
    fig_dir = os.path.join(os.path.dirname(a.bodies), "figures")
    ids = sorted(int(k) for k in bodies)

    if os.path.exists(a.staging):
        shutil.rmtree(a.staging)
    os.makedirs(a.staging)
    docs = []
    for variant in ("problems", "solutions"):
        tex = stitch.make_main(bodies, ids, variant, filters="all problems")
        files = {os.path.basename(m): os.path.join(fig_dir, os.path.basename(m))
                 for m in stitch.re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", tex)}
        docs.append((f"all_{variant}", tex, files))
    docs.append(("census", CENSUS_DOC, {}))
    log(f"{len(ids)} problems; documents: {', '.join(d[0] for d in docs)}")

    log("harvesting bbm PK bitmaps with the local pdflatex …")
    pk = harvest_pk(docs, a.staging, log)

    texmf = local_texmf()
    job = {
        "assetsDir": os.path.abspath(a.assets), "dataPackages": DATA_PACKAGES,
        "localTexmf": texmf, "localFiles": local_files(texmf), "extraFiles": pk,
        "localPdftexMap": subprocess.check_output(["kpsewhich", "pdftex.map"], text=True).strip(),
        "preamble": paths.PREAMBLE_FILE, "ini": INI, "docs": [], "out": a.staging,
    }
    for name, tex, files in docs:
        p = os.path.join(a.staging, name + ".tex")
        with open(p, "w", encoding="utf-8") as f:
            f.write(tex)
        job["docs"].append({"name": name, "tex": p, "files": files})
    job_path = os.path.join(a.staging, "job.json")
    with open(job_path, "w") as f:
        json.dump(job, f, indent=1)
    log("running the WASM engine (format build + recorder compiles) …")
    subprocess.run(["node", os.path.join(ROOT, "tools", "busytex_bundle_node.cjs"), job_path], check=True, timeout=NODE_TIMEOUT)
    with open(os.path.join(a.staging, "report.json")) as f:
        report = json.load(f)
    failed = [d for d in report["docs"] if d["exit"] != 0]
    if failed:
        print("compile errors in: " + ", ".join(d["name"] for d in failed), file=sys.stderr)
        for d in failed:
            print("\n".join(d["errors"]), file=sys.stderr)
        return 1

    # ---- assemble the data package -----------------------------------------------------------------
    tree = os.path.join(a.staging, "texmf-dist")
    rel_paths = sorted(os.path.relpath(os.path.join(dp, f), tree) for dp, _, fs in os.walk(tree) for f in fs)
    with open(os.path.join(tree, "ls-R"), "w") as f:
        f.write(ls_r(rel_paths + ["ls-R"]))
    rel_paths = sorted(rel_paths + ["ls-R"])
    blob, index, pos = bytearray(), [], 0
    for rel in rel_paths:
        with open(os.path.join(tree, rel), "rb") as f:
            b = f.read()
        index.append({"filename": "/texlive/texmf-dist/" + rel, "start": pos, "end": pos + len(b)})
        blob += b
        pos += len(b)
    blob = bytes(blob)
    meta = {"files": index, "remote_package_size": len(blob), "package_uuid": "sha256-" + sha256(blob)}

    os.makedirs(a.out, exist_ok=True)
    for stale in glob.glob(os.path.join(a.out, "*")):
        os.remove(stale)
    manifest = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "files": {}, "env": {
        "TEXMFDIST": "/texlive/texmf-dist", "TEXMFVAR": "/texlive/texmf-dist/texmf-var", "TEXMFCACHE": "/texlive/texmf-dist/texmf-var",
        "TEXMFCNF": "/texlive/texmf-dist/web2c", "TEXMFLOG": "/tmp/texmf.log", "SOURCE_DATE_EPOCH": "0", "FORCE_SOURCE_DATE": "1",
        "TEXLIVE_REMOTE_ENDPOINT": ""},
        "fmt_path": "/texlive/texmf-dist/texmf-var/web2c/pdftex/club.fmt", "data_mount": "/texlive/texmf-dist",
        "pdftex_args": ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "--fmt", "/texlive/texmf-dist/texmf-var/web2c/pdftex/club.fmt", "main.tex"],
        "rerun_patterns": ["Rerun to get", "Label(s) may have changed", "rerunfilecheck", "run LaTeX again"]}
    build_report = {"report": report}

    def emit(name, data, compress=True):
        out_name = name + (".gz" if compress else "")
        payload = gz(data) if compress else data
        with open(os.path.join(a.out, out_name), "wb") as f:
            f.write(payload)
        manifest["files"][out_name] = {"bytes": len(payload), "raw_bytes": len(data), "sha256": sha256(data)}
        log(f"  {out_name:24s} {len(payload):>12,d} bytes" + (f"  (raw {len(data):,d})" if compress else ""))

    log("writing the bundle …")
    with open(os.path.join(a.assets, "busytex.js"), "rb") as f:
        emit("busytex.js", f.read())
    with open(os.path.join(a.assets, "busytex.wasm"), "rb") as f:
        emit("busytex.wasm", f.read())
    with open(os.path.join(a.staging, "club.fmt"), "rb") as f:
        emit("club.fmt", f.read())
    emit("club-texlive.data", blob)
    emit("club-texlive.json", json.dumps(meta, separators=(",", ":")).encode(), compress=False)
    manifest["data"] = {"files": len(index), "raw_bytes": len(blob)}
    with open(os.path.join(a.staging, "files.json")) as f:
        build_report["selection"] = json.load(f)
    versions = os.path.join(a.assets, "versions.txt")
    if os.path.exists(versions):
        with open(versions) as f:
            manifest["engine_versions"] = f.read()
    manifest["version"] = sha256("".join(v["sha256"] for k, v in sorted(manifest["files"].items())).encode())[:16]
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    with open(os.path.join(a.staging, "build-report.json"), "w") as f:      # local paths inside: not deployed
        json.dump(build_report, f, indent=1)
    lic = os.path.join(os.path.dirname(os.path.abspath(a.assets)), "LICENSE")
    for cand in (lic, os.path.join(a.assets, "LICENSE"), os.path.join(ROOT, "tools", "LICENSE-texlyre-busytex.txt")):
        if os.path.exists(cand):
            shutil.copy(cand, os.path.join(a.out, "LICENSE-texlyre-busytex.txt"))
            break
    with open(os.path.join(a.out, "NOTICE.txt"), "w") as f:
        f.write("This directory contains texlyre-busytex (https://github.com/TeXlyre/texlyre-busytex, AGPL-3.0):\n"
                "busytex.js / busytex.wasm (pdfTeX, XeTeX, LuaTeX, bibtex8, makeindex, kpathsea compiled to WebAssembly,\n"
                "TeX Live 2026) and a trimmed subset of the TeX Live texmf tree (club-texlive.data, GPL/LPPL per file),\n"
                "plus stmaryrd / bbm / algorithmicx / algorithms taken from a local TeX Live 2025 and bbm PK bitmaps\n"
                "generated by METAFONT.  club.fmt is a pdfTeX format built from preamble.tex.  See manifest.json.\n")
    total = sum(v["bytes"] for v in manifest["files"].values())
    log(f"total first download {total:,d} bytes ({total / 1e6:.2f} MB) in {time.time() - t0:.0f} s → {a.out}")
    if not a.keep_staging:
        shutil.rmtree(os.path.join(a.staging, "texmfvar"), ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
