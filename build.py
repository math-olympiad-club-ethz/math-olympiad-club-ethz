#!/usr/bin/env python3
"""
Static site generator for Math Olympiad Club Zurich.
Run this script after adding new PDFs to regenerate the site.
Output goes to docs/ folder for GitHub Pages.
"""

import os
import re
import shutil
from jinja2 import Environment, FileSystemLoader

OUTPUT_DIR = "docs"
STATIC_SRC = "static"
TEMPLATES_DIR = "templates"
PROBLEMS_DIR = "static/uploads/problems"


def extract_week_number(filename):
    match = re.search(r'(\d+)', filename)
    return int(match.group(1)) if match else float('inf')


def scan_folder(path, rel_path=''):
    entries = os.listdir(path)
    folders = []
    files = []
    for entry in entries:
        full_path = os.path.join(path, entry)
        entry_rel = os.path.join(rel_path, entry) if rel_path else entry
        if os.path.isdir(full_path):
            folders.append({
                'type': 'folder',
                'name': entry,
                'children': scan_folder(full_path, entry_rel)
            })
        else:
            files.append({
                'type': 'file',
                'name': entry,
                'path': entry_rel
            })

    def folder_sort_key(folder):
        if folder['name'] == 'magic_problems_&_puzzles':
            return (-1, folder['name'])
        return (extract_week_number(folder['name']), folder['name'])
    
    folders = sorted(folders, key=folder_sort_key)
    files = sorted(files, key=lambda f: extract_week_number(f['name']))
    return folders + files


def build():
    # Clean and create output directory
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

    # Copy static files
    shutil.copytree(STATIC_SRC, os.path.join(OUTPUT_DIR, "static"))

    # Setup Jinja2 environment
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    
    # Create static URL helper (replaces Flask's url_for)
    def static_url(filename):
        return f"static/{filename}"
    
    # Scan problems folder
    problems_tree = scan_folder(PROBLEMS_DIR)

    # Define pages to build
    pages = [
        ("home.html", "index.html", {}),
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
        
        # Fix url_for calls for pages (home, problems)
        html = html.replace("{{ url_for('home') }}", "index.html")
        html = html.replace("{{ url_for('problems') }}", "problems.html")
        
        # Write output
        output_path = os.path.join(OUTPUT_DIR, output_name)
        with open(output_path, "w") as f:
            f.write(html)
        print(f"✅ Built {output_name}")

    print(f"\n🎉 Site built in '{OUTPUT_DIR}/' folder")
    print("Push to GitHub and enable GitHub Pages on the 'docs' folder")


if __name__ == "__main__":
    build()
