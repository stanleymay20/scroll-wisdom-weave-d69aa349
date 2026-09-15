/**
 * CONTRACT 11 — VISUAL REFERENCING IN ASSESSMENT (VRA-1.0)
 *
 * Frozen enforcement contract. When visuals exist, the 30% Tier 2/3 reference
 * rate is blocking, and every claimed visual reference must resolve to an
 * illustration in the chapter.
 */

import type { IllustrationMeta, IllustrationType } from './illustratedContentContract';

export type AssessmentTier = 1 | 2 | 3 | 4;

export interface VisualReference {
  illustrationId: string;
  figureNumber: string;
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

export const MINIMUM_VISUAL_REFERENCE_RATE = 0.30;
export const VISUAL_REQUIRED_QUESTION_TYPES = [
  'data-interpretation', 'process-analysis', 'diagram-reading', 'trend-identification', 'system-understanding', 'comparative-analysis',
] as const;
export type VisualRequiredQuestionType = typeof VISUAL_REQUIRED_QUESTION_TYPES[number];

export function generateFigureReference(illustration: IllustrationMeta, chapterNumber: number, indexInChapter: number): string {
  const typePrefix: Record<IllustrationType, string> = { chart: 'Chart', diagram: 'Diagram', illustration: 'Figure', technical: 'Figure' };
  return `${typePrefix[illustration.type] || 'Figure'} ${chapterNumber}.${indexInChapter + 1}`;
}

export function createVisualReference(illustration: IllustrationMeta, chapterNumber: number, indexInChapter: number): VisualReference {
  return {
    illustrationId: illustration.id,
    figureNumber: generateFigureReference(illustration, chapterNumber, indexInChapter),
    caption: illustration.caption,
    type: illustration.type,
    chapterNumber,
    sectionId: illustration.sectionId,
  };
}

export interface VisualQuestionTemplate {
  tier: AssessmentTier;
  referenceType: 'direct' | 'comparative' | 'analytical';
  template: string;
  visualTypes: IllustrationType[];
}

export const VISUAL_QUESTION_TEMPLATES: VisualQuestionTemplate[] = [
  { tier: 2, referenceType: 'direct', template: 'Based on {figureRef}, what does the {dataElement} indicate about {concept}?', visualTypes: ['chart', 'diagram'] },
  { tier: 2, referenceType: 'direct', template: 'Examine {figureRef}. Which component is responsible for {function}?', visualTypes: ['diagram', 'technical'] },
  { tier: 2, referenceType: 'analytical', template: 'Looking at {figureRef}, predict what would happen if {variable} were to change.', visualTypes: ['chart', 'diagram'] },
  { tier: 3, referenceType: 'comparative', template: 'Compare {figureRef1} with {figureRef2}. What does this comparison reveal about {concept}?', visualTypes: ['chart', 'diagram', 'illustration'] },
  { tier: 3, referenceType: 'analytical', template: 'The system shown in {figureRef} has failed at step {step}. Identify the root cause and propose a fix.', visualTypes: ['diagram', 'technical'] },
  { tier: 3, referenceType: 'direct', template: 'Based on the trend in {figureRef}, what strategy would you recommend for {scenario}?', visualTypes: ['chart'] },
];

export function getTemplatesForVisuals(availableVisuals: IllustrationMeta[], tier: AssessmentTier): VisualQuestionTemplate[] {
  const visualTypes = [...new Set(availableVisuals.map(v => v.type))];
  return VISUAL_QUESTION_TEMPLATES.filter(template => template.tier === tier && template.visualTypes.some(type => visualTypes.includes(type)));
}

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
  const tier2Questions = questions.filter(q => q.tier === 2);
  const tier3Questions = questions.filter(q => q.tier === 3);
  const highTierQuestions = [...tier2Questions, ...tier3Questions];
  const visualIds = new Set(chapterVisuals.illustrations.map(v => v.id));

  const validVisualReferencedQuestions = highTierQuestions.filter(q => {
    if (!q.referencesVisual) return false;
    if (!q.visualReferenceId || !visualIds.has(q.visualReferenceId)) {
      violations.push({
        questionId: q.id,
        tier: q.tier,
        message: 'Question claims a visual reference that does not resolve to a chapter illustration.',
        severity: 'critical',
        suggestedFix: 'Attach the exact illustration ID used by the question.',
      });
      return false;
    }
    return true;
  });

  const compliancePercentage = highTierQuestions.length > 0
    ? (validVisualReferencedQuestions.length / highTierQuestions.length) * 100
    : 100;

