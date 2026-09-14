import type { Tables } from "@/integrations/supabase/types";

export type PedagogicalBlockType =
  | 'learning_objectives'
  | 'key_terms'
  | 'worked_example'
  | 'misconception_alert'
  | 'quick_check'
  | 'checkpoint'
  | 'scenario_practice'
  | 'reflection'
  | 'chapter_summary'
  | 'further_reading'
  | 'difficulty_marker'
  | 'estimated_time'
  | 'code_example'
  | 'data_table'
  | 'figure'
  | 'equation';

export interface PedagogicalBlock {
  type: PedagogicalBlockType;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface PedagogicalValidationResult {
  isValid: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface CodeQualityResult {
  hasProperFormatting: boolean;
  hasLanguageLabels: boolean;
  hasIndentation: boolean;
  hasOutputExamples: boolean;
  hasExplanations: boolean;
  hasErrorExamples: boolean;
  score: number;
  issues: string[];
}

export interface TableQualityResult {
  usesMarkdownPipes: boolean;
  maxColumns: number;
  mobileCompatible: boolean;
  noCodeInTables: boolean;
  score: number;
  issues: string[];
}

export const REQUIRED_CHAPTER_BLOCKS: PedagogicalBlockType[] = [
  'learning_objectives',
  'key_terms',
  'chapter_summary',
];

export const RECOMMENDED_CHAPTER_BLOCKS: PedagogicalBlockType[] = [
  'worked_example',
  'quick_check',
  'checkpoint',
];

export const BLOCK_PATTERNS: Record<PedagogicalBlockType, RegExp[]> = {
  learning_objectives: [
    /learning objectives?/i,
    /what you(?:'ll| will) learn/i,
    /by the end of this chapter/i,
  ],
  key_terms: [
    /key terms?/i,
    /key concepts?/i,
    /vocabulary/i,
    /terminology/i,
  ],
  worked_example: [
    /worked example/i,
    /example:/i,
    /step[- ]by[- ]step/i,
    /let(?:'s| us) (?:work|walk) through/i,
  ],
  misconception_alert: [
    /misconception/i,
    /common mistake/i,
    /watch out/i,
    /pitfall/i,
  ],
  quick_check: [
    /quick check/i,
    /check your understanding/i,
    /knowledge check/i,
  ],
  checkpoint: [
    /checkpoint/i,
    /self[- ]assessment/i,
    /review questions?/i,
  ],
  scenario_practice: [
    /scenario/i,
    /case study/i,
    /practice (?:problem|exercise)/i,
    /your turn/i,
  ],
  reflection: [
    /reflection/i,
    /reflect on/i,
    /think about/i,
  ],
  chapter_summary: [
    /chapter summary/i,
    /summary/i,
    /key takeaways?/i,
    /what we(?:'ve| have) learned/i,
  ],
  further_reading: [
    /further reading/i,
    /additional resources?/i,
    /recommended reading/i,
  ],
  difficulty_marker: [
    /difficulty:/i,
    /level:/i,
    /beginner|intermediate|advanced/i,
  ],
  estimated_time: [
    /estimated time/i,
    /reading time/i,
    /\d+\s*(?:min|minutes?|hours?)/i,
  ],
  code_example: [
    /```\w*\n[\s\S]*?```/,
    /<code>[\s\S]*?<\/code>/i,
  ],
  data_table: [
    /\|[^|\n]+\|/,
  ],
  figure: [
    /!\[[^\]]*\]\([^)]+\)/,
    /figure\s+\d+/i,
  ],
  equation: [
    /\$\$[\s\S]*?\$\$/,
    /\\\[[\s\S]*?\\\]/,
  ],
};

/**
 * Extract pedagogical blocks from chapter content based on patterns
 */
export function extractPedagogicalBlocks(content: string): PedagogicalBlock[] {
  const blocks: PedagogicalBlock[] = [];
  
  for (const [type, patterns] of Object.entries(BLOCK_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        blocks.push({
          type: type as PedagogicalBlockType,
          content: matches[0],
        });
        break;
      }
    }
  }
  
  return blocks;
}

/**
 * Validate chapter content against pedagogical standards
 */
export function validateChapterPedagogy(content: string): PedagogicalValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  const blocks = extractPedagogicalBlocks(content);
  const blockTypes = new Set(blocks.map(b => b.type));
  
  // Check required blocks
  for (const required of REQUIRED_CHAPTER_BLOCKS) {
    if (!blockTypes.has(required)) {
      issues.push(`Missing required pedagogical block: ${required.replace(/_/g, ' ')}`);
      score -= 15;
    }
  }
  
  // Check recommended blocks
  for (const recommended of RECOMMENDED_CHAPTER_BLOCKS) {
    if (!blockTypes.has(recommended)) {
      suggestions.push(`Consider adding: ${recommended.replace(/_/g, ' ')}`);
      score -= 5;
    }
  }
  
  // Check content length and structure
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 500) {
    issues.push('Chapter content is too short (minimum 500 words recommended)');
    score -= 10;
  }
  
