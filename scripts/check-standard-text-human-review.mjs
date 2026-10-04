import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const evidenceDir = path.join(root, 'docs/release/qualification-evidence/standard-text');
const corpusPath = path.join(root, 'docs/release/standard-text-qualification-corpus.json');

const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const policy = corpus.policy;

if (!fs.existsSync(evidenceDir)) {
  console.log('STANDARD_TEXT_HUMAN_REVIEW_PENDING: evidence directory not present; qualification remains fail-closed.');
  process.exit(0);
}

const files = fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json'));
if (files.length === 0) {
  console.log('STANDARD_TEXT_HUMAN_REVIEW_PENDING: no review evidence files; qualification remains fail-closed.');
  process.exit(0);
}

let invalid = false;
let passingHumanReviews = 0;
const passingSamples = new Set();
const allowedSampleIds = new Set(corpus.samples.map((sample) => sample.id));

for (const file of files) {
  const full = path.join(evidenceDir, file);
  let review;
  try {
    review = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: invalid JSON (${error.message})`);
    invalid = true;
    continue;
  }

  if (!allowedSampleIds.has(review.sampleId)) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: unknown sampleId ${review.sampleId}`);
    invalid = true;
    continue;
  }

  const dimensions = [
    'contentIntegrity',
    'coherence',
    'depth',
    'proseQuality',
    'structureAndPacing',
    'audienceFitAndPedagogy',
    'originalityAndNonFormulaicTreatment',
    'publicationUsability',
  ];

  const scores = review.scores ?? {};
  const machine = review.machineEvidence ?? {};
  const critical = review.issues?.critical ?? [];
  const reviewerName = String(review.reviewer?.name ?? '').trim();
  const hasEvidence = Array.isArray(review.evidence) && review.evidence.length > 0;

  const dimensionsPass = dimensions.every((key) => Number(scores[key]) >= policy.humanReviewDimensionMinimum);
  const humanPass =
    reviewerName.length > 0 &&
    hasEvidence &&
    Number(scores.overall) >= policy.humanReviewOverallMinimum &&
    dimensionsPass &&
    critical.length <= policy.humanReviewMaximumCriticalIssues &&
    review.publicationJudgement?.publishAfterNormalCopyeditOnly === true &&
    review.publicationJudgement?.readsLikeUneditedAI === false;

  const machinePass =
    Number(machine.chiefEditorOverall) >= policy.chiefEditorOverallMinimum &&
    Number(machine.publishabilityScore) >= policy.publishabilityMinimum &&
    Number(machine.publishabilityBlockers) <= policy.publishabilityMaximumBlockers &&
    Number(machine.publishabilityWarnings) <= policy.publishabilityMaximumWarnings &&
    machine.productionRenderPassed === true &&
    (machine.evidencePassed === true || machine.evidencePassed === null) &&
    (machine.technicalAuditPassed === true || machine.technicalAuditPassed === null) &&
    (machine.rightsPassed === true || machine.rightsPassed === null) &&
    typeof machine.scopeHash === 'string' && machine.scopeHash.length >= 16;

  const pass = humanPass && machinePass && review.verdict === 'pass';
  if (pass) {
    passingHumanReviews += 1;
    passingSamples.add(review.sampleId);
  }
}

if (invalid) process.exit(1);

if (passingHumanReviews >= policy.minimumHumanReviewedPassingBooks &&
    passingSamples.size >= policy.minimumHumanReviewedPassingBooks) {
  console.log(`STANDARD_TEXT_HUMAN_REVIEW_PASS: ${passingHumanReviews} passing review(s) across ${passingSamples.size} sample(s).`);
} else {
  console.log(`STANDARD_TEXT_HUMAN_REVIEW_PENDING: ${passingHumanReviews}/${policy.minimumHumanReviewedPassingBooks} passing human-reviewed books. Qualification remains fail-closed.`);
}
