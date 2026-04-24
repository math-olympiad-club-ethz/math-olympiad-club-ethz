#!/usr/bin/env python3
"""
Static site generator for Math Olympiad Club Zurich.
Run this script after adding new PDFs to regenerate the site.
Output goes to docs/ folder for GitHub Pages.
"""

import os
import re
from jinja2 import Environment, FileSystemLoader

OUTPUT_DIR = "docs"
STATIC_DIR = os.path.join(OUTPUT_DIR, "static")
TEMPLATES_DIR = "templates"
PROBLEMS_DIR = os.path.join(STATIC_DIR, "uploads", "problems")


def extract_week_number(filename):
    match = re.search(r'(\d+)', filename)
    return int(match.group(1)) if match else float('inf')


def folder_sort_key(folder):
    lowered = folder['name'].lower()
    number = extract_week_number(folder['name'])
    # Keep non-numbered collections (e.g. puzzle folders) before numbered sets.
    if number == float('inf'):
        return (0, lowered)
    return (1, number, lowered)


def file_sort_key(file_entry):
    lowered = file_entry['name'].lower()
    number = extract_week_number(file_entry['name'])
    is_solution = 'solution' in lowered
    # Keep numeric progression first and show solutions before problem statements for the same set.
    if number == float('inf'):
        return (float('inf'), 0 if is_solution else 1, lowered)
    return (number, 0 if is_solution else 1, lowered)


def scan_folder(path, rel_path=''):
    entries = os.listdir(path)
    folders = []
    files = []
    for entry in entries:
        if entry.startswith('.'):
            continue

        full_path = os.path.join(path, entry)
        entry_rel = os.path.join(rel_path, entry) if rel_path else entry
        if os.path.isdir(full_path):
            folders.append({
                'type': 'folder',
                'name': entry,
                'children': scan_folder(full_path, entry_rel)
            })
        else:
            if not entry.lower().endswith('.pdf'):
                continue
            files.append({
                'type': 'file',
                'name': entry,
                'path': entry_rel
            })

    folders = sorted(folders, key=folder_sort_key)
    files = sorted(files, key=file_sort_key)
    return folders + files


def build():
    # Clean only generated HTML files, leave static/ intact
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for f in os.listdir(OUTPUT_DIR):
        if f.endswith(".html"):
            os.remove(os.path.join(OUTPUT_DIR, f))

    # Setup Jinja2 environment
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    
    # Create static URL helper (replaces Flask's url_for)
    def static_url(filename):
        return f"static/{filename}"
    
    # Scan problems folder
    problems_tree = scan_folder(PROBLEMS_DIR)

    # Define pages to build
    pages = [
        ("index.html", "index.html", {}),
        ("problems.html", "problems.html", {"problems_tree": problems_tree}),
    ]

    # Load and customize base template for static output
    for template_name, output_name, context in pages:
        template = env.get_template(template_name)
        
        # Render with static paths
        html = template.render(
            url_for=lambda endpoint, **kw: static_url(kw['filename']) if 'filename' in kw else ("index.html" if endpoint == 'home' else f"{endpoint}.html"),
            **context
        )
        
        # Write output
        output_path = os.path.join(OUTPUT_DIR, output_name)
        with open(output_path, "w") as f:
            f.write(html)
        print(f"✅ Built {output_name}")

    print(f"\n🎉 Site built in '{OUTPUT_DIR}/' folder")
    print("Push to GitHub — the site deploys automatically via GitHub Actions.")


if __name__ == "__main__":
    build()
