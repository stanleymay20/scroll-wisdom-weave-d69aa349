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
 * Generate verification hash from issuer-only data using SHA-256.
 * Uses Web Crypto API (available in all modern browsers).
 * Learner name is EXCLUDED from hash to prevent self-signing.
 * 
 * CONTRACT: This hash binds certificate identity to the issuing authority.
 * Any tampering with issuer fields will produce a non-matching hash.
 */
export async function generateVerificationHash(
  certificateId: string,
  issuedAt: Date
): Promise<string> {
  const data = [
    CERTIFICATE_ISSUER.authority,
    CERTIFICATE_ISSUER.representative,
    certificateId,
    issuedAt.toISOString(),
  ].join('|');

  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Return first 16 hex chars (64-bit prefix) — sufficient for display
    // Full 256-bit hash is stored server-side for verification
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();
  } catch {
    // Fallback for environments where crypto.subtle is unavailable (should not occur in 2026)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `FALLBACK-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
  }
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

export async function createCertificate(
  recipient: CertificateRecipient,
  content: Omit<CertificateContent, 'certificateId'>
): Promise<Certificate> {
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
    verificationHash: await generateVerificationHash(certificateId, issuedAt),
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
    displayName: 'AI Content Generation Record',
    // AUDIT FIX: "Publishing Rights Certificate" overclaims legal rights for AI-generated content.
    // AI-generated content cannot be granted "commercial" or "distribution" rights by a platform.
    // This record documents the generation event only; users retain responsibility for legal review.
    description: 'Documents AI-assisted content generation. Does not grant copyright or commercial rights. Subject to applicable AI content laws.',
    requiresMinProgress: 0,
    requiresQuiz: false,
    grantedRights: ['Personal reference use', 'Attribution to AI-assisted generation', 'Editorial review recommended before publication'],
  },
  authorship: {
    type: 'authorship',
    displayName: 'Content Generation Record',
    // AUDIT FIX: "Authorship Verification" implies legal copyright which cannot be conferred by AI platform.
    // Per US Copyright Office (2023), AI-generated content without meaningful human authorship is not copyrightable.
    description: 'Records the AI generation session. Human authorship and editorial contribution must be documented separately for copyright purposes.',
    requiresMinProgress: 0,
    requiresQuiz: false,
    grantedRights: ['Generation timestamp record', 'Human editorial attribution (if applicable)'],
  },
};
