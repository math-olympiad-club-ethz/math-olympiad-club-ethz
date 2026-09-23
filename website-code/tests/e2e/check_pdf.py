"""check_pdf.py FILE N — exit 1 unless the PDF has the headings 'Problem 1.' … 'Problem N.' (pypdf) and prints no
problem ID ('(#NNNN)'): the ID is only the order of arrival in the repository and means nothing to readers.
The order of the problems is checked by the browser test on the LaTeX source (the \\bankproblem lines)."""
import re
import sys

import pypdf

path, n = sys.argv[1], int(sys.argv[2])
reader = pypdf.PdfReader(path)
text = "\n".join((p.extract_text() or "") for p in reader.pages)
found = sorted({int(k) for k in re.findall(r"Problem\s+(\d+)\s*\.", text)})
missing = [k for k in range(1, n + 1) if k not in found]
ids = re.findall(r"\(\s*#\s*\d{4}\s*\)", text)
print(f"{path}: {len(reader.pages)} pages, headings {found[:n]}{'…' if len(found) > n else ''}, IDs printed: {len(ids)}")
if missing:
    print(f"FAIL: expected headings 1..{n}, missing {missing}")
    sys.exit(1)
if ids:
    print(f"FAIL: the PDF prints problem IDs {ids[:5]}")
    sys.exit(1)
