/**
 * ASSESSMENT RIGOR CONTRACT (ARC-1.0)
 * 
 * Ensures quiz generation meets certification standards:
 * - Mandatory Tier 2/3 questions for certification
 * - Coding challenges for technical content
 * - Anti-pattern detection (AI, copy-paste, speed-running)
 * - Integrity-weighted scoring
 */

import { AssessmentTier, TIER_CONFIGS } from './multiTierAssessment';

// ===========================================
// QUESTION TYPE CONTRACTS
// ===========================================

export type CodingQuestionType = 
  | 'output_prediction'    // "What does this code output?"
  | 'debug_fix'            // "Find and fix the bug"
  | 'fill_blank'           // "Complete the missing code"
  | 'write_function'       // "Write a function that..."
  | 'trace_execution';     // "What is the value of X after..."

export type ReasoningQuestionType =
  | 'cause_effect'         // "What happens if..."
  | 'compare_contrast'     // "How does X differ from Y?"
  | 'predict_outcome'      // "Given this scenario, predict..."
  | 'justify_decision'     // "Why would you choose..."
  | 'identify_pattern';    // "What pattern do you see?"

export type ScenarioQuestionType =
  | 'troubleshoot'         // "Something went wrong, diagnose it"
  | 'case_study'           // "Given this case, what would you do?"
  | 'best_approach'        // "Which approach is optimal?"
  | 'identify_flaw'        // "What's wrong with this approach?"
  | 'optimize';            // "How would you improve this?"

// ===========================================
// ANTI-PATTERN DETECTION
// ===========================================

export interface QuestionAntiPattern {
  pattern: string;
  description: string;
  severity: 'block' | 'warn' | 'info';
  autoFix?: string;
}

export const QUESTION_ANTI_PATTERNS: QuestionAntiPattern[] = [
  // MCQ-only patterns
  {
    pattern: 'all_tier_1',
    description: 'Quiz contains only Tier 1 (knowledge check) questions',
    severity: 'block',
    autoFix: 'Add at least 2 Tier 2 and 1 Tier 3 questions',
  },
  // Easy patterns
  {
    pattern: 'obvious_answer',
    description: 'Correct answer is obviously different (e.g., only positive option)',
    severity: 'warn',
    autoFix: 'Make distractors more plausible',
  },
  {
    pattern: 'longest_answer_correct',
    description: 'Correct answer is consistently the longest option',
    severity: 'warn',
    autoFix: 'Vary option lengths',
  },
  {
    pattern: 'always_same_position',
    description: 'Correct answer is always in same position (e.g., always B)',
    severity: 'warn',
    autoFix: 'Randomize correct answer positions',
  },
  // Content patterns
  {
    pattern: 'leading_question',
    description: 'Question contains hints toward the answer',
    severity: 'warn',
  },
  {
    pattern: 'double_negative',
    description: 'Question uses confusing double negatives',
    severity: 'warn',
    autoFix: 'Rephrase in positive terms',
  },
  {
    pattern: 'all_of_above',
    description: 'Overuse of "All of the above" options',
    severity: 'info',
  },
  // Technical patterns
  {
    pattern: 'code_without_output',
    description: 'Coding question lacks expected output specification',
    severity: 'block',
    autoFix: 'Add expected output or behavior description',
  },
  {
    pattern: 'pseudo_code_only',
    description: 'Code is pseudo-code, not runnable',
    severity: 'warn',
    autoFix: 'Convert to actual runnable code',
  },
];

// ===========================================
// CERTIFICATION REQUIREMENTS
// ===========================================

export interface CertificationQuizRequirements {
  minTotalQuestions: number;
  minTier2Questions: number;
  minTier3Questions: number;
  minTier4Questions: number;
  requiresCodingForTechnical: boolean;
  minCodingQuestionsForTechnical: number;
  maxTier1Ratio: number; // Maximum ratio of Tier 1 questions
  requiredQuestionTypes: string[];
}

