"""Check 6x9 black-ink/white-paper no-bleed paperback text geometry using the final PDF page count.

This is a text-boundary check, not image/bleed, manuscript fidelity, hosted
runtime, or KDP Previewer acceptance. Usage: python SCRIPT MANUSCRIPT.pdf
"""
import hashlib
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

pdf = Path(sys.argv[1])
bbox = subprocess.check_output(["pdftotext", "-bbox", str(pdf), "-"])
pages = ET.fromstring(bbox).findall(".//{http://www.w3.org/1999/xhtml}page")
count = len(pages)
effective = count + count % 2
inside = 27 if effective <= 150 else 36 if effective <= 300 else 45 if effective <= 500 else 54 if effective <= 700 else 63
failures = []
if effective < 24:
    failures.append({"error": "KDP_PAPERBACK_MINIMUM_PAGES", "effective_pages": effective})
if effective > 828:
    failures.append({"error": "KDP_PAPERBACK_MAXIMUM_PAGES", "effective_pages": effective})
words = 0
for index, page in enumerate(pages, 1):
    width, height = float(page.attrib["width"]), float(page.attrib["height"])
    if abs(width - 432) > .1 or abs(height - 648) > .1:
        failures.append({"page": index, "error": "EXPECTED_6X9_NO_BLEED_GEOMETRY"})
    left, right = (inside, 18) if index % 2 else (18, inside)
    for word in page.findall(".//{http://www.w3.org/1999/xhtml}word"):
        words += 1
        b = {k: float(v) for k, v in word.attrib.items()}
        if not (left - .1 <= b["xMin"] <= b["xMax"] <= width - right + .1
                and 18 - .1 <= b["yMin"] <= b["yMax"] <= height - 18 + .1):
            failures.append({"page": index, "word": word.text, "bounds": b})
if not words:
    failures.append({"error": "NO_EXTRACTABLE_TEXT"})
print(json.dumps({"pdf_sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
                  "qualification": "6x9-white-paper-no-bleed-text-geometry-only",
                  "pages": count, "effective_pages": effective,
                  "minimum_inside_pt": inside, "words_checked": words,
                  "passed": not failures, "failure_count": len(failures), "failures": failures[:100]}, indent=2))
sys.exit(bool(failures))
