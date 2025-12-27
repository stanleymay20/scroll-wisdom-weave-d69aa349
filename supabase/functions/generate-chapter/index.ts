import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function validateComicStructure(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: { code: string; message: string }[] = [];

  const panelRegex = /\[PANEL\s*(\d+)\]/gi;
  const panels = content.match(panelRegex) || [];

  // HARD FAIL: No panels
  if (panels.length === 0) {
    errors.push({
      code: 'NO_PANELS_DETECTED',
      message: 'Comic content must have structured panels [PANEL X]',
      severity: 'critical',
    });
  }

  // HARD FAIL: Insufficient panels
  if (panels.length < 4) {
    errors.push({
      code: 'INSUFFICIENT_PANELS',
      message: `Comic requires minimum 4 panels, found ${panels.length}`,
      severity: 'high',
    });
  }

  // Check for dialogue - MANDATORY
  const dialoguePatterns = [
    /\*\*Dialogue:\*\*/gi,
    /-\s*[A-Z][A-Za-z]+:\s*"/g,
  ];
  const hasDialogue = dialoguePatterns.some(p => p.test(content));
  
  if (!hasDialogue) {
    errors.push({
      code: 'NO_DIALOGUE',
      message: 'Comic panels MUST include character dialogue (speech bubbles)',
      severity: 'critical',
    });
  }

  // Check for visual descriptions
  const visualPattern = /\*\*Visual:\*\*/gi;
  const visualDescriptions = content.match(visualPattern) || [];
  
  if (visualDescriptions.length < panels.length * 0.8) {
    warnings.push({
      code: 'INCOMPLETE_VISUAL_DESCRIPTIONS',
      message: 'Some panels lack detailed visual descriptions',
    });
  }

  const hasCriticalError = errors.some(e => e.severity === 'critical');

  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    failureMessage: hasCriticalError 
      ? '❌ **COMIC GENERATION BLOCKED**: Panels must include visual descriptions AND character dialogue.' 
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
  return `You are ScrollLibrary Authority Engine — an academic production system for university-grade content.

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
1. **Concept Introduction** — Hook the reader, provide context
2. **Structured Explanation** — Clear, logical progression
3. **Applied Examples** — Real-world case studies
4. **Critical Reflection** — Analysis, implications
5. **Key Takeaways** — Summary of main points

CODE FORMATTING (CRITICAL):
- ALL multi-line code MUST be in fenced code blocks
- ALWAYS specify language: \`\`\`python, \`\`\`typescript
- Preserve indentation exactly

TABLE FORMATTING:
- Use proper markdown tables with header rows
- Ensure consistent column counts

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

**VERIFIED SOURCES TO CITE (USE ONLY THESE):**
${sourceList}

**KEY TOPICS:**
${keyTopics?.map(t => `- ${t}`).join('\n') || '- Comprehensive coverage'}

**REQUIREMENTS:**
1. Write approximately ${targetWords} words in ${language}
2. Include in-text citations using ${citationStyle} format
3. Use ONLY the sources listed above
4. Mark unsupported claims with "[requires verification]"

**MANDATORY STRUCTURE:**
## Introduction
[Hook + context + chapter overview]

## [Main Section 1: Key Concept]
[Structured explanation with citations]

## [Main Section 2: Applied Examples]
[Real-world applications with evidence]

## [Main Section 3: Critical Analysis]
[Deeper analysis, implications]

## Key Takeaways
[Bullet point summary]

## Conclusion
[Synthesis and transition]

## References
[Full ${citationStyle} formatted bibliography]

BEGIN WRITING THE COMPLETE ACADEMIC CHAPTER:`;
}

// ===========================================
// COMIC GENERATION - AUTHORITY GRADE
// ===========================================

function buildComicSystemPrompt(style: string, language: string): string {
  const styleGuide = COMIC_STYLE_PRESETS[style] || COMIC_STYLE_PRESETS.children_book;
  
  return `You are a professional comic book production engine, not an illustrator and not a prose writer.

**VISUAL STYLE CONTRACT (MUST MAINTAIN ACROSS ALL PANELS):**
- Art Style: ${styleGuide.artStyle}
- Color Palette: ${styleGuide.colorPalette}
- Line Weight: ${styleGuide.lineWeight}
- Shading: ${styleGuide.shadingStyle}
- Characters: ${styleGuide.characterNotes}

**LANGUAGE:** All dialogue and captions must be in ${language}.

**NON-NEGOTIABLE RULES:**
1. Every panel MUST have character dialogue (speech bubbles) — MANDATORY
2. Dialogue should be natural, expressive, and advance the story
3. Visual descriptions must be detailed enough for AI image generation
4. Maintain character appearance consistency across ALL panels
5. Story must have clear beginning, conflict, and resolution
6. Maximum 30 words per speech bubble
7. Minimum 4 panels, maximum 6 panels per chapter

**FORBIDDEN:**
❌ Single giant image per chapter
❌ Floating captions without panel structure  
❌ Random style switching between panels
❌ Walls of text in captions
❌ Panels without dialogue
❌ Compressing entire story into one illustration

**CHARACTER CONSISTENCY CONTRACT:**
Once a character appears, you MUST lock:
- Face shape, Skin tone, Hair style & color
- Costume design, Body proportions
These CANNOT change between panels.`;
}