  if (hasVisuals && highTierQuestions.length > 0) {
    const referenceRate = validVisualReferencedQuestions.length / highTierQuestions.length;
    if (referenceRate < MINIMUM_VISUAL_REFERENCE_RATE) {
      violations.push({
        questionId: 'GLOBAL', tier: 2,
        message: `Only ${Math.round(referenceRate * 100)}% of Tier 2/3 questions contain valid visual references. Minimum is ${MINIMUM_VISUAL_REFERENCE_RATE * 100}%.`,
        severity: 'critical',
        suggestedFix: 'Add valid visual references to additional higher-tier questions.',
      });
    }

    if (chapterVisuals.hasCharts) {
      const chartIds = new Set(chapterVisuals.illustrations.filter(v => v.type === 'chart').map(v => v.id));
      const chartReferences = highTierQuestions.filter(q => q.visualReferenceId && chartIds.has(q.visualReferenceId));
      if (chartReferences.length === 0) violations.push({ questionId: 'GLOBAL', tier: 2, message: 'Chapter contains charts but no Tier 2/3 question references a chart.', severity: 'critical', suggestedFix: 'Add a chart interpretation question.' });
    }

    if (chapterVisuals.hasDiagrams) {
      const diagramIds = new Set(chapterVisuals.illustrations.filter(v => v.type === 'diagram').map(v => v.id));
      const diagramReferences = highTierQuestions.filter(q => q.visualReferenceId && diagramIds.has(q.visualReferenceId));
      if (diagramReferences.length === 0) violations.push({ questionId: 'GLOBAL', tier: 2, message: 'Chapter contains diagrams but no Tier 2/3 question references a diagram.', severity: 'critical', suggestedFix: 'Add a process/system analysis question.' });
    }
  }

  let score = 100;
  score -= violations.filter(v => v.severity === 'critical').length * 20;
  score -= violations.filter(v => v.severity === 'warning').length * 5;
  score = Math.max(0, score);

  return {
    isValid: violations.every(v => v.severity !== 'critical'),
    violations,
    score: Math.round(score),
    missingVisualReferences: hasVisuals
      ? Math.max(0, Math.ceil(highTierQuestions.length * MINIMUM_VISUAL_REFERENCE_RATE) - validVisualReferencedQuestions.length)
      : 0,
    totalTier2Questions: tier2Questions.length,
    totalTier3Questions: tier3Questions.length,
    visualReferencedQuestions: validVisualReferencedQuestions.length,
    compliancePercentage: Math.round(compliancePercentage),
  };
}

export function buildVisualAwareQuestionPrompt(
  _chapterContent: string,
  visuals: VisualReference[],
  targetTier: AssessmentTier,
  existingQuestionCount: number
): string {
  if (visuals.length === 0) return '';
  let prompt = `\n\n[CONTRACT 11 - VRA-1.0 VISUAL REFERENCE REQUIREMENT]\n`;
  prompt += `This chapter contains ${visuals.length} visual element(s).\n\nAVAILABLE VISUALS:\n`;
  visuals.forEach((v, i) => { prompt += `${i + 1}. ${v.figureNumber} [id=${v.illustrationId}] (${v.type}): "${v.caption}"\n`; });
  prompt += `\nAt least ${Math.ceil(existingQuestionCount * MINIMUM_VISUAL_REFERENCE_RATE)} Tier ${targetTier} questions MUST reference these visuals by exact illustration ID.\n`;
  prompt += '- Require interpretation, analysis, or application of the visual.\n- Do not allow answering without understanding the visual.\n';
  return prompt;
}

export function injectVisualReference(questionText: string, visual: VisualReference): string {
  if (questionText.includes(visual.figureNumber)) return questionText;
  return `Refer to ${visual.figureNumber}. ${questionText.charAt(0).toLowerCase()}${questionText.slice(1)}`;
}

export const VRA_CONTRACT_VERSION = '1.0';
export const VRA_CONTRACT_FROZEN = true;
export const VRA_CONTRACT_SUMMARY = `
CONTRACT 11 — VISUAL REFERENCING IN ASSESSMENT (VRA-1.0)
CORE PRINCIPLE: Tier 2/3 questions must carry resolvable visual IDs when visuals are present.
REQUIREMENT: minimum ${MINIMUM_VISUAL_REFERENCE_RATE * 100}% valid visual-reference rate.
ENFORCEMENT: unresolved references or sub-threshold coverage are blocking violations.
VERSION: ${VRA_CONTRACT_VERSION}
STATUS: FROZEN
`;
