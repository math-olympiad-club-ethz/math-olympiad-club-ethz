"""Load and validate tags.yml — the ONLY list of allowed tags."""
import itertools
import re

import yaml

from .problems import unprintable

TYPES = ("area", "methods", "difficulty", "origin")
ORIGIN_KINDS = {"university", "high-school", "book", "journal", "exam", "course",
                "folklore", "original", "interview"}


SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")      # the same shape as the slug of a problem file name


class TagError(Exception):
    pass


def _check_tag(t, where, errors):
    if not isinstance(t, dict):
        errors.append(f"{where}: tag must be a mapping, got {type(t).__name__}")
        return False
    slug = t.get("slug")
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        errors.append(f"{where}: bad slug {slug!r} (lowercase ASCII letters and digits, single hyphens between words)")
        return False
    if not isinstance(t.get("name"), str) or not t["name"].strip():
        errors.append(f"{where}: tag {slug!r} needs a display name")
    elif unprintable(t["name"], forbidden=set("\\{}~^")):         # names are printed on the PDF cover (filters)
        errors.append(f"{where}: tag {slug!r}: the name contains characters the PDFs cannot print: {' '.join(unprintable(t['name'], forbidden=set(chr(92) + '{}~^')))}")
    if "description" in t and t["description"] is not None and not isinstance(t["description"], str):
        errors.append(f"{where}: tag {slug!r}: description must be a string")
    if "aliases" in t and t["aliases"] is not None:
        if not isinstance(t["aliases"], list) or not all(isinstance(a, str) for a in t["aliases"]):
            errors.append(f"{where}: tag {slug!r}: aliases must be a list of strings")
    return True


def load_tags(path="tags.yml"):
    """Return a dict with, per type, an ordered mapping slug -> tag dict.

    Area tags get extra keys: 'parent' (slug or None), 'depth', 'children' (slugs),
    'path' (list of slugs from the root).  Methods get 'group'.  Origins have 'kind'.
    Raises TagError listing every problem found.
    """
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    errors = []
    for t in TYPES:
        if t not in raw:
            errors.append(f"tags.yml: missing top-level section {t!r}")
    if errors:
        raise TagError("\n".join(errors))

    area = {}

    def walk(nodes, parent, depth, path):
        if not isinstance(nodes, list):
            errors.append(f"area: children of {parent!r} must be a list")
            return
        for n in nodes:
            if not _check_tag(n, f"area under {parent!r}", errors):
                continue
            slug = n["slug"]
            if depth > 3:
                errors.append(f"area: {slug!r} is nested deeper than 3 levels")
            if slug in area:
                errors.append(f"area: duplicate slug {slug!r}")
                continue
            node = dict(n)
            node.pop("children", None)          # raw nested list; replaced by the slug list below
            node.update(parent=parent, depth=depth, path=path + [slug], children=[])
            area[slug] = node
            if parent:
                area[parent]["children"].append(slug)
            walk(n.get("children") or [], slug, depth + 1, path + [slug])

    walk(raw["area"], None, 1, [])

    methods = {}
    if not isinstance(raw["methods"], list):
        errors.append("methods: must be a list of groups")
    else:
        for g in raw["methods"]:
            if not isinstance(g, dict) or "group" not in g or "tags" not in g:
                errors.append("methods: each entry must be {group: ..., tags: [...]}")
                continue
            if not isinstance(g["group"], str) or not g["group"].strip():      # the pages print it as a list heading
                errors.append(f"methods: a group name must be a non-empty string (got {g['group']!r})")
                continue
            if g["tags"] is not None and not isinstance(g["tags"], list):
                errors.append(f"methods group {g['group']!r}: tags must be a list")
                continue
            for t in g["tags"] or []:
                if not _check_tag(t, f"methods group {g['group']!r}", errors):
                    continue
                if t["slug"] in methods:
                    errors.append(f"methods: duplicate slug {t['slug']!r}")
                    continue
                methods[t["slug"]] = dict(t, group=g["group"])

    difficulty = {}
    for t in raw["difficulty"] or []:
        if _check_tag(t, "difficulty", errors):
            if t["slug"] in difficulty:
                errors.append(f"difficulty: duplicate slug {t['slug']!r}")
            difficulty[t["slug"]] = dict(t)
    if list(difficulty) != ["easy", "medium", "hard", "extreme"]:
        errors.append(f"difficulty: slugs must be exactly easy, medium, hard, extreme in that order (got {list(difficulty)})")

    origin = {}
    for t in raw["origin"] or []:
        if _check_tag(t, "origin", errors):
            if t["slug"] in origin:
                errors.append(f"origin: duplicate slug {t['slug']!r}")
            if t.get("kind") not in ORIGIN_KINDS:
                errors.append(f"origin: {t['slug']!r} has kind {t.get('kind')!r}; allowed: {sorted(ORIGIN_KINDS)}")
            origin[t["slug"]] = dict(t)

    types = {"area": area, "methods": methods, "difficulty": difficulty, "origin": origin}
    for (n1, a), (n2, b) in itertools.combinations(types.items(), 2):
        clash = set(a) & set(b)
        if clash:
            errors.append(f"slug used in two tag types ({n1}/{n2}): {sorted(clash)}")

    if errors:
        raise TagError("\n".join(errors))
    return {"area": area, "methods": methods, "difficulty": difficulty, "origin": origin}
