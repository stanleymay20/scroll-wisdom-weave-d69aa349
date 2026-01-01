/**
 * ScrollLibrary System Diagnostics & Error Classification Engine
 * Provides runtime diagnostics, error classification, and self-healing capabilities
 */

import { createLogger } from './logger';

const logger = createLogger('SystemDiagnostics');

// ================== ERROR CLASSIFICATION ==================

export type ErrorCategory = 
  | 'UI'
  | 'Generation'
  | 'ContractViolation'
  | 'Storage'
  | 'Export'
  | 'Auth'
  | 'Quota'
  | 'UserIntentConflict'
  | 'NetworkError'
  | 'ValidationError';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ClassifiedError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  recoverable: boolean;
  suggestedAction?: string;
  originalError?: Error;
}

export interface DiagnosticResult {
  passed: boolean;
  category: ErrorCategory;
  message: string;
  details?: Record<string, unknown>;
  autoFixed?: boolean;
}

// ================== ERROR CLASSIFICATION ENGINE ==================

export function classifyError(error: Error | string, context?: Record<string, unknown>): ClassifiedError {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();
  
  let category: ErrorCategory = 'UI';
  let severity: ErrorSeverity = 'medium';
  let recoverable = true;
  let suggestedAction: string | undefined;

  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('timeout')) {
    category = 'NetworkError';
    severity = 'medium';
    suggestedAction = 'Check your internet connection and try again';
  }
  // Auth errors
  else if (lowerMessage.includes('auth') || lowerMessage.includes('unauthorized') || lowerMessage.includes('jwt') || lowerMessage.includes('session')) {
    category = 'Auth';
    severity = 'high';
    suggestedAction = 'Please sign in again';
  }
  // Quota errors
  else if (lowerMessage.includes('quota') || lowerMessage.includes('limit') || lowerMessage.includes('exceeded')) {
    category = 'Quota';
    severity = 'medium';
    suggestedAction = 'Upgrade your plan or wait for quota reset';
  }
  // Generation errors
  else if (lowerMessage.includes('generat') || lowerMessage.includes('ai') || lowerMessage.includes('chapter') || lowerMessage.includes('book')) {
    category = 'Generation';
    severity = 'high';
    suggestedAction = 'Try regenerating the content';
  }
  // Storage errors
  else if (lowerMessage.includes('storage') || lowerMessage.includes('upload') || lowerMessage.includes('bucket') || lowerMessage.includes('file')) {
    category = 'Storage';
    severity = 'medium';
    suggestedAction = 'Try uploading again';
  }
  // Export errors
  else if (lowerMessage.includes('export') || lowerMessage.includes('download') || lowerMessage.includes('pdf') || lowerMessage.includes('epub')) {
    category = 'Export';
    severity = 'high';
    suggestedAction = 'Ensure all content is generated before exporting';
  }
  // Contract violations
  else if (lowerMessage.includes('contract') || lowerMessage.includes('invalid') || lowerMessage.includes('missing panel') || lowerMessage.includes('missing image')) {
    category = 'ContractViolation';
    severity = 'critical';
    recoverable = false;
    suggestedAction = 'Content does not meet requirements. Please regenerate.';
  }
  // Validation errors
  else if (lowerMessage.includes('validat') || lowerMessage.includes('required') || lowerMessage.includes('format')) {
    category = 'ValidationError';
    severity = 'low';
    suggestedAction = 'Please check your input and try again';
  }

  return {
    id: generateErrorId(),
    category,
    severity,
    message: errorMessage,
    context,
    timestamp: new Date().toISOString(),
    recoverable,
    suggestedAction,
    originalError: typeof error === 'object' ? error : undefined,
  };
}

function generateErrorId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

// ================== COMIC VALIDATION ==================

export interface ComicValidationResult {
  isValid: boolean;
  panelCount: number;
  imageCount: number;
  missingImages: number[];
  errors: string[];
  canExport: boolean;
}

