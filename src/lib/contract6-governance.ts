/**
 * CONTRACT 6 — BOOK TYPE GOVERNANCE & CONTENT FIDELITY
 * Status: CORE · HARD-ENFORCED
 * 
 * Once a book type is selected, the AI is no longer "creative."
 * It becomes a governed author bound by strict rules.
 * 
 * This contract exists to:
 * - Eliminate cross-type contamination
 * - Prevent storytelling in technical/academic books
 * - Ensure predictable, professional output
 * - Make ScrollLibrary trustworthy for schools, employers, and institutions
 */

// ===========================================
// RULE 6.1 — TYPE LOCK (IMMUTABLE)
// ===========================================

export type GovernedBookType = 
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
// RULE 6.3 — GENERATOR IDENTITY LOCK
// ===========================================

export const GENERATOR_IDENTITIES: Record<GovernedBookType, string> = {
  academic: 'Lecturer · Researcher',
  professional: 'Consultant · Strategist',
  workbook: 'Instructional Designer',
  bestseller: 'Author · Storyteller',
  comic: 'Screenwriter · Art Director',
  children: 'Educator · Child Psychologist',
  technical: 'Engineer · Instructor',
  reference: 'Subject Matter Expert · Editor',
  text: 'Author',
};

// ===========================================
// HARD BOOK TYPE CONTRACTS (CORE)
// ===========================================

export interface Contract6Rules {
  type: GovernedBookType;
  displayName: string;
  identity: string;
  
  // What MUST be present
  mandatory: string[];
  
  // What is STRICTLY FORBIDDEN
  forbidden: string[];
  
  // Structure requirements
  chapterStructure: string[];
  
  // Word limits (optional)
  wordLimits?: { min: number; max: number };
  
  // Validation patterns
  forbiddenPatterns: RegExp[];
  storyMarkers: RegExp[];
  
  // Violation codes
  violationCode: string;
}

