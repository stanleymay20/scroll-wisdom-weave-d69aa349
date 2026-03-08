/**
 * CONTRACT 3 — CONTENT-TYPE FIDELITY & GENERATION GOVERNANCE
 * 
 * Book Type is a GOVERNING CONSTITUTION, not a hint.
 * Once selected, it locks structure, tone, formatting, and generation behavior.
 */

// ===========================================
// BOOK TYPE DEFINITIONS (LOCKED)
// ===========================================

export type BookType = 
  | 'academic'      // Academic Textbook
  | 'professional'  // Professional / Business Guide  
  | 'workbook'      // Workbook / Fill-In Guide
  | 'bestseller'    // Mass-Market Bestseller
  | 'comic'         // Comic / Graphic Novel
  | 'children'      // Children's Book
  | 'technical'     // Technical / Hands-On Guide
  | 'reference'     // Reference / Handbook
  | 'fiction'       // Fiction / Novel
  | 'text';         // Standard Text (legacy)

// ===========================================
// BOOK TYPE CONTRACTS (HARD RULES)
// ===========================================

export interface BookTypeContract {
  type: BookType;
  displayName: string;
  description: string;
  
  // Content Rules
  mandatory: string[];
  forbidden: string[];
  
  // Structure Rules
  chapterStructure: string[];
  wordLimits?: { min: number; max: number };
  
  // Formatting Rules
  requiresCitations: boolean;
  requiresImages: boolean;
  requiresCode: boolean;
  requiresInteractivity: boolean;
  
  // Validation Rules
  validationChecks: string[];
}

