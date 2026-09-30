/**
 * Generated-book provider qualification contract.
 *
 * This is deliberately stricter than ordinary publication certification.
 * Publication answers "may this one book ship?". Qualification answers
 * "has this generation mode produced enough independent, full-book evidence
 * that we may expose the mode to users?".
 *
 * No provider/model name is trusted by itself. Only persisted outcomes count.
 */

export type QualifiableBookType =
  | "academic"
  | "technical"
  | "reference"
  | "professional"
  | "bestseller"
  | "workbook"
  | "illustrated"
  | "children"
  | "comic"
  | "fiction";

export type GateStatus = "passed" | "blocked" | "missing";
export type QualificationStatus = "qualified" | "insufficient_evidence" | "failed";

export interface QualificationPolicy {
  bookType: QualifiableBookType;
  releaseOrder: number;
  minimumSamples: number;
  minimumHumanReviewedSamples: number;
  minimumEditorialScore: number;
  minimumPublishabilityScore: number;
  maximumChapterFailureRate: number;
  maximumRegenerationRate: number;
  requiresEvidenceGate: boolean;
  requiresTechnicalCodeCoverage: boolean;
  requiresVisualAssetGate: boolean;
  requiresSpecializedGate: boolean;
  humanReviewMinimum: number;
}

export interface ProviderQualificationSample {
  sampleId: string;
  bookId: string;
  bookType: QualifiableBookType;
  generation: {
    terminalStatus: "completed" | "partial" | "failed";
    expectedChapters: number;
    generatedChapters: number;
    chapterAttempts: number;
    chapterFailures: number;
    regenerationPasses: number;
  };
  editorial: {
    certificationEligible: boolean;
    overallScore: number;
  };
  publishability: {
    status: "ready" | "needs_review" | "blocked";
    score: number;
    blockerCount: number;
    warningCount: number;
  };
  attestations: {
    editorial: GateStatus;
    evidence: GateStatus;
    qa: GateStatus;
    structural: GateStatus;
    rights: GateStatus;
    production: GateStatus;
  };
  specialized: {
    contractPassed: boolean;
    codeAuditsRequired?: number;
    codeAuditsPassed?: number;
    visualAssetGatePassed?: boolean;
    notes?: string;
  };
  humanReview?: {
    reviewer: string;
    score: number; // 0-10
    criticalIssues: number;
  };
}

export interface SampleQualificationResult {
  sampleId: string;
  passed: boolean;
  blockers: string[];
  chapterFailureRate: number;
  regenerationRate: number;
}

export interface BookTypeQualificationResult {
  bookType: QualifiableBookType;
  status: QualificationStatus;
  qualified: boolean;
  sampleCount: number;
  passingSamples: number;
  humanReviewedSamples: number;
  blockers: string[];
  samples: SampleQualificationResult[];
  policy: QualificationPolicy;
}

const BASE_POLICY = {
  minimumEditorialScore: 85,
  minimumPublishabilityScore: 92,
  maximumChapterFailureRate: 0.05,
  maximumRegenerationRate: 0.15,
  humanReviewMinimum: 8.5,
} as const;