  // Check heading hierarchy
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  if (headings.length < 3) {
    suggestions.push('Add more section headings for better navigation');
    score -= 5;
  }
  
  // Check for learning objectives near start
  const firstQuarter = content.slice(0, Math.floor(content.length / 4));
  const hasEarlyObjectives = BLOCK_PATTERNS.learning_objectives.some(p => p.test(firstQuarter));
  if (!hasEarlyObjectives) {
    issues.push('Learning objectives should appear near the beginning of the chapter');
    score -= 10;
  }
  
  return {
    isValid: issues.length === 0,
    score: Math.max(0, score),
    issues,
    suggestions,
  };
}

/**
 * Generate a pedagogical enhancement prompt for AI content generation
 */
export function generatePedagogicalPrompt(topic: string, audience: string = 'general'): string {
  return `
Create comprehensive educational content about "${topic}" for a ${audience} audience.

PEDAGOGICAL REQUIREMENTS:

1. **Learning Objectives** (at the beginning)
   - 3-5 specific, measurable objectives
   - Use action verbs (understand, apply, analyze, create)

2. **Key Terms**
   - Define important terminology before using it
   - Use clear, concise definitions

3. **Progressive Structure**
   - Start with foundational concepts
   - Build complexity gradually
   - Use clear section headings

4. **Worked Examples**
   - Include at least 2 step-by-step examples
   - Explain the reasoning at each step
   - Show both correct approaches and common mistakes

5. **Misconception Alerts**
   - Identify 2-3 common misconceptions
   - Explain why they're wrong
   - Provide the correct understanding

6. **Quick Checks**
   - Include 2-3 brief comprehension questions throughout
   - Provide answers or explanations

7. **Checkpoint** (mid-chapter)
   - 3-5 review questions
   - Mix of recall and application

8. **Scenario Practice**
   - Include at least one realistic scenario or case study
   - Require application of learned concepts

9. **Reflection**
   - Include 1-2 reflection prompts
   - Connect concepts to real-world experience

10. **Chapter Summary**
    - Concise recap of key points
    - Revisit learning objectives
    - Highlight main takeaways

11. **Further Reading**
    - Suggest 3-5 reliable resources for deeper learning

FORMATTING:
- Use markdown headings (##, ###) for clear hierarchy
- Use bullet points for lists
- Use numbered lists for sequential steps
- Use blockquotes for important notes
- Keep paragraphs concise (3-5 sentences)
- Use tables only for comparative data (max 4 columns)

CODE EXAMPLES (if applicable):
- Use fenced code blocks with language labels
- Include proper indentation
- Show expected output
- Explain what each section does
- Include common error examples

Avoid:
- Dense walls of text
- Unexplained jargon
- Code without context
- Tables with more than 4 columns
- Code inside tables
`;
}

/**
 * Audit code example quality in chapter content
 */
