/**
 * CONTRACT 2 — OUTPUT DETERMINISM & USER INTENT
 * 
 * This module enforces the hard contract for user content protection:
 * - User text is authoritative
 * - No silent regeneration
 * - Explicit edit instructions required
 * - Partial editing only
 * - Book type does not override user text
 * - Change preview required
 */

import { createLogger } from './logger';

const logger = createLogger('ContentDeterminism');

// ================== CORE TYPES ==================

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

// ================== BLOCKED TRIGGERS ==================

/**
 * These actions must NEVER trigger regeneration
 */
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

/**
 * Check if a trigger should be blocked from causing regeneration
 */
export function isRegenerationBlocked(trigger: string): boolean {
  const isBlocked = BLOCKED_REGENERATION_TRIGGERS.includes(trigger as BlockedTrigger);
  if (isBlocked) {
    logger.warn('Blocked regeneration attempt', { trigger });
  }
  return isBlocked;
}

// ================== EDIT SCOPE VALIDATION ==================

/**
 * Valid edit scopes that must be specified before regeneration
 */
export const VALID_EDIT_SCOPES: EditScope[] = [
  { type: 'section', description: 'Rewrite section X to do Y' },
  { type: 'formatting', description: 'Only edit formatting' },
  { type: 'grammar', description: 'Fix grammar only' },
  { type: 'tone', description: 'Change tone to academic/casual/etc.' },
  { type: 'structure', description: 'Fix structure but preserve wording' },
  { type: 'full', description: 'Full regeneration (only if unlocked)' },
];

/**
 * Validate that an edit scope is properly defined
 */
export function validateEditScope(scope: EditScope | null | undefined): { valid: boolean; error?: string } {
  if (!scope) {
    return { 
      valid: false, 
      error: 'Edit scope is required. Please specify what you want to change.' 
    };
  }

  if (!scope.description || scope.description.trim().length < 5) {
    return { 
      valid: false, 
      error: 'Please provide a clear description of what you want to change (minimum 5 characters).' 
    };
  }

  if (scope.type === 'section' && !scope.targetText) {
    return { 
      valid: false, 
      error: 'For section edits, please specify or paste the text you want to change.' 
    };
  }

  return { valid: true };
}

// ================== REGENERATION GUARD ==================

/**
 * Determine if regeneration should be allowed
 * This is the core enforcement function for Contract 2
 */
export function checkRegenerationGuard(
  ownership: ContentOwnershipState,
  scope: EditScope | null | undefined,
  trigger: string
): RegenerationGuard {
  // Rule 1: Block all silent triggers
  if (isRegenerationBlocked(trigger)) {
    return {
      allowed: false,
      reason: `Regeneration is not allowed on ${trigger.replace('_', ' ')}. No changes have been made.`,
      requiresScope: false,
      requiresPreview: false,
    };
  }

  // Rule 2: If user-locked, only surgical edits allowed
  if (ownership.userLocked) {
    if (!scope) {
      return {
        allowed: false,
        reason: 'This chapter contains your original content. Please specify exactly what you want to change.',
        requiresScope: true,
        requiresPreview: true,
      };
    }

    if (scope.type === 'full') {
      return {
        allowed: false,
        reason: 'Full regeneration is blocked for user-authored content. Only targeted edits are allowed.',
        requiresScope: true,
        requiresPreview: true,
      };
    }

    const scopeValidation = validateEditScope(scope);
    if (!scopeValidation.valid) {
      return {
        allowed: false,
        reason: scopeValidation.error,
        requiresScope: true,
        requiresPreview: true,
      };
    }

    return {
      allowed: true,
      requiresScope: true,
      requiresPreview: true,
    };
  }

  // Rule 3: Even for AI content, require explicit scope
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
    return {
      allowed: false,
      reason: scopeValidation.error,
      requiresScope: true,
      requiresPreview: true,
    };
  }

  return {
    allowed: true,
    requiresScope: true,
    requiresPreview: true,
  };
}

// ================== CONTENT COMPARISON ==================

/**
 * Calculate word-level difference between two texts
 */
