import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Word count limits by tier
const TIER_WORD_LIMITS = {
  free: 4000,
  student: 8000,
  premium: 12000,
  prophet_tier: 16000,
};

// Domain-specific minimum sources
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

interface ValidationResult {
  valid: boolean;
  errors: { code: string; message: string; severity: string }[];
  warnings: { code: string; message: string }[];
}

// ===========================================
// AUTHORITY-GRADE ACADEMIC VALIDATION
// Hard failure conditions from the contract
// ===========================================

function validateAcademicRequirements(
  content: string,
  sources: Reference[],
  category: string,
  citationStyle: string
): ValidationResult {
  const errors: { code: string; message: string; severity: string }[] = [];
  const warnings: { code: string; message: string }[] = [];
  
  const minSources = DOMAIN_MIN_SOURCES[category.toLowerCase()] || DOMAIN_MIN_SOURCES.default;
  
  // HARD FAIL: Insufficient sources
  if (sources.length < minSources) {
    errors.push({
      code: 'INSUFFICIENT_SOURCES',
      message: `${category} requires minimum ${minSources} verified sources, found ${sources.length}. Topic refinement suggested.`,
      severity: 'critical',
    });
  }
  
  // HARD FAIL: No verified sources
  const verifiedSources = sources.filter(s => s.doi || s.url);
  if (sources.length > 0 && verifiedSources.length === 0) {
    errors.push({
      code: 'UNVERIFIED_SOURCES',
      message: 'All sources must have DOI or stable academic URL',
      severity: 'critical',
    });
  }
  
  // HARD FAIL for medicine: requires peer-reviewed sources
  if (category.toLowerCase() === 'medicine') {
    const peerReviewed = sources.filter(s => s.peerReviewed);
    if (peerReviewed.length < 3) {
      errors.push({
        code: 'INSUFFICIENT_PEER_REVIEWED',
        message: 'Medical content requires at least 3 peer-reviewed sources',
        severity: 'critical',
      });
    }
  }
  
  // Check for in-text citations in content
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
  if (!/(?:^|\n)##+\s*(?:references?|bibliography|works?\s*cited)/i.test(content)) {
    errors.push({
      code: 'MISSING_REFERENCES_SECTION',
      message: 'Academic content must include a References section',
      severity: 'critical',
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function formatValidationError(result: ValidationResult): string {
  let message = '**ACADEMIC GENERATION STOPPED**\n\n';
  message += 'The following requirements were not met:\n\n';
  
  result.errors.forEach(e => {
    message += `❌ **${e.code}**: ${e.message}\n`;
  });
  
  message += '\n**To proceed:**\n';
  message += '1. Try a more specific topic with available academic literature\n';
  message += '2. Ensure the topic has peer-reviewed sources in academic databases\n';
  message += '3. Consider refining your search terms\n';
  
  return message;
}

// Format in-text citation based on style
function formatInTextCitation(ref: Reference, style: string): string {
  const { author, year } = ref;
  const lastName = author.split(',')[0] || author.split(' ').pop() || author;
  
  switch (style) {
    case 'APA':
      return `(${lastName}, ${year})`;
    case 'MLA':
      return `(${lastName})`;
    case 'Harvard':
      return `(${lastName} ${year})`;
    case 'Chicago':
      return `[${lastName}, ${year}]`;
    case 'IEEE':
      return `[1]`; // Will be numbered in order
    default:
      return `(${lastName}, ${year})`;
  }
}

// Deep Research pipeline - calls deep-research edge function for verified sources
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
    // Call the deep-research edge function
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
        mode: 'full', // 'quick' | 'full' | 'exhaustive'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[DEEP-RESEARCH] Error from deep-research function:", response.status, errorText);
      
      // Fallback to Perplexity-only research
      return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
    }

    const data = await response.json();
    console.log("[DEEP-RESEARCH] Received sources:", data.sources?.length || 0);

    // Check if we have sufficient sources
    if (!data.sources || data.sources.length === 0) {
      console.log("[DEEP-RESEARCH] No sources found, using fallback");
      return await conductFallbackResearch(topic, category, keyTopics, citationStyle);
    }

    // Check confidence - if insufficient, add warning
    if (data.metadata?.confidenceScore === 'insufficient') {
      console.log("[DEEP-RESEARCH] Insufficient sources, may need topic refinement");
    }

    // Convert sources to Reference format and generate in-text citations
    const references: Reference[] = data.sources.map((s: any) => ({
      author: s.authors?.join(', ') || 'Unknown',
      title: s.title || 'Unknown',
      year: s.year || new Date().getFullYear(),
      type: s.type || 'article',
      doi: s.doi,
      url: s.url || (s.doi ? `https://doi.org/${s.doi}` : undefined),
      journal: s.journal,
      publisher: s.publisher,
      requires_verification: !s.verified,
      verified: s.verified,
      peerReviewed: s.peerReviewed,
      database: s.database,
    }));

    const inTextCitations = references.map((ref: Reference, index: number) => 
      citationStyle === 'IEEE' ? `[${index + 1}]` : formatInTextCitation(ref, citationStyle)
    );

    // Map confidence score
    const confidenceMap: Record<string, string> = {
      'high': 'High citation density',
      'moderate': 'Moderate',
      'low': 'Introductory overview',
      'insufficient': 'Insufficient sources - verification needed',
    };

    return {
      references,
      inTextCitations,
      metadata: {
        source_count: references.length,
        source_types: data.metadata?.databasesCovered?.reduce((acc: Record<string, number>, db: string) => {
          acc[db] = (acc[db] || 0) + 1;
          return acc;
        }, {}) || {},
        confidence_score: confidenceMap[data.metadata?.confidenceScore] || 'Unknown',
        research_date: data.metadata?.researchDate || new Date().toISOString(),
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

// Fallback to Perplexity-only research if deep-research fails
async function conductFallbackResearch(
  topic: string,
  category: string,
  keyTopics: string[],
  citationStyle: string
): Promise<ResearchResult> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  
  if (!PERPLEXITY_API_KEY) {
    console.log("[RESEARCH-FALLBACK] Perplexity not configured, returning empty research");
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

  console.log("[RESEARCH-FALLBACK] Using Perplexity as fallback...");

  try {
    const searchQuery = `Find peer-reviewed academic sources for: "${topic}" in ${category.replace(/_/g, " ")}.
Key areas: ${keyTopics.join(', ')}
Return ONLY real, verifiable sources with DOIs when available.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { 
            role: "system", 
            content: `Find REAL academic references. Return as JSON array:
[{"author": "Last, First", "title": "Title", "year": 2023, "type": "journal", "doi": "optional", "url": "optional"}]`
          },
          { role: "user", content: searchQuery }
        ],
        search_mode: "academic",
      }),
    });

    if (!response.ok) {
      throw new Error("Perplexity API error");
    }

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

    const inTextCitations = references.map((ref: Reference, index: number) => 
      citationStyle === 'IEEE' ? `[${index + 1}]` : formatInTextCitation(ref, citationStyle)
    );

    return {
      references,
      inTextCitations,
      metadata: {
        source_count: references.length,
        source_types: {},
        confidence_score: references.length >= 5 ? "Moderate (Perplexity fallback)" : "Low",
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
// ACADEMIC PROMPT TEMPLATES
// Authority-grade with mandatory structure
// ===========================================

function buildAcademicSystemPrompt(language: string, category: string, citationStyle: string): string {
  return `You are ScrollLibrary Authority Engine — an academic production system for university-grade content.

ROLE: You generate scholarly, pedagogically sound, publishable learning material.
PRIORITY: Correctness > Speed. Trust > Novelty. Understanding > Volume.

LANGUAGE: Write EXCLUSIVELY in ${language}. No other languages permitted.

AUTHORSHIP RULES:
- You are an AI-assisted author, not a sole author
- Never imply credentials or authority beyond the content
- Maintain neutral, scholarly tone throughout

CITATION REQUIREMENTS (${citationStyle} format):
- EVERY factual claim must have an in-text citation
- NEVER fabricate citations — only use sources provided
- If making a claim without a source, mark it as "[requires verification]"
- Include proper ${citationStyle} formatted in-text citations

COGNITIVE STRUCTURE (MANDATORY for each chapter):
1. **Concept Introduction** — Hook the reader, provide context
2. **Structured Explanation** — Clear, logical progression of ideas
3. **Applied Examples** — Real-world case studies, practical applications
4. **Critical Reflection** — Analysis, implications, connections
5. **Key Takeaways** — Summary of main points

CODE FORMATTING (CRITICAL):
- ALL multi-line code MUST be in fenced code blocks
- ALWAYS specify language: \`\`\`python, \`\`\`typescript, etc.
- Preserve indentation exactly
- NEVER inline multi-line code in paragraphs

TABLE FORMATTING:
- Use proper markdown tables with header rows
- Ensure consistent column counts
- Tables must be readable and structured

FIELD-SPECIFIC (${category}):
${getFieldSpecificInstructions(category)}

QUALITY STANDARD: Content must be acceptable to university lecturers, graduate students, and academic reviewers.`;
}

function getFieldSpecificInstructions(category: string): string {
  const instructions: Record<string, string> = {
    medicine: `- Maintain evidence hierarchy (meta-analyses > RCTs > cohort studies)
- Include medical disclaimers
- Cite PubMed/clinical sources preferentially
- Distinguish between established evidence, interpretation, and hypothesis`,
    
    law: `- Cite case law and statutes where relevant
- Include jurisdictional disclaimers
- Note when laws may vary by jurisdiction`,
    
    science: `- Include reproducibility statements where relevant
- Cite methodology and findings separately
- Distinguish between peer-reviewed and preprint sources`,
    
    technology: `- All code must be runnable and properly formatted
- Include version information for libraries/frameworks
- Cite official documentation where possible`,
    
    business: `- Use established frameworks (Porter, SWOT, etc.) with citations
- Include tables for comparative data
- Cite case studies and research`,
    
    history: `- Distinguish between primary and secondary sources
- Include dates and contexts
- Cite historical documents where relevant`,
    
    philosophy: `- Structure arguments clearly with premises and conclusions
- Cite original philosophical texts
- Present multiple perspectives fairly`,
    
    default: `- Maintain academic rigor
- Support claims with citations
- Use clear, structured arguments`,
  };
  
  return instructions[category.toLowerCase()] || instructions.default;
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

  return `Write Chapter: "${chapterTitle}" for the book "${bookTitle}" in ${category.replace(/_/g, " ")}.

**VERIFIED SOURCES TO CITE (USE ONLY THESE):**
${sourceList}

**KEY TOPICS TO COVER:**
${keyTopics?.map((t: string) => `- ${t}`).join('\n') || '- Comprehensive coverage of the chapter topic'}

**REQUIREMENTS:**
1. Write approximately ${targetWords} words in ${language}
2. Include in-text citations using ${citationStyle} format for ALL claims
3. Use ONLY the sources listed above — no fabricated citations
4. Mark unsupported claims with "[requires verification]"

**MANDATORY STRUCTURE:**
## Introduction
[Hook + context + chapter overview]

## [Main Section 1: Key Concept]
[Structured explanation with citations]

## [Main Section 2: Applied Examples]
[Real-world applications with evidence]

## [Main Section 3: Critical Analysis]
[Deeper analysis, implications, connections]

## Key Takeaways
[Bullet point summary of main insights]

## Conclusion
[Synthesis and transition]

## References
[Full ${citationStyle} formatted bibliography of all sources cited]

**FORMAT REQUIREMENTS:**
- Use ## for main sections, ### for subsections
- Code in fenced blocks with language: \`\`\`python
- Tables in proper markdown format
- Every claim needs a citation from the source list

BEGIN WRITING THE COMPLETE ACADEMIC CHAPTER:`;
}

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

    // Authenticate user from JWT token
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
      console.error("[GENERATE-CHAPTER] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GENERATE-CHAPTER] Authenticated user: ${user.id.slice(0, 8)}...`);

    // Check if user is admin (admins bypass all restrictions)
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    const isAdmin = userRoles?.some(r => r.role === 'admin') || false;

    // Get user's subscription plan
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
    } = await req.json();

    // Verify user owns the book
    const { data: chapter } = await supabase
      .from("chapters")
      .select("book_id")
      .eq("id", chapterId)
      .single();

    if (chapter) {
      const { data: book } = await supabase
        .from("books")
        .select("creator_id")
        .eq("id", chapter.book_id)
        .single();

      if (book && book.creator_id !== user.id && !isAdmin) {
        console.log(`[GENERATE-CHAPTER] User ${user.id.slice(0, 8)}... not authorized for book`);
        return new Response(JSON.stringify({ error: "Not authorized to modify this book" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Enforce word count limit based on subscription (admins bypass)
    const effectiveWordCount = isAdmin ? wordCount : Math.min(wordCount, maxWordCount);
    if (wordCount > maxWordCount && !isAdmin) {
      console.log(`[GENERATE-CHAPTER] Capping word count from ${wordCount} to ${maxWordCount} for ${userPlan} plan`);
    }
    
    // Map language code to full language name if code is passed
    const languageMap: Record<string, string> = {
      'en': 'English',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'ar': 'Arabic',
      'sw': 'Swahili',
      'pt': 'Portuguese'
    };
    const languageName = languageMap[language] || language;
    
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");

    console.log(`[GENERATE-CHAPTER] Generating chapter ${chapterNumber}: ${chapterTitle}`);
    console.log(`[GENERATE-CHAPTER] Target words: ${effectiveWordCount}, Language: ${languageName}, Type: ${bookType}, Plan: ${userPlan}, Admin: ${isAdmin}`);
    console.log(`[GENERATE-CHAPTER] Academic Mode: ${academicMode}, Citation Style: ${citationStyle}`);

    // ===========================================
    // ACADEMIC RESEARCH MODE - HARD FAILURE PATH
    // Research MUST happen before writing
    // ===========================================
    let researchResult: ResearchResult | null = null;
    
    if (academicMode && bookType === 'text') {
      console.log("[GENERATE-CHAPTER] Academic mode enabled, conducting deep research pipeline FIRST...");
      
      researchResult = await conductDeepResearch(
        `${chapterTitle} - ${bookTitle}`,
        category,
        keyTopics || [chapterTitle],
        citationStyle,
        token
      );
      
      console.log(`[GENERATE-CHAPTER] Research complete: ${researchResult.metadata.source_count} sources found`);

      // HARD FAILURE CHECK: Validate academic requirements BEFORE generation
      const minSources = DOMAIN_MIN_SOURCES[category.toLowerCase()] || DOMAIN_MIN_SOURCES.default;
      
      if (researchResult.references.length < minSources && !isAdmin) {
        console.log(`[GENERATE-CHAPTER] HARD FAIL: Insufficient sources (${researchResult.references.length} < ${minSources})`);
        
        const errorMessage = {
          error: "Insufficient verified sources for academic content",
          code: "INSUFFICIENT_SOURCES",
          details: {
            found: researchResult.references.length,
            required: minSources,
            category: category,
            suggestion: "Topic refinement needed. Try a more specific topic with available academic literature, or select a different category.",
            suggestedRefinements: researchResult.metadata.topic_coverage 
              ? [`Try more specific terms within: ${keyTopics?.join(', ')}`, `Search in related academic databases`, `Consider broader academic context`]
              : undefined,
          },
        };
        
        return new Response(JSON.stringify(errorMessage), {
          status: 422, // Unprocessable Entity
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check for verified sources (DOI or URL)
      const verifiedSources = researchResult.references.filter(s => s.doi || s.url);
      if (verifiedSources.length === 0 && researchResult.references.length > 0 && !isAdmin) {
        console.log("[GENERATE-CHAPTER] HARD FAIL: No verifiable sources");
        
        return new Response(JSON.stringify({
          error: "No verifiable sources found",
          code: "UNVERIFIED_SOURCES",
          details: {
            message: "All sources must have DOI or stable academic URL for academic mode",
            suggestion: "Try a more established academic topic with published research",
          },
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // COMIC/CHILDREN BOOK - Visual-first with dialogues
    if (bookType === 'comic') {
      console.log("[GENERATE-CHAPTER] Generating comic book chapter with visual panels and dialogues...");
      
      const comicPrompt = `You are a professional comic book writer and illustrator. Create a COMIC BOOK STORY for "${chapterTitle}" from the book "${bookTitle}".

CRITICAL: This is a COMIC BOOK with visual storytelling AND character dialogues.

Create 5-7 PANELS for this chapter. For each panel, you MUST include:
1. [PANEL X]: Visual Description - Detailed scene for AI image generation
2. [DIALOGUE]: Character speech bubbles (who says what) - MANDATORY
3. [CAPTION]: Optional narration box (only if needed)

LANGUAGE: ALL text must be in ${languageName}.

Story context: ${keyTopics?.join(', ') || 'Tell an engaging visual story'}

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

---

[PANEL 1]
**Visual:** [Detailed visual description - describe the scene, characters, their expressions, poses, setting, action, mood in 2-3 sentences. Be specific for AI image generation.]
**Dialogue:**
- CHARACTER_NAME: "What they say in speech bubble"
- CHARACTER_NAME: "Their response"
**Caption:** "[Optional narration - describe time/place/thought if needed]"

---

[PANEL 2]
**Visual:** [Next scene description...]
**Dialogue:**
- CHARACTER_NAME: "Speech..."
**Caption:** "[Optional]"

---

(Continue for 5-7 panels)

CRITICAL REQUIREMENTS:
- EVERY panel MUST have character dialogue (speech bubbles) - this is what makes it a comic!
- Dialogues should be natural, expressive, and move the story forward
- Use different characters talking to each other
- Include emotions, exclamations, questions in dialogue
- Visual descriptions should show characters' expressions matching their words
- Tell a complete story arc with beginning, conflict, and resolution
- Make dialogues age-appropriate and engaging
- Each panel should flow naturally to the next`;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
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
            { role: "system", content: `You create visual storyboards for children's picture books. Your visual descriptions are detailed and vivid. Your captions are minimal and child-friendly. Write all captions in ${languageName}.` },
            { role: "user", content: comicPrompt }
          ],
        }),
      });

      if (!comicResponse.ok) {
        const errorText = await comicResponse.text();
        console.error("[GENERATE-CHAPTER] Comic generation error:", comicResponse.status, errorText);
        throw new Error("Failed to generate comic chapter");
      }

      const comicData = await comicResponse.json();
      let comicContent = comicData.choices?.[0]?.message?.content || "";
      
      console.log("[GENERATE-CHAPTER] Comic script generated, now generating images for panels...");

      // Parse panels and generate images for each - now with dialogues
      const panelRegex = /\[PANEL\s*(\d+)\]\s*\*\*Visual:\*\*\s*([\s\S]*?)\*\*Dialogue:\*\*\s*([\s\S]*?)(?:\*\*Caption:\*\*\s*"?([^"]*)"?)?(?=\s*---|\s*\[PANEL|\s*$)/gi;
      let match;
      const panels: { num: number; visual: string; dialogue: string; caption: string; imageUrl?: string }[] = [];
      
      while ((match = panelRegex.exec(comicContent)) !== null) {
        panels.push({
          num: parseInt(match[1]),
          visual: match[2].trim(),
          dialogue: match[3].trim(),
          caption: (match[4] || '').trim(),
        });
      }

      console.log(`[GENERATE-CHAPTER] Found ${panels.length} panels to illustrate`);

      // Generate images for each panel (limit to avoid rate limits)
      for (let i = 0; i < Math.min(panels.length, 6); i++) {
        const panel = panels[i];
        try {
          console.log(`[GENERATE-CHAPTER] Generating image for panel ${panel.num}...`);
          
          const imagePrompt = `Children's book illustration. ${panel.visual} Style: Colorful, friendly, child-safe, whimsical, professional children's book art. No text in image.`;
          
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
              console.log(`[GENERATE-CHAPTER] Image generated for panel ${panel.num}`);
            }
          } else {
            console.error(`[GENERATE-CHAPTER] Failed to generate image for panel ${panel.num}`);
          }
          
          // Add delay to avoid rate limits
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgError) {
          console.error(`[GENERATE-CHAPTER] Image generation error for panel ${panel.num}:`, imgError);
        }
      }

      // Build final comic chapter content with images and dialogues
      let finalComicContent = `# ${chapterTitle}\n\n`;
      finalComicContent += `*A comic story from "${bookTitle}"*\n\n---\n\n`;
      
      for (const panel of panels) {
        finalComicContent += `## Panel ${panel.num}\n\n`;
        if (panel.imageUrl) {
          finalComicContent += `![Panel ${panel.num}](${panel.imageUrl})\n\n`;
        } else {
          finalComicContent += `*[Illustration: ${panel.visual.slice(0, 200)}...]*\n\n`;
        }
        // Add dialogue bubbles
        if (panel.dialogue) {
          const dialogueLines = panel.dialogue.split('\n').filter(l => l.trim().startsWith('-'));
          for (const line of dialogueLines) {
            const dialogueMatch = line.match(/-\s*([^:]+):\s*"?([^"]+)"?/);
            if (dialogueMatch) {
              const character = dialogueMatch[1].trim();
              const speech = dialogueMatch[2].trim();
              finalComicContent += `**${character}:** "${speech}"\n\n`;
            }
          }
        }
        // Add caption/narration if exists
        if (panel.caption) {
          finalComicContent += `*${panel.caption}*\n\n`;
        }
        finalComicContent += `---\n\n`;
      }

      const actualWordCount = finalComicContent.split(/\s+/).filter((word: string) => word.length > 0).length;
      console.log(`[GENERATE-CHAPTER] Comic chapter word count: ${actualWordCount}`);

      // Update chapter in database
      const { error: updateError } = await supabase
        .from("chapters")
        .update({
          content: finalComicContent,
          word_count: actualWordCount,
          is_generated: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chapterId);

      if (updateError) {
        console.error("[GENERATE-CHAPTER] Error updating comic chapter:", updateError);
        throw new Error(`Failed to save comic chapter: ${updateError.message}`);
      }

      console.log(`[GENERATE-CHAPTER] Comic chapter ${chapterNumber} saved successfully`);

      return new Response(
        JSON.stringify({
          success: true,
          wordCount: actualWordCount,
          provider: 'Lovable AI (Comic)',
          panelCount: panels.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // ===========================================
    // STANDARD TEXT / ILLUSTRATED BOOK GENERATION
    // ===========================================

    // Validate and cap word count
    const targetWords = Math.min(Math.max(effectiveWordCount, 2000), 6000);
    const maxTokens = Math.min(Math.ceil(targetWords * 1.3), 8000);

    console.log(`[GENERATE-CHAPTER] Adjusted target words: ${targetWords}, max_tokens: ${maxTokens}`);

    // Check if DeepSeek is available, otherwise use Lovable AI
    const useDeepSeek = !!DEEPSEEK_API_KEY;
    console.log(`[GENERATE-CHAPTER] Using AI provider: ${useDeepSeek ? 'DeepSeek' : 'Lovable AI (Gemini)'}`);

    // Build prompts based on mode
    let systemPrompt: string;
    let chapterPrompt: string;
    
    if (academicMode && researchResult && researchResult.references.length > 0) {
      // ACADEMIC MODE: Use authority-grade prompts
      systemPrompt = buildAcademicSystemPrompt(languageName, category, citationStyle);
      chapterPrompt = buildAcademicChapterPrompt(
        chapterTitle,
        bookTitle,
        category,
        keyTopics,
        targetWords,
        languageName,
        citationStyle,
        researchResult.references,
        researchResult.inTextCitations
      );
    } else {
      // CREATIVE MODE: Standard generation
      systemPrompt = `You are ScrollAuthorGPT, an elite AI author. You write EXCLUSIVELY in ${languageName}. You NEVER use any other language. You write with depth, wisdom, academic rigor, and engaging prose that educates and inspires readers. ALL your output must be in ${languageName} only.`;
      
      chapterPrompt = `You are ScrollAuthorGPT, an elite AI author renowned for creating comprehensive, scholarly book chapters.

Write Chapter ${chapterNumber}: "${chapterTitle}" for the book "${bookTitle}" in the ${category.replace(/_/g, " ")} category.

CRITICAL LANGUAGE REQUIREMENT - MANDATORY:
Generate ALL content strictly in ${languageName}.
Do NOT use English (unless ${languageName} IS English).
Do NOT mix languages.
Every word, heading, example, and reference must be in ${languageName}.

Key topics to cover:
${keyTopics?.map((t: string) => `- ${t}`).join('\n') || '- Comprehensive coverage of the chapter topic'}

CRITICAL REQUIREMENTS:
1. Write approximately ${targetWords} words. Aim for quality over quantity.
2. WRITE ENTIRELY IN ${languageName} - this is non-negotiable.
3. Use proper markdown formatting:
   - ## for main section headers (in ${languageName})
   - ### for subsection headers (in ${languageName})
   - **bold** for emphasis
   - Bullet points and numbered lists where appropriate
4. Structure your chapter with these sections:
   - Introduction: Hook the reader, introduce the topic
   - Main sections (3-5): Cover key topics with examples and analysis
   - Key Takeaways: Summarize main points
   - Conclusion: Wrap up and transition
5. Include:
   - Real-world examples and case studies
   - Relevant insights and practical applications
   - Expert perspectives where appropriate
6. Write with academic rigor but remain accessible
7. NO filler, NO repetition - every paragraph must add unique value
8. This is a COMPLETE chapter - do not truncate or summarize

BEGIN WRITING THE FULL CHAPTER NOW IN ${languageName}:`;
    }

    let chapterContent: string = "";
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        if (useDeepSeek) {
          console.log(`[GENERATE-CHAPTER] Calling DeepSeek API (attempt ${retryCount + 1}), max_tokens: ${maxTokens}...`);
          const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: chapterPrompt }
              ],
              max_tokens: maxTokens,
              temperature: 0.7,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[GENERATE-CHAPTER] DeepSeek API error:", response.status, errorText);
            
            if (response.status === 429) {
              if (retryCount < maxRetries - 1) {
                retryCount++;
                console.log(`[GENERATE-CHAPTER] Rate limited, waiting ${5000 * retryCount}ms before retry...`);
                await new Promise(r => setTimeout(r, 5000 * retryCount));
                continue;
              }
              throw new Error("Rate limits exceeded, please try again later.");
            }
            if (response.status === 402 || response.status === 401) {
              throw new Error("DeepSeek API authentication failed. Please check your API key.");
            }
            throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          chapterContent = data.choices?.[0]?.message?.content;
          console.log("[GENERATE-CHAPTER] DeepSeek response received successfully");
          break;
        } else {
          // Use Lovable AI (Gemini) as fallback
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) {
            throw new Error("No AI API key configured (DEEPSEEK_API_KEY or LOVABLE_API_KEY required)");
          }
          
          console.log(`[GENERATE-CHAPTER] Calling Lovable AI Gemini (attempt ${retryCount + 1})...`);
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
            const errorText = await response.text();
            console.error("[GENERATE-CHAPTER] Lovable AI gateway error:", response.status, errorText);
            
            if (response.status === 429) {
              if (retryCount < maxRetries - 1) {
                retryCount++;
                console.log(`[GENERATE-CHAPTER] Rate limited, waiting ${5000 * retryCount}ms before retry...`);
                await new Promise(r => setTimeout(r, 5000 * retryCount));
                continue;
              }
              throw new Error("Rate limits exceeded, please try again later.");
            }
            throw new Error(`Lovable AI error: ${response.status}`);
          }

          const data = await response.json();
          chapterContent = data.choices?.[0]?.message?.content;
          console.log("[GENERATE-CHAPTER] Lovable AI response received successfully");
          break;
        }
      } catch (error) {
        console.error(`[GENERATE-CHAPTER] Attempt ${retryCount + 1} failed:`, error);
        if (retryCount >= maxRetries - 1) throw error;
        retryCount++;
        await new Promise(r => setTimeout(r, 3000 * retryCount));
      }
    }

    if (!chapterContent) {
      throw new Error("No content generated after retries");
    }

    console.log(`[GENERATE-CHAPTER] Generated chapter content: ${chapterContent.length} characters`);

    let finalContent = chapterContent;

    // Add academic front matter and reference section for academic mode
    if (academicMode && researchResult && researchResult.references.length > 0) {
      // Add front matter disclaimer
      const frontMatter = `> **Academic Content Notice**
> This chapter is an AI-assisted academic synthesis. All citations are from verified academic databases.
> Users remain responsible for verification before academic submission.

---

`;
      
      // Check if References section exists, if not add it
      if (!/(?:^|\n)##+\s*references/i.test(finalContent)) {
        const referenceSection = `

---

## References

${researchResult.references.map((ref) => {
  switch (citationStyle) {
    case 'APA':
      return `${ref.author} (${ref.year}). *${ref.title}*.${ref.journal ? ` ${ref.journal}.` : ref.publisher ? ` ${ref.publisher}.` : ''}${ref.doi ? ` https://doi.org/${ref.doi}` : ref.url ? ` ${ref.url}` : ''}`;
    case 'Harvard':
      return `${ref.author} (${ref.year}) ${ref.title}.${ref.journal ? ` ${ref.journal}.` : ref.publisher ? ` ${ref.publisher}.` : ''}${ref.url ? ` Available at: ${ref.url}` : ''}`;
    case 'IEEE':
      return `[${researchResult.references.indexOf(ref) + 1}] ${ref.author}, "${ref.title},"${ref.journal ? ` ${ref.journal},` : ''} ${ref.year}.${ref.doi ? ` DOI: ${ref.doi}` : ''}`;
    case 'Chicago':
      return `${ref.author}. ${ref.title}.${ref.publisher ? ` ${ref.publisher},` : ''} ${ref.year}.${ref.url ? ` ${ref.url}.` : ''}`;
    default:
      return `${ref.author} (${ref.year}). ${ref.title}.`;
  }
}).join('\n\n')}
`;
        finalContent = frontMatter + finalContent + referenceSection;
      } else {
        finalContent = frontMatter + finalContent;
      }
    }

    // ILLUSTRATED BOOK - Add context-aware illustrations
    if (bookType === 'illustrated') {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        console.log("[GENERATE-CHAPTER] Generating context-aware illustration prompts...");

        // Extract key concepts from the generated content for relevant illustrations
        const contentSummary = chapterContent.slice(0, 2000);

        const illustrationPrompt = `Analyze this chapter content and create 3 HIGHLY RELEVANT illustration ideas that directly visualize the key concepts discussed.

CHAPTER CONTENT EXCERPT:
${contentSummary}

CHAPTER: "${chapterTitle}" from "${bookTitle}"
CATEGORY: ${category.replace(/_/g, " ")}

CRITICAL REQUIREMENTS:
1. Each illustration MUST directly relate to specific concepts mentioned in the chapter
2. Create educational visuals that help readers understand the material
3. Each prompt must be safe and suitable for general audiences
4. NO text inside the image

FORMAT EXACTLY:
---
[ILLUSTRATION 1]
**Concept:** [Which specific topic this illustrates]
**Visual:** [2-3 sentence detailed scene description]
---`;

        try {
          const illustrationResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "You create illustration concepts for educational books. Be concise." },
                { role: "user", content: illustrationPrompt }
              ],
            }),
          });

          if (illustrationResponse.ok) {
            const illustrationData = await illustrationResponse.json();
            const illustrationContent = illustrationData.choices?.[0]?.message?.content || "";
            
            // Parse illustration prompts
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

            console.log(`[GENERATE-CHAPTER] Found ${illustrations.length} illustration prompts`);

            // Generate images for each illustration (limit to 3)
            for (let i = 0; i < Math.min(illustrations.length, 3); i++) {
              const ill = illustrations[i];
              try {
                console.log(`[GENERATE-CHAPTER] Generating illustration ${ill.num}...`);
                
                const imagePrompt = `Educational book illustration for ${category.replace(/_/g, " ")}. ${ill.visual} Style: Professional, educational, clear, detailed. No text in image.`;
                
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
                    ill.imageUrl = imageUrl;
                    console.log(`[GENERATE-CHAPTER] Illustration ${ill.num} generated`);
                  }
                }
                
                await new Promise(r => setTimeout(r, 1000));
              } catch (imgError) {
                console.error(`[GENERATE-CHAPTER] Illustration error:`, imgError);
              }
            }

            // Insert illustrations at relevant points in the content
            if (illustrations.some(ill => ill.imageUrl)) {
              let illustrationSection = '\n\n---\n\n## Chapter Illustrations\n\n';
              for (const ill of illustrations) {
                if (ill.imageUrl) {
                  illustrationSection += `### ${ill.concept || `Illustration ${ill.num}`}\n\n`;
                  illustrationSection += `![${ill.concept || `Illustration ${ill.num}`}](${ill.imageUrl})\n\n`;
                  illustrationSection += `*${ill.visual.slice(0, 150)}*\n\n`;
                }
              }
              finalContent += illustrationSection;
            }
          }
        } catch (illustrationError) {
          console.error("[GENERATE-CHAPTER] Illustration generation failed:", illustrationError);
        }
      }
    }

    const actualWordCount = finalContent.split(/\s+/).filter((word: string) => word.length > 0).length;
    console.log(`[GENERATE-CHAPTER] Final chapter word count: ${actualWordCount}`);

    // Prepare chapter update data
    const updateData: any = {
      content: finalContent,
      word_count: actualWordCount,
      is_generated: true,
      updated_at: new Date().toISOString(),
      academic_mode: academicMode,
      citation_style: academicMode ? citationStyle : null,
    };

    // Store research metadata and references for academic mode
    if (academicMode && researchResult) {
      updateData.chapter_references = researchResult.references;
      updateData.research_metadata = researchResult.metadata;
    }

    // Update chapter in database
    const { error: updateError } = await supabase
      .from("chapters")
      .update(updateData)
      .eq("id", chapterId);

    if (updateError) {
      console.error("[GENERATE-CHAPTER] Error updating chapter:", updateError);
      throw new Error(`Failed to save chapter: ${updateError.message}`);
    }

    console.log(`[GENERATE-CHAPTER] Chapter ${chapterNumber} saved successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        wordCount: actualWordCount,
        provider: useDeepSeek ? 'DeepSeek' : 'Lovable AI (Gemini)',
        academicMode: academicMode,
        researchMetadata: academicMode ? researchResult?.metadata : undefined,
        sourceCount: researchResult?.references.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[GENERATE-CHAPTER] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        code: error instanceof Error && error.message.includes('Insufficient') ? 'INSUFFICIENT_SOURCES' : 'GENERATION_ERROR',
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
