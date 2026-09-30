import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateBookTypeQualification,
  evaluateQualificationSample,
  qualificationReleaseOrder,
  type ProviderQualificationSample,
  type QualifiableBookType,
} from "./provider-qualification.ts";

function passingSample(
  bookType: QualifiableBookType,
  index = 1,
  human = true,
): ProviderQualificationSample {
  const evidenceRequired = ["academic", "technical", "reference", "professional", "bestseller", "illustrated"].includes(bookType);
  const visual = ["illustrated", "children", "comic"].includes(bookType);
  const technical = bookType === "technical";

  return {
    sampleId: `${bookType}-sample-${index}`,
    bookId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    bookType,
    generation: {
      terminalStatus: "completed",
      expectedChapters: 12,
      generatedChapters: 12,
      chapterAttempts: 14,
      chapterFailures: 0,
      regenerationPasses: 0,
    },
    editorial: {
      certificationEligible: true,
      overallScore: 97,
    },
    publishability: {
      status: "ready",
      score: 100,
      blockerCount: 0,
      warningCount: 0,
    },
    attestations: {
      editorial: "passed",
      evidence: evidenceRequired ? "passed" : "missing",
      qa: "passed",
      structural: "passed",
      rights: "passed",
      production: "passed",
    },
    specialized: {
      contractPassed: true,
      codeAuditsRequired: technical ? 8 : undefined,
      codeAuditsPassed: technical ? 8 : undefined,
      visualAssetGatePassed: visual ? true : undefined,
    },
    humanReview: human
      ? { reviewer: "independent-reviewer", score: 9.7, minimumDimension: 9.4, criticalIssues: 0 }
      : undefined,
  };
}

Deno.test("academic qualifies only after enough complete and human-reviewed samples", () => {
  const samples = [
    passingSample("academic", 1, true),
    passingSample("academic", 2, true),
    passingSample("academic", 3, true),
    passingSample("academic", 4, false),
    passingSample("academic", 5, false),
  ];

  const result = evaluateBookTypeQualification("academic", samples);
  assertEquals(result.status, "qualified");
  assertEquals(result.qualified, true);
  assertEquals(result.sampleCount, 5);
  assertEquals(result.humanReviewedSamples, 3);
});

Deno.test("academic fails closed when publication evidence is missing", () => {
  const sample = passingSample("academic");
  sample.attestations.evidence = "missing";

  const result = evaluateQualificationSample(sample);
  assertEquals(result.passed, false);
  assert(result.blockers.some((blocker) => blocker.includes("evidence attestation")));
});

Deno.test("technical requires exact code-audit coverage", () => {
  const sample = passingSample("technical");
  sample.specialized.codeAuditsPassed = 7;

  const result = evaluateQualificationSample(sample);
  assertEquals(result.passed, false);
  assert(result.blockers.some((blocker) => blocker.includes("technical code audits passed 7/8")));
});

Deno.test("visual modes require a visual asset gate", () => {
  const sample = passingSample("children");
  sample.specialized.visualAssetGatePassed = false;

  const result = evaluateQualificationSample(sample);
  assertEquals(result.passed, false);
  assert(result.blockers.some((blocker) => blocker.includes("visual asset/rights/rendering")));
});

Deno.test("chapter-attempt and regeneration instability block a sample", () => {
  const sample = passingSample("reference");
  sample.generation.chapterAttempts = 10;
  sample.generation.chapterFailures = 2;
  sample.generation.regenerationPasses = 4;

  const result = evaluateQualificationSample(sample);
  assertEquals(result.passed, false);
  assert(result.chapterFailureRate > 0.05);
  assert(result.regenerationRate > 0.15);
  assert(result.blockers.some((blocker) => blocker.includes("chapter-attempt failure rate")));
  assert(result.blockers.some((blocker) => blocker.includes("regeneration rate")));
});

Deno.test("fiction requires five samples and three independent human reviews", () => {
  const four = [
    passingSample("fiction", 1, true),
    passingSample("fiction", 2, true),
    passingSample("fiction", 3, true),
    passingSample("fiction", 4, false),
  ];

  const insufficient = evaluateBookTypeQualification("fiction", four);
  assertEquals(insufficient.status, "insufficient_evidence");
  assertStringIncludes(insufficient.blockers.join("\n"), "need at least 5 complete provider samples");

  const qualified = evaluateBookTypeQualification(
    "fiction",
    [...four, passingSample("fiction", 5, false)],
  );
  assertEquals(qualified.status, "qualified");
});

Deno.test("qualification release order preserves the staged reopening plan", () => {
  assertEquals(qualificationReleaseOrder(), [
    "text",
    "academic",
    "technical",
    "reference",
    "professional",
    "bestseller",
    "workbook",
    "illustrated",
    "children",
    "comic",
    "fiction",
  ]);
});


Deno.test("human review cannot pass with an out-of-range score", () => {
  const sample = passingSample("academic");
  sample.humanReview = { reviewer: "reviewer", score: 11, minimumDimension: 9.5, criticalIssues: 0 };

  const result = evaluateQualificationSample(sample);
  assertEquals(result.passed, false);
  assert(result.blockers.some((blocker) => blocker.includes("between 0 and 10")));
});

Deno.test("human review critical issue count must be non-negative", () => {
  const sample = passingSample("academic");
  sample.humanReview = { reviewer: "reviewer", score: 9.7, minimumDimension: 9.5, criticalIssues: -1 };

  const result = evaluateQualificationSample(sample);
  assertEquals(result.passed, false);
  assert(result.blockers.some((blocker) => blocker.includes("non-negative integer")));
});


Deno.test("near-10 qualification rejects a strong average with one weak review dimension", () => {
  const sample = passingSample("professional");
  sample.humanReview = {
    reviewer: "reviewer",
    score: 9.6,
    minimumDimension: 8.8,
    criticalIssues: 0,
  };

  const result = evaluateQualificationSample(sample);
  assertEquals(result.passed, false);
  assert(result.blockers.some((blocker) => blocker.includes("weakest human-review dimension")));
});

Deno.test("standard text is empirically qualified rather than treated as an untested fallback", () => {
  const samples = Array.from({ length: 5 }, (_, index) =>
    passingSample("text", index + 1, index < 3)
  );
  const result = evaluateBookTypeQualification("text", samples);
  assertEquals(result.qualified, true);
  assertEquals(result.humanReviewedSamples, 3);
});
