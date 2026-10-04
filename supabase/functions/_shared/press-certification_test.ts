import {
  evaluatePressCertification,
  PRESS_CERTIFICATION_THRESHOLDS,
} from "./press-certification.ts";

Deno.test("unverified manuscript remains draft", () => {
  const result = evaluatePressCertification({
    baseVerified: false,
    editorial: null,
    qa: null,
  });
  if (result.state !== "draft" || result.certified) {
    throw new Error(`expected draft/non-certified, got ${JSON.stringify(result)}`);
  }
});

Deno.test("ordinary publication eligibility does not imply Press certification", () => {
  const result = evaluatePressCertification({
    baseVerified: true,
    editorial: {
      status: "passed",
      overallScore: 82,
      structuralScore: 80,
      academicScore: 82,
      pedagogicalScore: 80,
    },
    qa: {
      status: "passed",
      score: 98,
      blockerCount: 0,
      warningCount: 0,
    },
  });

  if (result.state !== "verified" || result.certified) {
    throw new Error(`expected verified/non-certified, got ${JSON.stringify(result)}`);
  }
  if (!result.blockers.some((item) => item.includes("overall"))) {
    throw new Error("expected strict editorial threshold blocker");
  }
});

Deno.test("warnings block Press certification even with high scores", () => {
  const result = evaluatePressCertification({
    baseVerified: true,
    editorial: {
      status: "passed",
      overallScore: 97,
      structuralScore: 95,
      academicScore: 96,
      pedagogicalScore: 94,
    },
    qa: {
      status: "passed",
      score: 99,
      blockerCount: 0,
      warningCount: 1,
    },
  });

  if (result.state !== "verified" || result.certified) {
    throw new Error(`expected verified/non-certified, got ${JSON.stringify(result)}`);
  }
  if (!result.blockers.some((item) => item.includes("warnings"))) {
    throw new Error("expected warning-count blocker");
  }
});

Deno.test("strict current-scope evidence earns Press certification", () => {
  const result = evaluatePressCertification({
    baseVerified: true,
    editorial: {
      status: "passed",
      overallScore: PRESS_CERTIFICATION_THRESHOLDS.chiefEditorOverall,
      structuralScore: PRESS_CERTIFICATION_THRESHOLDS.chiefEditorStructural,
      academicScore: PRESS_CERTIFICATION_THRESHOLDS.chiefEditorAcademic,
      pedagogicalScore: PRESS_CERTIFICATION_THRESHOLDS.chiefEditorPedagogical,
    },
    qa: {
      status: "passed",
      score: PRESS_CERTIFICATION_THRESHOLDS.publishabilityScore,
      blockerCount: 0,
      warningCount: 0,
    },
  });

  if (result.state !== "press_certified" || !result.certified || result.blockers.length !== 0) {
    throw new Error(`expected press_certified, got ${JSON.stringify(result)}`);
  }
});

Deno.test("missing current-scope evidence cannot certify", () => {
  const result = evaluatePressCertification({
    baseVerified: true,
    editorial: null,
    qa: null,
  });

  if (result.state !== "verified" || result.certified || result.blockers.length < 2) {
    throw new Error(`expected verified with blockers, got ${JSON.stringify(result)}`);
  }
});