export function auditCodeQuality(content: string): CodeQualityResult {
  const issues: string[] = [];
  
  // Find code blocks
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const hasCodeBlocks = codeBlocks.length > 0;
  
  if (!hasCodeBlocks) {
    return {
      hasProperFormatting: true,
      hasLanguageLabels: true,
      hasIndentation: true,
      hasOutputExamples: true,
      hasExplanations: true,
      hasErrorExamples: true,
      score: 100,
      issues: [],
    };
  }
  
  // Check structured code example format
  const hasStructuredCodeBlocks = codeBlocks.some(block => 
    /```(?:python|javascript|typescript|java|csharp|cpp|c|go|rust|ruby|php|swift|kotlin|sql|bash|shell|json|yaml|html|css)\n/i.test(block)
  );
  
  // Check for language labels
  const hasLanguageLabels = codeBlocks.every(block => 
    /```\w+\n/.test(block)
  );
  if (!hasLanguageLabels) {
    issues.push('Code blocks should include language labels (e.g., ```python)');
  }
  
  // Check indentation (at least some indented lines in multi-line code)
  const hasIndentation = codeBlocks.some(block => 
    /\n\s{2,}\S/.test(block)
  );
  
  // Check for output examples near code blocks
  const hasOutputExamples = /(?:output|result|returns?):?\s*[\n`]/i.test(content);
  if (!hasOutputExamples) {
    issues.push('Code examples should include expected output');
  }
  
  // Check for explanations
  const hasExplanations = /(?:this code|the code|this example|here we|this function|this method)/i.test(content);
  if (!hasExplanations) {
    issues.push('Code examples should include explanations');
  }
  
  // Check for error examples
  const hasErrorExamples = /(?:common error|common mistake|error example|wrong|incorrect|pitfall)/i.test(content);
  if (!hasErrorExamples) {
    issues.push('Consider including common error examples');
  }
  
  // Calculate score
  let score = 30; // Base score for having code blocks
  if (hasStructuredCodeBlocks) score += 10; // Bonus for structured format
  if (hasLanguageLabels) score += 20;
  if (hasIndentation) score += 10;
  if (hasOutputExamples) score += 15;
  if (hasExplanations) score += 15;
  if (hasErrorExamples) score += 10;

  return {
    hasProperFormatting,
    hasLanguageLabels,
    hasIndentation,
    hasOutputExamples,
    hasExplanations,
    hasErrorExamples,
    score: Math.min(100, score),
    issues
  };
}

/**
 * Audit table quality in chapter content
 */
export function auditTableQuality(content: string): TableQualityResult {
  const issues: string[] = [];
  
  // Check for proper markdown pipe tables
  const usesMarkdownPipes = /\|[\s\S]*?\|[\s\S]*?\|/.test(content);
  
  // Check for text-based table format (forbidden)
  const hasTextTables = /(TABLE:|Column \d:|Row \d:)/i.test(content);
  if (hasTextTables) {
    issues.push('Using forbidden text-based table format instead of markdown pipes');
  }
  
  // Count max columns
  const tableRows: string[] = content.match(/\|[^|\n]+\|/g) ?? [];
  let maxColumns = 0;
  tableRows.forEach(row => {
    const colCount = (row.match(/\|/g) || []).length - 1;
    maxColumns = Math.max(maxColumns, colCount);
  });
  
  const mobileCompatible = maxColumns <= 4;
  if (maxColumns > 4) {
    issues.push(`Table has ${maxColumns} columns (max 4 for mobile compatibility)`);
  }
  
  // Check for code in tables (forbidden)
  const noCodeInTables = !/(```[\s\S]*?```[\s\S]*?\||\|[\s\S]*?```)/i.test(content);
  if (!noCodeInTables) {
    issues.push('Code blocks found inside tables (forbidden)');
  }

  let score = 0;
  if (usesMarkdownPipes) score += 40;
  if (!hasTextTables) score += 20;
  if (mobileCompatible) score += 20;
  if (noCodeInTables) score += 20;

  return {
    usesMarkdownPipes,
    maxColumns,
    mobileCompatible,
    noCodeInTables,
    score,
    issues,
  };
}

/**
 * Default pedagogical preferences derived from profile settings.
 */
export function preferencesFromProfile(
  profile: Pick<Tables<'profiles'>, 'preferred_content_level' | 'preferred_learning_style'>,
): { audience: string; learningStyle: string } {
  return {
    audience: profile.preferred_content_level || 'general',
    learningStyle: profile.preferred_learning_style || 'mixed',
  };
}