export function calculateContentDifference(original: string, modified: string): number {
  if (!original && !modified) return 0;
  if (!original || !modified) return 100;

  const normalizeWords = (text: string) =>
    text.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const originalWords = normalizeWords(original);
  const modifiedWords = normalizeWords(modified);

  if (originalWords.length === 0 && modifiedWords.length === 0) return 0;
  if (originalWords.length === 0 || modifiedWords.length === 0) return 100;

  const originalSet = new Set(originalWords);
  const modifiedSet = new Set(modifiedWords);

  let matchingWords = 0;
  for (const word of modifiedSet) {
    if (originalSet.has(word)) {
      matchingWords++;
    }
  }

  const totalUniqueWords = new Set([...originalWords, ...modifiedWords]).size;
  const similarity = (matchingWords / totalUniqueWords) * 100;

  return Math.round(100 - similarity);
}

/**
 * Generate a diff between two content strings
 */
export function generateContentDiff(original: string, modified: string): ContentDiff {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  const additions: string[] = [];
  const removals: string[] = [];

  // Simple line-by-line diff
  const originalSet = new Set(originalLines);
  const modifiedSet = new Set(modifiedLines);

  for (const line of modifiedLines) {
    if (!originalSet.has(line) && line.trim()) {
      additions.push(line);
    }
  }

  for (const line of originalLines) {
    if (!modifiedSet.has(line) && line.trim()) {
      removals.push(line);
    }
  }

  const changeCount = additions.length + removals.length;
  const isSignificant = changeCount > 0 || calculateContentDifference(original, modified) > 10;

  return {
    original,
    modified,
    additions,
    removals,
    changeCount,
    isSignificant,
  };
}

// ================== CONTENT OWNERSHIP DETECTION ==================

/**
 * Detect content ownership based on comparison with AI content
 */
export function detectContentOwnership(
  currentContent: string,
  lastAIContent: string | null,
  userLocked: boolean = false
): ContentOwnershipState {
  const differencePercentage = lastAIContent
    ? calculateContentDifference(lastAIContent, currentContent)
    : 100;

  // If >= 30% different from AI output OR was user locked, it's user-authored
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

// ================== INVARIANT CHECKS ==================

/**
 * Verify that content has not changed unexpectedly
 * Use this after save, navigation, export to ensure determinism
 */
export function verifyContentIntegrity(
  before: string,
  after: string,
  allowedChanges: boolean = false
): { intact: boolean; error?: string } {
  if (before === after) {
    return { intact: true };
  }

  if (!allowedChanges) {
    const diff = generateContentDiff(before, after);
    logger.error('Content integrity violation detected', {
      changeCount: diff.changeCount,
      additions: diff.additions.length,
      removals: diff.removals.length,
    });
    return {
      intact: false,
      error: `Content was unexpectedly modified. ${diff.changeCount} changes detected.`,
    };
  }

  return { intact: true };
}

/**
 * Log a contract violation for debugging
 */
export function logContractViolation(
  rule: string,
  context: Record<string, unknown>
): void {
  logger.error('CONTRACT 2 VIOLATION', { rule, ...context });
  console.error(`[CONTRACT 2 VIOLATION] ${rule}`, context);
}

// ================== PREVIEW GENERATION ==================

export interface PreviewData {
  originalPreview: string;
  modifiedPreview: string;
  additionCount: number;
  removalCount: number;
  affectedLines: number;
}

/**
 * Generate a preview of changes for user confirmation
 */
export function generateChangePreview(
  original: string,
  modified: string,
  maxLines: number = 20
): PreviewData {
  const diff = generateContentDiff(original, modified);

  const originalLines = original.split('\n').slice(0, maxLines);
  const modifiedLines = modified.split('\n').slice(0, maxLines);

  return {
    originalPreview: originalLines.join('\n'),
    modifiedPreview: modifiedLines.join('\n'),
    additionCount: diff.additions.length,
    removalCount: diff.removals.length,
    affectedLines: diff.changeCount,
  };
}

// ================== EXPORTS ==================

export const ContentDeterminism = {
  isRegenerationBlocked,
  validateEditScope,
  checkRegenerationGuard,
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
