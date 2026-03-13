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
=== VISUAL INTELLIGENCE ENGINE v2.0 (MANDATORY) ===

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
- Figure count ≤ ${density.maxFigures}?

=== END VISUAL INTELLIGENCE ENGINE v2.0 ===
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
}

export function parseRawFigureMarkers(content: string): RawFigureMarker[] {
  const markers: RawFigureMarker[] = [];

  // v2.0 Structured format: [FIGURE X\nTYPE: ...\nCAPTION: ...\nDESCRIPTION: ...\n]
  const structuredRegex = /\[FIGURE\s*(\d+)\s*\n\s*TYPE:\s*([^\n]+)\n\s*CAPTION:\s*([^\n]+)\n\s*DESCRIPTION:\s*([\s\S]*?)\]/gi;
  let match;
  const processedIndices = new Set<number>();

  while ((match = structuredRegex.exec(content)) !== null) {
    processedIndices.add(match.index);
    markers.push({
      num: parseInt(match[1]),
      fullMatch: match[0],
      type: match[2].trim().toLowerCase(),
      caption: match[3].trim(),
      description: match[4].trim(),
    });
  }

  // Legacy format: [FIGURE X: description]
  const legacyRegex = /\[FIGURE\s*(\d+)\s*:\s*([\s\S]*?)\]/gi;
  while ((match = legacyRegex.exec(content)) !== null) {
    // Skip if already parsed as structured
    if (processedIndices.has(match.index)) continue;
    // Also skip if this overlaps with a structured match
    let overlaps = false;
    for (const idx of processedIndices) {
      if (match.index >= idx && match.index < idx + 100) { overlaps = true; break; }
    }
    if (overlaps) continue;

    markers.push({
      num: parseInt(match[1]),
      fullMatch: match[0],
      description: match[2].trim(),
    });
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
    `Fig${s.chapter}.${specs.indexOf(s) + 1}: ${s.visualType} (score:${s.cognitiveScore}, render:${s.renderMode}, placement:${s.placement})`
  ).join(' | ');
}
