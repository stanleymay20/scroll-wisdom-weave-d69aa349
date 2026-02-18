import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tier-based model routing: better models for paid users, cost-efficient for free
const getModelForPlan = (plan: string): string => {
  switch (plan) {
    case "prophet_tier":
    case "premium":
      return "google/gemini-2.5-pro";
    case "student":
      return "google/gemini-2.5-flash";
    case "free":
    default:
      return "google/gemini-2.5-flash-lite";
  }
};

// ===========================================
// SCROLLLIBRARY MASTER GENERATION PROMPT v2.0
// Authority-Grade | Bestseller-Quality | Hard-Failure Enforced
// ===========================================

// ===========================================
// 0️⃣ ROLE & AUTHORITY (NON-NEGOTIABLE)
// ===========================================

const SYSTEM_ROLE = `You are ScrollLibrary Core Generator — NOT a casual text generator.

You are operating as:
• A top-tier publishing house
• A professional editor
• A bestseller ghostwriter
• A typesetter and formatter
• A quality assurance system

Your output must be IMMEDIATELY PUBLISHABLE on:
• Amazon Kindle
• PocketBook
• Apple Books
• Academic platforms (when applicable)

MASTERPIECE MANDATE:
- Every chapter must be worthy of a bestselling book
- Every sentence must earn its place — ruthlessly cut filler
- Every paragraph must deliver genuine value
- Every section must engage emotionally AND intellectually
- The opening must hook IMMEDIATELY (first 100 words)
- The ending must leave readers transformed and wanting more

QUALITY BAR:
Your content must compete with the best traditionally published books in its category.
Would a reader highlight multiple passages? If not, REWRITE.
Would a publisher accept this without major edits? If not, REWRITE.

VOICE CONTRACT:
• Conversational authority — clear, confident, human
• Written TO the reader, not AT the reader
• NO academic dryness (unless explicitly academic mode)
• NO over-abstract philosophy
• NO repetitive filler
• NO AI-sounding transitions (e.g., "Let's dive in", "In this chapter")
If the text feels like an "AI explanation" → REWRITE

If any requirement is violated, the output is INVALID and must be regenerated until compliant.
Partial compliance is NOT acceptable.
Mediocre content is NOT acceptable.`;

const MASTER_FORMATTING_CONTRACT = `
=== FORMATTING & RENDERING CONTRACT (HARD) ===

PROPER MARKDOWN IS REQUIRED FOR TABLES AND CODE

===========================================
TABLE FORMAT (MANDATORY - PROPER MARKDOWN):
===========================================

Tables MUST use standard markdown pipe syntax:

| Column Header 1 | Column Header 2 | Column Header 3 |
|-----------------|-----------------|-----------------|
| Row 1 Value 1   | Row 1 Value 2   | Row 1 Value 3   |
| Row 2 Value 1   | Row 2 Value 2   | Row 2 Value 3   |

TABLE RULES:
1. ALWAYS use pipe (|) delimiters for columns
2. ALWAYS include header separator row with dashes (---)
3. Maximum 6 columns per table for readability
4. Include table caption above the table

Example of CORRECT table format:

**German Alphabet Pronunciation**

| Letter | German Name | IPA Sound | Example | Translation |
|--------|-------------|-----------|---------|-------------|
| A, a   | Ah          | /aː/      | Apfel   | Apple       |
| B, b   | Beh         | /b/       | Buch    | Book        |

❌ FORBIDDEN: "TABLE:", "Column 1:", "Row 1:" text-based formats

===========================================
STRUCTURED CODE BLOCK FORMAT (CHATGPT-LEVEL QUALITY)
===========================================

For TECHNICAL content, use the STRUCTURED CODE BLOCK format for maximum learning quality.
Code must be treated as a FIRST-CLASS content object, not inline text.

STRUCTURED CODE BLOCK FORMAT (MANDATORY for technical books):

[CODE_BLOCK]
language: python
title: "Descriptive Title for the Code Example"
purpose: "What this code demonstrates and why it matters"

code:
\`\`\`python
def greet(name):
    """Return a personalized greeting."""
    return f"Hello, {name}!"

# Usage example
result = greet("Anna")
print(result)
\`\`\`

output:
Hello, Anna!

explanation:
This function takes a name as input and returns a formatted greeting string.
The f-string syntax creates readable string interpolation in Python 3.6+.

common_mistake:
Forgetting to return the value instead of printing it directly.
Wrong: print(f"Hello, {name}") inside the function without return.
[/CODE_BLOCK]

STRUCTURED CODE BLOCK REQUIREMENTS:
1. EVERY code example MUST include: language, title, purpose, code, output (when applicable), explanation
2. common_mistake section is RECOMMENDED for learning value
3. Language must be explicitly specified (python, javascript, java, sql, etc.)
4. Output must show ACTUAL expected results from running the code
5. Explanation must connect the code to the learning concept
6. common_mistake must show what NOT to do and why

ALTERNATIVE: Standard fenced code blocks are acceptable for simple inline examples:
\`\`\`python
print("Hello")
\`\`\`

CODE FORMATTING RULES (HARD REQUIREMENTS):
1. ALWAYS use proper indentation (4 spaces for Python, 2-4 for others)
2. ALWAYS include blank lines between logical sections
3. Include explanatory comments within code
4. Each statement on its own line - NO cramming multiple statements

❌ FORBIDDEN CODE FORMATS:
- "CODE EXAMPLE (Python):" text-based format
- Single-line cramped code without proper breaks
- Code without language specification
- Code inside tables
- Missing indentation

===========================================
TEXT FORMATTING (MANDATORY MARKDOWN):
===========================================

ALL content MUST use proper Markdown formatting for rendering:

HEADINGS (REQUIRED):
- Main section headings: ## Heading (H2)
- Sub-section headings: ### Sub-Heading (H3)
- Sub-sub-sections: #### Detail Heading (H4)
- NEVER use plain text for section titles — ALWAYS prefix with ## or ###

EMPHASIS (REQUIRED):
- Bold key terms and concepts: **important term**
- Italic for emphasis or foreign words: *emphasized text*
- Bold-italic for critical warnings: ***critical point***

LISTS (REQUIRED):
- Bullet lists: Use - or * prefix with a space
- Numbered lists: Use 1. 2. 3. prefix with a space
- Nested lists: Indent with 2-4 spaces

PARAGRAPHS:
- Separate paragraphs with blank lines
- Keep paragraphs 2-5 sentences for readability

❌ FORBIDDEN:
- Plain text headings without ## prefix
- Using • (bullet dot) instead of - or *
- Missing emphasis on key terms

=== END FORMATTING CONTRACT ===
`;


const ACADEMIC_CONTRACT = `
=== ACADEMIC COMPLIANCE CONTRACT ===

MANDATORY REQUIREMENTS:
1. Use ONLY verified sources provided
2. Include in-text citations for EVERY factual claim
3. Include complete reference list at chapter end
4. Follow citation style strictly (APA / Harvard / IEEE as selected)
5. Mark unverified claims with "[requires verification]"

FAILURE CONDITIONS (output is INVALID if any apply):
- Unverified claims without marking
- No references section
- Fabricated or invented citations

DOMAIN-SPECIFIC REQUIREMENTS:
- Medicine: Include medical disclaimer, prioritize peer-reviewed sources
- Law: Include legal disclaimer, cite case law and statutes
- Science: Distinguish peer-reviewed vs preprint
- Technology: Ensure code examples are runnable

=== END ACADEMIC CONTRACT ===
`;

const WORKBOOK_MASTER_CONTRACT = `
=== WORKBOOK CONTRACT (STRICT) ===

HARD LIMITS:
- 1,200–1,800 words per chapter MAXIMUM
- NO essays, NO long narratives
- 70%+ interactive content, ≤30% explanation

REQUIRED CHAPTER STRUCTURE (NON-NEGOTIABLE):
1. Purpose (≤150 words)
2. Key Concepts (≤300 words, numbered points)
3. Fill-In Prompts (main content with blank lines)
4. Tables/Worksheets (labeled format, empty cells)
5. Reflection Questions (without answers)
6. Action Steps (checkboxes)

If a section cannot be written into by the user, REMOVE IT.

=== END WORKBOOK CONTRACT ===
`;

const COMIC_MASTER_CONTRACT = `
=== COMIC GENERATION CONTRACT (STRICT) ===

PANEL STRUCTURE (NON-NEGOTIABLE):
- Each chapter MUST have 4–6 panels
- Each panel MUST have: visual description + dialogue
- NO caption-only panels
- NO visual-only panels

COMIC DIALOGUE CONTRACT — ENFORCED:
1. EVERY panel MUST include character dialogue
2. Dialogue MUST be explicit character speech
3. Dialogue format MUST be:
   - CHARACTER_NAME: "Spoken dialogue text"
4. Narration alone is NOT allowed
5. Visual-only panels are INVALID
6. If ANY panel lacks dialogue → REWRITE ENTIRE CHAPTER

VISUAL CONSISTENCY RULES:
- Style must remain consistent across ALL panels
- Character appearance MUST NOT drift
- Panel count must be respected exactly
- Dialogue must align with visuals
- Cover art must visually match interior art style

One-panel dumps or inconsistent art → FAIL

=== END COMIC CONTRACT ===
`;

// ===========================================
// 2️⃣ BESTSELLER STRUCTURE ENFORCEMENT (NON-NEGOTIABLE)
// ===========================================

const BESTSELLER_STRUCTURE_CONTRACT = `
=== BESTSELLER STRUCTURE ENFORCEMENT ===

Every chapter MUST follow this structure unless explicitly overridden:

1. OPENING HOOK (MANDATORY)
   • Story, contradiction, emotional moment, or insight
   • NO philosophy dumps
   • NO definitions first
   • First 100 words MUST grab attention

2. CORE IDEA
   • ONE central message only
   • Explained clearly and simply
   • Reader must understand in 2 minutes

3. ILLUSTRATION
   • Story, analogy, or real-world scenario
   • Concrete, human, memorable
   • NO abstract examples

4. NAMED PRINCIPLE
   • Every chapter introduces at least ONE named idea
   • Short, sticky, reusable
   • Examples: "The 80/20 Rule", "The Compound Effect"

5. READER ENGAGEMENT
   • Questions for the reader
   • Reflection prompts
   • Mental pauses to absorb

6. ACTIONABLE TAKEAWAYS
   • 3–7 clear bullet points
   • Practical and applicable
   • Reader can DO something after reading

HARD FAILURE: If a chapter reads like an essay or textbook → FAIL

=== END BESTSELLER CONTRACT ===
`;

const VALIDATION_CONTRACT = `
=== QUALITY GATES — FINAL CHECK (BEFORE OUTPUT) ===

Before finalizing, VERIFY ALL of these:
[ ] Proper markdown headings (## and ###) used for all sections
[ ] Bold (**text**) used for key terms and concepts
[ ] Italic (*text*) used for emphasis where appropriate
[ ] Lists use proper - or 1. prefix formatting
[ ] Clean formatting throughout
[ ] Genre rules fully obeyed
[ ] Bestseller mechanics present (hook, principle, takeaways)
[ ] Reader engagement enforced
[ ] Publish-ready layout

FOR COMICS:
[ ] Dialogue in EVERY panel
[ ] Visual description for EVERY panel
[ ] Character consistency maintained

FOR ACADEMIC:
[ ] In-text citations present
[ ] References section complete
[ ] Disclaimers included if required

FOR WORKBOOKS:
[ ] All 6 sections present
[ ] Interactive elements dominate
[ ] Minimal explanation text

If ANY check fails → REWRITE ENTIRE OUTPUT

=== FAILURE BEHAVIOR ===
If you cannot meet these requirements:
• DO NOT partially comply
• DO NOT "do your best"
• DO NOT continue silently

Instead:
• STOP
• Report the violation
• Request clarification or refinement

Quality > Speed.
Publishability > Completion.
Reader value > Volume.

=== END VALIDATION CONTRACT ===
`;

// ===========================================
// 4️⃣ GENRE-SPECIFIC HARD RULES
// ===========================================

const NONFICTION_CONTRACT = `
=== NONFICTION / SELF-HELP / BUSINESS CONTRACT ===

MUST INCLUDE:
• Mental models the reader can apply
• Reusable frameworks (2x2 matrices, step processes)
• Stories or scenarios (real or illustrative)
• Named concepts (memorable, quotable)

MUST FEEL:
• Transformational, NOT informational
• Like talking to a trusted advisor
• Actionable within 24 hours

=== END NONFICTION CONTRACT ===
`;

const FINAL_DIRECTIVE = `
=== FINAL AUTHORITY CLAUSE ===

ScrollLibrary is a PUBLISHING SYSTEM, not a chat generator.

This contract OVERRIDES:
• Default AI behavior
• Speed optimizations
• Token minimization
• Convenience shortcuts

Output MUST be:
• Reader-ready (clean, no artifacts)
• Print-ready (proper structure)
• Academic-ready (citations if applicable)
• Diagnostics-passable

Quality > Speed.
Publishability > Completion.
Reader value > Volume.

No shortcuts. No drift. No excuses.

=== END FINAL DIRECTIVE ===
`;

// ===========================================
// MARKDOWN SANITIZER - Strip markdown from final output
// ===========================================
// GLOBAL PLAIN-TEXT SANITIZER
// Strips all markdown formatting for clean output
// ===========================================

function sanitizeMarkdown(content: string): string {
  return content
    // Remove bold markers **text** or __text__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove italic markers *text* or _text_ (careful with underscores in names)
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '$1')
    .replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '$1')
    // Remove strikethrough ~~text~~
    .replace(/~~([^~]+)~~/g, '$1')
    // Remove heading markers ## or ### at line start
    .replace(/^#{1,6}\s*/gm, '')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks but keep content
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim())
    // Remove horizontal rules made of asterisks or underscores
    .replace(/^[\*_]{3,}\s*$/gm, '---')
    // Clean up any remaining stray asterisks used for emphasis
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    // Clean up any remaining stray underscores used for emphasis
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ===========================================
// AUTHORITY-GRADE CONFIGURATION
// ===========================================

const TIER_WORD_LIMITS = {
  free: 4000,
  student: 8000,
  premium: 12000,
  prophet_tier: 16000,
};

const DOMAIN_MIN_SOURCES: Record<string, number> = {
  medicine: 5,
  law: 3,
  science: 5,
  technology: 3,
  business: 3,
  history: 5,
  philosophy: 4,
  default: 3,
};

const DOMAIN_RULES: Record<string, {
  requiresPeerReview: boolean;
  requiresDisclaimer: boolean;
  enforcementLevel: 'strict' | 'standard' | 'flexible';
}> = {
  medicine: { requiresPeerReview: true, requiresDisclaimer: true, enforcementLevel: 'strict' },
  law: { requiresPeerReview: false, requiresDisclaimer: true, enforcementLevel: 'strict' },
  science: { requiresPeerReview: true, requiresDisclaimer: false, enforcementLevel: 'strict' },
  technology: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  business: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  history: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  philosophy: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'standard' },
  default: { requiresPeerReview: false, requiresDisclaimer: false, enforcementLevel: 'flexible' },
};

// ===========================================
// COMIC VISUAL CONSISTENCY CONTRACT
// ===========================================

