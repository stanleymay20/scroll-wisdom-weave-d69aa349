/**
 * CONTRACT 2 — OUTPUT DETERMINISM & USER INTENT
 *
 * This module enforces the hard contract for user content protection:
 * - User text is authoritative
 * - No silent regeneration of committed/user-owned content
 * - Explicit edit instructions required
 * - Partial editing only for user-owned content
 * - Book type does not override user text
 * - Change preview required before committed content is replaced
 *
 * PRECEDENCE RULE:
 * Contract 2 overrides Contract 3 auto-remediation once content has been accepted,
 * saved as user-owned, manually edited, or explicitly locked by the user. Contract 3
 * may retry generation only before a candidate has become committed/user-owned.
 */

import { createLogger } from './logger';

const logger = createLogger('ContentDeterminism');

export interface ContentOwnershipState {
  isUserAuthored: boolean;
  isAIGenerated: boolean;
  isHybrid: boolean;
  userLocked: boolean;
  differencePercentage: number;
  lastAIContent: string | null;
  lastSavedContent: string | null;
  lockedAt: string | null;
}

export interface EditScope {
  type: 'full' | 'section' | 'formatting' | 'grammar' | 'tone' | 'structure';
  description: string;
  targetText?: string;
}

export interface RegenerationGuard {
  allowed: boolean;
  reason?: string;
  requiresScope: boolean;
  requiresPreview: boolean;
}

export interface ContentDiff {
  original: string;
  modified: string;
  additions: string[];
  removals: string[];
  changeCount: number;
  isSignificant: boolean;
}

export const BLOCKED_REGENERATION_TRIGGERS = [
  'page_reload',
  'save_action',
  'continue_button',
  'chapter_navigation',
  'export_action',
  'language_change',
  'book_type_change',
  'auto_save',
  'blur_event',
  'timer_event',
] as const;

export type BlockedTrigger = typeof BLOCKED_REGENERATION_TRIGGERS[number];

export function isRegenerationBlocked(trigger: string): boolean {
  const isBlocked = BLOCKED_REGENERATION_TRIGGERS.includes(trigger as BlockedTrigger);
  if (isBlocked) logger.warn('Blocked regeneration attempt', { trigger });
  return isBlocked;
}

export const VALID_EDIT_SCOPES: EditScope[] = [
  { type: 'section', description: 'Rewrite section X to do Y' },
  { type: 'formatting', description: 'Only edit formatting' },
  { type: 'grammar', description: 'Fix grammar only' },
  { type: 'tone', description: 'Change tone to academic/casual/etc.' },
  { type: 'structure', description: 'Fix structure but preserve wording' },
  { type: 'full', description: 'Full regeneration (only if unlocked)' },
];

export function validateEditScope(scope: EditScope | null | undefined): { valid: boolean; error?: string } {
  if (!scope) return { valid: false, error: 'Edit scope is required. Please specify what you want to change.' };
  if (!scope.description || scope.description.trim().length < 5) {
    return { valid: false, error: 'Please provide a clear description of what you want to change (minimum 5 characters).' };
  }
  if (scope.type === 'section' && !scope.targetText) {
    return { valid: false, error: 'For section edits, please specify or paste the text you want to change.' };
  }
  return { valid: true };
}

export function checkRegenerationGuard(
  ownership: ContentOwnershipState,
  scope: EditScope | null | undefined,
  trigger: string
): RegenerationGuard {
  if (isRegenerationBlocked(trigger)) {
    return {
      allowed: false,
      reason: `Regeneration is not allowed on ${trigger.replace('_', ' ')}. No changes have been made.`,
      requiresScope: false,
      requiresPreview: false,
    };
  }

  if (ownership.userLocked || ownership.isUserAuthored || ownership.isHybrid) {
    if (!scope) {
      return {
        allowed: false,
        reason: 'This chapter contains committed or user-owned content. Please specify exactly what you want to change.',
        requiresScope: true,
        requiresPreview: true,
      };
    }
    if (scope.type === 'full') {
      return {
        allowed: false,
        reason: 'Full regeneration is blocked for committed or user-owned content. Only targeted edits are allowed.',
        requiresScope: true,
        requiresPreview: true,
      };
    }
    const scopeValidation = validateEditScope(scope);
    if (!scopeValidation.valid) {
      return { allowed: false, reason: scopeValidation.error, requiresScope: true, requiresPreview: true };
    }
    return { allowed: true, requiresScope: true, requiresPreview: true };
  }

  if (!scope) {
    return {
      allowed: false,
      reason: 'Please specify what changes you want to make before regenerating.',
      requiresScope: true,
      requiresPreview: true,
    };
  }

  const scopeValidation = validateEditScope(scope);
  if (!scopeValidation.valid) {
    return { allowed: false, reason: scopeValidation.error, requiresScope: true, requiresPreview: true };
  }
  return { allowed: true, requiresScope: true, requiresPreview: true };
}

