/**
 * CONTRACT 9 — ILLUSTRATED CONTENT GENERATION (ICG-1.0)
 *
 * Frozen contract. Required visual metadata is fail-closed for publishability:
 * caption, alt text, learning objective, textual reference, and type-specific
 * structural metadata must all be present.
 */

export type IllustrationType = 'chart' | 'diagram' | 'illustration' | 'technical';
export type ChartSubType = 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'histogram';
export type DiagramSubType = 'flowchart' | 'system' | 'cause-effect' | 'architecture' | 'mindmap' | 'sequence';
export type IllustrationSubType = 'character' | 'environment' | 'scene' | 'educational' | 'narrative';
export type TechnicalSubType = 'code-flow' | 'ui-mockup' | 'network' | 'schematic' | 'step-by-step';
export type VisualSubType = ChartSubType | DiagramSubType | IllustrationSubType | TechnicalSubType;
export type BookType = 'text' | 'illustrated' | 'comic' | 'workbook' | 'children';
export type IllustrationRequirement = 'required' | 'optional' | 'forbidden';

export interface IllustrationMeta {
  id: string;
  chapterId: string;
  sectionId: string;
  type: IllustrationType;
  subType: VisualSubType;
  learningObjective?: string;
  caption: string;
  altText: string;
  generatedBy: 'ai' | 'template' | 'user';
  imageUrl?: string;
  position: 'inline' | 'full-width' | 'sidebar';
  referencedInText: boolean;
  createdAt: string;
  hasAxisLabels?: boolean;
  hasLegend?: boolean;
}

export interface IllustrationAuditResult {
  passed: boolean;
  score: number;
  missingRequired: string[];
  orphanImages: string[];
  brokenVisuals: string[];
  missingCaptions: string[];
  missingLearningObjectives: string[];
  unreferencedImages: string[];
  styleInconsistencies: string[];
  accessibilityIssues: string[];
  structuralIssues: string[];
  warnings: string[];
  blockerReasons: string[];
}

export interface VisualPlacement {
  paragraphIndex: number;
  sectionId: string;
  reason: string;
  suggestedType: IllustrationType;
  suggestedSubType: VisualSubType;
  learningObjective?: string;
}

export const ILLUSTRATION_REQUIREMENTS: Record<BookType, IllustrationRequirement> = {
  illustrated: 'required', comic: 'required', children: 'required', workbook: 'optional', text: 'optional',
};
export const STEM_CATEGORIES = ['science', 'technology', 'medicine', 'finance', 'economics'] as const;
export type STEMCategory = typeof STEM_CATEGORIES[number];

export function getIllustrationRequirement(bookType: BookType, _category: string): IllustrationRequirement {
  return ILLUSTRATION_REQUIREMENTS[bookType] ?? 'optional';
}

export const VALID_SUBTYPES: Record<IllustrationType, VisualSubType[]> = {
  chart: ['line', 'bar', 'pie', 'scatter', 'area', 'histogram'],
  diagram: ['flowchart', 'system', 'cause-effect', 'architecture', 'mindmap', 'sequence'],
  illustration: ['character', 'environment', 'scene', 'educational', 'narrative'],
  technical: ['code-flow', 'ui-mockup', 'network', 'schematic', 'step-by-step'],
};
export function isValidVisualType(type: IllustrationType, subType: VisualSubType): boolean {
  return VALID_SUBTYPES[type]?.includes(subType) ?? false;
}

export interface IllustrationPurpose {
  type: IllustrationType;
  validFor: string[];
  invalidFor: string[];
  description: string;
}

export const ILLUSTRATION_PURPOSES: Record<IllustrationType, IllustrationPurpose> = {
  chart: { type: 'chart', validFor: ['facts', 'comparisons', 'trends', 'analytics', 'data-visualization'], invalidFor: ['narrative', 'decoration', 'filler'], description: 'Used for presenting numerical data, comparisons, and trends' },
  diagram: { type: 'diagram', validFor: ['processes', 'reasoning', 'systems', 'workflows', 'relationships'], invalidFor: ['decoration', 'filler', 'raw-data'], description: 'Used for explaining processes, systems, and logical relationships' },
  illustration: { type: 'illustration', validFor: ['engagement', 'narrative', 'memory-anchoring', 'scene-setting', 'character-introduction'], invalidFor: ['data-presentation', 'technical-explanation'], description: 'Used for engagement, storytelling, and visual memory anchoring' },
  technical: { type: 'technical', validFor: ['programming', 'engineering', 'applied-learning', 'step-by-step-guides', 'architecture'], invalidFor: ['narrative', 'decoration', 'general-audience'], description: 'Used for technical documentation, code visualization, and engineering diagrams' },
};

