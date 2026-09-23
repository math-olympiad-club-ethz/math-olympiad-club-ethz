"""Repository layout — the ONE place that knows where things are.

    <repo>/
      association-documents/  club documents (statutes, founding minutes)
      problem-bank/           problems/, tags.yml, preamble.tex, references.bib, work-in-progress/, inspiration/
      website-code/           build.py, bank/ (this package), templates/, tools/, tests/, site/ (the site as served)
"""
import os

WEBSITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(WEBSITE)
BANK_DIR = os.path.join(REPO, "problem-bank")
PROBLEMS_DIR = os.path.join(BANK_DIR, "problems")
TAGS_FILE = os.path.join(BANK_DIR, "tags.yml")
PREAMBLE_FILE = os.path.join(BANK_DIR, "preamble.tex")
BIB_FILE = os.path.join(BANK_DIR, "references.bib")
SITE_DIR = os.path.join(WEBSITE, "site")
STATIC_DIR = os.path.join(SITE_DIR, "static")
BANK_DATA_DIR = os.path.join(STATIC_DIR, "bank")
BUSYTEX_DIR = os.path.join(STATIC_DIR, "busytex")
TEMPLATES_DIR = os.path.join(WEBSITE, "templates")
TOOLS_DIR = os.path.join(WEBSITE, "tools")
CACHE_DIR = os.path.join(WEBSITE, ".cache")

# Where the repository lives on GitHub: the site's "Edit" links and the "Propose a problem" page open
# github.com/<GITHUB_REPO>/edit|new/<GITHUB_BRANCH>/<PROBLEMS_REPO_PATH>/...
GITHUB_REPO = "math-olympiad-club-ethz/math-olympiad-club-ethz"
GITHUB_BRANCH = "main"
PROBLEMS_REPO_PATH = os.path.relpath(PROBLEMS_DIR, REPO).replace(os.sep, "/")
