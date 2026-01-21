/**
 * ============================================================================
 * SCROLLLIBRARY CONTRACT STACK OVERVIEW (v1.0)
 * ============================================================================
 * 
 * Status: FROZEN DOCTRINE
 * Effective: 2026-01-21
 * 
 * This document serves as the authoritative reference for all governance
 * contracts (6–12) that power ScrollLibrary's credentialing system.
 * 
 * PURPOSE:
 * - Institutional memory for developers
 * - Legal documentation for auditors
 * - Trust reference for employers/universities
 * - Onboarding guide for new contributors
 * 
 * MODIFICATION RULES:
 * - Frozen contracts require versioned upgrades (e.g., 6.1, 6.2)
 * - No silent edits to frozen contracts
 * - Breaking changes require new major version
 * 
 * ============================================================================
 */

// ============================================================================
// CONTRACT REGISTRY
// ============================================================================

export interface ContractDefinition {
  id: number;
  code: string;
  name: string;
  version: string;
  status: 'frozen' | 'active' | 'draft';
  effectiveDate: string;
  purpose: string;
  enforces: string[];
  doesNotClaim: string[];
  dependencies: number[];
  sourceFile: string;
}

export const CONTRACT_STACK: ContractDefinition[] = [
  // =========================================================================
  // CONTRACT 6 — BOOK TYPE GOVERNANCE
  // =========================================================================
  {
    id: 6,
    code: 'BTG-1.0',
    name: 'Book Type Governance & Content Fidelity',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Once a book type is selected, the AI becomes a governed author bound by strict rules. Eliminates cross-type contamination and ensures predictable, professional output.',
    enforces: [
      'Type lock is immutable after selection',
      'Generator identity matches book type (e.g., Academic = Lecturer)',
      'Forbidden patterns blocked for each type',
      'Story markers blocked in technical/academic books',
      'Word count limits enforced for workbooks/children',
      'Panel structure required for comics',
    ],
    doesNotClaim: [
      'Content quality beyond structural compliance',
      'Factual accuracy of information',
      'Pedagogical effectiveness',
    ],
    dependencies: [],
    sourceFile: 'src/lib/contract6-governance.ts',
  },

  // =========================================================================
  // CONTRACT 6A — CERTIFICATE ISSUER IDENTITY
  // =========================================================================
  {
    id: 6.1,
    code: '6A',
    name: 'Certificate Issuer Identity',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'All certificates are issued solely by the ScrollLibrary Certification Authority (Founder Signature). No user or AI claims issuer status.',
    enforces: [
      'Hard-coded Founder Signature on all credentials',
      'Issuer identity is immutable',
      'User identity is certificate holder, not issuer',
    ],
    doesNotClaim: [
      'User authored the book',
      'Platform endorses user judgment',
    ],
    dependencies: [],
    sourceFile: 'src/lib/certificateAuthority.ts',
  },

  // =========================================================================
  // CONTRACT 6B — INTEGRITY DETECTION
  // =========================================================================
  {
    id: 6.2,
    code: '6B',
    name: 'Integrity Detection & Behavioral Signals',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Tracks real-time behavioral signals (typing patterns, paste detection, focus loss, timing anomalies) to generate integrity scores used in eligibility gates.',
    enforces: [
      'Typing variance detection',
      'Paste count tracking',
      'Focus loss monitoring',
      'Suspicious timing detection',
      'Integrity score calculation (0-1)',
      'Classification: trusted (≥0.9), review (0.6-0.9), reject (<0.6)',
    ],
    doesNotClaim: [
      'Detection of AI-generated content',
      'Proof of cheating (only flags for review)',
      'Perfect detection accuracy',
    ],
    dependencies: [],
    sourceFile: 'src/hooks/useAssessmentIntegrity.ts',
  },

  // =========================================================================
  // CONTRACT 6C — CERTIFICATE ELIGIBILITY GATE
  // =========================================================================
  {
    id: 6.3,
    code: '6C',
    name: 'Certificate Eligibility & Issuance Gate',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Pure eligibility engine determining IF and WHICH certificate a learner may receive. Consumes outputs from 6A and 6B.',
    enforces: [
      'Completion: ≥80% chapter coverage + all quizzes + integrity ≥0.6',
      'Mastery: ≥90% average score + integrity ≥0.9 + no flags',
      '24-hour cooldown after failed mastery attempt',
      'Hash mismatch invalidates certificate',
      'Server-side revalidation required',
    ],
    doesNotClaim: [
      'Modification of detection logic (6B)',
      'Modification of issuer identity (6A)',
      'Side effects during evaluation',
    ],
    dependencies: [6.1, 6.2],
    sourceFile: 'src/lib/certificateEligibility.ts',
  },

  // =========================================================================
  // CONTRACT 7 — CERTIFICATION PORTABILITY
  // =========================================================================
  {
    id: 7,
    code: 'CTP-1.0',
    name: 'Certification & Trust Portability',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Certificates are portable via canonical URLs and support PDF/JSON exports. Employers can verify without authentication.',
    enforces: [
      'Canonical URL: /certificate/:id',
      'PDF export with embedded provenance',
      'JSON export for machine verification',
      'Public verification without auth',
      'Batch verification for institutions',
    ],
    doesNotClaim: [
      'Authorship of book content',
      'Employment eligibility',
      'Equivalence to accredited degrees',
    ],
    dependencies: [6.1, 6.3],
    sourceFile: 'src/pages/CertificateVerify.tsx',
  },

  // =========================================================================
  // CONTRACT 8 — ASSESSMENT RIGOR (ARC-1.0)
  // =========================================================================
  {
    id: 8,
    code: 'ARC-1.0',
    name: 'Assessment Rigor Contract',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Ensures quiz generation meets certification standards with mandatory Tier 2/3 questions, coding challenges for technical content, and anti-pattern detection.',
    enforces: [
      '4-tier assessment: Knowledge → Applied → Scenario → Integrity',
      'MCQs alone insufficient for certification',
      'Minimum Tier 2 questions: 2 (reasoning)',
      'Minimum Tier 3 questions: 1 (scenario/debugging)',
      'Tier 1 ratio maximum: 40%',
      'Anti-pattern detection (obvious answers, position bias)',
      'Coding questions required for technical content',
    ],
    doesNotClaim: [
      'Perfect question quality',
      'Complete coverage of topic',
      'Equivalence to professional certification exams',
    ],
    dependencies: [6],
    sourceFile: 'src/lib/assessmentRigorContract.ts',
  },

  // =========================================================================
  // CONTRACT 9 — ILLUSTRATED CONTENT GENERATION (ICG-1.0)
  // =========================================================================
  {
    id: 9,
    code: 'ICG-1.0',
    name: 'Illustrated Content Generation',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Governs when, how, and why images, charts, graphs, and illustrations are generated — so visuals add learning value, not noise.',
    enforces: [
      'Illustrated/Comic/Children books: illustrations REQUIRED',
      'Every visual must have: caption, alt text, learning objective',
      'Every visual must be referenced in text',
      'No orphan images, no decorative filler',
      'Charts require axis labels; diagrams require legends',
      'Style consistency across chapters',
      'Score <60 or broken images → BLOCK PUBLISHING',
    ],
    doesNotClaim: [
      'Artistic quality standards',
      'Copyright clearance',
      'Accessibility beyond alt text',
    ],
    dependencies: [6],
    sourceFile: 'src/lib/illustratedContentContract.ts',
  },

  // =========================================================================
  // CONTRACT 10 — VISUAL STYLE CONSISTENCY (VSC-1.0)
  // =========================================================================
  {
    id: 10,
    code: 'VSC-1.0',
    name: 'Visual Style Consistency',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Prevents "style drift" across chapters by locking visual properties at book creation time.',
    enforces: [
      'Art style locked (realistic, cartoon, anime, etc.)',
      'Color palette locked (primary, secondary, accent)',
      'Character designs hashed for consistency verification',
      'Chart themes locked (colors, fonts, styling)',
      'Line weight locked (thin, medium, thick)',
      'Style drift detection on every generated image',
      'Critical violations → BLOCK PUBLISHING',
    ],
    doesNotClaim: [
      'Artistic quality',
      'Color accessibility compliance',
      'Cross-platform rendering consistency',
    ],
    dependencies: [9],
    sourceFile: 'src/lib/visualStyleConsistency.ts',
  },

  // =========================================================================
  // CONTRACT 11 — VISUAL REFERENCING IN ASSESSMENT (VRA-1.0)
  // =========================================================================
  {
    id: 11,
    code: 'VRA-1.0',
    name: 'Visual Referencing in Assessment',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-01',
    purpose: 'Mandates that Tier 2/3 assessment questions must reference visuals when present, creating a hard-link between visual literacy and assessment integrity.',
    enforces: [
      'Minimum 30% of Tier 2/3 questions must reference visuals',
      'Charts present → data interpretation questions required',
      'Diagrams present → process analysis questions required',
      'Formal notation: "Figure X.X", "Diagram X.X"',
      'Warning if below minimum reference rate',
      'Score deduction for unreferenced visuals',
    ],
    doesNotClaim: [
      'Visual literacy proficiency',
      'Complete visual coverage in assessment',
    ],
    dependencies: [8, 9, 10],
    sourceFile: 'src/lib/visualReferenceAssessment.ts',
  },

  // =========================================================================
  // CONTRACT 12 — BOOK PROVENANCE & CERTIFICATION BINDING
  // =========================================================================
  {
    id: 12,
    code: 'BPB-1.0',
    name: 'Book Provenance & Certification Binding',
    version: '1.0',
    status: 'frozen',
    effectiveDate: '2026-01-21',
    purpose: 'Ensures certificates are cryptographically and structurally tied to a specific book state. Any mismatch invalidates the certificate.',
    enforces: [
      'Every certificate includes immutable book identifiers',
      'SHA256 content hash binding mandatory',
      'Hash mismatch → certificate INVALID',
      'Minimum 80% chapter coverage required',
      'All provenance data publicly accessible',
      'Human-readable explanations accompany technical data',
      'Employers can verify without authentication',
      'Validity hierarchy: Revoked > Hash > Coverage > Integrity > Valid',
      'Public verification context = IMMUTABLE VIEW ONLY',
    ],
    doesNotClaim: [
      'Authorship of book content',
      'Content quality',
      'Factual accuracy',
    ],
    dependencies: [6.3, 8, 10, 11],
    sourceFile: 'src/lib/contract12-provenance.ts',
  },
];

