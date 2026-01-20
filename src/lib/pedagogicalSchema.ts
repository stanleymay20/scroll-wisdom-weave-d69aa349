/**
 * PEDAGOGICAL SCHEMA CONTRACT
 * Enforces mandatory chapter structure for all generated books.
 * Every chapter MUST include these 7 sections in order.
 */

// ===========================================
// MANDATORY CHAPTER SECTIONS
// ===========================================

export const MANDATORY_CHAPTER_SECTIONS = [
  'learning_objectives',
  'core_concept',
  'mental_model',
  'worked_examples',
  'common_mistakes',
  'practice_section',
  'quiz_gate'
] as const;

export type ChapterSection = typeof MANDATORY_CHAPTER_SECTIONS[number];

export interface ChapterSectionConfig {
  id: ChapterSection;
  displayName: string;
  description: string;
  required: boolean;
  minContent: string; // Regex pattern to detect section
  maxWords?: number;
  minWords?: number;
  validationRules: string[];
}

export const CHAPTER_SECTION_CONFIGS: Record<ChapterSection, ChapterSectionConfig> = {
  learning_objectives: {
    id: 'learning_objectives',
    displayName: 'Learning Objectives',
    description: 'Clear, measurable outcomes the learner will achieve',
    required: true,
    minContent: '(learning objective|by the end of|you will be able to|after this chapter)',
    minWords: 30,
    maxWords: 150,
    validationRules: [
      'Must contain 3-5 bullet points',
      'Must be specific and measurable',
      'Must start with action verbs (understand, implement, apply, analyze)'
    ]
  },
  core_concept: {
    id: 'core_concept',
    displayName: 'Core Concept Explanation',
    description: 'The main idea or theory being taught',
    required: true,
    minContent: '(concept|definition|fundamental|principle|theory)',
    minWords: 200,
    maxWords: 800,
    validationRules: [
      'Must explain the core concept clearly',
      'Must include technical definitions where needed',
      'Must build on prior knowledge'
    ]
  },
  mental_model: {
    id: 'mental_model',
    displayName: 'Mental Model / Analogy',
    description: 'A relatable analogy to cement understanding',
    required: true,
    minContent: '(think of it as|imagine|like|similar to|analogy|mental model)',
    minWords: 50,
    maxWords: 300,
    validationRules: [
      'Must include a concrete, relatable analogy',
      'Must connect abstract concept to familiar experience',
      'Must be memorable and reusable'
    ]
  },
  worked_examples: {
    id: 'worked_examples',
    displayName: 'Worked Examples',
    description: 'Step-by-step examples with explanations',
    required: true,
    minContent: '(example|for instance|consider|let\'s look at|step \\d)',
    minWords: 200,
    maxWords: 1000,
    validationRules: [
      'Must include at least 2 worked examples',
      'Must explain each step, not just show the solution',
      'Must include code output for programming examples',
      'Must progress from simple to complex'
    ]
  },
  common_mistakes: {
    id: 'common_mistakes',
    displayName: 'Common Mistakes & Misconceptions',
    description: 'Errors learners typically make and how to avoid them',
    required: true,
    minContent: '(mistake|misconception|common error|avoid|don\'t|pitfall|wrong)',
    minWords: 100,
    maxWords: 400,
    validationRules: [
      'Must list 2-4 common mistakes',
      'Must explain WHY each is a mistake',
      'Must provide the correct approach',
      'Must include at least one failure example'
    ]
  },
  practice_section: {
    id: 'practice_section',
    displayName: 'Practice Section',
    description: 'Guided exercises for the learner',
    required: true,
    minContent: '(practice|exercise|try it|your turn|apply what you)',
    minWords: 150,
    maxWords: 500,
    validationRules: [
      'Must include 3-5 graded exercises',
      'Must progress Easy → Medium → Hard',
      'Must have clear success criteria',
      'Must include one production task'
    ]
  },
  quiz_gate: {
    id: 'quiz_gate',
    displayName: 'Chapter Quiz Gate',
    description: 'Assessment questions that must be passed to proceed',
    required: true,
    minContent: '(quiz|assessment|test your|check your understanding|review question)',
    minWords: 100,
    maxWords: 400,
    validationRules: [
      'Must include 5 assessment questions',
      'Must include Tier 2+ questions (not just MCQ)',
      'Must reference chapter content directly',
      'Quiz must be LOCKED until previous sections are read'
    ]
  }
};

// ===========================================
// CHAPTER VALIDATION
// ===========================================

export interface SectionValidationResult {
  section: ChapterSection;
  found: boolean;
  position: number; // -1 if not found
  wordCount: number;
  violations: string[];
  passed: boolean;
}

export interface ChapterValidationResult {
  valid: boolean;
  sectionsFound: number;
  sectionsRequired: number;
  sections: SectionValidationResult[];
  overallViolations: string[];
  canPublish: boolean;
  score: number; // 0-100
}