export const CONTRACT_6_RULES: Record<GovernedBookType, Contract6Rules> = {
  // 🟦 A. ACADEMIC TEXTBOOK
  academic: {
    type: 'academic',
    displayName: 'Academic Textbook',
    identity: 'Lecturer · Researcher',
    mandatory: [
      'Formal academic tone',
      'Definitions, frameworks, models',
      'Citations (APA/Harvard)',
      'Neutral, evidence-based language',
      'Section numbering (1.1, 1.2…)',
      'Learning objectives per chapter',
      'References section',
      'In-text citations',
    ],
    forbidden: [
      'Stories',
      'Fictional scenarios',
      'CEO narratives',
      'Emotional hooks',
      'Conversational tone',
      'First-person persuasion',
    ],
    chapterStructure: [
      'Learning Objectives',
      'Concept Explanation',
      'Examples / Case Studies',
      'Exercises',
      'References',
    ],
    forbiddenPatterns: [
      /the\s+(boardroom|office)\s+was\s+tense/i,
      /let\s+me\s+tell\s+you\s+a\s+story/i,
      /once\s+upon\s+a\s+time/i,
      /imagine\s+yourself/i,
      /you\s+can\s+do\s+it/i,
      /believe\s+in\s+yourself/i,
      /let's\s+dive\s+in/i,
      /journey\s+begins/i,
      /exciting\s+adventure/i,
      /hero's\s+journey/i,
    ],
    storyMarkers: [
      /sarah,?\s+(a|the)\s+(startup\s+)?ceo/i,
      /john,?\s+(a|the)\s+manager/i,
      /^\s*"[A-Z][^"]+"\s+said\s+/m,
      /walked\s+into\s+(the|a)\s+(room|office|boardroom)/i,
    ],
    violationCode: 'ACADEMIC_TONE_VIOLATION',
  },
  
  // 🟩 B. TECHNICAL GUIDE
  technical: {
    type: 'technical',
    displayName: 'Technical Guide',
    identity: 'Engineer · Instructor',
    mandatory: [
      'Step-by-step explanations',
      'Code blocks (≥40% of content)',
      'Explicit outputs',
      'Exercises and tasks',
      'Learning objectives',
      'Practical demonstrations',
      'Literal titles',
    ],
    forbidden: [
      'Storytelling',
      'Metaphors ("journey", "alchemy", "hero")',
      'Fictional characters',
      'Narrative hooks',
    ],
    chapterStructure: [
      'Learning Objectives',
      'Concept Explanation',
      'Code Examples (40%+)',
      'Exercises',
      'Mini-Project',
    ],
    forbiddenPatterns: [
      /alchemist|wizard|journey|dark\s*arts|secrets|hidden|forging/i,
      /zero\s*to\s*hero|ultimate|revolutionary|mystical|magic/i,
      /kingdom|adventure|quest|warrior|master\s+the\s+art/i,
    ],
    storyMarkers: [
      /sarah,?\s+(a|the)/i,
      /john,?\s+(a|the)/i,
      /^\s*"[A-Z][^"]+"\s+said\s+/m,
      /walked\s+into|the\s+meeting\s+room/i,
    ],
    violationCode: 'TECHNICAL_STORYTELLING_VIOLATION',
  },
  
  // 🟨 C. PROFESSIONAL / BUSINESS GUIDE
  professional: {
    type: 'professional',
    displayName: 'Professional Guide',
    identity: 'Consultant · Strategist',
    mandatory: [
      'Case studies (real-world, factual)',
      'Frameworks (SWOT, Porter, etc.)',
      'Strategic tone',
      'Actionable steps',
      'Decision tools and checklists',
      'Professional voice',
    ],
    forbidden: [
      'Fiction',
      'Academic citations overload',
      'Casual storytelling',
    ],
    chapterStructure: [
      'Executive Summary',
      'Context / Background',
      'Framework / Model',
      'Implementation Steps',
      'Key Takeaways',
    ],
    forbiddenPatterns: [],
    storyMarkers: [
      /once\s+upon\s+a\s+time/i,
    ],
    violationCode: 'PROFESSIONAL_TONE_VIOLATION',
  },
  
  // 🟧 D. BESTSELLER / TRADE BOOK
  bestseller: {
    type: 'bestseller',
    displayName: 'Bestseller / Trade Book',
    identity: 'Author · Storyteller',
    mandatory: [
      'Narrative',
      'Hooks',
      'Emotional storytelling',
      'Metaphors',
      'Conversational tone',
      'Strong opening hook',
      'Named principles',
      'Takeaways',
    ],
    forbidden: [
      'Academic formatting',
      'Section numbering',
      'Citations',
      'Hedging language',
    ],
    chapterStructure: [
      'Opening Hook',
      'Central Idea',
      'Human Illustration',
      'Named Principle',
      'Reader Engagement',
      'Actionable Takeaways',
    ],
    forbiddenPatterns: [
      /it\s+could\s+be\s+argued/i,
      /in\s+some\s+cases/i,
      /this\s+suggests/i,
      /on\s+the\s+one\s+hand/i,
      /might\s+potentially/i,
      /some\s+experts\s+say/i,
    ],
    storyMarkers: [], // Stories are ALLOWED for bestsellers
    violationCode: 'BESTSELLER_TONE_VIOLATION',
  },
  
  // 🟥 E. WORKBOOK / FILL-IN
  workbook: {
    type: 'workbook',
    displayName: 'Workbook / Fill-In',
    identity: 'Instructional Designer',
    mandatory: [
      'Fill-in blanks',
      'Tables',
      'Checklists',
      'Reflection prompts',
    ],
    forbidden: [
      'Long essays',
      'Storytelling',
    ],
    chapterStructure: [
      'Purpose (≤150 words)',
      'Key Concepts (≤300 words)',
      'Fill-In Prompts',
      'Tables / Worksheets',
      'Reflection Questions',
      'Action Steps',
    ],
    wordLimits: { min: 800, max: 1800 },
    forbiddenPatterns: [],
    storyMarkers: [
      /^\s*"[A-Z][^"]+"\s+said\s+/m,
      /once\s+upon\s+a\s+time/i,
    ],
    violationCode: 'WORKBOOK_VIOLATION',
  },
  
  // 🟪 F. COMIC / GRAPHIC
  comic: {
    type: 'comic',
    displayName: 'Comic / Graphic Novel',
    identity: 'Screenwriter · Art Director',
    mandatory: [
      '4–6 panels minimum',
      'Every panel has dialogue',
      'Visual descriptions',
    ],
    forbidden: [
      'Prose paragraphs',
      'Image-only panels',
      'Caption-only panels',
    ],
    chapterStructure: [
      'Panel 1: Visual + Dialogue',
      'Panel 2: Visual + Dialogue',
      'Panel 3: Visual + Dialogue',
      'Panel 4: Visual + Dialogue',
      '(Optional) Panels 5-6',
    ],
    forbiddenPatterns: [],
    storyMarkers: [],
    violationCode: 'COMIC_STRUCTURE_VIOLATION',
  },
  
  // 🟦 G. CHILDREN'S BOOK
  children: {
    type: 'children',
    displayName: "Children's Book",
    identity: 'Educator · Child Psychologist',
    mandatory: [
      'Simple sentences',
      'Visual-first',
      'Clear lesson',
    ],
    forbidden: [
      'Complex abstractions',
      'Adult themes',
    ],
    chapterStructure: [
      'Scene Setup (1-2 sentences)',
      'Story Beat (with illustration)',
      'Character Action',
      'Lesson / Message',
    ],
    wordLimits: { min: 50, max: 500 },
    forbiddenPatterns: [
      /death|murder|blood|violence|hate|kill/i,
    ],
    storyMarkers: [],
    violationCode: 'CHILDREN_CONTENT_VIOLATION',
  },
  
  // Reference handbook
  reference: {
    type: 'reference',
    displayName: 'Reference / Handbook',
    identity: 'Subject Matter Expert · Editor',
    mandatory: [
      'Structured information architecture',
      'Clear categorization',
      'Quick lookup format',
      'Comprehensive coverage',
    ],
    forbidden: [
      'Narrative flow',
      'Storytelling',
      'Personal opinions',
    ],
    chapterStructure: [
      'Topic Header',
      'Definition / Overview',
      'Key Points',
      'Examples',
      'Cross-references',
    ],
    forbiddenPatterns: [],
    storyMarkers: [
      /once\s+upon\s+a\s+time/i,
      /^\s*"[A-Z][^"]+"\s+said\s+/m,
    ],
    violationCode: 'REFERENCE_TONE_VIOLATION',
  },
  
  // Standard text (legacy)
  text: {
    type: 'text',
    displayName: 'Standard Text',
    identity: 'Author',
    mandatory: [
      'Clear writing',
      'Logical flow',
      'Proper formatting',
    ],
    forbidden: [],
    chapterStructure: [
      'Introduction',
      'Main Content',
      'Conclusion',
    ],
    forbiddenPatterns: [],
    storyMarkers: [],
    violationCode: 'TEXT_VIOLATION',
  },
};