export const BOOK_TYPE_CONTRACTS: Record<BookType, BookTypeContract> = {
  academic: {
    type: 'academic',
    displayName: 'Academic Textbook',
    description: 'Scholarly content with citations, formal tone, learning objectives',
    mandatory: [
      'Formal academic tone',
      'Clear learning objectives per chapter',
      'Definitions, frameworks, models',
      'Citations + references section (APA / Harvard)',
      'Neutral, evidence-driven language',
      'Structured headings (1.1, 1.2, etc.)',
    ],
    forbidden: [
      'Motivational tone',
      'Narrative storytelling',
      'First-person persuasion',
      'Bestseller hooks',
      'Metaphorical titles',
    ],
    chapterStructure: [
      'Learning Objectives',
      'Concept Explanation',
      'Examples / Case Studies',
      'Exercises',
      'References',
    ],
    requiresCitations: true,
    requiresImages: false,
    requiresCode: false,
    requiresInteractivity: false,
    validationChecks: [
      'has_learning_objectives',
      'has_citations',
      'has_references_section',
      'no_motivational_language',
      'formal_tone',
    ],
  },
  
  professional: {
    type: 'professional',
    displayName: 'Professional Guide',
    description: 'Business & industry guides with frameworks and actionable strategies',
    mandatory: [
      'Strategic frameworks and models',
      'Actionable recommendations',
      'Decision tools and checklists',
      'Industry context',
      'Professional tone',
    ],
    forbidden: [
      'Academic citations (excessive)',
      'Personal anecdotes',
      'Informal language',
    ],
    chapterStructure: [
      'Executive Summary',
      'Context / Background',
      'Framework / Model',
      'Implementation Steps',
      'Key Takeaways',
    ],
    requiresCitations: false,
    requiresImages: false,
    requiresCode: false,
    requiresInteractivity: false,
    validationChecks: [
      'has_actionable_steps',
      'has_frameworks',
      'professional_tone',
    ],
  },
  
  workbook: {
    type: 'workbook',
    displayName: 'Workbook / Fill-In',
    description: 'Interactive templates with prompts, tables, and checklists',
    mandatory: [
      'Short explanations ONLY',
      'Fill-in prompts with blank lines',
      'Tables and worksheets',
      'Reflection questions',
      'Action step checkboxes',
    ],
    forbidden: [
      'Long essays',
      'Case studies over 150 words',
      'Narrative dominance',
      'Dense prose paragraphs',
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
    requiresCitations: false,
    requiresImages: false,
    requiresCode: false,
    requiresInteractivity: true,
    validationChecks: [
      'has_fill_in_prompts',
      'has_checkboxes',
      'word_count_under_limit',
      'minimal_prose',
    ],
  },
  
  bestseller: {
    type: 'bestseller',
    displayName: 'Bestseller / Trade Book',
    description: 'Narrative-driven with emotional engagement and transformation promise',
    mandatory: [
      'Clear narrative arc',
      'Storytelling, metaphors, case studies',
      'Emotional engagement',
      'Conversational but intelligent tone',
      'Chapter hooks and strong endings',
      'Named principles (memorable concepts)',
    ],
    forbidden: [
      'Academic citations',
      'Section numbering',
      'Lecture-style exposition',
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
    requiresCitations: false,
    requiresImages: false,
    requiresCode: false,
    requiresInteractivity: false,
    validationChecks: [
      'has_hook',
      'has_named_principle',
      'has_takeaways',
      'conversational_tone',
      'no_hedging',
    ],
  },
  
  comic: {
    type: 'comic',
    displayName: 'Comic / Graphic Novel',
    description: 'Visual storytelling with multi-panel structure and dialogue',
    mandatory: [
      'Multi-panel structure (4-6 per chapter)',
      'Visual continuity across panels',
      'Consistent character appearance',
      'EVERY panel MUST include dialogue',
      'Visual descriptions for image generation',
    ],
    forbidden: [
      'Prose paragraphs',
      'Image-only panels',
      'Single image per chapter',
      'Caption-only panels',
    ],
    chapterStructure: [
      'Panel 1: Visual + Dialogue',
      'Panel 2: Visual + Dialogue',
      'Panel 3: Visual + Dialogue',
      'Panel 4: Visual + Dialogue',
      '(Optional) Panels 5-6',
    ],
    requiresCitations: false,
    requiresImages: true,
    requiresCode: false,
    requiresInteractivity: false,
    validationChecks: [
      'has_panels',
      'every_panel_has_dialogue',
      'has_visual_descriptions',
      'panel_count_valid',
    ],
  },
  
  children: {
    type: 'children',
    displayName: "Children's Book",
    description: 'Simple language, visual-first storytelling, age-appropriate content',
    mandatory: [
      'Simple language',
      'Visual-first storytelling',
      'Short sentences',
      'Clear moral or lesson',
      'High image-to-text ratio',
    ],
    forbidden: [
      'Complex abstractions',
      'Academic language',
      'Long paragraphs',
      'Adult themes',
    ],
    chapterStructure: [
      'Scene Setup (1-2 sentences)',
      'Story Beat (with illustration)',
      'Character Action',
      'Lesson / Message',
    ],
    wordLimits: { min: 100, max: 500 },
    requiresCitations: false,
    requiresImages: true,
    requiresCode: false,
    requiresInteractivity: false,
    validationChecks: [
      'simple_language',
      'short_sentences',
      'has_images',
      'age_appropriate',
    ],
  },
  
  technical: {
    type: 'technical',
    displayName: 'Technical / Hands-On Guide',
    description: 'Step-by-step explanations with code blocks and practical exercises',
    mandatory: [
      'Step-by-step explanations',
      'Properly formatted code blocks',
      'Line-by-line indentation',
      'Clear outputs and explanations',
      'Exercises and mini-projects',
    ],
    forbidden: [
      'Storytelling',
      'Motivational language',
      'Vague explanations',
      'Metaphorical titles',
    ],
    chapterStructure: [
      'Learning Objectives',
      'Concept Explanation',
      'Code Examples (40%+ of content)',
      'Exercises',
      'Mini-Project',
    ],
    requiresCitations: false,
    requiresImages: false,
    requiresCode: true,
    requiresInteractivity: false,
    validationChecks: [
      'has_code_blocks',
      'code_properly_indented',
      'has_exercises',
      'no_metaphors',
      'literal_titles',
    ],
  },
  
  reference: {
    type: 'reference',
    displayName: 'Reference / Handbook',
    description: 'Quick reference materials with structured lookup',
    mandatory: [
      'Structured information architecture',
      'Clear categorization',
      'Quick lookup format',
      'Comprehensive coverage',
      'Alphabetical or logical ordering',
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
    requiresCitations: false,
    requiresImages: false,
    requiresCode: false,
    requiresInteractivity: false,
    validationChecks: [
      'structured_format',
      'clear_headings',
      'comprehensive',
    ],
  },
  
  text: {
    type: 'text',
    displayName: 'Standard Text',
    description: 'Traditional book format with flexible structure',
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
    requiresCitations: false,
    requiresImages: false,
    requiresCode: false,
    requiresInteractivity: false,
    validationChecks: [
      'readable',
      'structured',
    ],
  },
};

// ===========================================
// VALIDATION FUNCTIONS
// ===========================================

export interface ContentValidationResult {
  valid: boolean;
  violations: ContentViolation[];
  warnings: string[];
  bookType: BookType;
}

export interface ContentViolation {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  suggestedFix?: string;
}

/**
 * Validate content against book type contract
 */
export function validateContentAgainstBookType(
  content: string,
  bookType: BookType,
  options?: {
    checkTitle?: boolean;
    title?: string;
    checkWordCount?: boolean;
  }
): ContentValidationResult {
  const contract = BOOK_TYPE_CONTRACTS[bookType];
  const violations: ContentViolation[] = [];
  const warnings: string[] = [];
  
  if (!contract) {
    return {
      valid: false,
      violations: [{
        code: 'INVALID_BOOK_TYPE',
        message: `Unknown book type: ${bookType}`,
        severity: 'critical',
      }],
      warnings: [],
      bookType,
    };
  }
  
  // Word count validation (for workbook/children)
  if (options?.checkWordCount && contract.wordLimits) {
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount > contract.wordLimits.max) {
      violations.push({
        code: 'WORD_COUNT_EXCEEDED',
        message: `Content exceeds ${contract.wordLimits.max} word limit (${wordCount} words)`,
        severity: 'high',
        suggestedFix: `Reduce content to under ${contract.wordLimits.max} words`,
      });
    }
    if (wordCount < contract.wordLimits.min) {
      violations.push({
        code: 'WORD_COUNT_INSUFFICIENT',
        message: `Content below ${contract.wordLimits.min} word minimum (${wordCount} words)`,
        severity: 'medium',
      });
    }
  }
  
  // Title validation for academic/technical
  if (options?.checkTitle && options.title && (bookType === 'academic' || bookType === 'technical')) {
    const metaphorPatterns = [
      /alchemist/i, /wizard/i, /journey/i, /dark\s*arts/i, /secrets/i,
      /hidden/i, /forging/i, /zero\s*to\s*hero/i, /ultimate/i, /revolutionary/i,
      /mystical/i, /magic/i, /kingdom/i,
    ];
    
    for (const pattern of metaphorPatterns) {
      if (pattern.test(options.title)) {
        violations.push({
          code: 'METAPHORICAL_TITLE',
          message: `Academic/Technical titles must be literal, not metaphorical`,
          severity: 'high',
          suggestedFix: 'Use descriptive, technical titles like "Introduction to [Topic]" or "Practical Guide to [Topic]"',
        });
        break;
      }
    }
  }
  
  // Book type specific validations
  switch (bookType) {
    case 'comic':
      validateComicContent(content, violations, warnings);
      break;
    case 'workbook':
      validateWorkbookContent(content, violations, warnings);
      break;
    case 'academic':
      validateAcademicContent(content, violations, warnings);
      break;
    case 'technical':
      validateTechnicalContent(content, violations, warnings);
      break;
    case 'bestseller':
      validateBestsellerContent(content, violations, warnings);
      break;
    case 'children':
      validateChildrensContent(content, violations, warnings);
      break;
  }
  
  const hasCritical = violations.some(v => v.severity === 'critical');
  
  return {
    valid: !hasCritical,
    violations,
    warnings,
    bookType,
  };
}

function validateComicContent(content: string, violations: ContentViolation[], warnings: string[]): void {
  // Check for panel structure
  const panelMatches = content.match(/\[PANEL\s*\d+\]/gi) || [];
  if (panelMatches.length < 4) {
    violations.push({
      code: 'INSUFFICIENT_PANELS',
      message: `Comic requires minimum 4 panels, found ${panelMatches.length}`,
      severity: 'critical',
      suggestedFix: 'Add more panels with [PANEL X] markers',
    });
  }
  
  // Check for dialogue
  const dialoguePattern = /-\s*[A-Z][a-z]+(?:_[A-Z][a-z]+)*:\s*["']?[^"'\n]+["']?/g;
  const dialogueMatches = content.match(dialoguePattern) || [];
  if (dialogueMatches.length < panelMatches.length) {
    violations.push({
      code: 'MISSING_DIALOGUE',
      message: 'Every panel MUST include character dialogue',
      severity: 'critical',
    });
  }
  
  // Check for visual descriptions
  const visualPattern = /Visual:/gi;
  const visualMatches = content.match(visualPattern) || [];
  if (visualMatches.length < panelMatches.length * 0.8) {
    warnings.push('Some panels may lack visual descriptions');
  }
}

function validateWorkbookContent(content: string, violations: ContentViolation[], warnings: string[]): void {
  // Check for fill-in prompts
  if (!content.includes('___') && !content.includes('_____')) {
    violations.push({
      code: 'NO_FILL_IN_PROMPTS',
      message: 'Workbook must include fill-in prompts (blank lines)',
      severity: 'high',
    });
  }
  
  // Check for checkboxes
  if (!content.includes('[ ]') && !content.includes('□')) {
    violations.push({
      code: 'NO_CHECKBOXES',
      message: 'Workbook must include action step checkboxes',
      severity: 'high',
    });
  }
  
  // Check for reflection questions
  if (!content.includes('?')) {
    warnings.push('Workbook should include reflection questions');
  }
}

function validateAcademicContent(content: string, violations: ContentViolation[], warnings: string[]): void {
  // Check for citations
  const citationPattern = /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-z]+))?,?\s*\d{4}[a-z]?\)/g;
  const citations = content.match(citationPattern) || [];
  if (citations.length === 0) {
    violations.push({
      code: 'NO_CITATIONS',
      message: 'Academic content must include in-text citations',
      severity: 'critical',
    });
  }
  
  // Check for references section
  if (!/references?|bibliography/i.test(content)) {
    violations.push({
      code: 'NO_REFERENCES_SECTION',
      message: 'Academic content must include a References section',
      severity: 'critical',
    });
  }
  
  // Check for motivational language (forbidden)
  const motivationalPatterns = [
    /you can do it/i, /believe in yourself/i, /let's dive in/i,
    /journey begins/i, /exciting adventure/i,
  ];
  for (const pattern of motivationalPatterns) {
    if (pattern.test(content)) {
      violations.push({
        code: 'MOTIVATIONAL_LANGUAGE',
        message: 'Academic content must not include motivational language',
        severity: 'medium',
      });
      break;
    }
  }
}

