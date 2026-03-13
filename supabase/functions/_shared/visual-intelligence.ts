// ===========================================
// SCROLLLIBRARY VISUAL INTELLIGENCE ENGINE v1.0
// Three-Stage Pipeline: Detect → Classify → Render
// ===========================================

// ===========================================
// TYPES
// ===========================================

export interface FigureSpec {
  chapter: number;
  section: string;
  bookType: string;
  visualNeeded: boolean;
  visualType: VisualType;
  purpose: string;
  placement: FigurePlacement;
  style: string;
  caption: string;
  imagePrompt: string;
}

export type VisualType =
  | 'matrix'
  | 'chart'
  | 'taxonomy_tree'
  | 'flowchart'
  | 'architecture_diagram'
  | 'framework_diagram'
  | 'concept_map'
  | 'step_by_step'
  | 'comparison_visual'
  | 'workbook_template'
  | 'comic_panel'
  | 'children_illustration'
  | 'cinematic_scene'
  | 'lifecycle_model'
  | 'labeled_illustration'
  | 'none';

export type FigurePlacement =
  | 'before_section'
  | 'after_section'
  | 'inline'
  | 'full_width_break';

// ===========================================
// VISUAL DENSITY RULES BY BOOK TYPE
// Controls how many figures per word count
// ===========================================

export const VISUAL_DENSITY: Record<string, {
  wordsPerFigure: [number, number]; // [min, max] words between figures
  maxFigures: number;               // hard cap per chapter
  description: string;
}> = {
  academic:     { wordsPerFigure: [800, 1200],  maxFigures: 2, description: 'diagrams only when conceptually useful' },
  technical:    { wordsPerFigure: [600, 1000],  maxFigures: 2, description: 'architecture/process visuals' },
  professional: { wordsPerFigure: [700, 1100],  maxFigures: 2, description: 'matrices/frameworks/decision trees' },
  reference:    { wordsPerFigure: [900, 1400],  maxFigures: 2, description: 'taxonomy and quick reference visuals' },
  workbook:     { wordsPerFigure: [500, 900],   maxFigures: 2, description: 'interactive visual every 500-900 words' },
  comic:        { wordsPerFigure: [100, 300],   maxFigures: 6, description: 'image-first, high visual density' },
  children:     { wordsPerFigure: [100, 250],   maxFigures: 5, description: 'very high visual density' },
  fiction:      { wordsPerFigure: [1000, 1500], maxFigures: 2, description: 'cinematic scene illustrations' },
  bestseller:   { wordsPerFigure: [1000, 1500], maxFigures: 2, description: 'concept-driven explanatory visual' },
  text:         { wordsPerFigure: [1500, 2000], maxFigures: 0, description: 'text-only pipeline — no figures' },
};

// ===========================================
// VISUAL NEED TRIGGERS
// Section content patterns that warrant a visual
// ===========================================

const VISUAL_TRIGGERS = [
  'process explanation',
  'hierarchy',
  'taxonomy',
  'comparison',
  'risk',
  'decision logic',
  'system architecture',
  'spatial relationship',
  'narrative scene',
  'storytelling moment',
  'workflow',
  'lifecycle',
  'framework',
  'matrix',
  'classification',
  'step-by-step',
  'cause and effect',
  'before and after',
  'trade-off analysis',
];

// ===========================================
// BOOK-TYPE → VISUAL STYLE MAPPING
// ===========================================

export const VISUAL_STYLE_MAP: Record<string, string> = {
  academic:     'formal academic diagram',
  technical:    'systems/architecture visual',
  professional: 'consulting-style framework',
  reference:    'taxonomy or quick-reference diagram',
  workbook:     'interactive template',
  comic:        'comic panel sequence',
  children:     'playful learning illustration',
  fiction:      'cinematic narrative scene',
  bestseller:   'concept-driven explanatory visual',
  text:         'none — text only',
};

// ===========================================
// VISUAL INTELLIGENCE MASTER PROMPT
// Injected into generation to produce structured Figure Specs
// ===========================================

