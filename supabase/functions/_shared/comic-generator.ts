// ===========================================
// SCROLLLIBRARY COMIC BOOK GENERATOR
// Authority-Grade Visual Storytelling System
// ===========================================

// ============================================
// TYPES & INTERFACES
// ============================================

export interface ComicPanel {
  panelNumber: number;
  visual: VisualDescription;
  dialogue: DialogueLine[];
  caption?: string;
  pagePosition?: 'full' | 'half' | 'third' | 'quarter';
}

export interface VisualDescription {
  scene: string;
  characters: CharacterInScene[];
  cameraAngle: 'wide' | 'medium' | 'close-up' | 'bird-eye' | 'worm-eye';
  mood: string;
  action: string;
  background: string;
}

export interface CharacterInScene {
  name: string;
  position: string;
  expression: string;
  pose: string;
  wearing?: string;
}

export interface DialogueLine {
  character: string;
  speech: string;
  bubbleType: 'speech' | 'thought' | 'shout' | 'whisper' | 'narration';
}

export interface ComicStyleGuide {
  artStyle: string;
  colorPalette: string;
  lineWeight: string;
  shadingStyle: string;
  characterDesignNotes: string;
}

export interface ComicPage {
  pageNumber: number;
  panels: ComicPanel[];
  layoutType: 'grid' | 'dynamic' | 'splash' | 'spread';
}

// ============================================
// VISUAL CONSISTENCY CONTRACT
// ============================================

export const STYLE_PRESETS: Record<string, ComicStyleGuide> = {
  modern_superhero: {
    artStyle: 'Modern American superhero comic style, dynamic poses, bold lines',
    colorPalette: 'Vibrant primary colors with dramatic shadows',
    lineWeight: 'Bold outlines with varied line weights for depth',
    shadingStyle: 'Cell shading with dramatic lighting',
    characterDesignNotes: 'Muscular heroic proportions, expressive faces, detailed costumes',
  },
  manga: {
    artStyle: 'Japanese manga style with expressive eyes and dynamic motion lines',
    colorPalette: 'Clean black and white with screen tones, or soft pastel colors',
    lineWeight: 'Clean thin lines with emphasis on speed lines and effects',
    shadingStyle: 'Screen tones and crosshatching',
    characterDesignNotes: 'Large expressive eyes, varied hair styles, emotional expressions',
  },
  children_book: {
    artStyle: 'Friendly children\'s book illustration, rounded shapes, warm and inviting',
    colorPalette: 'Bright, cheerful colors with soft gradients',
    lineWeight: 'Soft rounded lines, minimal harsh edges',
    shadingStyle: 'Soft gradients and gentle shadows',
    characterDesignNotes: 'Cute proportions, big eyes, friendly expressions, simple clothing',
  },
  graphic_novel: {
    artStyle: 'Realistic graphic novel style with detailed environments',
    colorPalette: 'Muted, sophisticated color palette with mood-driven tones',
    lineWeight: 'Detailed linework with cross-hatching',
    shadingStyle: 'Realistic lighting with atmospheric effects',
    characterDesignNotes: 'Realistic proportions, detailed clothing, subtle expressions',
  },
  vintage_comic: {
    artStyle: 'Classic Golden Age comic style with halftone dots',
    colorPalette: 'Limited palette: primaries plus black, white, and halftones',
    lineWeight: 'Bold, consistent outlines',
    shadingStyle: 'Ben-Day dots and flat colors',
    characterDesignNotes: 'Classic proportions, bold expressions, retro costumes',
  },
  african_superhero: {
    artStyle: 'Afrofuturistic comic style blending traditional African art with modern superhero aesthetics',
    colorPalette: 'Rich earth tones, gold accents, vibrant African-inspired patterns',
    lineWeight: 'Bold confident lines with decorative pattern elements',
    shadingStyle: 'Dramatic lighting with cultural pattern integration',
    characterDesignNotes: 'Diverse African features, traditional + futuristic costume fusion, cultural symbols',
  },
};

// ============================================
// PANEL STRUCTURE TEMPLATES
// ============================================