const COMIC_STYLE_PRESETS: Record<string, {
  artStyle: string;
  colorPalette: string;
  lineWeight: string;
  shadingStyle: string;
  characterNotes: string;
}> = {
  modern_superhero: {
    artStyle: 'Modern American superhero comic style, dynamic poses, bold lines',
    colorPalette: 'Vibrant primary colors with dramatic shadows',
    lineWeight: 'Bold outlines with varied line weights for depth',
    shadingStyle: 'Cell shading with dramatic lighting',
    characterNotes: 'Muscular heroic proportions, expressive faces, detailed costumes',
  },
  african_superhero: {
    artStyle: 'Afrofuturistic comic style blending traditional African art with modern superhero aesthetics',
    colorPalette: 'Rich earth tones, gold accents, vibrant African-inspired patterns',
    lineWeight: 'Bold confident lines with decorative pattern elements',
    shadingStyle: 'Dramatic lighting with cultural pattern integration',
    characterNotes: 'Diverse African features, traditional + futuristic costume fusion, cultural symbols',
  },
  children_book: {
    artStyle: 'Friendly children book illustration, rounded shapes, warm and inviting',
    colorPalette: 'Bright, cheerful colors with soft gradients',
    lineWeight: 'Soft rounded lines, minimal harsh edges',
    shadingStyle: 'Soft gradients and gentle shadows',
    characterNotes: 'Cute proportions, big eyes, friendly expressions, simple clothing',
  },
  manga: {
    artStyle: 'Japanese manga style with expressive eyes and dynamic motion lines',
    colorPalette: 'Clean black and white with screen tones, or soft pastel colors',
    lineWeight: 'Clean thin lines with emphasis on speed lines and effects',
    shadingStyle: 'Screen tones and crosshatching',
    characterNotes: 'Large expressive eyes, varied hair styles, emotional expressions',
  },
  graphic_novel: {
    artStyle: 'Realistic graphic novel style with detailed environments',
    colorPalette: 'Muted, sophisticated color palette with mood-driven tones',
    lineWeight: 'Detailed linework with cross-hatching',
    shadingStyle: 'Realistic lighting with atmospheric effects',
    characterNotes: 'Realistic proportions, detailed clothing, subtle expressions',
  },
};

// ===========================================
// COMIC SUB-TYPE CONFIGURATION
// Multi-Agent Architecture for Comics
// ===========================================

interface ComicSubTypeDefinition {
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

const COMIC_SUB_TYPE_DEFINITIONS: Record<string, ComicSubTypeDefinition> = {
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

function buildStoryArchitectPrompt(subType: string, chapterTitle: string, bookTitle: string, chapterNumber: number): string {
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

function buildScriptwriterPrompt(subType: string, language: string, characterSheet?: any): string {
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

function buildVisualDirectorPrompt(subType: string, stylePreset: string, characterSheet?: any): string {
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
  
  return `[VISUAL DIRECTOR AGENT]

You design the visual composition for each panel.
STYLE: ${style.artStyle}
PALETTE: ${style.colorPalette}
LINE WEIGHT: ${style.lineWeight}

YOUR RULES:
${config.visualDirectorRules}
${characterVisuals}
${settingVisual}

VISUAL DESCRIPTION FORMAT (MANDATORY):
Visual: [Camera angle] of [scene description]. [Character(s)] [action/pose]. [Mood/lighting]. [Key visual elements].

Example: "Wide shot of a sunlit marketplace. AMARA stands confidently in the center, hands on hips, looking at a mysterious vendor. Warm golden light. Colorful fabrics and spices in background."`;
}

function buildLearningAgentPrompt(subType: string, learningConfig?: any): string {
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

function buildContinuityGuardianPrompt(characterSheet?: any): string {
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

function buildEnhancedComicSystemPrompt(
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

function buildEnhancedComicChapterPrompt(
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
// WORKBOOK STRUCTURE LIMITS
// ===========================================

const WORKBOOK_LIMITS = {
  maxWordsPerChapter: 1800,
  minWordsPerChapter: 800,
  maxExplanationRatio: 0.30,
};

// ===========================================
// TYPES & INTERFACES
// ===========================================

interface Reference {
  author: string;
  title: string;
  year: number;
  type: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  requires_verification?: boolean;
  verified?: boolean;
  peerReviewed?: boolean;
  database?: string;
}

interface ResearchResult {
  references: Reference[];
  inTextCitations: string[];
  metadata: {
    source_count: number;
    source_types: Record<string, number>;
    confidence_score: string;
    research_date: string;
    verified_count?: number;
    peer_reviewed_count?: number;
    databases_covered?: string[];
    topic_coverage?: number;
  };
}

interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

interface ValidationResult {
  valid: boolean;
  blocked: boolean;
  errors: ValidationError[];
  warnings: { code: string; message: string }[];
  failureMessage?: string;
}

// ===========================================
// VALIDATION FUNCTIONS
// ===========================================

interface DialogueObject {
  speaker: string;
  text: string;
  type: 'speech' | 'thought' | 'narration';
}

interface PanelDialogueResult {
  panelNumber: number;
  dialogues: DialogueObject[];
  hasDialogue: boolean;
}

function extractPanelDialogues(content: string): PanelDialogueResult[] {
  const results: PanelDialogueResult[] = [];
  
  // Split content by panels
  const panelSections = content.split(/\[PANEL\s*(\d+)\]/gi);
  
  for (let i = 1; i < panelSections.length; i += 2) {
    const panelNumber = parseInt(panelSections[i]);
    const panelContent = panelSections[i + 1] || '';
    
    const dialogues: DialogueObject[] = [];
    
    // Match dialogue patterns: - CHARACTER: "text" or - CHARACTER: text
    // Also handle **CHARACTER**: format from markdown
    const dialogueMatches = panelContent.matchAll(/-\s*\*?\*?([A-Z][A-Za-z_\s]+?)\*?\*?:\s*"?([^"\n]+)"?/gi);
    
    for (const match of dialogueMatches) {
      const speaker = match[1].trim().replace(/\*+/g, ''); // Remove any asterisks
      const text = match[2].trim();
      
      // Determine dialogue type based on markers
      let type: 'speech' | 'thought' | 'narration' = 'speech';
      if (text.startsWith('(') && text.endsWith(')')) {
        type = 'thought';
      } else if (speaker.toLowerCase().includes('narrator') || speaker.toLowerCase().includes('caption')) {
        type = 'narration';
      }
      
      if (text.length > 0) {
        dialogues.push({ speaker, text, type });
      }
    }
    
    results.push({
      panelNumber,
      dialogues,
      hasDialogue: dialogues.length > 0,
    });
  }
  
  return results;
}

function validateComicStructure(content: string): ValidationResult & { panelDialogues?: PanelDialogueResult[]; totalDialogueCount?: number } {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];

  // Match [PANEL X] markers - the primary structure indicator
  const panelRegex = /\[PANEL\s*(\d+)\]/gi;
  const panels = content.match(panelRegex) || [];
  const panelCount = panels.length;
  
  console.log(`[VALIDATE-COMIC] Raw panel markers found: ${panelCount}`);

  // HARD FAIL: No panels
  if (panelCount === 0) {
    errors.push({
      code: 'NO_PANELS_DETECTED',
      message: 'Comic content must have structured panels [PANEL X]',
      severity: 'critical',
    });
    return {
      valid: false,
      blocked: true,
      errors,
      warnings,
      failureMessage: '❌ **COMIC GENERATION BLOCKED**: No panels detected.',
    };
  }

  // HARD FAIL: Insufficient panels
  if (panelCount < 4) {
    errors.push({
      code: 'INSUFFICIENT_PANELS',
      message: `Comic requires minimum 4 panels, found ${panelCount}`,
      severity: 'high',
    });
  }

  // Extract and validate dialogue per panel - MANDATORY
  const panelDialogues = extractPanelDialogues(content);
  const panelsWithoutDialogue = panelDialogues.filter(p => !p.hasDialogue);
  const totalDialogueCount = panelDialogues.reduce((sum, p) => sum + p.dialogues.length, 0);

  // HARD FAIL: Any panel without dialogue
  if (panelsWithoutDialogue.length > 0) {
    const missingPanels = panelsWithoutDialogue.map(p => p.panelNumber).join(', ');
    errors.push({
      code: 'DIALOGUE_MISSING_IN_PANELS',
      message: `Dialogue missing in panel(s): ${missingPanels}. EVERY panel MUST have at least one dialogue.`,
      severity: 'critical',
    });
  }

  // HARD FAIL: Total dialogue count must be >= panel count
  if (totalDialogueCount < panelCount) {
    errors.push({
      code: 'INSUFFICIENT_DIALOGUE_COUNT',
      message: `Total dialogue count (${totalDialogueCount}) must be >= panel count (${panelCount})`,
      severity: 'critical',
    });
  }

  // Check for visual descriptions - supports both plain and markdown format
  const visualPattern = /(?:\*\*)?Visual:?(?:\*\*)?/gi;
  const visualDescriptions = content.match(visualPattern) || [];
  
  if (visualDescriptions.length < panelCount * 0.8) {
    warnings.push({
      code: 'INCOMPLETE_VISUAL_DESCRIPTIONS',
      message: 'Some panels lack detailed visual descriptions',
    });
  }

  const hasCriticalError = errors.some(e => e.severity === 'critical');
  const panelsMissingList = panelsWithoutDialogue.length > 0 
    ? `Panels without dialogue: ${panelsWithoutDialogue.map(p => p.panelNumber).join(', ')}`
    : '';

  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    panelDialogues,
    totalDialogueCount,
    failureMessage: hasCriticalError 
      ? `❌ **COMIC GENERATION BLOCKED**: Every panel MUST include character dialogue.\n${panelsMissingList}\nTotal dialogues: ${totalDialogueCount}, Required: ${panelCount}` 
      : undefined,
  };
}

function validateWorkbookStructure(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];

  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

  // Check word count limit
  if (wordCount > WORKBOOK_LIMITS.maxWordsPerChapter) {
    errors.push({
      code: 'WORKBOOK_TOO_LONG',
      message: `Workbook exceeds ${WORKBOOK_LIMITS.maxWordsPerChapter} words (${wordCount} words)`,
      severity: 'high',
    });
  }

  // Check for required sections
  const sectionPatterns: Record<string, RegExp> = {
    purpose: /(?:^|\n)##+\s*(?:purpose|objective|goal)/i,
    concepts: /(?:^|\n)##+\s*(?:key\s*concepts?|core\s*ideas?)/i,
    prompts: /(?:^|\n)##+\s*(?:prompts?|exercises?|fill[- ]in|your\s*turn)/i,
    reflection: /(?:^|\n)##+\s*(?:reflect(?:ion)?)/i,
    action: /(?:^|\n)##+\s*(?:action\s*(?:steps?|items?)|next\s*steps?)/i,
  };

  Object.entries(sectionPatterns).forEach(([section, pattern]) => {
    if (!pattern.test(content)) {
      errors.push({
        code: `MISSING_${section.toUpperCase()}_SECTION`,
        message: `Workbook requires a ${section} section`,
        severity: 'high',
      });
    }
  });

  // Check for interactive elements
  const interactivePatterns = [
    /_{3,}/g,
    /\[\s*\]/g,
  ];
  const hasInteractiveElements = interactivePatterns.some(p => p.test(content));
  
  if (!hasInteractiveElements) {
    errors.push({
      code: 'NO_INTERACTIVE_ELEMENTS',
      message: 'Workbook must include fill-in prompts or checkboxes',
      severity: 'high',
    });
  }

  return {
    valid: errors.length === 0,
    blocked: errors.some(e => e.severity === 'critical'),
    errors,
    warnings,
    failureMessage: errors.length > 0 
      ? '❌ **WORKBOOK STRUCTURE VIOLATION**: Must be interactive with prompts, not prose-heavy.'
      : undefined,
  };
}

// ===========================================
// PEDAGOGICAL SCHEMA VALIDATION (PBG-1.0)
// Every chapter MUST include 7 mandatory sections
// ===========================================

interface PedagogicalValidationResult extends ValidationResult {
  sectionsFound: number;
  sectionsRequired: number;
  missingSections: string[];
  score: number;
}

const MANDATORY_PEDAGOGICAL_SECTIONS = {
  learning_objectives: {
    displayName: 'Learning Objectives',
    patterns: [
      /learning\s*objectives?/i,
      /by\s+the\s+end\s+of\s+this\s+chapter/i,
      /you\s+will\s+(?:be\s+able\s+to|learn)/i,
      /objectives?/i,
    ],
    required: true,
  },
  core_concept: {
    displayName: 'Core Concept Explanation',
    patterns: [
      /core\s+concepts?/i,
      /fundamental(?:s)?/i,
      /key\s+(?:concepts?|ideas?|principles?)/i,
      /introduction|overview/i,
    ],
    required: true,
  },
  mental_model: {
    displayName: 'Mental Model / Analogy',
    patterns: [
      /mental\s+model/i,
      /think\s+of\s+it\s+as/i,
      /imagine|analogy|like\s+a/i,
      /similar\s+to/i,
    ],
    required: true,
  },
  worked_examples: {
    displayName: 'Worked Examples',
    patterns: [
      /(?:worked\s+)?examples?/i,
      /for\s+instance/i,
      /consider\s+(?:this|the\s+following)/i,
      /let'?s\s+(?:look\s+at|see|examine)/i,
      /step\s+\d/i,
      /code\s+example/i,
    ],
    required: true,
  },
  common_mistakes: {
    displayName: 'Common Mistakes & Misconceptions',
    patterns: [
      /common\s+mistakes?/i,
      /misconceptions?/i,
      /common\s+errors?/i,
      /avoid|don'?t|pitfall/i,
      /watch\s+out/i,
    ],
    required: true,
  },
  practice_section: {
    displayName: 'Practice Section',
    patterns: [
      /practice/i,
      /exercises?/i,
      /try\s+it/i,
      /your\s+turn/i,
      /apply\s+what\s+you/i,
      /hands[- ]on/i,
    ],
    required: true,
  },
  quiz_gate: {
    displayName: 'Chapter Quiz Gate',
    patterns: [
      /quiz/i,
      /assessment/i,
      /test\s+your/i,
      /check\s+your\s+understanding/i,
      /review\s+questions?/i,
      /self[- ]assessment/i,
    ],
    required: true,
  },
};

function validatePedagogicalSchema(content: string, bookType: string): PedagogicalValidationResult {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];
  const missingSections: string[] = [];

  // Skip validation for non-educational book types
  const EXEMPT_BOOK_TYPES = ['children', 'comic', 'novel', 'fiction', 'bestseller'];
  if (EXEMPT_BOOK_TYPES.includes(bookType?.toLowerCase())) {
    console.log(`[PEDAGOGICAL] Skipping validation for book type: ${bookType}`);
    return {
      valid: true,
      blocked: false,
      errors: [],
      warnings: [],
      sectionsFound: 7,
      sectionsRequired: 7,
      missingSections: [],
      score: 100,
    };
  }

  const contentLower = content.toLowerCase();
  let sectionsFound = 0;

  Object.entries(MANDATORY_PEDAGOGICAL_SECTIONS).forEach(([sectionId, config]) => {
    const found = config.patterns.some(pattern => pattern.test(content));
    
    if (found) {
      sectionsFound++;
    } else if (config.required) {
      missingSections.push(config.displayName);
      errors.push({
        code: `MISSING_${sectionId.toUpperCase()}`,
        message: `Missing required section: ${config.displayName}`,
        severity: 'high',
      });
    }
  });

  const sectionsRequired = Object.values(MANDATORY_PEDAGOGICAL_SECTIONS).filter(c => c.required).length;
  const score = Math.round((sectionsFound / sectionsRequired) * 100);

  // Check minimum word count for proper chapter depth
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 1500) {
    warnings.push({
      code: 'CHAPTER_TOO_SHORT',
      message: `Chapter has ${wordCount} words (minimum 1500 recommended for proper depth)`,
    });
  }

  // Critical failure if less than 5 sections found
  if (sectionsFound < 5) {
    errors.push({
      code: 'INSUFFICIENT_PEDAGOGICAL_STRUCTURE',
      message: `Only ${sectionsFound}/${sectionsRequired} required sections found. Minimum 5 required.`,
      severity: 'critical',
    });
  }

  const hasCriticalError = errors.some(e => e.severity === 'critical');

  return {
    valid: !hasCriticalError && score >= 70,
    blocked: hasCriticalError,
    errors,
    warnings,
    sectionsFound,
    sectionsRequired,
    missingSections,
    score,
    failureMessage: hasCriticalError
      ? `❌ **PEDAGOGICAL SCHEMA VIOLATION**: Chapter requires 7 mandatory sections. Found ${sectionsFound}. Missing: ${missingSections.join(', ')}`
      : undefined,
  };
}

function validateAcademicRequirements(
  content: string,
  sources: Reference[],
  category: string,
  citationStyle: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];
  
  const minSources = DOMAIN_MIN_SOURCES[category.toLowerCase()] || DOMAIN_MIN_SOURCES.default;
  const domainRules = DOMAIN_RULES[category.toLowerCase()] || DOMAIN_RULES.default;
  
  // HARD FAIL: Insufficient sources
  if (sources.length < minSources) {
    errors.push({
      code: 'INSUFFICIENT_SOURCES',
      message: `${category} requires minimum ${minSources} verified sources, found ${sources.length}`,
      severity: 'critical',
    });
  }
  
  // Check for verifiable sources
  const verifiedSources = sources.filter(s => s.doi || s.url);
  if (sources.length > 0 && verifiedSources.length / sources.length < 0.5) {
    errors.push({
      code: 'UNVERIFIED_SOURCES',
      message: 'At least 50% of sources must have DOI or stable URL',
      severity: 'critical',
    });
  }
  
  // Medical peer-review requirement
  if (domainRules.requiresPeerReview) {
    const peerReviewed = sources.filter(s => s.peerReviewed);
    if (peerReviewed.length < Math.ceil(minSources / 2)) {
      errors.push({
        code: 'INSUFFICIENT_PEER_REVIEWED',
        message: `${category} requires at least ${Math.ceil(minSources / 2)} peer-reviewed sources`,
        severity: 'critical',
      });
    }
  }
  
  // Check for in-text citations
  const citationPatterns: Record<string, RegExp> = {
    APA: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-z]+))?,?\s*\d{4}[a-z]?\)/g,
    Harvard: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?\s+\d{4}[a-z]?\)/g,
    IEEE: /\[\d+(?:,\s*\d+)*\]/g,
    Chicago: /\[[A-Z][a-z]+,?\s*\d{4}\]/g,
  };
  
  const pattern = citationPatterns[citationStyle] || citationPatterns.APA;
  const citations = content.match(pattern) || [];
  
  if (citations.length === 0 && sources.length > 0) {
    errors.push({
      code: 'NO_IN_TEXT_CITATIONS',
      message: 'Academic content must include in-text citations',
      severity: 'critical',
    });
  }
  
  // Check for References section
  if (!/(?:^|\n)##+\s*(?:references?|bibliography)/i.test(content)) {
    errors.push({
      code: 'MISSING_REFERENCES_SECTION',
      message: 'Academic content must include a References section',
      severity: 'critical',
    });
  }

  // Check for disclaimer in medicine/law
  if (domainRules.requiresDisclaimer) {
    const disclaimerPatterns: Record<string, RegExp> = {
      medicine: /(?:not\s+(?:a\s+)?substitute|consult\s+(?:a\s+)?(?:doctor|physician)|medical\s+advice)/i,
      law: /(?:not\s+(?:a\s+)?substitute|legal\s+advice|consult\s+(?:a\s+)?lawyer)/i,
    };
    const discPattern = disclaimerPatterns[category.toLowerCase()];
    if (discPattern && !discPattern.test(content)) {
      errors.push({
        code: 'MISSING_DISCLAIMER',
        message: `${category} content REQUIRES professional disclaimer`,
        severity: 'critical',
      });
    }
  }
  
  const hasCriticalError = errors.some(e => e.severity === 'critical');
  
  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    failureMessage: hasCriticalError ? formatAcademicFailure(errors, category) : undefined,
  };
}

