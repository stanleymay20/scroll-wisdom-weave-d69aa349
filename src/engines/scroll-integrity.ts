/**
 * ScrollIntegrity Engine
 * =======================
 * Academic trust, citation verification, AI authorship governance,
 * and audit traceability.
 *
 * Owns: Citations, provenance, content protection, audit logs
 */

// ─── Citation & Reference System ─────────────────────────
export { citationParsing } from '@/lib/citationParsing';
export { citations } from '@/lib/citations';
export { referenceIntegrity } from '@/lib/referenceIntegrity';
export { referenceVerification } from '@/lib/referenceVerification';
export { ReferenceCompliancePanel } from '@/components/certificates/ReferenceCompliancePanel';

// ─── Provenance & Ownership ──────────────────────────────
export { bookProvenance } from '@/lib/contract12-provenance';
export { BookProvenancePanel } from '@/components/certificates/BookProvenancePanel';

// ─── Epistemic & Semantic Integrity ──────────────────────
export { epistemicCoherence } from '@/lib/epistemicCoherence';
export { semanticIntegrity } from '@/lib/semanticIntegrity';
export { claimExtraction } from '@/lib/claimExtraction';
export { computationalEvidence } from '@/lib/computationalEvidence';
export { ComputationalEvidencePanel } from '@/components/reader/ComputationalEvidencePanel';

// ─── Content Protection ──────────────────────────────────
export { useContentProtection } from '@/hooks/useContentProtection';
export { usePasteProtection } from '@/hooks/usePasteProtection';
export { useAssessmentIntegrity } from '@/hooks/useAssessmentIntegrity';

// ─── Governance Contracts ────────────────────────────────
export { contract6Governance } from '@/lib/contract6-governance';
export { useContract6Gate } from '@/hooks/useContract6Gate';
export { contract5 } from '@/lib/contract5';
export { useContract5 } from '@/hooks/useContract5';

// ─── Security & Audit ────────────────────────────────────
export { securityAudit } from '@/lib/securityAudit';
export { bookAuditIntegration } from '@/lib/bookAuditIntegration';

// ─── Trust UI ────────────────────────────────────────────
export {
  PublishingCredibility,
  TrustBadge,
  TrustBadgeGroup,
  CertificationEmblem,
} from '@/components/certificates';

// ─── Legal Compliance ────────────────────────────────────
export { ContentDisclaimer } from '@/components/legal/ContentDisclaimer';
export { CookieConsent } from '@/components/legal/CookieConsent';
export { ReportContentDialog } from '@/components/legal/ReportContentDialog';