// ============================================================================
// DEPENDENCY GRAPH
// ============================================================================

export const CONTRACT_DEPENDENCY_GRAPH = `
  ┌─────────────────────────────────────────────────────────────────┐
  │                    CONTRACT DEPENDENCY GRAPH                     │
  └─────────────────────────────────────────────────────────────────┘

  CONTRACT 6 (Book Type Governance)
       │
       ├──► CONTRACT 6A (Issuer Identity)
       │         │
       │         └──► CONTRACT 6C (Eligibility Gate)
       │                   │
       │                   └──► CONTRACT 7 (Portability)
       │                             │
       │                             └──► CONTRACT 12 (Provenance Binding)
       │
       ├──► CONTRACT 6B (Integrity Detection)
       │         │
       │         └──► CONTRACT 6C (Eligibility Gate)
       │
       ├──► CONTRACT 8 (Assessment Rigor - ARC-1.0)
       │         │
       │         └──► CONTRACT 11 (Visual Assessment - VRA-1.0)
       │                   │
       │                   └──► CONTRACT 12 (Provenance Binding)
       │
       └──► CONTRACT 9 (Illustrated Content - ICG-1.0)
                 │
                 └──► CONTRACT 10 (Visual Style - VSC-1.0)
                           │
                           └──► CONTRACT 11 (Visual Assessment - VRA-1.0)

  ═══════════════════════════════════════════════════════════════════
  CRITICAL PATH: 6 → 6C → 7 → 12 (Certification Issuance Chain)
  ═══════════════════════════════════════════════════════════════════
`;