export function buildVisualIntelligencePrompt(
  bookType: string,
  chapterNumber: number,
  wordCount: number,
): string {
  const density = VISUAL_DENSITY[bookType] || VISUAL_DENSITY.text;
  
  // Text-only pipeline — no figures
  if (density.maxFigures === 0) {
    return `ILLUSTRATION POLICY: This is a TEXT-ONLY pipeline. Do NOT include any [FIGURE] markers, image placeholders, or illustration references.`;
  }

  // Calculate recommended figure count based on word count and density
  const avgWordsPerFig = (density.wordsPerFigure[0] + density.wordsPerFigure[1]) / 2;
  const recommendedFigures = Math.min(
    Math.max(1, Math.round(wordCount / avgWordsPerFig)),
    density.maxFigures
  );

  const style = VISUAL_STYLE_MAP[bookType] || 'explanatory concept visual';

  return `
=== VISUAL INTELLIGENCE ENGINE (MANDATORY) ===

You are also the ScrollLibrary Visual Intelligence Engine for this chapter.
Your job is to decide WHETHER a section needs an image, WHAT kind, and WHERE to place it.

VISUAL DENSITY RULE for ${bookType.toUpperCase()}:
- Place 1 figure every ${density.wordsPerFigure[0]}–${density.wordsPerFigure[1]} words
- Maximum ${density.maxFigures} figures per chapter
- Recommended for this chapter: ${recommendedFigures} figure(s)
- Visual style: ${style}
- Purpose: ${density.description}

STAGE A — VISUAL NEED DETECTION:
Only insert a [FIGURE] marker if the section contains one of:
- Process explanation or workflow
- Hierarchy, taxonomy, or classification
- Comparison of 2+ concepts
- Risk/decision logic or trade-off analysis
- System architecture or spatial relationship
- Narrative scene or storytelling moment (fiction/children/comic)
- Framework, matrix, or model application
- Step-by-step procedure or lifecycle
- Before/after transformation

If NONE of these triggers exist in the section: DO NOT generate a figure.
Decorative images with no learning function are FORBIDDEN.

STAGE B — VISUAL TYPE CLASSIFICATION:
When a figure IS needed, classify it as one of:
- matrix | chart | taxonomy_tree | flowchart
- architecture_diagram | framework_diagram | concept_map
- step_by_step | comparison_visual | lifecycle_model
- workbook_template | comic_panel | children_illustration
- cinematic_scene | labeled_illustration

STAGE C — PLACEMENT RULES:
Place visuals:
✅ After dense conceptual sections (reinforcement)
✅ Before complex explanations (priming)
✅ Between two difficult blocks (cognitive break)
✅ At section transitions (bridge)

DO NOT:
❌ Place images at every section
❌ Place back-to-back visuals
❌ Use decorative gradients or filler

FIGURE MARKER FORMAT (MANDATORY):
[FIGURE X: <30-50 word description specifying visual type, key elements, layout, and purpose>]

Example for Professional Guide:
[FIGURE 1: A clean consulting-style 3x3 risk matrix with probability on the Y-axis and impact on the X-axis, labeled cells showing threat categories, minimal professional palette]

Example for Academic Textbook:
[FIGURE 1: A labeled conceptual framework diagram showing the three-stage model of memory encoding, storage, and retrieval, with arrows indicating information flow and feedback loops]

FINAL CHECK before output:
- Did each figure earn its place by meeting a visual trigger? If not, remove it.
- Are figures spaced throughout the chapter (not clustered)?
- Does each description contain enough detail (30-50 words) for accurate image generation?
- Is the figure count within the ${density.maxFigures}-figure cap?

=== END VISUAL INTELLIGENCE ENGINE ===
`;
}

// ===========================================
// POST-GENERATION FIGURE SPEC EXTRACTOR
// Parses [FIGURE X: description] markers from generated content
// and produces structured FigureSpec objects
// ===========================================