const VISUAL_TRIGGER_PATTERNS = {
  chart: [/\b(data|statistics|numbers|percentage|growth|decline|trend)\b/i, /\b(compared to|versus|vs\.?|comparison)\b/i, /\b(\d+%|\d+\s*percent)\b/i, /\b(increase|decrease|rise|fall|doubled|tripled)\b/i],
  diagram: [/\b(process|flow|steps?|workflow|pipeline)\b/i, /\b(architecture|structure|system|framework)\b/i, /\b(relationship|connection|dependency|hierarchy)\b/i, /\b(cause|effect|leads? to|results? in)\b/i],
  technical: [/\b(code|function|class|method|api|algorithm)\b/i, /\b(network|server|client|database|request)\b/i, /\b(diagram|schematic|blueprint|layout)\b/i, /```[\s\S]*?```/],
  illustration: [/\b(imagine|picture|visualize|scene)\b/i, /\b(character|protagonist|hero|villain)\b/i, /\b(setting|environment|landscape|world)\b/i],
};

export function analyzeContentForVisuals(content: string, _bookType: BookType, _category: string): VisualPlacement[] {
  const placements: VisualPlacement[] = [];
  content.split(/\n\n+/).forEach((paragraph, index) => {
    if (paragraph.length < 50) return;
    for (const [type, patterns] of Object.entries(VISUAL_TRIGGER_PATTERNS)) {
      if (patterns.filter(p => p.test(paragraph)).length >= 2) {
        placements.push({
          paragraphIndex: index,
          sectionId: `section-${Math.floor(index / 5)}`,
          reason: `Content suggests ${type} visualization`,
          suggestedType: type as IllustrationType,
          suggestedSubType: getSuggestedSubType(type as IllustrationType, paragraph),
        });
      }
    }
  });
  return placements;
}

function getSuggestedSubType(type: IllustrationType, content: string): VisualSubType {
  switch (type) {
    case 'chart': if (/trend|growth|time|over time/i.test(content)) return 'line'; if (/compar|versus|vs/i.test(content)) return 'bar'; if (/percent|proportion|share/i.test(content)) return 'pie'; return 'bar';
    case 'diagram': if (/process|step|flow/i.test(content)) return 'flowchart'; if (/architect|system|component/i.test(content)) return 'architecture'; if (/cause|effect|leads/i.test(content)) return 'cause-effect'; return 'flowchart';
    case 'technical': if (/code|function|class/i.test(content)) return 'code-flow'; if (/network|server|api/i.test(content)) return 'network'; if (/step|guide|how.to/i.test(content)) return 'step-by-step'; return 'schematic';
    case 'illustration': if (/character|person|hero/i.test(content)) return 'character'; if (/scene|moment|action/i.test(content)) return 'scene'; if (/setting|place|environment/i.test(content)) return 'environment'; return 'educational';
  }
}

export interface IllustrationAuditInput {
  bookType: BookType;
  category: string;
  chapters: { id: string; content: string; illustrations: IllustrationMeta[] }[];
}