// ===========================================
// RULE 6.2 — CROSS-TYPE CONTAMINATION DETECTION
// ===========================================

export interface Contract6Violation {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  bookType: GovernedBookType;
  suggestedAction: string;
  matchedPattern?: string;
}

export interface Contract6ValidationResult {
  valid: boolean;
  violations: Contract6Violation[];
  shouldRegenerate: boolean;
  detectedCrossTypes: GovernedBookType[];
  userMessage?: string;
}

/**
 * RULE 6.5 — TRANSPARENCY
 * Validate content against Contract 6 rules with clear user feedback
 */
export function validateContract6(
  content: string,
  bookType: GovernedBookType,
  title?: string
): Contract6ValidationResult {
  const rules = CONTRACT_6_RULES[bookType];
  const violations: Contract6Violation[] = [];
  const detectedCrossTypes: GovernedBookType[] = [];
  
  if (!rules) {
    return {
      valid: false,
      violations: [{
        code: 'UNKNOWN_BOOK_TYPE',
        message: `Unknown book type: ${bookType}`,
        severity: 'critical',
        bookType,
        suggestedAction: 'Select a valid book type',
      }],
      shouldRegenerate: true,
      detectedCrossTypes: [],
    };
  }
  
  // Check forbidden patterns for the declared type
  for (const pattern of rules.forbiddenPatterns) {
    if (pattern.test(content) || (title && pattern.test(title))) {
      violations.push({
        code: rules.violationCode,
        message: `Content contains forbidden pattern for ${rules.displayName}`,
        severity: 'high',
        bookType,
        suggestedAction: `Remove the pattern and regenerate. ${rules.displayName} books must not contain this content.`,
        matchedPattern: pattern.source,
      });
    }
  }
  
  // Check story markers for non-storytelling types
  if (bookType === 'academic' || bookType === 'technical' || bookType === 'reference') {
    for (const pattern of rules.storyMarkers) {
      if (pattern.test(content)) {
        violations.push({
          code: 'STORY_IN_TECHNICAL',
          message: `This chapter included storytelling, which is FORBIDDEN for ${rules.displayName}.`,
          severity: 'critical',
          bookType,
          suggestedAction: 'Removing fictional narratives and regenerating with factual content...',
          matchedPattern: pattern.source,
        });
        
        // Detect cross-type contamination
        if (!detectedCrossTypes.includes('bestseller')) {
          detectedCrossTypes.push('bestseller');
        }
      }
    }
  }
  
  // Word count validation for workbooks/children
  if (rules.wordLimits) {
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount > rules.wordLimits.max) {
      violations.push({
        code: 'WORD_COUNT_EXCEEDED',
        message: `Content exceeds ${rules.wordLimits.max} word limit (${wordCount} words)`,
        severity: 'critical',
        bookType,
        suggestedAction: `Reduce content to under ${rules.wordLimits.max} words`,
      });
    }
  }
  
  // Comic-specific validation
  if (bookType === 'comic') {
    const panelMatches = content.match(/\[PANEL\s*\d+\]/gi) || [];
    if (panelMatches.length < 4) {
      violations.push({
        code: 'INSUFFICIENT_PANELS',
        message: `Comic requires minimum 4 panels, found ${panelMatches.length}`,
        severity: 'critical',
        bookType,
        suggestedAction: 'Regenerating with proper panel structure...',
      });
    }
    
    // Check for dialogue in panels
    const hasProseOnly = /^[A-Z][^.]*\.[^"]*$/m.test(content) && !content.includes('PANEL');
    if (hasProseOnly) {
      violations.push({
        code: 'PROSE_IN_COMIC',
        message: 'Comics must use panel structure with dialogue, not prose paragraphs',
        severity: 'critical',
        bookType,
        suggestedAction: 'Regenerating with panel-dialogue format...',
      });
    }
  }
  
  // Academic/Technical specific validation
  if (bookType === 'academic' || bookType === 'technical') {
    // Check for metaphorical titles
    if (title) {
      const metaphorPatterns = [
        /alchemist/i, /wizard/i, /journey/i, /dark\s*arts/i,
        /secrets/i, /hidden/i, /forging/i, /mystical/i,
        /magic/i, /kingdom/i, /adventure/i, /quest/i,
      ];
      
      for (const pattern of metaphorPatterns) {
        if (pattern.test(title)) {
          violations.push({
            code: 'METAPHORICAL_TITLE',
            message: `Academic/Technical titles must be literal, not metaphorical. "${title}" uses metaphors.`,
            severity: 'critical',
            bookType,
            suggestedAction: 'Use descriptive, technical titles like "Introduction to [Topic]" or "Practical Guide to [Topic]"',
            matchedPattern: pattern.source,
          });
          break;
        }
      }
    }
  }
  
  // Cross-type contamination detection
  detectCrossTypeContamination(content, bookType, detectedCrossTypes, violations);
  
  const hasCritical = violations.some(v => v.severity === 'critical');
  
  // Build user message for transparency (RULE 6.5)
  let userMessage: string | undefined;
  if (violations.length > 0) {
    const primaryViolation = violations[0];
    userMessage = `${primaryViolation.message} ${primaryViolation.suggestedAction}`;
  }
  
  return {
    valid: violations.length === 0,
    violations,
    shouldRegenerate: hasCritical,
    detectedCrossTypes,
    userMessage,
  };
}