export const QUALIFICATION_POLICIES: Record<QualifiableBookType, QualificationPolicy> = {
  academic: {
    bookType: "academic",
    releaseOrder: 1,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    requiresEvidenceGate: true,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: false,
    requiresSpecializedGate: true,
  },
  technical: {
    bookType: "technical",
    releaseOrder: 2,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    requiresEvidenceGate: true,
    requiresTechnicalCodeCoverage: true,
    requiresVisualAssetGate: false,
    requiresSpecializedGate: true,
  },
  reference: {
    bookType: "reference",
    releaseOrder: 3,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    requiresEvidenceGate: true,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: false,
    requiresSpecializedGate: true,
  },
  professional: {
    bookType: "professional",
    releaseOrder: 4,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    requiresEvidenceGate: true,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: false,
    requiresSpecializedGate: true,
  },
  bestseller: {
    bookType: "bestseller",
    releaseOrder: 5,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    requiresEvidenceGate: false,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: false,
    requiresSpecializedGate: true,
  },
  workbook: {
    bookType: "workbook",
    releaseOrder: 6,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    requiresEvidenceGate: false,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: false,
    requiresSpecializedGate: true,
  },
  illustrated: {
    bookType: "illustrated",
    releaseOrder: 7,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    requiresEvidenceGate: false,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: true,
    requiresSpecializedGate: true,
  },
  children: {
    bookType: "children",
    releaseOrder: 8,
    minimumSamples: 3,
    minimumHumanReviewedSamples: 2,
    ...BASE_POLICY,
    maximumRegenerationRate: 0.20,
    requiresEvidenceGate: false,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: true,
    requiresSpecializedGate: true,
  },
  comic: {
    bookType: "comic",
    releaseOrder: 9,
    minimumSamples: 5,
    minimumHumanReviewedSamples: 3,
    ...BASE_POLICY,
    maximumChapterFailureRate: 0.03,
    maximumRegenerationRate: 0.20,
    requiresEvidenceGate: false,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: true,
    requiresSpecializedGate: true,
  },
  fiction: {
    bookType: "fiction",
    releaseOrder: 10,
    minimumSamples: 5,
    minimumHumanReviewedSamples: 3,
    ...BASE_POLICY,
    maximumChapterFailureRate: 0.03,
    maximumRegenerationRate: 0.20,
    requiresEvidenceGate: false,
    requiresTechnicalCodeCoverage: false,
    requiresVisualAssetGate: false,
    requiresSpecializedGate: true,
  },
};

function boundedRate(numerator: number, denominator: number): number {
  const safeNumerator = Number.isFinite(numerator) ? Math.max(0, numerator) : 0;
  const safeDenominator = Number.isFinite(denominator) ? Math.max(0, denominator) : 0;
  if (safeDenominator === 0) return safeNumerator === 0 ? 0 : 1;
  return Math.min(1, safeNumerator / safeDenominator);
}

function gatePassed(status: GateStatus): boolean {
  return status === "passed";
}

export function evaluateQualificationSample(
  sample: ProviderQualificationSample,
  policy: QualificationPolicy = QUALIFICATION_POLICIES[sample.bookType],
): SampleQualificationResult {
  const blockers: string[] = [];

  if (sample.bookType !== policy.bookType) {
    blockers.push(`sample type ${sample.bookType} does not match policy ${policy.bookType}`);
  }

  if (sample.generation.terminalStatus !== "completed") {
    blockers.push(`generation status is ${sample.generation.terminalStatus}`);
  }

  if (
    sample.generation.expectedChapters <= 0
    || sample.generation.generatedChapters !== sample.generation.expectedChapters
  ) {
    blockers.push(
      `generated ${sample.generation.generatedChapters}/${sample.generation.expectedChapters} chapters`,
    );
  }

  const chapterFailureRate = boundedRate(
    sample.generation.chapterFailures,
    sample.generation.chapterAttempts,
  );
  if (chapterFailureRate > policy.maximumChapterFailureRate) {
    blockers.push(
      `chapter-attempt failure rate ${(chapterFailureRate * 100).toFixed(1)}% exceeds ${(policy.maximumChapterFailureRate * 100).toFixed(1)}%`,
    );
  }

  const regenerationRate = boundedRate(
    sample.generation.regenerationPasses,
    Math.max(1, sample.generation.generatedChapters),
  );
  if (regenerationRate > policy.maximumRegenerationRate) {
    blockers.push(
      `regeneration rate ${(regenerationRate * 100).toFixed(1)}% exceeds ${(policy.maximumRegenerationRate * 100).toFixed(1)}%`,
    );
  }

  if (!sample.editorial.certificationEligible) {
    blockers.push("editorial certification is not eligible");
  }
  if (sample.editorial.overallScore < policy.minimumEditorialScore) {
    blockers.push(
      `editorial score ${sample.editorial.overallScore} < ${policy.minimumEditorialScore}`,
    );
  }

  if (
    sample.publishability.status !== "ready"
    || sample.publishability.blockerCount !== 0
    || sample.publishability.warningCount !== 0
  ) {
    blockers.push(
      `publishability is ${sample.publishability.status} with ${sample.publishability.blockerCount} blocker(s) and ${sample.publishability.warningCount} warning(s)`,
    );
  }
  if (sample.publishability.score < policy.minimumPublishabilityScore) {
    blockers.push(
      `publishability score ${sample.publishability.score} < ${policy.minimumPublishabilityScore}`,
    );
  }

  for (const gate of ["editorial", "qa", "structural", "rights", "production"] as const) {
    if (!gatePassed(sample.attestations[gate])) {
      blockers.push(`${gate} attestation is ${sample.attestations[gate]}`);
    }
  }

  if (policy.requiresEvidenceGate && !gatePassed(sample.attestations.evidence)) {
    blockers.push(`evidence attestation is ${sample.attestations.evidence}`);
  }

  if (policy.requiresSpecializedGate && !sample.specialized.contractPassed) {
    blockers.push(`${sample.bookType} specialized contract did not pass`);
  }

  if (policy.requiresTechnicalCodeCoverage) {
    const required = sample.specialized.codeAuditsRequired ?? 0;
    const passed = sample.specialized.codeAuditsPassed ?? 0;
    if (required <= 0) {
      blockers.push("technical sample contains no audited code chapters");
    } else if (passed !== required) {
      blockers.push(`technical code audits passed ${passed}/${required}`);
    }
  }

  if (policy.requiresVisualAssetGate && sample.specialized.visualAssetGatePassed !== true) {
    blockers.push("visual asset/rights/rendering gate did not pass");
  }

  if (sample.humanReview) {
    if (
      !Number.isFinite(sample.humanReview.score)
      || sample.humanReview.score < 0
      || sample.humanReview.score > 10
    ) {
      blockers.push("human review score must be between 0 and 10");
    } else if (sample.humanReview.score < policy.humanReviewMinimum) {
      blockers.push(
        `human review score ${sample.humanReview.score.toFixed(1)} < ${policy.humanReviewMinimum.toFixed(1)}`,
      );
    }
    if (
      !Number.isInteger(sample.humanReview.criticalIssues)
      || sample.humanReview.criticalIssues < 0
    ) {
      blockers.push("human review critical-issue count must be a non-negative integer");
    } else if (sample.humanReview.criticalIssues > 0) {
      blockers.push(`human review found ${sample.humanReview.criticalIssues} critical issue(s)`);
    }
    if (!sample.humanReview.reviewer.trim()) {
      blockers.push("human review is missing reviewer identity");
    }
  }

  return {
    sampleId: sample.sampleId,
    passed: blockers.length === 0,
    blockers,
    chapterFailureRate,
    regenerationRate,
  };
}