export const PANEL_LAYOUTS = {
  action_sequence: {
    panelCount: 5,
    structure: [
      { position: 'wide', purpose: 'establishing shot' },
      { position: 'medium', purpose: 'character reaction' },
      { position: 'close-up', purpose: 'tension build' },
      { position: 'dynamic', purpose: 'action peak' },
      { position: 'aftermath', purpose: 'resolution' },
    ],
  },
  dialogue_scene: {
    panelCount: 4,
    structure: [
      { position: 'establishing', purpose: 'set location' },
      { position: 'two-shot', purpose: 'characters together' },
      { position: 'reaction', purpose: 'close-up reactions' },
      { position: 'conclusion', purpose: 'scene end' },
    ],
  },
  emotional_beat: {
    panelCount: 3,
    structure: [
      { position: 'context', purpose: 'situation setup' },
      { position: 'close-up', purpose: 'emotional peak' },
      { position: 'resolution', purpose: 'aftermath/transition' },
    ],
  },
  splash_page: {
    panelCount: 1,
    structure: [
      { position: 'full-page', purpose: 'dramatic moment' },
    ],
  },
};

// ============================================
// COMIC GENERATION PROMPTS
// ============================================

// ===========================================
// FORMATTING CONTRACT (NO MARKDOWN)
// ===========================================

const COMIC_FORMATTING_CONTRACT = `
=== FORMATTING CONTRACT — STRICT ===

You are generating FINAL, PUBLISHABLE COMIC CONTENT.

ABSOLUTE RULES:
- DO NOT use Markdown syntax for headings or emphasis.
- DO NOT use **, __, ##, ###, backticks, or code fences.
- Use [PANEL X] markers for panel structure.
- Use plain text labels like "Visual:" and "Dialogue:" and "Caption:"

If any Markdown symbols (**, ##) appear in dialogue or descriptions, the output is INVALID.

=== END FORMATTING CONTRACT ===
`;

export function buildComicSystemPrompt(
  style: keyof typeof STYLE_PRESETS,
  language: string
): string {
  const styleGuide = STYLE_PRESETS[style] || STYLE_PRESETS.children_book;
  
  return `You are a professional comic book writer and visual storyteller.

${COMIC_FORMATTING_CONTRACT}

ROLE: Create structured comic book content with proper panel layouts, dialogue, and visual descriptions.

VISUAL STYLE CONTRACT (MUST MAINTAIN ACROSS ALL PANELS):
- Art Style: ${styleGuide.artStyle}
- Color Palette: ${styleGuide.colorPalette}
- Line Weight: ${styleGuide.lineWeight}
- Shading: ${styleGuide.shadingStyle}
- Characters: ${styleGuide.characterDesignNotes}

LANGUAGE: All dialogue and captions must be in ${language}.

NON-NEGOTIABLE RULES:
1. Every panel MUST have character dialogue (speech bubbles) — this is what makes it a comic
2. Dialogue should be natural, expressive, and advance the story
3. Visual descriptions must be detailed enough for AI image generation
4. Maintain character appearance consistency across ALL panels
5. Story must have clear beginning, conflict, and resolution
6. Maximum 30 words per speech bubble
7. Captions/narration boxes are optional, dialogue is MANDATORY

FORBIDDEN:
- Single giant image per chapter
- Floating captions without panel structure
- Random style switching between panels
- Walls of text in captions
- Panels without dialogue
- Markdown syntax (**, ##, backticks)`;
}

