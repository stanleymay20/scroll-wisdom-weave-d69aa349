import { parseFigureData, serializeFigureData, type FigureData } from './figure-data.ts';

// ===========================================
// SCROLLLIBRARY VISUAL INTELLIGENCE ENGINE v2.0
// Three-Stage Pipeline: Detect → Classify → Render
// + Cognitive Value Scoring
// + Structured Figure Format
// + Renderer Type Mapping
// ===========================================

// ===========================================
// TYPES
// ===========================================

export interface FigureSpec {
  figureNumber: number; // v2.1: Explicit figure identity — never derived from array index
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
  // v2.0 additions
  cognitiveScore: number;
  renderMode: RenderMode;
  structuredFields?: StructuredFigureFields;
}

export interface StructuredFigureFields {
  type: VisualType;
  caption: string;
  description: string;
  data?: string; // optional structured data for diagram renderers
}

export type RenderMode =
  | 'ai_image'          // Generate via AI image model
  | 'mermaid'           // Render as Mermaid diagram
  | 'chart_component'   // Render as React chart (Recharts)
  | 'table_component'   // Render as structured table
  | 'svg_diagram'       // Render as custom SVG
  | 'placeholder';      // Fallback text placeholder

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
  wordsPerFigure: [number, number];
  maxFigures: number;
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
// COGNITIVE VALUE SCORING ENGINE v1.0
// Scores each figure on educational merit
// ===========================================

interface CognitiveScoreResult {
  score: number;
  factors: { factor: string; points: number }[];
}

function computeCognitiveScore(description: string, visualType: VisualType, bookType: string): CognitiveScoreResult {
  const d = description.toLowerCase();
  const factors: { factor: string; points: number }[] = [];

  // +3 Simplifies complexity (shows structure of a complex topic)
  if (/simplif|break\s*down|overview|structure|organiz|hierarch|decompos/i.test(d)) {
    factors.push({ factor: 'simplifies_complexity', points: 3 });
  }

  // +3 Shows relationships between concepts
  if (/relationship|connect|link|depend|interact|influence|correlat|cause.*effect|flow.*between/i.test(d)) {
    factors.push({ factor: 'shows_relationships', points: 3 });
  }

  // +2 Supports memory retention (named framework, memorable visual)
  if (/framework|model|principle|matrix|map|mnemonic|acronym|visual.*metaphor/i.test(d)) {
    factors.push({ factor: 'supports_retention', points: 2 });
  }

  // +2 Enables comparison/contrast
  if (/compar|contrast|versus|vs\b|side.by.side|differ|advantage|disadvantage|trade.off/i.test(d)) {
    factors.push({ factor: 'enables_comparison', points: 2 });
  }

  // +2 Demonstrates a process or sequence
  if (/process|step|sequence|workflow|pipeline|lifecycle|phase|stage|procedure/i.test(d)) {
    factors.push({ factor: 'demonstrates_process', points: 2 });
  }

  // +1 Contains specific data/quantitative elements
  if (/data|statistic|percent|number|metric|score|axis|scale|measure/i.test(d)) {
    factors.push({ factor: 'contains_data', points: 1 });
  }

  // +1 Has labeled components (indicates precision)
  if (/label|annotated|callout|legend|caption|axis|component/i.test(d)) {
    factors.push({ factor: 'has_labels', points: 1 });
  }

  // -3 Decorative (no educational substance)
  if (/decorat|abstract.*art|gradient.*background|generic.*icon|stock|filler|beautif/i.test(d)) {
    factors.push({ factor: 'decorative_penalty', points: -3 });
  }

  // -2 Vague description (lacks specificity)
  if (description.length < 30 && !/diagram|chart|matrix|tree|flow/i.test(d)) {
    factors.push({ factor: 'vague_description', points: -2 });
  }

  // -1 Redundant with text (just illustrating what was already said clearly)
  if (/illustration.*of.*the.*text|visual.*representation.*of.*above/i.test(d)) {
    factors.push({ factor: 'redundant_with_text', points: -1 });
  }

  // Book-type bonuses
  if (bookType === 'children' || bookType === 'comic') {
    // Narrative visuals are inherently valuable for visual-first formats
    if (/scene|character|story|adventure|emotion|action/i.test(d)) {
      factors.push({ factor: 'narrative_value_bonus', points: 2 });
    }
  }

  if (bookType === 'fiction') {
    if (/atmosphere|mood|setting|cinematic|dramatic/i.test(d)) {
      factors.push({ factor: 'atmospheric_value_bonus', points: 2 });
    }
  }

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, factors };
}

