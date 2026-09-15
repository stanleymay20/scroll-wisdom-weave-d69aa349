/**
 * CANONICAL BOOK-TYPE CONSTITUTION — BTG-1.0
 *
 * This is the single browser/runtime source of truth for ScrollLibrary book
 * types. Contract 3 and Contract 6 consume this table rather than maintaining
 * independent definitions.
 */

export type BookType =
  | 'academic'
  | 'professional'
  | 'workbook'
  | 'bestseller'
  | 'comic'
  | 'children'
  | 'technical'
  | 'reference'
  | 'fiction'
  | 'illustrated'
  | 'text';

export interface BookTypeContract {
  type: BookType;
  displayName: string;
  description: string;
  mandatory: string[];
  forbidden: string[];
  chapterStructure: string[];
  wordLimits?: { min: number; max: number };
  requiresCitations: boolean;
  requiresImages: boolean;
  requiresCode: boolean;
  requiresInteractivity: boolean;
  validationChecks: string[];
}

export const BOOK_TYPE_CONTRACTS: Record<BookType, BookTypeContract> = {
  academic: {
    type: 'academic', displayName: 'Academic Textbook', description: 'Scholarly, evidence-driven textbook content.',
    mandatory: ['Formal academic tone', 'Learning objectives', 'Definitions/frameworks/models', 'In-text citations', 'References section', 'Structured headings'],
    forbidden: ['Fictional storytelling presented as fact', 'Motivational filler', 'Unsupported factual claims', 'Metaphorical titles that obscure subject matter'],
    chapterStructure: ['Learning Objectives', 'Concept Explanation', 'Examples / Case Studies', 'Exercises', 'References'],
    requiresCitations: true, requiresImages: false, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['has_learning_objectives', 'has_citations', 'has_references_section', 'formal_tone'],
  },
  professional: {
    type: 'professional', displayName: 'Professional Guide', description: 'Industry-oriented guidance with frameworks and decisions.',
    mandatory: ['Strategic frameworks', 'Actionable recommendations', 'Decision tools', 'Industry context', 'Professional tone'],
    forbidden: ['Fabricated case studies presented as real', 'Unsupported performance claims', 'Casual filler'],
    chapterStructure: ['Executive Summary', 'Context / Background', 'Framework / Model', 'Implementation Steps', 'Key Takeaways'],
    requiresCitations: false, requiresImages: false, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['has_actionable_steps', 'has_frameworks', 'professional_tone'],
  },
  workbook: {
    type: 'workbook', displayName: 'Workbook / Fill-In', description: 'Interactive exercises, prompts, tables, and checklists.',
    mandatory: ['Short explanations', 'Fill-in prompts', 'Tables/worksheets', 'Reflection questions', 'Action-step checkboxes'],
    forbidden: ['Long essay dominance', 'Narrative dominance', 'Dense uninterrupted prose'],
    chapterStructure: ['Purpose (≤150 words)', 'Key Concepts (≤300 words)', 'Fill-In Prompts', 'Tables / Worksheets', 'Reflection Questions', 'Action Steps'],
    wordLimits: { min: 800, max: 1800 },
    requiresCitations: false, requiresImages: false, requiresCode: false, requiresInteractivity: true,
    validationChecks: ['has_fill_in_prompts', 'has_checkboxes', 'word_count_in_range', 'minimal_prose'],
  },
  bestseller: {
    type: 'bestseller', displayName: 'Bestseller / Trade Book', description: 'Narrative trade nonfiction with memorable principles and takeaways.',
    mandatory: ['Strong hook', 'Narrative or human illustration', 'Named principles', 'Conversational clarity', 'Actionable takeaways'],
    forbidden: ['Dense academic formatting', 'Lecture-style exposition', 'Unnecessary hedging', 'Fabricated factual anecdotes presented as real'],
    chapterStructure: ['Opening Hook', 'Central Idea', 'Human Illustration', 'Named Principle', 'Reader Engagement', 'Actionable Takeaways'],
    requiresCitations: false, requiresImages: false, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['has_hook', 'has_named_principle', 'has_takeaways'],
  },
  comic: {
    type: 'comic', displayName: 'Comic / Graphic Novel', description: 'Panel-based sequential storytelling.',
    mandatory: ['4–6+ panels per chapter', 'Visual description per panel', 'Dialogue per panel', 'Character/style continuity'],
    forbidden: ['Prose-only chapter', 'Image-only panel without narrative purpose', 'Single-panel chapter'],
    chapterStructure: ['Panel 1: Visual + Dialogue', 'Panel 2: Visual + Dialogue', 'Panel 3: Visual + Dialogue', 'Panel 4: Visual + Dialogue', '(Optional) Panels 5+'],
    requiresCitations: false, requiresImages: true, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['has_panels', 'every_panel_has_dialogue', 'has_visual_descriptions', 'panel_count_valid'],
  },
  children: {
    type: 'children', displayName: "Children's Book", description: 'Age-appropriate visual-first storytelling.',
    mandatory: ['Simple language', 'Short sentences', 'Visual-first storytelling', 'Clear lesson/message'],
    forbidden: ['Uncontextualized graphic violence', 'Adult sexual themes', 'Dense academic language', 'Long complex paragraphs'],
    chapterStructure: ['Scene Setup', 'Story Beat with Illustration', 'Character Action', 'Lesson / Message'],
    wordLimits: { min: 100, max: 500 },
    requiresCitations: false, requiresImages: true, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['simple_language', 'short_sentences', 'has_images', 'age_appropriate'],
  },
  technical: {
    type: 'technical', displayName: 'Technical / Hands-On Guide', description: 'Practical technical instruction with executable examples.',
    mandatory: ['Step-by-step explanations', 'Properly formatted code/examples', 'Expected outputs', 'Exercises', 'Mini-projects'],
    forbidden: ['Storytelling that substitutes for technical explanation', 'Vague instructions', 'Metaphorical titles that obscure the topic'],
    chapterStructure: ['Learning Objectives', 'Concept Explanation', 'Code / Technical Examples', 'Exercises', 'Mini-Project'],
    requiresCitations: false, requiresImages: false, requiresCode: true, requiresInteractivity: false,
    validationChecks: ['has_code_blocks', 'has_exercises', 'literal_titles'],
  },
  reference: {
    type: 'reference', displayName: 'Reference / Handbook', description: 'Structured quick-lookup reference material.',
    mandatory: ['Clear categorization', 'Quick lookup format', 'Comprehensive coverage', 'Cross-references'],
    forbidden: ['Narrative dominance', 'Unsupported personal opinions presented as reference fact'],
    chapterStructure: ['Topic Header', 'Definition / Overview', 'Key Points', 'Examples', 'Cross-references'],
    requiresCitations: false, requiresImages: false, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['structured_format', 'clear_headings', 'comprehensive'],
  },
  fiction: {
    type: 'fiction', displayName: 'Fiction / Novel', description: 'Narrative fiction with scenes, characters, and plot progression.',
    mandatory: ['Narrative arc', 'Developed characters', 'Consistent point of view', 'Scene-based chapters', 'Dialogue'],
    forbidden: ['Academic formatting unless narratively intentional', 'Instructional bullet-list dominance'],
    chapterStructure: ['Scene Opening', 'Character Action / Dialogue', 'Conflict Escalation', 'Turning Point', 'Chapter Hook'],
    wordLimits: { min: 2000, max: 6000 },
    requiresCitations: false, requiresImages: false, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['has_dialogue', 'has_scene_structure', 'consistent_pov'],
  },
  illustrated: {
    type: 'illustrated', displayName: 'Illustrated Learning Book', description: 'Text-and-visual learning material governed by Contracts 9–11.',
    mandatory: ['Learning objectives', 'Concept explanation', 'Purposeful visuals', 'Captions/alt text', 'In-text visual references'],
    forbidden: ['Decorative filler visuals', 'Orphan visuals', 'Fabricated chart data presented as empirical evidence'],
    chapterStructure: ['Learning Objectives', 'Concept Explanation', 'Visual Explanation', 'Application / Example', 'Key Takeaways'],
    requiresCitations: false, requiresImages: true, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['has_visuals', 'visuals_referenced', 'visual_metadata_complete'],
  },
  text: {
    type: 'text', displayName: 'Standard Text', description: 'Flexible traditional prose format.',
    mandatory: ['Clear writing', 'Logical flow', 'Proper formatting'], forbidden: [],
    chapterStructure: ['Introduction', 'Main Content', 'Conclusion'],
    requiresCitations: false, requiresImages: false, requiresCode: false, requiresInteractivity: false,
    validationChecks: ['readable', 'structured'],
  },
};

