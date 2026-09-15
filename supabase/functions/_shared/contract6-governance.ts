/**
 * CONTRACT 6 — EDGE BOOK-TYPE GOVERNANCE SNAPSHOT (BTG-1.0)
 *
 * This is the Edge-runtime projection of the canonical browser constitution in
 * `src/lib/bookTypeGovernance.ts`. Keep only generation/validation data here;
 * CI parity tests guard the type keys and hard word ranges against drift.
 */

export type GovernedBookType =
  | 'academic' | 'professional' | 'workbook' | 'bestseller' | 'comic'
  | 'children' | 'technical' | 'reference' | 'fiction' | 'illustrated' | 'text';

interface EdgeBookTypeSpec {
  displayName: string;
  identity: string;
  mandatory: string[];
  forbidden: string[];
  structure: string[];
  wordLimits?: { min: number; max: number };
}

export const EDGE_BOOK_TYPE_SPECS: Record<GovernedBookType, EdgeBookTypeSpec> = {
  academic: {
    displayName: 'Academic Textbook', identity: 'Lecturer · Researcher',
    mandatory: ['Formal academic tone', 'Learning objectives', 'Definitions/frameworks/models', 'In-text citations', 'References section', 'Structured headings'],
    forbidden: ['Fictional storytelling presented as fact', 'Motivational filler', 'Unsupported factual claims', 'Metaphorical titles that obscure subject matter'],
    structure: ['Learning Objectives', 'Concept Explanation', 'Examples / Case Studies', 'Exercises', 'References'],
  },
  professional: {
    displayName: 'Professional Guide', identity: 'Consultant · Strategist',
    mandatory: ['Strategic frameworks', 'Actionable recommendations', 'Decision tools', 'Industry context', 'Professional tone'],
    forbidden: ['Fabricated case studies presented as real', 'Unsupported performance claims', 'Casual filler'],
    structure: ['Executive Summary', 'Context / Background', 'Framework / Model', 'Implementation Steps', 'Key Takeaways'],
  },
  workbook: {
    displayName: 'Workbook / Fill-In', identity: 'Instructional Designer',
    mandatory: ['Short explanations', 'Fill-in prompts', 'Tables/worksheets', 'Reflection questions', 'Action-step checkboxes'],
    forbidden: ['Long essay dominance', 'Narrative dominance', 'Dense uninterrupted prose'],
    structure: ['Purpose (≤150 words)', 'Key Concepts (≤300 words)', 'Fill-In Prompts', 'Tables / Worksheets', 'Reflection Questions', 'Action Steps'],
    wordLimits: { min: 800, max: 1800 },
  },
  bestseller: {
    displayName: 'Bestseller / Trade Book', identity: 'Author · Storyteller',
    mandatory: ['Strong hook', 'Narrative or human illustration', 'Named principles', 'Conversational clarity', 'Actionable takeaways'],
    forbidden: ['Dense academic formatting', 'Lecture-style exposition', 'Unnecessary hedging', 'Fabricated factual anecdotes presented as real'],
    structure: ['Opening Hook', 'Central Idea', 'Human Illustration', 'Named Principle', 'Reader Engagement', 'Actionable Takeaways'],
  },
  comic: {
    displayName: 'Comic / Graphic Novel', identity: 'Screenwriter · Art Director',
    mandatory: ['4–6+ panels per chapter', 'Visual description per panel', 'Dialogue per panel', 'Character/style continuity'],
    forbidden: ['Prose-only chapter', 'Image-only panel without narrative purpose', 'Single-panel chapter'],
    structure: ['Panel 1: Visual + Dialogue', 'Panel 2: Visual + Dialogue', 'Panel 3: Visual + Dialogue', 'Panel 4: Visual + Dialogue', '(Optional) Panels 5+'],
  },
  children: {
    displayName: "Children's Book", identity: 'Educator · Child Development Specialist',
    mandatory: ['Simple language', 'Short sentences', 'Visual-first storytelling', 'Clear lesson/message'],
    forbidden: ['Uncontextualized graphic violence', 'Adult sexual themes', 'Dense academic language', 'Long complex paragraphs'],
    structure: ['Scene Setup', 'Story Beat with Illustration', 'Character Action', 'Lesson / Message'],
    wordLimits: { min: 100, max: 500 },
  },
  technical: {
    displayName: 'Technical / Hands-On Guide', identity: 'Engineer · Instructor',
    mandatory: ['Step-by-step explanations', 'Properly formatted code/examples', 'Expected outputs', 'Exercises', 'Mini-projects'],
    forbidden: ['Storytelling that substitutes for technical explanation', 'Vague instructions', 'Metaphorical titles that obscure the topic'],
    structure: ['Learning Objectives', 'Concept Explanation', 'Code / Technical Examples', 'Exercises', 'Mini-Project'],
  },
  reference: {
    displayName: 'Reference / Handbook', identity: 'Subject Matter Expert · Editor',
    mandatory: ['Clear categorization', 'Quick lookup format', 'Comprehensive coverage', 'Cross-references'],
    forbidden: ['Narrative dominance', 'Unsupported personal opinions presented as reference fact'],
    structure: ['Topic Header', 'Definition / Overview', 'Key Points', 'Examples', 'Cross-references'],
  },
  fiction: {
    displayName: 'Fiction / Novel', identity: 'Novelist · Storyteller',
    mandatory: ['Narrative arc', 'Developed characters', 'Consistent point of view', 'Scene-based chapters', 'Dialogue'],
    forbidden: ['Academic formatting unless narratively intentional', 'Instructional bullet-list dominance'],
    structure: ['Scene Opening', 'Character Action / Dialogue', 'Conflict Escalation', 'Turning Point', 'Chapter Hook'],
    wordLimits: { min: 2000, max: 6000 },
  },
  illustrated: {
    displayName: 'Illustrated Learning Book', identity: 'Instructional Designer · Art Director',
    mandatory: ['Learning objectives', 'Concept explanation', 'Purposeful visuals', 'Captions/alt text', 'In-text visual references'],
    forbidden: ['Decorative filler visuals', 'Orphan visuals', 'Fabricated chart data presented as empirical evidence'],
    structure: ['Learning Objectives', 'Concept Explanation', 'Visual Explanation', 'Application / Example', 'Key Takeaways'],
  },
  text: {
    displayName: 'Standard Text', identity: 'Author',
    mandatory: ['Clear writing', 'Logical flow', 'Proper formatting'], forbidden: [],
    structure: ['Introduction', 'Main Content', 'Conclusion'],
  },
};

