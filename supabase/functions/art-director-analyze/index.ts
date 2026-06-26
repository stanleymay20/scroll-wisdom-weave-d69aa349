// AI Publishing Art Director — Slice 1
// Analyzes a chapter and returns 0–3 publication-grade visual recommendations.
// Never inserts content. Never blocks chapter save. Analyze-only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const s = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ART-DIRECTOR] ${step}${s}`);
};

const CATEGORIES = [
  "executive_photo",
  "infographic",
  "chart",
  "map",
  "timeline",
  "architecture",
  "conceptual",
] as const;

const SYSTEM_PROMPT = `You are the AI Publishing Art Director for ScrollLibrary.

Your job: read a single book chapter and recommend at most THREE visuals that would meaningfully improve publication quality and reader comprehension. Behave like an experienced art director at Harvard Business Review, McKinsey, Bloomberg, or Penguin Random House — not an image generator.

HARD RULES
- Recommend 0–3 visuals. Quality over volume. Most chapters need 0–2.
- If no visual would clearly improve comprehension, return an empty recommendations array AND a one-sentence skipped_reason. Do not invent reasons.
- Never recommend decorative imagery, generic stock-style filler, or visuals that merely restate the text.
- Prefer infographics / charts / timelines / maps / architecture diagrams when they explain a concept better than a photo can.
- Use "executive_photo" only for genuine editorial-photography moments (a person speaking, a team working, a facility, a market scene). It must read as real photojournalism — never cartoon, never illustrated, never with rendered text.

OUTPUT FIELDS PER RECOMMENDATION
- category: one of executive_photo | infographic | chart | map | timeline | architecture | conceptual
- reason: 1 sentence explaining WHY this visual helps the reader. No process talk, no AI wording.
- caption: publication-grade caption. Specific to the content. 6–18 words. Title case or sentence case. NEVER generic ("A clean two-column visual", "framework diagram", "image of business people"). NEVER prompt-like.
- alt_text: short accessible description, 8–20 words, content-specific.
- prompt: art-directed image-generation brief. Include subject, composition, palette guidance, and explicit negatives ("no text in image, no watermark, no warped faces, no cartoon style"). For executive_photo include "photorealistic editorial photography, natural lighting, 35mm, shallow depth of field". For infographic/chart/architecture include "clean vector, corporate palette navy/slate/white with one accent, labeled, no rendered text artifacts".
- alternative_prompts: array of exactly 2 alternative prompts exploring different compositions/angles for the same concept.
- placement_anchor: a verbatim substring (40–120 characters) copied EXACTLY from the chapter where the visual belongs. Must be unique enough to locate. If you cannot find a stable anchor, set placement_anchor to null and provide suggested_section_title instead.
- suggested_section_title: the nearest section heading (without markdown #), used only when placement_anchor is null.

NEVER produce captions or alt_text that contain: "AI", "generated", "figure shows", "image of", "visual representation", "this image", "prompt", "render".`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const body = await req.json().catch(() => ({}));
    const {
      chapterContent,
      bookType = "professional",
      bookTitle = "",
      chapterTitle = "",
      category = "",
      language = "en",
    } = body ?? {};

    if (typeof chapterContent !== "string" || chapterContent.trim().length < 200) {
      return new Response(
        JSON.stringify({ error: "chapterContent is required and must be at least 200 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Trim very long chapters to keep the analysis call bounded
    const trimmed = chapterContent.length > 18000
      ? chapterContent.slice(0, 18000) + "\n\n[chapter truncated for analysis]"
      : chapterContent;

    const userPrompt = `BOOK TITLE: ${bookTitle || "(untitled)"}
BOOK TYPE: ${bookType}
CATEGORY: ${category || "(unspecified)"}
CHAPTER TITLE: ${chapterTitle || "(untitled)"}
LANGUAGE: ${language}

CHAPTER CONTENT:
"""
${trimmed}
"""

Return strict JSON:
{
  "recommendations": [
    {
      "category": "executive_photo|infographic|chart|map|timeline|architecture|conceptual",
      "reason": "...",
      "caption": "...",
      "alt_text": "...",
      "prompt": "...",
      "alternative_prompts": ["...", "..."],
      "placement_anchor": "...verbatim substring from chapter, or null",
      "suggested_section_title": "...or null"
    }
  ],
  "skipped_reason": "..."
}

If recommendations is empty, skipped_reason must be a single sentence. Otherwise skipped_reason should be null. Maximum 3 recommendations.`;

    log("Analyzing chapter", {
      userId: user.id.slice(0, 8),
      chars: chapterContent.length,
      bookType,
    });

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      log("AI gateway error", { status: resp.status, body: errText.slice(0, 200) });
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please retry shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Art Director analysis failed");
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      parsed = { recommendations: [], skipped_reason: "Analysis returned unparseable output." };
    }

    // Sanitize + validate
    const PROMPT_LEAK = /\b(ai|generated|prompt|render(ed)?|figure shows|image of|visual representation|this image)\b/i;
    const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
    const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    const valid = recs
      .map((r: any) => {
        const category = CATEGORIES.includes(r?.category) ? r.category : null;
        const caption = clean(r?.caption);
        const altText = clean(r?.alt_text);
        const reason = clean(r?.reason);
        const prompt = clean(r?.prompt);
        const alts = Array.isArray(r?.alternative_prompts)
          ? r.alternative_prompts.map(clean).filter(Boolean).slice(0, 2)
          : [];
        const anchorRaw = clean(r?.placement_anchor);
        const anchor = anchorRaw && chapterContent.includes(anchorRaw) ? anchorRaw : null;
        const suggested = clean(r?.suggested_section_title) || null;

        // Reject any caption/alt that leaks AI/process language or is too generic
        if (!category || !caption || caption.length < 8) return null;
        if (PROMPT_LEAK.test(caption) || PROMPT_LEAK.test(altText)) return null;
        if (/^(a clean|a simple|framework diagram|conceptual visual|figure \d)$/i.test(caption)) return null;
        if (!prompt || prompt.length < 20) return null;

        return {
          category,
          reason,
          caption,
          alt_text: altText || caption,
          prompt,
          alternative_prompts: alts,
          placement_anchor: anchor,
          suggested_section_title: anchor ? null : suggested,
          source: "ai_generated" as const,
        };
      })
      .filter(Boolean)
      .slice(0, 3);

    const skipped_reason = valid.length === 0
      ? clean(parsed.skipped_reason) || "No visual would meaningfully improve this chapter."
      : null;

    log("Analysis complete", { count: valid.length, skipped: !!skipped_reason });

    return new Response(
      JSON.stringify({ recommendations: valid, skipped_reason }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
