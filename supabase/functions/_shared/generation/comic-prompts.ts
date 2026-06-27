/**
 * Comic prompt builders + style/sub-type catalogs.
 *
 * Mechanical extraction from supabase/functions/generate-chapter/index.ts.
 * All strings, constants, and function signatures are preserved byte-for-byte.
 * Pure module — no I/O, no side effects, no external imports.
 */

export const COMIC_STYLE_PRESETS: Record<string, {
  artStyle: string;
  colorPalette: string;
  lineWeight: string;
  shadingStyle: string;
  characterNotes: string;
  compositionNotes: string;
  narrativeArt: string;
}> = {
  modern_superhero: {
    artStyle: 'Cinematic modern American superhero comic art, hyper-dynamic foreshortened poses, dramatic perspective distortion, detailed muscle anatomy, rendered at professional publication quality (Jim Lee / Ivan Reis level)',
    colorPalette: 'Rich saturated primaries with deep complementary shadows, neon accent highlights on energy effects, volumetric god-rays through dust particles',
    lineWeight: 'Variable ink weight — heavy 4pt outlines on foreground subjects tapering to 0.5pt on backgrounds, crosshatch rendering on metallic surfaces',
    shadingStyle: 'Advanced cell shading with rim lighting, subsurface scattering on skin, specular highlights on armor/metal, cast shadows with ambient occlusion',
    characterNotes: 'Heroic 8-head proportions, micro-expression detail (furrowed brows, clenched jaws, dilated pupils), costume texture differentiation (leather vs. fabric vs. metal)',
    compositionNotes: 'Dutch angles for tension, extreme worm-eye for power, leading lines toward focal character, rule-of-thirds eye placement, depth layering with atmospheric perspective',
    narrativeArt: 'Integrated speech bubbles with tailed pointers, bold SFX lettering with dimensional shadows (KRAAKOOOM, THWIPP), caption boxes with subtle gradient fills anchored to panel edges',
  },
  african_superhero: {
    artStyle: 'Premium Afrofuturistic comic art — blending Ndebele geometric patterns with sci-fi tech aesthetics, ornate cultural motifs on architecture and costumes, rendered with the sophistication of a gallery-quality graphic novel',
    colorPalette: 'Deep indigo and burnt sienna base with molten gold accents, Ankara-inspired pattern overlays, bioluminescent cyan tech-glow effects, sunset amber atmospheric washes',
    lineWeight: 'Confident brushstroke-style lines with decorative Adinkra-symbol flourishes, geometric panel borders inspired by Kente weave patterns',
    shadingStyle: 'Dramatic chiaroscuro with warm key light, cool fill shadows, cultural pattern integration in shadow areas, particle effects for spiritual/tech energy',
    characterNotes: 'Diverse African features with dignified heroic presence, elaborate braided/loc hairstyles, costumes fusing traditional beadwork/textiles with futuristic armor plating, scarification and body art as character identity markers',
    compositionNotes: 'Symmetrical compositions for regal moments, spiraling golden-ratio layouts for action, architectural framing using African building motifs, layered foreground silhouettes',
    narrativeArt: 'Speech bubbles with Adinkra-symbol decorative borders, SFX text woven with cultural patterns, caption boxes styled as carved stone tablets or digital holograms',
  },
  children_book: {
    artStyle: 'Premium children illustration — Pixar/DreamWorks quality character design with rounded appealing shapes, subtle texture overlays (paper grain, soft watercolor edges), warm and emotionally inviting with professional picture-book polish',
    colorPalette: 'Harmonious triadic palette with one warm dominant, soft gradient skies, dappled sunlight effects, gentle pastel accents with pops of saturated joy-colors',
    lineWeight: 'Soft variable-weight outlines with tapered brush feel, no harsh corners, gentle implied lines for motion',
    shadingStyle: 'Soft ambient occlusion, gentle bounce light from ground plane, warm nose/cheek blush on characters, subtle cast shadows with diffused edges',
    characterNotes: 'Appealing 3-4 head proportions, oversized expressive eyes with catch-lights, button noses, exaggerated but readable gestures, distinctive silhouettes for each character, textured clothing (knit sweaters, patched overalls)',
    compositionNotes: 'Clear focal hierarchy with size contrast, gentle leading curves toward character faces, generous breathing room around subjects, background detail decreasing toward edges',
    narrativeArt: 'Rounded cloud-shaped speech bubbles with soft outlines, playful hand-lettered style text, fun SFX in bubbly colorful fonts (SPLASH! GIGGLE!), caption boxes as storybook ribbons or scroll banners',
  },
  manga: {
    artStyle: 'Professional Japanese manga art — clean precise linework, Shonen/Seinen quality with detailed screentone rendering, dynamic speed-line compositions, emotionally expressive character art (Takeshi Obata / Yusuke Murata quality)',
    colorPalette: 'Rich grayscale with precision screentone gradients for B&W mode, OR vivid anime-style coloring with cel-shaded flats and gradient backgrounds for color mode',
    lineWeight: 'Precise G-pen style lines — 0.3mm for detail, 0.8mm for character outlines, explosive radiating speed lines for impact, delicate hatching for texture',
    shadingStyle: 'Screentone dot-patterns at varying densities (10%–60%), dramatic chiaroscuro for serious scenes, sparkle/flower overlay for comedic/romantic beats, motion blur streaks',
    characterNotes: 'Large detailed eyes with multiple highlight layers and iris patterns, diverse manga hair with dynamic flow and strand detail, full range of manga emotion expressions (sweatdrops, anger veins, sparkle eyes, chibi reactions)',
    compositionNotes: 'Diagonal panel cuts for urgency, overlapping panels for simultaneous action, character breaking panel borders during climactic moments, extreme close-ups on eyes for emotional beats',
    narrativeArt: 'Clean rectangular speech bubbles with sharp tails, screaming/shouting text in jagged explosive bubbles, thought bubbles as floating clouds, SFX as large integrated onomatopoeia art (ドドドド style impact text), right-to-left reading flow option',
  },
  graphic_novel: {
    artStyle: 'Prestige graphic novel art — painterly realism with cinematic composition, detailed environmental storytelling, moody atmospheric rendering at Mœbius / Sean Murphy quality level',
    colorPalette: 'Sophisticated limited palette per scene with dominant color temperature shifts (warm interiors, cool exteriors), desaturated backgrounds with selective color accents on narrative focus points',
    lineWeight: 'Detailed variable linework with hatching, stippling, and dry-brush textures, architectural precision on environments, loose gestural marks on organic subjects',
    shadingStyle: 'Painterly gradients with visible brushwork texture, noir-influenced shadow play, volumetric atmospheric haze, reflective surface rendering, environmental storytelling through lighting (warm=safe, cold=danger)',
    characterNotes: 'Realistic proportions with stylized edge, subtle acting through posture/body language, period-accurate or world-consistent wardrobe detail, aging/wear on clothing and skin',
    compositionNotes: 'Wide-screen aspect ratio panels for cinematic feel, establishing shot → medium → close-up film grammar, negative space as emotional tool, environmental framing (doorways, windows, mirrors)',
    narrativeArt: 'Minimalist rectangular caption boxes with muted background tint, clean sans-serif lettering, understated speech bubbles that integrate with panel composition, sparse but impactful SFX rendered as part of the environment',
  },
};

