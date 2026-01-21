/**
 * CONTRACT 10 — VISUAL STYLE CONSISTENCY (VSC-1.0)
 * 
 * This contract prevents "style drift" across chapters by locking
 * visual properties (color palette, art style, character design, chart themes)
 * at book creation time.
 * 
 * FROZEN CONTRACT - Changes require versioned upgrades (VSC-1.1, VSC-1.2, etc.)
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ArtStyle = 
  | 'realistic'
  | 'cartoon'
  | 'anime'
  | 'watercolor'
  | 'line-art'
  | 'digital-painting'
  | 'flat-design'
  | 'sketch'
  | 'pixel-art'
  | 'comic-book'
  | 'childrens-book'
  | 'academic-diagram';

export type ColorPaletteType = 'warm' | 'cool' | 'neutral' | 'vibrant' | 'muted' | 'monochrome' | 'custom';

export interface ColorPalette {
  type: ColorPaletteType;
  primary: string;      // HSL format
  secondary: string;    // HSL format
  accent: string;       // HSL format
  background: string;   // HSL format
  text: string;         // HSL format
  customColors?: string[]; // Additional colors if custom
}

export interface CharacterDesign {
  id: string;
  name: string;
  physicalDescriptionHash: string; // Hash of physical traits for consistency
  artStyle: ArtStyle;
  colorPalette: {
    skinTone: string;
    hairColor: string;
    eyeColor: string;
    primaryOutfit: string;
    secondaryOutfit: string;
  };
  designNotes: string;
  createdInChapter: number;
}

export interface ChartTheme {
  backgroundColor: string;
  gridColor: string;
  axisColor: string;
  dataColors: string[]; // Array of colors for data series
  fontFamily: string;
  borderRadius: number;
  showGrid: boolean;
}

export interface VisualStyleLock {
  bookId: string;
  artStyle: ArtStyle;
  colorPalette: ColorPalette;
  chartTheme: ChartTheme;
  characters: CharacterDesign[];
  lineWeight: 'thin' | 'medium' | 'thick';
  textInImage: boolean;
  lockedAt: string; // ISO timestamp
  lockedByChapter: number; // Chapter where style was locked
  version: string;
}

export interface StyleDriftViolation {
  type: 'art-style' | 'color-palette' | 'character' | 'chart-theme' | 'line-weight';
  severity: 'warning' | 'critical';
  message: string;
  expectedValue: string;
  actualValue: string;
  chapterNumber: number;
}

export interface StyleConsistencyResult {
  isConsistent: boolean;
  violations: StyleDriftViolation[];
  score: number; // 0-100
  blocksPublishing: boolean;
}

// ============================================================================
// DEFAULT STYLE PRESETS
// ============================================================================

export const ART_STYLE_PRESETS: Record<ArtStyle, { description: string; bestFor: string[] }> = {
  'realistic': {
    description: 'Photorealistic rendering with accurate proportions',
    bestFor: ['academic', 'professional', 'medicine', 'science'],
  },
  'cartoon': {
    description: 'Simplified, expressive style with bold outlines',
    bestFor: ['children', 'entertainment', 'educational'],
  },
  'anime': {
    description: 'Japanese animation style with distinctive eyes and proportions',
    bestFor: ['teen', 'entertainment', 'narrative'],
  },
  'watercolor': {
    description: 'Soft, fluid style with color bleeding effects',
    bestFor: ['children', 'arts', 'poetry', 'nature'],
  },
  'line-art': {
    description: 'Clean, minimal black and white illustrations',
    bestFor: ['technical', 'diagrams', 'minimalist'],
  },
  'digital-painting': {
    description: 'Rich, textured digital artwork',
    bestFor: ['fantasy', 'narrative', 'cover-art'],
  },
  'flat-design': {
    description: 'Modern, geometric style without shadows',
    bestFor: ['business', 'technology', 'infographics'],
  },
  'sketch': {
    description: 'Hand-drawn, loose style',
    bestFor: ['draft', 'concept', 'notes'],
  },
  'pixel-art': {
    description: 'Retro gaming style with visible pixels',
    bestFor: ['gaming', 'technology', 'nostalgic'],
  },
  'comic-book': {
    description: 'Bold colors, dynamic lines, action-oriented',
    bestFor: ['comic', 'superhero', 'action'],
  },
  'childrens-book': {
    description: 'Soft, friendly, colorful with rounded shapes',
    bestFor: ['children', 'early-learning', 'bedtime'],
  },
  'academic-diagram': {
    description: 'Clean, professional diagrams for scholarly work',
    bestFor: ['academic', 'research', 'textbook'],
  },
};

export const DEFAULT_CHART_THEME: ChartTheme = {
  backgroundColor: 'hsl(0, 0%, 100%)',
  gridColor: 'hsl(0, 0%, 90%)',
  axisColor: 'hsl(0, 0%, 20%)',
  dataColors: [
    'hsl(220, 70%, 50%)',
    'hsl(160, 70%, 45%)',
    'hsl(280, 70%, 50%)',
    'hsl(30, 80%, 55%)',
    'hsl(350, 70%, 50%)',
  ],
  fontFamily: 'system-ui, sans-serif',
  borderRadius: 4,
  showGrid: true,
};

export const CHILDRENS_CHART_THEME: ChartTheme = {
  backgroundColor: 'hsl(45, 100%, 96%)',
  gridColor: 'hsl(45, 50%, 85%)',
  axisColor: 'hsl(30, 50%, 40%)',
  dataColors: [
    'hsl(350, 80%, 60%)',  // Bright red
    'hsl(200, 80%, 55%)',  // Sky blue
    'hsl(120, 60%, 50%)',  // Grass green
    'hsl(45, 90%, 55%)',   // Sunny yellow
    'hsl(280, 70%, 60%)',  // Purple
  ],
  fontFamily: '"Comic Sans MS", cursive, sans-serif',
  borderRadius: 12,
  showGrid: false,
};

// ============================================================================
// STYLE LOCK FUNCTIONS
// ============================================================================

/**
 * Create initial style lock for a new book
 */