/**
 * Contract 3 may only silently retry an uncommitted AI generation candidate.
 * This helper is deliberately conservative and is the executable precedence
 * boundary between Contract 2 and Contract 3.
 */
export function mayAutoRemediateCandidate(ownership: ContentOwnershipState): boolean {
  return ownership.isAIGenerated && !ownership.userLocked && !ownership.isUserAuthored && !ownership.isHybrid;
}

export function calculateContentDifference(original: string, modified: string): number {
  if (!original && !modified) return 0;
  if (!original || !modified) return 100;
  const normalizeWords = (text: string) => text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const originalWords = normalizeWords(original);
  const modifiedWords = normalizeWords(modified);
  if (originalWords.length === 0 && modifiedWords.length === 0) return 0;
  if (originalWords.length === 0 || modifiedWords.length === 0) return 100;
  const originalSet = new Set(originalWords);
  const modifiedSet = new Set(modifiedWords);
  let matchingWords = 0;
  for (const word of modifiedSet) if (originalSet.has(word)) matchingWords++;
  const totalUniqueWords = new Set([...originalWords, ...modifiedWords]).size;
  return Math.round(100 - (matchingWords / totalUniqueWords) * 100);
}

export function generateContentDiff(original: string, modified: string): ContentDiff {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const additions: string[] = [];
  const removals: string[] = [];
  const originalSet = new Set(originalLines);
  const modifiedSet = new Set(modifiedLines);
  for (const line of modifiedLines) if (!originalSet.has(line) && line.trim()) additions.push(line);
  for (const line of originalLines) if (!modifiedSet.has(line) && line.trim()) removals.push(line);
  const changeCount = additions.length + removals.length;
  return {
    original,
    modified,
    additions,
    removals,
    changeCount,
    isSignificant: changeCount > 0 || calculateContentDifference(original, modified) > 10,
  };
}

export function detectContentOwnership(
  currentContent: string,
  lastAIContent: string | null,
  userLocked: boolean = false
): ContentOwnershipState {
  const differencePercentage = lastAIContent ? calculateContentDifference(lastAIContent, currentContent) : 100;
  const isUserAuthored = differencePercentage >= 30 || userLocked;
  const isAIGenerated = differencePercentage < 10;
  const isHybrid = !isUserAuthored && !isAIGenerated;
  return {
    isUserAuthored,
    isAIGenerated,
    isHybrid,
    userLocked: userLocked || isUserAuthored,
    differencePercentage,
    lastAIContent,
    lastSavedContent: currentContent,
    lockedAt: userLocked ? new Date().toISOString() : null,
  };
}

export function verifyContentIntegrity(
  before: string,
  after: string,
  allowedChanges: boolean = false
): { intact: boolean; error?: string } {
  if (before === after) return { intact: true };
  if (!allowedChanges) {
    const diff = generateContentDiff(before, after);
    logger.error('Content integrity violation detected', {
      changeCount: diff.changeCount,
      additions: diff.additions.length,
      removals: diff.removals.length,
    });
    return { intact: false, error: `Content was unexpectedly modified. ${diff.changeCount} changes detected.` };
  }
  return { intact: true };
}

export function logContractViolation(rule: string, context: Record<string, unknown>): void {
  logger.error('CONTRACT 2 VIOLATION', { rule, ...context });
  console.error(`[CONTRACT 2 VIOLATION] ${rule}`, context);
}

export interface PreviewData {
  originalPreview: string;
  modifiedPreview: string;
  additionCount: number;
  removalCount: number;
  affectedLines: number;
}

export function generateChangePreview(original: string, modified: string, maxLines: number = 20): PreviewData {
  const diff = generateContentDiff(original, modified);
  return {
    originalPreview: original.split('\n').slice(0, maxLines).join('\n'),
    modifiedPreview: modified.split('\n').slice(0, maxLines).join('\n'),
    additionCount: diff.additions.length,
    removalCount: diff.removals.length,
    affectedLines: diff.changeCount,
  };
}

export const ContentDeterminism = {
  isRegenerationBlocked,
  validateEditScope,
  checkRegenerationGuard,
  mayAutoRemediateCandidate,
  calculateContentDifference,
  generateContentDiff,
  detectContentOwnership,
  verifyContentIntegrity,
  logContractViolation,
  generateChangePreview,
  BLOCKED_REGENERATION_TRIGGERS,
  VALID_EDIT_SCOPES,
};

export default ContentDeterminism;
