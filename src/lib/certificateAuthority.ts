/**
 * CONTRACT 6A — CERTIFICATE AUTHORITY & SIGNATURE GOVERNANCE
 * Status: CORE · LOCKED · IMMUTABLE
 * 
 * All certificates are issued EXCLUSIVELY by ScrollLibrary Certification Authority.
 * The Founder signature is system-owned and cannot be overridden by any user, AI, or prompt.
 */

import founderSignature from '@/assets/signatures/founder-signature.png';

// ===========================================
// 6A.1 — CERTIFICATE AUTHORITY (IMMUTABLE)
// ===========================================

export interface CertificateIssuer {
  readonly authority: string;
  readonly representative: string;
  readonly title: string;
  readonly signatureImage: string;
  readonly locked: true;
}

/**
 * The Issuer is a system-defined authority.
 * The Issuer is NOT the learner, reader, or user.
 * The Issuer identity is immutable and cannot be overridden.
 */
export const CERTIFICATE_ISSUER: CertificateIssuer = Object.freeze({
  authority: 'ScrollLibrary Certification Authority',
  representative: 'Founder',
  title: 'Chief Executive Officer',
  signatureImage: founderSignature,
  locked: true,
});

// ===========================================
// 6A.2 — SIGNATURE OWNERSHIP (HARD RULE)
// ===========================================

/**
 * The signature asset represents the Founder / Authorized Issuer ONLY.
 * It does NOT represent:
 * - The reader
 * - The learner
 * - The account holder
 * - Any user-generated identity
 */
export function getIssuerSignature(): string {
  return CERTIFICATE_ISSUER.signatureImage;
}

export function getIssuerName(): string {
  return CERTIFICATE_ISSUER.representative;
}

export function getIssuerTitle(): string {
  return CERTIFICATE_ISSUER.title;
}

export function getIssuerAuthority(): string {
  return CERTIFICATE_ISSUER.authority;
}

// ===========================================
// 6A.3 — CERTIFICATE ROLE SEPARATION
// ===========================================

export interface CertificateRecipient {
  name: string;
  email?: string;
  userId: string;
}

export interface CertificateContent {
  certificateId: string;
  bookTitle: string;
  bookType: string;
  completionDate: Date;
  wordCount?: number;
  chaptersCompleted: number;
  totalChapters: number;
  learningLevel?: string;
}

export interface Certificate {
  id: string;
  issuer: CertificateIssuer;
  recipient: CertificateRecipient;
  content: CertificateContent;
  verificationHash: string;
  scrollPublishingCode: string;
  issuedAt: Date;
}

// ===========================================
// 6A.4 — VERIFICATION HASH (ISSUER-ONLY)
// ===========================================

/**
 * Generate verification hash from issuer-only data.
 * Learner name is EXCLUDED from hash to prevent self-signing.
 */
export function generateVerificationHash(
  certificateId: string,
  issuedAt: Date
): string {
  const data = [
    CERTIFICATE_ISSUER.authority,
    CERTIFICATE_ISSUER.representative,
    certificateId,
    issuedAt.toISOString(),
  ].join('|');
  
  // Simple hash for demo - in production, use crypto.subtle
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(12, '0');
}

/**
 * Generate Scroll Publishing Code (SPC)
 */
export function generateScrollPublishingCode(
  bookTitle: string,
  issuedAt: Date
): string {
  const year = issuedAt.getFullYear();
  const month = (issuedAt.getMonth() + 1).toString().padStart(2, '0');
  const titleCode = bookTitle.replace(/[^A-Z]/gi, '').substring(0, 4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SPC-${year}${month}-${titleCode}-${random}`;
}

// ===========================================
// 6A.5 — CERTIFICATE GENERATION
// ===========================================

export function createCertificate(
  recipient: CertificateRecipient,
  content: Omit<CertificateContent, 'certificateId'>
): Certificate {
  // 6A SAFEGUARD: Prevent recipient from equaling issuer (anti-spoof)
  if (recipient.name.toLowerCase() === CERTIFICATE_ISSUER.representative.toLowerCase()) {
    throw new Error('CERTIFICATE_INTEGRITY_ERROR: Recipient cannot equal issuer');
  }
  if (recipient.name.toLowerCase().includes(CERTIFICATE_ISSUER.authority.toLowerCase())) {
    throw new Error('CERTIFICATE_INTEGRITY_ERROR: Recipient name cannot contain issuer authority');
  }
  
  const certificateId = `CERT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const issuedAt = new Date();
  
  const fullContent: CertificateContent = {
    ...content,
    certificateId,
  };
  
  return {
    id: certificateId,
    issuer: CERTIFICATE_ISSUER,
    recipient,
    content: fullContent,
    verificationHash: generateVerificationHash(certificateId, issuedAt),
    scrollPublishingCode: generateScrollPublishingCode(content.bookTitle, issuedAt),
    issuedAt,
  };
}

// ===========================================
// 6A.6 — AI & PROMPT SAFETY GUARDRAIL
// ===========================================

/**
 * Validate that certificate data doesn't allow issuer tampering.
 * AI may populate content, but may NEVER modify issuer or signature.
 */
export function validateCertificateIntegrity(certificate: Certificate): boolean {
  // Issuer must always be the locked authority
  if (certificate.issuer.authority !== CERTIFICATE_ISSUER.authority) {
    return false;
  }
  if (certificate.issuer.representative !== CERTIFICATE_ISSUER.representative) {
    return false;
  }
  if (certificate.issuer.locked !== true) {
    return false;
  }
  // Recipient name must never appear in issuer fields
  if (certificate.issuer.authority.includes(certificate.recipient.name)) {
    return false;
  }
  if (certificate.issuer.representative.includes(certificate.recipient.name)) {
    return false;
  }
  return true;
}

// ===========================================
// 6A.7 — CERTIFICATE TYPES
// ===========================================

export type CertificateType = 
  | 'completion'      // Book completion certificate
  | 'mastery'         // Mastery level achievement
  | 'publishing'      // Publishing rights certificate
  | 'authorship';     // Authorship verification

export interface CertificateTypeConfig {
  type: CertificateType;
  displayName: string;
  description: string;
  requiresMinProgress: number;
  requiresQuiz: boolean;
  grantedRights: string[];
}

export const CERTIFICATE_TYPES: Record<CertificateType, CertificateTypeConfig> = {
  completion: {
    type: 'completion',
    displayName: 'Certificate of Completion',
    description: 'Awarded for completing all chapters of a book',
    requiresMinProgress: 100,
    requiresQuiz: false,
    grantedRights: ['Personal use', 'Resume credential'],
  },
  mastery: {
    type: 'mastery',
    displayName: 'Certificate of Mastery',
    description: 'Awarded for achieving mastery-level understanding',
    requiresMinProgress: 100,
    requiresQuiz: true,
    grantedRights: ['Professional credential', 'Teaching reference'],
  },
  publishing: {
    type: 'publishing',
    displayName: 'Publishing Rights Certificate',
    description: 'Grants commercial publishing rights for generated content',
    requiresMinProgress: 0,
    requiresQuiz: false,
    grantedRights: ['Commercial use', 'Distribution rights', 'Derivative works'],
  },
  authorship: {
    type: 'authorship',
    displayName: 'Authorship Verification',
    description: 'Verifies authorship and content ownership',
    requiresMinProgress: 0,
    requiresQuiz: false,
    grantedRights: ['Copyright claim', 'Attribution rights'],
  },
};
