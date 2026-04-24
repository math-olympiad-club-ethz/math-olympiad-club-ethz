import os
import subprocess
import shutil
import re


# Choose your LaTeX compiler (latexmk is safer if installed)
LATEX_CMD = ["latexmk", "-pdf", "-interaction=nonstopmode", "-halt-on-error"]

PREAMBLE_PATH = "preamble.tex"

def install_latex_packages_from_preamble(preamble_path):
    if not os.path.exists(preamble_path):
        print(f"No preamble.tex found at {preamble_path}")
        return
    with open(preamble_path, "r") as f:
        content = f.read()
    # Find all \usepackage{...} and \RequirePackage{...}
    packages = re.findall(r'\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?{([^}]*)}', content)
    # Flatten comma-separated package lists
    pkgs = set()
    for pkg in packages:
        pkgs.update([p.strip() for p in pkg.split(",")])
    # Try to install each package with tlmgr
    for pkg in pkgs:
        print(f"Installing LaTeX package: {pkg}")
        try:
            result = subprocess.run(["tlmgr", "install", pkg], check=False, capture_output=True, text=True)
            if "permission" in result.stderr.lower() or "permission" in result.stdout.lower():
                print(f"⚠️  Permission denied for {pkg}. Assuming it's already installed.")
                continue
            if result.returncode != 0:
                print(f"⚠️  Could not install {pkg}. Continuing anyway.")
        except Exception as e:
            print(f"Could not install {pkg}: {e}")

def compile_tex_to_pdf(tex_path):
    folder = os.path.dirname(tex_path)
    tex_name = os.path.basename(tex_path)
    try:
        subprocess.run(LATEX_CMD + [tex_name], cwd=folder, check=True)
    except subprocess.CalledProcessError:
        print(f"❌ Error compiling {tex_path}")

def clean_folder(folder):
    for root, dirs, files in os.walk(folder):
        for f in files:
            if not f.endswith(".pdf"):
                os.remove(os.path.join(root, f))

def main(root_folder):
    # Step 1: Install packages from preamble.tex
    install_latex_packages_from_preamble(PREAMBLE_PATH)

    # Step 2: Collect all .tex files and folders containing them
    tex_files = []
    tex_dirs = set()
    for root, dirs, files in os.walk(root_folder):
        for f in files:
            if f.endswith(".tex"):
                tex_files.append(os.path.join(root, f))
                tex_dirs.add(root)

    # Step 3: Copy preamble.tex into each folder containing .tex files
    for d in tex_dirs:
        shutil.copy(PREAMBLE_PATH, os.path.join(d, "preamble.tex"))

    # Step 4: Compile all
    for tex in tex_files:
        print(f"Compiling {tex}...")
        compile_tex_to_pdf(tex)

    # Step 5: Clean up (remove everything except PDFs)
    for root, dirs, files in os.walk(root_folder):
        for f in files:
            if not f.endswith(".pdf"):
                os.remove(os.path.join(root, f))
    print("✅ Done. Only PDFs remain.")

if __name__ == "__main__":
    main("docs/static/uploads/problems")