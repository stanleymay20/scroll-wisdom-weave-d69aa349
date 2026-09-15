/**
 * CONTRACT 6A — CERTIFICATE AUTHORITY & SIGNATURE GOVERNANCE
 * Status: CORE · LOCKED · IMMUTABLE
 *
 * All learning records are issued exclusively by ScrollLibrary Certification Authority.
 * The issuer identity is canonical across client, server, exports, and verification UI.
 */

import founderSignature from '@/assets/signatures/founder-signature.png';

export interface CertificateIssuer {
  readonly authority: string;
  readonly representative: string;
  readonly title: string;
  readonly signatureImage: string;
  readonly locked: true;
}

export const CERTIFICATE_ISSUER: CertificateIssuer = Object.freeze({
  authority: 'ScrollLibrary Certification Authority',
  representative: 'Founder',
  title: 'Founder & Publishing Director',
  signatureImage: founderSignature,
  locked: true,
});

export function getIssuerSignature(): string { return CERTIFICATE_ISSUER.signatureImage; }
export function getIssuerName(): string { return CERTIFICATE_ISSUER.representative; }
export function getIssuerTitle(): string { return CERTIFICATE_ISSUER.title; }
export function getIssuerAuthority(): string { return CERTIFICATE_ISSUER.authority; }

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

/**
 * Client-side display hash only. Server issuance uses a high-entropy random
 * verification token and Contract 12 SHA-256 book-content binding. This helper
 * must never be treated as server authority.
 */
export async function generateVerificationHash(certificateId: string, issuedAt: Date): Promise<string> {
  const data = [
    CERTIFICATE_ISSUER.authority,
    CERTIFICATE_ISSUER.representative,
    certificateId,
    issuedAt.toISOString(),
  ].join('|');
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function generateScrollPublishingCode(bookTitle: string, issuedAt: Date): string {
  const year = issuedAt.getFullYear();
  const month = (issuedAt.getMonth() + 1).toString().padStart(2, '0');
  const titleCode = bookTitle.replace(/[^A-Z]/gi, '').substring(0, 4).toUpperCase();
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const random = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `SPC-${year}${month}-${titleCode}-${random}`;
}

/**
 * Local preview helper only. Production issuance MUST use validate-certificate.
 */
export async function createCertificate(
  recipient: CertificateRecipient,
  content: Omit<CertificateContent, 'certificateId'>
): Promise<Certificate> {
  if (recipient.name.toLowerCase() === CERTIFICATE_ISSUER.representative.toLowerCase()) {
    throw new Error('CERTIFICATE_INTEGRITY_ERROR: Recipient cannot equal issuer');
  }
  if (recipient.name.toLowerCase().includes(CERTIFICATE_ISSUER.authority.toLowerCase())) {
    throw new Error('CERTIFICATE_INTEGRITY_ERROR: Recipient name cannot contain issuer authority');
  }

  const random = crypto.getRandomValues(new Uint8Array(8));
  const idEntropy = Array.from(random, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const certificateId = `CERT-${Date.now()}-${idEntropy}`;
  const issuedAt = new Date();
  const fullContent: CertificateContent = { ...content, certificateId };

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

export function validateCertificateIntegrity(certificate: Certificate): boolean {
  if (certificate.issuer.authority !== CERTIFICATE_ISSUER.authority) return false;
  if (certificate.issuer.representative !== CERTIFICATE_ISSUER.representative) return false;
  if (certificate.issuer.title !== CERTIFICATE_ISSUER.title) return false;
  if (certificate.issuer.locked !== true) return false;
  if (certificate.issuer.authority.includes(certificate.recipient.name)) return false;
  if (certificate.issuer.representative.includes(certificate.recipient.name)) return false;
  return true;
}

export type CertificateType = 'completion' | 'mastery' | 'publishing' | 'authorship';

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
    displayName: 'Structured Study Completion Record',
    description: 'Records verified completion of the required ScrollLibrary learning and assessment evidence for a specific book state.',
    requiresMinProgress: 80,
    requiresQuiz: true,
    grantedRights: ['Personal credential reference'],
  },
  mastery: {
    type: 'mastery',
    displayName: 'Mastery Learning Record',
    description: 'Records that the platform mastery thresholds were satisfied for a specific book state. It is not an accredited degree or professional licence.',
    requiresMinProgress: 80,
    requiresQuiz: true,
    grantedRights: ['Professional learning reference'],
  },
  publishing: {
    type: 'publishing',
    displayName: 'AI Content Generation Record',
    description: 'Documents an AI-assisted generation event. It does not grant copyright, commercial rights, or distribution rights.',
    requiresMinProgress: 0,
    requiresQuiz: false,
    grantedRights: ['Personal reference use', 'AI-assisted generation attribution'],
  },
  authorship: {
    type: 'authorship',
    displayName: 'Content Generation Record',
    description: 'Records a generation session. Human authorship and copyright status must be established independently.',
    requiresMinProgress: 0,
    requiresQuiz: false,
    grantedRights: ['Generation timestamp record', 'Human editorial attribution when documented'],
  },
};
