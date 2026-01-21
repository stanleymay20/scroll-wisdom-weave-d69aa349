/**
 * CONTRACT 6A — CERTIFICATE COMPONENTS
 * Trust & Certification UX for publishing credibility
 */

export { CertificateDisplay } from './CertificateDisplay';
export { CertificateGenerator } from './CertificateGenerator';
export { CertificateStatusPanel } from './CertificateStatusPanel';
export { PublishingCredibility } from './PublishingCredibility';
export { TrustBadge, TrustBadgeGroup, EmbeddableTrustBadge, generateEmbedCode } from './TrustBadges';
export { CompetencyManifestDisplay } from './CompetencyManifestDisplay';
export type { TrustBadgeType } from './TrustBadges';

export { 
  CERTIFICATE_ISSUER,
  CERTIFICATE_TYPES,
  createCertificate,
  generateVerificationHash,
  generateScrollPublishingCode,
  validateCertificateIntegrity,
  getIssuerSignature,
  getIssuerName,
  getIssuerTitle,
  getIssuerAuthority,
} from '@/lib/certificateAuthority';

export type {
  Certificate,
  CertificateIssuer,
  CertificateRecipient,
  CertificateContent,
  CertificateType,
  CertificateTypeConfig,
} from '@/lib/certificateAuthority';