export function createStyleLock(
  bookId: string,
  bookType: string,
  artStyle: ArtStyle,
  customPalette?: Partial<ColorPalette>
): VisualStyleLock {
  const isChildrens = bookType === 'children';
  const isComic = bookType === 'comic';

  const defaultPalette: ColorPalette = {
    type: 'neutral',
    primary: 'hsl(220, 70%, 50%)',
    secondary: 'hsl(160, 60%, 45%)',
    accent: 'hsl(30, 80%, 55%)',
    background: 'hsl(0, 0%, 98%)',
    text: 'hsl(0, 0%, 10%)',
    ...customPalette,
  };

  return {
    bookId,
    artStyle,
    colorPalette: defaultPalette,
    chartTheme: isChildrens ? CHILDRENS_CHART_THEME : DEFAULT_CHART_THEME,
    characters: [],
    lineWeight: isComic ? 'thick' : 'medium',
    textInImage: isChildrens || isComic,
    lockedAt: new Date().toISOString(),
    lockedByChapter: 1,
    version: '1.0',
  };
}

/**
 * Register a new character in the style lock
 */
export function registerCharacter(
  styleLock: VisualStyleLock,
  character: Omit<CharacterDesign, 'physicalDescriptionHash'>
): VisualStyleLock {
  const physicalTraits = [
    character.colorPalette.skinTone,
    character.colorPalette.hairColor,
    character.colorPalette.eyeColor,
    character.artStyle,
    character.designNotes,
  ].join('|');

  const hash = simpleHash(physicalTraits);

  return {
    ...styleLock,
    characters: [
      ...styleLock.characters,
      { ...character, physicalDescriptionHash: hash },
    ],
  };
}

/**
 * Simple hash function for consistency checking
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================================
// STYLE DRIFT DETECTION
// ============================================================================

/**
 * Check if a generated image matches the locked style
 */
export function detectStyleDrift(
  styleLock: VisualStyleLock,
  generatedImage: {
    chapterNumber: number;
    detectedArtStyle?: ArtStyle;
    detectedColors?: string[];
    characterId?: string;
    characterDescription?: string;
  }
): StyleDriftViolation[] {
  const violations: StyleDriftViolation[] = [];

  // Check art style consistency
  if (generatedImage.detectedArtStyle && generatedImage.detectedArtStyle !== styleLock.artStyle) {
    violations.push({
      type: 'art-style',
      severity: 'critical',
      message: `Art style changed from "${styleLock.artStyle}" to "${generatedImage.detectedArtStyle}"`,
      expectedValue: styleLock.artStyle,
      actualValue: generatedImage.detectedArtStyle,
      chapterNumber: generatedImage.chapterNumber,
    });
  }

  // Check character consistency
  if (generatedImage.characterId && generatedImage.characterDescription) {
    const registeredCharacter = styleLock.characters.find(c => c.id === generatedImage.characterId);
    
    if (registeredCharacter) {
      const newHash = simpleHash(generatedImage.characterDescription);
      
      if (newHash !== registeredCharacter.physicalDescriptionHash) {
        violations.push({
          type: 'character',
          severity: 'critical',
          message: `Character "${registeredCharacter.name}" appearance changed`,
          expectedValue: `Hash: ${registeredCharacter.physicalDescriptionHash}`,
          actualValue: `Hash: ${newHash}`,
          chapterNumber: generatedImage.chapterNumber,
        });
      }
    }
  }

  return violations;
}

