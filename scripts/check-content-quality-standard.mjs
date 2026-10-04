import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (message) => {
  console.error(`CONTENT_QUALITY_STANDARD_FAIL: ${message}`);
  process.exitCode = 1;
};

const standardPath = 'docs/release/SCROLLLIBRARY_CONTENT_QUALITY_STANDARD.md';
const corpusPath = 'docs/release/standard-text-qualification-corpus.json';
const qualificationPath = 'docs/release/GENERATED_BOOK_PROVIDER_QUALIFICATION.md';
const chiefEditorPath = 'supabase/functions/chief-editor-audit/index.ts';
const pricingContractPath = 'supabase/functions/_shared/billing-plans.ts';

for (const file of [standardPath, corpusPath, qualificationPath, chiefEditorPath, pricingContractPath]) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing required file: ${file}`);
}

if (process.exitCode) process.exit(process.exitCode);

const standard = read(standardPath);
const qualification = read(qualificationPath);
const chiefEditor = read(chiefEditorPath);
const pricing = read(pricingContractPath);
const corpus = JSON.parse(read(corpusPath));

const requiredStandardPhrases = [
  'Draft',
  'Verified',
  'ScrollLibrary Press Certified',
  'Chief Editor overall',
  '95/100',
  '98/100',
  'human-review overall average >= 9.5/10',
  'book project',
  'narration minute',
];
for (const phrase of requiredStandardPhrases) {
  if (!standard.includes(phrase)) fail(`quality standard lost required doctrine: ${phrase}`);
}

const p = corpus.policy ?? {};
if (p.minimumCompleteBooks < 5) fail('qualification corpus must require at least 5 complete books');
if (p.minimumHumanReviewedPassingBooks < 3) fail('qualification corpus must require at least 3 human-reviewed passing books');
if (p.chiefEditorOverallMinimum < 95) fail('Chief Editor qualification threshold must remain >=95');
if (p.publishabilityMinimum < 98) fail('publishability qualification threshold must remain >=98');
if (p.publishabilityMaximumBlockers !== 0) fail('qualification must require zero publishability blockers');
if (p.publishabilityMaximumWarnings !== 0) fail('qualification must require zero publishability warnings');
if (p.humanReviewOverallMinimum < 9.5) fail('human-review overall threshold must remain >=9.5');
if (p.humanReviewDimensionMinimum < 9.0) fail('human-review dimension threshold must remain >=9.0');
if (p.humanReviewMaximumCriticalIssues !== 0) fail('human-review critical issues must remain zero');

if (!Array.isArray(corpus.samples) || corpus.samples.length < 5) {
  fail('Standard Text corpus must contain at least 5 representative samples');
} else {
  const categories = new Set(corpus.samples.map((s) => s.category));
  if (!categories.has('business')) fail('corpus must include a business/economics evidence sample');
  if (!categories.has('history')) fail('corpus must include a history/governance evidence sample');
  if (!categories.has('technology')) fail('corpus must include a technical/software sample');
  if (!corpus.samples.some((s) => s.technicalCodeAudit === true)) fail('corpus must include a technical code-audit sample');
  if (!corpus.samples.some((s) => s.evidenceExpectation === 'required')) fail('corpus must include evidence-required samples');
}

const qualificationPhrases = [
  'Chief Editor overall score is at least **95/100**',
  'Publishability score is at least **98/100**',
  'Human overall average: at least **9.5/10**',
];
for (const phrase of qualificationPhrases) {
  if (!qualification.includes(phrase)) fail(`provider qualification doctrine drifted: ${phrase}`);
}

// Guard against accidentally confusing ordinary editorial eligibility with the
// stricter empirical/certification doctrine. Ordinary thresholds may evolve, but
// they must not be silently raised/lowered and marketed as near-10 qualification.
if (!chiefEditor.includes('const CERT_THRESHOLDS')) fail('Chief Editor threshold contract missing');
if (!chiefEditor.includes('overall: 78')) fail('ordinary Chief Editor threshold changed; review quality-state semantics intentionally');

// Pricing capacity must remain explicit because quality/value claims use words,
// projects and chapter limits as separate customer concepts.
for (const field of ['booksPerMonth', 'aiTextWordsPerMonth', 'maxWordsPerChapter', 'maxChaptersPerBook']) {
  if (!pricing.includes(field)) fail(`billing plan contract missing ${field}`);
}

if (!process.exitCode) {
  console.log('CONTENT_QUALITY_STANDARD_PASS');
}
