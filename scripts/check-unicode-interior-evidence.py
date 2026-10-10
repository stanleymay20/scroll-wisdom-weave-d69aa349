"""Verify Poppler font and extracted-text evidence from the actual renderers."""
import json
import re
import subprocess
import sys
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
    (root / f"{name}-pdfinfo.txt").write_text(subprocess.check_output(["pdfinfo", str(pdf)], text=True))
    subprocess.run(["pdftoppm", "-f", "5", "-l", "8", "-r", "90", "-png", str(pdf), str(root / name)], check=True)
print(json.dumps({"unicode_interior_evidence": "pass", "qualification": "integration-only"}))
