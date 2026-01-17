/**
 * CONTRACT 6 — BOOK TYPE GOVERNANCE & CONTENT FIDELITY
 * Supabase Edge Function Module
 * Status: CORE · HARD-ENFORCED
 * 
 * Once a book type is selected, the AI is no longer "creative."
 * It becomes a governed author bound by strict rules.
 */

// ===========================================
// RULE 6.1 — TYPE LOCK (IMMUTABLE)
// ===========================================

export type GovernedBookType = 
  | 'academic'
  | 'professional'
  | 'workbook'
  | 'bestseller'
  | 'comic'
  | 'children'
  | 'technical'
  | 'reference'
  | 'text';

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
// CONTRACT 6 SYSTEM PROMPT ADDITIONS
// ===========================================

export const CONTRACT_6_ACADEMIC_TECHNICAL = `
=== CONTRACT 6 — ACADEMIC/TECHNICAL GOVERNANCE ===

YOU ARE: ${GENERATOR_IDENTITIES.academic}

MANDATORY ELEMENTS:
- Formal academic tone with scholarly language
- Clear learning objectives at chapter start
- Definitions, frameworks, models with precision
- In-text citations (APA/Harvard format required)
- Neutral, evidence-based language ONLY
- Structured headings (1.1, 1.2, etc.)
- References section at chapter end

STRICTLY FORBIDDEN:
❌ Stories, fictional scenarios, CEO narratives
❌ Emotional hooks or conversational tone
❌ First-person persuasion ("I believe", "You should")
❌ Metaphorical titles ("The Alchemy of...", "Journey to...")
❌ Motivational language ("You can do it!", "Believe in yourself")
❌ AI-sounding transitions ("Let's dive in", "In this chapter we explore")

VIOLATION DETECTION:
If content contains patterns like:
- "Sarah, a startup CEO..."
- "The boardroom was tense..."
- "Imagine yourself..."
- "Once upon a time..."
→ IMMEDIATE REJECTION with code: ACADEMIC_TONE_VIOLATION

Output must pass academic scrutiny. Would a professor approve? If not, REWRITE.

=== END CONTRACT 6 ACADEMIC ===
`;

export const CONTRACT_6_TECHNICAL = `
=== CONTRACT 6 — TECHNICAL GUIDE GOVERNANCE ===

YOU ARE: ${GENERATOR_IDENTITIES.technical}

MANDATORY ELEMENTS:
- Step-by-step explanations with precision
- Code blocks comprising ≥40% of content
- Explicit outputs and expected results
- Exercises and practical tasks
- Learning objectives per chapter
- Literal, descriptive titles

STRICTLY FORBIDDEN:
❌ Storytelling of any kind
❌ Metaphors ("journey", "alchemy", "hero", "wizard", "secrets")
❌ Fictional characters (Sarah, John, any narrative personas)
❌ Narrative hooks or dramatic openings
❌ Motivational language

VIOLATION DETECTION:
If content contains:
- Character names in examples (use "the user", "the developer")
- Story-like progression
- Metaphorical language
→ IMMEDIATE REJECTION with code: TECHNICAL_STORYTELLING_VIOLATION

=== END CONTRACT 6 TECHNICAL ===
`;

export const CONTRACT_6_BESTSELLER = `
=== CONTRACT 6 — BESTSELLER GOVERNANCE ===

YOU ARE: ${GENERATOR_IDENTITIES.bestseller}

MANDATORY ELEMENTS:
- Clear narrative arc
- Storytelling, metaphors, case studies
- Emotional engagement
- Conversational but intelligent tone
- Strong chapter hooks and endings
- Named principles (memorable concepts)
- Actionable takeaways

STRICTLY FORBIDDEN:
❌ Academic formatting and citations
❌ Section numbering (1.1, 1.2)
❌ Lecture-style exposition
❌ Hedging language ("it could be argued", "some experts say")

=== END CONTRACT 6 BESTSELLER ===
`;

export const CONTRACT_6_WORKBOOK = `
=== CONTRACT 6 — WORKBOOK GOVERNANCE ===

YOU ARE: ${GENERATOR_IDENTITIES.workbook}

HARD LIMITS:
- 1,200–1,800 words per chapter MAXIMUM
- 70%+ interactive content, ≤30% explanation
- NO essays, NO long narratives

REQUIRED STRUCTURE:
1. Purpose (≤150 words)
2. Key Concepts (≤300 words, numbered points)
3. Fill-In Prompts (with blank lines: ____________)
4. Tables/Worksheets (labeled format)
5. Reflection Questions (without answers)
6. Action Steps (with checkboxes: [ ])

STRICTLY FORBIDDEN:
❌ Long essays or prose
❌ Storytelling
❌ Content exceeding 1800 words

=== END CONTRACT 6 WORKBOOK ===
`;