export function validateComicContent(content: string): ComicValidationResult {
  const errors: string[] = [];
  const missingImages: number[] = [];

  // Count panels - look for various panel markers
  const panelPatterns = [
    /\[PANEL\s*(\d+)\]/gi,
    /Panel\s+(\d+)/gi,
    /!\[Panel\s*(\d+)/gi,
  ];
  
  const foundPanels = new Set<number>();
  for (const pattern of panelPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      foundPanels.add(parseInt(match[1]));
    }
  }
  
  const panelCount = foundPanels.size || content.split(/\[PANEL|\bPanel\s+\d+/i).length - 1;

  // Count images - look for markdown image syntax with actual URLs
  const imageMatches = content.match(/!\[[^\]]*\]\((?:https?:\/\/[^)]+|data:image[^)]+)\)/g) || [];
  const imageCount = imageMatches.length;

  // Check for panels without images
  if (panelCount > 0 && imageCount < panelCount) {
    for (let i = 1; i <= panelCount; i++) {
      // Check if this panel has an associated image
      const panelImageRegex = new RegExp(`!\\[Panel\\s*${i}[^\\]]*\\]\\([^)]+\\)`, 'i');
      if (!panelImageRegex.test(content)) {
        missingImages.push(i);
      }
    }
    errors.push(`Missing images for ${missingImages.length} panel(s): ${missingImages.join(', ')}`);
  }

  // Text-only comics are invalid
  if (panelCount > 0 && imageCount === 0) {
    errors.push('Text-only comics are invalid. All panels must have images.');
  }

  const isValid = errors.length === 0;
  const canExport = isValid && panelCount > 0 && imageCount === panelCount;

  return {
    isValid,
    panelCount,
    imageCount,
    missingImages,
    errors,
    canExport,
  };
}

// ================== CONTENT OWNERSHIP DETECTION ==================

export interface ContentOwnership {
  isUserAuthored: boolean;
  isAIGenerated: boolean;
  isHybrid: boolean;
  userLocked: boolean;
  differencePercentage: number;
}

/**
 * Compare two content strings and determine if they're significantly different
 * Returns percentage of difference (0-100)
 */
export function calculateContentDifference(original: string, modified: string): number {
  if (!original || !modified) return 100;
  
  const originalWords = original.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const modifiedWords = modified.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  if (originalWords.length === 0) return 100;
  
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

export function detectContentOwnership(
  currentContent: string,
  previousAIContent: string | null,
  wasUserEdited: boolean = false
): ContentOwnership {
  const differencePercentage = previousAIContent 
    ? calculateContentDifference(previousAIContent, currentContent)
    : 100;

  // If content is >= 70% different from AI output OR was user edited, it's user-authored
  const isUserAuthored = differencePercentage >= 70 || wasUserEdited;
  const isAIGenerated = !previousAIContent || differencePercentage < 30;
  const isHybrid = !isUserAuthored && !isAIGenerated;
  
  // User lock should be true if significantly modified
  const userLocked = isUserAuthored;

  return {
    isUserAuthored,
    isAIGenerated,
    isHybrid,
    userLocked,
    differencePercentage,
  };
}

// ================== EXPORT VALIDATION ==================

export interface ExportValidation {
  canExport: boolean;
  blockers: string[];
  warnings: string[];
  bookType: string;
  hasAllChapters: boolean;
  hasCover: boolean;
  comicValidation?: ComicValidationResult;
}

export function validateExportReadiness(
  bookType: string,
  chapters: Array<{ content: string | null; is_generated: boolean }>,
  hasCover: boolean,
  totalChapters: number
): ExportValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check cover
  if (!hasCover) {
    blockers.push('Cover image is required for export');
  }

  // Check chapters
  const generatedChapters = chapters.filter(c => c.is_generated && c.content);
  const hasAllChapters = generatedChapters.length === totalChapters;

  if (generatedChapters.length === 0) {
    blockers.push('No generated chapters found');
  } else if (!hasAllChapters) {
    warnings.push(`Only ${generatedChapters.length} of ${totalChapters} chapters are generated`);
  }

  // Comic-specific validation
  let comicValidation: ComicValidationResult | undefined;
  if (bookType === 'comic') {
    // Validate all chapters for comic content
    const allContent = generatedChapters.map(c => c.content || '').join('\n\n');
    comicValidation = validateComicContent(allContent);
    
    if (!comicValidation.canExport) {
      blockers.push(...comicValidation.errors);
    }
  }

  return {
    canExport: blockers.length === 0,
    blockers,
    warnings,
    bookType,
    hasAllChapters,
    hasCover,
    comicValidation,
  };
}

// ================== FORMAT SANITIZATION ==================

/**
 * Sanitize markdown content for export
 * Converts markdown symbols to semantic markers that export functions can render
 */
export function sanitizeForExport(content: string): string {
  // This marks content for proper rendering rather than stripping
  // The actual rendering happens in the export function
  let sanitized = content;

  // Convert markdown bold to semantic markers
  sanitized = sanitized.replace(/\*\*([^*]+)\*\*/g, '{{BOLD}}$1{{/BOLD}}');
  
  // Convert markdown italic to semantic markers
  sanitized = sanitized.replace(/\*([^*]+)\*/g, '{{ITALIC}}$1{{/ITALIC}}');
  sanitized = sanitized.replace(/_([^_]+)_/g, '{{ITALIC}}$1{{/ITALIC}}');
  
  // Convert markdown underline (if using __)
  sanitized = sanitized.replace(/__([^_]+)__/g, '{{UNDERLINE}}$1{{/UNDERLINE}}');

  // Clean up any double-processed markers
  sanitized = sanitized.replace(/\{\{BOLD\}\}\{\{BOLD\}\}/g, '{{BOLD}}');
  sanitized = sanitized.replace(/\{\{\/BOLD\}\}\{\{\/BOLD\}\}/g, '{{/BOLD}}');

  return sanitized;
}