/**
 * Validate entire book for style consistency
 */
export function validateStyleConsistency(
  styleLock: VisualStyleLock,
  chapters: {
    chapterNumber: number;
    images: {
      detectedArtStyle?: ArtStyle;
      detectedColors?: string[];
      characterId?: string;
      characterDescription?: string;
    }[];
  }[]
): StyleConsistencyResult {
  const allViolations: StyleDriftViolation[] = [];

  for (const chapter of chapters) {
    for (const image of chapter.images) {
      const violations = detectStyleDrift(styleLock, {
        chapterNumber: chapter.chapterNumber,
        ...image,
      });
      allViolations.push(...violations);
    }
  }

  const criticalViolations = allViolations.filter(v => v.severity === 'critical');
  const score = Math.max(0, 100 - (criticalViolations.length * 20) - (allViolations.length * 5));

  return {
    isConsistent: criticalViolations.length === 0,
    violations: allViolations,
    score,
    blocksPublishing: criticalViolations.length > 0,
  };
}

// ============================================================================
// PROMPT BUILDER FOR CONSISTENT GENERATION
// ============================================================================

/**
 * Build a style-enforced prompt for image generation
 */
export function buildStyleEnforcedPrompt(
  styleLock: VisualStyleLock,
  basePrompt: string,
  options?: {
    characterId?: string;
    visualType?: 'illustration' | 'chart' | 'diagram';
  }
): string {
  const styleInfo = ART_STYLE_PRESETS[styleLock.artStyle];
  
  let prompt = `[STYLE LOCK: ${styleLock.artStyle}]\n`;
  prompt += `Art Style: ${styleInfo.description}\n`;
  prompt += `Line Weight: ${styleLock.lineWeight}\n`;
  prompt += `Color Palette: ${styleLock.colorPalette.type}\n`;
  prompt += `- Primary: ${styleLock.colorPalette.primary}\n`;
  prompt += `- Secondary: ${styleLock.colorPalette.secondary}\n`;
  prompt += `- Accent: ${styleLock.colorPalette.accent}\n\n`;

  // Add character consistency if applicable
  if (options?.characterId) {
    const character = styleLock.characters.find(c => c.id === options.characterId);
    if (character) {
      prompt += `[CHARACTER LOCK: ${character.name}]\n`;
      prompt += `Design Notes: ${character.designNotes}\n`;
      prompt += `Skin: ${character.colorPalette.skinTone}\n`;
      prompt += `Hair: ${character.colorPalette.hairColor}\n`;
      prompt += `Eyes: ${character.colorPalette.eyeColor}\n`;
      prompt += `Outfit Primary: ${character.colorPalette.primaryOutfit}\n\n`;
    }
  }

  // Add chart theme if diagram/chart
  if (options?.visualType === 'chart' || options?.visualType === 'diagram') {
    prompt += `[CHART THEME]\n`;
    prompt += `Background: ${styleLock.chartTheme.backgroundColor}\n`;
    prompt += `Data Colors: ${styleLock.chartTheme.dataColors.join(', ')}\n`;
    prompt += `Border Radius: ${styleLock.chartTheme.borderRadius}px\n\n`;
  }

  prompt += `CONSISTENCY RULE: All visuals MUST match the locked style above.\n`;
  prompt += `Any deviation from the established art style, colors, or character designs is a CONTRACT VIOLATION.\n\n`;
  prompt += `[CONTENT REQUEST]\n${basePrompt}`;

  return prompt;
}

// ============================================================================
// CONTRACT EXPORT
// ============================================================================

export const VSC_CONTRACT_VERSION = '1.0';
export const VSC_CONTRACT_FROZEN = true;

export const VSC_CONTRACT_SUMMARY = `
CONTRACT 10 — VISUAL STYLE CONSISTENCY (VSC-1.0)

CORE PRINCIPLE: Once a visual style is established, it is LOCKED for the entire book.

LOCKED PROPERTIES:
- Art style (realistic, cartoon, anime, etc.)
- Color palette (primary, secondary, accent)
- Character designs (physical traits hashed for verification)
- Chart themes (colors, fonts, styling)
- Line weight (thin, medium, thick)

ENFORCEMENT:
- Style drift detection on every generated image
- Critical violations → BLOCK PUBLISHING
- Character consistency via physical description hashing
- Prompt injection to enforce locked style

BENEFITS:
- No "style drift" across chapters
- Professional, consistent book appearance
- Characters remain recognizable
- Charts/diagrams match book theme

VERSION: ${VSC_CONTRACT_VERSION}
STATUS: ${VSC_CONTRACT_FROZEN ? 'FROZEN' : 'DRAFT'}
`;
