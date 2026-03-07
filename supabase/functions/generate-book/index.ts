import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIER_LIMITS = {
  free: { booksPerDay: 1, maxChapters: 5, booksPerMonth: 1 },
  student: { booksPerDay: 5, maxChapters: 30, booksPerMonth: 30 },
  premium: { booksPerDay: 15, maxChapters: 50, booksPerMonth: -1 },
  prophet_tier: { booksPerDay: 100, maxChapters: 100, booksPerMonth: -1 },
} as const;

// Trial period ended — all limits now enforced based on subscription tier

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

const LANG_MAP: Record<string, string> = {
  en: "English", fr: "French", de: "German", es: "Spanish",
  ar: "Arabic", sw: "Swahili", pt: "Portuguese",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (req.method === "POST") {
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.healthCheck) {
        return new Response(JSON.stringify({ ok: true, function: "generate-book" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch { /* ignore */ }
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase configuration is missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GENERATE-BOOK] User: ${user.id.slice(0, 8)}...`);

    // Admin check
    const { data: adminRole } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRole;
    if (isAdmin) console.log("[GENERATE-BOOK] ADMIN - bypassing limits");

    // Get subscription plan from subscriptions table (source of truth)
    const { data: subscription } = await supabase
      .from("subscriptions").select("tier, status")
      .eq("user_id", user.id).maybeSingle();

    // Only use tier if subscription is active
    const userPlan = ((subscription?.status === 'active' && subscription?.tier) ? subscription.tier : "free") as keyof typeof TIER_LIMITS;

    // Profile for daily limits tracking only
    const { data: profile } = await supabase
      .from("profiles").select("daily_book_count, last_book_date")
      .eq("user_id", user.id).maybeSingle();

    // Model routing respects subscription tier — admin bypass is for limits only
    const effectivePlan: keyof typeof TIER_LIMITS = isAdmin ? "prophet_tier" : userPlan;
    const limits = TIER_LIMITS[effectivePlan] || TIER_LIMITS.free;

    const today = new Date().toISOString().split("T")[0];
    const currentCount = profile?.last_book_date === today ? (profile?.daily_book_count || 0) : 0;

    if (!isAdmin && currentCount >= limits.booksPerDay) {
      return new Response(JSON.stringify({
        error: `Daily book limit reached (${limits.booksPerDay}/day for ${userPlan}). Upgrade for more.`,
      }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse request body
    const body = await req.json();
    const {
      title, description, category, numChapters, language = "en", customCover,
      bookType = "text", extendedBookType = null,
      enableReferences = false, academicMode = false, bestsellerMode = true,
      authorMode = "ai", authorDisplayName = null, penName = null,
    } = body;

    const effectiveBookType = extendedBookType || bookType;
    const isAcademicType = ["academic", "technical", "reference", "professional"].includes(effectiveBookType);
    const effectiveChapters = Math.min(numChapters, limits.maxChapters);
    const languageName = LANG_MAP[language] || "English";

    // Resolve author name
    const resolvedAuthorName = authorMode === "user_name" ? (authorDisplayName || "ScrollLibrary Author")
      : authorMode === "pen_name" ? (penName || "Anonymous")
      : authorMode === "hidden" ? "Anonymous" : "ScrollAuthorGPT";

    const generationModel = getModelForPlan(userPlan);
    console.log(`[GENERATE-BOOK] "${title}" | ${effectiveChapters}ch | ${languageName} | ${effectiveBookType} | model: ${generationModel} | plan: ${userPlan}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build book type instructions — pipeline-aware outline generation
    let typeInstr = "Focus on engaging narrative and transformation.";
    if (effectiveBookType === "comic") {
      typeInstr = "COMIC/GRAPHIC NOVEL. Each chapter is a visual scene with panel-based dialogue. Focus on visual storytelling and character arcs.";
    } else if (effectiveBookType === "children") {
      typeInstr = "CHILDREN'S BOOK. Simple, age-appropriate language. Short chapter titles. Each chapter is a self-contained story beat with a lesson or emotional moment. NO complex vocabulary.";
    } else if (effectiveBookType === "workbook") {
      typeInstr = "WORKBOOK. Each chapter MUST have fill-in prompts, tables, reflection questions, action checkboxes. Max 1800 words. Titles should be action-oriented.";
    } else if (effectiveBookType === "professional") {
      typeInstr = "PROFESSIONAL GUIDE. Use strategic, framework-driven titles. Each chapter covers a distinct business concept with actionable frameworks. Titles like 'Strategic [Topic]: [Specific Focus]'.";
    } else if (effectiveBookType === "reference") {
      typeInstr = "REFERENCE HANDBOOK. Use encyclopedic, lookup-ready titles. Each chapter covers a distinct domain area. Titles like '[Topic]: Definitions, Methods, and Best Practices'.";
    } else if (effectiveBookType === "technical" || effectiveBookType === "academic") {
      const academicLabel = effectiveBookType === "technical" ? "TECHNICAL GUIDE" : "ACADEMIC TEXTBOOK";
      typeInstr = `${academicLabel}. Use literal descriptive titles, learning objectives, technical tone. NO metaphorical titles (e.g. "Journey", "Wizard"). Use "Chapter X: [Topic]" format.`;
    } else if (effectiveBookType === "text") {
      typeInstr = "STANDARD TEXT. Clear, informative chapter titles. Adapt structure to the subject matter. No forced bestseller hooks unless naturally appropriate.";
    } else if (effectiveBookType === "bestseller" || bestsellerMode) {
      typeInstr = "BESTSELLER. Provocative titles, hooks, named principles, transformation promises. Use 'The [Concept]' or 'How to [Action]' style titles.";
    } else if (bookType === "illustrated") {
      typeInstr = "ILLUSTRATED BOOK. Include [IMAGE: description] placement suggestions.";
    }

    const refInstr = (enableReferences || academicMode || isAcademicType)
      ? `Include "references" array per chapter: {"author","title","year","type"}.` : "";

    const bestsellerBoost = (bestsellerMode && !isAcademicType && effectiveBookType !== "comic" && effectiveBookType !== "workbook")
      ? "BESTSELLER MODE: Provocative titles, hooks, named principles, transformation promises." : "";

    // Generate outline via AI
    const outlinePrompt = `Create a book outline in ${languageName}. Title: "${title}". Description: "${description || "A comprehensive exploration"}". Category: ${category}. Chapters: ${effectiveChapters}. Type: ${effectiveBookType}. ${typeInstr} ${bestsellerBoost} ${refInstr}

For each chapter provide: chapterNumber, title, description (2-3 sentences), keyTopics (4-5 items). All in ${languageName}. Plain text only, no markdown.

Respond as JSON: {"bookTitle":"","bookDescription":"","chapters":[{"chapterNumber":1,"title":"","description":"","keyTopics":[]}]}`;

    const outlineResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: generationModel,
        messages: [
          { role: "system", content: "You create detailed book outlines. Respond with valid JSON only. No markdown in titles." },
          { role: "user", content: outlinePrompt },
        ],
      }),
    });

    if (!outlineResponse.ok) {
      const status = outlineResponse.status;
      console.error("[GENERATE-BOOK] AI error:", status);
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("Failed to generate outline");
    }

    const outlineData = await outlineResponse.json();
    const outlineContent = outlineData.choices?.[0]?.message?.content;

    let bookOutline;
    try {
      const jsonMatch = outlineContent.match(/\{[\s\S]*\}/);
      bookOutline = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (!bookOutline) throw new Error("No JSON");
    } catch {
      console.error("[GENERATE-BOOK] Parse fallback");
      bookOutline = {
        bookTitle: title,
        bookDescription: description || "A comprehensive exploration of the topic",
        chapters: Array.from({ length: effectiveChapters }, (_, i) => ({
          chapterNumber: i + 1, title: `Chapter ${i + 1}`,
          description: "Content pending generation", keyTopics: ["Topic 1", "Topic 2", "Topic 3"],
        })),
      };
    }

    console.log("[GENERATE-BOOK] Outline ready, saving...");

    // Save book
    const { data: book, error: bookError } = await supabase.from("books").insert({
      title: bookOutline.bookTitle || title,
      description: bookOutline.bookDescription || description,
      category, total_chapters: effectiveChapters,
      is_published: false, is_featured: false,
      author_ai_agent: resolvedAuthorName,
      cover_image_url: customCover || null,
      creator_id: user.id, user_id: user.id,
      language, book_type: effectiveBookType,
    }).select().single();

    if (bookError) {
      console.error("[GENERATE-BOOK] Book save error:", bookError);
      throw new Error(`Failed to save book: ${bookError.message}`);
    }

    console.log(`[GENERATE-BOOK] Book ${book.id.slice(0, 8)}... saved`);

    // Save chapters
    const chaptersToInsert = bookOutline.chapters.map((ch: any) => ({
      book_id: book.id,
      chapter_number: ch.chapterNumber,
      title: ch.title,
      content: `## ${ch.title}\n\n${ch.description}\n\n### Key Topics\n${(ch.keyTopics || []).map((t: string) => `- ${t}`).join("\n")}\n\n*Full chapter content is being generated...*`,
      word_count: 0, is_generated: false,
    }));

    const { error: chaptersError } = await supabase.from("chapters").insert(chaptersToInsert);
    if (chaptersError) {
      console.error("[GENERATE-BOOK] Chapters error:", chaptersError);
      throw new Error(`Failed to save chapters: ${chaptersError.message}`);
    }

    // Add to library
    const { error: libraryError } = await supabase.from("user_library").insert({
      user_id: user.id, book_id: book.id, progress_percent: 0, last_read_chapter: 1,
    });
    if (libraryError) console.error("[GENERATE-BOOK] Library error:", libraryError);

    // Update daily count
    await supabase.from("profiles").update({
      daily_book_count: currentCount + 1, last_book_date: today,
    }).eq("user_id", user.id);

    console.log(`[GENERATE-BOOK] Done. Daily: ${currentCount + 1}/${limits.booksPerDay}`);

    return new Response(JSON.stringify({
      success: true, message: "Book created successfully",
      bookId: book.id, outline: bookOutline,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[GENERATE-BOOK] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