export const CONTRACT_6_COMIC = `
=== CONTRACT 6 — COMIC GOVERNANCE ===

YOU ARE: ${GENERATOR_IDENTITIES.comic}

PANEL STRUCTURE (NON-NEGOTIABLE):
- Each chapter MUST have 4–6 panels
- Each panel MUST have: visual description + dialogue
- NO caption-only panels
- NO visual-only panels

DIALOGUE CONTRACT:
- EVERY panel MUST include character dialogue
- Format: CHARACTER_NAME: "Spoken dialogue text"
- Narration alone is NOT allowed
- If ANY panel lacks dialogue → ENTIRE CHAPTER INVALID

STRICTLY FORBIDDEN:
❌ Prose paragraphs
❌ Image-only panels
❌ Single-panel chapters

=== END CONTRACT 6 COMIC ===
`;

export const CONTRACT_6_CHILDREN = `
=== CONTRACT 6 — CHILDREN'S BOOK GOVERNANCE ===

YOU ARE: ${GENERATOR_IDENTITIES.children}

MANDATORY ELEMENTS:
- Simple sentences (age-appropriate)
- Visual-first storytelling
- Clear moral or lesson
- High image-to-text ratio
- 50-500 words per chapter maximum

STRICTLY FORBIDDEN:
❌ Complex abstractions
❌ Adult themes
❌ Violence, death, or mature content
❌ Long paragraphs

=== END CONTRACT 6 CHILDREN ===
`;

// ===========================================
// VALIDATION FUNCTIONS
// ===========================================

export interface Contract6Violation {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  shouldRegenerate: boolean;
}

export interface Contract6ValidationResult {
  valid: boolean;
  violations: Contract6Violation[];
  shouldRegenerate: boolean;
  userMessage?: string;
}

/**
 * Validate content against Contract 6 rules
 */
export function validateContract6Content(
  content: string,
  bookType: GovernedBookType,
  title?: string
): Contract6ValidationResult {
  const violations: Contract6Violation[] = [];
  
  // Story markers that are forbidden in technical/academic content
  const storyMarkers = [
    /sarah,?\s+(a|the)\s+(startup\s+)?ceo/i,
    /john,?\s+(a|the)\s+manager/i,
    /^\s*"[A-Z][^"]+"\s+said\s+/m,
    /walked\s+into\s+(the|a)\s+(room|office|boardroom)/i,
    /the\s+(boardroom|office)\s+was\s+tense/i,
    /once\s+upon\s+a\s+time/i,
    /imagine\s+yourself/i,
    /let\s+me\s+tell\s+you\s+a\s+story/i,
  ];
  
  // Metaphor patterns forbidden in academic/technical
  const metaphorPatterns = [
    /alchemist/i, /wizard/i, /journey/i, /dark\s*arts/i,
    /secrets/i, /hidden/i, /forging/i, /mystical/i,
    /magic/i, /kingdom/i, /adventure/i, /quest/i,
    /zero\s*to\s*hero/i, /ultimate/i, /revolutionary/i,
  ];
  
  // Academic/Technical validation
  if (bookType === 'academic' || bookType === 'technical') {
    // Check for story markers
    for (const pattern of storyMarkers) {
      if (pattern.test(content)) {
        violations.push({
          code: bookType === 'academic' ? 'ACADEMIC_TONE_VIOLATION' : 'TECHNICAL_STORYTELLING_VIOLATION',
          message: `This chapter included storytelling, which is FORBIDDEN for ${bookType === 'academic' ? 'Academic Textbooks' : 'Technical Guides'}. Regenerating...`,
          severity: 'critical',
          shouldRegenerate: true,
        });
        break;
      }
    }
    
    // Check title for metaphors
    if (title) {
      for (const pattern of metaphorPatterns) {
        if (pattern.test(title)) {
          violations.push({
            code: 'METAPHORICAL_TITLE',
            message: `Academic/Technical titles must be literal, not metaphorical. "${title}" uses forbidden metaphors.`,
            severity: 'critical',
            shouldRegenerate: true,
          });
          break;
        }
      }
    }
    
    // Check for conversational language
    const conversationalPatterns = [
      /let's\s+dive\s+in/i,
      /you\s+can\s+do\s+it/i,
      /believe\s+in\s+yourself/i,
      /exciting\s+adventure/i,
      /hero's\s+journey/i,
    ];
    
    for (const pattern of conversationalPatterns) {
      if (pattern.test(content)) {
        violations.push({
          code: 'INFORMAL_TONE_VIOLATION',
          message: `Content contains conversational language forbidden in ${bookType} books.`,
          severity: 'high',
          shouldRegenerate: true,
        });
        break;
      }
    }
  }
  
  // Workbook validation
  if (bookType === 'workbook') {
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount > 1800) {
      violations.push({
        code: 'WORKBOOK_TOO_LONG',
        message: `Workbook exceeds 1800 word limit (${wordCount} words). Regenerating with condensed content...`,
        severity: 'critical',
        shouldRegenerate: true,
      });
    }
    
    // Check for fill-in prompts
    if (!content.includes('___') && !content.includes('[ ]')) {
      violations.push({
        code: 'WORKBOOK_MISSING_INTERACTIVITY',
        message: 'Workbook must include fill-in prompts (___) and checkboxes ([ ]). Adding interactive elements...',
        severity: 'high',
        shouldRegenerate: true,
      });
    }
  }
  
  // Comic validation
  if (bookType === 'comic') {
    const panelMatches = content.match(/\[PANEL\s*\d+\]/gi) || [];
    if (panelMatches.length < 4) {
      violations.push({
        code: 'COMIC_INSUFFICIENT_PANELS',
        message: `Comic requires minimum 4 panels, found ${panelMatches.length}. Regenerating with proper panel structure...`,
        severity: 'critical',
        shouldRegenerate: true,
      });
    }
    
    // Check for prose-only content
    if (!content.includes('[PANEL') && !content.includes('Visual:')) {
      violations.push({
        code: 'COMIC_PROSE_VIOLATION',
        message: 'Comics must use panel structure with dialogue, not prose paragraphs. Regenerating...',
        severity: 'critical',
        shouldRegenerate: true,
      });
    }
  }
  
  // Children's book validation
  if (bookType === 'children') {
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount > 500) {
      violations.push({
        code: 'CHILDREN_TOO_LONG',
        message: `Children's book chapter exceeds 500 word limit (${wordCount} words). Simplifying...`,
        severity: 'high',
        shouldRegenerate: true,
      });
    }
    
    // Check for inappropriate content
    const inappropriatePatterns = [/death|murder|blood|violence|hate|kill/i];
    for (const pattern of inappropriatePatterns) {
      if (pattern.test(content)) {
        violations.push({
          code: 'CHILDREN_INAPPROPRIATE_CONTENT',
          message: 'Content contains themes inappropriate for children. Regenerating with age-appropriate content...',
          severity: 'critical',
          shouldRegenerate: true,
        });
        break;
      }
    }
  }
  
  const hasCritical = violations.some(v => v.severity === 'critical');
  
  return {
    valid: violations.length === 0,
    violations,
    shouldRegenerate: hasCritical,
    userMessage: violations.length > 0 ? violations[0].message : undefined,
  };
}

