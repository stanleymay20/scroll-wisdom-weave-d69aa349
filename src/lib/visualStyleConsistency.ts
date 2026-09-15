/**
 * CONTRACT 10 — VISUAL STYLE CONSISTENCY (VSC-1.0)
 *
 * Frozen fail-closed contract: publication-grade consistency requires observed
 * evidence for every locked property, not merely prompt intent.
 */

export type ArtStyle =
  | 'realistic' | 'cartoon' | 'anime' | 'watercolor' | 'line-art' | 'digital-painting'
  | 'flat-design' | 'sketch' | 'pixel-art' | 'comic-book' | 'childrens-book' | 'academic-diagram';
export type ColorPaletteType = 'warm' | 'cool' | 'neutral' | 'vibrant' | 'muted' | 'monochrome' | 'custom';

export interface ColorPalette {
  type: ColorPaletteType;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  customColors?: string[];
}

export interface CharacterDesign {
  id: string;
  name: string;
  physicalDescriptionHash: string;
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
  dataColors: string[];
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
  lockedAt: string;
  lockedByChapter: number;
  version: string;
}

export interface StyleDriftViolation {
  type: 'art-style' | 'color-palette' | 'character' | 'chart-theme' | 'line-weight' | 'missing-evidence';
  severity: 'warning' | 'critical';
  message: string;
  expectedValue: string;
  actualValue: string;
  chapterNumber: number;
}

export interface StyleConsistencyResult {
  isConsistent: boolean;
  violations: StyleDriftViolation[];
  score: number;
  blocksPublishing: boolean;
}

export const ART_STYLE_PRESETS: Record<ArtStyle, { description: string; bestFor: string[] }> = {
  realistic: { description: 'Photorealistic rendering with accurate proportions', bestFor: ['academic', 'professional', 'medicine', 'science'] },
  cartoon: { description: 'Simplified, expressive style with bold outlines', bestFor: ['children', 'entertainment', 'educational'] },
  anime: { description: 'Japanese animation style with distinctive eyes and proportions', bestFor: ['teen', 'entertainment', 'narrative'] },
  watercolor: { description: 'Soft, fluid style with color bleeding effects', bestFor: ['children', 'arts', 'poetry', 'nature'] },
  'line-art': { description: 'Clean, minimal black and white illustrations', bestFor: ['technical', 'diagrams', 'minimalist'] },
  'digital-painting': { description: 'Rich, textured digital artwork', bestFor: ['fantasy', 'narrative', 'cover-art'] },
  'flat-design': { description: 'Modern, geometric style without shadows', bestFor: ['business', 'technology', 'infographics'] },
  sketch: { description: 'Hand-drawn, loose style', bestFor: ['draft', 'concept', 'notes'] },
  'pixel-art': { description: 'Retro gaming style with visible pixels', bestFor: ['gaming', 'technology', 'nostalgic'] },
  'comic-book': { description: 'Bold colors, dynamic lines, action-oriented', bestFor: ['comic', 'superhero', 'action'] },
  'childrens-book': { description: 'Soft, friendly, colorful with rounded shapes', bestFor: ['children', 'early-learning', 'bedtime'] },
  'academic-diagram': { description: 'Clean, professional diagrams for scholarly work', bestFor: ['academic', 'research', 'textbook'] },
};

export const DEFAULT_CHART_THEME: ChartTheme = {
  backgroundColor: 'hsl(0, 0%, 100%)', gridColor: 'hsl(0, 0%, 90%)', axisColor: 'hsl(0, 0%, 20%)',
  dataColors: ['hsl(220, 70%, 50%)', 'hsl(160, 70%, 45%)', 'hsl(280, 70%, 50%)', 'hsl(30, 80%, 55%)', 'hsl(350, 70%, 50%)'],
  fontFamily: 'system-ui, sans-serif', borderRadius: 4, showGrid: true,
};

export const CHILDRENS_CHART_THEME: ChartTheme = {
  backgroundColor: 'hsl(45, 100%, 96%)', gridColor: 'hsl(45, 50%, 85%)', axisColor: 'hsl(30, 50%, 40%)',
  dataColors: ['hsl(350, 80%, 60%)', 'hsl(200, 80%, 55%)', 'hsl(120, 60%, 50%)', 'hsl(45, 90%, 55%)', 'hsl(280, 70%, 60%)'],
  fontFamily: '"Comic Sans MS", cursive, sans-serif', borderRadius: 12, showGrid: false,
};