export function buildComicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string,
  panelCount: number = 6
): string {
  return `Create a COMIC BOOK CHAPTER for:
**Book:** "${bookTitle}"
**Chapter ${chapterNumber}:** "${chapterTitle}"
**Story Elements:** ${keyTopics?.join(', ') || 'Tell an engaging visual story'}

Generate ${panelCount} PANELS following this EXACT format:

---

[PANEL 1]
**Visual:** [Detailed scene description: setting, characters, their positions, expressions, poses, lighting, mood. 2-3 sentences for AI image generation.]
**Dialogue:**
- CHARACTER_NAME: "What they say in their speech bubble"
- CHARACTER_NAME: "Their response or reaction"
**Caption:** "[Optional narration - time/place/internal thought]"

---

[PANEL 2]
**Visual:** [Next scene continuing the story...]
**Dialogue:**
- CHARACTER_NAME: "Continue the conversation..."
**Caption:** "[Optional]"

---

(Continue for all ${panelCount} panels)

**REQUIREMENTS:**
✅ EVERY panel must have at least one dialogue line
✅ Show emotions through expressions (smiling, frowning, surprised, etc.)
✅ Use different camera angles (wide shot, close-up, medium shot)
✅ Include action verbs in visual descriptions
✅ End with a satisfying conclusion or cliffhanger
✅ All text in ${language}

**STORY ARC:**
- Panels 1-2: Introduction/Setup
- Panels 3-4: Conflict/Challenge
- Panels 5-${panelCount}: Resolution/Cliffhanger

BEGIN CREATING THE COMIC CHAPTER:`;
}

// ============================================
// PANEL PARSING & VALIDATION
// ============================================

export function parseComicPanels(content: string): ComicPanel[] {
  const panels: ComicPanel[] = [];
  
  // Primary pattern: [PANEL X] format
  const panelRegex = /\[PANEL\s*(\d+)\]\s*\*\*Visual:\*\*\s*([\s\S]*?)\*\*Dialogue:\*\*\s*([\s\S]*?)(?:\*\*Caption:\*\*\s*"?([^"]*)"?)?(?=\s*---|\s*\[PANEL|\s*$)/gi;
  
  let match;
  while ((match = panelRegex.exec(content)) !== null) {
    const panelNumber = parseInt(match[1]);
    const visualText = match[2].trim();
    const dialogueText = match[3].trim();
    const captionText = (match[4] || '').trim();
    
    // Parse dialogue lines
    const dialogueLines: DialogueLine[] = [];
    const dialogueLineRegex = /-\s*([^:]+):\s*"?([^"]+)"?/g;
    let dialogueMatch;
    
    while ((dialogueMatch = dialogueLineRegex.exec(dialogueText)) !== null) {
      const character = dialogueMatch[1].trim();
      const speech = dialogueMatch[2].trim();
      
      // Determine bubble type from speech patterns
      let bubbleType: DialogueLine['bubbleType'] = 'speech';
      if (speech.includes('*') || speech.toLowerCase().includes('thinking')) {
        bubbleType = 'thought';
      } else if (speech.endsWith('!') || speech.endsWith('!!') || speech.toUpperCase() === speech) {
        bubbleType = 'shout';
      } else if (speech.toLowerCase().includes('whisper') || speech.includes('...')) {
        bubbleType = 'whisper';
      }
      
      dialogueLines.push({
        character,
        speech,
        bubbleType,
      });
    }
    
    // Parse visual description
    const visual: VisualDescription = {
      scene: visualText,
      characters: extractCharactersFromVisual(visualText),
      cameraAngle: detectCameraAngle(visualText),
      mood: detectMood(visualText),
      action: extractAction(visualText),
      background: extractBackground(visualText),
    };
    
    panels.push({
      panelNumber,
      visual,
      dialogue: dialogueLines,
      caption: captionText || undefined,
    });
  }
  
  return panels;
}

function extractCharactersFromVisual(visual: string): CharacterInScene[] {
  const characters: CharacterInScene[] = [];
  
  // Simple extraction - look for capitalized names
  const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|are|stands?|sits?|looks?|appears?)/g;
  let match;
  
  while ((match = namePattern.exec(visual)) !== null) {
    characters.push({
      name: match[1],
      position: 'center',
      expression: 'neutral',
      pose: 'standing',
    });
  }
  
  return characters;
}

function detectCameraAngle(visual: string): VisualDescription['cameraAngle'] {
  const lowerVisual = visual.toLowerCase();
  if (lowerVisual.includes('wide shot') || lowerVisual.includes('establishing')) return 'wide';
  if (lowerVisual.includes('close-up') || lowerVisual.includes('closeup')) return 'close-up';
  if (lowerVisual.includes('bird') || lowerVisual.includes('above') || lowerVisual.includes('aerial')) return 'bird-eye';
  if (lowerVisual.includes('low angle') || lowerVisual.includes('looking up')) return 'worm-eye';
  return 'medium';
}

