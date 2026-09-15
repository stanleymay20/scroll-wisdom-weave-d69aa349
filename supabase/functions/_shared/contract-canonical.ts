// ScrollLibrary canonical contract constants shared by Edge Functions.
// Client-side mirrors MUST match these values and CI should compare them.

export const CONTRACT_VERSIONS = Object.freeze({
  bookTypeGovernance: 'BTG-1.0',
  assessmentRigor: 'ARC-1.0',
  illustratedContent: 'ICG-1.0',
  visualStyle: 'VSC-1.0',
  visualAssessment: 'VRA-1.0',
  provenance: 'BPB-1.0',
});

export const CERTIFICATE_ISSUER = Object.freeze({
  authority: 'ScrollLibrary Certification Authority',
  representative: 'Founder',
  title: 'Founder & Publishing Director',
  organization: 'ScrollLibrary™',
});

export const COMPLETION_THRESHOLDS = Object.freeze({
  MIN_CHAPTER_COVERAGE: 0.8,
  QUIZZES_REQUIRED_RATIO: 1.0,
  MIN_INTEGRITY: 0.6,
});

export const MASTERY_THRESHOLDS = Object.freeze({
  MIN_SCORE: 0.9,
  MIN_INTEGRITY: 0.9,
  MIN_MASTERY_DEPTH: 75,
  COOLDOWN_MS: 24 * 60 * 60 * 1000,
});

export const ASSESSMENT_RIGOR_REQUIREMENTS = Object.freeze({
  completion: {
    minTotalQuestions: 5,
    minTier2Questions: 2,
    minTier3Questions: 1,
    minTier4Questions: 0,
    maxTier1Ratio: 0.4,
  },
  mastery: {
    minTotalQuestions: 7,
    minTier2Questions: 2,
    minTier3Questions: 2,
    minTier4Questions: 1,
    maxTier1Ratio: 0.3,
  },
});