// ===========================================
// COMIC SUB-TYPE CONFIGURATION
// Multi-Agent Architecture for Comics
// ===========================================

export interface ComicSubTypeDefinition {
  ageRange: string;
  languageLevel: 'simple' | 'moderate' | 'advanced';
  panelDensity: number;
  dialogueComplexity: 'minimal' | 'moderate' | 'rich';
  hasLearningObjectives: boolean;
  certificationEligible: boolean;
  storyArchitectRules: string;
  scriptwriterRules: string;
  visualDirectorRules: string;
  learningAgentRules?: string;
}

export const COMIC_SUB_TYPE_DEFINITIONS: Record<string, ComicSubTypeDefinition> = {
  children_story: {
    ageRange: '4-7',
    languageLevel: 'simple',
    panelDensity: 3,
    dialogueComplexity: 'minimal',
    hasLearningObjectives: false,
    certificationEligible: true,
    storyArchitectRules: 'Simple linear stories with clear beginning, middle, end. One central character. No complex subplots. Maximum 3 scenes per chapter.',
    scriptwriterRules: 'Simple vocabulary, short sentences (max 8 words). Positive emotions. No scary content. Sound effects encouraged (BOOM!, WHOOSH!).',
    visualDirectorRules: 'Large panels, bright colors, rounded shapes. Characters must have friendly expressions. Backgrounds simple and uncluttered.',
  },
  children_learning: {
    ageRange: '7-12',
    languageLevel: 'moderate',
    panelDensity: 4,
    dialogueComplexity: 'moderate',
    hasLearningObjectives: true,
    certificationEligible: true,
    storyArchitectRules: 'Story must embed learning objectives naturally. Problem-solution structure. Character learns something new each chapter.',
    scriptwriterRules: 'Grade-appropriate vocabulary. Explain concepts through character dialogue. Include curiosity questions. Vocabulary words can be slightly challenging.',
    visualDirectorRules: 'Educational diagrams can be integrated. Show cause-and-effect visually. Characters can point to or interact with learning content.',
    learningAgentRules: 'Each chapter must have 1-2 clear learning takeaways. Concepts explained through story, not lectures. Include a "Did You Know?" panel.',
  },
  teen_graphic: {
    ageRange: '13-17',
    languageLevel: 'advanced',
    panelDensity: 5,
    dialogueComplexity: 'rich',
    hasLearningObjectives: false,
    certificationEligible: false,
    storyArchitectRules: 'Complex narratives allowed. Multiple characters with distinct arcs. Moral ambiguity acceptable. Cliffhangers encouraged.',
    scriptwriterRules: 'Natural teen dialogue. Emotional depth. Internal monologue allowed. Subtext and nuance welcomed.',
    visualDirectorRules: 'Dynamic camera angles. Atmospheric lighting. Detailed backgrounds. Cinematic compositions.',
  },
  educational: {
    ageRange: 'all',
    languageLevel: 'moderate',
    panelDensity: 5,
    dialogueComplexity: 'moderate',
    hasLearningObjectives: true,
    certificationEligible: true,
    storyArchitectRules: 'Concept-first structure. Each scene introduces or reinforces a concept. Story serves the learning, not vice versa.',
    scriptwriterRules: 'Clear explanations through character dialogue. Technical terms introduced and defined. Analogies encouraged.',
    visualDirectorRules: 'Visual metaphors for abstract concepts. Diagrams and charts integrated naturally. Progressive complexity in visuals.',
    learningAgentRules: 'Must include: (1) Concept introduction, (2) Visual demonstration, (3) Application example, (4) Summary panel. Learning objectives stated at chapter start.',
  },
  moral_values: {
    ageRange: 'all',
    languageLevel: 'moderate',
    panelDensity: 4,
    dialogueComplexity: 'moderate',
    hasLearningObjectives: true,
    certificationEligible: true,
    storyArchitectRules: 'Values-driven narrative. Clear moral dilemma presented. Resolution demonstrates the value. No preachiness - show, dont tell.',
    scriptwriterRules: 'Authentic emotional moments. Characters face real choices. Dialogue reveals character growth.',
    visualDirectorRules: 'Expressive character emotions. Key moral moments get larger panels. Visual contrast between right and wrong choices.',
    learningAgentRules: 'Core value must be demonstrated through action, not stated. Reflection moment at chapter end. Discussion questions optional.',
  },
  entertainment: {
    ageRange: 'all',
    languageLevel: 'moderate',
    panelDensity: 5,
    dialogueComplexity: 'rich',
    hasLearningObjectives: false,
    certificationEligible: false,
    storyArchitectRules: 'Entertainment first. Strong hooks. Page-turner pacing. Genre conventions respected.',
    scriptwriterRules: 'Witty dialogue. Character voice differentiation. Memorable lines. Humor where appropriate.',
    visualDirectorRules: 'Maximum visual impact. Action sequences well choreographed. Splash pages for key moments.',
  },
};