export function createStyleLock(
  bookId: string,
  bookType: string,
  artStyle: ArtStyle,
  customPalette?: Partial<ColorPalette>
): VisualStyleLock {
  const defaultPalette: ColorPalette = {
    type: 'neutral', primary: 'hsl(220, 70%, 50%)', secondary: 'hsl(160, 60%, 45%)', accent: 'hsl(30, 80%, 55%)',
    background: 'hsl(0, 0%, 98%)', text: 'hsl(0, 0%, 10%)', ...customPalette,
  };
  return {
    bookId,
    artStyle,
    colorPalette: defaultPalette,
    chartTheme: bookType === 'children' ? CHILDRENS_CHART_THEME : DEFAULT_CHART_THEME,
    characters: [],
    lineWeight: bookType === 'comic' ? 'thick' : 'medium',
    textInImage: bookType === 'children' || bookType === 'comic',
    lockedAt: new Date().toISOString(),
    lockedByChapter: 1,
    version: '1.0',
  };
}

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function canonicalCharacterTraits(character: {
  artStyle: ArtStyle;
  colorPalette: { skinTone: string; hairColor: string; eyeColor: string; primaryOutfit: string; secondaryOutfit: string };
  designNotes: string;
}): string {
  return [
    character.artStyle,
    character.colorPalette.skinTone,
    character.colorPalette.hairColor,
    character.colorPalette.eyeColor,
    character.colorPalette.primaryOutfit,
    character.colorPalette.secondaryOutfit,
    character.designNotes,
  ].map(normalize).join('|');
}

export function registerCharacter(styleLock: VisualStyleLock, character: Omit<CharacterDesign, 'physicalDescriptionHash'>): VisualStyleLock {
  const physicalDescriptionHash = simpleHash(canonicalCharacterTraits(character));
  return { ...styleLock, characters: [...styleLock.characters, { ...character, physicalDescriptionHash }] };
}

function paletteMatches(expected: ColorPalette, detected: string[]): boolean {
  const observed = new Set(detected.map(normalize));
  return [expected.primary, expected.secondary, expected.accent].every(color => observed.has(normalize(color)));
}

function chartThemeFingerprint(theme: ChartTheme): string {
  return simpleHash(JSON.stringify({
    backgroundColor: normalize(theme.backgroundColor), gridColor: normalize(theme.gridColor), axisColor: normalize(theme.axisColor),
    dataColors: theme.dataColors.map(normalize), fontFamily: normalize(theme.fontFamily), borderRadius: theme.borderRadius, showGrid: theme.showGrid,
  }));
}

export function detectStyleDrift(
  styleLock: VisualStyleLock,
  generatedImage: {
    chapterNumber: number;
    detectedArtStyle?: ArtStyle;
    detectedColors?: string[];
    detectedLineWeight?: 'thin' | 'medium' | 'thick';
    detectedChartTheme?: ChartTheme;
    characterId?: string;
    characterTraits?: {
      artStyle: ArtStyle;
      colorPalette: CharacterDesign['colorPalette'];
      designNotes: string;
    };
    /** @deprecated free-form text is not sufficient evidence for character consistency. */
    characterDescription?: string;
  }
): StyleDriftViolation[] {
  const violations: StyleDriftViolation[] = [];
  const chapterNumber = generatedImage.chapterNumber;

  if (!generatedImage.detectedArtStyle) {
    violations.push({ type: 'missing-evidence', severity: 'critical', message: 'Art-style evidence missing', expectedValue: styleLock.artStyle, actualValue: 'missing', chapterNumber });
  } else if (generatedImage.detectedArtStyle !== styleLock.artStyle) {
    violations.push({ type: 'art-style', severity: 'critical', message: `Art style changed from "${styleLock.artStyle}" to "${generatedImage.detectedArtStyle}"`, expectedValue: styleLock.artStyle, actualValue: generatedImage.detectedArtStyle, chapterNumber });
  }

  if (!generatedImage.detectedColors || generatedImage.detectedColors.length === 0) {
    violations.push({ type: 'missing-evidence', severity: 'critical', message: 'Color-palette evidence missing', expectedValue: `${styleLock.colorPalette.primary}, ${styleLock.colorPalette.secondary}, ${styleLock.colorPalette.accent}`, actualValue: 'missing', chapterNumber });
  } else if (!paletteMatches(styleLock.colorPalette, generatedImage.detectedColors)) {
    violations.push({ type: 'color-palette', severity: 'critical', message: 'Detected colors do not contain the locked primary/secondary/accent palette', expectedValue: `${styleLock.colorPalette.primary}, ${styleLock.colorPalette.secondary}, ${styleLock.colorPalette.accent}`, actualValue: generatedImage.detectedColors.join(', '), chapterNumber });
  }

  if (!generatedImage.detectedLineWeight) {
    violations.push({ type: 'missing-evidence', severity: 'critical', message: 'Line-weight evidence missing', expectedValue: styleLock.lineWeight, actualValue: 'missing', chapterNumber });
  } else if (generatedImage.detectedLineWeight !== styleLock.lineWeight) {
    violations.push({ type: 'line-weight', severity: 'critical', message: 'Line weight changed', expectedValue: styleLock.lineWeight, actualValue: generatedImage.detectedLineWeight, chapterNumber });
  }

  if (generatedImage.detectedChartTheme) {
    const expected = chartThemeFingerprint(styleLock.chartTheme);
    const actual = chartThemeFingerprint(generatedImage.detectedChartTheme);
    if (actual !== expected) violations.push({ type: 'chart-theme', severity: 'critical', message: 'Chart theme drift detected', expectedValue: expected, actualValue: actual, chapterNumber });
  }

  if (generatedImage.characterId) {
    const registered = styleLock.characters.find(c => c.id === generatedImage.characterId);
    if (!registered) {
      violations.push({ type: 'character', severity: 'critical', message: `Unknown character ID ${generatedImage.characterId}`, expectedValue: 'registered character', actualValue: generatedImage.characterId, chapterNumber });
    } else if (!generatedImage.characterTraits) {
      violations.push({ type: 'missing-evidence', severity: 'critical', message: `Structured character evidence missing for "${registered.name}"`, expectedValue: registered.physicalDescriptionHash, actualValue: 'missing', chapterNumber });
    } else {
      const actualHash = simpleHash(canonicalCharacterTraits(generatedImage.characterTraits));
      if (actualHash !== registered.physicalDescriptionHash) {
        violations.push({ type: 'character', severity: 'critical', message: `Character "${registered.name}" appearance changed`, expectedValue: registered.physicalDescriptionHash, actualValue: actualHash, chapterNumber });
      }
    }
  }

  return violations;
}