// Minimum cognitive score required for a figure to pass validation
const MIN_COGNITIVE_SCORE = 2;

// ===========================================
// RENDER MODE MAPPING
// Maps visual types to optimal rendering technology
// ===========================================

const RENDER_MODE_MAP: Record<VisualType, RenderMode> = {
  flowchart:            'mermaid',
  taxonomy_tree:        'mermaid',
  lifecycle_model:      'mermaid',
  architecture_diagram: 'mermaid',
  concept_map:          'mermaid',
  matrix:               'chart_component',
  chart:                'chart_component',
  comparison_visual:    'table_component',
  step_by_step:         'table_component',
  framework_diagram:    'ai_image',
  workbook_template:    'ai_image',
  comic_panel:          'ai_image',
  children_illustration:'ai_image',
  cinematic_scene:      'ai_image',
  labeled_illustration: 'ai_image',
  none:                 'placeholder',
};

// For certain book types, override render mode to always use AI images
// (e.g., children's books should never show Mermaid diagrams)
const BOOK_TYPE_RENDER_OVERRIDES: Record<string, RenderMode> = {
  children: 'ai_image',
  comic: 'ai_image',
  fiction: 'ai_image',
};

export function resolveRenderMode(visualType: VisualType, bookType: string): RenderMode {
  // Book-type override takes priority
  if (BOOK_TYPE_RENDER_OVERRIDES[bookType]) {
    return BOOK_TYPE_RENDER_OVERRIDES[bookType];
  }
  return RENDER_MODE_MAP[visualType] || 'ai_image';
}

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
// VISUAL INTELLIGENCE MASTER PROMPT v2.0
// Now includes structured figure format instructions
// ===========================================