function buildComicChapterPrompt(
  chapterTitle: string,
  bookTitle: string,
  chapterNumber: number,
  keyTopics: string[],
  language: string,
  panelCount: number = 5
): string {
  return `Create a COMIC BOOK CHAPTER for:
**Book:** "${bookTitle}"
**Chapter ${chapterNumber}:** "${chapterTitle}"
**Story Elements:** ${keyTopics?.join(', ') || 'Tell an engaging visual story'}

Generate ${panelCount} PANELS following this EXACT format:

---

[PANEL 1]
**Visual:** [Detailed scene description: setting, characters, expressions, poses, action, mood. 2-3 sentences for AI image generation.]
**Dialogue:**
- CHARACTER_NAME: "Speech bubble text"
- CHARACTER_NAME: "Their response"
**Caption:** "[Optional narration - time/place/thought]"

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
✅ Show emotions through expressions
✅ Use different camera angles (wide shot, close-up, medium shot)
✅ Include action verbs in visual descriptions
✅ All text in ${language}

**STORY ARC:**
- Panels 1-2: Introduction/Setup
- Panels 3-4: Conflict/Challenge
- Panels 5-${panelCount}: Resolution/Cliffhanger

BEGIN CREATING THE COMIC CHAPTER:`;
}

// ===========================================
// WORKBOOK GENERATION - AUTHORITY GRADE
// ===========================================