export interface ContentViolation {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  suggestedFix?: string;
}

export interface ContentValidationResult {
  valid: boolean;
  violations: ContentViolation[];
  warnings: string[];
  bookType: BookType;
}

function countWords(content: string): number {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

export function validateContentAgainstBookType(
  content: string,
  bookType: BookType,
  options?: { checkTitle?: boolean; title?: string; checkWordCount?: boolean },
): ContentValidationResult {
  const contract = BOOK_TYPE_CONTRACTS[bookType];
  const violations: ContentViolation[] = [];
  const warnings: string[] = [];
  if (!contract) {
    return { valid: false, violations: [{ code: 'INVALID_BOOK_TYPE', message: `Unknown book type: ${bookType}`, severity: 'critical' }], warnings, bookType };
  }

  if (options?.checkWordCount && contract.wordLimits) {
    const words = countWords(content);
    if (words > contract.wordLimits.max) violations.push({ code: 'WORD_COUNT_EXCEEDED', message: `${contract.displayName} exceeds ${contract.wordLimits.max} words (${words})`, severity: 'high', suggestedFix: `Reduce to ${contract.wordLimits.max} words or fewer` });
    if (words < contract.wordLimits.min) violations.push({ code: 'WORD_COUNT_INSUFFICIENT', message: `${contract.displayName} is below ${contract.wordLimits.min} words (${words})`, severity: 'medium' });
  }

  if (options?.checkTitle && options.title && (bookType === 'academic' || bookType === 'technical')) {
    if (/alchemist|wizard|journey|dark\s*arts|secrets|hidden|forging|zero\s*to\s*hero|mystical|magic|kingdom/i.test(options.title)) {
      violations.push({ code: 'METAPHORICAL_TITLE', message: 'Academic/technical titles must clearly describe the subject.', severity: 'high', suggestedFix: 'Use a literal subject-focused title.' });
    }
  }

  if (bookType === 'academic') {
    if (!/\([A-Z][A-Za-z'’-]+(?:\s+et\s+al\.)?,?\s*\d{4}[a-z]?\)/.test(content)) violations.push({ code: 'NO_CITATIONS', message: 'Academic content must include in-text citations.', severity: 'critical' });
    if (!/\b(references|bibliography)\b/i.test(content)) violations.push({ code: 'NO_REFERENCES_SECTION', message: 'Academic content must include a references section.', severity: 'critical' });
  }

  if (bookType === 'technical') {
    if (!/```[\s\S]*?```/.test(content)) violations.push({ code: 'NO_CODE_BLOCKS', message: 'Technical content must include properly formatted technical/code examples.', severity: 'high' });
    if (!/\b(exercise|practice|mini-project|try it)\b/i.test(content)) warnings.push('Technical content should include exercises or a mini-project.');
  }

  if (bookType === 'workbook') {
    if (!/_{3,}|\.{3,}/.test(content)) violations.push({ code: 'NO_FILL_IN_PROMPTS', message: 'Workbook must include fill-in prompts.', severity: 'high' });
    if (!/\[\s*\]|□/.test(content)) violations.push({ code: 'NO_CHECKBOXES', message: 'Workbook must include action-step checkboxes.', severity: 'high' });
  }

  if (bookType === 'comic') {
    const panels = content.match(/\[PANEL\s*\d+\]/gi) || [];
    if (panels.length < 4) violations.push({ code: 'INSUFFICIENT_PANELS', message: `Comic requires at least 4 panels; found ${panels.length}.`, severity: 'critical' });
    const dialogue = content.match(/[A-Z][A-Z0-9_\s-]{1,30}:\s*["“][^"”\n]+["”]/g) || [];
    if (panels.length && dialogue.length < panels.length) violations.push({ code: 'MISSING_DIALOGUE', message: 'Every comic panel must include dialogue.', severity: 'critical' });
  }

  if (bookType === 'children') {
    const sentences = content.split(/[.!?]+/).map(sentence => sentence.trim()).filter(Boolean);
    const long = sentences.filter(sentence => countWords(sentence) > 15).length;
    if (sentences.length && long / sentences.length > 0.3) violations.push({ code: 'COMPLEX_SENTENCES', message: "Children's content contains too many long sentences.", severity: 'high' });
  }

  if (bookType === 'bestseller' && /it could be argued|might potentially|some experts say/i.test(content)) {
    warnings.push('Trade-book prose contains avoidable hedging.');
  }

  if (bookType === 'fiction' && !/["“][^"”\n]+["”]/.test(content)) warnings.push('Fiction chapter contains no dialogue.');

  // Contracts 9–11 perform the authoritative visual audit. Here we only block a
  // plainly text-only payload for visual-mandatory book types.
  if ((bookType === 'illustrated' || bookType === 'children' || bookType === 'comic') && !/!\[[^\]]*\]\([^\)]+\)|\[PANEL\s*\d+\]|\b(Figure|Diagram|Chart)\s+\d+/i.test(content)) {
    warnings.push(`${contract.displayName} requires visual evidence; Contract 9 must pass before publication.`);
  }

  const crossType = detectCrossTypeViolation(content, bookType);
  if (crossType.hasCrossType) {
    violations.push({ code: 'CROSS_TYPE_CONTAMINATION', message: crossType.message || 'Cross-type contamination detected.', severity: 'critical' });
  }

  return {
    valid: !violations.some(violation => violation.severity === 'critical' || violation.severity === 'high'),
    violations,
    warnings,
    bookType,
  };
}

export interface RegenerationRequest { bookType: BookType; originalContent: string; editIntent?: string; }
export function validateRegenerationRequest(request: RegenerationRequest): { allowed: boolean; reason?: string } {
  return BOOK_TYPE_CONTRACTS[request.bookType] ? { allowed: true } : { allowed: false, reason: 'Invalid book type' };
}

export function getBookTypePromptContract(bookType: BookType): string {
  const contract = BOOK_TYPE_CONTRACTS[bookType];
  if (!contract) return '';
  return `\n=== BOOK TYPE CONTRACT ${bookType.toUpperCase()} / BTG-1.0 ===\nMANDATORY:\n${contract.mandatory.map(item => `- ${item}`).join('\n')}\n\nFORBIDDEN:\n${contract.forbidden.map(item => `- ${item}`).join('\n')}\n\nSTRUCTURE:\n${contract.chapterStructure.map((item, index) => `${index + 1}. ${item}`).join('\n')}${contract.wordLimits ? `\n\nWORD RANGE: ${contract.wordLimits.min}-${contract.wordLimits.max}` : ''}\n=== END BOOK TYPE CONTRACT ===\n`;
}

export function detectCrossTypeViolation(
  content: string,
  declaredType: BookType,
): { hasCrossType: boolean; detectedTypes: BookType[]; message?: string } {
  const detectedTypes: BookType[] = [];
  if (/\([A-Z][A-Za-z'’-]+,?\s*\d{4}\)/.test(content) && !['academic', 'technical', 'reference'].includes(declaredType)) detectedTypes.push('academic');
  if (/\[PANEL\s*\d+\]/i.test(content) && !['comic', 'children'].includes(declaredType)) detectedTypes.push('comic');
  if (/_{5,}/.test(content) && /\[\s*\]/.test(content) && declaredType !== 'workbook') detectedTypes.push('workbook');
  if (/```\w*[\s\S]*?```/.test(content) && !['technical', 'academic', 'reference'].includes(declaredType)) detectedTypes.push('technical');
  const unique = [...new Set(detectedTypes)];
  return {
    hasCrossType: unique.length > 0,
    detectedTypes: unique,
    message: unique.length ? `${BOOK_TYPE_CONTRACTS[declaredType].displayName} contains governed elements associated with: ${unique.join(', ')}.` : undefined,
  };
}

export function getBookTypeContract(type: BookType): BookTypeContract | undefined { return BOOK_TYPE_CONTRACTS[type]; }
export function getAllBookTypes(): BookType[] { return Object.keys(BOOK_TYPE_CONTRACTS) as BookType[]; }
export function isValidBookType(type: string): type is BookType { return Object.prototype.hasOwnProperty.call(BOOK_TYPE_CONTRACTS, type); }
