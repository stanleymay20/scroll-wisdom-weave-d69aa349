/**
 * CONTRACT 11 — VISUAL REFERENCING IN ASSESSMENT (VRA-1.0)
 * 
 * This contract mandates that Tier 2/3 assessment questions must reference
 * visuals when present, creating a hard-link between visual literacy and
 * assessment integrity.
 * 
 * FROZEN CONTRACT - Changes require versioned upgrades (VRA-1.1, VRA-1.2, etc.)
 */

import type { IllustrationMeta, IllustrationType } from './illustratedContentContract';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type AssessmentTier = 1 | 2 | 3 | 4;

export interface VisualReference {
  illustrationId: string;
  figureNumber: string; // e.g., "Figure 2.3", "Diagram 1.1"
  caption: string;
  type: IllustrationType;
  chapterNumber: number;
  sectionId: string;
}

export interface VisualBasedQuestion {
  id: string;
  tier: AssessmentTier;
  questionText: string;
  visualReferences: VisualReference[];
  referenceIntegration: 'direct' | 'comparative' | 'analytical';
  requiresVisualUnderstanding: boolean;
}

export interface VRAValidationResult {
  isValid: boolean;
  violations: VRAViolation[];
  score: number;
  missingVisualReferences: number;
  totalTier2Questions: number;
  totalTier3Questions: number;
  visualReferencedQuestions: number;
  compliancePercentage: number;
}

export interface VRAViolation {
  questionId: string;
  tier: AssessmentTier;
  message: string;
  severity: 'warning' | 'critical';
  suggestedFix?: string;
}

export interface ChapterVisualContext {
  chapterId: string;
  chapterNumber: number;
  illustrations: IllustrationMeta[];
  hasCharts: boolean;
  hasDiagrams: boolean;
  hasTechnical: boolean;
}

// ============================================================================
// VISUAL REFERENCE REQUIREMENTS
// ============================================================================

/**
 * Minimum percentage of Tier 2/3 questions that must reference visuals
 * when visuals are present in the chapter
 */
export const MINIMUM_VISUAL_REFERENCE_RATE = 0.30; // 30%

/**
 * Question types that MUST reference visuals when available
 */
export const VISUAL_REQUIRED_QUESTION_TYPES = [
  'data-interpretation',
  'process-analysis',
  'diagram-reading',
  'trend-identification',
  'system-understanding',
  'comparative-analysis',
] as const;

export type VisualRequiredQuestionType = typeof VISUAL_REQUIRED_QUESTION_TYPES[number];

// ============================================================================
// VISUAL REFERENCE GENERATION
// ============================================================================

/**
 * Generate a figure reference string for an illustration
 */
export function generateFigureReference(
  illustration: IllustrationMeta,
  chapterNumber: number,
  indexInChapter: number
): string {
  const typePrefix: Record<IllustrationType, string> = {
    chart: 'Chart',
    diagram: 'Diagram',
    illustration: 'Figure',
    technical: 'Figure',
  };

  const prefix = typePrefix[illustration.type] || 'Figure';
  return `${prefix} ${chapterNumber}.${indexInChapter + 1}`;
}

/**
 * Create a VisualReference from an IllustrationMeta
 */
export function createVisualReference(
  illustration: IllustrationMeta,
  chapterNumber: number,
  indexInChapter: number
): VisualReference {
  return {
    illustrationId: illustration.id,
    figureNumber: generateFigureReference(illustration, chapterNumber, indexInChapter),
    caption: illustration.caption,
    type: illustration.type,
    chapterNumber,
    sectionId: illustration.sectionId,
  };
}

// ============================================================================
// QUESTION TEMPLATES WITH VISUAL REFERENCES
// ============================================================================

export interface VisualQuestionTemplate {
  tier: AssessmentTier;
  referenceType: 'direct' | 'comparative' | 'analytical';
  template: string;
  visualTypes: IllustrationType[];
}

