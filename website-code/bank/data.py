"""Site data for the problem bank: the problem index and the tag catalogue as JSON.

Visibility rule: every problem with a final number is published.  The ones without `review: human` are proposed
(is_proposed): their index row says so, the origin line of their PDF heading ends with PROPOSED_NOTE, and the Problems
page lists them only behind its "Show proposed problems" switch.  In preview mode (build.py --preview) every problem is
included and carries its review status so the maintainer can review in the real UI (nothing is marked proposed there);
new-*.tex files appear under their provisional number.
"""
import re

from .problems import origin_label


PROPOSED_NOTE = "proposed, not reviewed yet"


def is_proposed(p):
    """A published problem that nobody has reviewed yet: no `review: human` (unknown values count as unreviewed)."""
    return p.get("review") != "human"


def proposed_origin(origin):
    """The origin line of a proposed problem's PDF heading: its origin, then PROPOSED_NOTE."""
    return f"{origin}; {PROPOSED_NOTE}" if origin else PROPOSED_NOTE[0].upper() + PROPOSED_NOTE[1:]


def visible_problems(problems, preview=False):
    """The problems that go to the site.  Never raises.  A problem without an ID (new-*.tex) is never listed; a
    provisional ID is shown only in preview.  Unreviewed problems are published too, marked proposed (is_proposed)."""
    if preview:
        return [p for p in problems if p.get("id") is not None]
    return [p for p in problems if p.get("id") is not None and not p.get("provisional")]


def origin_year(p):
    m = re.match(r"^(\d{4})", p.get("origin_date") or "")
    return int(m.group(1)) if m else None


def index_entry(p, tags):
    """One row of index.json.  Derived fields are computed here, never typed by hand."""
    return {
        "id": p["id"],
        "title": p["title"],
        "file": p["file"],
        "area": list(p["area"]),
        "methods": list(p["methods"]),
        "difficulty": p["difficulty_effective"],                     # human, else AI, else "unrated"
        "difficultySource": "human" if p["difficulty"] else ("ai" if p["difficulty_ai"] else ""),
        "origin": p["origin"] or "",
        "alsoIn": list(p["also_in"]),
        "originDate": p["origin_date"] or "",
        "originYear": origin_year(p),
        "originLabel": origin_label(p, tags),
        "hasSolution": bool(p["has_solution"]),
        "partial": p["status"] == "partial",
        "solved": bool(p["solved"]),
        "review": p["review"],
        "provisional": bool(p.get("provisional")),                   # new-*.tex shown under its future number (preview only)
    }


def build_index(problems, tags, preview=False):
    rows = [dict(index_entry(p, tags), proposed=not preview and is_proposed(p)) for p in visible_problems(problems, preview)]
    rows.sort(key=lambda r: r["id"])
    return {"preview": bool(preview), "count": len(rows), "problems": rows}


def _tag_public(t, extra=()):
    out = {"slug": t["slug"], "name": t["name"], "description": t.get("description") or "",
           "aliases": list(t.get("aliases") or [])}
    for k in extra:
        out[k] = t.get(k)
    return out


def build_tag_catalogue(tags):
    """tags.json: the four tag types as the browser needs them (area keeps parent/children)."""
    area = []
    for slug, t in tags["area"].items():
        e = _tag_public(t)
        e.update(parent=t["parent"], children=list(t["children"]), depth=t["depth"])
        area.append(e)
    methods = [dict(_tag_public(t), group=t["group"]) for t in tags["methods"].values()]
    difficulty = [_tag_public(t) for t in tags["difficulty"].values()]
    origin = [dict(_tag_public(t), kind=t.get("kind")) for t in tags["origin"].values()]
    return {"area": area, "methods": methods, "difficulty": difficulty, "origin": origin}
