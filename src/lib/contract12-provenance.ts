/**
 * CONTRACT 12 — BOOK PROVENANCE & CERTIFICATION BINDING
 *
 * Status: LOCKED · FROZEN · v1.0
 * Effective: 2026-01-21
 *
 * Contract 12 is a cryptographic binding contract. Production issuance and
 * verification MUST use SHA-256 over the canonical representation below.
 * Missing live provenance is UNVERIFIABLE; it is never treated as a match.
 */

export const CONTRACT_12_VERSION = '1.0' as const;
export const CONTRACT_12_FROZEN = true as const;
export const CONTRACT_12_EFFECTIVE_DATE = '2026-01-21' as const;
export const MIN_COVERAGE_THRESHOLD = 0.8 as const;

export interface Contract12Metadata {
  version: typeof CONTRACT_12_VERSION;
  frozen: typeof CONTRACT_12_FROZEN;
  effectiveDate: typeof CONTRACT_12_EFFECTIVE_DATE;
  rules: readonly string[];
}

export const CONTRACT_12: Contract12Metadata = Object.freeze({
  version: CONTRACT_12_VERSION,
  frozen: CONTRACT_12_FROZEN,
  effectiveDate: CONTRACT_12_EFFECTIVE_DATE,
  rules: Object.freeze([
    '12.1 — Every certificate must include immutable book identifiers',
    '12.2 — SHA-256 content hash binding is mandatory',
    '12.3 — Hash mismatch invalidates the certificate entirely',
    '12.4 — Minimum 80% learner chapter coverage required for certification',
    '12.5 — Missing live provenance is unverifiable, never implicitly valid',
    '12.6 — Human-readable explanations accompany technical data',
    '12.7 — Employers can verify without authentication',
  ]),
});

export interface BookProvenanceBinding {
  bookId: string;
  bookTitle: string;
  bookType: string;
  bookVersion: string;
  bookContentHash: string;
  totalChapters: number;
  completedChapters: number;
  assessedChapters: number[];
  coveragePercentage: number;
  category: string;
  language: string;
  bookCreatedAt: Date;
  certifiedAt: Date;
}

export type ProvenanceStatus = 'valid' | 'invalid' | 'unverifiable';

export interface ProvenanceValidation {
  status: ProvenanceStatus;
  valid: boolean;
  hashMatch: boolean | null;
  coverageMet: boolean;
  reasons: string[];
}

/** Stable canonical serialization used by both browser tooling and server tests. */
export function canonicalizeBookContent(bookData: {
  bookId: string;
  title: string;
  chapters: Array<{ id: string; content: string; wordCount?: number; position?: number }>;
  version: string;
}): string {
  const chapters = [...bookData.chapters]
    .map((chapter, index) => ({
      id: chapter.id,
      position: chapter.position ?? index + 1,
      content: chapter.content ?? '',
      wordCount: chapter.wordCount ?? (chapter.content ?? '').trim().split(/\s+/).filter(Boolean).length,
    }))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  return JSON.stringify({
    schema: 'scrolllibrary-book-provenance-v1',
    bookId: bookData.bookId,
    title: bookData.title,
    version: bookData.version,
    chapters,
  });
}