export const VISUAL_QUESTION_TEMPLATES: VisualQuestionTemplate[] = [
  // Tier 2 - Applied Reasoning with Visuals
  {
    tier: 2,
    referenceType: 'direct',
    template: 'Based on {figureRef}, what does the {dataElement} indicate about {concept}?',
    visualTypes: ['chart', 'diagram'],
  },
  {
    tier: 2,
    referenceType: 'direct',
    template: 'Examine {figureRef}. Which component is responsible for {function}?',
    visualTypes: ['diagram', 'technical'],
  },
  {
    tier: 2,
    referenceType: 'analytical',
    template: 'Looking at {figureRef}, predict what would happen if {variable} were to change.',
    visualTypes: ['chart', 'diagram'],
  },

  // Tier 3 - Scenario & Debugging with Visuals
  {
    tier: 3,
    referenceType: 'comparative',
    template: 'Compare {figureRef1} with {figureRef2}. What does this comparison reveal about {concept}?',
    visualTypes: ['chart', 'diagram', 'illustration'],
  },
  {
    tier: 3,
    referenceType: 'analytical',
    template: 'The system shown in {figureRef} has failed at step {step}. Identify the root cause and propose a fix.',
    visualTypes: ['diagram', 'technical'],
  },
  {
    tier: 3,
    referenceType: 'direct',
    template: 'Based on the trend in {figureRef}, what strategy would you recommend for {scenario}?',
    visualTypes: ['chart'],
  },
];

/**
 * Get appropriate question templates for available visuals
 */
export function getTemplatesForVisuals(
  availableVisuals: IllustrationMeta[],
  tier: AssessmentTier
): VisualQuestionTemplate[] {
  const visualTypes = [...new Set(availableVisuals.map(v => v.type))];
  
  return VISUAL_QUESTION_TEMPLATES.filter(template => 
    template.tier === tier &&
    template.visualTypes.some(type => visualTypes.includes(type))
  );
}

// ============================================================================
// VALIDATION & ENFORCEMENT
// ============================================================================

/**
 * Validate assessment questions against VRA-1.0 requirements
 */
export function validateVisualReferences(
  questions: {
    id: string;
    tier: AssessmentTier;
    questionText: string;
    referencesVisual: boolean;
    visualReferenceId?: string;
  }[],
  chapterVisuals: ChapterVisualContext
): VRAValidationResult {
  const violations: VRAViolation[] = [];
  const hasVisuals = chapterVisuals.illustrations.length > 0;

  // Filter to Tier 2 and 3 questions only
  const tier2Questions = questions.filter(q => q.tier === 2);
  const tier3Questions = questions.filter(q => q.tier === 3);
  const highTierQuestions = [...tier2Questions, ...tier3Questions];

  // Count visual-referenced questions
  const visualReferencedQuestions = highTierQuestions.filter(q => q.referencesVisual);

  // Calculate compliance
  const compliancePercentage = highTierQuestions.length > 0
    ? (visualReferencedQuestions.length / highTierQuestions.length) * 100
    : 100;

  // Check if visual reference rate is met
  if (hasVisuals && highTierQuestions.length > 0) {
    const referenceRate = visualReferencedQuestions.length / highTierQuestions.length;

    if (referenceRate < MINIMUM_VISUAL_REFERENCE_RATE) {
      violations.push({
        questionId: 'GLOBAL',
        tier: 2,
        message: `Only ${Math.round(referenceRate * 100)}% of Tier 2/3 questions reference visuals. Minimum is ${MINIMUM_VISUAL_REFERENCE_RATE * 100}%.`,
        severity: 'warning',
        suggestedFix: 'Add visual references to more higher-tier questions.',
      });
    }

    // Check if charts are present but not referenced
    if (chapterVisuals.hasCharts) {
      const chartReferences = questions.filter(q => 
        q.referencesVisual && 
        q.questionText.toLowerCase().includes('chart')
      );

      if (chartReferences.length === 0) {
        violations.push({
          questionId: 'GLOBAL',
          tier: 2,
          message: 'Chapter contains charts but no questions reference them.',
          severity: 'warning',
          suggestedFix: 'Include data interpretation questions that reference the charts.',
        });
      }
    }

    // Check if diagrams are present but not referenced
    if (chapterVisuals.hasDiagrams) {
      const diagramReferences = questions.filter(q => 
        q.referencesVisual && 
        q.questionText.toLowerCase().includes('diagram')
      );

      if (diagramReferences.length === 0) {
        violations.push({
          questionId: 'GLOBAL',
          tier: 2,
          message: 'Chapter contains diagrams but no questions reference them.',
          severity: 'warning',
          suggestedFix: 'Include process or system analysis questions that reference the diagrams.',
        });
      }
    }
  }

  // Score calculation
  let score = 100;
  score -= violations.filter(v => v.severity === 'critical').length * 20;
  score -= violations.filter(v => v.severity === 'warning').length * 5;
  score = Math.max(0, score);

  // Compliance percentage affects score
  if (hasVisuals && compliancePercentage < MINIMUM_VISUAL_REFERENCE_RATE * 100) {
    score -= (MINIMUM_VISUAL_REFERENCE_RATE * 100 - compliancePercentage);
  }

  return {
    isValid: violations.filter(v => v.severity === 'critical').length === 0,
    violations,
    score: Math.max(0, Math.round(score)),
    missingVisualReferences: hasVisuals 
      ? Math.max(0, Math.ceil(highTierQuestions.length * MINIMUM_VISUAL_REFERENCE_RATE) - visualReferencedQuestions.length)
      : 0,
    totalTier2Questions: tier2Questions.length,
    totalTier3Questions: tier3Questions.length,
    visualReferencedQuestions: visualReferencedQuestions.length,
    compliancePercentage: Math.round(compliancePercentage),
  };
}

