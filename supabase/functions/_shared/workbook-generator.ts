// ===========================================
// SCROLLLIBRARY WORKBOOK GENERATOR
// Fill-In Interactive Learning System
// ===========================================

// ============================================
// TYPES & INTERFACES
// ============================================

export interface WorkbookChapter {
  title: string;
  sections: WorkbookSection[];
  wordCount: number;
  interactiveElementCount: number;
}

export interface WorkbookSection {
  type: SectionType;
  title: string;
  content: string;
  wordLimit: number;
}

export type SectionType = 
  | 'purpose'
  | 'concepts' 
  | 'prompts'
  | 'tables'
  | 'reflection'
  | 'action';

export interface FillInPrompt {
  promptText: string;
  blankLength: number;
  hint?: string;
}

export interface ActionItem {
  text: string;
  completed: boolean;
}

// ============================================
// WORKBOOK STRUCTURE LIMITS
// ============================================

export const WORKBOOK_LIMITS = {
  maxWordsPerChapter: 1800,
  minWordsPerChapter: 800,
  maxExplanationWords: 450, // 30% of 1500
  sectionWordLimits: {
    purpose: 150,
    concepts: 300,
    prompts: 0, // Prompts are interactive, not prose
    tables: 0,  // Tables don't count toward word limit
    reflection: 200,
    action: 100,
  } as Record<SectionType, number>,
};

// ============================================
// MANDATORY CHAPTER SKELETON
// ============================================

export const WORKBOOK_SKELETON = `
## Purpose
[≤150 words: Brief statement of what this chapter helps achieve]

---

## Key Concepts
[≤300 words: Core ideas presented in bullet points or short paragraphs]

---

## Your Turn: Fill-In Prompts
[Main interactive content - fill-in blanks, writing prompts, exercises]

### Prompt 1: _____________
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

### Prompt 2: _____________
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

### Prompt 3: _____________
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________

---

## Worksheets & Tables
[Tables for planning, tracking, organizing]

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
|          |          |          |
|          |          |          |
|          |          |          |

---

## Reflection Questions
[Questions to think about - no answers provided]

1. ________________________________________________________________?
2. ________________________________________________________________?
3. ________________________________________________________________?

---

## Action Steps
[Checkboxes for concrete next steps]

- [ ] ________________________________________________________________
- [ ] ________________________________________________________________
- [ ] ________________________________________________________________
- [ ] ________________________________________________________________
- [ ] ________________________________________________________________
`;

// ============================================
// WORKBOOK GENERATION PROMPTS
// ============================================

// ===========================================
// FORMATTING CONTRACT (NO MARKDOWN)
// ===========================================

const WORKBOOK_FORMATTING_CONTRACT = `
=== FORMATTING CONTRACT — STRICT ===

You are generating FINAL, PUBLISHABLE WORKBOOK CONTENT.

ABSOLUTE RULES:
- DO NOT use Markdown syntax.
- DO NOT use **, __, ##, ###, -, *, backticks, or code fences.
- DO NOT assume a Markdown renderer exists.

SECTION HEADINGS must be written as plain text on their own line.

TABLES must use labeled row/column format:

TABLE: [Table Name]

Column 1: [Header]
Column 2: [Header]

Row 1:
[Header]: [Value or blank]
[Header]: [Value or blank]

If any Markdown symbols appear, the output is INVALID.

=== END FORMATTING CONTRACT ===
`;

export function buildWorkbookSystemPrompt(language: string): string {
  return `You are a professional workbook designer creating interactive, fill-in learning materials.

${WORKBOOK_FORMATTING_CONTRACT}

ROLE: Create workbook chapters that are 70%+ interactive content (fill-ins, tables, checklists) and ≤30% explanation.

LANGUAGE: All content must be in ${language}.

HARD LIMITS:
- Maximum ${WORKBOOK_LIMITS.maxWordsPerChapter} words per chapter
- Purpose section: ≤150 words
- Key Concepts: ≤300 words
- Explanation must NEVER exceed 30% of chapter
- Fill-in prompts must DOMINATE the chapter

MANDATORY STRUCTURE (in this exact order):
1. Purpose — Brief goal statement
2. Key Concepts — Use numbered items, minimal prose
3. Fill-In Prompts — Main content (multiple prompts with blank lines)
4. Tables/Worksheets — For planning and organization (labeled format, NOT Markdown)
5. Reflection Questions — Open questions without answers
6. Action Steps — Checkbox items for next steps

INTERACTIVE ELEMENT REQUIREMENTS:
- Use underscores (___________) for fill-in blanks
- Use empty brackets [ ] for checkboxes
- Use labeled row/column tables for user input
- Include numbered lines for extended responses
- Every prompt must have space for user writing

FORBIDDEN:
- Long explanatory paragraphs
- Essay-style content
- Providing answers to reflection questions
- Filled-in example responses
- Walls of text
- Markdown syntax (**, ##, backticks, code fences)`;
}