export function auditIllustrations(input: IllustrationAuditInput): IllustrationAuditResult {
  const result: IllustrationAuditResult = {
    passed: true,
    score: 100,
    missingRequired: [],
    orphanImages: [],
    brokenVisuals: [],
    missingCaptions: [],
    missingLearningObjectives: [],
    unreferencedImages: [],
    styleInconsistencies: [],
    accessibilityIssues: [],
    structuralIssues: [],
    warnings: [],
    blockerReasons: [],
  };

  const requirement = getIllustrationRequirement(input.bookType, input.category);
  for (const chapter of input.chapters) {
    if (requirement === 'required' && chapter.illustrations.length === 0) {
      result.missingRequired.push(`Chapter ${chapter.id}: required book type has no illustration`);
    }

    for (const visual of chapter.illustrations) {
      if (!visual.caption?.trim()) result.missingCaptions.push(`Image ${visual.id} in chapter ${chapter.id}`);
      if (!visual.altText?.trim()) result.accessibilityIssues.push(`Image ${visual.id} missing alt text`);
      if (!visual.learningObjective?.trim()) result.missingLearningObjectives.push(`Image ${visual.id} missing learning objective`);
      if (!visual.referencedInText) result.unreferencedImages.push(`Image ${visual.id} not referenced in chapter text`);
      if (!visual.imageUrl?.trim()) result.brokenVisuals.push(`Image ${visual.id} has no URL`);
      if (!isValidVisualType(visual.type, visual.subType)) result.structuralIssues.push(`Image ${visual.id} has invalid type/subtype ${visual.type}/${visual.subType}`);
      if (visual.type === 'chart' && visual.hasAxisLabels !== true) result.structuralIssues.push(`Chart ${visual.id} missing axis-label evidence`);
      if ((visual.type === 'chart' || visual.type === 'diagram') && visual.hasLegend !== true) result.structuralIssues.push(`${visual.type} ${visual.id} missing legend evidence`);
    }
  }

  const deductions =
    result.missingRequired.length * 20 + result.brokenVisuals.length * 15 + result.missingCaptions.length * 8 +
    result.missingLearningObjectives.length * 8 + result.accessibilityIssues.length * 5 + result.unreferencedImages.length * 5 +
    result.structuralIssues.length * 10;
  result.score = Math.max(0, 100 - deductions);

  if (result.missingRequired.length) result.blockerReasons.push('Required book type has chapters without visuals');
  if (result.brokenVisuals.length) result.blockerReasons.push(`${result.brokenVisuals.length} broken image(s)`);
  if (result.missingCaptions.length) result.blockerReasons.push('Visual captions are mandatory');
  if (result.missingLearningObjectives.length) result.blockerReasons.push('Visual learning objectives are mandatory');
  if (result.accessibilityIssues.length) result.blockerReasons.push('Visual alt text is mandatory');
  if (result.unreferencedImages.length) result.blockerReasons.push('Every visual must be referenced in text');
  if (result.structuralIssues.length) result.blockerReasons.push('Chart/diagram structural metadata is incomplete');

  result.passed = result.blockerReasons.length === 0 && result.score >= 60;
  return result;
}

export function buildIllustrationPrompt(
  type: IllustrationType,
  subType: VisualSubType,
  context: { bookType: BookType; category: string; chapterTitle: string; sectionContent: string; learningObjective?: string; existingStyle?: string }
): string {
  const purpose = ILLUSTRATION_PURPOSES[type];
  let prompt = `Generate a ${subType} ${type} for an educational ${context.bookType} book.\n\nChapter: ${context.chapterTitle}\nCategory: ${context.category}\n`;
  if (context.learningObjective) prompt += `Learning Objective: ${context.learningObjective}\n`;
  prompt += `\nContext:\n${context.sectionContent.slice(0, 500)}\n\nPurpose: ${purpose.description}\nValid uses: ${purpose.validFor.join(', ')}\nAVOID: ${purpose.invalidFor.join(', ')}\n`;
  if (context.existingStyle) prompt += `\nMaintain visual consistency with: ${context.existingStyle}\n`;
  prompt += '\nRequirements:\n- Educational, not decorative\n- Directly support a stated learning objective\n- Clear caption and alt-text metadata\n- Must be referenced from chapter text\n';
  if (type === 'chart') prompt += '- Include clear axis labels and a legend\n- Use sourced or explicitly synthetic/example data; never fabricate empirical claims\n';
  if (type === 'diagram') prompt += '- Include clear labels and a legend\n- Show relationships and flow direction\n';
  return prompt;
}

export const ICG_CONTRACT_VERSION = '1.0';
export const ICG_CONTRACT_FROZEN = true;
export const ICG_CONTRACT_SUMMARY = `CONTRACT 9 — ILLUSTRATED CONTENT GENERATION (ICG-1.0)\nRequired visuals and metadata are publication-blocking when absent.\nVERSION: ${ICG_CONTRACT_VERSION}\nSTATUS: FROZEN`;
