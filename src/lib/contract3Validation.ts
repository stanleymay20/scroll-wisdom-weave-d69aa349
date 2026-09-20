/**
 * CONTRACT 3 — FINAL HARDENING
 *
 * This module enforces:
 * 1. Invalid generation candidates never render, save, or export
 * 2. Automatic remediation is limited to uncommitted AI generation candidates
 * 3. Export-time validation
 * 4. Cover generation bound to interior metadata
 * 5. Book type immutably locked
 *
 * PRECEDENCE: Contract 2 governs committed/user-owned content. Contract 3 MUST
 * NOT silently regenerate content that has been accepted, saved as user-owned,
 * manually edited, or explicitly locked. Callers must obtain Contract 2 approval
 * before applying any remediation to committed content.
 */

import {
  validateContentAgainstBookType,
  detectCrossTypeViolation,
  type BookType,
  type ContentValidationResult,
} from './bookTypeGovernance';

export const MAX_AUTO_REGENERATION_RETRIES = 3;
export const VALIDATION_BLOCK_THRESHOLD = 'critical';

export interface ContentGuardResult {
  canProceed: boolean;
  shouldAutoRegenerate: boolean;
  blockedReason?: string;
  violations: ContentValidationResult['violations'];
  retryCount?: number;
}

export interface ContentGuardOptions {
  title?: string;
  context?: 'render' | 'save' | 'export';
  currentRetryCount?: number;
  /** True only while validating a not-yet-committed AI generation candidate. */
  uncommittedGenerationCandidate?: boolean;
}

export function validateContentGuard(
  content: string,
  bookType: BookType,
  options?: ContentGuardOptions
): ContentGuardResult {
  const context = options?.context || 'render';
  const currentRetry = options?.currentRetryCount || 0;

  const validation = validateContentAgainstBookType(content, bookType, {
    checkTitle: !!options?.title,
    title: options?.title,
    checkWordCount: true,
  });
  const crossType = detectCrossTypeViolation(content, bookType);
  const criticalViolations = validation.violations.filter(v => v.severity === 'critical');
  const hasCritical = criticalViolations.length > 0 || crossType.hasCrossType;

  if (context === 'export') {
    if (validation.violations.length > 0 || crossType.hasCrossType) {
      return {
        canProceed: false,
        shouldAutoRegenerate: false,
        blockedReason: `Export blocked: ${validation.violations.map(v => v.message).join('; ')}`,
        violations: validation.violations,
      };
    }
  }

  if (hasCritical) {
    const canRetry = Boolean(options?.uncommittedGenerationCandidate) && currentRetry < MAX_AUTO_REGENERATION_RETRIES;
    return {
      canProceed: false,
      shouldAutoRegenerate: canRetry,
      blockedReason: crossType.hasCrossType
        ? crossType.message
        : criticalViolations.map(v => v.message).join('; '),
      violations: validation.violations,
      retryCount: currentRetry,
    };
  }

  return { canProceed: true, shouldAutoRegenerate: false, violations: validation.violations };
}

export interface ExportValidationResult {
  canExport: boolean;
  blockers: string[];
  warnings: string[];
  bookType: BookType;
}

export function validateExportReadiness(
  bookType: BookType,
  chapters: Array<{ content: string; title: string; isGenerated: boolean }>,
  coverImageUrl: string | null,
  totalChapters: number
): ExportValidationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!coverImageUrl) blockers.push('Cover image is required for export');

  const generatedCount = chapters.filter(c => c.isGenerated).length;
  if (generatedCount === 0) blockers.push('No chapters have been generated');
  else if (generatedCount < totalChapters) warnings.push(`Only ${generatedCount}/${totalChapters} chapters generated`);

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (!chapter.isGenerated || !chapter.content) continue;
    const validation = validateContentAgainstBookType(chapter.content, bookType, { checkWordCount: true });
    const crossType = detectCrossTypeViolation(chapter.content, bookType);
    if (crossType.hasCrossType) blockers.push(`Chapter ${i + 1}: Cross-type violation detected`);
    const criticalViolations = validation.violations.filter(v => v.severity === 'critical');
    if (criticalViolations.length > 0) blockers.push(`Chapter ${i + 1}: ${criticalViolations[0].message}`);
    const highViolations = validation.violations.filter(v => v.severity === 'high');
    if (highViolations.length > 0) warnings.push(`Chapter ${i + 1}: ${highViolations[0].message}`);
  }

  if (bookType === 'comic') {
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (!chapter.content) continue;
      const panelCount = (chapter.content.match(/\[PANEL\s*\d+\]/gi) || []).length;
      const imageCount = (chapter.content.match(/!\[.*?\]\(.*?\)/g) || []).length;
      if (panelCount > 0 && imageCount < panelCount) {
        blockers.push(`Chapter ${i + 1}: Comic panels missing images (${imageCount}/${panelCount})`);
      }
    }
  }

  return { canExport: blockers.length === 0, blockers, warnings, bookType };
}

export function canChangeBookType(
  hasGeneratedContent: boolean,
  currentType: BookType,
  newType: BookType
): { allowed: boolean; reason?: string } {
  if (currentType === newType) return { allowed: true };
  if (!hasGeneratedContent) return { allowed: true };
  return {
    allowed: false,
    reason: `Book type is locked to "${currentType}" once content is generated. Create a new book to use a different type.`,
  };
}

export interface CoverMetadataBinding {
  bookType: BookType;
  title: string;
  category: string;
  description?: string;
  comicStyleId?: string;
  characterSheet?: Record<string, string>;
  paletteHint?: string;
  lineWeightHint?: string;
  isAcademic?: boolean;
  citationStyle?: string;
}

export function extractCoverMetadata(
  book: {
    title: string;
    category: string;
    description?: string | null;
    book_type: string;
    comic_style_id?: string | null;
    character_sheet?: Record<string, string> | null;
    palette_hint?: string | null;
    line_weight_hint?: string | null;
  },
  chapters?: Array<{ content: string; academic_mode?: boolean; citation_style?: string }>
): CoverMetadataBinding {
  const bookType = book.book_type as BookType;
  const hasAcademicChapter = chapters?.some(c => c.academic_mode);
  const citationStyle = chapters?.find(c => c.citation_style)?.citation_style;
  return {
    bookType,
    title: book.title,
    category: book.category,
    description: book.description || undefined,
    comicStyleId: book.comic_style_id || undefined,
    characterSheet: book.character_sheet || undefined,
    paletteHint: book.palette_hint || undefined,
    lineWeightHint: book.line_weight_hint || undefined,
    isAcademic: hasAcademicChapter,
    citationStyle,
  };
}

interface RegenerationTracker {
  chapterId: string;
  retryCount: number;
  lastViolations: string[];
  timestamp: number;
}

const regenerationTrackers = new Map<string, RegenerationTracker>();

export function getRegenerationState(chapterId: string): RegenerationTracker | undefined {
  return regenerationTrackers.get(chapterId);
}

export function incrementRegenerationRetry(
  chapterId: string,
  violations: string[]
): { canRetry: boolean; retryCount: number } {
  const existing = regenerationTrackers.get(chapterId);
  const retryCount = (existing?.retryCount || 0) + 1;
  regenerationTrackers.set(chapterId, { chapterId, retryCount, lastViolations: violations, timestamp: Date.now() });
  return { canRetry: retryCount < MAX_AUTO_REGENERATION_RETRIES, retryCount };
}

export function clearRegenerationState(chapterId: string): void {
  regenerationTrackers.delete(chapterId);
}

export { type BookType, type ContentValidationResult } from './bookTypeGovernance';