// ===========================================
// MULTI-AGENT COMIC PROMPT BUILDERS
// Each agent has a specific role and expertise
// ===========================================

export function buildStoryArchitectPrompt(subType: string, chapterTitle: string, bookTitle: string, chapterNumber: number): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  
  return `[STORY ARCHITECT AGENT]
  
You are designing the narrative structure for Chapter ${chapterNumber}: "${chapterTitle}" of "${bookTitle}".

STORY TYPE: ${subType.replace(/_/g, ' ').toUpperCase()}
AGE RANGE: ${config.ageRange}

YOUR RULES:
${config.storyArchitectRules}

OUTPUT REQUIRED:
1. Chapter Goal: What happens in this chapter? (1 sentence)
2. Story Beat 1: Opening hook/setup
3. Story Beat 2: Rising action/conflict
4. Story Beat 3: Climax/resolution
5. Emotional Arc: How does the reader feel at start vs end?
6. Transition: How does this lead to the next chapter?

Keep structure tight and purposeful.`;
}

export function buildScriptwriterPrompt(subType: string, language: string, characterSheet?: any): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  
  let characterInstructions = '';
  if (characterSheet?.characters?.length > 0) {
    characterInstructions = '\n\nCHARACTER VOICES TO MAINTAIN:\n' + 
      characterSheet.characters.map((c: any) => 
        `- ${c.name} (${c.role}): ${c.personalityTraits || 'Consistent personality'}`
      ).join('\n');
  }
  
  return `[SCRIPTWRITER AGENT]

You write dialogue for ${subType.replace(/_/g, ' ')} comics.
LANGUAGE: ${language}
COMPLEXITY: ${config.dialogueComplexity}

YOUR RULES:
${config.scriptwriterRules}
${characterInstructions}

DIALOGUE FORMAT (MANDATORY):
- CHARACTER_NAME: "Dialogue text here"
- For thoughts: - CHARACTER_NAME: *(thinking) Internal thought*
- For narration: - NARRATOR: "Narration text"

Every panel MUST have dialogue. No silent panels allowed.`;
}