/**
 * Detect cross-type contamination
 */
function detectCrossTypeContamination(
  content: string,
  declaredType: GovernedBookType,
  detectedCrossTypes: GovernedBookType[],
  violations: Contract6Violation[]
): void {
  // Academic indicators in non-academic content
  if (/\([A-Z][a-z]+,?\s*\d{4}\)/g.test(content) && 
      declaredType !== 'academic' && declaredType !== 'technical' && declaredType !== 'reference') {
    if (!detectedCrossTypes.includes('academic')) {
      detectedCrossTypes.push('academic');
      violations.push({
        code: 'CROSS_TYPE_ACADEMIC',
        message: `${CONTRACT_6_RULES[declaredType].displayName} books should not contain academic citations`,
        severity: 'medium',
        bookType: declaredType,
        suggestedAction: 'Remove academic-style citations for this book type',
      });
    }
  }
  
  // Comic indicators in non-comic content
  if (/\[PANEL\s*\d+\]/gi.test(content) && 
      declaredType !== 'comic' && declaredType !== 'children') {
    if (!detectedCrossTypes.includes('comic')) {
      detectedCrossTypes.push('comic');
      violations.push({
        code: 'CROSS_TYPE_COMIC',
        message: `${CONTRACT_6_RULES[declaredType].displayName} books should not contain panel markers`,
        severity: 'high',
        bookType: declaredType,
        suggestedAction: 'Remove comic-style formatting for this book type',
      });
    }
  }
  
  // Workbook indicators in non-workbook content
  if (/_{5,}/.test(content) && /\[\s*\]/.test(content) && 
      declaredType !== 'workbook') {
    if (!detectedCrossTypes.includes('workbook')) {
      detectedCrossTypes.push('workbook');
      violations.push({
        code: 'CROSS_TYPE_WORKBOOK',
        message: `${CONTRACT_6_RULES[declaredType].displayName} books should not contain fill-in prompts`,
        severity: 'medium',
        bookType: declaredType,
        suggestedAction: 'Remove workbook-style interactive elements for this book type',
      });
    }
  }
}

