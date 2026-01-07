/**
 * CONTRACT 3 — CONTENT-TYPE FIDELITY & GENERATION GOVERNANCE
 * Supabase Edge Function Module
 * 
 * Book Type is a GOVERNING CONSTITUTION, not a hint.
 * Once selected, it locks structure, tone, formatting, and generation behavior.
 */

import {
  BOOK_TYPE_ROUTER,
  ACADEMIC_TECHNICAL_PIPELINE,
  BESTSELLER_HARDLOCK_CONTRACT,
  WORKBOOK_CONTRACT,
  COMIC_PANEL_CONTRACT,
  COMIC_DIALOGUE_CONTRACT,
  CHILDRENS_BOOK_CONTRACT,
} from './master-prompt.ts';

// ===========================================
// BOOK TYPE DEFINITIONS (LOCKED)
// ===========================================

export type BookPipelineType = 
  | 'academic'      // Academic Textbook
  | 'professional'  // Professional / Business Guide  
  | 'workbook'      // Workbook / Fill-In Guide
  | 'bestseller'    // Mass-Market Bestseller
  | 'comic'         // Comic / Graphic Novel
  | 'children'      // Children's Book
  | 'technical'     // Technical / Hands-On Guide
  | 'reference'     // Reference / Handbook
  | 'text';         // Standard Text (legacy)

// ===========================================
// GENERATOR IDENTITY MAPPING (LOCKED)
// ===========================================

export const GENERATOR_IDENTITIES: Record<BookPipelineType, string> = {
  academic: 'Lecturer · Engineer · Researcher',
  professional: 'Consultant · Strategist',
  workbook: 'Instructional Designer',
  bestseller: 'Author · Storyteller',
  comic: 'Screenwriter · Art Director',
  children: 'Educator · Child Psychologist',
  technical: 'Lecturer · Engineer · Researcher',
  reference: 'Subject Matter Expert · Editor',
  text: 'Author',
};

// ===========================================
// PIPELINE CONTRACTS
// ===========================================

export interface PipelineContract {
  type: BookPipelineType;
  identity: string;
  systemPromptAddition: string;
  validationRules: string[];
  forbiddenPatterns: RegExp[];
  requiredPatterns: RegExp[];
}

