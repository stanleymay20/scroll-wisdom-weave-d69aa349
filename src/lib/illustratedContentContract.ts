/**
 * CONTRACT 9 — ILLUSTRATED CONTENT GENERATION (ICG-1.0)
 * 
 * This contract governs when, how, and why images, charts, graphs,
 * and illustrations are generated — so visuals add learning value, not noise.
 * 
 * FROZEN CONTRACT - Changes require versioned upgrades (ICG-1.1, ICG-1.2, etc.)
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

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
}

export interface IllustrationAuditResult {
  passed: boolean;
  score: number;
  missingRequired: string[];
  orphanImages: string[];
  brokenVisuals: string[];
  missingCaptions: string[];
  unreferencedImages: string[];
  styleInconsistencies: string[];
  accessibilityIssues: string[];
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

// ============================================================================
// BOOK TYPE → ILLUSTRATION REQUIREMENT MAPPING
// ============================================================================

export const ILLUSTRATION_REQUIREMENTS: Record<BookType, IllustrationRequirement> = {
  illustrated: 'required',
  comic: 'required',
  children: 'required',
  workbook: 'optional',
  text: 'optional',
};

// Categories where illustrations are required for text books
export const STEM_CATEGORIES = [
  'science',
  'technology',
  'medicine',
  'finance',
  'economics',
] as const;

export type STEMCategory = typeof STEM_CATEGORIES[number];

/**
 * Determine if illustrations are required for a given book type and category
 */
export function getIllustrationRequirement(
  bookType: BookType,
  category: string
): IllustrationRequirement {
  // Explicit book types
  if (bookType === 'illustrated' || bookType === 'comic' || bookType === 'children') {
    return 'required';
  }

  // STEM categories for text books
  if (bookType === 'text' && STEM_CATEGORIES.includes(category as STEMCategory)) {
    return 'optional'; // Strongly recommended but not blocking
  }

  // Philosophy, literature, essays - optional
  if (['philosophy', 'fiction', 'non_fiction', 'arts'].includes(category)) {
    return 'optional';
  }

  return 'optional';
}

// ============================================================================
// ILLUSTRATION TYPE VALIDATION
// ============================================================================

export const VALID_SUBTYPES: Record<IllustrationType, VisualSubType[]> = {
  chart: ['line', 'bar', 'pie', 'scatter', 'area', 'histogram'],
  diagram: ['flowchart', 'system', 'cause-effect', 'architecture', 'mindmap', 'sequence'],
  illustration: ['character', 'environment', 'scene', 'educational', 'narrative'],
  technical: ['code-flow', 'ui-mockup', 'network', 'schematic', 'step-by-step'],
};

export function isValidVisualType(type: IllustrationType, subType: VisualSubType): boolean {
  return VALID_SUBTYPES[type]?.includes(subType) ?? false;
}

// ============================================================================
// ILLUSTRATION PURPOSE VALIDATION
// ============================================================================

export interface IllustrationPurpose {
  type: IllustrationType;
  validFor: string[];
  invalidFor: string[];
  description: string;
}

export const ILLUSTRATION_PURPOSES: Record<IllustrationType, IllustrationPurpose> = {
  chart: {
    type: 'chart',
    validFor: ['facts', 'comparisons', 'trends', 'analytics', 'data-visualization'],
    invalidFor: ['narrative', 'decoration', 'filler'],
    description: 'Used for presenting numerical data, comparisons, and trends',
  },
  diagram: {
    type: 'diagram',
    validFor: ['processes', 'reasoning', 'systems', 'workflows', 'relationships'],
    invalidFor: ['decoration', 'filler', 'raw-data'],
    description: 'Used for explaining processes, systems, and logical relationships',
  },
  illustration: {
    type: 'illustration',
    validFor: ['engagement', 'narrative', 'memory-anchoring', 'scene-setting', 'character-introduction'],
    invalidFor: ['data-presentation', 'technical-explanation'],
    description: 'Used for engagement, storytelling, and visual memory anchoring',
  },
  technical: {
    type: 'technical',
    validFor: ['programming', 'engineering', 'applied-learning', 'step-by-step-guides', 'architecture'],
    invalidFor: ['narrative', 'decoration', 'general-audience'],
    description: 'Used for technical documentation, code visualization, and engineering diagrams',
  },
};

// ============================================================================
// CONTENT ANALYSIS FOR VISUAL PLACEMENT
// ============================================================================

