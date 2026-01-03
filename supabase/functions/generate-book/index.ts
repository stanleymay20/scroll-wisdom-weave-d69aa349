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

const SYSTEM_ROLE = `You are ScrollLibrary Core Generator — NOT a casual text generator.

You are operating as:
• A top-tier publishing house
• A professional editor
• A bestseller ghostwriter
• A quality assurance system

Your output must be IMMEDIATELY PUBLISHABLE.
You MUST obey all constraints below.
If any rule is violated, you MUST rewrite the output until compliant.
Partial compliance is NOT acceptable.`;

const OUTLINE_FORMATTING_RULES = `
FORMATTING RULES (HARD FAILURE):
- Do NOT use Markdown syntax in titles or descriptions (**, ##, backticks)
- Write plain text only
- All content must be publication-ready

BESTSELLER STRUCTURE (APPLY TO CHAPTER DESCRIPTIONS):
- Each chapter MUST start with a hook concept
- Each chapter MUST introduce a named principle
- Each chapter MUST end with actionable takeaways
- Every chapter title must be compelling and memorable
- Chapter descriptions must promise transformation

LANGUAGE & VOICE:
- Conversational authority — clear, confident, human
- Written TO the reader, not AT the reader
- NO AI-sounding phrases
- Titles must be bold, not generic
`;

const BESTSELLER_OUTLINE_BOOST = `
🔒 BESTSELLER MODE ACTIVE — CHAPTER QUALITY ENFORCEMENT

For EACH chapter in the outline:
1. OPENING HOOK: Describe a compelling hook or contradiction
2. NAMED PRINCIPLE: Include a sticky, memorable concept name
3. TRANSFORMATION: Describe what the reader will become/achieve
4. QUOTABLE POTENTIAL: Note one potential quotable insight

Chapter titles MUST be:
- Provocative, not descriptive
- Promise-driven, not topic-based
- Memorable enough to share

Example BAD titles: "Understanding Leadership", "The Basics of Finance"
Example GOOD titles: "The Leadership Lie", "Why Rich People Don't Budget"
`;

// Tier limits for book generation
const TIER_LIMITS = {
  free: { booksPerDay: 1, maxChapters: 5 },
  student: { booksPerDay: 3, maxChapters: 10 },
  premium: { booksPerDay: 10, maxChapters: 20 },
  prophet_tier: { booksPerDay: 50, maxChapters: 50 },
} as const;