export function buildVisualIntelligencePrompt(
  bookType: string,
  chapterNumber: number,
  wordCount: number,
): string {
  const density = VISUAL_DENSITY[bookType] || VISUAL_DENSITY.text;
  
  if (density.maxFigures === 0) {
    return `ILLUSTRATION POLICY: This is a TEXT-ONLY pipeline. Do NOT include any [FIGURE] markers, image placeholders, or illustration references.`;
  }

  const avgWordsPerFig = (density.wordsPerFigure[0] + density.wordsPerFigure[1]) / 2;
  const recommendedFigures = Math.min(
    Math.max(1, Math.round(wordCount / avgWordsPerFig)),
    density.maxFigures
  );

  const style = VISUAL_STYLE_MAP[bookType] || 'explanatory concept visual';

  return `
=== VISUAL INTELLIGENCE ENGINE v2.2 (MANDATORY) ===

You are the ScrollLibrary Visual Intelligence Engine for this chapter.
Decide WHETHER a section needs a visual, WHAT kind, and WHERE to place it.

VISUAL DENSITY RULE for ${bookType.toUpperCase()}:
- Place 1 figure every ${density.wordsPerFigure[0]}–${density.wordsPerFigure[1]} words
- Maximum ${density.maxFigures} figures per chapter
- Recommended for this chapter: ${recommendedFigures} figure(s)
- Visual style: ${style}
- Purpose: ${density.description}

STAGE A — VISUAL NEED DETECTION:
Only insert a [FIGURE] if the section contains:
- Process explanation or workflow
- Hierarchy, taxonomy, or classification
- Comparison of 2+ concepts
- Risk/decision logic or trade-off analysis
- System architecture or spatial relationship
- Framework, matrix, or model application
- Step-by-step procedure or lifecycle
- Cause-and-effect or before/after transformation
- Narrative scene or storytelling moment (fiction/children/comic only)

If NONE exist: DO NOT generate a figure.

STAGE B — COGNITIVE VALUE CHECK:
Every figure must score ≥ 2 on cognitive value:
+3 = Simplifies complexity (shows structure)
+3 = Shows relationships between concepts
+2 = Supports memory retention (named framework)
+2 = Enables comparison/contrast
+2 = Demonstrates a process or sequence
+1 = Contains specific data points
+1 = Has labeled components
-3 = Decorative (no educational substance)
-2 = Vague description
-1 = Redundant with surrounding text

If score < 2: DO NOT include the figure.

STAGE C — STRUCTURED FIGURE FORMAT:
Use this EXACT format for each figure:

[FIGURE X
TYPE: <visual_type>
CAPTION: <publication-ready caption>
DESCRIPTION: <30-50 word detailed description for the renderer>
DATA: <single-line JSON, REQUIRED for diagram types — see STAGE D>
]

Supported TYPE values:
matrix | chart | taxonomy_tree | flowchart | architecture_diagram
framework_diagram | concept_map | step_by_step | comparison_visual
lifecycle_model | labeled_illustration | comic_panel | children_illustration
cinematic_scene | workbook_template

Example for Professional Guide:
[FIGURE 1
TYPE: matrix
CAPTION: Risk Prioritization Matrix for Operational Threats
DESCRIPTION: A clean consulting-style 3x3 risk matrix with probability on Y-axis and impact on X-axis, labeled cells showing threat categories from low to critical, minimal professional palette
]

Example for Academic Textbook:
[FIGURE 1
TYPE: architecture_diagram
CAPTION: Three-Stage Model of Memory Processing
DESCRIPTION: A labeled conceptual framework showing encoding, storage, and retrieval stages with directional arrows indicating information flow, feedback loops, and decay pathways
]

STAGE D — FIGURE DATA (REQUIRED for every type except the four artwork types
labeled_illustration, comic_panel, children_illustration and cinematic_scene):

A diagram is its structure. A description alone cannot be drawn — it can only
be guessed at — so supply the structure itself as one line of JSON in DATA.
Use exactly one of these three shapes.

1. flow — processes, lifecycles, taxonomies, architectures, concept maps.
   Use for TYPE flowchart, taxonomy_tree, lifecycle_model,
   architecture_diagram, concept_map, framework_diagram.
   {"kind":"flow","direction":"down","nodes":[{"id":"a","label":"Encoding"},{"id":"b","label":"Storage"},{"id":"c","label":"Retrieval"}],"edges":[{"from":"a","to":"b"},{"from":"b","to":"c","label":"on recall"}]}
   - direction "down" for hierarchies and processes, "right" for cycles.
   - Every edge's "from" and "to" MUST name a node "id" you declared.
   - 2-12 nodes. A node label is 1-6 words, NOT a sentence.
   - Two or more nodes with no edges is a list, not a diagram — use prose.

2. table — comparisons, step sequences, matrices.
   Use for TYPE comparison_visual, step_by_step, matrix, workbook_template.
   {"kind":"table","columns":["Approach","Strength","Cost"],"rows":[["Manual","Precise","High"],["Automated","Fast","Low"]]}
   - 2-6 columns, 1-14 rows. For a matrix, the first column is the row axis.
   - Cells are short phrases, not paragraphs.

3. series — a single measure across categories.
   Use for TYPE chart.
   {"kind":"series","unit":"% of respondents","points":[{"label":"Agree","value":62},{"label":"Neutral","value":23},{"label":"Disagree","value":15}]}
   - 2-12 points. Values are numbers, never strings or ranges.
   - Only use real figures the chapter states. NEVER invent data to fill a chart.
     If you do not have actual numbers, choose a different TYPE.

DATA RULES:
- DATA must be ONE line of valid JSON. No line breaks, no code fences, no prose.
- The labels in DATA must match the concepts the DESCRIPTION names.
- Omit DATA for the four artwork types; those are drawn by an image model.

LEGACY FALLBACK: Simple [FIGURE X: description] format is also accepted but the structured format is preferred.

PLACEMENT RULES:
✅ After dense conceptual sections (reinforcement)
✅ Before complex explanations (priming)
✅ Between two difficult blocks (cognitive break)
✅ At section transitions (bridge)
❌ No back-to-back visuals
❌ No decorative gradients or filler

FINAL CHECK:
- Each figure scored ≥ 2 on cognitive value?
- Figures spaced throughout (not clustered)?
- Descriptions 30-50 words with specific elements?
- Every non-artwork figure carries a valid one-line DATA payload?
- Every edge in a flow names nodes that exist?
- Figure count ≤ ${density.maxFigures}?

=== END VISUAL INTELLIGENCE ENGINE v2.2 ===
`;
}

