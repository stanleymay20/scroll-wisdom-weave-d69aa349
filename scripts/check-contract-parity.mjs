import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => { console.error(`[contract-parity] ${message}`); process.exitCode = 1; };

const client = read('src/lib/bookTypeGovernance.ts');
const edge = read('supabase/functions/_shared/contract6-governance.ts');
const types = ['academic','professional','workbook','bestseller','comic','children','technical','reference','fiction','illustrated','text'];

for (const type of types) {
  if (!new RegExp(`\\n  ${type}: \\{`).test(client)) fail(`client BTG-1.0 missing ${type}`);
  if (!new RegExp(`\\n  ${type}: \\{`).test(edge)) fail(`edge BTG-1.0 snapshot missing ${type}`);
}

const hardRanges = [
  ['workbook', 800, 1800],
  ['children', 100, 500],
  ['fiction', 2000, 6000],
];
for (const [type, min, max] of hardRanges) {
  const pattern = new RegExp(`${type}: \\{[\\s\\S]*?wordLimits: \\{ min: ${min}, max: ${max} \\}`, 'm');
  if (!pattern.test(client)) fail(`client ${type} word range drifted from ${min}-${max}`);
  if (!pattern.test(edge)) fail(`edge ${type} word range drifted from ${min}-${max}`);
}

const trustSurfaces = [
  'src/lib/certificateAuthority.ts',
  'src/pages/CertificateVerify.tsx',
  'supabase/functions/validate-certificate/index.ts',
  'supabase/functions/verify-certificate/index.ts',
  'supabase/functions/export-certificate/index.ts',
  'supabase/functions/batch-verify-certificates/index.ts',
  'src/lib/contracts/contract-stack-overview.ts',
];
const forbiddenClaims = [
  'Publishing Rights Certificate',
  'Authorship Verification',
  'Chief Executive Officer',
];
for (const path of trustSurfaces) {
  const text = read(path);
  for (const claim of forbiddenClaims) {
    if (text.includes(claim)) fail(`${path} reintroduced overclaim/drift: ${claim}`);
  }
}

const issuer = read('supabase/functions/_shared/contract-canonical.ts');
for (const expected of ['ScrollLibrary Certification Authority', 'Founder & Publishing Director']) {
  if (!issuer.includes(expected)) fail(`canonical issuer missing ${expected}`);
}

const verifier = read('supabase/functions/verify-certificate/index.ts');
if (!verifier.includes("status: 'unverifiable'")) fail('public verifier must support unverifiable');
if (verifier.includes('currentBookHash ||')) fail('public verifier must not substitute stored hash for missing live hash');

const issuerFn = read('supabase/functions/validate-certificate/index.ts');
if (issuerFn.includes('is_generated')) fail('certificate issuance must not equate generated chapters with learner completion');
if (!issuerFn.includes("from('reading_progress')")) fail('certificate issuance must derive coverage from reading_progress');
if (!issuerFn.includes('assessment_contract_passed')) fail('certificate issuance must require ARC evidence');

if (!process.exitCode) console.log('[contract-parity] PASS');