// ===========================================
// RULE 6.4 — REGENERATION MUST RESPECT TYPE
// ===========================================

export interface RegenerationContext {
  bookType: GovernedBookType;
  originalBookType: GovernedBookType;
  isRegeneration: boolean;
}

/**
 * Validate that regeneration respects immutable book type
 */
export function validateRegenerationContext(context: RegenerationContext): {
  allowed: boolean;
  reason?: string;
} {
  // RULE 6.1: Book type is immutable
  if (context.isRegeneration && context.bookType !== context.originalBookType) {
    return {
      allowed: false,
      reason: `Book type cannot change during regeneration. Original type: ${context.originalBookType}, Requested: ${context.bookType}. Create a new book if you want a different type.`,
    };
  }
  
  return { allowed: true };
}

// ===========================================
// RULE 6.6 — EXPORT VALIDATION
// ===========================================

export interface ExportValidationResult {
  valid: boolean;
  canExport: boolean;
  violations: string[];
  blockReason?: string;
}

/**
 * Validate content before export (PDF, EPUB, Audio)
 */
export function validateForExport(
  content: string,
  bookType: GovernedBookType,
  title?: string
): ExportValidationResult {
  const contract6Result = validateContract6(content, bookType, title);
  
  const violations = contract6Result.violations.map(v => v.message);
  const hasCritical = contract6Result.violations.some(v => v.severity === 'critical');
  
  if (hasCritical) {
    return {
      valid: false,
      canExport: false,
      violations,
      blockReason: `Export blocked: Content violates Contract 6 (${contract6Result.violations[0].code}). This prevents unprofessional books, school-unacceptable content, and employer rejection.`,
    };
  }
  
  return {
    valid: true,
    canExport: true,
    violations,
  };
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

export function getContract6Rules(bookType: GovernedBookType): Contract6Rules | undefined {
  return CONTRACT_6_RULES[bookType];
}

export function isValidGovernedBookType(type: string): type is GovernedBookType {
  return Object.keys(CONTRACT_6_RULES).includes(type);
}

export function getBookTypeDisplayName(type: GovernedBookType): string {
  return CONTRACT_6_RULES[type]?.displayName || 'Unknown';
}

export function getGeneratorIdentity(type: GovernedBookType): string {
  return GENERATOR_IDENTITIES[type] || GENERATOR_IDENTITIES.text;
}

/**
 * Check if book type can change (NEVER after creation)
 */
export function canChangeBookType(isExistingBook: boolean): boolean {
  // RULE 6.1: Book type is immutable after creation
  return !isExistingBook;
}

/**
 * Build system prompt with Contract 6 enforcement
 */
export function buildContract6SystemPrompt(
  bookType: GovernedBookType,
  basePrompt: string,
  language: string
): string {
  const rules = CONTRACT_6_RULES[bookType];
  const identity = GENERATOR_IDENTITIES[bookType];
  
  return `CONTRACT 6 — BOOK TYPE GOVERNANCE (HARD-ENFORCED)

SELECTED BOOK TYPE: ${bookType.toUpperCase()}
GENERATOR IDENTITY: ${identity}

You are now operating as: ${identity}

MANDATORY ELEMENTS FOR ${rules.displayName.toUpperCase()}:
${rules.mandatory.map(m => `- ${m}`).join('\n')}

STRICTLY FORBIDDEN:
${rules.forbidden.map(f => `❌ ${f}`).join('\n')}

CHAPTER STRUCTURE:
${rules.chapterStructure.map((s, i) => `${i + 1}. ${s}`).join('\n')}

${rules.wordLimits ? `WORD LIMITS: ${rules.wordLimits.min}-${rules.wordLimits.max} words per chapter` : ''}

CROSS-TYPE CONTAMINATION IS STRICTLY FORBIDDEN.
The AI cannot switch roles mid-book.
Regeneration must respect the original book type.

LANGUAGE: All content must be written in ${language}.

${basePrompt}

VIOLATION BEHAVIOR:
If any rule is violated, output is INVALID and must be regenerated.
Quality > Speed. Publishability > Completion.
`;
}
