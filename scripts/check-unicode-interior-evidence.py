"""Verify Poppler font and extracted-text evidence from the actual renderers."""
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(sys.argv[1])
for name in ("canonical", "legacy", "kdp"):
    pdf = root / f"{name}.pdf"
    fonts = subprocess.check_output(["pdffonts", str(pdf)], text=True)
    (root / f"{name}-pdffonts.txt").write_text(fonts)
    rows = fonts.splitlines()[2:]
    if len(rows) != 5 or any(not re.search(r"\byes\s+yes\s+yes\b", row) for row in rows):
        raise SystemExit(f"{name}: expected five embedded subset fonts with Unicode mappings\n{fonts}")
    text = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)
    (root / f"{name}-text.txt").write_text(text)
    # Every glyph must survive in each style, not just in a title/header. Hebrew
    # extraction can include bidi controls; visual direction is reviewed in PNGs.
    for style in ("Regular", "Bold", "Italic", "Both", "Mono"):
        line = next((line for line in text.splitlines() if f"{style}:" in line), "")
        if any(glyph not in line for glyph in "ɛɔαβ∑∫≤≥"):
            raise SystemExit(f"{name}: missing Unicode in {style}: {line!r}")
    if any(glyph not in text for glyph in "שלום"):
        raise SystemExit(f"{name}: Hebrew glyphs missing from extracted text")
    # Check the entire known fixture, including prose adjoining a table. Font
    # coverage alone cannot detect a parser dropping a supported text block.
    body = "\n".join(line for line in text.splitlines()
                     if "Ɔsɛi" not in line
                     and line.strip() not in ("Languages and notation", "Pagination contract")
                     and not re.fullmatch(r"\s*\d+\s*", line))
    normalized = re.sub(r"\s+", " ", body)
    quote = "A quoted passage with ɛ ɔ α β ∑ ∫ ≤ ≥."
    if normalized.count(quote) != 1:
        raise SystemExit(f"{name}: quoted passage after table is missing or duplicated")
    if list(map(int, re.findall(r"Paragraph (\d+)\.", body))) != list(range(1, 31)):
        raise SystemExit(f"{name}: pagination paragraphs are missing, reordered or duplicated")
    prose = "This manuscript fixture exercises wrapping and page transitions with ɛ and ɔ."
    if normalized.count(prose) != 360:
        raise SystemExit(f"{name}: expected all 360 pagination-fixture sentences")
    # Column coordinates prove empty cells/headers preserve their positions;
    # finding both strings somewhere in extracted text would miss a shift.
    bbox = subprocess.check_output(["pdftotext", "-bbox", str(pdf), "-"], text=True)
    (root / f"{name}-bbox.html").write_text(bbox)
    tree = ET.fromstring(bbox)
    ns = {"x": "http://www.w3.org/1999/xhtml"}
    positions = {}
    for page_index, page in enumerate(tree.findall(".//x:page", ns)):
        width, height = float(page.attrib["width"]), float(page.attrib["height"])
        for word in page.findall(".//x:word", ns):
            box = word.attrib
            if not (0 <= float(box["xMin"]) <= float(box["xMax"]) <= width
                    and 0 <= float(box["yMin"]) <= float(box["yMax"]) <= height):
                raise SystemExit(f"{name}: text outside page bounds: {word.text!r}")
            positions.setdefault(word.text, []).append((page_index, float(box["xMin"])))
    for marker, header in (("LeftMarker", "LeftSlot"), ("MiddleMarker", "MiddleSlot"),
                           ("RightMarker", "RightSlot"), ("BlankHeaderLeft", "HeadLeft"),
                           ("BlankHeaderRight", "HeadRight")):
        m, h = positions.get(marker, []), positions.get(header, [])
        if len(m) != 1 or len(h) != 1 or m[0][0] != h[0][0] or abs(m[0][1] - h[0][1]) > 1:
            raise SystemExit(f"{name}: {marker} shifted from {header} column: {m}, {h}")
    (root / f"{name}-pdfinfo.txt").write_text(subprocess.check_output(["pdfinfo", str(pdf)], text=True))
    subprocess.run(["pdftoppm", "-f", "5", "-l", "8", "-r", "90", "-png", str(pdf), str(root / name)], check=True)
print(json.dumps({"unicode_interior_evidence": "pass", "qualification": "integration-only"}))