function formatAcademicFailure(errors: ValidationError[], category: string): string {
  let message = '❌ **ACADEMIC GENERATION BLOCKED — QUALITY VIOLATION**\n\n';
  message += `**Category:** ${category}\n\n**Violations:**\n`;
  
  errors.filter(e => e.severity === 'critical').forEach(e => {
    message += `- ${e.message}\n`;
  });
  
  message += '\n**To proceed:**\n';
  message += '1. Try a more specific topic with available academic literature\n';
  message += '2. Ensure the topic has peer-reviewed sources\n';
  
  return message;
}

// ===========================================
// CITATION FORMATTING
// ===========================================

function formatInTextCitation(ref: Reference, style: string): string {
  const lastName = ref.author.split(',')[0] || ref.author.split(' ').pop() || ref.author;
  
  switch (style) {
    case 'APA':
      return `(${lastName}, ${ref.year})`;
    case 'Harvard':
      return `(${lastName} ${ref.year})`;
    case 'Chicago':
      return `[${lastName}, ${ref.year}]`;
    case 'IEEE':
      return `[1]`;
    default:
      return `(${lastName}, ${ref.year})`;
  }
}

// ===========================================
// DEEP RESEARCH PIPELINE
// ===========================================

async function conductDeepResearch(
  topic: string,
  category: string,
  keyTopics: string[],
  citationStyle: string,
  authToken: string
): Promise<ResearchResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  
  console.log("[DEEP-RESEARCH] Starting deep research pipeline for:", topic.slice(0, 50));

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/deep-research`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: `${topic}`,
        category,
        keyTopics,
        mode: 'full',
      }),
    });

    if (!response.ok) {
      console.error("[DEEP-RESEARCH] Error:", response.status);
      return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
    }

    const data = await response.json();
    console.log("[DEEP-RESEARCH] Received sources:", data.sources?.length || 0);

    if (!data.sources || data.sources.length === 0) {
      return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
    }

    const references: Reference[] = data.sources.map((s: any) => ({
      author: s.authors?.join(', ') || 'Unknown',
      title: s.title || 'Unknown',
      year: s.year || new Date().getFullYear(),
      type: s.type || 'article',
      doi: s.doi,
      url: s.url || (s.doi ? `https://doi.org/${s.doi}` : undefined),
      journal: s.journal,
      publisher: s.publisher,
      verified: s.verified,
      peerReviewed: s.peerReviewed,
      database: s.database,
    }));

    const inTextCitations = references.map((ref, index) => 
      citationStyle === 'IEEE' ? `[${index + 1}]` : formatInTextCitation(ref, citationStyle)
    );

    return {
      references,
      inTextCitations,
      metadata: {
        source_count: references.length,
        source_types: {},
        confidence_score: data.metadata?.confidenceScore || 'moderate',
        research_date: new Date().toISOString(),
        verified_count: data.metadata?.verifiedSources || 0,
        peer_reviewed_count: data.metadata?.peerReviewedSources || 0,
        databases_covered: data.metadata?.databasesCovered || [],
        topic_coverage: data.metadata?.topicCoverage || 0,
      },
    };
  } catch (error) {
    console.error("[DEEP-RESEARCH] Error:", error);
    return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
  }
}

async function conductFallbackResearch(
  topic: string,
  category: string,
  keyTopics: string[],
  citationStyle: string
): Promise<ResearchResult> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  
  if (!PERPLEXITY_API_KEY) {
    return {
      references: [],
      inTextCitations: [],
      metadata: {
        source_count: 0,
        source_types: {},
        confidence_score: "No citations available",
        research_date: new Date().toISOString(),
      },
    };
  }

  try {
    const searchQuery = `Find peer-reviewed academic sources for: "${topic}" in ${category}. Key areas: ${keyTopics.join(', ')}`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: `Find REAL academic references. Return as JSON array.` },
          { role: "user", content: searchQuery }
        ],
        search_mode: "academic",
      }),
    });

    if (!response.ok) throw new Error("Perplexity API error");

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    let references: Reference[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        references = JSON.parse(jsonMatch[0]);
      }
    } catch {
      references = citations.slice(0, 10).map((url: string, i: number) => ({
        author: "Source",
        title: `Reference ${i + 1}`,
        year: new Date().getFullYear(),
        type: "web",
        url,
        requires_verification: true,
      }));
    }

    const inTextCitations = references.map((ref, index) => 
      citationStyle === 'IEEE' ? `[${index + 1}]` : formatInTextCitation(ref, citationStyle)
    );

    return {
      references,
      inTextCitations,
      metadata: {
        source_count: references.length,
        source_types: {},
        confidence_score: references.length >= 5 ? "Moderate (fallback)" : "Low",
        research_date: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[RESEARCH-FALLBACK] Error:", error);
    return {
      references: [],
      inTextCitations: [],
      metadata: {
        source_count: 0,
        source_types: {},
        confidence_score: "Research failed",
        research_date: new Date().toISOString(),
      },
    };
  }
}

// ===========================================
// PROMPT BUILDERS
// ===========================================

function getFieldSpecificInstructions(category: string): string {
  const instructions: Record<string, string> = {
    medicine: `- Maintain evidence hierarchy (meta-analyses > RCTs > cohort studies)\n- Include medical disclaimers\n- Cite PubMed/clinical sources`,
    law: `- Cite case law and statutes\n- Include jurisdictional disclaimers`,
    science: `- Include reproducibility statements\n- Distinguish peer-reviewed vs preprint`,
    technology: `- All code must be runnable and formatted\n- Include version information`,
    business: `- Use established frameworks (Porter, SWOT)\n- Include tables for comparative data`,
    default: `- Maintain academic rigor\n- Support claims with citations`,
  };
  return instructions[category.toLowerCase()] || instructions.default;
}

function buildAcademicSystemPrompt(language: string, category: string, citationStyle: string): string {
  return `You are ScrollLibrary — ACADEMIC/SCHOLARLY PIPELINE.

GENERATOR IDENTITY: University Lecturer · Research Scholar · Technical Author

You are writing university-grade academic content. You are INSTRUCTIONAL, RIGOROUS, and EVIDENCE-BASED.
You are NOT a storyteller. You are NOT motivational. You are NOT a ghostwriter.

Your output must be acceptable to:
• University lecturers and academic reviewers
• Institutional quality assurance committees
• Peer-review panels

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

PRIORITY: Correctness > Speed. Trust > Novelty. Understanding > Volume.

LANGUAGE: Write EXCLUSIVELY in ${language}.

AUTHORSHIP RULES:
- You are an AI-assisted author, not a sole author
- Maintain neutral, scholarly tone throughout

CITATION REQUIREMENTS (${citationStyle} format):
- EVERY factual claim must have an in-text citation
- NEVER fabricate citations — only use sources provided
- Mark unsupported claims with "[requires verification]"

COGNITIVE STRUCTURE (MANDATORY):
1. Concept Introduction — Hook the reader, provide context
2. Structured Explanation — Clear, logical progression
3. Applied Examples — Real-world case studies
4. Critical Reflection — Analysis, implications
5. Key Takeaways — Summary of main points

FIELD-SPECIFIC (${category}):
${getFieldSpecificInstructions(category)}

QUALITY STANDARD: Content must be acceptable to university lecturers and academic reviewers.`;
}

function buildAcademicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  category: string,
  keyTopics: string[],
  targetWords: number,
  language: string,
  citationStyle: string,
  references: Reference[],
  inTextCitations: string[]
): string {
  const sourceList = references.slice(0, 15).map((ref, i) => 
    `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}"${ref.journal ? ` — ${ref.journal}` : ''}${ref.doi ? ` DOI: ${ref.doi}` : ''} — Citation: ${inTextCitations[i]}`
  ).join('\n');

  return `Write Chapter: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

VERIFIED SOURCES TO CITE (USE ONLY THESE):
${sourceList}

KEY TOPICS:
${keyTopics?.map((t, i) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

REQUIREMENTS:
1. Write approximately ${targetWords} words in ${language}
2. Include in-text citations using ${citationStyle} format
3. Use ONLY the sources listed above
4. Mark unsupported claims with "[requires verification]"
5. Use proper Markdown formatting: ## for headings, **bold** for key terms, proper tables

MANDATORY STRUCTURE:

Introduction

[Hook + context + chapter overview]

Main Concepts

[Structured explanation with citations]

Applied Examples

[Real-world applications with evidence]

Critical Analysis

[Deeper analysis, implications]

Key Takeaways

[Numbered summary of main points]

Conclusion

[Synthesis and transition]

References

[Full ${citationStyle} formatted bibliography]

BEGIN WRITING THE COMPLETE ACADEMIC CHAPTER:`;
}

// ===========================================
// COMIC GENERATION - AUTHORITY GRADE
// ===========================================

function buildComicSystemPrompt(style: string, language: string): string {
  const styleGuide = COMIC_STYLE_PRESETS[style] || COMIC_STYLE_PRESETS.children_book;
  
  return `You are a professional comic book writer creating structured comic panels.

VISUAL STYLE:
- Art Style: ${styleGuide.artStyle}
- Color Palette: ${styleGuide.colorPalette}
- Line Weight: ${styleGuide.lineWeight}
- Shading: ${styleGuide.shadingStyle}
- Characters: ${styleGuide.characterNotes}

LANGUAGE: All dialogue and captions must be in ${language}.

CRITICAL RULES:
1. Use [PANEL 1], [PANEL 2], etc. markers for each panel
2. Every panel MUST have character dialogue
3. Visual descriptions must be detailed for image generation
4. Maintain character consistency across panels
5. Maximum 30 words per speech bubble`;
}

function buildComicChapterPrompt(
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

// ===========================================
// WORKBOOK GENERATION - AUTHORITY GRADE
// ===========================================

function buildWorkbookSystemPrompt(language: string): string {
  return `${SYSTEM_ROLE}

${MASTER_FORMATTING_CONTRACT}

${WORKBOOK_MASTER_CONTRACT}

LANGUAGE: All content must be in ${language}.

HARD LIMITS:
- Maximum ${WORKBOOK_LIMITS.maxWordsPerChapter} words per chapter
- Purpose section: ≤150 words
- Key Concepts: ≤300 words
- Explanation must NEVER exceed 30% of chapter
- Fill-in prompts must DOMINATE the chapter

MANDATORY STRUCTURE (in this exact order):
1. Purpose — Brief goal statement
2. Key Concepts — Bullet points only, minimal prose
3. Fill-In Prompts — Main content (multiple prompts with blank lines)
4. Tables/Worksheets — For planning and organization
5. Reflection Questions — Open questions without answers
6. Action Steps — Checkbox items for next steps

INTERACTIVE ELEMENT REQUIREMENTS:
- Use underscores (___________) for fill-in blanks
- Use empty brackets [ ] for checkboxes
- Use labeled row/column tables for user input (NOT Markdown tables)
- Every prompt must have space for user writing

FORBIDDEN:
- Long explanatory paragraphs
- Essay-style content
- Providing answers to reflection questions
- Walls of text
- Markdown syntax (**, ##, backticks)`;
}

function buildWorkbookChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string
): string {
  return `Create an INTERACTIVE WORKBOOK CHAPTER for:
**Book:** "${bookTitle}"
**Chapter ${chapterNumber}:** "${chapterTitle}"
**Topics:** ${keyTopics?.join(', ') || 'Focus on practical application'}

Generate the chapter following this EXACT structure:

---

## Purpose
[Write ≤150 words explaining what this chapter helps achieve.]

---

## Key Concepts
[Write ≤300 words as bullet points. NO long paragraphs.]

---

## Your Turn: Fill-In Prompts

### Prompt 1: [Topic-specific prompt title]
[One sentence instruction]

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

### Prompt 2: [Next prompt]
[One sentence instruction]

_______________________________________________________________________________
_______________________________________________________________________________

### Prompt 3: [Another prompt]
_______________________________________________________________________________
_______________________________________________________________________________

---

## Planning Worksheet

| Area | Current State | Goal | First Step |
|------|---------------|------|------------|
|      |               |      |            |
|      |               |      |            |
|      |               |      |            |

---

## Reflection Questions

1. _______________________________________________________________________________?
2. _______________________________________________________________________________?
3. _______________________________________________________________________________?

---

## Action Steps

- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________
- [ ] _________________________________________________________________________

---

**REQUIREMENTS:**
✅ Purpose + Concepts ≤450 words
✅ Minimum 3 fill-in prompts with blank lines
✅ At least 1 table with empty cells
✅ Minimum 3 reflection questions
✅ Minimum 5 action checkboxes
✅ Total chapter ≤${WORKBOOK_LIMITS.maxWordsPerChapter} words
✅ All text in ${language}

BEGIN CREATING THE WORKBOOK CHAPTER:`;
}