export function getPipelineContract(bookType: BookPipelineType): PipelineContract {
  const identity = GENERATOR_IDENTITIES[bookType] || GENERATOR_IDENTITIES.text;
  
  switch (bookType) {
    case 'academic':
    case 'technical':
      return {
        type: bookType,
        identity,
        systemPromptAddition: ACADEMIC_TECHNICAL_PIPELINE,
        validationRules: [
          'literal_technical_titles',
          'learning_objectives_present',
          'code_blocks_40_percent',
          'exercises_present',
          'no_metaphors',
          'no_storytelling',
        ],
        forbiddenPatterns: [
          /alchemist|wizard|journey|dark\s*arts|secrets|hidden|forging|zero\s*to\s*hero|ultimate|revolutionary/i,
          /you can do it|believe in yourself|let's dive in|journey begins|exciting adventure/i,
          /hero's journey|once upon a time/i,
        ],
        requiredPatterns: [
          /learning\s+objectives?|by the end of this|you will learn/i,
          /CODE EXAMPLE|```\w+|    \w+.*\n/,
        ],
      };
      
    case 'bestseller':
      return {
        type: bookType,
        identity,
        systemPromptAddition: BESTSELLER_HARDLOCK_CONTRACT,
        validationRules: [
          'aggressive_hook',
          'belief_disruption',
          'quotable_lines_3_plus',
          'named_principle',
          'actionable_takeaways',
          'no_hedging_language',
        ],
        forbiddenPatterns: [
          /it could be argued|in some cases|this suggests|on the one hand|might potentially|some experts say/i,
          /it is worth noting|as we've discussed|next, we will discuss/i,
        ],
        requiredPatterns: [],
      };
      
    case 'workbook':
      return {
        type: bookType,
        identity,
        systemPromptAddition: WORKBOOK_CONTRACT,
        validationRules: [
          'word_count_1200_1800',
          'fill_in_prompts_present',
          'checkboxes_present',
          'tables_present',
          'reflection_questions_present',
          'minimal_prose',
        ],
        forbiddenPatterns: [],
        requiredPatterns: [
          /_{5,}/,
          /\[\s*\]/,
        ],
      };
      
    case 'comic':
      return {
        type: bookType,
        identity,
        systemPromptAddition: `${COMIC_PANEL_CONTRACT}\n\n${COMIC_DIALOGUE_CONTRACT}`,
        validationRules: [
          'panel_count_4_to_6',
          'every_panel_has_dialogue',
          'visual_descriptions_present',
          'character_consistency',
        ],
        forbiddenPatterns: [],
        requiredPatterns: [
          /\[PANEL\s*\d+\]/i,
          /-\s*[A-Z][a-z]+.*:/,
          /Visual:/i,
        ],
      };
      
    case 'children':
      return {
        type: bookType,
        identity,
        systemPromptAddition: CHILDRENS_BOOK_CONTRACT,
        validationRules: [
          'simple_language',
          'short_sentences',
          'age_appropriate',
          'visual_first',
        ],
        forbiddenPatterns: [
          /death|murder|blood|violence|hate|kill/i,
        ],
        requiredPatterns: [],
      };
      
    case 'professional':
      return {
        type: bookType,
        identity,
        systemPromptAddition: `
You are a business consultant and strategist.

MANDATORY ELEMENTS:
- Strategic frameworks (Porter's 5 Forces, SWOT, etc.)
- Actionable recommendations
- Decision matrices and checklists
- Industry context

FORBIDDEN:
- Academic-style citations (excessive)
- Personal anecdotes (excessive)
- Informal language

TONE: Professional, authoritative, practical
`,
        validationRules: [
          'has_frameworks',
          'has_actionable_steps',
          'professional_tone',
        ],
        forbiddenPatterns: [],
        requiredPatterns: [],
      };
      
    case 'reference':
      return {
        type: bookType,
        identity,
        systemPromptAddition: `
You are a subject matter expert creating reference material.

MANDATORY ELEMENTS:
- Structured information architecture
- Clear categorization
- Quick lookup format
- Alphabetical or logical ordering
- Cross-references

FORBIDDEN:
- Narrative flow
- Storytelling
- Personal opinions

FORMAT: Encyclopedia-like entries with clear headers
`,
        validationRules: [
          'structured_format',
          'clear_headings',
        ],
        forbiddenPatterns: [],
        requiredPatterns: [],
      };
      
    default:
      return {
        type: 'text',
        identity: GENERATOR_IDENTITIES.text,
        systemPromptAddition: '',
        validationRules: [],
        forbiddenPatterns: [],
        requiredPatterns: [],
      };
  }
}

// ===========================================
// CONTENT VALIDATION
// ===========================================

export interface ValidationViolation {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

export interface ContentValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
  bookType: BookPipelineType;
  shouldRegenerate: boolean;
}

export function validateContentAgainstPipeline(
  content: string,
  bookType: BookPipelineType,
  title?: string
): ContentValidationResult {
  const contract = getPipelineContract(bookType);
  const violations: ValidationViolation[] = [];
  
  // Check forbidden patterns
  for (const pattern of contract.forbiddenPatterns) {
    if (pattern.test(content) || (title && pattern.test(title))) {
      violations.push({
        code: 'FORBIDDEN_PATTERN',
        message: `Content contains forbidden pattern for ${bookType}: ${pattern.source}`,
        severity: 'high',
      });
    }
  }
  
  // Check required patterns
  for (const pattern of contract.requiredPatterns) {
    if (!pattern.test(content)) {
      violations.push({
        code: 'MISSING_REQUIRED_PATTERN',
        message: `Content missing required pattern for ${bookType}: ${pattern.source}`,
        severity: 'high',
      });
    }
  }
  
  // Book type specific validations
  switch (bookType) {
    case 'workbook':
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount > 1800) {
        violations.push({
          code: 'WORKBOOK_TOO_LONG',
          message: `Workbook exceeds 1800 word limit: ${wordCount} words`,
          severity: 'critical',
        });
      }
      break;
      
    case 'comic':
      const panelMatches = content.match(/\[PANEL\s*\d+\]/gi) || [];
      if (panelMatches.length < 4) {
        violations.push({
          code: 'INSUFFICIENT_PANELS',
          message: `Comic requires minimum 4 panels, found ${panelMatches.length}`,
          severity: 'critical',
        });
      }
      break;
      
    case 'academic':
    case 'technical':
      // Check for metaphorical titles
      if (title) {
        const metaphorPatterns = [
          /alchemist/i, /wizard/i, /journey/i, /dark\s*arts/i,
          /secrets/i, /hidden/i, /forging/i, /mystical/i,
        ];
        for (const pattern of metaphorPatterns) {
          if (pattern.test(title)) {
            violations.push({
              code: 'METAPHORICAL_TITLE',
              message: 'Academic/Technical titles must be literal, not metaphorical',
              severity: 'critical',
            });
            break;
          }
        }
      }
      break;
  }
  
  const hasCritical = violations.some(v => v.severity === 'critical');
  
  return {
    valid: violations.length === 0,
    violations,
    bookType,
    shouldRegenerate: hasCritical,
  };
}

// ===========================================
// CROSS-TYPE VIOLATION DETECTION
// ===========================================

export function detectCrossTypeViolation(
  content: string,
  declaredType: BookPipelineType
): { hasCrossType: boolean; detectedTypes: BookPipelineType[]; message?: string } {
  const detectedTypes: BookPipelineType[] = [];
  
  // Academic indicators in non-academic content
  if (/\([A-Z][a-z]+,?\s*\d{4}\)/g.test(content) && 
      declaredType !== 'academic' && declaredType !== 'technical') {
    detectedTypes.push('academic');
  }
  
  // Comic indicators in non-comic content
  if (/\[PANEL\s*\d+\]/gi.test(content) && 
      declaredType !== 'comic' && declaredType !== 'children') {
    detectedTypes.push('comic');
  }
  
  // Workbook indicators in non-workbook content
  if (/_{5,}/.test(content) && /\[\s*\]/.test(content) && 
      declaredType !== 'workbook') {
    detectedTypes.push('workbook');
  }
  
  const hasCrossType = detectedTypes.length > 0;
  
  return {
    hasCrossType,
    detectedTypes,
    message: hasCrossType 
      ? `⚠️ CROSS-TYPE VIOLATION: Content for "${declaredType}" contains ${detectedTypes.join(', ')} elements. This is FORBIDDEN under Contract 3.`
      : undefined,
  };
}

// ===========================================
// SYSTEM PROMPT BUILDER
// ===========================================

export function buildBookTypeSystemPrompt(
  bookType: BookPipelineType,
  baseSystemPrompt: string,
  language: string
): string {
  const contract = getPipelineContract(bookType);
  
  return `${BOOK_TYPE_ROUTER}

SELECTED BOOK TYPE: ${bookType.toUpperCase()}
GENERATOR IDENTITY: ${contract.identity}

${contract.systemPromptAddition}

${baseSystemPrompt}

LANGUAGE: All content must be written in ${language}.

CROSS-TYPE CONTAMINATION IS STRICTLY FORBIDDEN.
Only generate content appropriate for ${bookType.toUpperCase()} books.
`;
}

// ===========================================
// REGENERATION GOVERNANCE
// ===========================================

export interface RegenerationContext {
  bookType: BookPipelineType;
  originalContent: string;
  editIntent?: string;
}

export function validateRegenerationRequest(context: RegenerationContext): {
  allowed: boolean;
  reason?: string;
} {
  // Book type is immutable - cannot change during regeneration
  // This is enforced at the book level in the database
  
  // Regeneration must respect the original book type
  // The system prompt will be built using the same book type
  
  return { allowed: true };
}

// ===========================================
// EXPORTS
// ===========================================

export function getBookTypeDisplayName(type: BookPipelineType): string {
  const names: Record<BookPipelineType, string> = {
    academic: 'Academic Textbook',
    professional: 'Professional Guide',
    workbook: 'Workbook / Fill-In',
    bestseller: 'Bestseller / Trade Book',
    comic: 'Comic / Graphic Novel',
    children: "Children's Book",
    technical: 'Technical / Hands-On Guide',
    reference: 'Reference / Handbook',
    text: 'Standard Text',
  };
  return names[type] || 'Unknown';
}

export function isValidBookType(type: string): type is BookPipelineType {
  const validTypes: BookPipelineType[] = [
    'academic', 'professional', 'workbook', 'bestseller',
    'comic', 'children', 'technical', 'reference', 'text'
  ];
  return validTypes.includes(type as BookPipelineType);
}
