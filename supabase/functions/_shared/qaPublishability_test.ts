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


Deno.test("near-10 QA blocks raw figure-generation instructions", () => {
  const report = auditBookForPublishability([{
    chapter_number: 1,
    title: "Exit Strategy",
    content: "Figure: A clean, consulting-style linear spectrum diagram showing exit options.",
    is_generated: true,
    word_count: 10,
  }], { hasCover: true, bookType: "professional", expectedChapterCount: 1, requiresEvidence: true });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("reader_visible_authoring_directive"));
});

Deno.test("near-10 QA blocks expired fixed action deadlines", () => {
  const report = auditBookForPublishability([{
    chapter_number: 1,
    title: "Finance",
    content: "Action 1. Deadline: End of Q4 2024. Complete the finance review.",
    is_generated: true,
    word_count: 12,
  }], { hasCover: true, bookType: "professional", expectedChapterCount: 1, requiresEvidence: true });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("stale_action_deadline"));
});

Deno.test("near-10 QA blocks uncited material company-event claims", () => {
  const report = auditBookForPublishability([{
    chapter_number: 1,
    title: "Mergers",
    content: "Salesforce acquired Celonis in 2024 for €11 billion.",
    is_generated: true,
    word_count: 8,
  }], { hasCover: true, bookType: "professional", expectedChapterCount: 1, requiresEvidence: true });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("uncited_material_claim"));
});

Deno.test("near-10 QA blocks categorical prescriptions in evidence-governed books", () => {
  const report = auditBookForPublishability([{
    chapter_number: 1,
    title: "Legal Form",
    content: "For ambitious startups, the GmbH is the only viable choice.",
    is_generated: true,
    word_count: 10,
  }], { hasCover: true, bookType: "professional", expectedChapterCount: 1, requiresEvidence: true });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("unsupported_absolute_prescription"));
});

Deno.test("near-10 QA accepts a locally evidenced material claim", () => {
  const report = auditBookForPublishability([{
    chapter_number: 1,
    title: "Funding",
    content: "Germany reported €3.4 billion in startup investment in 2026 [1].\n\n## References\n[1] KfW Research, 2026.",
    is_generated: true,
    word_count: 15,
  }], { hasCover: true, bookType: "professional", expectedChapterCount: 1, requiresEvidence: true });

  assert(!issueCodes(report).has("uncited_material_claim"));
});


Deno.test("near-10 QA does not treat ordinary requires prose as an external factual claim", () => {
  const report = auditBookForPublishability([{
    chapter_number: 1,
    title: "Implementation",
    content: "Successful implementation requires executive sponsorship and clear ownership.",
    is_generated: true,
    word_count: 8,
  }], { hasCover: true, bookType: "professional", expectedChapterCount: 1, requiresEvidence: true });

  assert(!issueCodes(report).has("uncited_material_claim"));
});

Deno.test("near-10 QA recognizes standard multi-author citations as local evidence", () => {
  const report = auditBookForPublishability([{
    chapter_number: 1,
    title: "Evidence",
    content: "Research reported a 24% improvement in 2025 (Smith & Jones, 2025).\n\n## References\nSmith, A., & Jones, B. (2025). Example study.",
    is_generated: true,
    word_count: 18,
  }], { hasCover: true, bookType: "professional", expectedChapterCount: 1, requiresEvidence: true });

  assert(!issueCodes(report).has("uncited_material_claim"));
});


Deno.test("publishability blocks raw figure-generation instructions from reader-visible prose", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "Exit Strategy",
      content: "Figure: A clean, consulting-style linear spectrum diagram showing exit options.",
      is_generated: true,
      word_count: 11,
    },
  ], {
    hasCover: true,
    bookType: "professional",
    expectedChapterCount: 1,
  });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("reader_visible_authoring_directive"));
});

Deno.test("publishability blocks expired action deadlines such as the Germany-book 2024/2025 defects", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "Finance Plan",
      content: "Deadline: 30 November 2024 — complete the filing. Deadline: April 2025 — update the forecast.",
      is_generated: true,
      word_count: 14,
    },
  ], {
    hasCover: true,
    bookType: "professional",
    expectedChapterCount: 1,
  });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("stale_action_deadline"));
});

Deno.test("publishability blocks repeated chapter-level AI generation notices", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "One",
      content: "AI-Assisted Content Notice: This chapter was generated with AI.",
      is_generated: true,
      word_count: 9,
    },
  ], {
    hasCover: true,
    bookType: "text",
    expectedChapterCount: 1,
  });

  assertEquals(report.status, "blocked");
  assert(issueCodes(report).has("reader_visible_authoring_directive"));
});
