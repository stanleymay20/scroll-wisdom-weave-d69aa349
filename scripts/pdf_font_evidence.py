"""Inspect fonts in any exported PDF with Poppler, without requiring fixture labels.

Usage: python3 scripts/pdf_font_evidence.py MANUSCRIPT.pdf > font-report.json
Exit 0 proves only embedded subset fonts with Unicode mappings. It does not
prove manuscript completeness, glyph appearance, geometry, hosted performance,
or KDP Previewer acceptance. A fontless/image-only PDF fails this text-export gate.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


def inspect_font_listing(listing):
    """Parse pdffonts' final columns; font type/encoding names can contain spaces."""
    lines = listing.splitlines()
    if (len(lines) < 2
            or not re.search(r"\bemb\s+sub\s+uni\s+object ID\s*$", lines[0])
            or not re.fullmatch(r"[-\s]+", lines[1])):
        raise ValueError("PDF_FONT_LISTING_INVALID: unrecognized pdffonts header")
    fonts = []
    failures = []
    for line in lines[2:]:
        if not line.strip():
            continue
        match = re.fullmatch(r"(\S+)\s+(.+?)\s+(yes|no)\s+(yes|no)\s+(yes|no)\s+(\d+)\s+(\d+)\s*", line)
        if not match:
            raise ValueError(f"PDF_FONT_LISTING_INVALID: malformed font row: {line!r}")
        name, _, embedded, subset, unicode_map, object_id, generation = match.groups()
        font = {"name": name, "object_id": f"{object_id} {generation}",
                "embedded": embedded == "yes", "subset": subset == "yes",
                "unicode_mapping": unicode_map == "yes"}
        fonts.append(font)
        for field, error in (("embedded", "PDF_FONT_NOT_EMBEDDED"),
                             ("subset", "PDF_FONT_NOT_SUBSET"),
                             ("unicode_mapping", "PDF_FONT_UNICODE_MAPPING_MISSING")):
            if not font[field]:
                failures.append({"error": error, "font": name, "object_id": font["object_id"]})
    if not fonts:
        failures.append({"error": "PDF_NO_FONTS"})
    return {"qualification": "embedded-subset-fonts-and-unicode-mappings-only",
            "fonts": fonts, "passed": not failures, "failures": failures}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: pdf_font_evidence.py MANUSCRIPT.pdf")
    try:
        pdf = Path(sys.argv[1])
        digest = hashlib.sha256()
        with pdf.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        listing = subprocess.check_output(["pdffonts", str(pdf)], text=True, stderr=subprocess.PIPE)
        report = inspect_font_listing(listing)
        report["pdf_sha256"] = digest.hexdigest()
        print(json.dumps(report, indent=2))
        return int(not report["passed"])
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(json.dumps({"passed": False, "error": str(error)}, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