/**
 * Validate chapter content against mandatory schema
 */
export function validateChapterSchema(content: string): ChapterValidationResult {
  const sections: SectionValidationResult[] = [];
  const overallViolations: string[] = [];
  
  const contentLower = content.toLowerCase();
  const words = content.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;

  MANDATORY_CHAPTER_SECTIONS.forEach((sectionId, expectedPosition) => {
    const config = CHAPTER_SECTION_CONFIGS[sectionId];
    const pattern = new RegExp(config.minContent, 'i');
    const found = pattern.test(content);
    
    // Find position in content
    const match = content.match(pattern);
    const position = match ? content.indexOf(match[0]) : -1;
    
    // Estimate section word count (rough approximation)
    const sectionWordCount = found ? Math.floor(totalWords / MANDATORY_CHAPTER_SECTIONS.length) : 0;
    
    const violations: string[] = [];
    
    if (!found) {
      violations.push(`Missing required section: ${config.displayName}`);
    } else {
      if (config.minWords && sectionWordCount < config.minWords) {
        violations.push(`${config.displayName} too short (${sectionWordCount} words, min: ${config.minWords})`);
      }
      if (config.maxWords && sectionWordCount > config.maxWords) {
        violations.push(`${config.displayName} too long (${sectionWordCount} words, max: ${config.maxWords})`);
      }
    }

    sections.push({
      section: sectionId,
      found,
      position,
      wordCount: sectionWordCount,
      violations,
      passed: found && violations.length === 0
    });
  });

  const sectionsFound = sections.filter(s => s.found).length;
  const sectionsRequired = MANDATORY_CHAPTER_SECTIONS.length;
  
  // Overall violations
  if (sectionsFound < sectionsRequired) {
    overallViolations.push(`Missing ${sectionsRequired - sectionsFound} required sections`);
  }
  
  // Check section order
  const foundPositions = sections.filter(s => s.position >= 0).map(s => s.position);
  const isOrderCorrect = foundPositions.every((pos, idx) => 
    idx === 0 || pos > foundPositions[idx - 1]
  );
  if (!isOrderCorrect && sectionsFound >= 3) {
    overallViolations.push('Sections are not in correct order');
  }

  // Check for minimum word count overall
  if (totalWords < 1500) {
    overallViolations.push(`Chapter too short: ${totalWords} words (minimum 1500)`);
  }

  const allSectionsPassed = sections.every(s => s.passed);
  const score = Math.round((sectionsFound / sectionsRequired) * 100);

  return {
    valid: allSectionsPassed && overallViolations.length === 0,
    sectionsFound,
    sectionsRequired,
    sections,
    overallViolations,
    canPublish: sectionsFound >= 5 && score >= 70, // Allow with 5/7 sections minimum
    score
  };
}

// ===========================================
// BOOK AUDIT SYSTEM
// ===========================================