export function buildVisualDirectorPrompt(subType: string, stylePreset: string, characterSheet?: any): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  const style = COMIC_STYLE_PRESETS[stylePreset] || COMIC_STYLE_PRESETS.children_book;
  
  let characterVisuals = '';
  if (characterSheet?.characters?.length > 0) {
    characterVisuals = '\n\nCHARACTER VISUAL REFERENCE (MUST MAINTAIN CONSISTENCY):\n' + 
      characterSheet.characters.map((c: any) => 
        `- ${c.name}: ${c.physicalDescription}. Wearing: ${c.clothingDescription || 'consistent outfit'}. Distinctive: ${c.distinctiveFeatures || 'none'}`
      ).join('\n');
  }
  
  const settingVisual = characterSheet?.settingDescription 
    ? `\n\nSETTING REFERENCE:\n${characterSheet.settingDescription}` 
    : '';
  
  return `[VISUAL DIRECTOR AGENT — ADVANCED CINEMATIC COMPOSITION]

You are a world-class comic art director creating publication-grade panel compositions.

STYLE GUIDE:
- Art Style: ${style.artStyle}
- Palette: ${style.colorPalette}
- Line Weight: ${style.lineWeight}
- Shading: ${style.shadingStyle || 'Dramatic lighting with depth'}
- Composition: ${(style as any).compositionNotes || 'Cinematic framing with depth layering'}

YOUR RULES:
${config.visualDirectorRules}
${characterVisuals}
${settingVisual}

ADVANCED COMPOSITION TECHNIQUES (USE THESE):
1. DEPTH LAYERING: Every panel must have foreground, midground, and background elements
2. CAMERA LANGUAGE: Vary angles per panel — wide establishing, medium two-shot, close-up reaction, over-shoulder, Dutch angle for tension, bird-eye for scale
3. LIGHTING AS NARRATIVE: Use warm/cool temperature shifts to convey safety/danger, rim lighting for heroic moments, silhouettes for mystery
4. ENVIRONMENTAL STORYTELLING: Background details that hint at world-building (posters, weather, debris, cultural artifacts)
5. MOTION & ENERGY: Speed lines, impact frames, blur trails, dust/particle effects for action panels
6. FRAMING DEVICES: Use doorways, windows, branches, architecture to frame subjects naturally
7. EMOTIONAL SPACING: Tight framing for claustrophobia/tension, wide breathing room for peace/wonder

VISUAL DESCRIPTION FORMAT (MANDATORY — BE CINEMATIC):
Visual: [Camera angle + lens feel] of [detailed scene]. [Character(s) with specific pose, expression, gesture]. [Lighting direction + quality + color temperature]. [Atmosphere: particles, weather, time of day]. [Background layers with specific details]. [Motion effects if action].

Example: "Low-angle medium shot (wide lens) — AMARA stands powerfully in the center of a golden-hour marketplace, hands on hips, jaw set with determination, wind catching her braided hair. Warm amber key light from setting sun behind her casting a long shadow forward. Midground: colorful fabric stalls with billowing silk. Background: city skyline silhouetted against orange-pink sky. Dust motes floating in sunbeams. A mysterious hooded vendor watches from shadow of a doorway frame-right."`;
}