// ===========================================
// STRUCTURED FIGURE PARSER v2.0
// Supports both structured and legacy formats
// ===========================================

interface RawFigureMarker {
  num: number;
  fullMatch: string;
  // Structured fields (v2.0)
  type?: string;
  caption?: string;
  description: string;
  /**
   * Raw DATA payload (v2.2), holding the figure's structure as JSON.
   *
   * Validated by _shared/figure-data.ts rather than here: this parser's job is
   * to find the field, not to vouch for it, and a figure whose data is
   * malformed must still parse so the pipeline can fall back to its prose.
   */
  data?: string;
}

export function parseRawFigureMarkers(content: string): RawFigureMarker[] {
  const text = content || '';
  const markers: RawFigureMarker[] = [];

  // Spans are found by bracket matching rather than by a non-greedy regex, so
  // a description containing "[see appendix]" yields the whole marker instead
  // of the half of it that precedes the inner bracket. The field patterns then
  // run against that complete span.
  for (const [start, end] of findFigureMarkerSpans(text)) {
    const fullMatch = text.slice(start, end);

    // v2.0 structured format: [FIGURE X\nTYPE: ...\nCAPTION: ...\nDESCRIPTION: ...]
    // DESCRIPTION stops at a DATA line rather than running to the closing
    // bracket, or the JSON payload would be appended to the prose description
    // and shown to a reader under the figure.
    const structured = fullMatch.match(
      /^\[FIGURE\s*(\d+(?:\.\d+)*)\s*\n\s*TYPE:\s*([^\n]+)\n\s*CAPTION:\s*([^\n]+)\n\s*DESCRIPTION:\s*([\s\S]*?)\s*(?:\n\s*DATA:\s*([\s\S]*?)\s*)?\]$/i,
    );
    if (structured) {
      markers.push({
        num: parseInt(structured[1]),
        fullMatch,
        type: structured[2].trim().toLowerCase(),
        caption: structured[3].trim(),
        description: structured[4].trim(),
        data: structured[5]?.trim() || undefined,
      });
      continue;
    }

    // Legacy format: [FIGURE X: description]
    const legacy = fullMatch.match(/^\[FIGURE\s*(\d+(?:\.\d+)*)\s*:\s*([\s\S]*?)\s*\]$/i);
    if (legacy) {
      markers.push({
        num: parseInt(legacy[1]),
        fullMatch,
        description: legacy[2].trim(),
      });
    }
    // A span matching neither shape is left in place for the final sweep; it is
    // not a marker this parser can describe, and guessing at its fields would
    // put invented text under a figure.
  }

  // Sort by figure number
  markers.sort((a, b) => a.num - b.num);
  return markers;
}

// ===========================================
// FIGURE SPEC EXTRACTOR v2.0
// ===========================================

