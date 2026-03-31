from flask import Flask, render_template
import os
import re

app = Flask(__name__)

def extract_week_number(filename):
    match = re.search(r'(\d+)', filename)
    return int(match.group(1)) if match else float('inf')

# ✅ Make About Us the new home page
@app.route('/')
def home():
    return render_template('about.html')




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

    # Sort folders: magic_problems_&_puzzles first, then by week number
    def folder_sort_key(folder):
        if folder['name'] == 'magic_problems_&_puzzles':
            return (-1, folder['name'])
        return (extract_week_number(folder['name']), folder['name'])
    folders = sorted(folders, key=folder_sort_key)

    # Sort files by week number if possible
    files = sorted(files, key=lambda f: extract_week_number(f['name']))

    return folders + files

@app.route('/problems')
def problems():
    problems_dir = 'static/uploads/problems'
    problems_tree = scan_folder(problems_dir)
    return render_template('problems.html', problems_tree=problems_tree)