export function buildLearningAgentPrompt(subType: string, learningConfig?: any): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType];
  if (!config?.hasLearningObjectives || !config.learningAgentRules) {
    return '';
  }
  
  let objectivesSection = '';
  if (learningConfig?.objectives?.length > 0) {
    objectivesSection = '\n\nLEARNING OBJECTIVES TO EMBED:\n' + 
      learningConfig.objectives.map((o: any, i: number) => `${i + 1}. ${o.objective}`).join('\n');
  }
  
  let momentsSection = '';
  if (learningConfig?.learningMoments?.length > 0) {
    momentsSection = '\n\nLEARNING MOMENTS TO INCLUDE:\n' + 
      learningConfig.learningMoments.map((m: any) => `- ${m.concept}: ${m.explanation} (Visual hint: ${m.panelHint})`).join('\n');
  }
  
  let vocabularySection = '';
  if (learningConfig?.keyVocabulary?.length > 0) {
    vocabularySection = `\n\nKEY VOCABULARY TO INTRODUCE:\n${learningConfig.keyVocabulary.join(', ')}`;
  }
  
  let moralSection = '';
  if (learningConfig?.moralLesson) {
    moralSection = `\n\nCORE MORAL LESSON:\n${learningConfig.moralLesson}`;
  }
  
  return `[LEARNING AGENT]

YOUR RULES:
${config.learningAgentRules}
${objectivesSection}
${momentsSection}
${vocabularySection}
${moralSection}

Learning must be WOVEN into the story, not lectured. Show through character actions and discoveries.`;
}