/**
 * Check if content has markdown artifacts that shouldn't be visible
 */
export function hasMarkdownArtifacts(content: string): boolean {
  // Check for unrendered markdown symbols
  const artifacts = [
    /\*\*[^*]+\*\*/,  // Bold
    /\*[^*]+\*/,      // Italic
    /__[^_]+__/,      // Underline
  ];

  return artifacts.some(pattern => pattern.test(content));
}

// ================== RUNTIME DIAGNOSTICS ==================

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  diagnostics: DiagnosticResult[];
  timestamp: string;
}

export function runDiagnostics(context: {
  isMobile: boolean;
  isDesktop: boolean;
  currentRoute: string;
  hasUser: boolean;
  hasSession: boolean;
}): SystemHealth {
  const diagnostics: DiagnosticResult[] = [];

  // Check mobile/desktop layout consistency
  if (context.isMobile === context.isDesktop) {
    diagnostics.push({
      passed: false,
      category: 'UI',
      message: 'Layout mode conflict detected',
      details: { isMobile: context.isMobile, isDesktop: context.isDesktop },
    });
  } else {
    diagnostics.push({
      passed: true,
      category: 'UI',
      message: 'Layout mode is consistent',
    });
  }

  // Check auth state consistency
  if (context.hasUser !== context.hasSession) {
    diagnostics.push({
      passed: false,
      category: 'Auth',
      message: 'Auth state mismatch between user and session',
      details: { hasUser: context.hasUser, hasSession: context.hasSession },
    });
  } else {
    diagnostics.push({
      passed: true,
      category: 'Auth',
      message: 'Auth state is consistent',
    });
  }

  // Determine overall health
  const failedCount = diagnostics.filter(d => !d.passed).length;
  let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
  
  if (failedCount > 0) {
    const hasCritical = diagnostics.some(d => !d.passed && d.category === 'Auth');
    overall = hasCritical ? 'critical' : 'degraded';
  }

  const result = {
    overall,
    diagnostics,
    timestamp: new Date().toISOString(),
  };

  // Log diagnostics
  if (overall !== 'healthy') {
    logger.warn('System health check completed with issues', { 
      overall, 
      failedChecks: failedCount 
    });
  }

  return result;
}

// ================== REGENERATION INTENT ==================

export type RegenerationIntent =
  | 'improve_academic_tone'
  | 'fix_formatting'
  | 'expand_section'
  | 'add_examples'
  | 'simplify_language'
  | 'add_code_blocks'
  | 'convert_to_comic'
  | 'align_bestseller_mode'
  | 'fix_errors'
  | 'custom';

export interface RegenerationRequest {
  intent: RegenerationIntent;
  customDescription?: string;
  targetSection?: string;
  preserveUserContent: boolean;
  isSurgicalEdit: boolean;
}

export function validateRegenerationRequest(
  request: RegenerationRequest,
  contentOwnership: ContentOwnership
): { allowed: boolean; reason?: string } {
  // If content is user-locked, only surgical edits are allowed
  if (contentOwnership.userLocked && !request.isSurgicalEdit) {
    return {
      allowed: false,
      reason: 'Full regeneration is blocked for user-authored content. Only targeted edits are allowed.',
    };
  }

  // If content is significantly user-authored (>= 70% different)
  if (contentOwnership.differencePercentage >= 70 && !request.isSurgicalEdit) {
    return {
      allowed: false,
      reason: `Content is ${contentOwnership.differencePercentage}% different from AI output. Only surgical edits are permitted to preserve your work.`,
    };
  }

  // Custom intent requires description
  if (request.intent === 'custom' && !request.customDescription?.trim()) {
    return {
      allowed: false,
      reason: 'Please specify what changes you want to make.',
    };
  }

  return { allowed: true };
}

// Export utility for error boundary integration
export const SystemDiagnostics = {
  classifyError,
  validateComicContent,
  detectContentOwnership,
  calculateContentDifference,
  validateExportReadiness,
  sanitizeForExport,
  hasMarkdownArtifacts,
  runDiagnostics,
  validateRegenerationRequest,
};

export default SystemDiagnostics;