function detectMood(visual: string): string {
  const lowerVisual = visual.toLowerCase();
  if (lowerVisual.includes('dark') || lowerVisual.includes('ominous') || lowerVisual.includes('tense')) return 'dramatic';
  if (lowerVisual.includes('bright') || lowerVisual.includes('cheerful') || lowerVisual.includes('happy')) return 'uplifting';
  if (lowerVisual.includes('action') || lowerVisual.includes('explosive') || lowerVisual.includes('dynamic')) return 'intense';
  if (lowerVisual.includes('peaceful') || lowerVisual.includes('calm') || lowerVisual.includes('serene')) return 'peaceful';
  return 'neutral';
}

function extractAction(visual: string): string {
  const actionPatterns = [
    /(\w+ing)\s+(?:through|across|into|over|toward)/i,
    /(?:leaps?|jumps?|flies?|runs?|fights?|attacks?)/i,
  ];
  
  for (const pattern of actionPatterns) {
    const match = visual.match(pattern);
    if (match) return match[0];
  }
  
  return 'standing';
}

function extractBackground(visual: string): string {
  const bgPatterns = [
    /(?:in|at|inside|outside)\s+(?:the\s+)?([^.,]+)/i,
    /background[:\s]+([^.,]+)/i,
  ];
  
  for (const pattern of bgPatterns) {
    const match = visual.match(pattern);
    if (match) return match[1].trim();
  }
  
  return 'unspecified';
}

// ============================================
// IMAGE GENERATION PROMPT BUILDER
// ============================================

export function buildImagePrompt(
  panel: ComicPanel,
  styleGuide: ComicStyleGuide,
  category: string
): string {
  const characterDesc = panel.visual.characters
    .map(c => `${c.name} (${c.expression} expression, ${c.pose})`)
    .join(', ');
  
  return `${styleGuide.artStyle}. ${panel.visual.scene}. ` +
    `Camera angle: ${panel.visual.cameraAngle}. ` +
    `Mood: ${panel.visual.mood}. ` +
    `${characterDesc ? `Characters: ${characterDesc}. ` : ''}` +
    `${styleGuide.colorPalette}. ` +
    `Category: ${category.replace(/_/g, ' ')}. ` +
    `Professional comic book illustration. No text in image.`;
}

// ============================================
// FORMAT OUTPUT FOR CHAPTER
// ============================================

export function formatComicChapter(
  chapterTitle: string,
  bookTitle: string,
  panels: ComicPanel[],
  generatedImages: Map<number, string>
): string {
  let output = `# ${chapterTitle}\n\n`;
  output += `*A comic story from "${bookTitle}"*\n\n---\n\n`;
  
  for (const panel of panels) {
    output += `## Panel ${panel.panelNumber}\n\n`;
    
    // Add image if available
    const imageUrl = generatedImages.get(panel.panelNumber);
    if (imageUrl) {
      output += `![Panel ${panel.panelNumber}](${imageUrl})\n\n`;
    } else {
      output += `*[Illustration: ${panel.visual.scene.slice(0, 150)}...]*\n\n`;
    }
    
    // Add dialogue bubbles
    for (const line of panel.dialogue) {
      const bubblePrefix = getBubblePrefix(line.bubbleType);
      output += `${bubblePrefix}**${line.character}:** "${line.speech}"\n\n`;
    }
    
    // Add caption/narration
    if (panel.caption) {
      output += `*${panel.caption}*\n\n`;
    }
    
    output += `---\n\n`;
  }
  
  return output;
}

function getBubblePrefix(bubbleType: DialogueLine['bubbleType']): string {
  switch (bubbleType) {
    case 'thought': return '💭 ';
    case 'shout': return '💥 ';
    case 'whisper': return '🔇 ';
    case 'narration': return '📖 ';
    default: return '💬 ';
  }
}
