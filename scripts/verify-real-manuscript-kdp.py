#!/usr/bin/env python3
"""Fail-closed, privacy-minimizing analysis of *actual* ScrollLibrary manuscript exports.

Example (operator-supplied PRIVATE input; NEVER commit manuscript or generated PDFs):
  python3 scripts/verify-real-manuscript-kdp.py \
    --source-json /private/real-book.json \
    --pdf /private/book.pdf --kdp-pdf /private/book-kdp.pdf \
    --ledger-json /private/export-ledger-readback.json \
    --output-json /private/real-kdp-evidence.json

Source schema: {"book_id": "<uuid>", "release_sha": "<40-hex>",
  "chapters":[{"chapter_number":1,"title":"...","content":"...","is_generated":true}, ...]}.
Ledger schema: {"pdf":{"sha256":"<64-hex>","export_id":"<uuid>"},
  "kdp_pdf":{"sha256":"<64-hex>","export_id":"<uuid>"}}.

Outputs only file digests, numeric checks, and opaque chapter/anchor positions.
NO manuscript passages, user IDs, PDF text or credentials go into the report.
This is *sampled* lexical fidelity and PDF/font/6x9 text geometry evidence;
it does NOT prove every source token, visual typesetting, live deployment,
ledger provenance, KDP Previewer acceptance, or commercial GA.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
from collections import Counter

TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
SHA40 = re.compile(r"[0-9a-f]{40}\Z")
SHA64 = re.compile(r"[0-9a-f]{64}\Z")
UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\Z")
FIDELITY_GLYPHS = "ɛɔαβ∑∫≤≥"
CHAPTER_MIN_WORDS = 100
BOOK_MIN_CHARS = 100_000
BOOK_MIN_CHAPTERS = 10
ANCHOR_WORDS = 12
ANCHOR_OFFSETS = (0.08, 0.50, 0.92)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tokens(value):
    return TOKEN_RE.findall(unicodedata.normalize("NFKC", value).casefold())


def source_anchors(book):
    """Ordered, deterministic lexical witnesses across every full chapter."""
    chapters = book.get("chapters")
    if not isinstance(chapters, list) or len(chapters) < BOOK_MIN_CHAPTERS:
        raise ValueError("MANUSCRIPT_NOT_REPRESENTATIVE: at least ten complete chapters required")
    if [c.get("chapter_number") for c in chapters] != list(range(1, len(chapters) + 1)):
        raise ValueError("CHAPTER_SEQUENCE_INVALID")
    if len({c.get("title") for c in chapters}) != len(chapters):
        raise ValueError("CHAPTER_TITLES_NOT_UNIQUE")
    if any(c.get("is_generated") is not True for c in chapters):
        raise ValueError("CHAPTER_NOT_CONFIRMED_GENERATED")

    all_chars = sum(len(c.get("content") or "") for c in chapters)
    if all_chars < BOOK_MIN_CHARS:
        raise ValueError("MANUSCRIPT_NOT_REPRESENTATIVE: insufficient total content")

    anchors = []
    manuscript_glyphs = set()
    for i, chapter in enumerate(chapters, 1):
        body = chapter.get("content")
        if not isinstance(body, str) or not body.strip():
            raise ValueError("CHAPTER_CONTENT_MISSING")
        words = tokens(body)
        if len(words) < CHAPTER_MIN_WORDS:
            raise ValueError("CHAPTER_CONTENT_TOO_SHORT")
        manuscript_glyphs.update(g for g in FIDELITY_GLYPHS if g in body)
        for point, offset in enumerate(ANCHOR_OFFSETS):
            start = round((len(words) - ANCHOR_WORDS) * offset)
            anchors.append((i, point, tuple(words[start:start + ANCHOR_WORDS])))

    repeated = [key for key, count in Counter(a[2] for a in anchors).items() if count > 1]
    if repeated:
        raise ValueError("AMBIGUOUS_MANUSCRIPT_ANCHOR: repeated source witness")
    return anchors, sorted(manuscript_glyphs), all_chars


def compare_extracted_text(anchors, manuscript_glyphs, pdf_text):
    """Evidence deliberately covers bounded samples, not whole-book equality."""
    words = tokens(pdf_text)
    rendered = " " + " ".join(words) + " "
    cursor = 0
    issues = []
    for chapter_number, point, anchor in anchors:
        probe = " " + " ".join(anchor) + " "
        position = rendered.find(probe, cursor)
        if position < 0:
            reason = "ANCHOR_OUT_OF_ORDER" if rendered.find(probe) >= 0 else "ANCHOR_MISSING"
            issues.append({"code": reason, "chapter": chapter_number, "anchor_index": point})
        else:
            cursor = position + len(probe) - 1
    missing_glyphs = [g for g in manuscript_glyphs if g not in pdf_text]
    if missing_glyphs:
        issues.append({"code": "UNICODE_GLYPHS_MISSING", "codepoints": [f"U+{ord(g):04X}" for g in missing_glyphs]})
    return {"passed": not issues, "anchors_expected": len(anchors),
            "anchors_matched": len(anchors) - sum(x["code"].startswith("ANCHOR_") for x in issues),
            "extracted_word_count": len(words),
            "sampled_witnesses_only": True, "errors": issues[:100]}


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=180, check=False)
    return result.returncode, result.stdout, result.stderr


def inspect_pdf(pdf, is_kdp, anchors, glyphs):
    path = Path(pdf)
    if not path.is_file() or path.stat().st_size > 100_000_000 or path.read_bytes()[:5] != b"%PDF-":
        return {"passed": False, "errors": [{"code": "PDF_INVALID_OR_EXCEEDS_100MB"}]}
    record = {"sha256": sha256(path), "bytes": path.stat().st_size}
    for label, script in (("fonts", "pdf_font_evidence.py"),) + (
        (("geometry", "check-kdp-interior-geometry.py"),) if is_kdp else ()
    ):
        code, stdout, _ = command([sys.executable, str(Path(__file__).with_name(script)), str(path)])
        try:
            report = json.loads(stdout)
        except ValueError:
            report = {"passed": False, "errors": [{"code": f"{label.upper()}_REPORT_NOT_JSON"}]}
        # Font and geometry checkers are established independent repo scripts.
        record[label] = {
            "passed": code == 0 and report.get("passed") is True,
            "qualification": report.get("qualification"),
            "failure_count": report.get("failure_count", len(report.get("failures", []))),
            "pages": report.get("pages") if label == "geometry" else None,
            "minimum_inside_pt": report.get("minimum_inside_pt") if label == "geometry" else None,
            "errors": report.get("failures", report.get("errors", []))[:50],
        }
    code, extracted, _ = command(["pdftotext", "-layout", str(path), "-"])
    record["sampled_fidelity"] = (compare_extracted_text(anchors, glyphs, extracted) if code == 0
        else {"passed": False, "errors": [{"code": "PDF_TEXT_EXTRACTION_FAILED"}]})
    record["passed"] = (record["fonts"]["passed"] and record["sampled_fidelity"]["passed"]
        and (not is_kdp or record["geometry"]["passed"]))
    return record


def validate_identity(source):
    if not UUID.fullmatch(str(source.get("book_id", ""))):
        raise ValueError("SOURCE_BOOK_ID_REQUIRED")
    if not SHA40.fullmatch(str(source.get("release_sha", ""))):
        raise ValueError("EXACT_RELEASE_SHA_REQUIRED")


def audit_binding(ledger, label, actual_hash):
    record = (ledger or {}).get(label) if isinstance(ledger, dict) else None
    if not isinstance(record, dict) or not UUID.fullmatch(str(record.get("export_id", ""))):
        return {"status": "MISSING_OPERATOR_LEDGER_REFERENCE"}
    declared = str(record.get("sha256", ""))
    if not SHA64.fullmatch(declared):
        return {"status": "LEDGER_HASH_INVALID"}
    return {"status": "OPERATOR_LEDGER_HASH_MATCH" if declared == actual_hash else "LEDGER_HASH_MISMATCH",
            "export_id_provided": True,
            "independent_live_ledger_readback": "NOT_PERFORMED"}


def evaluate(source, pdf, kdp_pdf, ledger=None, source_sha=None):
    validate_identity(source)
    anchors, glyphs, count = source_anchors(source)
    ordinary = inspect_pdf(pdf, False, anchors, glyphs)
    interior = inspect_pdf(kdp_pdf, True, anchors, glyphs)
    for label, value in (("pdf", ordinary), ("kdp_pdf", interior)):
        value["ledger"] = audit_binding(ledger, label, value.get("sha256"))
    complete = (ordinary["passed"] and interior["passed"]
        and all(v["ledger"]["status"] == "OPERATOR_LEDGER_HASH_MATCH" for v in (ordinary, interior)))
    return {
        "schema_version": 1,
        "source_release_sha": source["release_sha"],
        "source_json_sha256": source_sha,
        "source_chapter_count": len(source["chapters"]),
        "source_char_count": count,
        "source_glyph_codepoints": [f"U+{ord(g):04X}" for g in glyphs],
        "pdf": ordinary, "kdp_pdf": interior,
        "local_automated_checks_passed": bool(complete),
        "independent_ledger_provenance": "NOT_VERIFIED",
        "actual_hosted_export_origin": "NOT_VERIFIED",
        "human_visual_review": "PENDING",
        "kdp_previewer_acceptance": "PENDING",
        "commercial_kdp_claim": "NO_GO",
        "commercial_ga": "NO_GO",
        "qualification_scope": "sampled-manuscript-fidelity-and-mechanical-font-geometry-only",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-json", required=True)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--kdp-pdf", required=True)
    parser.add_argument("--ledger-json")
    parser.add_argument("--output-json", required=True)
    args = parser.parse_args()
    output = Path(args.output_json)
    try:
        source_path = Path(args.source_json)
        source = json.loads(source_path.read_text(encoding="utf-8"))
        ledger = json.loads(Path(args.ledger_json).read_text(encoding="utf-8")) if args.ledger_json else None
        report = evaluate(source, args.pdf, args.kdp_pdf, ledger, sha256(source_path))
        success = report["local_automated_checks_passed"]
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        # Do not write raw exception detail containing manuscript/path content.
        report = {"schema_version": 1, "local_automated_checks_passed": False,
                  "commercial_ga": "NO_GO", "error_code": type(error).__name__,
                  "detail": str(error).split(":")[0][:90]}
        success = False
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Real-manuscript mechanical audit: {'PASS (NOT GA)' if success else 'FAIL/BLOCKED'}; report: {output}")
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
