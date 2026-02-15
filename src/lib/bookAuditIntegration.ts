/**
 * BOOK AUDIT INTEGRATION
 * 
 * Wires the auditBook() function into the publishing flow.
 * Books that fail audit are blocked from publishing.
 * 
 * Includes Contract 9 (ICG-1.0) illustration auditing.
 */

import { auditBook, BookAuditResult } from './pedagogicalSchema';
import { 
  auditIllustrations, 
  getIllustrationRequirement,
  IllustrationAuditResult,
  IllustrationMeta,
  type BookType as ICGBookType
} from './illustratedContentContract';

// Book types that are exempt from strict pedagogical schema
const EXEMPT_BOOK_TYPES = ['children', 'comic', 'novel', 'fiction', 'bestseller', 'poetry'];

// Source types that are exempt from strict pedagogical schema
// (uploaded/pasted/URL documents have their own structure)
const EXEMPT_SOURCE_TYPES = ['uploaded', 'pasted', 'url'];

// Book types that require illustration audit
const ILLUSTRATED_BOOK_TYPES = ['illustrated', 'comic', 'children'];

export interface PublishingGateResult {
  canPublish: boolean;
  auditResult: BookAuditResult | null;
  illustrationAuditResult: IllustrationAuditResult | null;
  blockerReasons: string[];
  warnings: string[];
  requiresAudit: boolean;
  requiresIllustrationAudit: boolean;
}

/**
 * Check if a book type requires pedagogical audit
 */
export function requiresPedagogicalAudit(bookType: string | null, sourceType?: string | null): boolean {
  if (!bookType) return true; // Default to requiring audit
  if (sourceType && EXEMPT_SOURCE_TYPES.includes(sourceType.toLowerCase())) return false;
  return !EXEMPT_BOOK_TYPES.includes(bookType.toLowerCase());
}

/**
 * Check if a book type requires illustration audit
 */
export function requiresIllustrationAudit(bookType: string | null): boolean {
  if (!bookType) return false;
  return ILLUSTRATED_BOOK_TYPES.includes(bookType.toLowerCase());
}

/**
 * Run publishing gate check for a book
 */
export function checkPublishingGate(
  bookId: string,
  bookType: string | null,
  chapters: { 
    id: string; 
    content: string; 
    is_generated?: boolean | null;
    illustrations?: IllustrationMeta[];
  }[],
  category?: string,
  sourceType?: string | null
): PublishingGateResult {
  const blockerReasons: string[] = [];
  const warnings: string[] = [];

  // Check if all chapters are generated
  const ungeneratedChapters = chapters.filter(ch => !ch.is_generated);
  if (ungeneratedChapters.length > 0) {
    blockerReasons.push(`${ungeneratedChapters.length} chapter(s) not yet generated`);
  }

  // Check if book type requires pedagogical audit
  const requiresAudit = requiresPedagogicalAudit(bookType, sourceType);
  const needsIllustrationAudit = requiresIllustrationAudit(bookType);

  // Run illustration audit if required (Contract 9 - ICG-1.0)
  let illustrationAuditResult: IllustrationAuditResult | null = null;
  if (needsIllustrationAudit && category) {
    const illustrationInput = {
      bookType: (bookType || 'text') as ICGBookType,
      category,
      chapters: chapters.map(ch => ({
        id: ch.id,
        content: ch.content || '',
        illustrations: ch.illustrations || [],
      })),
    };

    illustrationAuditResult = auditIllustrations(illustrationInput);

    // Add illustration blockers
    if (!illustrationAuditResult.passed) {
      blockerReasons.push(...illustrationAuditResult.blockerReasons);
    }
    warnings.push(...illustrationAuditResult.warnings);
  }

  if (!requiresAudit) {
    // Exempt book types can publish without full pedagogical audit
    return {
      canPublish: blockerReasons.length === 0,
      auditResult: null,
      illustrationAuditResult,
      blockerReasons,
      warnings: ['This book type is exempt from pedagogical schema requirements', ...warnings],
      requiresAudit: false,
      requiresIllustrationAudit: needsIllustrationAudit,
    };
  }

  // Run full audit for academic/professional books
  const chaptersWithContent = chapters
    .filter(ch => ch.content && ch.is_generated)
    .map(ch => ({ id: ch.id, content: ch.content! }));

  if (chaptersWithContent.length === 0) {
    blockerReasons.push('No generated chapters available for audit');
    return {
      canPublish: false,
      auditResult: null,
      illustrationAuditResult,
      blockerReasons,
      warnings,
      requiresAudit: true,
      requiresIllustrationAudit: needsIllustrationAudit,
    };
  }

  const auditResult = auditBook(bookId, chaptersWithContent);

  // Add audit blockers
  blockerReasons.push(...auditResult.blockerReasons);
  warnings.push(...auditResult.warnings);

  return {
    canPublish: !auditResult.publishingBlocked && blockerReasons.length === 0,
    auditResult,
    illustrationAuditResult,
    blockerReasons,
    warnings,
    requiresAudit: true,
    requiresIllustrationAudit: needsIllustrationAudit,
  };
}

/**
 * Format audit result for user display
 */
export function formatAuditReport(result: PublishingGateResult): string {
  const lines: string[] = [];

  if (result.canPublish) {
    lines.push('✅ Book passed publishing gate\n');
  } else {
    lines.push('❌ Book blocked from publishing\n');
  }

  if (result.blockerReasons.length > 0) {
    lines.push('**Blockers (must fix):**');
    result.blockerReasons.forEach(reason => {
      lines.push(`- ${reason}`);
    });
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('**Warnings:**');
    result.warnings.forEach(warning => {
      lines.push(`- ${warning}`);
    });
    lines.push('');
  }

  if (result.auditResult) {
    const audit = result.auditResult;
    lines.push('**Audit Scores:**');
    lines.push(`- Overall: ${audit.score}/100`);
    lines.push(`- Code Quality: ${audit.codeQuality.score}/100`);
    lines.push(`- Table Quality: ${audit.tableQuality.score}/100`);
    lines.push(`- Quiz Rigor: ${audit.quizRigor.score}/100`);
  }

  // Contract 9 - Illustration Audit
  if (result.illustrationAuditResult) {
    const illAudit = result.illustrationAuditResult;
    lines.push('');
    lines.push('**Illustration Audit (ICG-1.0):**');
    lines.push(`- Score: ${illAudit.score}/100`);
    lines.push(`- Passed: ${illAudit.passed ? '✅' : '❌'}`);
    
    if (illAudit.missingRequired.length > 0) {
      lines.push(`- Missing Required: ${illAudit.missingRequired.length}`);
    }
    if (illAudit.missingCaptions.length > 0) {
      lines.push(`- Missing Captions: ${illAudit.missingCaptions.length}`);
    }
    if (illAudit.accessibilityIssues.length > 0) {
      lines.push(`- Accessibility Issues: ${illAudit.accessibilityIssues.length}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get publishing status badge info
 */
export function getPublishingStatusBadge(result: PublishingGateResult): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
  icon: 'check' | 'alert' | 'x' | 'shield';
} {
  if (result.canPublish) {
    return {
      variant: 'default',
      label: 'Ready to Publish',
      icon: 'check',
    };
  }

  if (result.blockerReasons.length > 0) {
    return {
      variant: 'destructive',
      label: 'Publishing Blocked',
      icon: 'x',
    };
  }

  return {
    variant: 'secondary',
    label: 'Audit Required',
    icon: 'alert',
  };
}