// ============================================================================
// VALIDITY HIERARCHY (CONTRACT 12 ENFORCEMENT)
// ============================================================================

export const VALIDITY_HIERARCHY = `
  ┌─────────────────────────────────────────────────────────────────┐
  │               CERTIFICATE VALIDITY HIERARCHY                     │
  │                  (Contract 12 Enforcement)                       │
  └─────────────────────────────────────────────────────────────────┘

  Order of precedence (highest priority first):

  1. REVOKED?        → ❌ INVALID (cannot be overridden)
  2. HASH MISMATCH?  → ❌ INVALID (book content changed)
  3. COVERAGE < 80%? → ❌ INVALID (insufficient mastery)
  4. INTEGRITY FAIL? → ❌ INVALID (behavioral flags)
  5. ALL PASS        → ✅ VALID

  ═══════════════════════════════════════════════════════════════════
  NOTE: This hierarchy is immutable. No lower-priority check can
  override a higher-priority failure.
  ═══════════════════════════════════════════════════════════════════
`;

// ============================================================================
// LEGAL DISCLAIMER
// ============================================================================

export const CONTRACT_STACK_DISCLAIMER = `
  ┌─────────────────────────────────────────────────────────────────┐
  │                     IMPORTANT DISCLAIMER                         │
  └─────────────────────────────────────────────────────────────────┘

  ScrollLibrary certificates verify LEARNING OUTCOMES, not:
  
  ❌ Authorship of book content
  ❌ Equivalence to accredited academic degrees
  ❌ Employment eligibility or professional certification
  ❌ AI-free content creation
  ❌ Peer-reviewed research quality

  Book content is generated using AI assistance and certified through
  ScrollLibrary's governed assessment system.

  The certification authority (Founder Signature) attests only that:
  ✓ The learner completed the required chapters
  ✓ The learner passed required assessments
  ✓ Integrity tracking was active during assessment
  ✓ The certificate is bound to a specific book state

  For questions about certification validity, contact:
  verify@scrolllibrary.app
`;

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Get a specific contract by ID
 */
