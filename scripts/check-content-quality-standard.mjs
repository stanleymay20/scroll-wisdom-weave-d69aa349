import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (message) => {
  console.error(`CONTENT_QUALITY_STANDARD_FAIL: ${message}`);
  process.exitCode = 1;
};

const paths = {
  standard: 'docs/release/SCROLLLIBRARY_CONTENT_QUALITY_STANDARD.md',
  corpus: 'docs/release/standard-text-qualification-corpus.json',
  qualification: 'docs/release/GENERATED_BOOK_PROVIDER_QUALIFICATION.md',
  chiefEditor: 'supabase/functions/chief-editor-audit/index.ts',
  pressPolicy: 'supabase/functions/_shared/press-certification.ts',
  pricingContract: 'supabase/functions/_shared/billing-plans.ts',
  oneTimeCatalogue: 'supabase/functions/_shared/billing-order-catalogue.ts',
  subscription: 'src/lib/subscription.ts',
  pricingPage: 'src/pages/Pricing.tsx',
  typographyReport: 'src/components/publish/TypographyReport.tsx',
  bestsellerQa: 'src/components/generate/BestsellerQAScore.tsx',
  evidenceCategories: 'src/lib/academicCategories.ts',
  evidenceMigration: 'supabase/migrations/20261004190000_health_psychology_publication_evidence.sql',
};

for (const file of Object.values(paths)) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing required file: ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);

const standard = read(paths.standard);
const qualification = read(paths.qualification);
const chiefEditor = read(paths.chiefEditor);
const pressPolicy = read(paths.pressPolicy);
const pricing = read(paths.pricingContract);
const oneTime = read(paths.oneTimeCatalogue);
const subscription = read(paths.subscription);
const pricingPage = read(paths.pricingPage);
const typographyReport = read(paths.typographyReport);
const bestsellerQa = read(paths.bestsellerQa);
const evidenceCategories = read(paths.evidenceCategories);
const evidenceMigration = read(paths.evidenceMigration);
const corpus = JSON.parse(read(paths.corpus));

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
  'Required human reviews average at least **9.5/10**',
  'every rubric dimension is at least **9.0/10**',
  'zero critical issues',
];
for (const phrase of qualificationPhrases) {
  if (!qualification.includes(phrase)) fail(`provider qualification doctrine drifted: ${phrase}`);
}

// Ordinary editorial eligibility stays distinct from the stricter certification layer.
if (!chiefEditor.includes('const CERT_THRESHOLDS')) fail('Chief Editor threshold contract missing');
if (!chiefEditor.includes('overall: 78')) fail('ordinary Chief Editor threshold changed; review quality-state semantics intentionally');
for (const phrase of [
  'chiefEditorOverall: 95',
  'chiefEditorStructural: 90',
  'chiefEditorAcademic: 90',
  'chiefEditorPedagogical: 90',
  'publishabilityScore: 98',
  'publishabilityWarnings: 0',
  '"draft" | "verified" | "press_certified"',
]) {
  if (!pressPolicy.includes(phrase)) fail(`strict Press certification policy drifted: ${phrase}`);
}

// Draft-level helper reports must never imply publication certification or market outcome.
for (const forbidden of ['"Publication Ready"', '> Publication Ready<']) {
  if (typographyReport.includes(forbidden)) fail(`typography-only validator regained publication claim: ${forbidden}`);
}
for (const forbidden of ['"Bestseller Ready"', '"Publish-ready layout"', 'label: "Layout checks passed"']) {
  if (bestsellerQa.includes(forbidden)) fail(`unqualified bestseller QA claim returned: ${forbidden}`);
}
for (const required of [
  'Typography checks passed',
  'does not by itself make a manuscript Verified or ScrollLibrary Press Certified',
]) {
  if (!typographyReport.includes(required)) fail(`typography truthfulness copy missing: ${required}`);
}
for (const required of [
  'Strong QA score',
  'not a sales forecast, publication certification, or ScrollLibrary Press Certified claim',
  'Layout quality checks',
]) {
  if (!bestsellerQa.includes(required)) fail(`bestseller QA truthfulness copy missing: ${required}`);
}

// Pricing capacity must remain explicit because projects and generated words are separate concepts.
for (const field of ['booksPerMonth', 'aiTextWordsPerMonth', 'maxWordsPerChapter', 'maxChaptersPerBook']) {
  if (!pricing.includes(field)) fail(`billing plan contract missing ${field}`);
}

// Customer-facing units and server catalogue must agree.
for (const [source, phrase, label] of [
  [subscription, '+50 AI-generated visuals', 'visual add-on display unit'],
  [subscription, '+60 narration minutes', 'audio add-on display unit'],
  [oneTime, '+50 AI-generated visuals', 'server visual add-on display unit'],
  [oneTime, '+60 narration minutes', 'server audio add-on display unit'],
  [pricingPage, 'book projects are creation slots', 'shared word-pool explanation'],
  [pricingPage, 'Narration is metered in standard narration minutes', 'narration-unit explanation'],
  [pricingPage, 'Marketplace selling is not open yet', 'marketplace conditional availability'],
  [pricingPage, 'Human service setup pending', 'Assisted Launch operational gate'],
]) {
  if (!source.includes(phrase)) fail(`pricing semantics drifted: ${label}`);
}

// Bundle value invariant: two/three-format bundles must beat repeated Single Edition purchases.
for (const [source, phrase, label] of [
  [subscription, 'priceCents: 8900', 'frontend Print + Digital $89'],
  [subscription, 'priceCents: 12900', 'frontend Complete Edition $129'],
  [oneTime, 'amountCents: 8900', 'server Print + Digital $89'],
  [oneTime, 'amountCents: 12900', 'server Complete Edition $129'],
]) {
  if (!source.includes(phrase)) fail(`bundle economics drifted: ${label}`);
}

// Health and psychology must enter both the authoring/evidence workflow and DB authority.
for (const category of ["'health'", "'psychology'"]) {
  if (!evidenceCategories.includes(category)) fail(`client evidence categories missing ${category}`);
  if (!evidenceMigration.includes(category)) fail(`database evidence policy missing ${category}`);
}

if (!process.exitCode) {
  console.log('CONTENT_QUALITY_STANDARD_PASS');
}
