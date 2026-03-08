import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cinematic Video Generation — A+++ Quality
 * 
 * Generates AI scene images + cinematic camera instructions for
 * browser-side Canvas MediaRecorder MP4 rendering.
 * 
 * Pipeline:
 * 1. AI scriptwriter creates scene plan with imagePrompts + camera moves
 * 2. AI image model generates 1024x1024 keyframes per scene
 * 3. Returns scene plan + base64 images for client-side video assembly
 */

const VISUAL_TYPES_BY_BOOK: Record<string, string[]> = {
  standard: ["title_card", "learning_objectives", "key_concept", "text_slide", "diagram_description", "summary", "quiz_prompt"],
  professional: ["title_card", "executive_summary", "framework", "data_insight", "case_study", "action_items", "strategic_question"],
  children: ["story_opening", "adventure_scene", "character_moment", "discovery", "sensory_experience", "fun_fact", "reflection_question"],
  reference: ["title_card", "definition_card", "taxonomy", "cross_reference", "example_usage", "comparison_table", "quick_quiz"],
  comic: ["panel_establishing", "dialogue_scene", "action_sequence", "reaction_shot", "learning_highlight", "cliffhanger", "takeaway"],
  workbook: ["concept_review", "worked_example", "practice_problem", "step_by_step", "solution_reveal", "self_check", "challenge"],
  illustrated: ["visual_overview", "annotated_diagram", "process_flow", "detail_zoom", "comparison_visual", "infographic", "visual_summary"],
  bestseller: ["hook", "story_beat", "key_insight", "case_narrative", "aha_moment", "framework_reveal", "call_to_action"],
};

// Camera movement instructions for client-side Ken Burns effect
const CAMERA_MOVES = [
  "slow_zoom_in",
  "slow_zoom_out",
  "pan_left",
  "pan_right",
  "pan_up",
  "ken_burns_tl_to_br",
  "ken_burns_br_to_tl",
  "static_with_pulse",
] as const;

