"""The colour of each first-level topic of tags.yml, in the light and the dark theme: the trees of the Problems and the
Propose pages draw a topic and everything under it in it.  The one place they are set: data.py writes them into the
pages' tags, and the pages paint with them (tree-fold.js::paint).

COLOURS were checked with the dataviz palette validator in tags.yml's order: two topics next to each other stay apart
for everyone (OKLab difference 15 or more) and for colour-blind eyes (8 or more), in both themes, and each stands out from
the page (3:1).  tests/python checks it again.  A first-level topic added to tags.yml needs nothing here: it takes SPARE,
apart from all twelve wherever it goes, and a topic after that the colour that stands out most from the topics next to
it.  Never grey.  Write a new topic in COLOURS to keep its colour whatever the topics around it become.
"""
import math

COLOURS = {                               # slug: (light theme, dark theme), in tags.yml's order
    "analysis": ("#1e5ba1", "#4076b9"),
    "linear-algebra": ("#c06240", "#d17859"),
    "algebra": ("#169480", "#19ab94"),
    "polynomials": ("#883871", "#a2568a"),
    "inequalities": ("#436709", "#5d822f"),
    "number-theory": ("#8071c8", "#9386d8"),
    "combinatorics": ("#824c0a", "#a46313"),
    "probability": ("#148bba", "#31a0d0"),
    "geometry": ("#953447", "#af5362"),
    "puzzles": ("#219761", "#48aa77"),
    "computer-science": ("#783f89", "#915ca2"),
    "physics": ("#8f8214", "#a39631"),
}
SPARE = ("#5c38ed", "#684cff")            # an indigo 15 or more from each of the twelve (11 for colour-blind eyes)
BACKGROUNDS = ("#f4f1e8", "#0f0f0d")      # the pages' --bg in each theme (site.css)
NORMAL_FLOOR, CVD_FLOOR, CONTRAST_FLOOR = 15, 8, 3

# The validator's measures: the OKLab difference x 100, seen as is or through Machado, Oliveira & Fernandes (2009).
_MACHADO = {
    "protan": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deutan": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
}


def _linear(colour):
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
            for c in (int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5))]


def _oklab(rgb):
    r, g, b = rgb
    l, m, s = (math.copysign(abs(x) ** (1 / 3), x) for x in (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
                                                                0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
                                                                0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def difference(a, b, vision=None):
    """How far apart two colours look: the OKLab difference x 100, for everyone or for 'protan' / 'deutan' eyes."""
    def seen(colour):
        rgb = _linear(colour)
        if vision:
            rgb = [min(1, max(0, sum(m * c for m, c in zip(row, rgb)))) for row in _MACHADO[vision]]
        return _oklab(rgb)
    return 100 * math.dist(seen(a), seen(b))


def contrast(a, b):
    """The WCAG contrast ratio."""
    lum = lambda c: sum(w * x for w, x in zip((0.2126, 0.7152, 0.0722), _linear(c)))
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def fit(a, b):
    """How well two topic colours (light, dark) stand apart: 1 or more passes the validator in both themes."""
    return min(min(difference(x, y) / NORMAL_FLOOR, difference(x, y, "protan") / CVD_FLOOR,
                   difference(x, y, "deutan") / CVD_FLOOR) for x, y in zip(a, b))


def topic_colours(tags):
    """{slug: (light, dark)} for every first-level topic: its own, from COLOURS; for a topic added since, the colour no
    topic has (SPARE first) that stands out most from the topics next to it in tags.yml's order, or when every colour is
    taken, the one that stands out most from them."""
    tops = [slug for slug, t in tags["area"].items() if not t["parent"]]
    out = {slug: COLOURS[slug] for slug in tops if slug in COLOURS}
    palette = [SPARE, *COLOURS.values()]
    for i, slug in enumerate(tops):
        if slug in out:
            continue
        near = [out[s] for s in tops[max(0, i - 1):i + 2] if s != slug and s in out]
        taken = set(out.values())
        out[slug] = max(palette, key=lambda c: (c not in taken, min((fit(c, n) for n in near), default=math.inf)))
    return {slug: out[slug] for slug in tops}