export function extractFigureSpecs(
  content: string,
  bookType: string,
  chapterNumber: number,
): FigureSpec[] {
  const rawMarkers = parseRawFigureMarkers(content);
  const density = VISUAL_DENSITY[bookType] || VISUAL_DENSITY.text;
  const specs: FigureSpec[] = [];

  for (const marker of rawMarkers) {
    // Use structured type if available, otherwise classify from description
    const visualType = marker.type
      ? (marker.type as VisualType)
      : classifyVisualType(marker.description);

    const style = VISUAL_STYLE_MAP[bookType] || 'explanatory concept visual';
    const placement = determinePlacement(content, content.indexOf(marker.fullMatch));
    const caption = marker.caption || `Figure ${marker.num}: ${marker.description.split('.')[0]}`;

    // Compute cognitive value score
    const { score: cognitiveScore, factors } = computeCognitiveScore(marker.description, visualType, bookType);

    // Resolve render mode
    const renderMode = resolveRenderMode(visualType, bookType);

    const spec: FigureSpec = {
      figureNumber: marker.num, // v2.1: Use actual parsed figure number, not array index
      chapter: chapterNumber,
      section: extractSectionTitle(content, content.indexOf(marker.fullMatch)),
      bookType,
      visualNeeded: true,
      visualType,
      purpose: marker.description.split('.')[0] || `Figure ${marker.num}`,
      placement,
      style,
      caption,
      imagePrompt: marker.description,
      cognitiveScore,
      renderMode,
      structuredFields: marker.type ? {
        type: visualType,
        caption,
        description: marker.description,
      } : undefined,
    };

    specs.push(spec);
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
  return 'framework_diagram';
}

function determinePlacement(content: string, figureIndex: number): FigurePlacement {
  if (figureIndex < 0) return 'inline';
  const before = content.slice(Math.max(0, figureIndex - 200), figureIndex);
  const after = content.slice(figureIndex, Math.min(content.length, figureIndex + 200));

  if (/##[^#\n]+\n\s*$/.test(before)) return 'before_section';
  if (/^\s*\n##/.test(after.slice(after.indexOf(']') + 1))) return 'after_section';
  return 'inline';
}

function extractSectionTitle(content: string, figureIndex: number): string {
  if (figureIndex < 0) return 'Introduction';
  const before = content.slice(0, figureIndex);
  const headingMatch = before.match(/##\s+([^\n]+)/g);
  if (headingMatch && headingMatch.length > 0) {
    const last = headingMatch[headingMatch.length - 1];
    return last.replace(/^#+\s*/, '').trim();
  }
  return 'Introduction';
}

// ===========================================
// VALIDATE FIGURE SPECS v2.0
// Now includes Cognitive Value Score gate
// ===========================================

export function validateFigureSpecs(specs: FigureSpec[]): {
  valid: FigureSpec[];
  rejected: { spec: FigureSpec; reason: string; cognitiveScore: number }[];
} {
  const valid: FigureSpec[] = [];
  const rejected: { spec: FigureSpec; reason: string; cognitiveScore: number }[] = [];

  for (const spec of specs) {
    // Reject text-only book types
    if (spec.bookType === 'text') {
      rejected.push({ spec, reason: 'Text-only pipeline — no figures allowed', cognitiveScore: spec.cognitiveScore });
      continue;
    }

    // Reject if description is too short (likely filler)
    if (spec.imagePrompt.length < 20) {
      rejected.push({ spec, reason: 'Description too short — likely decorative filler', cognitiveScore: spec.cognitiveScore });
      continue;
    }

    // Cognitive Value Score gate
    if (spec.cognitiveScore < MIN_COGNITIVE_SCORE) {
      rejected.push({
        spec,
        reason: `Cognitive value too low (${spec.cognitiveScore} < ${MIN_COGNITIVE_SCORE}) — insufficient educational merit`,
        cognitiveScore: spec.cognitiveScore,
      });
      continue;
    }

    valid.push(spec);
  }

  return { valid, rejected };
}

// ===========================================
// MERMAID DIAGRAM GENERATOR
// Generates Mermaid syntax for diagram-eligible figures
// ===========================================

export function generateMermaidHint(spec: FigureSpec): string | null {
  if (spec.renderMode !== 'mermaid') return null;

  // Return a hint that the frontend can use to request Mermaid generation
  // The actual Mermaid code should be generated by AI based on the description
  const typeHints: Record<string, string> = {
    flowchart: 'graph TD',
    taxonomy_tree: 'graph TD',
    lifecycle_model: 'graph LR',
    architecture_diagram: 'graph TB',
    concept_map: 'mindmap',
  };

  return typeHints[spec.visualType] || 'graph TD';
}

// ===========================================
// FIGURE SPEC SUMMARY (for logging)
// ===========================================

export function summarizeFigureSpecs(specs: FigureSpec[]): string {
  if (specs.length === 0) return 'No figures';
  return specs.map(s =>
    `Fig${s.chapter}.${s.figureNumber}: ${s.visualType} (score:${s.cognitiveScore}, render:${s.renderMode}, placement:${s.placement})`
  ).join(' | ');
}

// ===========================================
// FIGURE IMAGE PROMPTING
// ===========================================

/**
 * Whether a figure's image is allowed to contain text.
 *
 * This is not a stylistic preference, it decides whether the figure works at
 * all. A flowchart, matrix, taxonomy or chart IS its labels: the nodes, axes,
 * quadrants and legend entries are the information, and an unlabelled version
 * is a diagram-shaped blob that tells a reader nothing. A children's
 * illustration or a cinematic scene is the opposite case — image models garble
 * lettering, and a picture book should carry its words in the typeset caption
 * rather than baked into the artwork.
 *
 * The distinction was previously absent: every figure was generated under a
 * blanket "do NOT render any text, words, or letters" instruction, which sat
 * in the same prompt as art direction demanding "every element labeled" and
 * "proper axes, annotated callouts". The model was told to label the diagram
 * and forbidden from writing on it, in consecutive sentences.
 */
export type FigureTextPolicy = 'labelled' | 'textless';

/** Visual types that are narrative artwork rather than information graphics. */
const TEXTLESS_VISUAL_TYPES: ReadonlySet<VisualType> = new Set<VisualType>([
  'children_illustration',
  'comic_panel',
  'cinematic_scene',
]);

/** Book types whose figures are artwork regardless of how a type was classified. */
const TEXTLESS_BOOK_TYPES: ReadonlySet<string> = new Set(['children', 'comic', 'fiction']);

export function figureTextPolicy(visualType: VisualType, bookType: string): FigureTextPolicy {
  if (TEXTLESS_BOOK_TYPES.has(bookType)) return 'textless';
  if (TEXTLESS_VISUAL_TYPES.has(visualType)) return 'textless';
  return 'labelled';
}

const LABELLED_TEXT_CLAUSE =
  `TEXT IN IMAGE: This is a labelled figure, so render the labels the description calls for — node names, axis titles, step numbers, quadrant headings, legend entries — as short, correctly spelled words in a clean sans-serif. Labels must be legible at half size and no longer than four words each. Do not add a title bar, caption, watermark, signature, or any wording the description does not ask for.`;

const TEXTLESS_TEXT_CLAUSE =
  `TEXT IN IMAGE: None. Do not render any text, words, letters or numbers anywhere in the image. The caption printed beneath the figure carries the wording.`;

/**
 * Build the image-model prompt for one figure.
 *
 * Kept here, beside the policy it depends on, so the contradiction described
 * above cannot be reintroduced by editing the art direction alone.
 */
export function buildFigureImagePrompt(args: {
  description: string;
  visualType: VisualType;
  bookType: string;
  styleHint: string;
  subject?: string;
}): string {
  const policy = figureTextPolicy(args.visualType, args.bookType);
  const parts = [
    args.description.trim().replace(/\.?$/, '.'),
    args.styleHint.trim(),
  ];
  if (args.subject && args.subject.trim()) {
    parts.push(`Subject: ${args.subject.trim()}.`);
  }
  parts.push(policy === 'labelled' ? LABELLED_TEXT_CLAUSE : TEXTLESS_TEXT_CLAUSE);
  return parts.join('\n\n');
}

/**
 * Replace one figure marker with rendered output, literally.
 *
 * `String.replace` with a string replacement interprets `$&`, `$1` and friends,
 * and figure captions are author- and model-supplied text that can contain a
 * dollar sign. A function replacement is substituted verbatim.
 */
export function replaceFigureMarker(content: string, fullMatch: string, replacement: string): string {
  return content.replace(fullMatch, () => replacement);
}

/**
 * Remove a "Figure N:" prefix a caption already carries.
 *
 * Captions reach the renderers from two places. A structured marker's CAPTION
 * field is bare prose, but extractFigureSpecs synthesises one for the legacy
 * `[FIGURE 1: description]` form as `Figure 1: <first sentence>` — already
 * prefixed. Every renderer then prints its own "Figure N:" label, so a legacy
 * figure came out as "Figure 1: Figure 1: ...".
 *
 * Stripping happens at the point of formatting rather than at the source, so
 * it holds for any caption however it was produced, including one an author
 * wrote with the prefix by hand.
 */
export function stripFigureCaptionPrefix(caption: string, figureNumber: number | string): string {
  const num = String(figureNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Matches "Figure 3", "Figure 3:", "Figure 3 —", "Fig. 3 -" and similar.
  const prefix = new RegExp(`^\\s*(?:fig\\.?|figure)\\s*${num}\\s*[:.\u2013\u2014-]?\\s*`, 'i');
  return caption.replace(prefix, '').trim();
}

/** Markdown for a successfully rendered figure. */
export function figureImageMarkdown(args: {
  figureNumber: number;
  caption: string;
  description: string;
  url: string;
}): string {
  // Alt text describes what is in the image, for a reader who cannot see it.
  // The caption is the figure's label and is printed beneath it. Using the
  // caption for both leaves a screen-reader user with a title and no picture.
  const alt = args.description.replace(/\s+/g, ' ').trim().slice(0, 300);
  const flat = args.caption.replace(/\s+/g, ' ').trim();
  // A caption that is nothing but its own prefix leaves no label at all, so
  // the description's opening clause stands in.
  const caption = stripFigureCaptionPrefix(flat, args.figureNumber)
    || alt.split('.')[0]
    || flat;
  return `\n\n![${alt}](${args.url})\n*Figure ${args.figureNumber}: ${caption}*\n\n`;
}

/**
 * Longest a single figure marker may be before the scanner gives up on finding
 * a balanced close. Without this, one unmatched `[` inside a description would
 * swallow the rest of the chapter.
 */
const MAX_FIGURE_MARKER_LENGTH = 4000;

/**
 * Locate every figure marker as a [start, end) span, matching brackets.
 *
 * A description legitimately contains brackets — "a chart of results [see
 * appendix] by cohort" — and a non-greedy `[\s\S]*?\]` stops at the first one,
 * cutting the marker in half. Whatever consumed that half-marker then left the
 * tail behind as loose prose in the manuscript: a stray "by cohort]" mid-page.
 *
 * Scanning with a depth counter ends the marker at the bracket that actually
 * closes it. If no balanced close appears within MAX_FIGURE_MARKER_LENGTH the
 * scanner falls back to the first `]`, which is the old behaviour and is still
 * better than consuming the chapter.
 */
export function findFigureMarkerSpans(content: string): Array<[number, number]> {
  const text = content || '';
  const opener = /\[FIGURE\s*\d+(?:\.\d+)*\s*(?::|\n)/gi;
  const spans: Array<[number, number]> = [];
  let match: RegExpExecArray | null;

  while ((match = opener.exec(text)) !== null) {
    const start = match.index;
    let depth = 0;
    let end = -1;
    let firstClose = -1;
    const limit = Math.min(text.length, start + MAX_FIGURE_MARKER_LENGTH);

    for (let i = start; i < limit; i++) {
      const ch = text[i];
      if (ch === '[') {
        depth++;
      } else if (ch === ']') {
        if (firstClose === -1) firstClose = i;
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }

    if (end === -1) end = firstClose === -1 ? -1 : firstClose + 1;
    if (end === -1) continue; // No close at all: not a marker, leave it alone.

    spans.push([start, end]);
    opener.lastIndex = end;
  }

  return spans;
}

/**
 * Remove every remaining figure marker from a chapter.
 *
 * A marker is a directive to the image pipeline, not manuscript prose. Any
 * marker still present when the pipeline finishes is one that was never
 * rendered — rejected on cognitive value, dropped by the density cap, or
 * failed at the image model — and leaving it is not a neutral act:
 * qaPublishability classifies a surviving `[FIGURE ...]` as a BLOCKER, so a
 * single failed image made the whole book unexportable.
 *
 * They are deleted rather than degraded to `*[Figure 3: ...]*`, which is what
 * the pipeline used to emit. That placeholder starts with `*`, so the
 * `^\[FIGURE` strippers in canonicalContent and export-book do not match it,
 * and it was reaching finished PDFs as an italic apology for a missing picture.
 */
export function stripFigureMarkers(
  content: string,
  options: { keepRenderable?: boolean } = {},
): string {
  const text = content || '';
  const spans = findFigureMarkerSpans(text);
  if (spans.length === 0) return text;

  // A marker carrying valid DATA is not an orphan: it is a diagram the reader
  // and the exporters render from its structure, so the sweep steps over it.
  // The text-only pipeline passes nothing here and removes every marker,
  // because a text book has no figures by contract.
  const keep = new Set<string>();
  if (options.keepRenderable) {
    for (const marker of parseRawFigureMarkers(text)) {
      if (figureDataFor(marker)) keep.add(marker.fullMatch);
    }
  }

  let out = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    if (keep.has(text.slice(start, end))) continue;
    out += text.slice(cursor, start);
    cursor = end;
  }
  out += text.slice(cursor);
  // Collapse the blank runs the removals leave behind.
  return out.replace(/\n{3,}/g, '\n\n');
}


// ===========================================
// FIGURE DATA BRIDGE
// ===========================================

/** Visual types drawn by an image model rather than from structure. */
const ARTWORK_VISUAL_TYPES: ReadonlySet<VisualType> = new Set<VisualType>([
  'labeled_illustration',
  'comic_panel',
  'children_illustration',
  'cinematic_scene',
]);

/**
 * The validated structure a figure marker carries, or null.
 *
 * Null covers every way a figure can fail to be a drawable diagram — no DATA
 * field, malformed JSON, a flow whose edges name nodes that do not exist — and
 * in each case the caller falls back to generating an image. That fallback is
 * why validation can afford to be strict: refusing a questionable structure
 * costs a picture, while accepting one prints a wrong diagram in a book.
 */
export function figureDataFor(marker: { data?: string }): FigureData | null {
  return parseFigureData(marker.data);
}

/**
 * How a figure should be produced.
 *
 * 'data' means it is drawn from structure by the reader and the exporters;
 * 'image' means it goes to the image model. Artwork always takes the image
 * path even if a stray DATA field appears, because a watercolour of a fox is
 * not a flowchart no matter what JSON accompanies it.
 */
export function resolveFigureRendering(
  marker: { data?: string },
  visualType: VisualType,
  bookType: string,
): { mode: 'data'; data: FigureData } | { mode: 'image' } {
  if (ARTWORK_VISUAL_TYPES.has(visualType)) return { mode: 'image' };
  if (TEXTLESS_BOOK_TYPES.has(bookType)) return { mode: 'image' };
  const data = figureDataFor(marker);
  return data ? { mode: 'data', data } : { mode: 'image' };
}

/**
 * Write a figure marker in canonical form.
 *
 * generate-chapter rewrites every data-bearing marker through this rather than
 * leaving the model's own text in place, so the exporters and the reader parse
 * one shape: fields in a fixed order, a description free of stray newlines and
 * a DATA payload re-serialized with its brackets escaped. Whatever the model
 * emitted, what reaches the manuscript is what this function produces.
 */
export function buildFigureMarker(fields: {
  figureNumber: number;
  visualType: VisualType | string;
  caption: string;
  description: string;
  data?: FigureData | null;
}): string {
  const flatCaption = fields.caption.replace(/\s+/g, ' ').trim();
  const caption = stripFigureCaptionPrefix(flatCaption, fields.figureNumber)
    || `Figure ${fields.figureNumber}`;
  const description = fields.description.replace(/\s+/g, ' ').trim();
  const lines = [
    `[FIGURE ${fields.figureNumber}`,
    `TYPE: ${String(fields.visualType)}`,
    `CAPTION: ${caption}`,
    `DESCRIPTION: ${description}`,
  ];
  if (fields.data) lines.push(`DATA: ${serializeFigureData(fields.data)}`);
  return `${lines.join('\n')}]`;
}
