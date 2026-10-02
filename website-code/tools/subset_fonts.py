#!/usr/bin/env python3
"""Cut the website's fonts, site/static/fonts/moc-typewriter-*.woff2, from Computer Modern Unicode (CMU).

    npm pack computer-modern@0.1.3 && tar xzf computer-modern-0.1.3.tgz       # the CMU fonts, SIL OFL 1.1
    python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli
    /tmp/ft/bin/python tools/subset_fonts.py package/fonts site/static/fonts

The site is set in CMU Typewriter Text, the face LaTeX's \\texttt uses (the problem PDFs use Latin Modern, the same
design). The full files are about 200 KB each; the subsets keep Latin, Latin Extended-A, basic Greek (tag names such as
"Arithmetic functions (φ, σ, τ)"), punctuation and arrows, about 50 KB each. The fonts have no glyph for symbols such as
≡ ≠ ✓ or emoji: the browser draws those in a fallback font, so the site avoids them.

The SIL Open Font License reserves the name "Computer Modern Unicode" for unmodified fonts, and a subset is a modified
font: the subsets are renamed "MOC Typewriter". The copyright (name 0) and licence records (13, 14) are kept, and OFL.txt
ships next to the fonts.

GitHub Pages caches the fonts for 10 minutes and their URLs carry no version: give a regenerated font a new file name.
"""
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# Latin-1, Latin Extended-A, Romanian comma letters, accents, general punctuation, Greek, arrows, minus, euro,
# trademark, f-ligatures
UNICODES = ("U+0020-007E,U+00A0-00FF,U+0100-017F,U+0131,U+0152-0153,U+0218-021B,U+02BC,U+02C6-02C7,U+02D8-02DD,"
            "U+0300-030C,U+0326-0328,U+0370-03FF,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+FB00-FB06")

FACES = [  # CMU file, family, style, output file
    ("cmu-typewriter-text-500-roman", "MOC Typewriter", "Regular", "moc-typewriter-400.woff2"),
    ("cmu-typewriter-text-700-roman", "MOC Typewriter", "Bold", "moc-typewriter-700.woff2"),
]


def rename(font, family, style, source):
    ps = (family + "-" + style).replace(" ", "")
    names = font["name"]
    for nid in (1, 2, 3, 4, 6, 10, 16, 17, 21, 22):
        names.removeNames(nameID=nid)
    for nid, val in ((1, family), (2, style), (3, f"MOC:{ps}"), (4, family if style == "Regular" else f"{family} {style}"),
                     (6, ps), (10, f"Subset of {source} from the Computer Modern Unicode fonts, renamed because the SIL "
                                   "Open Font License 1.1 reserves that name for unmodified versions.")):
        names.setName(val, nid, 3, 1, 0x409)


def main(src, out):
    for name, family, style, filename in FACES:
        font = TTFont(Path(src) / f"{name}.ttf", recalcTimestamp=False)   # the same sources give the same files
        source = font["name"].getDebugName(4)
        opts = subset.Options()
        opts.layout_features = ["kern", "liga", "clig", "ccmp", "mark", "mkmk"]
        opts.name_IDs = [0, 1, 2, 3, 4, 6, 10, 13, 14]
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=subset.parse_unicodes(UNICODES))
        sub.subset(font)
        rename(font, family, style, source)
        path = Path(out) / filename
        font.flavor = "woff2"
        font.save(path)
        print(f"{path}: {path.stat().st_size} bytes, {len(font.getBestCmap())} characters, from {source}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