const VISUAL_TRIGGER_PATTERNS = {
  chart: [
    /\b(data|statistics|numbers|percentage|growth|decline|trend)\b/i,
    /\b(compared to|versus|vs\.?|comparison)\b/i,
    /\b(\d+%|\d+\s*percent)\b/i,
    /\b(increase|decrease|rise|fall|doubled|tripled)\b/i,
  ],
  diagram: [
    /\b(process|flow|steps?|workflow|pipeline)\b/i,
    /\b(architecture|structure|system|framework)\b/i,
    /\b(relationship|connection|dependency|hierarchy)\b/i,
    /\b(cause|effect|leads? to|results? in)\b/i,
  ],
  technical: [
    /\b(code|function|class|method|api|algorithm)\b/i,
    /\b(network|server|client|database|request)\b/i,
    /\b(diagram|schematic|blueprint|layout)\b/i,
    /```[\s\S]*?```/,
  ],
  illustration: [
    /\b(imagine|picture|visualize|scene)\b/i,
    /\b(character|protagonist|hero|villain)\b/i,
    /\b(setting|environment|landscape|world)\b/i,
  ],
};

/**
 * Analyze content to suggest where visuals should be placed
 */
export function analyzeContentForVisuals(
  content: string,
  bookType: BookType,
  category: string
): VisualPlacement[] {
  const placements: VisualPlacement[] = [];
  const paragraphs = content.split(/\n\n+/);

  paragraphs.forEach((paragraph, index) => {
    // Skip very short paragraphs
    if (paragraph.length < 50) return;

    // Check for visual triggers
    for (const [type, patterns] of Object.entries(VISUAL_TRIGGER_PATTERNS)) {
      const matches = patterns.filter(p => p.test(paragraph));
      
      if (matches.length >= 2) {
        // Strong signal for this visual type
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
    case 'chart':
      if (/trend|growth|time|over time/i.test(content)) return 'line';
      if (/compar|versus|vs/i.test(content)) return 'bar';
      if (/percent|proportion|share/i.test(content)) return 'pie';
      return 'bar';
    case 'diagram':
      if (/process|step|flow/i.test(content)) return 'flowchart';
      if (/architect|system|component/i.test(content)) return 'architecture';
      if (/cause|effect|leads/i.test(content)) return 'cause-effect';
      return 'flowchart';
    case 'technical':
      if (/code|function|class/i.test(content)) return 'code-flow';
      if (/network|server|api/i.test(content)) return 'network';
      if (/step|guide|how.to/i.test(content)) return 'step-by-step';
      return 'schematic';
    case 'illustration':
      if (/character|person|hero/i.test(content)) return 'character';
      if (/scene|moment|action/i.test(content)) return 'scene';
      if (/setting|place|environment/i.test(content)) return 'environment';
      return 'educational';
  }
}

// ============================================================================
// ILLUSTRATION AUDIT
// ============================================================================

export interface IllustrationAuditInput {
  bookType: BookType;
  category: string;
  chapters: {
    id: string;
    content: string;
    illustrations: IllustrationMeta[];
  }[];
}

/**
 * Audit illustrations for a book
 * Returns pass/fail status with detailed feedback
 */
export function auditIllustrations(input: IllustrationAuditInput): IllustrationAuditResult {
  const result: IllustrationAuditResult = {
    passed: true,
    score: 100,
    missingRequired: [],
    orphanImages: [],
    brokenVisuals: [],
    missingCaptions: [],
    unreferencedImages: [],
    styleInconsistencies: [],
    accessibilityIssues: [],
    warnings: [],
    blockerReasons: [],
  };

  const requirement = getIllustrationRequirement(input.bookType, input.category);

  for (const chapter of input.chapters) {
    const suggestedPlacements = analyzeContentForVisuals(
      chapter.content,
      input.bookType,
      input.category
    );

    // Check for missing required visuals
    if (requirement === 'required') {
      if (chapter.illustrations.length === 0 && suggestedPlacements.length > 0) {
        result.missingRequired.push(
          `Chapter ${chapter.id}: No illustrations found, ${suggestedPlacements.length} suggested`
        );
      }
    }

    // Check each illustration
    for (const illust of chapter.illustrations) {
      // Missing caption
      if (!illust.caption || illust.caption.trim().length === 0) {
        result.missingCaptions.push(`Image ${illust.id} in chapter ${chapter.id}`);
      }

      // Missing alt text (accessibility)
      if (!illust.altText || illust.altText.trim().length === 0) {
        result.accessibilityIssues.push(`Image ${illust.id} missing alt text`);
      }

      // Not referenced in text
      if (!illust.referencedInText) {
        result.unreferencedImages.push(`Image ${illust.id} not referenced in chapter text`);
      }

      // Broken URL
      if (!illust.imageUrl || illust.imageUrl.trim().length === 0) {
        result.brokenVisuals.push(`Image ${illust.id} has no URL`);
      }

      // Invalid type/subtype combination
      if (!isValidVisualType(illust.type, illust.subType)) {
        result.warnings.push(
          `Image ${illust.id} has invalid type/subtype: ${illust.type}/${illust.subType}`
        );
      }
    }
  }

  // Calculate score and determine pass/fail
  let deductions = 0;

  // Critical issues (block publishing)
  if (requirement === 'required') {
    deductions += result.missingRequired.length * 15;
  }
  deductions += result.brokenVisuals.length * 10;
  deductions += result.missingCaptions.length * 5;
  deductions += result.accessibilityIssues.length * 3;
  deductions += result.unreferencedImages.length * 2;

  result.score = Math.max(0, 100 - deductions);

  // Determine blockers
  if (requirement === 'required' && result.missingRequired.length > 0) {
    result.blockerReasons.push('Illustrated book missing required visuals');
  }

  if (result.brokenVisuals.length > 0) {
    result.blockerReasons.push(`${result.brokenVisuals.length} broken image(s)`);
  }

  if (result.missingCaptions.length > input.chapters.reduce((sum, ch) => sum + ch.illustrations.length, 0) * 0.5) {
    result.blockerReasons.push('More than 50% of images missing captions');
  }

  result.passed = result.blockerReasons.length === 0 && result.score >= 60;

  return result;
}

// ============================================================================
// GENERATION PROMPT BUILDER
// ============================================================================

export function buildIllustrationPrompt(
  type: IllustrationType,
  subType: VisualSubType,
  context: {
    bookType: BookType;
    category: string;
    chapterTitle: string;
    sectionContent: string;
    learningObjective?: string;
    existingStyle?: string;
  }
): string {
  const purpose = ILLUSTRATION_PURPOSES[type];

  let prompt = `Generate a ${subType} ${type} for an educational ${context.bookType} book.\n\n`;
  prompt += `Chapter: ${context.chapterTitle}\n`;
  prompt += `Category: ${context.category}\n`;

  if (context.learningObjective) {
    prompt += `Learning Objective: ${context.learningObjective}\n`;
  }

  prompt += `\nContext:\n${context.sectionContent.slice(0, 500)}\n\n`;

  prompt += `Purpose: ${purpose.description}\n`;
  prompt += `Valid uses: ${purpose.validFor.join(', ')}\n`;
  prompt += `AVOID: ${purpose.invalidFor.join(', ')}\n`;

  if (context.existingStyle) {
    prompt += `\nMaintain visual consistency with: ${context.existingStyle}\n`;
  }

  prompt += `\nRequirements:\n`;
  prompt += `- Must be educational, not decorative\n`;
  prompt += `- Must directly support the learning objective\n`;
  prompt += `- Must be clear and readable\n`;
  prompt += `- Use accessible colors (WCAG compliant)\n`;

  if (type === 'chart') {
    prompt += `- Include clear axis labels and legend\n`;
    prompt += `- Use realistic, non-fabricated data\n`;
  }

  if (type === 'diagram') {
    prompt += `- Include clear labels for all components\n`;
    prompt += `- Show relationships and flow direction\n`;
  }

  return prompt;
}

// ============================================================================
// READER INTERACTION TYPES
// ============================================================================

export interface IllustrationInteraction {
  type: 'expand' | 'explain' | 'zoom' | 'step-through';
  available: boolean;
  label: string;
}

export function getAvailableInteractions(
  illustType: IllustrationType,
  bookType: BookType
): IllustrationInteraction[] {
  const interactions: IllustrationInteraction[] = [];

  // All types can expand
  interactions.push({
    type: 'expand',
    available: true,
    label: 'View Full Size',
  });

  // Charts and diagrams can be explained
  if (illustType === 'chart' || illustType === 'diagram') {
    interactions.push({
      type: 'explain',
      available: true,
      label: 'Explain This',
    });
  }

  // Technical visuals can step through
  if (illustType === 'technical') {
    interactions.push({
      type: 'step-through',
      available: true,
      label: 'Step-by-Step',
    });
  }

  // Children's books get tap-to-describe
  if (bookType === 'children') {
    interactions.push({
      type: 'explain',
      available: true,
      label: 'What\'s This?',
    });
  }

  return interactions;
}

// ============================================================================
// CONTRACT EXPORT
// ============================================================================

export const ICG_CONTRACT_VERSION = '1.0';
export const ICG_CONTRACT_FROZEN = true;

export const ICG_CONTRACT_SUMMARY = `
CONTRACT 9 — ILLUSTRATED CONTENT GENERATION (ICG-1.0)

CORE PRINCIPLE: No image exists without a pedagogical reason.

REQUIREMENTS:
- Illustrated/Comic/Children books: Illustrations REQUIRED
- STEM text books: Illustrations OPTIONAL (recommended)
- All others: Illustrations OPTIONAL

RULES:
1. Every visual must have: caption, alt text, learning objective
2. Every visual must be referenced in text
3. No orphan images, no decorative filler
4. Charts require axis labels
5. Diagrams require legends
6. Style must be consistent across chapters

AUDIT:
- Missing required visuals → BLOCK PUBLISHING
- Broken images → BLOCK PUBLISHING
- >50% missing captions → BLOCK PUBLISHING
- Score < 60 → BLOCK PUBLISHING

VERSION: ${ICG_CONTRACT_VERSION}
STATUS: ${ICG_CONTRACT_FROZEN ? 'FROZEN' : 'DRAFT'}
`;