// NOTE: Trial mode is enforced here (server-side) to avoid client-only bypasses.
// Keep this date in sync with src/lib/config.ts.
const TRIAL_END_DATE_ISO = "2026-01-20";
const isTrialActive = () => {
  const today = new Date().toISOString().split("T")[0];
  return today <= TRIAL_END_DATE_ISO;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Minimal health check (no auth required)
  if (req.method === "POST") {
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.healthCheck) {
        return new Response(
          JSON.stringify({ ok: true, function: "generate-book", buildId: `fn:${new Date().toISOString()}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch {
      // ignore
    }
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
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GENERATE-BOOK] Authenticated user: ${user.id.slice(0, 8)}...`);

    // Get user's subscription plan and check daily limits
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, daily_book_count, last_book_date")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
    }

    const userPlan = (profile?.plan || "free") as keyof typeof TIER_LIMITS;

    // Trial bypass: do NOT cap chapters to free tier, and do NOT block on daily limits.
    const trialActive = isTrialActive();
    const effectivePlan: keyof typeof TIER_LIMITS = trialActive ? "premium" : userPlan;
    const limits = TIER_LIMITS[effectivePlan] || TIER_LIMITS.free;

    // Check daily book limits (skip during trial)
    const today = new Date().toISOString().split("T")[0];
    const currentCount = profile?.last_book_date === today ? (profile?.daily_book_count || 0) : 0;

    if (!trialActive && currentCount >= limits.booksPerDay) {
      console.log(
        `[GENERATE-BOOK] Daily limit reached for user ${user.id.slice(0, 8)}... (${effectivePlan}: ${currentCount}/${limits.booksPerDay})`
      );
      return new Response(
        JSON.stringify({
          error: `Daily book limit reached (${limits.booksPerDay} books/day for ${effectivePlan} plan). Upgrade for more.`,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { 
      title, 
      description, 
      category, 
      numChapters, 
      wordCount, 
      language = 'en', 
      customCover,
      bookType = 'text',
      enableReferences = false,
      bestsellerMode = true, // Default ON
      // Author & Imprint fields
      authorMode = 'ai',
      authorDisplayName = null,
      penName = null,
      publisherImprint = null,
      // Workbook fields
      workbookDensity = 'medium',
      // Comic fields
      comicStyleId = 'children_book',
      paletteHint = '',
      lineWeightHint = '',
      characterSheet = {},
      layoutTemplate = 5,
      textInImage = true,
      scenesPerPanel = 1,
    } = await req.json();

    // Resolve author display name based on mode
    const resolveAuthorName = (): string => {
      switch (authorMode) {
        case 'user_name':
          return authorDisplayName || 'ScrollLibrary Author';
        case 'pen_name':
          return penName || 'Anonymous';
        case 'hidden':
          return 'Anonymous';
        case 'ai':
        default:
          return 'ScrollAuthorGPT';
      }
    };
    const resolvedAuthorName = resolveAuthorName();

    console.log(`[GENERATE-BOOK] Bestseller Mode: ${bestsellerMode ? 'ENABLED' : 'disabled'}`);

    // Validate chapter limit based on plan (trial uses effectivePlan)
    const effectiveChapters = Math.min(numChapters, limits.maxChapters);
    if (numChapters > limits.maxChapters) {
      console.log(
        `[GENERATE-BOOK] Capping chapters from ${numChapters} to ${limits.maxChapters} for ${trialActive ? "trial" : effectivePlan} plan`
      );
    }
    
    // Map language code to full language name
    const languageMap: Record<string, string> = {
      'en': 'English',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'ar': 'Arabic',
      'sw': 'Swahili',
      'pt': 'Portuguese'
    };
    const languageName = languageMap[language] || 'English';
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[GENERATE-BOOK] Generating: ${title} with ${effectiveChapters} chapters`);
    console.log(`[GENERATE-BOOK] Language: ${languageName}, Book type: ${bookType}, Plan: ${userPlan}`);

    // Build outline prompt based on book type
    const bookTypeInstructions = bookType === 'comic' 
      ? `This is a COMIC/CHILDREN'S BOOK. Each chapter is a visual scene/page with minimal text (1-2 sentences max per scene).
         Focus on visual descriptions that can be illustrated.
         Structure: Scene number, Scene description (visual), Short dialogue or caption.`
      : bookType === 'illustrated'
      ? `This is an ILLUSTRATED BOOK. Include image placement suggestions within chapters.
         After key sections, note [IMAGE: description of illustration needed].`
      : `This is a TEXT-ONLY academic book. Focus on depth, rigor, and scholarly content.`;

    const referenceInstructions = enableReferences
      ? `IMPORTANT: This book requires VERIFIED ACADEMIC REFERENCES.
         For each chapter, include a "references" array with real, verifiable sources.
         Format: {"author": "Name", "title": "Work Title", "year": 2023, "type": "book|article|journal"}`
      : '';

    // Build bestseller mode boost
    const bestsellerBoost = bestsellerMode ? BESTSELLER_OUTLINE_BOOST : '';

    // First, generate the book outline
    const outlinePrompt = `You are ScrollResearchGPT, an AI agent specialized in creating comprehensive book outlines.

CRITICAL LANGUAGE REQUIREMENT:
Generate ALL content strictly in ${languageName}.
Do NOT use English (unless English is the selected language).
Do NOT mix languages.
Do NOT explain language choices.
Every title, description, and topic must be in ${languageName}.

${OUTLINE_FORMATTING_RULES}

${bestsellerBoost}

${bookTypeInstructions}

${referenceInstructions}

Create a detailed outline for a book with the following specifications:
- Title: ${title}
- Description: ${description || "A comprehensive exploration of the topic"}
- Category: ${category}
- Number of Chapters: ${effectiveChapters}
- Book Type: ${bookType}
- Language: ${languageName} (ALL content must be in this language)
${bestsellerMode ? '- BESTSELLER MODE: ACTIVE (apply all bestseller quality standards)' : ''}

For each chapter, provide:
1. Chapter number
2. Chapter title (in ${languageName}) ${bestsellerMode ? '- MUST be provocative and memorable' : ''}
3. Brief description (2-3 sentences, in ${languageName}) ${bestsellerMode ? '- MUST include the hook and transformation promise' : ''}
4. Key topics to cover (4-5 items, in ${languageName})
${bestsellerMode ? '5. Named principle (a sticky concept readers will remember)' : ''}
${bookType === 'comic' ? '6. Scene descriptions for illustrations (3-5 per chapter)' : ''}
${enableReferences ? '6. Suggested references (will be verified later)' : ''}

The book must be:
- ${bookType === 'comic' ? 'Visually engaging with minimal text' : 'Academically rigorous'}
- Well-structured with logical flow
- Each chapter should naturally lead to the next
- ${bookType === 'text' ? 'Rich in depth and substance' : 'Visual and engaging'}
- ENTIRELY in ${languageName}
${bestsellerMode ? '- BESTSELLER-GRADE: Every chapter must be worthy of a top-selling book' : ''}

Format your response as a JSON object with this structure:
{
  "bookTitle": "string",
  "bookDescription": "string",
  "language": "${languageName}",
  "bookType": "${bookType}",
  "bestsellerMode": ${bestsellerMode},
  "chapters": [
    {
      "chapterNumber": number,
      "title": "string",
      "description": "string",
      "keyTopics": ["string", "string", ...]${bestsellerMode ? ',\n      "namedPrinciple": "string",\n      "hook": "string"' : ''}${bookType === 'comic' ? ',\n      "scenes": [{"description": "string", "caption": "string"}]' : ''}${enableReferences ? ',\n      "suggestedReferences": [{"topic": "string"}]' : ''}
    }
  ]
}`;

    const systemPrompt = bestsellerMode 
      ? `You are a scholarly AI that creates detailed, well-structured book outlines with BESTSELLER-GRADE quality. Every title must be compelling and provocative. Every description must promise transformation. Always respond with valid JSON. Do NOT use Markdown syntax in titles or descriptions - use plain text only.`
      : `You are a scholarly AI that creates detailed, well-structured book outlines. Always respond with valid JSON. Do NOT use Markdown syntax in titles or descriptions - use plain text only.`;

    const outlineResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: outlinePrompt }
        ],
      }),
    });

    if (!outlineResponse.ok) {
      const errorText = await outlineResponse.text();
      console.error("[GENERATE-BOOK] AI gateway error:", outlineResponse.status, errorText);
      
      if (outlineResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (outlineResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Failed to generate book outline");
    }

    const outlineData = await outlineResponse.json();
    const outlineContent = outlineData.choices?.[0]?.message?.content;
    
    console.log("[GENERATE-BOOK] Outline generated successfully");

    // Parse the outline
    let bookOutline;
    try {
      const jsonMatch = outlineContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        bookOutline = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("[GENERATE-BOOK] Failed to parse outline:", parseError);
      bookOutline = {
        bookTitle: title,
        bookDescription: description || "A comprehensive exploration of the topic",
        chapters: Array.from({ length: effectiveChapters }, (_, i) => ({
          chapterNumber: i + 1,
          title: `Chapter ${i + 1}`,
          description: "Chapter content pending generation",
          keyTopics: ["Topic 1", "Topic 2", "Topic 3"],
        })),
      };
    }

    // Save book to database
    console.log("[GENERATE-BOOK] Saving book to database...");
    console.log(`[GENERATE-BOOK] Author mode: ${authorMode}, Resolved name: ${resolvedAuthorName}`);
    const { data: book, error: bookError } = await supabase
      .from("books")
      .insert({
        title: bookOutline.bookTitle || title,
        description: bookOutline.bookDescription || description,
        category: category,
        total_chapters: effectiveChapters,
        is_published: false,
        is_featured: false,
        author_ai_agent: resolvedAuthorName,
        // New author fields
        author_mode: authorMode,
        author_display_name: resolvedAuthorName,
        pen_name: penName || null,
        publisher_imprint: publisherImprint || null,
        cover_image_url: customCover || null,
        creator_id: user.id,
        language: language,
        book_type: bookType,
        // Workbook fields
        workbook_density: bookType === 'workbook' ? workbookDensity : null,
        // Comic fields
        comic_style_id: bookType === 'comic' ? comicStyleId : null,
        palette_hint: bookType === 'comic' ? paletteHint : null,
        line_weight_hint: bookType === 'comic' ? lineWeightHint : null,
        character_sheet: bookType === 'comic' ? characterSheet : null,
        layout_template: bookType === 'comic' ? layoutTemplate : null,
        text_in_image: bookType === 'comic' ? textInImage : null,
        scenes_per_panel: bookType === 'comic' ? scenesPerPanel : null,
      })
      .select()
      .single();

    if (bookError) {
      console.error("[GENERATE-BOOK] Error saving book:", bookError);
      throw new Error(`Failed to save book: ${bookError.message}`);
    }

    console.log(`[GENERATE-BOOK] Book saved with ID: ${book.id.slice(0, 8)}...`);

    // Save chapters to database
    const chaptersToInsert = bookOutline.chapters.map((chapter: any) => ({
      book_id: book.id,
      chapter_number: chapter.chapterNumber,
      title: chapter.title,
      content: `## ${chapter.title}\n\n${chapter.description}\n\n### Key Topics\n${chapter.keyTopics.map((t: string) => `- ${t}`).join('\n')}\n\n*Full chapter content is being generated...*`,
      word_count: 0,
      is_generated: false,
    }));

    const { error: chaptersError } = await supabase
      .from("chapters")
      .insert(chaptersToInsert);

    if (chaptersError) {
      console.error("[GENERATE-BOOK] Error saving chapters:", chaptersError);
      throw new Error(`Failed to save chapters: ${chaptersError.message}`);
    }

    console.log("[GENERATE-BOOK] Chapters saved successfully");

    // Add book to user's library
    const { error: libraryError } = await supabase
      .from("user_library")
      .insert({
        user_id: user.id,
        book_id: book.id,
        progress_percent: 0,
        last_read_chapter: 1,
      });

    if (libraryError) {
      console.error("[GENERATE-BOOK] Error adding to library:", libraryError);
    } else {
      console.log("[GENERATE-BOOK] Book added to user library");
    }

    // Update daily book count
    await supabase
      .from("profiles")
      .update({
        daily_book_count: currentCount + 1,
        last_book_date: today,
      })
      .eq("id", user.id);

    console.log(`[GENERATE-BOOK] Daily count updated: ${currentCount + 1}/${limits.booksPerDay}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Book created successfully",
        bookId: book.id,
        outline: bookOutline,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[GENERATE-BOOK] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