function validateTechnicalContent(content: string, violations: ContentViolation[], warnings: string[]): void {
  // Check for code blocks
  const codeBlockPattern = /CODE EXAMPLE|```\w+|    \w+/g;
  const codeBlocks = content.match(codeBlockPattern) || [];
  if (codeBlocks.length === 0) {
    violations.push({
      code: 'NO_CODE_BLOCKS',
      message: 'Technical content must include code examples',
      severity: 'high',
    });
  }
  
  // Check for learning objectives
  if (!/learning\s+objectives?|by the end of this/i.test(content)) {
    warnings.push('Technical content should include learning objectives');
  }
  
  // Check for exercises
  if (!/exercises?|practice|try it yourself/i.test(content)) {
    warnings.push('Technical content should include exercises');
  }
}

function validateBestsellerContent(content: string, violations: ContentViolation[], warnings: string[]): void {
  // Check for hedging language (forbidden)
  const hedgingPatterns = [
    /it could be argued/i, /in some cases/i, /this suggests/i,
    /on the one hand/i, /might potentially/i, /some experts say/i,
  ];
  for (const pattern of hedgingPatterns) {
    if (pattern.test(content)) {
      violations.push({
        code: 'HEDGING_LANGUAGE',
        message: 'Bestseller content must not include hedging language',
        severity: 'medium',
        suggestedFix: 'Use declarative, confident statements',
      });
      break;
    }
  }
  
  // Check for takeaways
  if (!/takeaways?|action\s+steps?|what\s+you.+learned/i.test(content)) {
    warnings.push('Bestseller content should include actionable takeaways');
  }
}

function validateChildrensContent(content: string, violations: ContentViolation[], warnings: string[]): void {
  // Check sentence complexity
  const sentences = content.split(/[.!?]+/);
  const longSentences = sentences.filter(s => s.split(/\s+/).length > 15);
  if (longSentences.length > sentences.length * 0.3) {
    violations.push({
      code: 'COMPLEX_SENTENCES',
      message: "Children's content must use short, simple sentences",
      severity: 'high',
    });
  }
}

// ===========================================
// REGENERATION GOVERNANCE
// ===========================================

export interface RegenerationRequest {
  bookType: BookType;
  originalContent: string;
  editIntent?: string;
}

/**
 * Check if regeneration respects book type contract
 */
export function validateRegenerationRequest(request: RegenerationRequest): {
  allowed: boolean;
  reason?: string;
} {
  const contract = BOOK_TYPE_CONTRACTS[request.bookType];
  
  if (!contract) {
    return { allowed: false, reason: 'Invalid book type' };
  }
  
  // Book type is immutable - regeneration must respect original type
  // This is enforced at the API level
  
  return { allowed: true };
}

/**
 * Get the generation prompt contract for a book type
 */
export function getBookTypePromptContract(bookType: BookType): string {
  const contract = BOOK_TYPE_CONTRACTS[bookType];
  
  if (!contract) {
    return '';
  }
  
  let prompt = `\n=== BOOK TYPE CONTRACT: ${contract.displayName.toUpperCase()} ===\n\n`;
  
  prompt += `MANDATORY REQUIREMENTS:\n`;
  contract.mandatory.forEach(req => {
    prompt += `- ${req}\n`;
  });
  
  prompt += `\nSTRICTLY FORBIDDEN:\n`;
  contract.forbidden.forEach(req => {
    prompt += `- ${req}\n`;
  });
  
  prompt += `\nREQUIRED CHAPTER STRUCTURE:\n`;
  contract.chapterStructure.forEach((section, i) => {
    prompt += `${i + 1}. ${section}\n`;
  });
  
  if (contract.wordLimits) {
    prompt += `\nWORD LIMITS: ${contract.wordLimits.min}-${contract.wordLimits.max} words per chapter\n`;
  }
  
  prompt += `\n=== END BOOK TYPE CONTRACT ===\n`;
  
  return prompt;
}

// ===========================================
// CROSS-TYPE DETECTION (FORBIDDEN)
// ===========================================

export function detectCrossTypeViolation(
  content: string,
  declaredType: BookType
): { hasCrossType: boolean; detectedTypes: BookType[]; message?: string } {
  const detectedTypes: BookType[] = [];
  
  // Academic indicators
  if (/\([A-Z][a-z]+,?\s*\d{4}\)/g.test(content) && declaredType !== 'academic') {
    detectedTypes.push('academic');
  }
  
  // Comic indicators
  if (/\[PANEL\s*\d+\]/gi.test(content) && declaredType !== 'comic') {
    detectedTypes.push('comic');
  }
  
  // Workbook indicators
  if (/_{5,}/.test(content) && /\[\s*\]/.test(content) && declaredType !== 'workbook') {
    detectedTypes.push('workbook');
  }
  
  // Technical indicators (code blocks)
  if (/```\w+[\s\S]+```/.test(content) && declaredType !== 'technical' && declaredType !== 'academic') {
    detectedTypes.push('technical');
  }
  
  const hasCrossType = detectedTypes.length > 0;
  
  return {
    hasCrossType,
    detectedTypes,
    message: hasCrossType 
      ? `Content appears to mix ${declaredType} with ${detectedTypes.join(', ')} elements. Cross-type content is FORBIDDEN.`
      : undefined,
  };
}

// ===========================================
// EXPORT
// ===========================================

export function getBookTypeContract(type: BookType): BookTypeContract | undefined {
  return BOOK_TYPE_CONTRACTS[type];
}

export function getAllBookTypes(): BookType[] {
  return Object.keys(BOOK_TYPE_CONTRACTS) as BookType[];
}

export function isValidBookType(type: string): type is BookType {
  return type in BOOK_TYPE_CONTRACTS;
}
