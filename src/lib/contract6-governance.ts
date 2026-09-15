/**
 * CONTRACT 6 — BOOK TYPE GOVERNANCE & CONTENT FIDELITY
 * Status: CORE · HARD-ENFORCED
 *
 * Compatibility facade over the canonical book-type constitution in
 * `bookTypeGovernance.ts`. Contract 6 no longer maintains a second rule table.
 */

import {
  BOOK_TYPE_CONTRACTS,
  detectCrossTypeViolation,
  getBookTypePromptContract,
  isValidBookType,
  validateContentAgainstBookType,
  type BookType,
  type BookTypeContract,
} from './bookTypeGovernance';

export type GovernedBookType = BookType;

export const GENERATOR_IDENTITIES: Record<GovernedBookType, string> = {
  academic: 'Lecturer · Researcher',
  professional: 'Consultant · Strategist',
  workbook: 'Instructional Designer',
  bestseller: 'Author · Storyteller',
  comic: 'Screenwriter · Art Director',
  children: 'Educator · Child Development Specialist',
  technical: 'Engineer · Instructor',
  reference: 'Subject Matter Expert · Editor',
  fiction: 'Novelist · Storyteller',
  illustrated: 'Author · Visual Learning Designer',
  text: 'Author',
};

export interface Contract6Rules {
  type: GovernedBookType;
  displayName: string;
  identity: string;
  mandatory: string[];
  forbidden: string[];
  chapterStructure: string[];
  wordLimits?: { min: number; max: number };
  violationCode: string;
}

function toContract6Rule(contract: BookTypeContract): Contract6Rules {
  return {
    type: contract.type,
    displayName: contract.displayName,
    identity: GENERATOR_IDENTITIES[contract.type],
    mandatory: [...contract.mandatory],
    forbidden: [...contract.forbidden],
    chapterStructure: [...contract.chapterStructure],
    wordLimits: contract.wordLimits ? { ...contract.wordLimits } : undefined,
    violationCode: `${contract.type.toUpperCase()}_CONTENT_VIOLATION`,
  };
}

export const CONTRACT_6_RULES = Object.fromEntries(
  (Object.values(BOOK_TYPE_CONTRACTS) as BookTypeContract[]).map(contract => [contract.type, toContract6Rule(contract)]),
) as Record<GovernedBookType, Contract6Rules>;

export interface Contract6Violation {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  bookType: GovernedBookType;
  suggestedAction: string;
}

export interface Contract6ValidationResult {
  valid: boolean;
  violations: Contract6Violation[];
  shouldRegenerate: boolean;
  detectedCrossTypes: GovernedBookType[];
  userMessage?: string;
}

export function validateContract6(
  content: string,
  bookType: GovernedBookType,
  title?: string,
): Contract6ValidationResult {
  if (!isValidBookType(bookType)) {
    return {
      valid: false,
      violations: [{
        code: 'UNKNOWN_BOOK_TYPE',
        message: `Unknown book type: ${bookType}`,
        severity: 'critical',
        bookType,
        suggestedAction: 'Select a valid book type',
      }],
      shouldRegenerate: false,
      detectedCrossTypes: [],
      userMessage: `Unknown book type: ${bookType}`,
    };
  }

  const validation = validateContentAgainstBookType(content, bookType, {
    checkTitle: Boolean(title),
    title,
    checkWordCount: true,
  });
  const crossType = detectCrossTypeViolation(content, bookType);

  const violations: Contract6Violation[] = validation.violations.map(violation => ({
    code: violation.code,
    message: violation.message,
    severity: violation.severity,
    bookType,
    suggestedAction: violation.suggestedFix || 'Regenerate or edit the content to satisfy the canonical book-type contract.',
  }));

  if (crossType.hasCrossType) {
    violations.push({
      code: 'CROSS_TYPE_CONTAMINATION',
      message: crossType.message || 'Cross-type content detected',
      severity: 'critical',
      bookType,
      suggestedAction: 'Remove content elements governed by a different book type.',
    });
  }

  const shouldRegenerate = violations.some(violation => violation.severity === 'critical');
  return {
    valid: violations.length === 0,
    violations,
    shouldRegenerate,
    detectedCrossTypes: crossType.detectedTypes,
    userMessage: violations[0] ? `${violations[0].message} ${violations[0].suggestedAction}` : undefined,
  };
}

export interface RegenerationContext {
  bookType: GovernedBookType;
  originalBookType: GovernedBookType;
  isRegeneration: boolean;
}

export function validateRegenerationContext(context: RegenerationContext): { allowed: boolean; reason?: string } {
  if (context.isRegeneration && context.bookType !== context.originalBookType) {
    return {
      allowed: false,
      reason: `Book type cannot change during regeneration. Original: ${context.originalBookType}; requested: ${context.bookType}.`,
    };
  }
  return { allowed: true };
}

export interface ExportValidationResult {
  valid: boolean;
  canExport: boolean;
  violations: string[];
  blockReason?: string;
}

export function validateForExport(content: string, bookType: GovernedBookType, title?: string): ExportValidationResult {
  const result = validateContract6(content, bookType, title);
  const blocking = result.violations.filter(violation => violation.severity === 'critical' || violation.severity === 'high');
  return {
    valid: blocking.length === 0,
    canExport: blocking.length === 0,
    violations: result.violations.map(violation => violation.message),
    blockReason: blocking.length ? `Export blocked by Contract 6: ${blocking[0].message}` : undefined,
  };
}

export function getContract6Rules(bookType: GovernedBookType): Contract6Rules | undefined {
  return CONTRACT_6_RULES[bookType];
}
export function isValidGovernedBookType(type: string): type is GovernedBookType { return isValidBookType(type); }
export function getBookTypeDisplayName(type: GovernedBookType): string { return BOOK_TYPE_CONTRACTS[type]?.displayName || 'Unknown'; }
export function getGeneratorIdentity(type: GovernedBookType): string { return GENERATOR_IDENTITIES[type] || GENERATOR_IDENTITIES.text; }
export function canChangeBookType(isExistingBook: boolean): boolean { return !isExistingBook; }

export function buildContract6SystemPrompt(bookType: GovernedBookType, basePrompt: string, language: string): string {
  const identity = getGeneratorIdentity(bookType);
  return `CONTRACT 6 — BOOK TYPE GOVERNANCE (HARD-ENFORCED)\n\nSELECTED BOOK TYPE: ${bookType.toUpperCase()}\nGENERATOR IDENTITY: ${identity}\n${getBookTypePromptContract(bookType)}\nLANGUAGE: All content must be written in ${language}.\n\n${basePrompt}\n\nFAILURE BEHAVIOR: output that violates the canonical book-type contract is invalid and must not be committed.`;
}