export const COMPLETION_CERTIFICATE_REQUIREMENTS: CertificationQuizRequirements = {
  minTotalQuestions: 5,
  minTier2Questions: 2,
  minTier3Questions: 1,
  minTier4Questions: 0,
  requiresCodingForTechnical: true,
  minCodingQuestionsForTechnical: 1,
  maxTier1Ratio: 0.4,
  requiredQuestionTypes: ['reasoning', 'scenario'],
};

export const MASTERY_CERTIFICATE_REQUIREMENTS: CertificationQuizRequirements = {
  minTotalQuestions: 7,
  minTier2Questions: 2,
  minTier3Questions: 2,
  minTier4Questions: 1,
  requiresCodingForTechnical: true,
  minCodingQuestionsForTechnical: 2,
  maxTier1Ratio: 0.3,
  requiredQuestionTypes: ['reasoning', 'scenario', 'integrity'],
};

// ===========================================
// TECHNICAL CONTENT DETECTION
// ===========================================

export const TECHNICAL_KEYWORDS = [
  'programming', 'coding', 'software', 'algorithm', 'data structure',
  'python', 'javascript', 'java', 'c++', 'typescript', 'sql',
  'machine learning', 'artificial intelligence', 'data science',
  'web development', 'api', 'database', 'server', 'cloud',
  'computer science', 'engineering', 'mathematics', 'physics',
  'network', 'security', 'cryptography', 'blockchain',
  'react', 'node', 'docker', 'kubernetes', 'aws', 'azure',
  'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit',
];

