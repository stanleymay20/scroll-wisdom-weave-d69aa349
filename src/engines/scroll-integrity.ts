/**
 * ScrollIntegrity Engine
 * =======================
 * Academic trust, citation verification, AI authorship governance,
 * and audit traceability.
 *
 * Owns: Citations, provenance, content protection, audit logs
 */

// ─── Citation & Reference System ─────────────────────────
export { ReferenceCompliancePanel } from '@/components/certificates/ReferenceCompliancePanel';
export type { ReferenceVerificationMetrics } from '@/lib/referenceVerification';
export type { EpistemicCoherenceReport } from '@/lib/epistemicCoherence';

// ─── Citation Graph (Atlas) ──────────────────────────────
export { buildCitationGraph } from '@/lib/citationGraph';
export type { CitationGraph, ClaimRecord, GraphNode, GraphEdge } from '@/lib/citationGraph';

// ─── LMS Distribution ────────────────────────────────────
export { ScormExportDialog } from '@/components/export/ScormExportDialog';
export { buildScormPackage, suggestedFilename as scormFilename } from '@/lib/scormExport';
export type { ScormBook, ScormChapter, ScormCertificate } from '@/lib/scormExport';

// ─── Provenance & Ownership ──────────────────────────────
export { default as bookProvenance } from '@/lib/contract12-provenance';
export { BookProvenancePanel } from '@/components/certificates/BookProvenancePanel';

// ─── Computational Evidence ──────────────────────────────
export type { ComputationalEvidenceBlock } from '@/lib/computationalEvidence';
export { ComputationalEvidencePanel } from '@/components/reader/ComputationalEvidencePanel';

// ─── Content Protection ──────────────────────────────────
export { useContentProtection } from '@/hooks/useContentProtection';
export { usePasteProtection } from '@/hooks/usePasteProtection';
export { useAssessmentIntegrity } from '@/hooks/useAssessmentIntegrity';

// ─── Governance Contracts ────────────────────────────────
export { useContract6Gate } from '@/hooks/useContract6Gate';

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