export function evaluateBookTypeQualification(
  bookType: QualifiableBookType,
  samples: ProviderQualificationSample[],
): BookTypeQualificationResult {
  const policy = QUALIFICATION_POLICIES[bookType];
  const relevant = samples.filter((sample) => sample.bookType === bookType);
  const results = relevant.map((sample) => evaluateQualificationSample(sample, policy));
  const humanReviewedSamples = relevant.filter((sample) => {
    const review = sample.humanReview;
    return !!review
      && review.reviewer.trim().length > 0
      && Number.isFinite(review.score)
      && review.score >= policy.humanReviewMinimum
      && review.score <= 10
      && review.criticalIssues === 0;
  }).length;

  const blockers: string[] = [];
  if (relevant.length < policy.minimumSamples) {
    blockers.push(`need at least ${policy.minimumSamples} complete provider samples; found ${relevant.length}`);
  }

  const failing = results.filter((result) => !result.passed);
  if (failing.length > 0) {
    blockers.push(`${failing.length} sample(s) fail the qualification contract`);
  }

  if (humanReviewedSamples < policy.minimumHumanReviewedSamples) {
    blockers.push(
      `need at least ${policy.minimumHumanReviewedSamples} passing human-reviewed sample(s); found ${humanReviewedSamples}`,
    );
  }

  const insufficient = relevant.length < policy.minimumSamples
    || humanReviewedSamples < policy.minimumHumanReviewedSamples;

  const status: QualificationStatus = blockers.length === 0
    ? "qualified"
    : insufficient && failing.length === 0
      ? "insufficient_evidence"
      : "failed";

  return {
    bookType,
    status,
    qualified: status === "qualified",
    sampleCount: relevant.length,
    passingSamples: results.filter((result) => result.passed).length,
    humanReviewedSamples,
    blockers,
    samples: results,
    policy,
  };
}

export function qualificationReleaseOrder(): QualifiableBookType[] {
  return (Object.values(QUALIFICATION_POLICIES) as QualificationPolicy[])
    .sort((a, b) => a.releaseOrder - b.releaseOrder)
    .map((policy) => policy.bookType);
}
