"""Exercise fail-closed font evidence independently of the synthetic fixture."""
import unittest
from pdf_font_evidence import inspect_font_listing

HEADER = "name                                 type              encoding         emb sub uni object ID\n------------------------------------ ----------------- ---------------- --- --- --- ---------\n"


class FontEvidenceTests(unittest.TestCase):
    def test_real_manuscript_may_use_only_one_font(self):
        report = inspect_font_listing(HEADER + "ABCDEF+DejaVuSans CID TrueType Identity-H yes yes yes 4 0\n")
        self.assertTrue(report["passed"])
        self.assertEqual(report["fonts"][0]["object_id"], "4 0")
        self.assertEqual(len(report["fonts"]), 1)

    def test_every_font_must_pass_even_when_other_fonts_are_valid(self):
        report = inspect_font_listing(HEADER
            + "ABCDEF+DejaVuSans CID TrueType Identity-H yes yes yes 4 0\n"
            + "Helvetica Type 1 WinAnsi no no no 8 0\n")
        self.assertFalse(report["passed"])
        self.assertEqual([failure["error"] for failure in report["failures"]],
                         ["PDF_FONT_NOT_EMBEDDED", "PDF_FONT_NOT_SUBSET", "PDF_FONT_UNICODE_MAPPING_MISSING"])
        self.assertTrue(all(failure["font"] == "Helvetica" for failure in report["failures"]))

    def test_each_missing_property_fails_separately(self):
        for flags, expected in (("no yes yes", "PDF_FONT_NOT_EMBEDDED"),
                                ("yes no yes", "PDF_FONT_NOT_SUBSET"),
                                ("yes yes no", "PDF_FONT_UNICODE_MAPPING_MISSING")):
            with self.subTest(flags=flags):
                report = inspect_font_listing(HEADER + f"DejaVuSans TrueType WinAnsi {flags} 4 0\n")
                self.assertFalse(report["passed"])
                self.assertEqual(report["failures"][0]["error"], expected)
                self.assertEqual(len(report["failures"]), 1)

    def test_fontless_pdf_cannot_pass_the_text_export_gate(self):
        report = inspect_font_listing(HEADER)
        self.assertFalse(report["passed"])
        self.assertEqual(report["failures"], [{"error": "PDF_NO_FONTS"}])

    def test_unknown_headers_and_malformed_rows_fail_closed(self):
        for listing in ("", "unexpected\n-----\n", HEADER + "truncated-font-row\n",
                        HEADER + "DejaVuSans TrueType Identity-H yes yes yes 4 0 unexpected\n"):
            with self.subTest(listing=listing):
                with self.assertRaisesRegex(ValueError, "PDF_FONT_LISTING_INVALID"):
                    inspect_font_listing(listing)


if __name__ == "__main__":
    unittest.main()