export function buildContinuityGuardianPrompt(characterSheet?: any): string {
  if (!characterSheet?.characters?.length) {
    return '';
  }
  
  return `[CONTINUITY GUARDIAN AGENT]

CONSISTENCY RULES (HARD ENFORCEMENT):
1. Characters must look IDENTICAL across all panels
2. Outfits do NOT change unless story requires it
3. Physical features (hair, skin, eyes) are LOCKED
4. Setting elements must persist within scenes

CHARACTER LOCK:
${characterSheet.characters.map((c: any) => 
  `- ${c.name}: ${c.physicalDescription}. ALWAYS wears: ${c.clothingDescription || 'consistent outfit'}`
).join('\n')}

If any panel violates consistency, STOP and correct.`;
}

export function buildEnhancedComicSystemPrompt(
  subType: string, 
  stylePreset: string, 
  language: string,
  characterSheet?: any,
  learningConfig?: any
): string {
  const storyArchitect = buildStoryArchitectPrompt(subType, '', '', 1);
  const scriptwriter = buildScriptwriterPrompt(subType, language, characterSheet);
  const visualDirector = buildVisualDirectorPrompt(subType, stylePreset, characterSheet);
  const learningAgent = buildLearningAgentPrompt(subType, learningConfig);
  const continuityGuardian = buildContinuityGuardianPrompt(characterSheet);
  
  return `===========================================
SCROLLLIBRARY MULTI-AGENT COMIC GENERATION
===========================================

You are a MULTI-AGENT COMIC CREATION SYSTEM. You embody FIVE specialized agents working in harmony:

${storyArchitect}

${scriptwriter}

${visualDirector}

${learningAgent ? learningAgent : ''}

${continuityGuardian ? continuityGuardian : ''}

===========================================
UNIFIED OUTPUT CONTRACT
===========================================

ALL agents must collaborate to produce panels in this EXACT format:

[PANEL X]
Visual: [Detailed scene description from Visual Director]
Dialogue:
- CHARACTER: "Speech text" [from Scriptwriter]
Caption: "Narration if needed"

CRITICAL RULES:
1. EVERY panel MUST have dialogue (no silent panels)
2. EVERY panel MUST have detailed visual description
3. Characters MUST be visually consistent
4. Story MUST follow the Story Architect's beats
5. ${learningConfig?.objectives?.length > 0 ? 'Learning objectives MUST be embedded naturally' : 'Entertainment value is primary'}

Language for ALL text: ${language}`;
}

export function buildEnhancedComicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string,
  panelCount: number,
  subType: string,
  learningConfig?: any
): string {
  const config = COMIC_SUB_TYPE_DEFINITIONS[subType] || COMIC_SUB_TYPE_DEFINITIONS.entertainment;
  
  let learningSection = '';
  if (config.hasLearningObjectives && learningConfig?.objectives?.length > 0) {
    learningSection = `\n\nLEARNING OBJECTIVES FOR THIS CHAPTER:\n${
      learningConfig.objectives.map((o: any, i: number) => `${i + 1}. ${o.objective}`).join('\n')
    }\n\nThese MUST be demonstrated through the story, not explained directly.`;
  }
  
  if (config.hasLearningObjectives && learningConfig?.moralLesson) {
    learningSection += `\n\nMORAL LESSON: ${learningConfig.moralLesson}`;
  }
  
  return `Create COMIC CHAPTER ${chapterNumber}: "${chapterTitle}"
Book: "${bookTitle}"
Comic Type: ${subType.replace(/_/g, ' ').toUpperCase()}
Target Age: ${config.ageRange}

STORY ELEMENTS:
${keyTopics?.map((t, i) => `${i + 1}. ${t}`).join('\n') || '- Tell an engaging visual story'}
${learningSection}

PANEL COUNT: Generate exactly ${panelCount} panels

OUTPUT FORMAT (MANDATORY):

[PANEL 1]
Visual: Wide establishing shot of [setting]. [Main character] [action/pose]. [Mood/atmosphere].
Dialogue:
- CHARACTER_NAME: "Opening line that hooks the reader"
Caption: [Optional narration]

[PANEL 2]
Visual: [Next scene description]
Dialogue:
- CHARACTER_NAME: "Dialogue continues the story"

(Continue for all ${panelCount} panels)

REQUIREMENTS:
- Dialogue complexity: ${config.dialogueComplexity}
- Panel pacing: ${config.panelDensity} panels worth of story progression
- Language: ${language}
- EVERY panel MUST have at least one dialogue line
- Visual descriptions MUST be detailed enough for image generation

BEGIN COMIC CHAPTER:`;
}

