import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { auditBookForPublishability } from "./qaPublishability.ts";

function issueCodes(report: ReturnType<typeof auditBookForPublishability>) {
  return new Set(report.issues.map((issue) => issue.code));
}

Deno.test("publishability blocks declared chapter-count drift and outline shells", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "Only chapter",
      content: "## Only chapter\n\nFull chapter content is being generated...",
      is_generated: false,
      word_count: 0,
    },
  ], {
    hasCover: true,
    bookType: "text",
    expectedChapterCount: 3,
  });

  const codes = issueCodes(report);
  assertEquals(report.status, "blocked");
  assert(codes.has("chapter_count_mismatch"));
  assert(codes.has("missing_chapter_numbers"));
  assert(codes.has("chapter_not_generated"));
  assert(codes.has("generation_stub_visible"));
});

Deno.test("publishability blocks unresolved reader-visible verification notes", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "Evidence",
      content: "A strong claim appears here [requires verification] before the conclusion.",
      is_generated: true,
      word_count: 12,
    },
  ], {
    hasCover: true,
    bookType: "academic",
    expectedChapterCount: 1,
  });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("unresolved_editorial_verification"));
});

Deno.test("generation truth does not invent blockers for a complete sequential manuscript", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "One",
      content: "Complete manuscript prose with a clear explanation and no generation markers.",
      is_generated: true,
      word_count: 10,
    },
    {
      chapter_number: 2,
      title: "Two",
      content: "A second complete chapter continues the manuscript without editorial leakage.",
      is_generated: true,
      word_count: 10,
    },
  ], {
    hasCover: true,
    bookType: "text",
    expectedChapterCount: 2,
  });

  const codes = issueCodes(report);
  assert(!codes.has("chapter_count_mismatch"));
  assert(!codes.has("missing_chapter_numbers"));
  assert(!codes.has("chapter_not_generated"));
  assert(!codes.has("generation_stub_visible"));
  assert(!codes.has("unresolved_editorial_verification"));
});
