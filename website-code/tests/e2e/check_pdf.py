"""check_pdf.py FILE N [K [LINK ...]] — exit 1 unless the PDF has the headings 'Problem 1.' … 'Problem N.' (pypdf) and
prints no problem ID ('(#NNNN)'): the ID is only the order of arrival in the repository and means nothing to readers.
K (default 0): the number of shared results the PDF must end with, headed 'A.1.' … 'A.K.' after 'Appendix', without
their file names (printed in author mode only).  No reference may print '??'.
LINK ...: addresses the PDF must link to (the sources of its problems, website-code/bank/sources.py), each as often as it
is given.
The order of the problems is checked by the browser test on the LaTeX source (the \\bankproblem lines)."""
import collections
import re
import sys
import urllib.parse

import pypdf

path, n = sys.argv[1], int(sys.argv[2])
k = int(sys.argv[3]) if len(sys.argv) > 3 else 0
links = sys.argv[4:]
reader = pypdf.PdfReader(path)
text = "\n".join((p.extract_text() or "") for p in reader.pages)
found = sorted({int(k) for k in re.findall(r"Problem\s+(\d+)\s*\.", text)})
missing = [k for k in range(1, n + 1) if k not in found]
ids = re.findall(r"\(\s*#\s*\d{4}\s*\)", text)
appendix = text[text.rfind("Appendix"):] if k else ""
results = sorted({int(x) for x in re.findall(r"\bA\.(\d+)\.\s", appendix)})
print(f"{path}: {len(reader.pages)} pages, headings {found[:n]}{'…' if len(found) > n else ''}, IDs printed: {len(ids)}"
      + (f", appendix results {results}" if k else ""))
if missing:
    print(f"FAIL: expected headings 1..{n}, missing {missing}")
    sys.exit(1)
if ids:
    print(f"FAIL: the PDF prints problem IDs {ids[:5]}")
    sys.exit(1)
if k and results != list(range(1, k + 1)):
    print(f"FAIL: expected an Appendix with the results A.1..A.{k}, found {results}")
    sys.exit(1)
if re.search(r"\bA\.\d+\s*\(", appendix):
    print("FAIL: the Appendix prints the results' file names (author mode only)")
    sys.exit(1)
if "??" in text:
    print(f"FAIL: unresolved reference: …{text[max(0, text.find('??') - 60):text.find('??') + 20]!r}…")
    sys.exit(1)
if links:
    # a heading writes its link with %XX for what TeX would read (~ as %7E): the same address
    found = collections.Counter()
    for page in reader.pages:
        for a in page.get("/Annots") or []:
            action = a.get_object().get("/A")
            if action is not None and "/URI" in action.get_object():
                found[urllib.parse.unquote(str(action.get_object()["/URI"]))] += 1
    want = collections.Counter(urllib.parse.unquote(u) for u in links)
    missing = sorted(u for u in want if found[u] < want[u])
    print(f"{path}: {sum(found.values())} links, {len(want) - len(missing)} of the {len(want)} sources among them")
    if missing:
        print(f"FAIL: the PDF does not link to {missing}")
        sys.exit(1)