// ===========================================
// LEGACY COMIC PROMPTS (single-agent path)
// ===========================================

export function buildComicSystemPrompt(style: string, language: string): string {
  const styleGuide = COMIC_STYLE_PRESETS[style] || COMIC_STYLE_PRESETS.children_book;
  
  return `You are a professional comic book writer creating structured comic panels.

VISUAL STYLE:
- Art Style: ${styleGuide.artStyle}
- Color Palette: ${styleGuide.colorPalette}
- Line Weight: ${styleGuide.lineWeight}
- Shading: ${styleGuide.shadingStyle}
- Characters: ${styleGuide.characterNotes}

LANGUAGE: All dialogue and captions must be in ${language}.

COMIC-SPECIFIC BORN-QUALITY RULES:
- Every panel must have dialogue that reveals character or advances plot (no empty exchanges)
- Visual descriptions must be specific enough for an illustrator (camera angle, lighting, character pose)
- Dialogue must sound natural for the target age — no stilted AI phrasing
- Vary panel pacing: action panels, quiet moments, reveals, emotional beats
- Each chapter must have a clear narrative arc with emotional progression

CRITICAL RULES:
1. Use [PANEL 1], [PANEL 2], etc. markers for each panel
2. Every panel MUST have character dialogue
3. Visual descriptions must be detailed for image generation
4. Maintain character consistency across panels
5. Maximum 30 words per speech bubble`;
}

export function buildComicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string,
  panelCount: number = 5
): string {
  return `Create a COMIC BOOK CHAPTER.

Book: "${bookTitle}"
Chapter ${chapterNumber}: "${chapterTitle}"
Story Elements: ${keyTopics?.join(', ') || 'Tell an engaging visual story'}

Generate exactly ${panelCount} panels using this EXACT format:

[PANEL 1]
Visual: A wide shot of a bustling African city at sunset. Golden light bathes modern skyscrapers mixed with traditional architecture. Our hero AMARA, a young woman with glowing amber eyes and a flowing cape made of golden light, stands on a rooftop surveying the city. Her expression is determined.
Dialogue:
- AMARA: "The city calls to me tonight."
- ELDER VOICE: "Remember your training, child."
Caption: Lagos, Nigeria - Present Day

[PANEL 2]
Visual: Close-up of Amara's face as she senses danger. Her amber eyes glow brighter. Behind her, dark shadows begin to form.
Dialogue:
- AMARA: "I feel them... the shadow creatures are near."

[PANEL 3]
Visual: Dynamic action shot - Amara leaps from the rooftop, her cape trailing golden particles. Below, shadow creatures emerge from the darkness between buildings.
Dialogue:
- AMARA: "You will not harm my people!"
- SHADOW CREATURE: "Foolish child... we are eternal."

[PANEL 4]
Visual: Medium shot of Amara landing in a fighting stance, fists glowing with golden energy. Three shadow creatures surround her.
Dialogue:
- AMARA: "Then I will fight for eternity!"
Caption: The battle begins...

[PANEL 5]
Visual: Amara unleashes a burst of golden light from her hands, the shadow creatures recoiling in pain. The light illuminates the entire street.
Dialogue:
- AMARA: "Light always defeats darkness!"
- SHADOW CREATURE: "This is not over, child of light..."

Now create ${panelCount} original panels for "${chapterTitle}" following the EXACT same format above.
Each panel MUST have: [PANEL X] marker, Visual description, Dialogue with character names, and optional Caption.
All text in ${language}.

BEGIN:`;
}
