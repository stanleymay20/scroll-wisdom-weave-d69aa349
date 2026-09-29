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
  const evidenceRequired = ["academic", "technical", "reference", "professional"].includes(bookType);
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
      regenerationPasses: 1,
    },
    editorial: {
      certificationEligible: true,
      overallScore: 91,
    },
    publishability: {
      status: "ready",
      score: 98,
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
      ? { reviewer: "independent-reviewer", score: 9.1, criticalIssues: 0 }
      : undefined,
  };
}

Deno.test("academic qualifies only after enough complete and human-reviewed samples", () => {
  const samples = [
    passingSample("academic", 1, true),
    passingSample("academic", 2, true),
    passingSample("academic", 3, false),
  ];

  const result = evaluateBookTypeQualification("academic", samples);
  assertEquals(result.status, "qualified");
  assertEquals(result.qualified, true);
  assertEquals(result.sampleCount, 3);
  assertEquals(result.humanReviewedSamples, 2);
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