export interface BookAuditResult {
  bookId: string;
  passed: boolean;
  score: number;
  chapterResults: ChapterValidationResult[];
  codeQuality: CodeQualityResult;
  tableQuality: TableQualityResult;
  quizRigor: QuizRigorResult;
  publishingBlocked: boolean;
  blockerReasons: string[];
  warnings: string[];
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

export interface QuizRigorResult {
  hasTier1: boolean;
  hasTier2: boolean;
  hasTier3: boolean;
  hasTier4: boolean;
  mcqOnlyChapters: number;
  appliedReasoningCount: number;
  scenarioCount: number;
  score: number;
  issues: string[];
}

/**
 * Audit code quality in chapter content
 */
export function auditCodeQuality(content: string): CodeQualityResult {
  const issues: string[] = [];
  
  // Check for proper code blocks
  const hasProperFormatting = /```\w+[\s\S]*?```/.test(content);
  if (!hasProperFormatting && /code|function|class|def |const |let |var /.test(content.toLowerCase())) {
    issues.push('Code found but not in proper fenced code blocks');
  }
  
  // Check for language labels
  const codeBlocks = content.match(/```\w+/g) || [];
  const hasLanguageLabels = codeBlocks.length > 0;
  if (!hasLanguageLabels && /```/.test(content)) {
    issues.push('Code blocks missing language specification');
  }
  
  // Check indentation (look for 2+ space indentation patterns)
  const hasIndentation = /\n {2,}|\n\t+/.test(content);
  
  // Check for output examples
  const hasOutputExamples = /(output|result|returns|prints|console\.log|print\()/i.test(content);
  if (!hasOutputExamples && hasProperFormatting) {
    issues.push('Missing output examples after code blocks');
  }
  
  // Check for explanations
  const hasExplanations = /(explanation|this code|this function|here we|note that)/i.test(content);
  
  // Check for error/failure examples
  const hasErrorExamples = /(error|exception|mistake|wrong|incorrect|fail|bug)/i.test(content);
  if (!hasErrorExamples && hasProperFormatting) {
    issues.push('Missing error/failure examples');
  }

  let score = 0;
  if (hasProperFormatting) score += 25;
  if (hasLanguageLabels) score += 20;
  if (hasIndentation) score += 15;
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
    score,
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
  const tableRows = content.match(/\|[^|\n]+\|/g) || [];
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
    issues
  };
}

/**
 * Audit quiz rigor in chapter content
 */
export function auditQuizRigor(content: string): QuizRigorResult {
  const issues: string[] = [];
  const contentLower = content.toLowerCase();
  
  // Tier 1: Basic MCQ
  const hasTier1 = /(multiple choice|select the correct|which of the following)/i.test(content);
  
  // Tier 2: Applied Reasoning
  const tier2Patterns = [
    /what happens if/i,
    /what would be the output/i,
    /predict the result/i,
    /why does this/i,
    /explain how/i
  ];
  const hasTier2 = tier2Patterns.some(p => p.test(content));
  const appliedReasoningCount = tier2Patterns.filter(p => p.test(content)).length;
  
  // Tier 3: Scenario & Debugging
  const tier3Patterns = [
    /fix the following/i,
    /debug this/i,
    /what is wrong with/i,
    /which approach is best/i,
    /given this scenario/i,
    /case study/i
  ];
  const hasTier3 = tier3Patterns.some(p => p.test(content));
  const scenarioCount = tier3Patterns.filter(p => p.test(content)).length;
  
  // Tier 4: Integrity-Weighted
  const hasTier4 = /(time-based|progressive hint|pattern analysis|timed question)/i.test(content);

  // MCQ-only chapters are not acceptable for certification
  const mcqOnlyChapters = hasTier1 && !hasTier2 && !hasTier3 ? 1 : 0;
  
  if (!hasTier2) {
    issues.push('Missing Tier 2 (Applied Reasoning) questions');
  }
  if (!hasTier3) {
    issues.push('Missing Tier 3 (Scenario/Debugging) questions');
  }
  if (mcqOnlyChapters > 0) {
    issues.push('Chapter has only Tier 1 MCQ questions - not acceptable for certification');
  }

  let score = 0;
  if (hasTier1) score += 10;
  if (hasTier2) score += 30;
  if (hasTier3) score += 40;
  if (hasTier4) score += 20;

  return {
    hasTier1,
    hasTier2,
    hasTier3,
    hasTier4,
    mcqOnlyChapters,
    appliedReasoningCount,
    scenarioCount,
    score,
    issues
  };
}

/**
 * Full book audit combining all quality checks
 */
export function auditBook(
  bookId: string,
  chapters: { id: string; content: string }[]
): BookAuditResult {
  const chapterResults = chapters.map(ch => validateChapterSchema(ch.content));
  
  const allContent = chapters.map(ch => ch.content).join('\n\n');
  const codeQuality = auditCodeQuality(allContent);
  const tableQuality = auditTableQuality(allContent);
  const quizRigor = auditQuizRigor(allContent);
  
  const blockerReasons: string[] = [];
  const warnings: string[] = [];
  
  // Check chapter validation
  const failedChapters = chapterResults.filter(r => !r.valid);
  if (failedChapters.length > 0) {
    blockerReasons.push(`${failedChapters.length} chapter(s) fail pedagogical schema validation`);
  }
  
  // Check code quality
  if (codeQuality.score < 60) {
    blockerReasons.push(`Code quality score too low: ${codeQuality.score}/100`);
  } else if (codeQuality.score < 80) {
    warnings.push(`Code quality could be improved: ${codeQuality.score}/100`);
  }
  
  // Check table quality
  if (tableQuality.score < 60) {
    blockerReasons.push(`Table quality score too low: ${tableQuality.score}/100`);
  }
  
  // Check quiz rigor (CRITICAL - MCQ-only is not acceptable)
  if (quizRigor.mcqOnlyChapters > 0) {
    blockerReasons.push('MCQ-only assessments are not acceptable for certification');
  }
  if (quizRigor.score < 50) {
    blockerReasons.push(`Quiz rigor insufficient: ${quizRigor.score}/100 (requires Tier 2+ questions)`);
  }

  // Calculate overall score
  const chapterScore = chapterResults.reduce((sum, r) => sum + r.score, 0) / chapterResults.length;
  const overallScore = Math.round(
    (chapterScore * 0.4) + 
    (codeQuality.score * 0.2) + 
    (tableQuality.score * 0.1) + 
    (quizRigor.score * 0.3)
  );

  return {
    bookId,
    passed: blockerReasons.length === 0,
    score: overallScore,
    chapterResults,
    codeQuality,
    tableQuality,
    quizRigor,
    publishingBlocked: blockerReasons.length > 0,
    blockerReasons,
    warnings
  };
}