/**
 * Get Contract 6 system prompt addition for a book type
 */
export function getContract6SystemPrompt(bookType: GovernedBookType): string {
  switch (bookType) {
    case 'academic':
      return CONTRACT_6_ACADEMIC_TECHNICAL;
    case 'technical':
      return CONTRACT_6_TECHNICAL;
    case 'bestseller':
      return CONTRACT_6_BESTSELLER;
    case 'workbook':
      return CONTRACT_6_WORKBOOK;
    case 'comic':
      return CONTRACT_6_COMIC;
    case 'children':
      return CONTRACT_6_CHILDREN;
    case 'professional':
      return `
=== CONTRACT 6 — PROFESSIONAL GUIDE GOVERNANCE ===
YOU ARE: ${GENERATOR_IDENTITIES.professional}

MANDATORY: Strategic frameworks, actionable recommendations, decision tools, professional tone.
FORBIDDEN: Excessive academic citations, personal anecdotes, informal language.
=== END CONTRACT 6 ===
`;
    case 'reference':
      return `
=== CONTRACT 6 — REFERENCE HANDBOOK GOVERNANCE ===
YOU ARE: ${GENERATOR_IDENTITIES.reference}

MANDATORY: Structured information, clear categorization, quick lookup format, comprehensive coverage.
FORBIDDEN: Narrative flow, storytelling, personal opinions.
=== END CONTRACT 6 ===
`;
    default:
      return '';
  }
}

/**
 * Build complete system prompt with Contract 6 enforcement
 */
export function buildContract6EnforcedPrompt(
  bookType: GovernedBookType,
  basePrompt: string,
  language: string
): string {
  const identity = GENERATOR_IDENTITIES[bookType];
  const contract6Addition = getContract6SystemPrompt(bookType);
  
  return `
CONTRACT 6 — BOOK TYPE GOVERNANCE (HARD-ENFORCED)
Status: CORE · NON-NEGOTIABLE

SELECTED BOOK TYPE: ${bookType.toUpperCase()}
GENERATOR IDENTITY: ${identity}

${contract6Addition}

RULE 6.1 — TYPE LOCK:
Book type is IMMUTABLE. You cannot switch roles or styles mid-book.
If regenerating, you MUST maintain the same book type rules.

RULE 6.2 — CROSS-TYPE CONTAMINATION DETECTION:
Before saving content, the system will check for elements from other book types.
If detected, content will be REJECTED and regenerated.

RULE 6.5 — TRANSPARENCY:
If content violates Contract 6, users see clear reasons:
"This chapter included [violation], which is forbidden for [BookType]. Regenerating..."

LANGUAGE: All content must be written in ${language}.

${basePrompt}

FAILURE BEHAVIOR:
If ANY Contract 6 rule is violated:
• DO NOT partially comply
• STOP and regenerate with correct structure
• Quality > Speed. Publishability > Completion.
`;
}

export function isValidBookType(type: string): type is GovernedBookType {
  const validTypes: GovernedBookType[] = [
    'academic', 'professional', 'workbook', 'bestseller',
    'comic', 'children', 'technical', 'reference', 'text'
  ];
  return validTypes.includes(type as GovernedBookType);
}

export function getGeneratorIdentity(type: GovernedBookType): string {
  return GENERATOR_IDENTITIES[type] || GENERATOR_IDENTITIES.text;
}