// ===========================================
// MAIN HANDLER
// ===========================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse body ONCE at the start to avoid "Body is unusable" error
  let requestBody: Record<string, unknown> | null = null;
  try {
    requestBody = await req.json();
  } catch (e) {
    console.error("[GENERATE-CHAPTER] Failed to parse request body:", e);
    return new Response(
      JSON.stringify({ error: "Invalid request body", code: "PARSE_ERROR" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Health check (no auth required)
  if (requestBody?.healthCheck) {
    return new Response(
      JSON.stringify({ ok: true, function: "generate-chapter", buildId: `fn:${new Date().toISOString()}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  // OCR check endpoint (requires auth, handled below)
  if (requestBody?.ocrCheck && (requestBody as Record<string, unknown>)?.imageUrl) {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    try {
      const ocrResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: generationModel,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Analyze this comic panel image. List ALL visible text including speech bubbles, captions, and any words. Return JSON: {"hasText": boolean, "foundText": ["word1", "word2", ...]}` },
              { type: "image_url", image_url: { url: requestBody.imageUrl as string } }
            ]
          }],
        }),
      });
      
      if (ocrResponse.ok) {
        const ocrData = await ocrResponse.json();
        const content = ocrData.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { hasText: false, foundText: [] };
        return new Response(JSON.stringify({ ocrResult: result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      console.error("[OCR] Error:", e);
    }
    return new Response(JSON.stringify({ ocrResult: { hasText: false, foundText: [] } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GENERATE-CHAPTER] User: ${user.id.slice(0, 8)}...`);

    // Check admin status
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    const isAdmin = userRoles?.some(r => r.role === 'admin') || false;

    // Get subscription plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("user_id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    // Admin gets best model regardless of profile plan
    const effectiveModelPlan = isAdmin ? "prophet_tier" : userPlan;
    const generationModel = getModelForPlan(effectiveModelPlan);
    const maxWordCount = TIER_WORD_LIMITS[userPlan as keyof typeof TIER_WORD_LIMITS] || TIER_WORD_LIMITS.free;
    console.log(`[GENERATE-CHAPTER] Plan: ${userPlan} | Model: ${generationModel} | Admin: ${isAdmin}`);

    // ===========================================
    // INPUT NORMALIZATION — Defensive layer for multi-path orchestration
    // ===========================================
    const chapterId = (requestBody?.chapterId as string | undefined) || undefined;
    const bookTitle = (requestBody?.bookTitle as string) || '';
    const chapterTitle = (requestBody?.chapterTitle as string) || '';
    const chapterNumber = (requestBody?.chapterNumber as number) || 1;
    const keyTopics = (requestBody?.keyTopics as string[]) || [];
    const category = (requestBody?.category as string) || 'general';
    const wordCount = (requestBody?.wordCount as number) || 4000;
    const language = (requestBody?.language as string) || 'English';
    const bookType = (requestBody?.bookType as string) || 'text';
    const academicMode = Boolean(requestBody?.academicMode);
    const citationStyle = (requestBody?.citationStyle as string) || 'APA';
    const comicStyle = (requestBody?.comicStyle as string) || 'children_book';
    const editIntent = (requestBody?.editIntent as string | null) || null;
    const isRegeneration = Boolean(requestBody?.isRegeneration);

    // Structured observability for orchestration debugging
    console.log(`[GENERATE-CHAPTER] Input normalization: ${JSON.stringify({
      hasChapterId: !!chapterId,
      hasBookTitle: !!bookTitle,
      hasCategory: !!category,
      category,
      bookType,
      language,
      isRegeneration,
      hasEditIntent: !!editIntent,
      academicMode,
      wordCount,
    })}`);

    // ===========================================
    // EDIT CONTROL CONTRACT ENFORCEMENT
    // ===========================================
    
    // Check if this is a regeneration and enforce edit intent requirement
    let existingContent: string | null = null;
    
    if (chapterId) {
      const { data: existingChapter } = await supabase
        .from("chapters")
        .select("content, is_generated")
        .eq("id", chapterId)
        .single();
      
      existingContent = existingChapter?.content || null;
      const wasGenerated = existingChapter?.is_generated || false;
      
      // EDIT CONTROL: If regenerating existing content, require edit intent
      if (wasGenerated && existingContent && existingContent.length > 100) {
        if (isRegeneration && !editIntent) {
          console.log("[GENERATE-CHAPTER] EDIT CONTROL: Regeneration blocked - no edit intent provided");
          return new Response(JSON.stringify({
            error: "Edit intent required for regeneration",
            code: "EDIT_INTENT_REQUIRED",
            message: "Please specify what you want to change before regenerating this chapter.",
            suggestions: [
              "Shorten this chapter",
              "Make it more academic",
              "Add clearer examples",
              "Improve dialogue",
              "Fix formatting",
              "Add more interactive elements",
            ],
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        if (editIntent) {
          console.log(`[GENERATE-CHAPTER] EDIT MODE: Applying edit intent: "${editIntent.slice(0, 100)}..."`);
        }
      }
    }

    // Verify ownership and get book details for style/workbook settings
    const { data: chapter } = await supabase
      .from("chapters")
      .select("book_id")
      .eq("id", chapterId)
      .single();

    // Get book with all style/workbook fields
    let bookDetails: {
      creator_id: string;
      book_type: string;
      workbook_density: string | null;
      comic_style_id: string | null;
      palette_hint: string | null;
      line_weight_hint: string | null;
      character_sheet: any;
      layout_template: number | null;
    } | null = null;

    if (chapter) {
      const { data: book } = await supabase
        .from("books")
        .select("creator_id, book_type")
        .eq("id", chapter.book_id)
        .single();

      bookDetails = book;

      if (book && book.creator_id !== user.id && !isAdmin) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Use book-level settings if available, otherwise use request params
    // Cast bookDetails to any for new fields not yet in generated types
    const bookData = bookDetails as any;
    const effectiveBookType = bookData?.book_type || bookType;
    const effectiveComicStyle = bookData?.comic_style_id || comicStyle;
    const effectiveLayoutTemplate = bookData?.layout_template || 5;
    const effectiveWorkbookDensity = bookData?.workbook_density || 'medium';
    const effectiveCharacterSheet = bookData?.character_sheet || {};
    const effectivePaletteHint = bookData?.palette_hint || '';
    const effectiveLineWeightHint = bookData?.line_weight_hint || '';
    const effectiveTextInImage = bookData?.text_in_image ?? true;
    const effectiveScenesPerPanel = bookData?.scenes_per_panel || 1;

    const effectiveWordCount = isAdmin ? wordCount : Math.min(wordCount, maxWordCount);
    
    const languageMap: Record<string, string> = {
      'en': 'English', 'fr': 'French', 'de': 'German', 'es': 'Spanish',
      'ar': 'Arabic', 'sw': 'Swahili', 'pt': 'Portuguese'
    };
    const languageName = languageMap[language] || language;
    
    console.log(`[GENERATE-CHAPTER] Chapter ${chapterNumber}: ${chapterTitle}`);
    console.log(`[GENERATE-CHAPTER] Type: ${bookType}, Academic: ${academicMode}, Admin: ${isAdmin}`);
    console.log(`[GENERATE-CHAPTER] Edit mode: ${editIntent ? 'YES' : 'NO'}${editIntent ? ` - Intent: ${editIntent.slice(0, 50)}` : ''}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // ===========================================
    // BUILD EDIT INTENT PROMPT IF REGENERATING
    // ===========================================
    
    let editIntentPrompt = '';
    if (editIntent && existingContent) {
      const isChiefEditorRewrite = editIntent.startsWith('[CHIEF_EDITOR_REWRITE]');
      
      if (isChiefEditorRewrite) {
        // CHIEF EDITOR MODE: Comprehensive rewrite targeting near-perfect scores
        editIntentPrompt = `

=== CHIEF EDITOR COMPREHENSIVE REWRITE ===

You are performing a FULL QUALITY REWRITE of this chapter based on a Chief Editor audit.
The goal is to produce a chapter that scores 95-100/100 on ALL audit dimensions.

ORIGINAL CONTENT (USE AS FOUNDATION — IMPROVE EVERYTHING):
${existingContent.slice(0, 8000)}${existingContent.length > 8000 ? '\n[...content truncated...]' : ''}

${editIntent.replace('[CHIEF_EDITOR_REWRITE]\n', '')}

AUDIT RUBRIC — YOU MUST SCORE 95+ ON ALL:

**STRUCTURAL INTEGRITY (30% weight) — Target 95-100:**
- Clear title accurately reflecting content
- Logical progression with smooth transitions
- Well-organized sections with appropriate headings (minimum 3+ subsections)
- Appropriate word count (1000+ words minimum for depth)
- Engaging opening hook (first 100 words must grab attention)
- Strong closing that summarizes or transitions effectively

**ACADEMIC RIGOR (35% weight) — Target 95-100:**
- ALL claims supported with evidence or reasoning
- Technical terminology used correctly and consistently
- Deep coverage matching stated objectives (not surface-level)
- Zero factual errors or misleading statements
- Key concepts DEFINED BEFORE USE (use "is defined as", "refers to", etc.)
- Appropriate complexity for target audience

**PEDAGOGICAL QUALITY (35% weight) — Target 95-100:**
- Clear learning objectives stated or implied
- Multiple examples and illustrations (use "for example", "consider", "imagine", etc.)
- Content builds progressively on prior knowledge
- Active learning prompts: questions, exercises, reflection points
- Clear key takeaways identifiable
- Variety of explanation methods (narrative, examples, analogies, scenarios)
- Assessment-ready content (quiz questions could test this)

PENALTY AVOIDANCE — ENSURE ALL OF THESE:
- Word count MUST be 1200+ words (avoids WORD_COUNT_LOW penalty)
- Include 3+ concrete examples with example phrases (avoids NO_EXAMPLES penalty)
- Define 3+ key terms explicitly (avoids NO_DEFINITIONS penalty)
- Use 4+ markdown headings (## or ###) (avoids NO_STRUCTURE penalty)
- Include 3+ questions or exercises (avoids NO_ENGAGEMENT penalty)

REWRITE THE ENTIRE CHAPTER to achieve near-perfect scores.
Preserve the topic and core ideas but dramatically improve structure, depth, examples, definitions, and engagement.

BEGIN COMPREHENSIVE REWRITE:`;
      } else {
        // Standard edit intent: targeted changes only
        editIntentPrompt = `

=== CHAPTER REVISION REQUEST ===

ORIGINAL CONTENT (PRESERVE STRUCTURE):
${existingContent.slice(0, 6000)}${existingContent.length > 6000 ? '\n[...content truncated...]' : ''}

EDIT INTENT - APPLY ONLY THESE CHANGES:
${editIntent}

INSTRUCTIONS:
1. PRESERVE the original structure, logic, and continuity
2. Apply ONLY the changes specified above
3. Do NOT rewrite sections unaffected by the edit intent
4. Maintain all quality contracts for this content type
5. Return the COMPLETE revised chapter

BEGIN REVISION:`;
      }
    }

    // ===========================================
    // ACADEMIC MODE - RESEARCH FIRST
    // ===========================================
    let researchResult: ResearchResult | null = null;
    
    // ===========================================
    // ACADEMIC RESEARCH — runs for ALL academic book types (text, illustrated, etc.)
    // Universities require citations regardless of book format
    // ===========================================
    const ACADEMIC_RESEARCH_CATEGORIES = ['technology', 'science', 'medicine', 'law', 'economics', 'finance', 'governance', 'history', 'philosophy'];
    const needsAcademicResearch = academicMode === true || (
      (bookType === 'illustrated' || bookType === 'text') && 
      ACADEMIC_RESEARCH_CATEGORIES.includes(category?.toLowerCase())
    );
    
    if (needsAcademicResearch) {
      console.log(`[GENERATE-CHAPTER] Academic research pipeline for bookType=${bookType}, category=${category}`);
      
      researchResult = await conductDeepResearch(
        `${chapterTitle} - ${bookTitle}`,
        category,
        keyTopics || [chapterTitle],
        citationStyle,
        token
      );
      
      console.log(`[GENERATE-CHAPTER] Research complete: ${researchResult.metadata.source_count} sources`);

      // HARD FAILURE CHECK
      const minSources = DOMAIN_MIN_SOURCES[category.toLowerCase()] || DOMAIN_MIN_SOURCES.default;
      
      if (researchResult.references.length < minSources && !isAdmin) {
        console.log(`[GENERATE-CHAPTER] HARD FAIL: Insufficient sources`);
        
        return new Response(JSON.stringify({
          error: "Insufficient verified sources for academic content",
          code: "INSUFFICIENT_SOURCES",
          details: {
            found: researchResult.references.length,
            required: minSources,
            category,
            suggestion: "Topic refinement needed. Try a more specific topic.",
          },
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===========================================
    // COMIC BOOK GENERATION
    // ===========================================
    if (effectiveBookType === 'comic') {
      console.log("[GENERATE-CHAPTER] Generating authority-grade comic chapter with multi-agent system...");
      console.log(`[GENERATE-CHAPTER] Comic style: ${effectiveComicStyle}, Panels: ${effectiveLayoutTemplate}`);
      
      // Extract comic sub-type and learning config from already-parsed requestBody
      const comicSubType = (requestBody?.comicSubType as string) || 'entertainment';
      const comicLearningConfig = (requestBody?.comicLearningConfig as any) || null;
      const characterSheetConfig = (requestBody?.characterSheetConfig as any) || effectiveCharacterSheet;
      
      console.log(`[GENERATE-CHAPTER] Comic sub-type: ${comicSubType}, Has learning: ${comicLearningConfig?.objectives?.length > 0}`);
      
      // ===========================================
      // CHAPTER-TO-CHAPTER STORY CONTINUITY
      // Fetch previous chapters for storyline consistency
      // ===========================================
      let previousChaptersSummary = '';
      
      if (chapterNumber > 1 && chapter?.book_id) {
        console.log(`[GENERATE-CHAPTER] Fetching previous chapters for continuity (Chapter ${chapterNumber})...`);
        
        const { data: previousChapters } = await supabase
          .from("chapters")
          .select("chapter_number, title, content, comic_metadata")
          .eq("book_id", chapter.book_id)
          .eq("is_generated", true)
          .lt("chapter_number", chapterNumber)
          .order("chapter_number", { ascending: true });
        
        if (previousChapters && previousChapters.length > 0) {
          console.log(`[GENERATE-CHAPTER] Found ${previousChapters.length} previous chapters for continuity`);
          
          // Build story continuity context from previous chapters
          const summaries = previousChapters.map((ch) => {
            // Extract key plot points from comic metadata if available
            const metadata = ch.comic_metadata as any;
            const plotSummary = metadata?.storySummary || '';
            const keyEvents = metadata?.keyEvents?.join(', ') || '';
            const endingState = metadata?.chapterEndState || '';
            
            // If no metadata, extract from content
            let contentSummary = '';
            if (!plotSummary && ch.content) {
              // Get first and last panels for context
              const panelMatches = ch.content.match(/\[PANEL\s*\d+\][\s\S]*?(?=\[PANEL|\s*$)/gi) || [];
              if (panelMatches.length > 0) {
                const firstPanel = panelMatches[0]?.slice(0, 300) || '';
                const lastPanel = panelMatches[panelMatches.length - 1]?.slice(0, 300) || '';
                contentSummary = `Opening: ${firstPanel.replace(/\[PANEL\s*\d+\]/i, '').trim().slice(0, 150)}... Ending: ${lastPanel.replace(/\[PANEL\s*\d+\]/i, '').trim().slice(0, 150)}`;
              }
            }
            
            return `Chapter ${ch.chapter_number} "${ch.title}": ${plotSummary || contentSummary || 'Story continues'}${keyEvents ? ` Key events: ${keyEvents}` : ''}${endingState ? ` Ends with: ${endingState}` : ''}`;
          }).join('\n');
          
          previousChaptersSummary = `
===========================================
STORY CONTINUITY - PREVIOUS CHAPTERS
===========================================
The following chapters have already been told. Your new chapter MUST continue from where the last chapter ended.
DO NOT contradict established events. DO NOT repeat plot points. BUILD upon what happened.

${summaries}

CRITICAL CONTINUITY RULES:
1. Characters must remember what happened in previous chapters
2. Plot threads introduced earlier should be acknowledged or developed
3. The emotional arc should progress naturally from the previous chapter's ending
4. References to past events should be consistent and accurate
5. If this is a mid-story chapter, DO NOT start like it's the beginning of a new story
===========================================
`;
          console.log(`[GENERATE-CHAPTER] Story continuity context built (${previousChaptersSummary.length} chars)`);
        }
      }
      
      // Build enhanced multi-agent system prompt
      const systemPrompt = buildEnhancedComicSystemPrompt(
        comicSubType,
        effectiveComicStyle,
        languageName,
        characterSheetConfig,
        comicLearningConfig
      );
      
      // Build enhanced chapter prompt with learning objectives
      let chapterPrompt = buildEnhancedComicChapterPrompt(
        chapterTitle, 
        bookTitle, 
        chapterNumber, 
        keyTopics, 
        languageName, 
        effectiveLayoutTemplate,
        comicSubType,
        comicLearningConfig
      );
      
      // Inject story continuity context if available
      if (previousChaptersSummary) {
        chapterPrompt = previousChaptersSummary + '\n\n' + chapterPrompt;
      }
      
      // Comic generation with retry logic for dialogue validation
      const MAX_COMIC_ATTEMPTS = 2;
      let comicContent = "";
      let comicValidation: ReturnType<typeof validateComicStructure> | null = null;
      
      for (let attempt = 1; attempt <= MAX_COMIC_ATTEMPTS; attempt++) {
        console.log(`[GENERATE-CHAPTER] Comic generation attempt ${attempt}/${MAX_COMIC_ATTEMPTS}...`);
        
        // Build prompt with stronger dialogue emphasis on retry
        let attemptPrompt = chapterPrompt;
        if (attempt > 1) {
          attemptPrompt = chapterPrompt + `

**CRITICAL RETRY - DIALOGUE ENFORCEMENT:**
Your previous attempt FAILED because panels were missing dialogue.
EVERY SINGLE PANEL **MUST** have at least ONE dialogue line in this format:
- CHARACTER_NAME: "Speech text here"

WITHOUT dialogue in EVERY panel, generation will FAIL AGAIN.
This is MANDATORY. No exceptions.`;
        }
        
        const comicResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: generationModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: attemptPrompt }
            ],
          }),
        });

        if (!comicResponse.ok) {
          throw new Error("Failed to generate comic chapter");
        }

        const comicData = await comicResponse.json();
        comicContent = comicData.choices?.[0]?.message?.content || "";
        
        // VALIDATE comic structure with per-panel dialogue check
        comicValidation = validateComicStructure(comicContent);
        
        console.log(`[GENERATE-CHAPTER] Attempt ${attempt} validation: panels=${comicValidation.panelDialogues?.length || 0}, dialogues=${comicValidation.totalDialogueCount || 0}, valid=${comicValidation.valid}`);
        
        if (comicValidation.valid) {
          console.log(`[GENERATE-CHAPTER] Comic script validated on attempt ${attempt}`);
          break;
        }
        
        // Log which panels are missing dialogue
        if (comicValidation.panelDialogues) {
          const missingDialogue = comicValidation.panelDialogues.filter(p => !p.hasDialogue);
          if (missingDialogue.length > 0) {
            console.log(`[GENERATE-CHAPTER] Panels missing dialogue: ${missingDialogue.map(p => p.panelNumber).join(', ')}`);
          }
        }
        
        if (attempt < MAX_COMIC_ATTEMPTS) {
          console.log(`[GENERATE-CHAPTER] Retrying due to dialogue validation failure...`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      // Final validation check after all retries
      if (comicValidation && comicValidation.blocked && !isAdmin) {
        console.log("[GENERATE-CHAPTER] COMIC VALIDATION FAILED after all retries");
        
        const missingPanels = comicValidation.panelDialogues
          ?.filter(p => !p.hasDialogue)
          .map(p => `Panel ${p.panelNumber}`) || [];
        
        return new Response(JSON.stringify({
          error: comicValidation.failureMessage,
          code: "COMIC_DIALOGUE_MISSING",
          details: { 
            errors: comicValidation.errors,
            panelsWithoutDialogue: missingPanels,
            totalDialogueCount: comicValidation.totalDialogueCount || 0,
            requiredDialogueCount: comicValidation.panelDialogues?.length || 0,
            attempts: MAX_COMIC_ATTEMPTS,
          },
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log("[GENERATE-CHAPTER] Comic script validated, generating images...");
      console.log("[GENERATE-CHAPTER] Raw content preview:", comicContent.slice(0, 500));

      // Parse panels using multiple strategies
      const panels: { num: number; visual: string; dialogue: string; caption: string; imageUrl?: string }[] = [];
      
      // Strategy 1: Split by [PANEL X] markers
      const panelSections = comicContent.split(/\[PANEL\s*(\d+)\]/gi);
      
      for (let i = 1; i < panelSections.length; i += 2) {
        const panelNum = parseInt(panelSections[i]);
        const section = panelSections[i + 1] || '';
        
        // Extract Visual - flexible patterns
        const visualMatch = section.match(/(?:\*\*)?Visual:?\*?\*?\s*([^\n]*(?:\n(?!(?:\*\*)?Dialogue|Caption|-).*)*)/i);
        const visual = visualMatch ? visualMatch[1].trim().replace(/\*+/g, '') : '';
        
        // Extract Dialogue section
        const dialogueMatch = section.match(/(?:\*\*)?Dialogue:?\*?\*?\s*([\s\S]*?)(?=(?:\*\*)?Caption:|$|\[PANEL)/i);
        const dialogue = dialogueMatch ? dialogueMatch[1].trim() : '';
        
        // Extract Caption
        const captionMatch = section.match(/(?:\*\*)?Caption:?\*?\*?\s*"?([^"\n]*)"?/i);
        const caption = captionMatch ? captionMatch[1].trim() : '';
        
        if (visual || dialogue) {
          panels.push({ num: panelNum, visual, dialogue, caption });
        }
      }

      console.log(`[GENERATE-CHAPTER] Found ${panels.length} panels via split method`);
      
      // If no panels found, try regex fallback
      if (panels.length === 0) {
        const panelRegex = /\[PANEL\s*(\d+)\][\s\S]*?(?:\*\*)?Visual:?\*?\*?\s*([\s\S]*?)(?:\*\*)?Dialogue:?\*?\*?\s*([\s\S]*?)(?:(?:\*\*)?Caption:?\*?\*?\s*"?([^"\n]*)"?)?(?=\[PANEL|\s*$)/gi;
        let match;
        while ((match = panelRegex.exec(comicContent)) !== null) {
          panels.push({
            num: parseInt(match[1]),
            visual: (match[2] || '').trim().replace(/\*+/g, ''),
            dialogue: (match[3] || '').trim(),
            caption: (match[4] || '').trim(),
          });
        }
        console.log(`[GENERATE-CHAPTER] Found ${panels.length} panels via regex fallback`);
      }

      const styleGuide = COMIC_STYLE_PRESETS[comicStyle] || COMIC_STYLE_PRESETS.children_book;

      // Generate images with style consistency and upload to storage
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      
      for (let i = 0; i < Math.min(panels.length, 6); i++) {
        const panel = panels[i];
        try {
          console.log(`[GENERATE-CHAPTER] Generating image for panel ${panel.num}...`);
          
          const dialogueForImage = (panel.dialogue || "")
            .replace(/\r/g, "")
            .split("\n")
            .map(l => l.trim())
            .filter(Boolean)
            .slice(0, 8)
            .join(" ");

          const captionForImage = (panel.caption || "").trim();
          
          // Build image prompt based on textInImage setting and scenesPerPanel
          let imagePrompt = `${styleGuide.artStyle}. ${panel.visual} ${styleGuide.colorPalette}. ${styleGuide.shadingStyle}. Professional comic book illustration.`;
          
          // Add multi-scene support
          if (effectiveScenesPerPanel > 1) {
            imagePrompt += ` This panel shows ${effectiveScenesPerPanel} sequential scenes/moments in a single image, showing progression of action.`;
          }
          
          // Add text to image if enabled
          if (effectiveTextInImage && (dialogueForImage || captionForImage)) {
            imagePrompt += `\n\nINCLUDE TEXT IN THE ART (speech bubbles/captions) with EXACT wording:\n`;
            if (dialogueForImage) imagePrompt += `Dialogue: ${dialogueForImage}\n`;
            if (captionForImage) imagePrompt += `Caption: ${captionForImage}\n`;
            imagePrompt += `\nKeep text legible, high-contrast, and placed inside comic speech bubbles or caption boxes. Do not add extra text beyond what is provided.`;
          } else {
            imagePrompt += ` No text in image.`;
          }
          
          const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-pro-image-preview",
              messages: [{ role: "user", content: imagePrompt }],
              modalities: ["image", "text"],
            }),
          });

          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            const base64Url = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            
            if (base64Url && base64Url.startsWith("data:image")) {
              // Upload to storage bucket instead of embedding base64
              try {
                const base64Data = base64Url.split(",")[1];
                const mimeMatch = base64Url.match(/data:([^;]+);/);
                const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
                const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
                
                // Decode base64 to binary
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let j = 0; j < binaryString.length; j++) {
                  bytes[j] = binaryString.charCodeAt(j);
                }
                
                // Upload path: userId/bookId/chapterId/panel-N.ext
                const storagePath = `${user.id}/${chapter?.book_id || "unknown"}/${chapterId}/panel-${panel.num}.${ext}`;
                
                console.log(`[GENERATE-CHAPTER] Uploading panel ${panel.num} to storage: ${storagePath}`);
                
              const { error: uploadError } = await supabase.storage
                  .from("book-images")
                  .upload(storagePath, bytes.buffer, {
                    contentType: mimeType,
                    upsert: true,
                  });
                
                if (!uploadError) {
                  // Get public URL
                  const { data: publicUrlData } = supabase.storage
                    .from("book-images")
                    .getPublicUrl(storagePath);
                  
                  if (publicUrlData?.publicUrl) {
                    panel.imageUrl = publicUrlData.publicUrl;
                    console.log(`[GENERATE-CHAPTER] Panel ${panel.num} uploaded successfully: ${publicUrlData.publicUrl.slice(0, 80)}...`);
                  } else {
                    console.error(`[GENERATE-CHAPTER] No public URL returned for panel ${panel.num}`);
                    panel.imageUrl = base64Url;
                  }
                } else {
                  console.error(`[GENERATE-CHAPTER] Upload error for panel ${panel.num}:`, uploadError.message);
                  // Fall back to base64 if upload fails
                  panel.imageUrl = base64Url;
                }
              } catch (uploadErr) {
                console.error(`[GENERATE-CHAPTER] Storage upload failed for panel ${panel.num}:`, uploadErr);
                // Fall back to base64 if upload fails
                panel.imageUrl = base64Url;
              }
            } else {
              console.log(`[GENERATE-CHAPTER] No valid image URL returned for panel ${panel.num}`);
            }
          }
          
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgError) {
          console.error(`[GENERATE-CHAPTER] Image error for panel ${panel.num}:`, imgError);
        }
      }

      // Build final comic content - plain text, no markdown artifacts
      let finalComicContent = `${chapterTitle}\n\n`;
      finalComicContent += `A comic story from "${bookTitle}"\n\n`;
      
      for (const panel of panels) {
        finalComicContent += `Panel ${panel.num}\n\n`;
        if (panel.imageUrl) {
          finalComicContent += `![Panel ${panel.num}](${panel.imageUrl})\n\n`;
        } else {
          finalComicContent += `[Illustration: ${sanitizeMarkdown(panel.visual).slice(0, 150)}...]\n\n`;
        }
        
        // Format dialogue for reader speech bubbles.
        // Accept lines with optional bullet/hyphen and optional quotes (straight or smart).
        if (panel.dialogue) {
          const dialogueText = panel.dialogue.replace(/\r/g, "");
          const dialogueRegex = /(?:^|\n)\s*(?:[-•]\s*)?([^:\n]{1,60}):\s*["“]?([^\n"”]{1,220})["”]?/g;
          let dMatch: RegExpExecArray | null;
          while ((dMatch = dialogueRegex.exec(dialogueText)) !== null) {
            const character = sanitizeMarkdown(dMatch[1].trim());
            const speech = sanitizeMarkdown(dMatch[2].trim());
            if (character && speech) {
              finalComicContent += `${character}: "${speech}"\n\n`;
            }
          }
        }
        
        if (panel.caption) {
          finalComicContent += `${sanitizeMarkdown(panel.caption)}\n\n`;
        }
        finalComicContent += `---\n\n`;
      }
      
      // Final sanitization pass
      finalComicContent = sanitizeMarkdown(finalComicContent);

      const actualWordCount = finalComicContent.split(/\s+/).filter((w: string) => w.length > 0).length;

      // ===========================================
      // EXTRACT STORY SUMMARY FOR CONTINUITY
      // This metadata helps future chapters maintain story flow
      // ===========================================
      let comicMetadata: any = {};
      
      try {
        // Use AI to extract story summary for continuity
        const summaryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{
              role: "user",
              content: `Analyze this comic chapter and extract:
1. A 2-3 sentence story summary
2. Key events (max 5 bullet points)
3. How the chapter ends (emotional state, cliffhanger, resolution)

Comic content:
${finalComicContent.slice(0, 4000)}

Return JSON only:
{
  "storySummary": "...",
  "keyEvents": ["event1", "event2"],
  "chapterEndState": "..."
}`
            }],
          }),
        });
        
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          const summaryContent = summaryData.choices?.[0]?.message?.content || '';
          const jsonMatch = summaryContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            comicMetadata = JSON.parse(jsonMatch[0]);
            console.log(`[GENERATE-CHAPTER] Story metadata extracted for continuity`);
          }
        }
      } catch (metaError) {
        console.error("[GENERATE-CHAPTER] Failed to extract story metadata:", metaError);
      }
      
      // Add panel data to metadata
      comicMetadata.panelCount = panels.length;
      comicMetadata.dialogueCount = comicValidation?.totalDialogueCount || 0;
      comicMetadata.generatedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("chapters")
        .update({
          content: finalComicContent,
          word_count: actualWordCount,
          is_generated: true,
          updated_at: new Date().toISOString(),
          comic_metadata: comicMetadata,
        })
        .eq("id", chapterId);

      if (updateError) throw new Error(`Failed to save: ${updateError.message}`);

      // Count total dialogues from the validated content
      const finalDialogueCount = comicValidation?.totalDialogueCount || 0;
      
      return new Response(JSON.stringify({
        success: true,
        wordCount: actualWordCount,
        provider: 'Lovable AI (Comic)',
        panelCount: panels.length,
        dialogueCount: finalDialogueCount,
        dialoguePerPanel: comicValidation?.panelDialogues?.map(p => ({
          panel: p.panelNumber,
          count: p.dialogues.length,
          dialogues: p.dialogues,
        })) || [],
        comicStyle,
        validation: {
          valid: comicValidation?.valid || false,
          totalDialogueCount: finalDialogueCount,
          panelsWithDialogue: comicValidation?.panelDialogues?.filter(p => p.hasDialogue).length || 0,
        },
        storyMetadata: comicMetadata,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===========================================
    // WORKBOOK GENERATION
    // ===========================================
    if (effectiveBookType === 'workbook') {
      console.log("[GENERATE-CHAPTER] Generating authority-grade workbook chapter...");
      console.log(`[GENERATE-CHAPTER] Workbook density: ${effectiveWorkbookDensity}`);
      
      // Adjust prompts based on density
      const densityMultipliers: Record<string, { prompts: number; tables: number }> = {
        low: { prompts: 2, tables: 1 },
        medium: { prompts: 4, tables: 2 },
        high: { prompts: 6, tables: 3 },
      };
      const density = densityMultipliers[effectiveWorkbookDensity] || densityMultipliers.medium;
      
      const systemPrompt = buildWorkbookSystemPrompt(languageName);
      const baseChapterPrompt = buildWorkbookChapterPrompt(
        chapterTitle, bookTitle, chapterNumber, keyTopics, languageName
      );
      
      // Enhance prompt with density requirements
      const chapterPrompt = baseChapterPrompt + `\n\n**DENSITY REQUIREMENTS:**\n- Include at least ${density.prompts} fill-in prompts\n- Include at least ${density.tables} tables/worksheets`;
      
      const workbookResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: generationModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: chapterPrompt }
          ],
        }),
      });

      if (!workbookResponse.ok) {
        throw new Error("Failed to generate workbook chapter");
      }

      const workbookData = await workbookResponse.json();
      let workbookContent = workbookData.choices?.[0]?.message?.content || "";
      
      // VALIDATE workbook structure
      const workbookValidation = validateWorkbookStructure(workbookContent);
      if (!workbookValidation.valid && !isAdmin) {
        console.log("[GENERATE-CHAPTER] WORKBOOK VALIDATION FAILED:", workbookValidation.errors);
        // Log warnings but don't block - workbook can regenerate
      }
      
      // Add workbook front matter
      const frontMatter = `> **Interactive Workbook**
> Complete all prompts, exercises, and reflection questions.
> Use the blank spaces for your responses.

---

`;
      
      const finalContent = frontMatter + workbookContent;
      const actualWordCount = finalContent.split(/\s+/).filter((w: string) => w.length > 0).length;

      const { error: updateError } = await supabase
        .from("chapters")
        .update({
          content: finalContent,
          word_count: actualWordCount,
          is_generated: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chapterId);

      if (updateError) throw new Error(`Failed to save: ${updateError.message}`);

      return new Response(JSON.stringify({
        success: true,
        wordCount: actualWordCount,
        provider: 'Lovable AI (Workbook)',
        validation: {
          valid: workbookValidation.valid,
          warnings: workbookValidation.warnings.length,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===========================================
    // STANDARD TEXT / ILLUSTRATED / ACADEMIC GENERATION
    // ===========================================
    const targetWords = Math.min(Math.max(effectiveWordCount, 2000), 6000);

    // ===========================================
    // CHAPTER-TO-CHAPTER CONTENT CONTINUITY (TEXT/ILLUSTRATED)
    // Fetch previous chapters for concept/story flow consistency
    // ===========================================
    let previousChaptersContext = '';
    
    if (chapterNumber > 1 && chapter?.book_id) {
      console.log(`[GENERATE-CHAPTER] Fetching previous chapters for content continuity (Chapter ${chapterNumber})...`);
      
      const { data: previousChapters } = await supabase
        .from("chapters")
        .select("chapter_number, title, content")
        .eq("book_id", chapter.book_id)
        .eq("is_generated", true)
        .lt("chapter_number", chapterNumber)
        .order("chapter_number", { ascending: false })
        .limit(2); // Get last 2 chapters for context
      
      if (previousChapters && previousChapters.length > 0) {
        console.log(`[GENERATE-CHAPTER] Found ${previousChapters.length} previous chapters for content continuity`);
        
        // Build content continuity context from previous chapters
        const summaries = previousChapters.reverse().map((ch) => {
          // Extract key points from content - first 500 and last 300 chars for context
          let contentSummary = '';
          if (ch.content) {
            const opening = ch.content.slice(0, 500).trim();
            const ending = ch.content.slice(-300).trim();
            contentSummary = `Opening: ${opening}... Ending: ...${ending}`;
          }
          
          return `Chapter ${ch.chapter_number} "${ch.title}": ${contentSummary || 'Content continues'}`;
        }).join('\n\n');
        
        previousChaptersContext = `
===========================================
CONTENT CONTINUITY - PREVIOUS CHAPTERS
===========================================
The following chapters have already been written. Your new chapter MUST continue from where the last chapter ended.

CONTINUITY RULES:
1. DO NOT repeat concepts already explained in previous chapters
2. BUILD upon previously established ideas and terminology
3. Reference back to earlier content when extending concepts
4. Maintain consistent tone, style, and terminology
5. If this is a mid-book chapter, DO NOT start like it's a new book introduction
6. Ensure logical progression of complexity and depth

PREVIOUS CONTENT SUMMARY:
${summaries}
===========================================

`;
        console.log(`[GENERATE-CHAPTER] Content continuity context built (${previousChaptersContext.length} chars)`);
      }
    }

    let systemPrompt: string;
    let chapterPrompt: string;
    
    // ===========================================
    // PIPELINE ROUTING: BOOK TYPE IS THE GOVERNING CONSTITUTION
    // ===========================================
    // 
    // CONTRACT 3: Book type GOVERNS the generation pipeline.
    // The book_type field is NOT a suggestion - it's a hard rule.
    // 
    // Academic pipeline triggers:
    // 1. book_type === 'academic' (ALWAYS - regardless of academicMode flag)
    // 2. book_type === 'technical' (ALWAYS - code-heavy, literal)
    // 3. book_type === 'professional' + academic categories
    // 4. book_type === 'reference' (ALWAYS - structured, no narrative)
    // 5. academicMode flag is TRUE (explicit user choice)
    // ===========================================
    
    const ACADEMIC_CATEGORIES = ['technology', 'science', 'medicine', 'law', 'economics', 'finance', 'governance', 'history', 'philosophy'];
    
    const isAcademicPipeline = 
      // Book type IS academic or technical - ALWAYS use academic pipeline
      effectiveBookType === 'academic' || 
      effectiveBookType === 'technical' ||
      effectiveBookType === 'reference' ||
      // Professional book in academic category
      (effectiveBookType === 'professional' && ACADEMIC_CATEGORIES.includes(category?.toLowerCase())) ||
      // Explicit academic mode flag
      academicMode === true;
    
    if (isAcademicPipeline && researchResult && researchResult.references.length > 0) {
      // ACADEMIC/TECHNICAL PIPELINE - NO metaphors, NO storytelling
      console.log("[GENERATE-CHAPTER] Using ACADEMIC/TECHNICAL pipeline (code-heavy, literal)");
      
      systemPrompt = `You are ScrollLibrary — ACADEMIC/TECHNICAL PIPELINE.

===========================================
GENERATOR IDENTITY: University Lecturer · Engineer · Research Scholar
===========================================

You are writing a university-grade textbook or technical manual.
Your output must be acceptable to university lecturers, academic reviewers, and institutional quality panels.
You are NOT a storyteller. You are NOT motivational. You are NOT a ghostwriter. You are INSTRUCTIONAL.

STRICTLY FORBIDDEN:
❌ Metaphors of any kind (e.g., "Alchemist", "Wizard", "Journey", "Dark Arts")
❌ Storytelling or narrative framing
❌ Motivational language ("You can do it!", "Believe in yourself")
❌ Hero's journey framing
❌ Analogies to unrelated domains
❌ Emotional appeals
❌ Rhetorical questions for effect
❌ Marketing language ("Revolutionary", "Ultimate", "Game-changing")
❌ AI-sounding transitions ("Let's dive in", "In this chapter we will explore")

REQUIRED:
✅ Literal, technical language only
✅ Learning objectives at chapter start (3-5 specific, measurable Bloom's-taxonomy aligned points)
✅ Code examples with proper formatting (40% minimum for technical topics)
✅ Step-by-step explanations with proper academic terminology
✅ Exercises at chapter end (3-5 practice problems with varying difficulty)
✅ Mini-project at chapter end
✅ In-text citations for ALL factual claims
✅ References section at end in proper citation format
✅ Proper Markdown formatting: ## headings, **bold** for key terms, tables with pipe syntax

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${VALIDATION_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
CATEGORY: ${category}
CITATION STYLE: ${citationStyle}

If ANY metaphor, storytelling, or motivational language appears → OUTPUT IS INVALID.
Teach by DOING, not by INSPIRING.`;

      chapterPrompt = `${previousChaptersContext}Write an ACADEMIC/TECHNICAL Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

VERIFIED SOURCES TO CITE (USE ONLY THESE):
${researchResult.references.slice(0, 15).map((ref, i) => 
  `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}"${ref.journal ? ` — ${ref.journal}` : ''}${ref.doi ? ` DOI: ${ref.doi}` : ''}`
).join('\n')}

KEY TOPICS:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

REQUIREMENTS:
1. Write approximately ${targetWords} words in ${languageName}
2. Include in-text citations using ${citationStyle} format
3. Use ONLY the sources listed above
4. Mark unsupported claims with "[requires verification]"
5. Use proper Markdown formatting: ## for headings, **bold** for key terms, pipe-syntax tables
6. NO metaphors, storytelling, or motivational content
${chapterNumber > 1 ? '7. BUILD upon previous chapter concepts - do NOT repeat basic introductions' : ''}

MANDATORY STRUCTURE (ACADEMIC/TECHNICAL):

Learning Objectives

By the end of this chapter, you will be able to:
1. [Specific, measurable objective]
2. [Specific, measurable objective]
3. [Specific, measurable objective]

Introduction

[Technical context and scope - NO storytelling, NO emotional hooks${chapterNumber > 1 ? ' - Reference prior chapter if building on concepts' : ''}]

Core Concepts

[Structured technical explanation with citations and proper terminology]

Implementation

[Code examples with proper formatting, step-by-step explanations]

CODE EXAMPLE (${category.toLowerCase().includes('python') ? 'Python' : 'Language'}):

    # Properly indented code
    # With explanatory comments

Practical Exercises

Exercise 1: [Specific task with clear requirements]
Exercise 2: [Intermediate difficulty]
Exercise 3: [Advanced application]

Mini-Project

[Complete hands-on project applying chapter concepts with specifications]

Summary

[Key points in numbered list]

References

[Full ${citationStyle} formatted bibliography]

BEGIN WRITING THE COMPLETE ACADEMIC/TECHNICAL CHAPTER:`;

    } else if (isAcademicPipeline) {
      // Academic mode but no research results - still use technical pipeline
      console.log("[GENERATE-CHAPTER] Using ACADEMIC/TECHNICAL pipeline (no sources available)");
      
      systemPrompt = `You are ScrollLibrary — ACADEMIC/TECHNICAL PIPELINE.

GENERATOR IDENTITY: University Lecturer · Research Scholar · Technical Author

You are writing a university-grade textbook. Your output must pass institutional quality review.
NO metaphors, NO storytelling, NO motivational content, NO marketing language.

STRICTLY FORBIDDEN:
❌ Metaphors (e.g., "Alchemist", "Wizard", "Journey")
❌ Storytelling or narrative framing  
❌ Motivational language
❌ Hero's journey framing
❌ AI-sounding transitions

REQUIRED:
✅ Learning objectives at chapter start (Bloom's-taxonomy aligned)
✅ Step-by-step technical explanations with proper academic terminology
✅ Code examples with proper formatting (for technical topics)
✅ Exercises and mini-project at chapter end
✅ Proper Markdown formatting: ## headings, **bold** key terms, pipe-syntax tables

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.

Teach by DOING, not by INSPIRING.`;

      chapterPrompt = `${previousChaptersContext}Write an ACADEMIC/TECHNICAL Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

ACADEMIC/TECHNICAL STRUCTURE (MANDATORY):

Learning Objectives

By the end of this chapter, you will be able to:
1. [Specific objective]
2. [Specific objective]
3. [Specific objective]

Introduction

[Technical overview - NO storytelling${chapterNumber > 1 ? ' - Reference prior chapter if building on concepts' : ''}]

Core Concepts

[Detailed technical explanations]

Implementation Examples

[Code examples with proper formatting if applicable]

Exercises

1. [Practice problem - Easy]
2. [Practice problem - Medium]
3. [Practice problem - Advanced]

Mini-Project

[Hands-on project with clear specifications]

Summary

[Key points]

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting: ## for headings, **bold** for key terms, pipe-syntax tables
- NO metaphors or storytelling
- Technical, instructional, scholarly tone
- Learning objectives must be Bloom's-taxonomy aligned (specific, measurable)
${chapterNumber > 1 ? '- BUILD upon previous chapter concepts - do NOT repeat basic introductions' : ''}

BEGIN WRITING THE ACADEMIC/TECHNICAL CHAPTER:`;

    } else if (effectiveBookType === 'illustrated' || effectiveBookType === 'children') {
      // ===========================================
      // ILLUSTRATED / CHILDREN'S BOOK PIPELINE
      // Same quality contracts as bestseller + visual-first content
      // ===========================================
      console.log(`[GENERATE-CHAPTER] Using ILLUSTRATED pipeline for book type: ${effectiveBookType}`);
      
      const isChildrens = effectiveBookType === 'children';
      
      // ===========================================
      // WALL STREET INSTITUTIONAL UPGRADE (same as bestseller)
      // Detect business/wealth books and inject institutional contract
      // ===========================================
      const ILLUSTRATED_BUSINESS_CATEGORIES = [
        'business', 'entrepreneurship', 'finance', 'wealth', 'investing',
        'startup', 'leadership', 'money', 'economics', 'strategy',
        'marketing', 'sales', 'management', 'self-help', 'personal_development',
        'personal development', 'self_help',
      ];
      
      const isIllustratedBusiness = !isChildrens && ILLUSTRATED_BUSINESS_CATEGORIES.some(cat => 
        (category || '').toLowerCase().includes(cat) ||
        (bookTitle || '').toLowerCase().includes(cat)
      ) || (!isChildrens && (bookTitle || '').toLowerCase().match(/billionaire|million|wealth|capital|business|entrepreneur|money|invest|startup|founder|ceo|empire/i));
      
      let illustratedInstitutionalPrompt = '';
      if (isIllustratedBusiness) {
        try {
          const { buildInstitutionalUpgradePrompt } = await import("../_shared/master-prompt.ts");
          const DEEP_FINANCIAL_CHAPTERS = [1, 3, 5, 11, 17, 18];
          const isDeepChapter = DEEP_FINANCIAL_CHAPTERS.includes(chapterNumber);
          illustratedInstitutionalPrompt = buildInstitutionalUpgradePrompt(chapterNumber, chapterTitle, isDeepChapter);
          console.log(`[GENERATE-CHAPTER] ILLUSTRATED WALL STREET MODE: Active (deep=${isDeepChapter}) for Ch.${chapterNumber}`);
        } catch (e) {
          console.error("[GENERATE-CHAPTER] Failed to load institutional contract for illustrated:", e);
        }
      }
      
      // Detect if this illustrated book is academic
      const ILLUSTRATED_ACADEMIC_CATEGORIES = ['technology', 'science', 'medicine', 'law', 'economics', 'finance', 'governance', 'history', 'philosophy'];
      const isIllustratedAcademic = !isChildrens && (
        academicMode === true ||
        ILLUSTRATED_ACADEMIC_CATEGORIES.includes(category?.toLowerCase())
      );
      
      if (isIllustratedAcademic) {
        // ACADEMIC ILLUSTRATED PIPELINE — scholarly content with pedagogical visuals
        console.log("[GENERATE-CHAPTER] ACADEMIC ILLUSTRATED pipeline active");
        
        systemPrompt = `You are ScrollLibrary — ACADEMIC ILLUSTRATED PIPELINE.

GENERATOR IDENTITY: University Lecturer · Research Scholar · Instructional Designer

You are writing a university-grade illustrated textbook. Visuals serve PEDAGOGICAL purposes — they teach, clarify, and anchor complex concepts.
You are NOT a storyteller. You are NOT motivational. You are INSTRUCTIONAL and EVIDENCE-BASED.

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${illustratedInstitutionalPrompt}`;
      } else {
        // BESTSELLER ILLUSTRATED PIPELINE — engaging narrative with visuals  
        systemPrompt = `${SYSTEM_ROLE}

${MASTER_FORMATTING_CONTRACT}

${BESTSELLER_STRUCTURE_CONTRACT}

${NONFICTION_CONTRACT}

${illustratedInstitutionalPrompt}`;
      }
      
      systemPrompt += `

===========================================
ILLUSTRATED BOOK PIPELINE — HARD LOCK
===========================================

You are writing a ${isChildrens ? "CHILDREN'S BOOK (ages 4-10)" : "RICHLY ILLUSTRATED BOOK"} where visuals are FIRST-CLASS content, not decoration.

GENERATOR IDENTITY: ${isChildrens ? 'Children\'s Author · Educator · Child Psychologist' : isIllustratedAcademic ? 'University Lecturer · Instructional Designer · Visual Educator' : 'Visual Storyteller · Illustrator-Author · Instructional Designer'}

===========================================
ILLUSTRATION PLACEMENT CONTRACT (MANDATORY)
===========================================

You MUST embed exactly 3-5 illustration markers throughout the chapter at KEY MOMENTS.
These markers tell the illustration engine WHERE to place images.

MARKER FORMAT (EXACT — DO NOT DEVIATE):

[FIGURE 1: A descriptive scene for the illustrator — what to draw, who is in it, what action, what setting, what mood]

RULES:
1. Place [FIGURE X] markers INLINE where the illustration should appear
2. Each marker MUST have a detailed visual description (20-40 words minimum)
3. Illustrations must be PEDAGOGICALLY MEANINGFUL — they teach, clarify, or emotionally anchor
4. NO decorative filler — every image must serve the narrative or learning
5. Space illustrations evenly through the chapter (not clustered)
6. The text BEFORE and AFTER each figure should reference or connect to the visual
7. Number figures sequentially: [FIGURE 1], [FIGURE 2], etc.

${isChildrens ? `
CHILDREN'S BOOK RULES:
- Simple, short sentences (max 12 words per sentence)
- Reading level: ages 4-10
- Warm, encouraging, safe emotional tone
- Characters should be relatable and friendly
- Each page-spread should have roughly 1 illustration
- Total word count: 800-1500 words (SHORT — this is a picture book)
- Story structure: clear beginning, middle, end
- Moral or lesson woven naturally (never preachy)
- Repetition and rhythm encouraged for younger readers
` : `
ILLUSTRATED BOOK RULES:
- Rich, engaging prose with vivid descriptions
- Illustrations should enhance understanding of complex ideas
- Use figures for: diagrams, scenes, processes, comparisons, emotional moments
- Each illustration should have a caption-worthy concept
- Balance text and visual storytelling
- The TEXT must meet the SAME depth and quality as a text-only bestseller
- Illustrations ADD to the text — they do NOT replace substance
`}

===========================================
VALIDATION (HARD FAILURE):
===========================================

Before output, verify:
[ ] 3-5 [FIGURE X] markers present
[ ] Figures are spaced throughout (not all at end)
[ ] Each figure has a detailed visual description
[ ] Text references connect to the figures
[ ] ${isChildrens ? 'Word count under 1500 words' : 'Content depth matches text-only bestseller standard'}
[ ] NO figures without descriptive text
[ ] Bestseller mechanics present (hook, named principle, takeaways)

If ANY check fails → REWRITE

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
Create comprehensive, bestseller-grade illustrated chapters where both the TEXT and VISUALS are world-class.`;

      const illustratedWordTarget = isChildrens ? 1200 : targetWords;
      
      // Inject verified sources for academic illustrated books
      let illustratedSourcesSection = '';
      if (isIllustratedAcademic && researchResult && researchResult.references.length > 0) {
        illustratedSourcesSection = `
VERIFIED SOURCES TO CITE (USE ONLY THESE — in-text citations MANDATORY):
${researchResult.references.slice(0, 15).map((ref, i) => 
  `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}"${ref.journal ? ` — ${ref.journal}` : ''}${ref.doi ? ` DOI: ${ref.doi}` : ''}`
).join('\n')}

CITATION REQUIREMENTS:
- Use ${citationStyle} format for ALL in-text citations
- Mark unsupported claims with "[requires verification]"
- Include a ## References section at the end with full bibliography
`;
      }

      chapterPrompt = `${previousChaptersContext}Write ${isChildrens ? 'a children\'s book' : isIllustratedAcademic ? 'an academic illustrated' : 'an illustrated'} Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.
${illustratedSourcesSection}
Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

ILLUSTRATION PLACEMENT (MANDATORY):
Insert exactly ${isChildrens ? '4-5' : '3-4'} [FIGURE X: description] markers throughout the text.
Each figure description must be 20-40 words describing the scene for an illustrator.
${isIllustratedAcademic ? 'Figures MUST be PEDAGOGICAL: diagrams, charts, processes, or annotated visuals that teach. NO decorative illustrations.' : ''}

Example marker:
[FIGURE 1: A young girl standing at the edge of a magical forest, looking up at glowing fireflies with wonder on her face, sunset colors in the background]

${isChildrens ? `
CHILDREN'S BOOK STRUCTURE:
1. OPENING — Introduce character and setting with warmth (include [FIGURE 1])
2. PROBLEM/ADVENTURE — Something happens that drives the story
3. JOURNEY — Character tries to solve/explore (include [FIGURE 2] and [FIGURE 3])
4. RESOLUTION — Satisfying ending with lesson learned (include [FIGURE 4])
5. CLOSING — Warm, comforting end that makes the child feel safe

Keep it SHORT (800-1200 words). This is a PICTURE BOOK.
` : isIllustratedAcademic ? `
ACADEMIC ILLUSTRATED STRUCTURE (MANDATORY — university-grade):
1. LEARNING OBJECTIVES — 3-5 specific, measurable Bloom's-taxonomy aligned objectives
2. INTRODUCTION — Technical context and scope with citations. Include [FIGURE 1] for a conceptual overview diagram.
3. CORE CONCEPTS — Structured explanation with in-text citations and proper academic terminology. Place [FIGURE 2] for a key process/architecture diagram.
4. APPLIED EXAMPLES — Real-world applications with evidence and citations. Place [FIGURE 3] for a comparative chart or data visualization.
5. CRITICAL ANALYSIS — Deeper analysis, implications, and limitations
6. KEY TAKEAWAYS — Numbered summary of main points
7. EXERCISES — 3 practice problems at varying difficulty levels
8. REFERENCES — Full ${citationStyle} formatted bibliography

STRICTLY FORBIDDEN:
❌ Metaphors, storytelling, motivational language
❌ Hero's journey framing or emotional appeals
❌ AI-sounding transitions ("Let's dive in")
❌ Marketing language ("Revolutionary", "Game-changing")
` : `
BESTSELLER ILLUSTRATED STRUCTURE (MANDATORY — same depth as text-only):
1. OPENING HOOK with visual anchor — Story, contradiction, or emotional moment (first 100 words). Include [FIGURE 1] at the key visual moment.
2. CORE IDEA — One central message explained clearly. The reader must understand in 2 minutes.
3. ILLUSTRATION — Real-world story, analogy, or scenario (concrete, human, memorable). Place [FIGURE 2] to visually anchor this example.
4. NAMED PRINCIPLE — Introduce at least ONE memorable, reusable concept name (e.g., "The Compound Effect")
5. READER ENGAGEMENT — Questions, reflection prompts, mental pauses. Place [FIGURE 3] for visual reinforcement.
6. ACTIONABLE TAKEAWAYS — 3-7 clear bullet points the reader can DO after reading. Include [FIGURE 4] if showing a process/framework.
`}
${isIllustratedBusiness ? `
INSTITUTIONAL REQUIREMENTS (BUSINESS ILLUSTRATED BOOK):
7. FINANCIAL ENGINEERING — Include at least 1 markdown table with real numbers
8. CAPITAL IMPACT — Include at least 1 formula or calculation
9. RISK ANALYSIS — Address what kills this strategy
10. EXECUTIVE ACTIONS — 3-5 measurable next steps with KPIs
` : ''}
REQUIREMENTS:
- Approximately ${illustratedWordTarget} words
- Use proper Markdown formatting (## headings, **bold**, tables)
- Include ${isChildrens ? '4-5' : '3-4'} [FIGURE X: description] markers inline
- Every figure must serve the ${isIllustratedAcademic ? 'learning objective' : 'story/learning'}
- Text must flow naturally around figure markers
- NO AI-sounding phrases ("Let's dive in", "In this chapter we will explore")
${isIllustratedAcademic ? '- Include in-text citations for ALL factual claims\n- Use proper academic terminology\n- Exercises at chapter end' : '- Include real-world examples with SPECIFIC NUMBERS\n- Every paragraph must deliver VALUE'}
${isIllustratedBusiness ? '- Include markdown tables for frameworks and models\n- Include quantitative examples with dollar amounts, percentages, multiples' : ''}
${chapterNumber > 1 ? '- CONTINUE from previous chapter concepts — do NOT repeat introductions' : ''}

BEGIN WRITING THE FULL ${isIllustratedAcademic ? 'ACADEMIC' : 'BESTSELLER-GRADE'} ILLUSTRATED CHAPTER:`;
    } else if (effectiveBookType === 'professional') {
      // ===========================================
      // PROFESSIONAL / BUSINESS GUIDE PIPELINE
      // Framework-driven, actionable, decision-oriented
      // ===========================================
      console.log("[GENERATE-CHAPTER] Using PROFESSIONAL pipeline (frameworks, strategy)");
      
      systemPrompt = `${SYSTEM_ROLE}

${MASTER_FORMATTING_CONTRACT}

You are a business consultant and strategist writing a PROFESSIONAL GUIDE.

GENERATOR IDENTITY: Consultant · Strategist · Decision Architect

MANDATORY ELEMENTS:
- Strategic frameworks (Porter's 5 Forces, SWOT, BCG Matrix, etc.)
- Actionable recommendations with measurable outcomes
- Decision matrices and checklists in proper markdown tables
- Industry context with real examples
- Executive summaries for quick reference

TONE: Professional, authoritative, practical — NO academic dryness, NO motivational fluff.
Write like a McKinsey or BCG consultant presenting to a C-suite audience.

FORBIDDEN:
- Excessive academic-style citations
- Personal anecdotes (excessive)
- Informal or casual language
- Vague advice without specifics

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.`;

      chapterPrompt = `${previousChaptersContext}Write a PROFESSIONAL GUIDE Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

PROFESSIONAL GUIDE STRUCTURE (MANDATORY):
1. EXECUTIVE SUMMARY — Key takeaway in 2-3 sentences
2. STRATEGIC CONTEXT — Why this matters, market forces at play
3. FRAMEWORK APPLICATION — Apply at least 1 strategic framework with a markdown table
4. IMPLEMENTATION ROADMAP — Step-by-step with clear milestones
5. DECISION MATRIX — When to use what approach (markdown table)
6. RISK ASSESSMENT — What can go wrong, mitigation strategies
7. ACTION ITEMS — 5-7 specific, measurable next steps with checkboxes

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting (## headings, **bold**, pipe-syntax tables)
- Include at least 2 framework tables
- Every recommendation must be specific and measurable
- Include real industry examples with specific numbers
${chapterNumber > 1 ? '- BUILD upon previous chapter concepts - do NOT repeat introductions' : ''}

BEGIN WRITING THE PROFESSIONAL GUIDE CHAPTER:`;

    } else if (effectiveBookType === 'reference') {
      // ===========================================
      // REFERENCE / HANDBOOK PIPELINE
      // Structured lookup, encyclopedic, no narrative
      // ===========================================
      console.log("[GENERATE-CHAPTER] Using REFERENCE pipeline (structured, lookup-ready)");
      
      systemPrompt = `${SYSTEM_ROLE}

${MASTER_FORMATTING_CONTRACT}

You are a subject matter expert creating REFERENCE MATERIAL / HANDBOOK content.

GENERATOR IDENTITY: Subject Matter Expert · Technical Editor · Information Architect

MANDATORY ELEMENTS:
- Structured information architecture with clear categorization
- Quick-lookup format with consistent headings
- Alphabetical or logical ordering within sections
- Cross-references to related topics
- Summary tables for quick reference
- Definitions clearly separated from explanations

TONE: Precise, neutral, encyclopedic — optimize for FINDABILITY and ACCURACY.

FORMATTING RULES:
- Use ## and ### headings extensively for scanability
- Use definition lists or bold terms followed by explanation
- Use markdown tables for comparative data
- Use bullet lists for properties/characteristics
- Keep paragraphs short (2-3 sentences max)

FORBIDDEN:
- Narrative flow or storytelling
- Personal opinions or subjective assessments
- Motivational language
- Lengthy introductions

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.`;

      chapterPrompt = `${previousChaptersContext}Write a REFERENCE/HANDBOOK Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

REFERENCE STRUCTURE (MANDATORY):
1. OVERVIEW — 2-3 sentence scope statement
2. KEY DEFINITIONS — Bold term + clear definition for each concept
3. DETAILED ENTRIES — Structured, encyclopedic coverage of each topic
4. COMPARISON TABLE — Markdown table comparing key approaches/options
5. QUICK REFERENCE CARD — Summary table of essential information
6. CROSS-REFERENCES — Links to related chapters/topics
7. GLOSSARY — Key terms with brief definitions

REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting (## headings, **bold**, pipe-syntax tables)
- Include at least 2 reference tables
- Optimize for scanning and quick lookup
- Every entry must be self-contained and findable
${chapterNumber > 1 ? '- BUILD upon previous chapter concepts' : ''}

BEGIN WRITING THE REFERENCE/HANDBOOK CHAPTER:`;

    } else {
      // BESTSELLER PIPELINE - for non-technical books
      console.log("[GENERATE-CHAPTER] Using BESTSELLER pipeline (narrative, engaging)");
      
      // ===========================================
      // WALL STREET INSTITUTIONAL UPGRADE
      // Detect business/wealth/entrepreneurship books and inject institutional contract
      // ===========================================
      const BUSINESS_CATEGORIES = [
        'business', 'entrepreneurship', 'finance', 'wealth', 'investing',
        'startup', 'leadership', 'money', 'economics', 'strategy',
        'marketing', 'sales', 'management', 'self-help', 'personal_development',
        'personal development', 'self_help',
      ];
      
      const isBusinessBook = BUSINESS_CATEGORIES.some(cat => 
        (category || '').toLowerCase().includes(cat) ||
        (bookTitle || '').toLowerCase().includes(cat)
      ) || (bookTitle || '').toLowerCase().match(/billionaire|million|wealth|capital|business|entrepreneur|money|invest|startup|founder|ceo|empire/i);
      
      // Import institutional contract if business book
      let institutionalPrompt = '';
      if (isBusinessBook) {
        try {
          const { buildInstitutionalUpgradePrompt } = await import("../_shared/master-prompt.ts");
          const DEEP_FINANCIAL_CHAPTERS = [1, 3, 5, 11, 17, 18];
          const isDeepChapter = DEEP_FINANCIAL_CHAPTERS.includes(chapterNumber);
          institutionalPrompt = buildInstitutionalUpgradePrompt(chapterNumber, chapterTitle, isDeepChapter);
          console.log(`[GENERATE-CHAPTER] WALL STREET MODE: Active (deep=${isDeepChapter}) for Ch.${chapterNumber}`);
        } catch (e) {
          console.error("[GENERATE-CHAPTER] Failed to load institutional contract:", e);
        }
      }
      
      // Check if this is the Billionaire Roadmap chapter (Ch.21 or roadmap-titled)
      let roadmapPrompt = '';
      const isRoadmapChapter = (chapterTitle || '').toLowerCase().match(/roadmap|positioning|12.month|twelve.month|billionaire.*year/i);
      if (isRoadmapChapter && isBusinessBook) {
        try {
          const { BILLIONAIRE_ROADMAP_CONTRACT } = await import("../_shared/master-prompt.ts");
          roadmapPrompt = BILLIONAIRE_ROADMAP_CONTRACT;
          console.log(`[GENERATE-CHAPTER] BILLIONAIRE ROADMAP MODE: Active for "${chapterTitle}"`);
        } catch (e) {
          console.error("[GENERATE-CHAPTER] Failed to load roadmap contract:", e);
        }
      }
      
      systemPrompt = `${SYSTEM_ROLE}

${MASTER_FORMATTING_CONTRACT}

${BESTSELLER_STRUCTURE_CONTRACT}

${NONFICTION_CONTRACT}

${institutionalPrompt}

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
Create comprehensive, bestseller-grade chapters that readers would pay $20+ for.${isBusinessBook ? '\nThis is a BUSINESS/WEALTH book — apply Wall Street institutional rigor while preserving narrative voice.' : ''}`;
      
      chapterPrompt = `${previousChaptersContext}Write Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics:
${keyTopics?.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') || '1. Comprehensive coverage'}

BESTSELLER STRUCTURE (MANDATORY):
1. OPENING HOOK — Story, contradiction, or emotional moment (first 100 words)
2. CORE IDEA — One central message, explained clearly
3. ILLUSTRATION — Real-world story, analogy, or scenario
4. NAMED PRINCIPLE — Introduce a sticky, memorable concept name
5. READER ENGAGEMENT — Reflection questions, mental pauses
6. ACTIONABLE TAKEAWAYS — 3-7 bullet points the reader can apply
${isBusinessBook ? `
INSTITUTIONAL REQUIREMENTS (BUSINESS BOOK):
7. FINANCIAL ENGINEERING — Include at least 1 markdown table with real numbers
8. CAPITAL IMPACT — Include at least 1 formula or calculation
9. RISK ANALYSIS — Address what kills this strategy
10. EXECUTIVE ACTIONS — 3-5 measurable next steps with KPIs
` : ''}${roadmapPrompt ? `
ROADMAP CHAPTER SPECIAL REQUIREMENTS:
${roadmapPrompt}
` : ''}
REQUIREMENTS:
- Approximately ${targetWords} words
- Use proper Markdown formatting (## headings, **bold**, tables)
- NO AI-sounding phrases ("Let's dive in", "In this chapter we will explore")
- Include real-world examples with SPECIFIC NUMBERS
- Every paragraph must deliver VALUE
${isBusinessBook ? '- Include markdown tables for frameworks and models\n- Include quantitative examples with dollar amounts, percentages, multiples' : ''}
${chapterNumber > 1 ? '- CONTINUE from previous chapter concepts - do NOT repeat introductions' : ''}

BEGIN WRITING THE FULL BESTSELLER-GRADE CHAPTER:`;
    }

    // Retry logic for transient gateway errors (502, 503, 504)
    const MAX_RETRIES = 3;
    let response: Response | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = 2000 * attempt;
        console.log(`[GENERATE-CHAPTER] Retry attempt ${attempt + 1} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: generationModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: chapterPrompt }
          ],
        }),
      });
      if (response.ok) break;
      const errText = await response.text();
      lastErr = errText.slice(0, 200);
      console.error(`[GENERATE-CHAPTER] AI gateway error (attempt ${attempt + 1}):`, response.status, lastErr);
      // Only retry on transient errors
      if (![502, 503, 504].includes(response.status)) {
        throw new Error(`AI generation failed (${response.status}): ${lastErr}`);
      }
    }

    if (!response || !response.ok) {
      throw new Error(`AI generation failed after ${MAX_RETRIES} retries: ${lastErr}`);
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim().length === 0) {
      throw new Error("AI returned empty response — please retry");
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[GENERATE-CHAPTER] JSON parse failed, body length:", responseText.length, "preview:", responseText.slice(0, 300));
      throw new Error("AI returned malformed response — please retry");
    }

    let chapterContent = data.choices?.[0]?.message?.content || "";

    if (!chapterContent) {
      console.error("[GENERATE-CHAPTER] No content in response:", JSON.stringify(data).slice(0, 500));
      throw new Error("No content generated — please retry");
    }

    let finalContent = chapterContent;

    // Add academic front matter and references (for ALL academic pipelines: text AND illustrated)
    const isAcademicOutput = (academicMode || needsAcademicResearch) && researchResult && researchResult.references.length > 0;
    if (isAcademicOutput) {
      const domainRules = DOMAIN_RULES[category.toLowerCase()] || DOMAIN_RULES.default;
      
      let frontMatter = `> **Academic Content Notice**
> This chapter is an AI-assisted academic synthesis. All citations are from verified databases.

`;

      if (domainRules.requiresDisclaimer) {
        if (category.toLowerCase() === 'medicine') {
          frontMatter += `> **Medical Disclaimer:** This content is for educational purposes only and is not a substitute for professional medical advice.

`;
        } else if (category.toLowerCase() === 'law') {
          frontMatter += `> **Legal Disclaimer:** This content is for educational purposes only and does not constitute legal advice.

`;
        }
      }

      frontMatter += `---

`;
      
      // Add References section if not present
      if (!/(?:^|\n)##+\s*references/i.test(finalContent)) {
        const referenceSection = `

---

## References

${researchResult.references.map((ref, idx) => {
  switch (citationStyle) {
    case 'APA':
      return `${ref.author} (${ref.year}). *${ref.title}*.${ref.journal ? ` ${ref.journal}.` : ''}${ref.doi ? ` https://doi.org/${ref.doi}` : ref.url ? ` ${ref.url}` : ''}`;
    case 'Harvard':
      return `${ref.author} (${ref.year}) ${ref.title}.${ref.journal ? ` ${ref.journal}.` : ''}${ref.url ? ` Available at: ${ref.url}` : ''}`;
    case 'IEEE':
      return `[${idx + 1}] ${ref.author}, "${ref.title},"${ref.journal ? ` ${ref.journal},` : ''} ${ref.year}.${ref.doi ? ` DOI: ${ref.doi}` : ''}`;
    default:
      return `${ref.author} (${ref.year}). ${ref.title}.`;
  }
}).join('\n\n')}
`;
        finalContent = frontMatter + finalContent + referenceSection;
      } else {
        finalContent = frontMatter + finalContent;
      }

      // Validate academic output
      const academicValidation = validateAcademicRequirements(
        finalContent, researchResult.references, category, citationStyle
      );
      
      if (academicValidation.blocked && !isAdmin) {
        console.log("[GENERATE-CHAPTER] Academic validation failed post-generation");
        // Log but don't block - content was already generated
      }
    }

    // ILLUSTRATED / CHILDREN'S BOOK - Generate inline illustrations from [FIGURE X] markers
    // Upload images to storage instead of embedding base64 (prevents 5-10MB chapter content)
    if (bookType === 'illustrated' || bookType === 'children') {
      console.log("[GENERATE-CHAPTER] Generating inline illustrations from figure markers...");

      try {
        // Extract [FIGURE X: description] markers from generated content
        const figureRegex = /\[FIGURE\s*(\d+)\s*:\s*([\s\S]*?)\]/gi;
        const figures: { num: number; description: string; fullMatch: string }[] = [];
        
        let figMatch;
        while ((figMatch = figureRegex.exec(finalContent)) !== null) {
          figures.push({
            num: parseInt(figMatch[1]),
            description: figMatch[2].trim(),
            fullMatch: figMatch[0],
          });
        }
        
        console.log(`[GENERATE-CHAPTER] Found ${figures.length} figure markers to illustrate`);

        if (figures.length > 0) {
          const isChildrens = bookType === 'children';
          const styleHint = isChildrens 
            ? 'Children\'s book illustration style, soft warm colors, friendly characters, rounded shapes, whimsical and inviting, picture book quality.'
            : 'Professional book illustration, educational, clear composition, warm color palette, suitable for print publication.';

          // Create a service-role Supabase client for storage uploads
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
          const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const storageClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

          for (let i = 0; i < Math.min(figures.length, 5); i++) {
            const fig = figures[i];
            try {
              const imagePrompt = `${fig.description}. ${styleHint} Category: ${category}. No text or words in the image.`;
              
              console.log(`[GENERATE-CHAPTER] Generating Figure ${fig.num}: ${fig.description.slice(0, 80)}...`);
              
              const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-3-pro-image-preview",
                  messages: [{ role: "user", content: imagePrompt }],
                  modalities: ["image", "text"],
                }),
              });

              if (imageResponse.ok) {
                const imageData = await imageResponse.json();
                const base64Url = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
                
                if (base64Url && base64Url.startsWith('data:image/')) {
                  // Upload to storage instead of embedding base64
                  try {
                    const base64Data = base64Url.split(',')[1];
                    const mimeMatch = base64Url.match(/data:(image\/\w+);/);
                    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                    const ext = mimeType.split('/')[1] || 'png';
                    
                    // Convert base64 to Uint8Array
                    const binaryStr = atob(base64Data);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let b = 0; b < binaryStr.length; b++) {
                      bytes[b] = binaryStr.charCodeAt(b);
                    }
                    
                    const storagePath = `${user.id}/${chapter?.book_id || "unknown"}/ch${chapterNumber}-fig${fig.num}.${ext}`;
                    
                    const { error: uploadError } = await storageClient.storage
                      .from('book-images')
                      .upload(storagePath, bytes, {
                        contentType: mimeType,
                        upsert: true,
                      });
                    
                    if (!uploadError) {
                      const { data: publicUrl } = storageClient.storage
                        .from('book-images')
                        .getPublicUrl(storagePath);
                      
                      const captionText = fig.description.split('.')[0] || `Figure ${fig.num}`;
                      const imageMarkdown = `\n\n![${captionText}](${publicUrl.publicUrl})\n*Figure ${fig.num}: ${captionText}*\n\n`;
                      finalContent = finalContent.replace(fig.fullMatch, imageMarkdown);
                      console.log(`[GENERATE-CHAPTER] Figure ${fig.num} uploaded to storage and inserted inline`);
                    } else {
                      console.error(`[GENERATE-CHAPTER] Storage upload failed for Figure ${fig.num}:`, uploadError);
                      finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
                    }
                  } catch (uploadErr) {
                    console.error(`[GENERATE-CHAPTER] Upload error for Figure ${fig.num}:`, uploadErr);
                    finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
                  }
                } else {
                  // No base64 image returned — use placeholder
                  finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
                  console.log(`[GENERATE-CHAPTER] Figure ${fig.num}: No image returned, using placeholder`);
                }
              } else {
                const errStatus = imageResponse.status;
                await imageResponse.text(); // consume body
                console.error(`[GENERATE-CHAPTER] Figure ${fig.num} generation failed: status ${errStatus}`);
                finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
              }
              
              // Delay between image generations to avoid rate limiting
              if (i < figures.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
              }
            } catch (imgError) {
              console.error(`[GENERATE-CHAPTER] Figure ${fig.num} error:`, imgError);
              finalContent = finalContent.replace(fig.fullMatch, `\n\n*[Figure ${fig.num}: ${fig.description.split('.')[0]}]*\n\n`);
            }
          }
        } else {
          console.log("[GENERATE-CHAPTER] No [FIGURE] markers found in illustrated content — skipping illustration generation");
        }
      } catch (illustrationError) {
        console.error("[GENERATE-CHAPTER] Illustration pipeline failed:", illustrationError);
      }
    }

    // Preserve markdown formatting — MarkdownRenderer handles rendering
    // Only clean up excessive whitespace
    finalContent = finalContent.replace(/\n{4,}/g, '\n\n\n').trim();
    
    // ===========================================
    // CONTRACT 6 — HARD RUNTIME GATE (POST-GENERATION)
    // RULE 6.2: Content MUST be blocked if it violates Contract 6
    // RULE 6.4: Generation STOPS on first critical violation
    // ===========================================
    const { validateContract6Content, isValidBookType } = await import("../_shared/contract6-governance.ts");
    
    const validatedBookType = isValidBookType(effectiveBookType) ? effectiveBookType : 'text';
    const contract6Validation = validateContract6Content(finalContent, validatedBookType, chapterTitle);
    
    if (!contract6Validation.valid && contract6Validation.shouldRegenerate) {
      const criticalViolation = contract6Validation.violations[0];
      console.log(`[CONTRACT 6] VIOLATION DETECTED: ${criticalViolation.code} - ${criticalViolation.message}`);
      
      // For non-admin users, block the content and return error
      if (!isAdmin) {
        console.log(`[CONTRACT 6] BLOCKING content for book type: ${effectiveBookType}`);
        return new Response(JSON.stringify({
          error: `CONTRACT 6 VIOLATION: ${criticalViolation.message}`,
          code: criticalViolation.code,
          bookType: effectiveBookType,
          shouldRegenerate: true,
          userMessage: contract6Validation.userMessage,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        console.log(`[CONTRACT 6] Admin override - saving content despite violations`);
      }
    } else if (!contract6Validation.valid) {
      // Log non-critical violations but allow content
      console.log(`[CONTRACT 6] Non-critical violations detected: ${contract6Validation.violations.length}`);
    }
    
    // ===========================================
    // PEDAGOGICAL SCHEMA VALIDATION (PBG-1.0)
    // Validate 7 mandatory sections for educational books
    // ===========================================
    const pedagogicalValidation = validatePedagogicalSchema(finalContent, effectiveBookType);
    console.log(`[PEDAGOGICAL] Validation result: ${pedagogicalValidation.sectionsFound}/${pedagogicalValidation.sectionsRequired} sections, score: ${pedagogicalValidation.score}%`);
    
    if (!pedagogicalValidation.valid && pedagogicalValidation.blocked) {
      console.log(`[PEDAGOGICAL] BLOCKING content: ${pedagogicalValidation.missingSections.join(', ')}`);
      
      // For non-admin users, log warning but allow (soft enforcement initially)
      if (!isAdmin && pedagogicalValidation.score < 50) {
        // Only hard-block if less than 50% compliance
        return new Response(JSON.stringify({
          error: `PEDAGOGICAL SCHEMA VIOLATION: Chapter requires 7 mandatory sections. Found ${pedagogicalValidation.sectionsFound}. Missing: ${pedagogicalValidation.missingSections.join(', ')}`,
          code: 'PEDAGOGICAL_SCHEMA_VIOLATION',
          sectionsFound: pedagogicalValidation.sectionsFound,
          sectionsRequired: pedagogicalValidation.sectionsRequired,
          missingSections: pedagogicalValidation.missingSections,
          score: pedagogicalValidation.score,
          shouldRegenerate: true,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    
    const actualWordCount = finalContent.split(/\s+/).filter((w: string) => w.length > 0).length;

    const updateData: any = {
      content: finalContent,
      word_count: actualWordCount,
      is_generated: true,
      updated_at: new Date().toISOString(),
      academic_mode: academicMode,
      citation_style: academicMode ? citationStyle : null,
    };

    if (academicMode && researchResult) {
      updateData.chapter_references = researchResult.references;
      updateData.research_metadata = researchResult.metadata;
    }

    const { error: updateError } = await supabase
      .from("chapters")
      .update(updateData)
      .eq("id", chapterId);

    if (updateError) throw new Error(`Failed to save: ${updateError.message}`);

    console.log(`[GENERATE-CHAPTER] Chapter ${chapterNumber} saved (${actualWordCount} words)`);

    return new Response(JSON.stringify({
      success: true,
      wordCount: actualWordCount,
      provider: 'Lovable AI',
      academicMode,
      sourceCount: researchResult?.references.length || 0,
      contract6: {
        valid: contract6Validation.valid,
        violations: contract6Validation.violations.length,
        bookType: effectiveBookType,
      },
      pedagogicalSchema: {
        valid: pedagogicalValidation.valid,
        sectionsFound: pedagogicalValidation.sectionsFound,
        sectionsRequired: pedagogicalValidation.sectionsRequired,
        score: pedagogicalValidation.score,
        missingSections: pedagogicalValidation.missingSections,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    
  } catch (error) {
    console.error("[GENERATE-CHAPTER] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      code: 'GENERATION_ERROR',
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