export function isTechnicalContent(
  bookTitle: string, 
  chapterTitle: string, 
  content: string,
  category?: string
): boolean {
  const searchText = `${bookTitle} ${chapterTitle} ${content}`.toLowerCase();
  
  // Check for technical keywords
  const keywordMatches = TECHNICAL_KEYWORDS.filter(kw => searchText.includes(kw));
  
  // Check for code patterns
  const hasCodeBlocks = /```[\s\S]*?```/.test(content);
  const hasInlineCode = /`[^`]+`/.test(content);
  const hasFunctionPatterns = /(function|def|class|const|let|var)\s+\w+/.test(content);
  
  // Technical categories
  const technicalCategories = [
    'technology', 'science', 'engineering', 'computer_science',
    'data_science', 'programming', 'mathematics',
  ];
  
  const isTechnicalCategory = category && technicalCategories.some(tc => 
    category.toLowerCase().includes(tc)
  );
  
  return keywordMatches.length >= 2 || 
         (keywordMatches.length >= 1 && (hasCodeBlocks || hasFunctionPatterns)) ||
         isTechnicalCategory === true;
}

// ===========================================
// QUIZ VALIDATION
// ===========================================

export interface QuizValidationResult {
  valid: boolean;
  certificationEligible: boolean;
  masteryEligible: boolean;
  issues: QuizValidationIssue[];
  suggestions: string[];
  antiPatternsDetected: QuestionAntiPattern[];
  tierBreakdown: Record<AssessmentTier, number>;
  codingQuestionCount: number;
}

export interface QuizValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  questionIndex?: number;
}

export interface QuizQuestion {
  tier: AssessmentTier;
  type: string;
  question: string;
  options?: string[];
  correctIndex?: number;
  codeSnippet?: string;
  language?: string;
  explanation?: string;
  pointValue: number;
  timeLimit: number;
}

export function validateQuizForCertification(
  questions: QuizQuestion[],
  isTechnical: boolean,
  targetCertification: 'completion' | 'mastery' = 'completion'
): QuizValidationResult {
  const requirements = targetCertification === 'mastery' 
    ? MASTERY_CERTIFICATE_REQUIREMENTS 
    : COMPLETION_CERTIFICATE_REQUIREMENTS;
  
  const issues: QuizValidationIssue[] = [];
  const suggestions: string[] = [];
  const antiPatternsDetected: QuestionAntiPattern[] = [];
  
  // Calculate tier breakdown
  const tierBreakdown: Record<AssessmentTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  questions.forEach(q => {
    if (q.tier >= 1 && q.tier <= 4) {
      tierBreakdown[q.tier as AssessmentTier]++;
    }
  });
  
  // Count coding questions
  const codingQuestionCount = questions.filter(q => 
    q.type === 'coding' || q.codeSnippet
  ).length;
  
  // Check total questions
  if (questions.length < requirements.minTotalQuestions) {
    issues.push({
      code: 'INSUFFICIENT_QUESTIONS',
      message: `Quiz has ${questions.length} questions, needs ${requirements.minTotalQuestions}`,
      severity: 'error',
    });
  }
  
  // Check Tier 2 requirement (MANDATORY)
  if (tierBreakdown[2] < requirements.minTier2Questions) {
    issues.push({
      code: 'INSUFFICIENT_TIER_2',
      message: `Quiz has ${tierBreakdown[2]} Tier 2 (Applied Reasoning) questions, needs ${requirements.minTier2Questions}`,
      severity: 'error',
    });
    suggestions.push('Add Tier 2 questions: "What would happen if...", "Predict the output", "Why does X occur when Y?"');
  }
  
  // Check Tier 3 requirement (MANDATORY)
  if (tierBreakdown[3] < requirements.minTier3Questions) {
    issues.push({
      code: 'INSUFFICIENT_TIER_3',
      message: `Quiz has ${tierBreakdown[3]} Tier 3 (Scenario/Debugging) questions, needs ${requirements.minTier3Questions}`,
      severity: 'error',
    });
    suggestions.push('Add Tier 3 questions: "Debug this code", "Which approach is best?", "Diagnose the issue"');
  }
  
  // Check Tier 4 for mastery
  if (targetCertification === 'mastery' && tierBreakdown[4] < requirements.minTier4Questions) {
    issues.push({
      code: 'INSUFFICIENT_TIER_4',
      message: `Mastery requires ${requirements.minTier4Questions} Tier 4 (Integrity-Weighted) question(s)`,
      severity: 'error',
    });
  }
  
  // Check Tier 1 ratio
  const tier1Ratio = tierBreakdown[1] / questions.length;
  if (tier1Ratio > requirements.maxTier1Ratio) {
    issues.push({
      code: 'EXCESSIVE_TIER_1',
      message: `${Math.round(tier1Ratio * 100)}% Tier 1 questions exceeds ${Math.round(requirements.maxTier1Ratio * 100)}% maximum`,
      severity: 'warning',
    });
    antiPatternsDetected.push(QUESTION_ANTI_PATTERNS.find(p => p.pattern === 'all_tier_1')!);
  }
  
  // Check coding requirements for technical content
  if (isTechnical && requirements.requiresCodingForTechnical) {
    if (codingQuestionCount < requirements.minCodingQuestionsForTechnical) {
      issues.push({
        code: 'INSUFFICIENT_CODING',
        message: `Technical content requires ${requirements.minCodingQuestionsForTechnical} coding question(s), found ${codingQuestionCount}`,
        severity: 'error',
      });
      suggestions.push('Add coding questions: output prediction, debugging, or code completion');
    }
  }
  
  // Check for anti-patterns in individual questions
  questions.forEach((q, index) => {
    // Check for code without output
    if (q.codeSnippet && !q.explanation) {
      antiPatternsDetected.push(QUESTION_ANTI_PATTERNS.find(p => p.pattern === 'code_without_output')!);
      issues.push({
        code: 'CODE_NO_EXPLANATION',
        message: `Question ${index + 1} has code but no explanation`,
        severity: 'warning',
        questionIndex: index,
      });
    }
    
    // Check for obvious answers (longest answer)
    if (q.options && q.correctIndex !== undefined) {
      const correctOption = q.options[q.correctIndex];
      const longestOption = [...q.options].sort((a, b) => b.length - a.length)[0];
      if (correctOption === longestOption && correctOption.length > longestOption.length * 0.5) {
        issues.push({
          code: 'LONGEST_ANSWER_CORRECT',
          message: `Question ${index + 1}: Correct answer is the longest option`,
          severity: 'info',
          questionIndex: index,
        });
      }
    }
  });
  
  // Check answer position distribution
  const correctPositions = questions
    .filter(q => q.correctIndex !== undefined)
    .map(q => q.correctIndex!);
  if (correctPositions.length > 3) {
    const positionCounts = correctPositions.reduce((acc, pos) => {
      acc[pos] = (acc[pos] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    const maxCount = Math.max(...Object.values(positionCounts));
    if (maxCount >= correctPositions.length * 0.6) {
      antiPatternsDetected.push(QUESTION_ANTI_PATTERNS.find(p => p.pattern === 'always_same_position')!);
      suggestions.push('Randomize correct answer positions for better assessment validity');
    }
  }
  
  // Determine eligibility
  const hasErrors = issues.some(i => i.severity === 'error');
  const certificationEligible = !hasErrors && tierBreakdown[2] >= 2 && tierBreakdown[3] >= 1;
  const masteryEligible = certificationEligible && tierBreakdown[4] >= 1 && questions.length >= 7;
  
  return {
    valid: !hasErrors,
    certificationEligible,
    masteryEligible,
    issues,
    suggestions,
    antiPatternsDetected: antiPatternsDetected.filter(Boolean),
    tierBreakdown,
    codingQuestionCount,
  };
}

// ===========================================
// CODING QUESTION TEMPLATES
// ===========================================

export interface CodingQuestionTemplate {
  type: CodingQuestionType;
  tier: AssessmentTier;
  template: string;
  languages: string[];
  pointValue: number;
  timeLimit: number;
}

export const CODING_QUESTION_TEMPLATES: CodingQuestionTemplate[] = [
  {
    type: 'output_prediction',
    tier: 2,
    template: 'What will be the output of the following code?',
    languages: ['python', 'javascript', 'java', 'typescript'],
    pointValue: 3,
    timeLimit: 120,
  },
  {
    type: 'debug_fix',
    tier: 3,
    template: 'The following code has a bug. Identify and fix the error.',
    languages: ['python', 'javascript', 'java', 'typescript'],
    pointValue: 5,
    timeLimit: 180,
  },
  {
    type: 'fill_blank',
    tier: 2,
    template: 'Complete the missing line(s) to make this code work correctly.',
    languages: ['python', 'javascript', 'java', 'typescript'],
    pointValue: 3,
    timeLimit: 120,
  },
  {
    type: 'trace_execution',
    tier: 3,
    template: 'After executing this code, what is the value of the variable?',
    languages: ['python', 'javascript', 'java', 'typescript'],
    pointValue: 5,
    timeLimit: 180,
  },
  {
    type: 'write_function',
    tier: 4,
    template: 'Write a function that accomplishes the following task.',
    languages: ['python', 'javascript', 'typescript'],
    pointValue: 7,
    timeLimit: 300,
  },
];

// ===========================================
// QUESTION GENERATION HINTS FOR AI
// ===========================================

export function generateQuizPromptEnhancements(
  isTechnical: boolean,
  targetCertification: 'completion' | 'mastery',
  existingTierBreakdown?: Record<AssessmentTier, number>
): string {
  const requirements = targetCertification === 'mastery'
    ? MASTERY_CERTIFICATE_REQUIREMENTS
    : COMPLETION_CERTIFICATE_REQUIREMENTS;
  
  let prompt = `\n\nASSESSMENT RIGOR CONTRACT (ARC-1.0) ENFORCEMENT:\n`;
  
  prompt += `\nMANDATORY TIER DISTRIBUTION:\n`;
  prompt += `- Tier 1 (Knowledge): Maximum ${Math.round(requirements.maxTier1Ratio * 100)}% of questions\n`;
  prompt += `- Tier 2 (Applied Reasoning): MINIMUM ${requirements.minTier2Questions} questions - REQUIRED\n`;
  prompt += `- Tier 3 (Scenario/Debugging): MINIMUM ${requirements.minTier3Questions} questions - REQUIRED\n`;
  if (requirements.minTier4Questions > 0) {
    prompt += `- Tier 4 (Integrity-Weighted): MINIMUM ${requirements.minTier4Questions} questions - REQUIRED FOR MASTERY\n`;
  }
  
  if (isTechnical) {
    prompt += `\nTECHNICAL CONTENT DETECTED - CODING QUESTIONS REQUIRED:\n`;
    prompt += `- Include at least ${requirements.minCodingQuestionsForTechnical} coding question(s)\n`;
    prompt += `- Types: output prediction, debugging, code completion\n`;
    prompt += `- All code must be syntactically correct and runnable\n`;
    prompt += `- Include expected output in explanation\n`;
  }
  
  prompt += `\nFORBIDDEN ANTI-PATTERNS:\n`;
  prompt += `- MCQ-only quizzes (Tier 1 only)\n`;
  prompt += `- Obvious answers (only positive option, longest option)\n`;
  prompt += `- Same position for all correct answers\n`;
  prompt += `- Leading questions that hint at answers\n`;
  
  prompt += `\nQUESTION QUALITY REQUIREMENTS:\n`;
  prompt += `- Each distractor must be plausible\n`;
  prompt += `- Explanations must teach, not just state correctness\n`;
  prompt += `- Code examples must be copy-paste runnable\n`;
  
  return prompt;
}

// ===========================================
// RESPONSE INTEGRITY SCORING
// ===========================================

export interface ResponseIntegrityFactors {
  typingSpeed: number; // words per minute
  pausePatterns: boolean; // natural pauses present
  editingBehavior: boolean; // corrections made
  tabSwitches: number;
  pasteEvents: number;
  timeSpent: number; // seconds
  expectedTime: number; // seconds
}

export function calculateResponseIntegrity(factors: ResponseIntegrityFactors): {
  score: number;
  flags: string[];
  recommendation: 'accept' | 'review' | 'reject';
} {
  let score = 1.0;
  const flags: string[] = [];
  
  // Speed analysis (average typing is 40 WPM, max human is ~150 WPM)
  if (factors.typingSpeed > 150) {
    score -= 0.4;
    flags.push('Superhuman typing speed detected');
  } else if (factors.typingSpeed > 100) {
    score -= 0.15;
    flags.push('Very fast typing speed');
  }
  
  // Natural behavior
  if (!factors.pausePatterns) {
    score -= 0.1;
    flags.push('No natural pauses detected');
  }
  
  if (!factors.editingBehavior && factors.typingSpeed > 60) {
    score -= 0.1;
    flags.push('Perfect typing without corrections');
  }
  
  // Tab switching
  if (factors.tabSwitches > 5) {
    score -= 0.2;
    flags.push(`Excessive tab switching (${factors.tabSwitches} times)`);
  } else if (factors.tabSwitches > 2) {
    score -= 0.05;
  }
  
  // Paste detection
  if (factors.pasteEvents > 0) {
    score -= 0.3 * factors.pasteEvents;
    flags.push(`Content pasted ${factors.pasteEvents} time(s)`);
  }
  
  // Time analysis
  const timeRatio = factors.timeSpent / factors.expectedTime;
  if (timeRatio < 0.2) {
    score -= 0.3;
    flags.push('Completed much faster than expected');
  } else if (timeRatio < 0.4) {
    score -= 0.1;
    flags.push('Completed faster than expected');
  }
  
  // Normalize score
  score = Math.max(0, Math.min(1, score));
  
  // Determine recommendation
  let recommendation: 'accept' | 'review' | 'reject';
  if (score >= 0.8) {
    recommendation = 'accept';
  } else if (score >= 0.5) {
    recommendation = 'review';
  } else {
    recommendation = 'reject';
  }
  
  return { score, flags, recommendation };
}