export async function generateBookContentHash(bookData: {
  bookId: string;
  title: string;
  chapters: Array<{ id: string; content: string; wordCount?: number; position?: number }>;
  version: string;
}): Promise<string> {
  const canonical = canonicalizeBookContent(bookData);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validateProvenance(
  storedHash: string | null | undefined,
  currentHash: string | null | undefined,
  completedChapters: number,
  totalChapters: number
): ProvenanceValidation {
  const reasons: string[] = [];
  const coverage = totalChapters > 0 ? completedChapters / totalChapters : 0;
  const coverageMet = coverage >= MIN_COVERAGE_THRESHOLD;

  if (!coverageMet) reasons.push(`Insufficient coverage: ${Math.round(coverage * 100)}% < 80% minimum`);

  if (!storedHash) {
    reasons.push('Missing certification-time book hash');
    return { status: 'unverifiable', valid: false, hashMatch: null, coverageMet, reasons };
  }
  if (!currentHash) {
    reasons.push('Live book hash unavailable; provenance cannot be verified');
    return { status: 'unverifiable', valid: false, hashMatch: null, coverageMet, reasons };
  }

  const hashMatch = storedHash === currentHash;
  if (!hashMatch) reasons.push('Certificate invalid: book content has changed since certification');

  const valid = hashMatch && coverageMet;
  return { status: valid ? 'valid' : 'invalid', valid, hashMatch, coverageMet, reasons };
}

export function calculateCoverage(
  completedChapters: number,
  totalChapters: number
): { percentage: number; meetsThreshold: boolean } {
  if (totalChapters <= 0) return { percentage: 0, meetsThreshold: false };
  const percentage = Math.round((completedChapters / totalChapters) * 100);
  return { percentage, meetsThreshold: completedChapters / totalChapters >= MIN_COVERAGE_THRESHOLD };
}

export function createProvenanceBinding(
  book: {
    id: string;
    title: string;
    book_type: string;
    category: string;
    language: string;
    total_chapters: number;
    created_at: string;
  },
  completion: { completedChapters: number; assessedChapterNumbers: number[] },
  contentHash: string,
  version: string = 'v1.0'
): BookProvenanceBinding {
  const coverage = calculateCoverage(completion.completedChapters, book.total_chapters);
  return {
    bookId: book.id,
    bookTitle: book.title,
    bookType: book.book_type,
    bookVersion: version,
    bookContentHash: contentHash,
    totalChapters: book.total_chapters,
    completedChapters: completion.completedChapters,
    assessedChapters: completion.assessedChapterNumbers,
    coveragePercentage: coverage.percentage,
    category: book.category,
    language: book.language || 'en',
    bookCreatedAt: new Date(book.created_at),
    certifiedAt: new Date(),
  };
}

export const PROVENANCE_EXPLANATIONS = Object.freeze({
  cryptographicBinding: 'A SHA-256 digest binds the learning record to one canonical book state.',
  coverageRequirement: 'Certification requires verified learner coverage of at least 80% of the book.',
  hashVerification: 'The stored digest is compared with a freshly computed digest of the current book state.',
  immutability: 'If the book content changes, the stored and live digests no longer match.',
  unverifiable: 'If the live book state cannot be hashed, the record is shown as unverifiable rather than valid.',
});

export interface Contract12Compliance {
  compliant: boolean;
  checks: {
    hasBookId: boolean;
    hasContentHash: boolean;
    hasCoverage: boolean;
    coverageMeetsThreshold: boolean;
    hashIsValid: boolean | null;
    notRevoked: boolean;
  };
  violations: string[];
  validityLevel: 'valid' | 'invalid' | 'revoked' | 'unverifiable';
}

export function checkContract12Compliance(
  provenance: Partial<BookProvenanceBinding>,
  currentHash?: string,
  isRevoked: boolean = false
): Contract12Compliance {
  if (isRevoked) {
    return {
      compliant: false,
      checks: {
        hasBookId: !!provenance.bookId,
        hasContentHash: !!provenance.bookContentHash,
        hasCoverage: provenance.coveragePercentage !== undefined,
        coverageMeetsThreshold: (provenance.coveragePercentage ?? 0) >= 80,
        hashIsValid: null,
        notRevoked: false,
      },
      violations: ['Certificate has been revoked'],
      validityLevel: 'revoked',
    };
  }

  const violations: string[] = [];
  const hasBookId = !!provenance.bookId;
  const hasContentHash = !!provenance.bookContentHash;
  const hasCoverage = provenance.coveragePercentage !== undefined;
  const coverageMeetsThreshold = (provenance.coveragePercentage ?? 0) >= 80;

  if (!hasBookId) violations.push('Missing book ID');
  if (!hasContentHash) violations.push('Missing content hash');
  if (!hasCoverage) violations.push('Missing coverage percentage');
  if (!coverageMeetsThreshold) violations.push('Coverage below 80% threshold');

  if (!currentHash || !hasContentHash) {
    if (!currentHash) violations.push('Live content hash unavailable');
    return {
      compliant: false,
      checks: { hasBookId, hasContentHash, hasCoverage, coverageMeetsThreshold, hashIsValid: null, notRevoked: true },
      violations,
      validityLevel: 'unverifiable',
    };
  }

  const hashIsValid = provenance.bookContentHash === currentHash;
  if (!hashIsValid) violations.push('Content hash mismatch - book has changed');
  return {
    compliant: violations.length === 0,
    checks: { hasBookId, hasContentHash, hasCoverage, coverageMeetsThreshold, hashIsValid, notRevoked: true },
    violations,
    validityLevel: violations.length === 0 ? 'valid' : 'invalid',
  };
}

export default CONTRACT_12;
