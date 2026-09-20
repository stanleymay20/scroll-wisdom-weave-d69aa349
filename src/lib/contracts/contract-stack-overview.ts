/**
 * SCROLLLIBRARY CONTRACT STACK OVERVIEW (v1.1)
 * Status: CONTROLLED DOCTRINE
 *
 * This registry distinguishes product guarantees from implementation helpers.
 * A contract may be described as hard-enforced only when an executable server
 * or publication gate backs the guarantee. Breaking changes require a new major
 * version; frozen contracts must never be silently redefined.
 */

export interface ContractDefinition {
  id: string;
  code: string;
  name: string;
  version: string;
  status: 'frozen' | 'active' | 'draft';
  scope: 'content' | 'performance' | 'credential' | 'visual' | 'learning';
  purpose: string;
  enforces: string[];
  doesNotClaim: string[];
  dependencies: string[];
  sourceFile: string;
  serverAuthority?: string;
}

export const CONTRACT_STACK: ContractDefinition[] = [
  {
    id: '2', code: 'ODUI-1.0', name: 'Output Determinism & User Intent', version: '1.0', status: 'active', scope: 'content',
    purpose: 'Protect committed and user-owned content from silent regeneration.',
    enforces: ['Implicit regeneration triggers blocked', 'Explicit edit scope required', 'Preview required for committed/user-owned changes', 'Contract 2 overrides Contract 3 after content becomes user-owned'],
    doesNotClaim: ['That an uncommitted AI candidate cannot be automatically retried before acceptance'],
    dependencies: [], sourceFile: 'src/lib/contentDeterminism.ts',
  },
  {
    id: '3', code: 'CGH-1.0', name: 'Content Generation Hardening', version: '1.0', status: 'active', scope: 'content',
    purpose: 'Reject invalid generation candidates and enforce export-time content checks.',
    enforces: ['Critical generation candidates are rejected', 'Auto-remediation only for uncommitted AI candidates', 'Export validation', 'Book type lock after generated content'],
    doesNotClaim: ['Authority to silently replace committed or user-authored content'],
    dependencies: ['2', '6'], sourceFile: 'src/lib/contract3Validation.ts',
  },
  {
    id: '4', code: 'PERF-1.0', name: 'Performance Guarantees', version: '1.0', status: 'active', scope: 'performance',
    purpose: 'Measure page interaction performance from explicit operation baselines.',
    enforces: ['TTI thresholds use elapsed duration, not raw performance.now()', 'Blocking-render instrumentation', 'Skeleton-first patterns'],
    doesNotClaim: ['A page passed when it was not observed'],
    dependencies: [], sourceFile: 'src/lib/performanceContracts.ts',
  },
  {
    id: '5', code: 'UXR-1.1', name: 'Performance, Media & UX Reliability', version: '1.1', status: 'active', scope: 'performance',
    purpose: 'Report UX reliability from observed runtime evidence.',
    enforces: ['Elapsed page metrics', 'Connection-state diagnostics', 'Pass/fail/unknown compliance states'],
    doesNotClaim: ['Unobserved audio, reader, trust-signal, or connection checks passed'],
    dependencies: ['4'], sourceFile: 'src/lib/contract5.ts',
  },
  {
    id: '6', code: 'BTG-1.0', name: 'Book Type Governance & Content Fidelity', version: '1.0', status: 'frozen', scope: 'content',
    purpose: 'Make the selected book type an executable content constitution.',
    enforces: ['Canonical book-type set includes academic, professional, workbook, bestseller, comic, children, technical, reference, fiction, illustrated and text', 'Type-specific structure and hard constraints', 'Cross-type contamination checks', 'Type lock during regeneration'],
    doesNotClaim: ['Factual accuracy by itself', 'Copyright clearance', 'Pedagogical efficacy by itself'],
    dependencies: [], sourceFile: 'src/lib/bookTypeGovernance.ts', serverAuthority: 'supabase/functions/_shared/contract6-governance.ts',
  },
  {
    id: '6A', code: 'CA-1.0', name: 'Certificate Authority & Issuer Identity', version: '1.0', status: 'frozen', scope: 'credential',
    purpose: 'Keep issuer identity canonical and prevent legal-rights overclaims.',
    enforces: ['Canonical ScrollLibrary Certification Authority identity', 'Server issuance only', 'Safe learning-record labels'],
    doesNotClaim: ['Copyright ownership', 'Accreditation', 'Professional licensure', 'Employment eligibility'],
    dependencies: [], sourceFile: 'src/lib/certificateAuthority.ts', serverAuthority: 'supabase/functions/_shared/contract-canonical.ts',
  },
  {
    id: '6B', code: 'INT-1.0', name: 'Assessment Integrity Evidence', version: '1.0', status: 'frozen', scope: 'credential',
    purpose: 'Generate integrity evidence only from a server-owned assessment session.',
    enforces: ['Browser cannot insert authoritative integrity rows', 'Server-scored session telemetry', 'Trusted/review/reject classification', 'Missing authoritative integrity fails closed'],
    doesNotClaim: ['Perfect cheating detection', 'AI-authorship detection', 'Proof of misconduct from one signal'],
    dependencies: ['8'], sourceFile: 'src/hooks/useAssessmentIntegrity.ts', serverAuthority: 'supabase/functions/assessment-session/index.ts',
  },
  {
    id: '6C', code: 'CEG-1.1', name: 'Certificate Eligibility & Issuance Gate', version: '1.1', status: 'frozen', scope: 'credential',
    purpose: 'Make one server function the authority for learning-record issuance.',
    enforces: ['≥80% verified learner chapter coverage', 'One authoritative ARC-passing assessment per required chapter', 'Integrity threshold ≥0.6 for completion', 'Mastery score/integrity ≥0.9', '24-hour cooldown after failed mastery attempt', 'Idempotent issuance per unchanged book state'],
    doesNotClaim: ['That chapter generation equals reading', 'That client-side scores are evidence'],
    dependencies: ['6A', '6B', '8', '12'], sourceFile: 'src/lib/certificateEligibility.ts', serverAuthority: 'supabase/functions/validate-certificate/index.ts',
  },
  {
    id: '7', code: 'CTP-1.1', name: 'Certification & Trust Portability', version: '1.1', status: 'frozen', scope: 'credential',
    purpose: 'Expose a public, read-only verification surface without weakening evidence rules.',
    enforces: ['Public verification without login', 'Server-authoritative validity state', 'Valid/invalid/revoked/unverifiable distinction'],
    doesNotClaim: ['Accredited-degree equivalence', 'Employment eligibility'],
    dependencies: ['6C', '12'], sourceFile: 'src/pages/CertificateVerify.tsx', serverAuthority: 'supabase/functions/verify-certificate/index.ts',
  },
  {
    id: '8', code: 'ARC-1.0', name: 'Assessment Rigor Contract', version: '1.0', status: 'frozen', scope: 'credential',
    purpose: 'Prevent shallow question sets from producing credential evidence.',
    enforces: ['Completion: ≥5 questions, ≥2 Tier 2, ≥1 Tier 3, Tier 1 ≤40%', 'Mastery: ≥7 questions, ≥2 Tier 2, ≥2 Tier 3, ≥1 Tier 4, Tier 1 ≤30%', 'Technical assessments require coding questions', 'Server persists contract version/pass state and manifest hash'],
    doesNotClaim: ['Perfect question quality', 'Professional-exam equivalence'],
    dependencies: ['6'], sourceFile: 'src/lib/assessmentRigorContract.ts', serverAuthority: 'supabase/functions/assessment-session/index.ts',
  },
  {
    id: '9', code: 'ICG-1.0', name: 'Illustrated Content Generation', version: '1.0', status: 'frozen', scope: 'visual',
    purpose: 'Require purposeful, accessible and structurally usable visuals.',
    enforces: ['Visual-required book types cannot publish visual-empty chapters', 'Caption, alt text, learning objective and in-text reference required', 'Chart axis/legend and diagram legend evidence'],
    doesNotClaim: ['Copyright clearance', 'Artistic merit'],
    dependencies: ['6'], sourceFile: 'src/lib/illustratedContentContract.ts',
  },
  {
    id: '10', code: 'VSC-1.0', name: 'Visual Style Consistency', version: '1.0', status: 'frozen', scope: 'visual',
    purpose: 'Make style-lock verification evidence-driven.',
    enforces: ['Art-style evidence', 'Palette evidence', 'Line-weight evidence', 'Structured character-trait hashing', 'Chart-theme drift check when observed', 'Missing required evidence blocks publication'],
    doesNotClaim: ['Visual consistency when detector evidence is absent'],
    dependencies: ['9'], sourceFile: 'src/lib/visualStyleConsistency.ts',
  },
  {
    id: '11', code: 'VRA-1.0', name: 'Visual Referencing in Assessment', version: '1.0', status: 'frozen', scope: 'visual',
    purpose: 'Bind higher-tier questions to actual chapter visuals.',
    enforces: ['≥30% Tier 2/3 questions carry valid visual IDs when visuals exist', 'Unresolved visual IDs are critical', 'Charts/diagrams require actual Tier 2/3 references'],
    doesNotClaim: ['Visual literacy from unverified boolean flags'],
    dependencies: ['8', '9', '10'], sourceFile: 'src/lib/visualReferenceAssessment.ts',
  },
  {
    id: '12', code: 'BPB-1.0', name: 'Book Provenance & Certification Binding', version: '1.0', status: 'frozen', scope: 'credential',
    purpose: 'Bind each issued learning record to one canonical full-content book state.',
    enforces: ['Real SHA-256 over canonical full book content', 'Live SHA-256 recomputation during public verification', 'Hash mismatch invalidates', 'Missing live proof is unverifiable', 'Revocation has highest precedence'],
    doesNotClaim: ['Validity when live provenance cannot be recomputed', 'Authorship', 'Content accuracy'],
    dependencies: ['6C', '8'], sourceFile: 'src/lib/contract12-provenance.ts', serverAuthority: 'supabase/functions/verify-certificate/index.ts',
  },
  {
    id: 'VLD', code: 'VLD-1.1', name: 'Verified Learning Decks', version: '1.1', status: 'active', scope: 'learning',
    purpose: 'Separate ordinary learning-aid decks from evidence-backed verified decks.',
    enforces: ['Basic decks may be generated without credential claims', 'Verified status requires ≥80% reading, all required quizzes ≥70%, and no integrity flags'],
    doesNotClaim: ['Unrestricted decks are verified proof of learning'],
    dependencies: ['6B', '8', '12'], sourceFile: 'src/lib/learningDeckContract.ts',
  },
];

export const CONTRACT_DEPENDENCY_GRAPH = `
2 → 3 → 6
6 → 8 → 6B → 6C → 7
6 → 9 → 10 → 11 → 12
8 → 11
8 + 6B + 12 → VLD verified status
6C + 12 → public verification
`;

export const VALIDITY_HIERARCHY = `
1. REVOKED → revoked / invalid
2. LIVE PROVENANCE UNAVAILABLE → unverifiable
3. SHA-256 MISMATCH → invalid
4. COVERAGE < 80% → invalid
5. ASSESSMENT CONTRACT NOT PROVEN → invalid/unverifiable
6. INTEGRITY BELOW THRESHOLD / REJECT → invalid
7. ALL REQUIRED CHECKS PASS → valid
`;

export const CONTRACT_STACK_DISCLAIMER = `
ScrollLibrary learning records document platform-specific learning evidence. They do not constitute accredited degrees, professional licences, copyright grants, or employment-eligibility determinations.
`;

export function getContract(id: string | number): ContractDefinition | undefined {
  return CONTRACT_STACK.find(contract => contract.id === String(id));
}

export function getContractByCode(code: string): ContractDefinition | undefined {
  return CONTRACT_STACK.find(contract => contract.code === code);
}
