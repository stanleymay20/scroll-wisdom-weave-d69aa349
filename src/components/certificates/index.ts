/**
 * CONTRACT 6A — CERTIFICATE COMPONENTS
 * Trust & Certification UX for publishing credibility
 */

export { CertificateDisplay } from './CertificateDisplay';
export { CertificateGenerator } from './CertificateGenerator';
export { PublishingCredibility } from './PublishingCredibility';

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
