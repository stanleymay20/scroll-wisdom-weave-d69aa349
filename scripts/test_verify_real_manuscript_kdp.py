"""Fail-closed real-manuscript KDP audit tests. Pure; no private book or PDF needed."""
import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).with_name("verify-real-manuscript-kdp.py")
spec = importlib.util.spec_from_file_location("real_kdp_verifier", source)
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)


def book():
    return {
        "book_id": "00000000-0000-4000-8000-000000000001",
        "release_sha": "a" * 40,
        "chapters": [
            {"chapter_number": i + 1, "title": f"Unique chapter {i + 1}",
             "content": " ".join(f"chapter{i}unique{j}" for j in range(1500)) + " ɛ ɔ α β ∑ ∫ ≤ ≥",
             "is_generated": True}
            for i in range(10)
        ]
    }


class RealManuscriptAuditTests(unittest.TestCase):
    def test_full_book_has_ordered_anchors_and_required_glyphs(self):
        data = book()
        anchors, glyphs, chars = auditor.source_anchors(data)
        self.assertEqual(len(anchors), 30)
        self.assertGreaterEqual(chars, auditor.BOOK_MIN_CHARS)
        self.assertEqual(glyphs, sorted("ɛɔαβ∑∫≤≥"))
        text = "\n\n".join(ch["content"] for ch in data["chapters"])
        result = auditor.compare_extracted_text(anchors, glyphs, text)
        self.assertTrue(result["passed"])
        self.assertEqual(result["anchors_matched"], 30)
        self.assertTrue(result["sampled_witnesses_only"])

    def test_omitted_final_chapter_fails_even_when_first_nine_match(self):
        data = book()
        anchors, glyphs, _ = auditor.source_anchors(data)
        text = "\n".join(ch["content"] for ch in data["chapters"][:-1])
        result = auditor.compare_extracted_text(anchors, glyphs, text)
        self.assertFalse(result["passed"])
        self.assertTrue(any(x["code"] == "ANCHOR_MISSING" and x["chapter"] == 10
                            for x in result["errors"]))

    def test_chapter_reordering_fails_monotonicity(self):
        data = book()
        anchors, glyphs, _ = auditor.source_anchors(data)
        text = "\n".join(ch["content"] for ch in reversed(data["chapters"]))
        result = auditor.compare_extracted_text(anchors, glyphs, text)
        self.assertFalse(result["passed"])
        self.assertIn("ANCHOR_OUT_OF_ORDER", {e["code"] for e in result["errors"]})

    def test_unsupported_unicode_loss_fails_with_codepoint_only(self):
        data = book()
        anchors, glyphs, _ = auditor.source_anchors(data)
        text = "\n".join(ch["content"].replace("≤", "") for ch in data["chapters"])
        result = auditor.compare_extracted_text(anchors, glyphs, text)
        self.assertFalse(result["passed"])
        self.assertIn({"code": "UNICODE_GLYPHS_MISSING", "codepoints": ["U+2264"]}, result["errors"])
        self.assertNotIn("chapter0unique", str(result))

    def test_invalid_source_and_incomplete_chapters_fail_closed(self):
        data = book()
        auditor.validate_identity(data)
        data["release_sha"] = "unknown"
        with self.assertRaisesRegex(ValueError, "EXACT_RELEASE_SHA_REQUIRED"):
            auditor.validate_identity(data)
        data = book()
        data["chapters"][6]["is_generated"] = False
        with self.assertRaisesRegex(ValueError, "CHAPTER_NOT_CONFIRMED_GENERATED"):
            auditor.source_anchors(data)
        data = book()
        data["chapters"][6]["chapter_number"] = 1
        with self.assertRaisesRegex(ValueError, "CHAPTER_SEQUENCE_INVALID"):
            auditor.source_anchors(data)

    def test_repeated_full_book_witnesses_cannot_fake_completeness(self):
        data = book()
        repeated = data["chapters"][0]["content"]
        for chapter in data["chapters"]:
            chapter["content"] = repeated
        with self.assertRaisesRegex(ValueError, "AMBIGUOUS_MANUSCRIPT_ANCHOR"):
            auditor.source_anchors(data)

    def test_ledger_binding_requires_exact_digest_and_real_event_reference(self):
        digest = "d" * 64
        eid = "00000000-0000-4000-8000-000000000123"
        self.assertEqual(auditor.audit_binding(None, "pdf", digest)["status"],
                         "MISSING_OPERATOR_LEDGER_REFERENCE")
        self.assertEqual(auditor.audit_binding({"pdf": {"sha256": "a" * 64, "export_id": eid}},
                                              "pdf", digest)["status"], "LEDGER_HASH_MISMATCH")
        accepted = auditor.audit_binding({"pdf": {"sha256": digest, "export_id": eid}}, "pdf", digest)
        self.assertEqual(accepted["status"], "OPERATOR_LEDGER_HASH_MATCH")
        self.assertEqual(accepted["independent_live_ledger_readback"], "NOT_PERFORMED")
        self.assertNotIn(eid, str(accepted))


if __name__ == "__main__":
    unittest.main()
