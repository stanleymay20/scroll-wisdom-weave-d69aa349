import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, serviceClient } from "../_shared/http.ts";
import { ErrorCode, errorResponse } from "../_shared/error-codes.ts";
import { gateDenied, gateResponse, recordGateEvent } from "../_shared/usage-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BookReservation = {
  allowed: boolean;
  books_used: number;
  remaining_books: number;
};

const TIER_LIMITS = {
  free: { booksPerDay: 1, maxChapters: 5, booksPerMonth: 1 },
  student: { booksPerDay: 3, maxChapters: 30, booksPerMonth: 10 },   // Aligned with subscription.ts
  premium: { booksPerDay: 10, maxChapters: 50, booksPerMonth: 30 },  // Aligned with subscription.ts
  prophet_tier: { booksPerDay: 20, maxChapters: 100, booksPerMonth: 100 }, // Capped for sustainability
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

  // Releases the generation slot reserved before the paid model call. Assigned
  // once the reservation succeeds; invoked on every post-reservation failure.
  let refundReservation: (() => Promise<void>) | null = null;

  try {
    // Authenticate with the caller-scoped client. The service-role client is
    // created only after identity is established and is reserved for privileged
    // server-side quota/job mutations below.
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const user = { id: auth.userId };
    const userClient = auth.client;
    const sc = serviceClient();

    console.log(`[GENERATE-BOOK] User: ${user.id.slice(0, 8)}...`);

    // Admin check
    const { data: adminRole } = await userClient
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRole;
    if (isAdmin) console.log("[GENERATE-BOOK] ADMIN - bypassing limits");

    // Get subscription plan from subscriptions table (source of truth)
    const { data: subscription } = await userClient
      .from("subscriptions").select("tier, status")
      .eq("user_id", user.id).maybeSingle();

    // Only use tier if subscription is active
    const userPlan = ((subscription?.status === 'active' && subscription?.tier) ? subscription.tier : "free") as keyof typeof TIER_LIMITS;

    // Model routing respects subscription tier — admin bypass is for limits only
    const effectivePlan: keyof typeof TIER_LIMITS = isAdmin ? "prophet_tier" : userPlan;
    const limits = TIER_LIMITS[effectivePlan] || TIER_LIMITS.free;

    // Admins are never blocked, but their usage is still tracked (-1 = unlimited),
    // matching the TTS reservation contract.
    const dailyLimit = isAdmin ? -1 : limits.booksPerDay;
    const today = new Date().toISOString().split("T")[0];

    // Burst limiting: max 5 book generations per hour per user.
    //
    // Durable rather than in-memory — the previous limiter lived in a
    // process-local Map, so it reset on every cold start and was never shared
    // between edge instances. Applied before body validation on purpose: this
    // guards against hammering, so an invalid payload should still consume
    // burst budget. The paid quota (reserved further down) is the opposite and
    // is only consumed once the request is known to be well formed.
    if (!isAdmin) {
      const { data: rlData, error: rlError } = await sc.rpc("consume_rate_limit", {
        _identifier: user.id,
        _endpoint: "generate-book",
        _limit: 5,
        _window_seconds: 60 * 60,
      });

      if (rlError) {
        // Fail open: the atomic quota reservation below fails closed against
        // the same database, so an outage still stops paid work.
        console.error("[GENERATE-BOOK] Rate limit check failed:", rlError);
      } else {
        const rl = (Array.isArray(rlData) ? rlData[0] : rlData) as
          { allowed: boolean; retry_after_seconds: number } | null;
        if (rl && !rl.allowed) {
          const gate = gateDenied("RATE_LIMITED", {
            message: 'Too many book generations. Please wait before creating another.',
            currentPlan: userPlan,
          });
          return gateResponse(gate, corsHeaders);
        }
      }
    }

    // Parse request body
    const body = await req.json();
    const {
      title: rawTitle, description: rawDescription, category, numChapters, language = "en", customCover,
      bookType = "text", extendedBookType = null,
      enableReferences = false, academicMode = false, bestsellerMode = true,
      authorMode = "ai", authorDisplayName: rawAuthorName = null, penName: rawPenName = null,
      transformationPrompt: rawTransformationPrompt = null,
    } = body;

    // ── Server-side input validation ──────────────────────
    const sanitize = (s: unknown, max: number): string => {
      if (typeof s !== 'string') return '';
      return s.trim().replace(/\0/g, '').slice(0, max);
    };

    const title = sanitize(rawTitle, 200);
    const description = sanitize(rawDescription, 2000);
    const authorDisplayName = sanitize(rawAuthorName, 100);
    const penName = sanitize(rawPenName, 100);
    const transformationPrompt = sanitize(rawTransformationPrompt, 3000);

    if (!title || title.length < 1) {
      return errorResponse(ErrorCode.GENERATION_INVALID_INPUT, "Title is required.", corsHeaders);
    }

    if (!category || typeof category !== 'string' || category.length > 50) {
      return new Response(JSON.stringify({ error: "Invalid category." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof numChapters !== 'number' || !Number.isInteger(numChapters) || numChapters < 1 || numChapters > 100) {
      return new Response(JSON.stringify({ error: "Invalid chapter count." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VALID_LANGUAGES = ['en', 'fr', 'de', 'es', 'ar', 'sw', 'pt'];
    if (!VALID_LANGUAGES.includes(language)) {
      return new Response(JSON.stringify({ error: "Invalid language." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VALID_BOOK_TYPES = ['text', 'illustrated', 'comic', 'workbook', 'academic', 'professional', 'reference', 'technical', 'bestseller', 'children', 'fiction'];
    const safeExtendedBookType = extendedBookType && VALID_BOOK_TYPES.includes(extendedBookType) ? extendedBookType : null;
    const safeBookType = VALID_BOOK_TYPES.includes(bookType) ? bookType : 'text';

    const effectiveBookType = safeExtendedBookType || safeBookType;
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
    } else if (effectiveBookType === "illustrated" || bookType === "illustrated") {
      typeInstr = "ILLUSTRATED BOOK. Include [FIGURE X: description] placement suggestions. Create visual opportunities.";
    }

    const refInstr = (enableReferences || academicMode || isAcademicType)
      ? `Include "references" array per chapter: {"author","title","year","type"}.` : "";

    const bestsellerBoost = (bestsellerMode && !isAcademicType && effectiveBookType !== "comic" && effectiveBookType !== "workbook")
      ? "BESTSELLER MODE: Provocative titles, hooks, named principles, transformation promises." : "";

    // Build transformation instructions if provided
    const transformInstr = transformationPrompt 
      ? `\n\nTRANSFORMATION DIRECTIVE (apply to every chapter):\n${transformationPrompt}\n` 
      : "";

    // Generate outline via AI
    const outlinePrompt = `Create a book outline in ${languageName}. Title: "${title}". Description: "${description || "A comprehensive exploration"}". Category: ${category}. Chapters: ${effectiveChapters}. Type: ${effectiveBookType}. ${typeInstr} ${bestsellerBoost} ${refInstr}${transformInstr}

For each chapter provide: chapterNumber, title, description (2-3 sentences), keyTopics (4-5 items). All in ${languageName}. Plain text only, no markdown.

Respond as JSON: {"bookTitle":"","bookDescription":"","chapters":[{"chapterNumber":1,"title":"","description":"","keyTopics":[]}]}`;

    // ── Atomic quota reservation ──────────────────────────
    // Reserved AFTER validation and BEFORE the first paid model call, so a
    // rejected request never consumes a slot and a concurrent request can never
    // observe a stale count. Browser roles cannot execute this RPC directly.
    const { data: reservationData, error: reservationError } = await sc.rpc(
      "reserve_book_generation",
      {
        _user_id: user.id,
        _day: today,
        _books: 1,
        _limit: dailyLimit,
      },
    );

    if (reservationError) {
      console.error("[GENERATE-BOOK] Quota reservation failed:", reservationError);
      return errorResponse(
        ErrorCode.GENERATION_FAILED,
        "Unable to verify your generation allowance right now. Please try again.",
        corsHeaders,
      );
    }

    const reservation = (Array.isArray(reservationData) ? reservationData[0] : reservationData) as BookReservation | null;

    if (!reservation) {
      console.error("[GENERATE-BOOK] Quota reservation returned no result");
      return errorResponse(
        ErrorCode.GENERATION_FAILED,
        "Unable to verify your generation allowance right now. Please try again.",
        corsHeaders,
      );
    }

    if (!reservation.allowed) {
      console.log(`[GENERATE-BOOK] Daily limit reached: ${reservation.books_used}/${dailyLimit} (${userPlan})`);
      const gate = gateDenied("BOOK_LIMIT_REACHED", {
        message: `You've reached your ${userPlan === 'free' ? 'monthly' : 'daily'} book generation limit (${limits.booksPerDay} for ${userPlan}). Upgrade to keep creating.`,
        currentPlan: userPlan,
        usage: { booksGenerated: reservation.books_used, booksLimit: limits.booksPerDay },
      });
      await recordGateEvent(sc, {
        user_id: user.id, feature: "generate_book", reason: gate.reason, allowed: false,
        plan: userPlan,
        usage_snapshot: {
          used: reservation.books_used,
          limit: limits.booksPerDay,
          remaining: reservation.remaining_books,
        },
      });
      return gateResponse(gate, corsHeaders);
    }

    let reservationActive = true;
    refundReservation = async () => {
      if (!reservationActive) return;
      reservationActive = false;
      const { error: releaseError } = await sc.rpc("release_book_generation", {
        _user_id: user.id,
        _day: today,
        _books: 1,
      });
      if (releaseError) {
        console.error("[GENERATE-BOOK] Failed to refund quota reservation:", releaseError);
      }
    };

    console.log(`[GENERATE-BOOK] Reserved 1 slot — ${reservation.books_used}/${dailyLimit === -1 ? "unlimited" : dailyLimit}`);

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
      // The paid call never produced a book — give the slot back.
      await refundReservation();
      if (status === 429) {
        return gateResponse(gateDenied("RATE_LIMITED", { currentPlan: userPlan }), corsHeaders);
      }
      if (status === 402) {
        const gate = gateDenied("AI_QUOTA_EXHAUSTED", { currentPlan: userPlan });
        await recordGateEvent(sc, {
          user_id: user.id, feature: "generate_book", reason: gate.reason, allowed: false,
          plan: userPlan, usage_snapshot: { upstream_status: 402 },
        });
        return gateResponse(gate, corsHeaders);
      }
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
    const { data: book, error: bookError } = await sc.from("books").insert({
      title: bookOutline.bookTitle || title,
      description: (bookOutline.bookDescription || description) + (transformationPrompt ? `\n\n---\nTRANSFORMATION DIRECTIVE: ${transformationPrompt}` : ''),
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

    // Create generation job for progress tracking (required correctness primitive)
    const { data: genJob, error: genJobError } = await sc.from("generation_jobs").insert({
      user_id: user.id,
      book_id: book.id,
      status: 'generating',
      current_chapter: 0,
      total_chapters: effectiveChapters,
      metadata: { bookType: effectiveBookType, model: generationModel, language },
    }).select('id').single();

    if (genJobError || !genJob?.id) {
      console.error("[GENERATE-BOOK] Generation job create failed:", genJobError?.code ?? "no_row");
      // Fail closed: do not leave an untracked AI-generated book behind
      await sc.from("books").delete().eq("id", book.id);
      throw new Error("Failed to initialize book generation. Please try again.");
    }

    const jobId = genJob.id;
    console.log(`[GENERATE-BOOK] Job ${jobId.slice(0, 8)}... created`);

    // Save chapters
    const chaptersToInsert = bookOutline.chapters.map((ch: any) => ({
      book_id: book.id,
      chapter_number: ch.chapterNumber,
      title: ch.title,
      content: `## ${ch.title}\n\n${ch.description}\n\n### Key Topics\n${(ch.keyTopics || []).map((t: string) => `- ${t}`).join("\n")}\n\n*Full chapter content is being generated...*`,
      word_count: 0, is_generated: false,
    }));

    const { error: chaptersError } = await sc.from("chapters").insert(chaptersToInsert);
    if (chaptersError) {
      console.error("[GENERATE-BOOK] Chapters error:", chaptersError);
      // Mark job as failed
      await sc.from("generation_jobs").update({ status: 'failed', error_code: 'GENERATION_FAILED', error_message: chaptersError.message }).eq("id", jobId);
      throw new Error(`Failed to save chapters: ${chaptersError.message}`);
    }

    // Library linkage is part of successful creation, not optional bookkeeping.
    // A book the owner cannot discover must never be reported as a success.
    const { error: libraryError } = await sc.from("user_library").insert({
      user_id: user.id, book_id: book.id, progress_percent: 0, last_read_chapter: 1,
    });
    if (libraryError) {
      console.error("[GENERATE-BOOK] Library error:", libraryError);
      await sc.from("generation_jobs").update({
        status: 'failed',
        error_code: 'GENERATION_FAILED',
        error_message: 'Failed to add generated book to library',
      }).eq("id", jobId);
      await sc.from("chapters").delete().eq("book_id", book.id);
      await sc.from("generation_jobs").delete().eq("id", jobId);
      await sc.from("books").delete().eq("id", book.id);
      await refundReservation();
      throw new Error("Failed to add generated book to your library. Please try again.");
    }

    // The book, outline chapters, job, and owner library linkage are now
    // durably persisted, so the reserved generation slot is legitimately used.
    reservationActive = false;

    // Outline phase only — the book is NOT generated yet. Keep the job open so
    // chapter generation can proceed/resume and the publication truth guard agrees.
    await sc.from("generation_jobs").update({
      status: 'generating',
      current_chapter: 0,
      completed_at: null,
      error_code: null,
      error_message: null,
    }).eq("id", jobId);

    console.log(`[GENERATE-BOOK] Done. Daily: ${reservation.books_used}/${dailyLimit === -1 ? "unlimited" : dailyLimit}`);

    return new Response(JSON.stringify({
      success: true, message: "Book created successfully",
      bookId: book.id, jobId, outline: bookOutline,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    // Every post-reservation failure path throws, so this is the single refund
    // point for book save, job creation, chapter save and unexpected errors.
    if (refundReservation) {
      try {
        await refundReservation();
      } catch (refundError) {
        console.error("[GENERATE-BOOK] Reservation refund failed during exception handling:", refundError);
      }
    }
    console.error("[GENERATE-BOOK] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(ErrorCode.GENERATION_FAILED, msg, corsHeaders);
  }
});