export function extractFigureSpecs(
  content: string,
  bookType: string,
  chapterNumber: number,
): FigureSpec[] {
  const figureRegex = /\[FIGURE\s*(\d+)\s*:\s*([\s\S]*?)\]/gi;
  const specs: FigureSpec[] = [];
  const density = VISUAL_DENSITY[bookType] || VISUAL_DENSITY.text;

  let match;
  while ((match = figureRegex.exec(content)) !== null) {
    const figNum = parseInt(match[1]);
    const description = match[2].trim();

    // Classify visual type from description keywords
    const visualType = classifyVisualType(description);
    const style = VISUAL_STYLE_MAP[bookType] || 'explanatory concept visual';

    // Determine placement from surrounding context
    const placement = determinePlacement(content, match.index);

    specs.push({
      chapter: chapterNumber,
      section: extractSectionTitle(content, match.index),
      bookType,
      visualNeeded: true,
      visualType,
      purpose: description.split('.')[0] || `Figure ${figNum}`,
      placement,
      style,
      caption: `Figure ${figNum}: ${description.split('.')[0]}`,
      imagePrompt: description,
    });
  }

  // Enforce density cap
  return specs.slice(0, density.maxFigures);
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function classifyVisualType(description: string): VisualType {
  const d = description.toLowerCase();
  if (/matrix|grid/.test(d)) return 'matrix';
  if (/chart|graph|bar|pie|histogram/.test(d)) return 'chart';
  if (/taxonomy|tree|hierarchy|classification/.test(d)) return 'taxonomy_tree';
  if (/flow\s?chart|process\s?flow|decision\s?flow/.test(d)) return 'flowchart';
  if (/architect|system\s?diagram|infrastructure/.test(d)) return 'architecture_diagram';
  if (/framework|model|strategic/.test(d)) return 'framework_diagram';
  if (/concept\s?map|mind\s?map/.test(d)) return 'concept_map';
  if (/step.by.step|sequence|procedure/.test(d)) return 'step_by_step';
  if (/compar|versus|vs\b|side.by.side/.test(d)) return 'comparison_visual';
  if (/template|fill.in|blank|worksheet/.test(d)) return 'workbook_template';
  if (/panel|comic|storyboard/.test(d)) return 'comic_panel';
  if (/children|playful|cartoon|friendly/.test(d)) return 'children_illustration';
  if (/scene|cinematic|atmosphere|setting/.test(d)) return 'cinematic_scene';
  if (/lifecycle|cycle|phase|stage/.test(d)) return 'lifecycle_model';
  if (/label|annotated|diagram/.test(d)) return 'labeled_illustration';
  return 'framework_diagram'; // safe default
}

function determinePlacement(content: string, figureIndex: number): FigurePlacement {
  // Look at content before and after the figure marker
  const before = content.slice(Math.max(0, figureIndex - 200), figureIndex);
  const after = content.slice(figureIndex, figureIndex + 200);

  // If preceded by a heading, it's before_section
  if (/##[^#\n]+\n\s*$/.test(before)) return 'before_section';
  // If followed by a heading, it's after_section
  if (/^\s*\n##/.test(after.slice(after.indexOf(']') + 1))) return 'after_section';
  // Default to inline
  return 'inline';
}

function extractSectionTitle(content: string, figureIndex: number): string {
  // Find the nearest ## heading before the figure
  const before = content.slice(0, figureIndex);
  const headingMatch = before.match(/##\s+([^\n]+)/g);
  if (headingMatch && headingMatch.length > 0) {
    const last = headingMatch[headingMatch.length - 1];
    return last.replace(/^#+\s*/, '').trim();
  }
  return 'Introduction';
}

// ===========================================
// VALIDATE FIGURE SPECS
// Ensures all specs meet quality criteria
// ===========================================

export function validateFigureSpecs(specs: FigureSpec[]): {
  valid: FigureSpec[];
  rejected: { spec: FigureSpec; reason: string }[];
} {
  const valid: FigureSpec[] = [];
  const rejected: { spec: FigureSpec; reason: string }[] = [];

  for (const spec of specs) {
    // Reject if description is too short (likely filler)
    if (spec.imagePrompt.length < 20) {
      rejected.push({ spec, reason: 'Description too short — likely decorative filler' });
      continue;
    }

    // Reject text-only book types
    if (spec.bookType === 'text') {
      rejected.push({ spec, reason: 'Text-only pipeline — no figures allowed' });
      continue;
    }

    // Reject if no educational/narrative purpose can be inferred
    const hasSubstance = /diagram|chart|framework|matrix|process|compare|scene|illustrat|panel|template|model|tree|flow|architecture/i.test(spec.imagePrompt);
    if (!hasSubstance) {
      rejected.push({ spec, reason: 'No pedagogical or narrative purpose detected' });
      continue;
    }

    valid.push(spec);
  }

  return { valid, rejected };
}