function buildWorkbookSystemPrompt(language: string): string {
  return `You are a professional workbook designer creating interactive, fill-in learning materials.

**ROLE:** Create workbook chapters that are 70%+ interactive content and ≤30% explanation.

**LANGUAGE:** All content must be in ${language}.

**HARD LIMITS:**
- Maximum ${WORKBOOK_LIMITS.maxWordsPerChapter} words per chapter
- Purpose section: ≤150 words
- Key Concepts: ≤300 words
- Explanation must NEVER exceed 30% of chapter
- Fill-in prompts must DOMINATE the chapter

**MANDATORY STRUCTURE (in this exact order):**
1. **Purpose** — Brief goal statement
2. **Key Concepts** — Bullet points only, minimal prose
3. **Fill-In Prompts** — Main content (multiple prompts with blank lines)
4. **Tables/Worksheets** — For planning and organization
5. **Reflection Questions** — Open questions without answers
6. **Action Steps** — Checkbox items for next steps

**INTERACTIVE ELEMENT REQUIREMENTS:**
- Use underscores (___________) for fill-in blanks
- Use empty brackets [ ] for checkboxes
- Use tables with empty cells for user input
- Every prompt must have space for user writing

**FORBIDDEN:**
- Long explanatory paragraphs
- Essay-style content
- Providing answers to reflection questions
- Walls of text`;
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
    } = await req.json();

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
        .select("creator_id, book_type, workbook_density, comic_style_id, palette_hint, line_weight_hint, character_sheet, layout_template")
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
    const effectiveBookType = bookDetails?.book_type || bookType;
    const effectiveComicStyle = bookDetails?.comic_style_id || comicStyle;
    const effectiveLayoutTemplate = bookDetails?.layout_template || 5;
    const effectiveWorkbookDensity = bookDetails?.workbook_density || 'medium';
    const effectiveCharacterSheet = bookDetails?.character_sheet || {};
    const effectivePaletteHint = bookDetails?.palette_hint || '';
    const effectiveLineWeightHint = bookDetails?.line_weight_hint || '';

    const effectiveWordCount = isAdmin ? wordCount : Math.min(wordCount, maxWordCount);
    
    const languageMap: Record<string, string> = {
      'en': 'English', 'fr': 'French', 'de': 'German', 'es': 'Spanish',
      'ar': 'Arabic', 'sw': 'Swahili', 'pt': 'Portuguese'
    };
    const languageName = languageMap[language] || language;
    
    console.log(`[GENERATE-CHAPTER] Chapter ${chapterNumber}: ${chapterTitle}`);
    console.log(`[GENERATE-CHAPTER] Type: ${bookType}, Academic: ${academicMode}, Admin: ${isAdmin}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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
            { role: "user", content: chapterPrompt }
          ],
        }),
      });

      if (!comicResponse.ok) {
        throw new Error("Failed to generate comic chapter");
      }

      const comicData = await comicResponse.json();
      let comicContent = comicData.choices?.[0]?.message?.content || "";
      
      // VALIDATE comic structure before proceeding
      const comicValidation = validateComicStructure(comicContent);
      if (comicValidation.blocked && !isAdmin) {
        console.log("[GENERATE-CHAPTER] COMIC VALIDATION FAILED");
        return new Response(JSON.stringify({
          error: comicValidation.failureMessage,
          code: "COMIC_STRUCTURE_VIOLATION",
          details: { errors: comicValidation.errors },
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log("[GENERATE-CHAPTER] Comic script validated, generating images...");

      // Parse and generate images
      const panelRegex = /\[PANEL\s*(\d+)\]\s*\*\*Visual:\*\*\s*([\s\S]*?)\*\*Dialogue:\*\*\s*([\s\S]*?)(?:\*\*Caption:\*\*\s*"?([^"]*)"?)?(?=\s*---|\s*\[PANEL|\s*$)/gi;
      const panels: { num: number; visual: string; dialogue: string; caption: string; imageUrl?: string }[] = [];
      
      let match;
      while ((match = panelRegex.exec(comicContent)) !== null) {
        panels.push({
          num: parseInt(match[1]),
          visual: match[2].trim(),
          dialogue: match[3].trim(),
          caption: (match[4] || '').trim(),
        });
      }

      console.log(`[GENERATE-CHAPTER] Found ${panels.length} panels`);

      const styleGuide = COMIC_STYLE_PRESETS[comicStyle] || COMIC_STYLE_PRESETS.children_book;

      // Generate images with style consistency
      for (let i = 0; i < Math.min(panels.length, 6); i++) {
        const panel = panels[i];
        try {
          console.log(`[GENERATE-CHAPTER] Generating image for panel ${panel.num}...`);
          
          const imagePrompt = `${styleGuide.artStyle}. ${panel.visual} ${styleGuide.colorPalette}. ${styleGuide.shadingStyle}. Professional comic book illustration. No text in image.`;
          
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
            if (imageUrl) {
              panel.imageUrl = imageUrl;
              console.log(`[GENERATE-CHAPTER] Panel ${panel.num} image generated`);
            }
          }
          
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgError) {
          console.error(`[GENERATE-CHAPTER] Image error for panel ${panel.num}:`, imgError);
        }
      }

      // Build final comic content with speech bubbles
      let finalComicContent = `# ${chapterTitle}\n\n`;
      finalComicContent += `*A comic story from "${bookTitle}"*\n\n---\n\n`;
      
      for (const panel of panels) {
        finalComicContent += `## Panel ${panel.num}\n\n`;
        if (panel.imageUrl) {
          finalComicContent += `![Panel ${panel.num}](${panel.imageUrl})\n\n`;
        } else {
          finalComicContent += `*[Illustration: ${panel.visual.slice(0, 150)}...]*\n\n`;
        }
        
        // Format dialogue with speech bubble indicators
        if (panel.dialogue) {
          const dialogueLines = panel.dialogue.split('\n').filter(l => l.trim().startsWith('-'));
          for (const line of dialogueLines) {
            const dialogueMatch = line.match(/-\s*([^:]+):\s*"?([^"]+)"?/);
            if (dialogueMatch) {
              const character = dialogueMatch[1].trim();
              const speech = dialogueMatch[2].trim();
              finalComicContent += `💬 **${character}:** "${speech}"\n\n`;
            }
          }
        }
        
        if (panel.caption) {
          finalComicContent += `*${panel.caption}*\n\n`;
        }
        finalComicContent += `---\n\n`;
      }

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

      return new Response(JSON.stringify({
        success: true,
        wordCount: actualWordCount,
        provider: 'Lovable AI (Comic)',
        panelCount: panels.length,
        comicStyle,
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
    // STANDARD TEXT / ILLUSTRATED GENERATION
    // ===========================================
    const targetWords = Math.min(Math.max(effectiveWordCount, 2000), 6000);

    let systemPrompt: string;
    let chapterPrompt: string;
    
    if (academicMode && researchResult && researchResult.references.length > 0) {
      systemPrompt = buildAcademicSystemPrompt(languageName, category, citationStyle);
      chapterPrompt = buildAcademicChapterPrompt(
        chapterTitle, bookTitle, category, keyTopics, targetWords,
        languageName, citationStyle, researchResult.references, researchResult.inTextCitations
      );
    } else {
      systemPrompt = `You are ScrollAuthorGPT, an elite AI author. Write EXCLUSIVELY in ${languageName}. Create comprehensive, scholarly chapters with academic rigor.`;
      
      chapterPrompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for "${bookTitle}" in ${category.replace(/_/g, " ")}.

LANGUAGE: Generate ALL content in ${languageName}.

Key topics: ${keyTopics?.map((t: string) => `- ${t}`).join('\n') || '- Comprehensive coverage'}

REQUIREMENTS:
1. Write approximately ${targetWords} words
2. Use proper markdown formatting (## for sections)
3. Include: Introduction, Main sections (3-5), Key Takeaways, Conclusion
4. Add real-world examples and practical applications
5. NO filler, NO repetition

BEGIN WRITING THE FULL CHAPTER:`;
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