export const GENERATOR_IDENTITIES = Object.fromEntries(
  Object.entries(EDGE_BOOK_TYPE_SPECS).map(([type, spec]) => [type, spec.identity]),
) as Record<GovernedBookType, string>;

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

function countWords(content: string): number {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

export function isValidBookType(type: string): type is GovernedBookType {
  return Object.prototype.hasOwnProperty.call(EDGE_BOOK_TYPE_SPECS, type);
}

export function validateContract6Content(
  content: string,
  bookType: GovernedBookType,
  title?: string,
): Contract6ValidationResult {
  const violations: Contract6Violation[] = [];
  const spec = EDGE_BOOK_TYPE_SPECS[bookType];
  if (!spec) {
    return { valid: false, shouldRegenerate: false, violations: [{ code: 'UNKNOWN_BOOK_TYPE', message: `Unknown book type: ${bookType}`, severity: 'critical', shouldRegenerate: false }] };
  }

  if (spec.wordLimits) {
    const words = countWords(content);
    if (words > spec.wordLimits.max) violations.push({ code: 'WORD_COUNT_EXCEEDED', message: `${spec.displayName} exceeds ${spec.wordLimits.max} words (${words})`, severity: 'high', shouldRegenerate: true });
    if (words < spec.wordLimits.min) violations.push({ code: 'WORD_COUNT_INSUFFICIENT', message: `${spec.displayName} is below ${spec.wordLimits.min} words (${words})`, severity: 'medium', shouldRegenerate: false });
  }

  if ((bookType === 'academic' || bookType === 'technical') && title && /alchemist|wizard|journey|dark\s*arts|secrets|hidden|forging|zero\s*to\s*hero|mystical|magic|kingdom/i.test(title)) {
    violations.push({ code: 'METAPHORICAL_TITLE', message: 'Academic/technical titles must clearly describe the subject.', severity: 'high', shouldRegenerate: true });
  }

  if (bookType === 'academic') {
    if (!/\([A-Z][A-Za-z'’-]+(?:\s+et\s+al\.)?,?\s*\d{4}[a-z]?\)/.test(content)) violations.push({ code: 'NO_CITATIONS', message: 'Academic content must include in-text citations.', severity: 'critical', shouldRegenerate: true });
    if (!/\b(references|bibliography)\b/i.test(content)) violations.push({ code: 'NO_REFERENCES_SECTION', message: 'Academic content must include a references section.', severity: 'critical', shouldRegenerate: true });
  }
  if (bookType === 'technical' && !/```[\s\S]*?```/.test(content)) violations.push({ code: 'NO_CODE_BLOCKS', message: 'Technical content must include properly formatted technical/code examples.', severity: 'high', shouldRegenerate: true });
  if (bookType === 'workbook') {
    if (!/_{3,}|\.{3,}/.test(content)) violations.push({ code: 'NO_FILL_IN_PROMPTS', message: 'Workbook must include fill-in prompts.', severity: 'high', shouldRegenerate: true });
    if (!/\[\s*\]|□/.test(content)) violations.push({ code: 'NO_CHECKBOXES', message: 'Workbook must include action-step checkboxes.', severity: 'high', shouldRegenerate: true });
  }
  if (bookType === 'comic') {
    const panels = content.match(/\[PANEL\s*\d+\]/gi) || [];
    if (panels.length < 4) violations.push({ code: 'INSUFFICIENT_PANELS', message: `Comic requires at least 4 panels; found ${panels.length}.`, severity: 'critical', shouldRegenerate: true });
  }
  if (bookType === 'children') {
    const sentences = content.split(/[.!?]+/).map(sentence => sentence.trim()).filter(Boolean);
    const long = sentences.filter(sentence => countWords(sentence) > 15).length;
    if (sentences.length && long / sentences.length > 0.3) violations.push({ code: 'COMPLEX_SENTENCES', message: "Children's content contains too many long sentences.", severity: 'high', shouldRegenerate: true });
  }

  // Shared cross-type indicators. Match the canonical browser constitution.
  if (/\([A-Z][A-Za-z'’-]+,?\s*\d{4}\)/.test(content) && !['academic', 'technical', 'reference'].includes(bookType)) {
    violations.push({ code: 'CROSS_TYPE_ACADEMIC', message: `${spec.displayName} contains academic-citation formatting governed by another type.`, severity: 'critical', shouldRegenerate: true });
  }
  if (/\[PANEL\s*\d+\]/i.test(content) && !['comic', 'children'].includes(bookType)) {
    violations.push({ code: 'CROSS_TYPE_COMIC', message: `${spec.displayName} contains comic panel formatting governed by another type.`, severity: 'critical', shouldRegenerate: true });
  }
  if (/_{5,}/.test(content) && /\[\s*\]/.test(content) && bookType !== 'workbook') {
    violations.push({ code: 'CROSS_TYPE_WORKBOOK', message: `${spec.displayName} contains workbook interaction markers.`, severity: 'critical', shouldRegenerate: true });
  }

  const blocking = violations.some(violation => violation.severity === 'critical' || violation.severity === 'high');
  return {
    valid: !blocking,
    violations,
    shouldRegenerate: violations.some(violation => violation.shouldRegenerate && (violation.severity === 'critical' || violation.severity === 'high')),
    userMessage: violations[0]?.message,
  };
}

export function getContract6SystemPrompt(bookType: GovernedBookType): string {
  const spec = EDGE_BOOK_TYPE_SPECS[bookType];
  if (!spec) return '';
  return `\n=== BOOK TYPE CONTRACT ${bookType.toUpperCase()} / BTG-1.0 ===\nROLE: ${spec.identity}\n\nMANDATORY:\n${spec.mandatory.map(item => `- ${item}`).join('\n')}\n\nFORBIDDEN:\n${spec.forbidden.map(item => `- ${item}`).join('\n')}\n\nSTRUCTURE:\n${spec.structure.map((item, index) => `${index + 1}. ${item}`).join('\n')}${spec.wordLimits ? `\n\nWORD RANGE: ${spec.wordLimits.min}-${spec.wordLimits.max}` : ''}\n=== END BOOK TYPE CONTRACT ===\n`;
}

export function buildContract6EnforcedPrompt(
  bookType: GovernedBookType,
  basePrompt: string,
  language: string,
): string {
  return `CONTRACT 6 — BOOK TYPE GOVERNANCE (HARD-ENFORCED)\nStatus: BTG-1.0\n${getContract6SystemPrompt(bookType)}\nBOOK TYPE IS IMMUTABLE DURING REGENERATION.\nLANGUAGE: ${language}\n\n${basePrompt}\n\nFAILURE BEHAVIOR: violating output is invalid and must not be committed.`;
}