export function buildWorkbookChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string
): string {
  return `Create an INTERACTIVE WORKBOOK CHAPTER for:
**Book:** "${bookTitle}"
**Chapter ${chapterNumber}:** "${chapterTitle}"
**Topics:** ${keyTopics?.join(', ') || 'Focus on practical application'}

Generate the chapter following this EXACT structure:

---

## Purpose
[Write ≤150 words explaining what this chapter helps achieve. Be specific and actionable.]

---

## Key Concepts
[Write ≤300 words as bullet points covering essential ideas. NO long paragraphs.]

---

## Your Turn: Fill-In Prompts

### Prompt 1: [Topic-specific prompt title]
[One sentence instruction]

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

### Prompt 2: [Next topic-specific prompt]
[One sentence instruction]

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

### Prompt 3: [Another prompt]
[One sentence instruction]

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

### Prompt 4: [Continue with more prompts as needed]
_______________________________________________________________________________
_______________________________________________________________________________

---

## Planning Worksheet

| Area | Current State | Goal | First Step |
|------|---------------|------|------------|
|      |               |      |            |
|      |               |      |            |
|      |               |      |            |
|      |               |      |            |

---

## Reflection Questions

1. _______________________________________________________________________________?

2. _______________________________________________________________________________?

3. _______________________________________________________________________________?

4. _______________________________________________________________________________?

---

## Action Steps

Complete these actions before moving to the next chapter:

- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________

---

**CRITICAL REQUIREMENTS:**
✅ Purpose + Concepts together ≤450 words
✅ Minimum 4 fill-in prompts with blank lines
✅ At least 1 table with empty cells
✅ Minimum 3 reflection questions (no answers!)
✅ Minimum 5 action step checkboxes
✅ All text in ${language}
✅ Total chapter ≤1800 words

BEGIN CREATING THE WORKBOOK CHAPTER:`;
}

// ============================================
// VALIDATION HELPERS
// ============================================

export function countInteractiveElements(content: string): number {
  let count = 0;
  
  // Count fill-in blanks (underscores)
  const blanks = content.match(/_{5,}/g) || [];
  count += blanks.length;
  
  // Count checkboxes
  const checkboxes = content.match(/\[\s*\]/g) || [];
  count += checkboxes.length;
  
  // Count empty table cells
  const emptyCells = content.match(/\|\s*\|/g) || [];
  count += Math.floor(emptyCells.length / 2);
  
  // Count numbered blank lines
  const numberedBlanks = content.match(/\d+\.\s*_{5,}/g) || [];
  count += numberedBlanks.length;
  
  return count;
}

export function calculateExplanationRatio(content: string): number {
  const totalWords = content.split(/\s+/).filter(w => w.length > 0).length;
  
  // Remove interactive elements to count explanation words
  let explanationContent = content
    .replace(/_{5,}/g, '') // Remove blanks
    .replace(/\[\s*\]/g, '') // Remove checkboxes
    .replace(/\|[^|]*\|/g, '') // Remove table cells
    .replace(/^#+\s+.+$/gm, '') // Remove headings
    .replace(/^[-*]\s+/gm, ''); // Remove list markers
  
  const explanationWords = explanationContent.split(/\s+/).filter(w => w.length > 2).length;
  
  return totalWords > 0 ? explanationWords / totalWords : 0;
}

export function validateWorkbookChapter(content: string): {
  valid: boolean;
  issues: string[];
  stats: {
    wordCount: number;
    interactiveCount: number;
    explanationRatio: number;
    hasPurpose: boolean;
    hasConcepts: boolean;
    hasPrompts: boolean;
    hasTables: boolean;
    hasReflection: boolean;
    hasActions: boolean;
  };
} {
  const issues: string[] = [];
  
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  const interactiveCount = countInteractiveElements(content);
  const explanationRatio = calculateExplanationRatio(content);
  
  // Section checks
  const hasPurpose = /(?:^|\n)##+\s*purpose/i.test(content);
  const hasConcepts = /(?:^|\n)##+\s*(?:key\s*)?concepts?/i.test(content);
  const hasPrompts = /(?:^|\n)##+\s*(?:your\s*turn|prompts?|fill[- ]?in|exercises?)/i.test(content);
  const hasTables = /\|[^|]+\|/.test(content);
  const hasReflection = /(?:^|\n)##+\s*reflect(?:ion)?/i.test(content);
  const hasActions = /(?:^|\n)##+\s*action/i.test(content);
  
  // Validate limits
  if (wordCount > WORKBOOK_LIMITS.maxWordsPerChapter) {
    issues.push(`Word count (${wordCount}) exceeds limit of ${WORKBOOK_LIMITS.maxWordsPerChapter}`);
  }
  
  if (interactiveCount < 10) {
    issues.push(`Insufficient interactive elements (${interactiveCount}). Minimum 10 required.`);
  }
  
  if (explanationRatio > 0.35) {
    issues.push(`Explanation ratio (${Math.round(explanationRatio * 100)}%) exceeds 30% limit`);
  }
  
  if (!hasPurpose) issues.push('Missing Purpose section');
  if (!hasConcepts) issues.push('Missing Key Concepts section');
  if (!hasPrompts) issues.push('Missing Fill-In Prompts section');
  if (!hasTables) issues.push('Missing Tables/Worksheets section');
  if (!hasReflection) issues.push('Missing Reflection Questions section');
  if (!hasActions) issues.push('Missing Action Steps section');
  
  return {
    valid: issues.length === 0,
    issues,
    stats: {
      wordCount,
      interactiveCount,
      explanationRatio,
      hasPurpose,
      hasConcepts,
      hasPrompts,
      hasTables,
      hasReflection,
      hasActions,
    },
  };
}

// ============================================
// FORMAT OUTPUT
// ============================================

export function formatWorkbookChapter(
  chapterTitle: string,
  content: string
): string {
  // Ensure proper heading for chapter
  if (!content.startsWith('#')) {
    content = `# ${chapterTitle}\n\n${content}`;
  }
  
  // Ensure proper blank line formatting
  content = content
    .replace(/_{10,}/g, '_______________________________________________________________________________')
    .replace(/\[\]/g, '[ ]')
    .replace(/\n{4,}/g, '\n\n\n');
  
  return content;
}