function getBookTypeImageStyle(bookType: string): string {
  const styles: Record<string, string> = {
    standard: "Modern editorial illustration, sophisticated color theory, dramatic directional lighting, museum-quality artwork, cinematic 16:9 composition",
    professional: "Clean corporate infographic design, modern flat style with subtle gradients, navy/teal/amber palette, grid-based layout, McKinsey presentation quality",
    children: "Children's picture book illustration, soft watercolor with digital refinement, warm pastels, rounded organic shapes, Caldecott Medal quality, magical atmosphere",
    reference: "Precise technical illustration, clean vector aesthetics, structured labeling, taxonomy branches, engineering manual standard, blue-white palette",
    comic: "Publication-quality comic book art, bold ink lines, dynamic foreshortening, cel-shading with halftone shadows, dramatic panel composition",
    workbook: "Clean instructional design illustration, step-by-step visual clarity, numbered annotations, friendly aesthetics, educational textbook quality",
    illustrated: "Detailed scientific illustration, cross-section views, annotated diagrams, nature documentary quality, high detail rendering",
    bestseller: "Bold concept visualization, strong central metaphor, dramatic chiaroscuro lighting, high-impact palette with gold accents, cinematic quality",
  };
  return styles[bookType] || styles.standard;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let userTier = "free";

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("tier, status")
          .eq("user_id", user.id)
          .maybeSingle();
        userTier = (sub?.status === "active" && sub?.tier) ? sub.tier : "free";
      }
    }

    // Gate: Only Premium and Institutional can use cinematic video
    if (userTier !== "premium" && userTier !== "prophet_tier") {
      return new Response(JSON.stringify({ error: "Cinematic video requires Premium or Institutional plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber, scenePlan } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log usage (fire-and-forget)
    if (userId) {
      supabaseAdmin.from("ai_usage_tracking").insert({
        user_id: userId,
        feature: "cinematic_video",
        credits_used: scenePlan ? 3 : 1, // Image gen costs more
        model_used: "gemini-2.5-flash",
      }).then(() => {});
    }

    const resolvedType = bookType || "standard";

    // ── Phase 1: If no scene plan provided, generate one ────
    if (!scenePlan) {
      const visualTypes = VISUAL_TYPES_BY_BOOK[resolvedType] || VISUAL_TYPES_BY_BOOK.standard;
      const model = tier === "prophet_tier" || tier === "premium"
        ? "google/gemini-2.5-flash"
        : "google/gemini-2.5-flash-lite";

      const systemPrompt = `You are a cinematic educational video director. Create a scene-by-scene plan for a ${resolvedType} chapter video.

OUTPUT: Return ONLY a valid JSON array. No markdown.

Create 6-10 scenes. Each scene will become a cinematic shot with an AI-generated background image + animated text overlay + camera movement.

SCENE SCHEMA:
{
  "sceneNumber": number,
  "title": "short title",
  "narration": "what narrator says (2-3 sentences, natural speech)",
  "visualType": "one of: ${visualTypes.join(", ")}",
  "imagePrompt": "DETAILED cinematic visual description. Be specific about: subject, composition, lighting, mood, color palette. This becomes the scene's full-screen background.",
  "textOverlay": "1-2 lines of key text shown on screen",
  "cameraMove": "one of: slow_zoom_in, slow_zoom_out, pan_left, pan_right, pan_up, ken_burns_tl_to_br, ken_burns_br_to_tl, static_with_pulse",
  "duration": 6-15 (seconds),
  "transition": "fade | crossfade | wipe_left | zoom_in",
  "emoji": "single emoji"
}

Rules:
- imagePrompt must be highly descriptive (30+ words), cinematic, no text/words in image
- Vary camera moves for visual rhythm
- Language: ${language || "en"}`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Create cinematic video for:\nBOOK: "${bookTitle}"\nCHAPTER: "${chapterTitle}" (Ch ${chapterNumber || 1})\n\nCONTENT:\n${(chapterContent || "").substring(0, 8000)}\n\nReturn ONLY JSON array.` },
          ],
          temperature: 0.7,
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI error: ${status}`);
      }

      const aiData = await aiResponse.json();
      const raw = aiData.choices?.[0]?.message?.content || "[]";
      let scenes: any[];
      try {
        scenes = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      } catch {
        throw new Error("Failed to parse video script");
      }

      // Validate scenes
      scenes = scenes.map((s: any, i: number) => ({
        sceneNumber: i + 1,
        title: s.title || `Scene ${i + 1}`,
        narration: s.narration || "",
        visualType: s.visualType || visualTypes[0],
        imagePrompt: s.imagePrompt || `Cinematic ${resolvedType} scene for: ${s.title || chapterTitle}`,
        textOverlay: s.textOverlay || s.title || "",
        cameraMove: CAMERA_MOVES.includes(s.cameraMove) ? s.cameraMove : CAMERA_MOVES[i % CAMERA_MOVES.length],
        duration: Math.max(5, Math.min(15, s.duration || 8)),
        transition: s.transition || ["fade", "crossfade", "wipe_left", "zoom_in"][i % 4],
        emoji: s.emoji || "",
      }));

      return new Response(JSON.stringify({ phase: "plan", scenes, bookType: resolvedType, chapterTitle, bookTitle }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Phase 2: Generate images for a batch of scenes ────
    const { scenes, batchStart = 0, batchSize = 2 } = scenePlan;
    const batch = (scenes as any[]).slice(batchStart, batchStart + batchSize);
    const imageStyle = getBookTypeImageStyle(resolvedType);

    const imageResults = await Promise.allSettled(
      batch.map(async (scene: any) => {
        const prompt = `${scene.imagePrompt}. ${imageStyle}. IMPORTANT: Do NOT render any text, words, or letters in the image. Cinematic 16:9 composition.`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image-preview",
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!response.ok) {
          if (response.status === 429) throw new Error("rate_limited");
          if (response.status === 402) throw new Error("payment_required");
          throw new Error(`Image generation failed: ${response.status}`);
        }

        const data = await response.json();
        const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!imageUrl) throw new Error("No image generated");

        return { sceneNumber: scene.sceneNumber, imageUrl };
      })
    );

    const images: Record<number, string> = {};
    let rateLimited = false;
    imageResults.forEach((r) => {
      if (r.status === "fulfilled") {
        images[r.value.sceneNumber] = r.value.imageUrl;
      } else if (r.reason?.message === "rate_limited") {
        rateLimited = true;
      }
    });

    return new Response(JSON.stringify({
      phase: "images",
      images,
      batchStart,
      batchSize,
      totalScenes: scenes.length,
      rateLimited,
      done: batchStart + batchSize >= scenes.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Cinematic video error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
