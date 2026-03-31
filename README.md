# Math Olympiad Club Zurich

A static website for the Math Olympiad Club Zurich, hosted on GitHub Pages.

## How It Works

This site is **statically generated** — no server required. When you push changes, GitHub Actions automatically rebuilds and deploys the site.

## Adding New Problems

1. Export your `.tex` files from Overleaf to the appropriate subfolder under `static/uploads/problems/`
2. Run `python compile_and_clean.py` from the project root to compile PDFs
3. Commit and push — GitHub Actions will rebuild the site automatically

## Local Development

```bash
pip install jinja2
python build.py
# Open docs/index.html in browser, or:
cd docs && python -m http.server 8000
```

## Utility Scripts

### `compile_and_clean.py`
Compiles LaTeX `.tex` files into PDFs:
- Installs required LaTeX packages from `preamble.tex`
- Compiles all `.tex` files to PDF using `latexmk`
- Cleans up auxiliary files, leaving only PDFs

### `preamble.tex`
Shared LaTeX preamble with common packages and custom commands for problem documents.

### `build.py`
Static site generator — scans problems folder and generates HTML files in `docs/`.

## Legacy Files (can be removed)

- `app.py` — Old Flask app (no longer needed)
- `Procfile` — Render/Heroku config (no longer needed)
- `requirements.txt` — Can be simplified to just `jinja2`