export function getContract(id: number): ContractDefinition | undefined {
  return CONTRACT_STACK.find(c => c.id === id);
}

/**
 * Get all contracts that depend on a specific contract
 */
export function getDependents(contractId: number): ContractDefinition[] {
  return CONTRACT_STACK.filter(c => c.dependencies.includes(contractId));
}

/**
 * Get all dependencies for a specific contract
 */
export function getDependencies(contractId: number): ContractDefinition[] {
  const contract = getContract(contractId);
  if (!contract) return [];
  return contract.dependencies
    .map(id => getContract(id))
    .filter((c): c is ContractDefinition => c !== undefined);
}

/**
 * Check if all contracts are in frozen status
 */
export function allContractsFrozen(): boolean {
  return CONTRACT_STACK.every(c => c.status === 'frozen');
}

/**
 * Get human-readable contract summary
 */
export function getContractSummary(contractId: number): string {
  const contract = getContract(contractId);
  if (!contract) return 'Contract not found';
  
  return `
CONTRACT ${contract.id} — ${contract.name}
Code: ${contract.code}
Version: ${contract.version}
Status: ${contract.status.toUpperCase()}
Effective: ${contract.effectiveDate}

PURPOSE:
${contract.purpose}

ENFORCES:
${contract.enforces.map(e => `• ${e}`).join('\n')}

DOES NOT CLAIM:
${contract.doesNotClaim.map(e => `• ${e}`).join('\n')}

DEPENDENCIES: ${contract.dependencies.length > 0 ? contract.dependencies.join(', ') : 'None'}
SOURCE: ${contract.sourceFile}
  `.trim();
}