export function validateStyleConsistency(
  styleLock: VisualStyleLock,
  chapters: {
    chapterNumber: number;
    images: Array<{
      detectedArtStyle?: ArtStyle;
      detectedColors?: string[];
      detectedLineWeight?: 'thin' | 'medium' | 'thick';
      detectedChartTheme?: ChartTheme;
      characterId?: string;
      characterTraits?: { artStyle: ArtStyle; colorPalette: CharacterDesign['colorPalette']; designNotes: string };
      characterDescription?: string;
    }>;
  }[]
): StyleConsistencyResult {
  const violations = chapters.flatMap(chapter => chapter.images.flatMap(image => detectStyleDrift(styleLock, { chapterNumber: chapter.chapterNumber, ...image })));
  const critical = violations.filter(v => v.severity === 'critical');
  return {
    isConsistent: critical.length === 0,
    violations,
    score: Math.max(0, 100 - critical.length * 20 - violations.filter(v => v.severity === 'warning').length * 5),
    blocksPublishing: critical.length > 0,
  };
}

export function buildStyleEnforcedPrompt(
  styleLock: VisualStyleLock,
  basePrompt: string,
  options?: { characterId?: string; visualType?: 'illustration' | 'chart' | 'diagram' }
): string {
  const styleInfo = ART_STYLE_PRESETS[styleLock.artStyle];
  let prompt = `[STYLE LOCK: ${styleLock.artStyle}]\nArt Style: ${styleInfo.description}\nLine Weight: ${styleLock.lineWeight}\n`;
  prompt += `Color Palette: ${styleLock.colorPalette.type}\n- Primary: ${styleLock.colorPalette.primary}\n- Secondary: ${styleLock.colorPalette.secondary}\n- Accent: ${styleLock.colorPalette.accent}\n\n`;
  if (options?.characterId) {
    const character = styleLock.characters.find(c => c.id === options.characterId);
    if (character) prompt += `[CHARACTER LOCK: ${character.name}]\nDesign Notes: ${character.designNotes}\nSkin: ${character.colorPalette.skinTone}\nHair: ${character.colorPalette.hairColor}\nEyes: ${character.colorPalette.eyeColor}\nOutfit Primary: ${character.colorPalette.primaryOutfit}\nOutfit Secondary: ${character.colorPalette.secondaryOutfit}\n\n`;
  }
  if (options?.visualType === 'chart' || options?.visualType === 'diagram') {
    prompt += `[CHART THEME]\nBackground: ${styleLock.chartTheme.backgroundColor}\nData Colors: ${styleLock.chartTheme.dataColors.join(', ')}\nBorder Radius: ${styleLock.chartTheme.borderRadius}px\n\n`;
  }
  prompt += 'CONSISTENCY RULE: all emitted style metadata and visual output MUST match this lock. Missing verification metadata is a publication-blocking contract failure.\n\n';
  return prompt + `[CONTENT REQUEST]\n${basePrompt}`;
}

export const VSC_CONTRACT_VERSION = '1.0';
export const VSC_CONTRACT_FROZEN = true;
export const VSC_CONTRACT_SUMMARY = `
CONTRACT 10 — VISUAL STYLE CONSISTENCY (VSC-1.0)
LOCKED: art style, color palette, character traits, chart theme, line weight.
ENFORCEMENT: missing evidence or drift is publication-blocking.
VERSION: ${VSC_CONTRACT_VERSION}
STATUS: FROZEN
`;
