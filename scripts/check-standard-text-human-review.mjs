import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const evidenceDir = path.join(root, 'docs/release/qualification-evidence/standard-text');
const corpusPath = path.join(root, 'docs/release/standard-text-qualification-corpus.json');

const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const policy = corpus.policy;
const allowedSampleIds = new Set(corpus.samples.map((sample) => sample.id));
const dimensions = [
  'contentIntegrity',
  'coherence',
  'typeFidelity',
  'readerValue',
  'editorialPolish',
];

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

for (const file of files) {
  const full = path.join(evidenceDir, file);
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: invalid JSON (${error.message})`);
    invalid = true;
    continue;
  }

  const sampleId = evidence.corpusSampleId;
  if (!allowedSampleIds.has(sampleId)) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: unknown corpusSampleId ${sampleId}`);
    invalid = true;
    continue;
  }

  const bookEntries = Object.entries(evidence.books ?? {});
  if (bookEntries.length !== 1) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: each corpus evidence file must contain exactly one generated book review`);
    invalid = true;
    continue;
  }

  const [bookId, entry] = bookEntries[0];
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(bookId)) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: book key is not a generated book UUID`);
    invalid = true;
    continue;
  }

  const review = entry?.humanReview ?? {};
  const reviewer = String(review.reviewer ?? '').trim();
  const criticalIssues = Number(review.criticalIssues);
  const scores = review.dimensions ?? {};
  const values = dimensions.map((key) => Number(scores[key]));

  if (!reviewer || reviewer === 'Independent Reviewer Name') {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: reviewer identity/reference is missing or placeholder`);
    invalid = true;
    continue;
  }
  if (!Number.isFinite(criticalIssues) || criticalIssues < 0) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: criticalIssues must be a non-negative number`);
    invalid = true;
    continue;
  }
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 10)) {
    console.error(`STANDARD_TEXT_REVIEW_INVALID: ${file}: all canonical review dimensions must be numeric 0..10`);
    invalid = true;
    continue;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const weakest = Math.min(...values);
  const humanPass =
    mean >= policy.humanReviewOverallMinimum &&
    weakest >= policy.humanReviewDimensionMinimum &&
    criticalIssues <= policy.humanReviewMaximumCriticalIssues;

  if (humanPass) {
    passingHumanReviews += 1;
    passingSamples.add(sampleId);
  }
}

if (invalid) process.exit(1);

if (passingHumanReviews >= policy.minimumHumanReviewedPassingBooks &&
    passingSamples.size >= policy.minimumHumanReviewedPassingBooks) {
  console.log(
    `STANDARD_TEXT_HUMAN_REVIEW_EVIDENCE_COMPLETE: ${passingHumanReviews} passing review(s) across ${passingSamples.size} corpus sample(s). ` +
    'Human-review evidence is complete; the existing provider-qualification collector remains authoritative for machine gates and final route qualification.',
  );
} else {
  console.log(
    `STANDARD_TEXT_HUMAN_REVIEW_PENDING: ${passingHumanReviews}/${policy.minimumHumanReviewedPassingBooks} passing human-reviewed books. ` +
    'Route qualification remains fail-closed.',
  );
}