// ============================================================================
// PROMPT BUILDER FOR VISUAL-AWARE QUESTION GENERATION
// ============================================================================

/**
 * Build a prompt for generating visual-referenced questions
 */
export function buildVisualAwareQuestionPrompt(
  chapterContent: string,
  visuals: VisualReference[],
  targetTier: AssessmentTier,
  existingQuestionCount: number
): string {
  if (visuals.length === 0) {
    return ''; // No visuals to reference
  }

  let prompt = `\n\n[CONTRACT 11 - VRA-1.0 VISUAL REFERENCE REQUIREMENT]\n`;
  prompt += `This chapter contains ${visuals.length} visual element(s) that MUST be referenced in assessment.\n\n`;
  
  prompt += `AVAILABLE VISUALS:\n`;
  visuals.forEach((v, i) => {
    prompt += `${i + 1}. ${v.figureNumber} (${v.type}): "${v.caption}"\n`;
  });

  prompt += `\n`;
  prompt += `REQUIREMENT: At least ${Math.ceil(existingQuestionCount * MINIMUM_VISUAL_REFERENCE_RATE)} Tier ${targetTier} questions MUST reference these visuals.\n`;
  prompt += `\n`;
  prompt += `QUESTION FORMAT for visual references:\n`;
  prompt += `- Start with "Refer to [Figure X.X]..." or "Based on [Diagram X.X]..."\n`;
  prompt += `- Require the learner to interpret, analyze, or apply the visual content\n`;
  prompt += `- DO NOT ask simple recall questions about visuals\n`;
  prompt += `- DO NOT allow answering without actually understanding the visual\n`;
  prompt += `\n`;

  // Add templates
  const templates = getTemplatesForVisuals(
    visuals.map(v => ({ type: v.type } as IllustrationMeta)),
    targetTier
  );

  if (templates.length > 0) {
    prompt += `EXAMPLE TEMPLATES:\n`;
    templates.slice(0, 3).forEach(t => {
      prompt += `- "${t.template}"\n`;
    });
  }

  return prompt;
}

/**
 * Inject visual references into existing question text
 */
export function injectVisualReference(
  questionText: string,
  visual: VisualReference
): string {
  const prefix = `Refer to ${visual.figureNumber}. `;
  
  // Avoid double-injection
  if (questionText.includes(visual.figureNumber)) {
    return questionText;
  }

  // Capitalize first letter if needed after injection
  const updatedQuestion = questionText.charAt(0).toLowerCase() + questionText.slice(1);
  
  return prefix + updatedQuestion;
}

// ============================================================================
// CONTRACT EXPORT
// ============================================================================

export const VRA_CONTRACT_VERSION = '1.0';
export const VRA_CONTRACT_FROZEN = true;

export const VRA_CONTRACT_SUMMARY = `
CONTRACT 11 — VISUAL REFERENCING IN ASSESSMENT (VRA-1.0)

CORE PRINCIPLE: Tier 2/3 questions MUST reference visuals when present.

REQUIREMENTS:
- Minimum ${MINIMUM_VISUAL_REFERENCE_RATE * 100}% of Tier 2/3 questions must reference visuals
- Charts present → Data interpretation questions required
- Diagrams present → Process analysis questions required
- Visual references use formal notation (Figure X.X, Diagram X.X)

QUESTION FORMAT:
- "Refer to Figure 2.3 — what does the trend indicate..."
- "Based on Diagram 1.1, which component..."
- "Compare Chart 3.2 with Chart 3.4..."

ENFORCEMENT:
- Validation on quiz generation
- Warning if below minimum reference rate
- Score deduction for unreferenced visuals

BENEFITS:
- Prevents shallow learning (can't just memorize text)
- Validates visual literacy
- Reinforces illustration value
- Increases assessment integrity

VERSION: ${VRA_CONTRACT_VERSION}
STATUS: ${VRA_CONTRACT_FROZEN ? 'FROZEN' : 'DRAFT'}
`;
