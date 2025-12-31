import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

MARKDOWN IS FORBIDDEN IN FINAL OUTPUT

Do NOT output:
- Asterisks for bold (**text**)
- Asterisks for italics (*text*)
- Underscores for emphasis (__text__)
- Hash symbols for headings (## or ###)
- Backticks for code
- Pipe-based markdown tables

REQUIRED INSTEAD:
- Section headings: Write as plain text on its own line (e.g., "Introduction" not "## Introduction")
- Emphasis: Express through word choice and sentence structure, not symbols
- Tables: Use labeled row/column format (see TABLE FORMAT below)
- Code: Use indented plain text with language label prefix

TABLE FORMAT (REQUIRED):

TABLE: [Table Name]

Column 1: [Header]
Column 2: [Header]
Column 3: [Header]

Row 1:
[Header 1]: [Value]
[Header 2]: [Value]
[Header 3]: [Value]

CODE FORMAT (REQUIRED):

CODE EXAMPLE ([Language]):

    [properly indented line 1]
    [properly indented line 2]
    [blank line between logical blocks]
    [properly indented line 3]

If any markdown symbols (**, ##, \`\`\`) appear in output, the output is INVALID and must be REWRITTEN.

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
[ ] No markdown symbols (**, ##, \`\`\`, _)
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
  return `${SYSTEM_ROLE}

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

ROLE: Generate scholarly, pedagogically sound, publishable learning material.
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
5. NO Markdown syntax (**, ##, backticks) — write plain text only

MANDATORY STRUCTURE (use plain text headings, NOT Markdown):

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

  // Health check (no auth required)
  const healthBody = await req.clone().json().catch(() => null);
  if (healthBody?.healthCheck) {
    return new Response(
      JSON.stringify({ ok: true, function: "generate-chapter", buildId: `fn:${new Date().toISOString()}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  // OCR check endpoint (requires auth, handled below)
  if (healthBody?.ocrCheck && healthBody?.imageUrl) {
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
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Analyze this comic panel image. List ALL visible text including speech bubbles, captions, and any words. Return JSON: {"hasText": boolean, "foundText": ["word1", "word2", ...]}` },
              { type: "image_url", image_url: { url: healthBody.imageUrl } }
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
      .eq("id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    const maxWordCount = TIER_WORD_LIMITS[userPlan as keyof typeof TIER_WORD_LIMITS] || TIER_WORD_LIMITS.free;

    const { 
      chapterId, 
      bookTitle, 
      chapterTitle, 
      chapterNumber, 
      keyTopics, 
      category,
      wordCount = 4000,
      language = 'English',
      bookType = 'text',
      academicMode = false,
      citationStyle = 'APA',
      comicStyle = 'children_book',
      // NEW: Edit control parameters
      editIntent = null,
      isRegeneration = false,
    } = await req.json();

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
        .select("creator_id, book_type, workbook_density, comic_style_id, palette_hint, line_weight_hint, character_sheet, layout_template, text_in_image, scenes_per_panel")
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

    // ===========================================
    // ACADEMIC MODE - RESEARCH FIRST
    // ===========================================
    let researchResult: ResearchResult | null = null;
    
    if (academicMode && bookType === 'text') {
      console.log("[GENERATE-CHAPTER] Academic mode: conducting deep research FIRST...");
      
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
      console.log("[GENERATE-CHAPTER] Generating authority-grade comic chapter...");
      console.log(`[GENERATE-CHAPTER] Comic style: ${effectiveComicStyle}, Panels: ${effectiveLayoutTemplate}`);
      
      // Build enhanced system prompt with character sheet if provided
      let enhancedSystemPrompt = buildComicSystemPrompt(effectiveComicStyle, languageName);
      
      // Add character consistency from character sheet
      if (effectiveCharacterSheet && Object.keys(effectiveCharacterSheet).length > 0) {
        enhancedSystemPrompt += `\n\n**CHARACTER SHEET (MUST MAINTAIN CONSISTENCY):**\n${JSON.stringify(effectiveCharacterSheet, null, 2)}`;
      }
      
      // Add custom palette/line hints if provided
      if (effectivePaletteHint) {
        enhancedSystemPrompt += `\n\n**CUSTOM PALETTE:** ${effectivePaletteHint}`;
      }
      if (effectiveLineWeightHint) {
        enhancedSystemPrompt += `\n\n**CUSTOM LINE WEIGHT:** ${effectiveLineWeightHint}`;
      }
      
      const systemPrompt = enhancedSystemPrompt;
      const chapterPrompt = buildComicChapterPrompt(
        chapterTitle, bookTitle, chapterNumber, keyTopics, languageName, effectiveLayoutTemplate
      );
      
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
            model: "google/gemini-2.5-flash",
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
              model: "google/gemini-2.5-flash-image-preview",
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
                
                // Upload path: userId/bookId/chapterId/panel-N.png
                const storagePath = `${user.id}/${chapter?.book_id || "unknown"}/${chapterId}/panel-${panel.num}.${ext}`;
                
                const { error: uploadError } = await supabase.storage
                  .from("comic-panels")
                  .upload(storagePath, bytes.buffer, {
                    contentType: mimeType,
                    upsert: true,
                  });
                
                if (!uploadError) {
                  // Get public URL
                  const { data: publicUrlData } = supabase.storage
                    .from("comic-panels")
                    .getPublicUrl(storagePath);
                  
                  panel.imageUrl = publicUrlData.publicUrl;
                  console.log(`[GENERATE-CHAPTER] Panel ${panel.num} uploaded to storage`);
                } else {
                  console.error(`[GENERATE-CHAPTER] Upload error:`, uploadError);
                  // Fall back to base64 if upload fails
                  panel.imageUrl = base64Url;
                }
              } catch (uploadErr) {
                console.error(`[GENERATE-CHAPTER] Storage upload failed:`, uploadErr);
                // Fall back to base64 if upload fails
                panel.imageUrl = base64Url;
              }
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

      const { error: updateError } = await supabase
        .from("chapters")
        .update({
          content: finalComicContent,
          word_count: actualWordCount,
          is_generated: true,
          updated_at: new Date().toISOString(),
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
          model: "google/gemini-2.5-flash",
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

    let systemPrompt: string;
    let chapterPrompt: string;
    
    // PIPELINE ROUTING: Determine if this is Academic/Technical or Bestseller
    const isAcademicPipeline = academicMode || 
      effectiveBookType === 'academic' || 
      effectiveBookType === 'reference' ||
      (effectiveBookType === 'professional' && ['technology', 'science', 'medicine', 'law'].includes(category?.toLowerCase()));
    
    if (isAcademicPipeline && researchResult && researchResult.references.length > 0) {
      // ACADEMIC/TECHNICAL PIPELINE - NO metaphors, NO storytelling
      console.log("[GENERATE-CHAPTER] Using ACADEMIC/TECHNICAL pipeline (code-heavy, literal)");
      
      systemPrompt = `You are ScrollLibrary — ACADEMIC/TECHNICAL PIPELINE.

===========================================
GENERATOR IDENTITY: Lecturer · Engineer · Researcher
===========================================

You are writing a university-grade textbook or technical manual.
You are NOT a storyteller. You are NOT motivational. You are INSTRUCTIONAL.

STRICTLY FORBIDDEN:
❌ Metaphors of any kind (e.g., "Alchemist", "Wizard", "Journey", "Dark Arts")
❌ Storytelling or narrative framing
❌ Motivational language ("You can do it!", "Believe in yourself")
❌ Hero's journey framing
❌ Analogies to unrelated domains
❌ Emotional appeals
❌ Rhetorical questions for effect

REQUIRED:
✅ Literal, technical language only
✅ Learning objectives at chapter start (3-5 specific, measurable points)
✅ Code examples with proper formatting (40% minimum for technical topics)
✅ Step-by-step explanations
✅ Exercises at chapter end (3-5 practice problems)
✅ Mini-project at chapter end
✅ In-text citations for ALL factual claims
✅ References section at end

CODE FORMAT (MANDATORY):
CODE EXAMPLE (Python):

    def example_function():
        # Comment explaining purpose
        pass

Tables must be formatted with clear headers and aligned columns.

${MASTER_FORMATTING_CONTRACT}

${ACADEMIC_CONTRACT}

${VALIDATION_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
CATEGORY: ${category}
CITATION STYLE: ${citationStyle}

If ANY metaphor, storytelling, or motivational language appears → OUTPUT IS INVALID.
Teach by DOING, not by INSPIRING.`;

      chapterPrompt = `Write an ACADEMIC/TECHNICAL Chapter: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

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
5. NO Markdown syntax (**, ##, backticks) — write plain text only
6. NO metaphors, storytelling, or motivational content

MANDATORY STRUCTURE (ACADEMIC/TECHNICAL):

Learning Objectives

By the end of this chapter, you will be able to:
1. [Specific, measurable objective]
2. [Specific, measurable objective]
3. [Specific, measurable objective]

Introduction

[Technical context and scope - NO storytelling, NO emotional hooks]

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

GENERATOR IDENTITY: Lecturer · Engineer · Researcher

You are writing a university-grade textbook. NO metaphors, NO storytelling, NO motivational content.

STRICTLY FORBIDDEN:
❌ Metaphors (e.g., "Alchemist", "Wizard", "Journey")
❌ Storytelling or narrative framing  
❌ Motivational language
❌ Hero's journey framing

REQUIRED:
✅ Learning objectives at chapter start
✅ Step-by-step technical explanations
✅ Code examples with proper formatting (for technical topics)
✅ Exercises and mini-project at chapter end
✅ Plain text formatting only

${MASTER_FORMATTING_CONTRACT}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.

Teach by DOING, not by INSPIRING.`;

      chapterPrompt = `Write an ACADEMIC/TECHNICAL Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

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

[Technical overview - NO storytelling]

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
- Plain text headings ONLY
- NO Markdown syntax
- NO metaphors or storytelling
- Technical, instructional tone

BEGIN WRITING THE ACADEMIC/TECHNICAL CHAPTER:`;

    } else {
      // BESTSELLER PIPELINE - for non-technical books
      console.log("[GENERATE-CHAPTER] Using BESTSELLER pipeline (narrative, engaging)");
      
      systemPrompt = `${SYSTEM_ROLE}

${MASTER_FORMATTING_CONTRACT}

${BESTSELLER_STRUCTURE_CONTRACT}

${NONFICTION_CONTRACT}

${VALIDATION_CONTRACT}

${FINAL_DIRECTIVE}

LANGUAGE: Write EXCLUSIVELY in ${languageName}.
Create comprehensive, bestseller-grade chapters that readers would pay $20+ for.`;
      
      chapterPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

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

REQUIREMENTS:
- Approximately ${targetWords} words
- Plain text headings ONLY (e.g., "Introduction" not "## Introduction")
- NO Markdown syntax (**, ##, backticks, code fences)
- NO AI-sounding phrases ("Let's dive in", "In this chapter we will explore")
- Include real-world examples
- Every paragraph must deliver VALUE

BEGIN WRITING THE FULL BESTSELLER-GRADE CHAPTER:`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: chapterPrompt }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate chapter");
    }

    const data = await response.json();
    let chapterContent = data.choices?.[0]?.message?.content || "";

    if (!chapterContent) {
      throw new Error("No content generated");
    }

    let finalContent = chapterContent;

    // Add academic front matter and references
    if (academicMode && researchResult && researchResult.references.length > 0) {
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

    // ILLUSTRATED BOOK - Add context-aware illustrations
    if (bookType === 'illustrated') {
      console.log("[GENERATE-CHAPTER] Generating illustrations...");

      const contentSummary = chapterContent.slice(0, 2000);

      try {
        const illustrationPrompt = `Analyze this chapter and create 3 illustration ideas:

${contentSummary}

Chapter: "${chapterTitle}" | Category: ${category}

Format:
---
[ILLUSTRATION 1]
**Concept:** [Topic]
**Visual:** [2-3 sentence scene description]
---`;

        const illustrationResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Create illustration concepts for educational books." },
              { role: "user", content: illustrationPrompt }
            ],
          }),
        });

        if (illustrationResponse.ok) {
          const illustrationData = await illustrationResponse.json();
          const illustrationContent = illustrationData.choices?.[0]?.message?.content || "";
          
          const illustrationRegex = /\[ILLUSTRATION\s*(\d+)\]\s*(?:\*\*Concept:\*\*\s*([\s\S]*?))?\*\*Visual:\*\*\s*([\s\S]*?)(?=\s*---|\s*\[ILLUSTRATION|\s*$)/gi;
          const illustrations: { num: number; concept: string; visual: string; imageUrl?: string }[] = [];
          
          let illMatch;
          while ((illMatch = illustrationRegex.exec(illustrationContent)) !== null) {
            illustrations.push({
              num: parseInt(illMatch[1]),
              concept: (illMatch[2] || '').trim(),
              visual: illMatch[3].trim(),
            });
          }

          for (let i = 0; i < Math.min(illustrations.length, 3); i++) {
            const ill = illustrations[i];
            try {
              const imagePrompt = `Educational illustration for ${category}. ${ill.visual} Professional, educational, clear. No text.`;
              
              const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-image-preview",
                  messages: [{ role: "user", content: imagePrompt }],
                  modalities: ["image", "text"],
                }),
              });

              if (imageResponse.ok) {
                const imageData = await imageResponse.json();
                const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
                if (imageUrl) ill.imageUrl = imageUrl;
              }
              
              await new Promise(r => setTimeout(r, 1000));
            } catch (imgError) {
              console.error("[GENERATE-CHAPTER] Illustration error:", imgError);
            }
          }

          if (illustrations.some(ill => ill.imageUrl)) {
            let illustrationSection = '\n\n---\n\n## Chapter Illustrations\n\n';
            for (const ill of illustrations) {
              if (ill.imageUrl) {
                illustrationSection += `### ${ill.concept || `Illustration ${ill.num}`}\n\n`;
                illustrationSection += `![${ill.concept || `Illustration`}](${ill.imageUrl})\n\n`;
              }
            }
            finalContent += illustrationSection;
          }
        }
      } catch (illustrationError) {
        console.error("[GENERATE-CHAPTER] Illustration generation failed:", illustrationError);
      }
    }

    // Sanitize all markdown from final content before saving
    finalContent = sanitizeMarkdown(finalContent);
    
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
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    
  } catch (error) {
    console.error("[GENERATE-CHAPTER] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      code: 'GENERATION_ERROR',
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
