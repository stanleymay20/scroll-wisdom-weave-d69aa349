export const PRESS_CERTIFICATION_STANDARD_VERSION = "1.0";

export const PRESS_CERTIFICATION_THRESHOLDS = Object.freeze({
  chiefEditorOverall: 95,
  chiefEditorStructural: 90,
  chiefEditorAcademic: 90,
  chiefEditorPedagogical: 90,
  publishabilityScore: 98,
  publishabilityBlockers: 0,
  publishabilityWarnings: 0,
});

export type PublicationQualityState = "draft" | "verified" | "press_certified";

export interface EditorialCertificationEvidence {
  status: string | null | undefined;
  overallScore: number | null | undefined;
  structuralScore: number | null | undefined;
  academicScore: number | null | undefined;
  pedagogicalScore: number | null | undefined;
  model?: string | null;
  promptVersion?: string | null;
}

export interface QaCertificationEvidence {
  status: string | null | undefined;
  score: number | null | undefined;
  blockerCount: number | null | undefined;
  warningCount: number | null | undefined;
}

export interface PressCertificationInput {
  /** Existing server-owned publication readiness for the exact current scope. */
  baseVerified: boolean;
  editorial: EditorialCertificationEvidence | null;
  qa: QaCertificationEvidence | null;
}

export interface PressCertificationVerdict {
  state: PublicationQualityState;
  certified: boolean;
  standardVersion: string;
  blockers: string[];
}

function numericAtLeast(value: number | null | undefined, minimum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function numericAtMost(value: number | null | undefined, maximum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value <= maximum;
}

export function evaluatePressCertification(input: PressCertificationInput): PressCertificationVerdict {
  if (!input.baseVerified) {
    return {
      state: "draft",
      certified: false,
      standardVersion: PRESS_CERTIFICATION_STANDARD_VERSION,
      blockers: ["Current-scope publication verification has not passed."],
    };
  }

  const blockers: string[] = [];
  const editorial = input.editorial;
  const qa = input.qa;

  if (!editorial || editorial.status !== "passed") {
    blockers.push("Current-scope editorial attestation is missing or not passed.");
  } else {
    if (!numericAtLeast(editorial.overallScore, PRESS_CERTIFICATION_THRESHOLDS.chiefEditorOverall)) {
      blockers.push(`Chief Editor overall must be >= ${PRESS_CERTIFICATION_THRESHOLDS.chiefEditorOverall}/100.`);
    }
    if (!numericAtLeast(editorial.structuralScore, PRESS_CERTIFICATION_THRESHOLDS.chiefEditorStructural)) {
      blockers.push(`Chief Editor structural must be >= ${PRESS_CERTIFICATION_THRESHOLDS.chiefEditorStructural}/100.`);
    }
    if (!numericAtLeast(editorial.academicScore, PRESS_CERTIFICATION_THRESHOLDS.chiefEditorAcademic)) {
      blockers.push(`Chief Editor academic/cognitive rigor must be >= ${PRESS_CERTIFICATION_THRESHOLDS.chiefEditorAcademic}/100.`);
    }
    if (!numericAtLeast(editorial.pedagogicalScore, PRESS_CERTIFICATION_THRESHOLDS.chiefEditorPedagogical)) {
      blockers.push(`Chief Editor pedagogical quality must be >= ${PRESS_CERTIFICATION_THRESHOLDS.chiefEditorPedagogical}/100.`);
    }
  }

  if (!qa || qa.status !== "passed") {
    blockers.push("Current-scope publishability attestation is missing or not passed.");
  } else {
    if (!numericAtLeast(qa.score, PRESS_CERTIFICATION_THRESHOLDS.publishabilityScore)) {
      blockers.push(`Publishability score must be >= ${PRESS_CERTIFICATION_THRESHOLDS.publishabilityScore}/100.`);
    }
    if (!numericAtMost(qa.blockerCount, PRESS_CERTIFICATION_THRESHOLDS.publishabilityBlockers)) {
      blockers.push("Publishability blockers must equal 0.");
    }
    if (!numericAtMost(qa.warningCount, PRESS_CERTIFICATION_THRESHOLDS.publishabilityWarnings)) {
      blockers.push("Publishability warnings must equal 0.");
    }
  }

  if (blockers.length > 0) {
    return {
      state: "verified",
      certified: false,
      standardVersion: PRESS_CERTIFICATION_STANDARD_VERSION,
      blockers,
    };
  }

  return {
    state: "press_certified",
    certified: true,
    standardVersion: PRESS_CERTIFICATION_STANDARD_VERSION,
    blockers: [],
  };
}
