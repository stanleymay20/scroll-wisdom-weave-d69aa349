import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cinematic Video Generation — Photorealistic A+++ Quality
 * 
 * Generates ultra-high-quality photorealistic AI scene images + cinematic 
 * camera instructions for browser-side Canvas MediaRecorder rendering.
 * 
 * Pipeline:
 * 1. AI director creates detailed scene plan with photorealistic imagePrompts
 * 2. gemini-3-pro-image-preview generates 1024x1024 photorealistic keyframes
 * 3. Returns scene plan + base64 images for client-side cinematic assembly
 */

const VISUAL_TYPES_BY_BOOK: Record<string, string[]> = {
  standard: ["establishing_wide", "macro_detail", "conceptual_metaphor", "data_landscape", "human_element", "abstract_beauty", "closing_vista"],
  professional: ["boardroom_aerial", "data_cathedral", "strategic_landscape", "executive_portrait", "innovation_lab", "market_forces", "future_vision"],
  children: ["magical_gateway", "adventure_panorama", "character_close_up", "wonder_discovery", "nature_macro", "dream_sequence", "starlit_finale"],
  reference: ["scientific_macro", "crystalline_structure", "taxonomy_garden", "cross_section", "laboratory_scene", "microscopic_world", "cosmic_scale"],
  comic: ["hero_establishing", "dynamic_action", "emotional_close_up", "dramatic_reveal", "battle_panorama", "quiet_moment", "epic_finale"],
  workbook: ["workshop_scene", "tool_arrangement", "step_progression", "hands_on_detail", "blueprint_overlay", "achievement_moment", "mastery_vista"],
  illustrated: ["natural_wonder", "anatomical_detail", "ecosystem_panorama", "species_portrait", "geological_formation", "underwater_world", "aerial_survey"],
  bestseller: ["ted_stage_moment", "metaphor_landscape", "human_story", "breakthrough_instant", "panoramic_insight", "intimate_revelation", "standing_ovation"],
};

const CAMERA_MOVES = [
  "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right", "pan_up",
  "ken_burns_tl_to_br", "ken_burns_br_to_tl", "static_with_pulse",
  "dolly_forward", "orbital_slow", "rack_focus", "crane_up",
] as const;

function getBookTypeImageStyle(bookType: string): string {
  const styles: Record<string, string> = {
    standard: "Shot on ARRI ALEXA 65 with Cooke S7/i Full Frame Plus lenses. Photorealistic cinematic quality, anamorphic lens flare, volumetric god rays piercing through atmosphere, film grain texture, shallow depth of field f/1.4, color graded in DaVinci Resolve with teal-orange cinematic LUT, 8K resolution, HDR dynamic range, production design by Roger Deakins lighting philosophy",
    professional: "Shot on RED V-RAPTOR 8K VV. Ultra-premium corporate cinematography, clean architectural lines, glass surfaces with caustic light refractions, Fincher-style precision framing, navy-charcoal-gold color science, Bloomberg terminal aesthetics elevated to IMAX quality, volumetric ambient occlusion, ray-traced reflections, Ridley Scott visual authority",
    children: "Shot on Panavision Millennium DXL2. Pixar-level photorealistic rendering with magical realism, luminous subsurface scattering on skin, Disney Imagineering production design, warm golden hour backlight with lens flare, Miyazaki-inspired atmospheric depth, tactile fabric and material textures at macro detail, magical particle systems catching light, chromatic aberration at edges",
    reference: "Shot on Phantom Flex4K at 1000fps. Ultra-precise scientific cinematography, crystalline molecular structures with accurate refraction indices, electron microscope detail enhanced with artistic lighting, deep navy-to-white gradient atmospheres, Nature/Science journal cover quality, razor-sharp focus stacking, schlieren photography aesthetics, Nobel Prize lecture visual authority",
    comic: "Shot on Sony VENICE 2. Marvel Studios VFX-level photorealism with graphic novel composition, dramatic three-point chiaroscuro lighting, atmospheric volumetric fog with colored light shafts, dynamic Dutch angle framing, rain-slicked surfaces with neon reflections, particle debris frozen in motion, Zack Snyder visual intensity meets Denis Villeneuve atmosphere",
    workbook: "Shot on Canon EOS C500 Mark II. Warm inviting workshop cinematography, soft diffused northern light through windows, clean organized workspace with beautiful tools and materials, Wes Anderson symmetrical composition, educational diagram overlays with elegant typography, soft bokeh backgrounds, warm amber-teal color palette",
    illustrated: "Shot on Hasselblad H6D-400c MS. National Geographic expedition photography meets BBC Planet Earth cinematography, extreme 400-megapixel macro detail, cross-section anatomical precision with artistic backlighting, David Attenborough documentary grandeur, luminous rim lighting on subjects, tilt-shift miniature effect for scale, underwater housing crystal clarity",
    bestseller: "Shot on ARRI ALEXA Mini LF. TED Main Stage cinematography meets Oscar-winning documentary, powerful conceptual metaphor visualization in photorealistic environments, dramatic Rembrandt lighting with single key source, rich gold and deep navy palette, large-scale environmental storytelling in IMAX 15/70mm quality, intimate portrait moments with creamy bokeh",
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

    // Server-side video quota enforcement
    const VIDEO_QUOTAS: Record<string, number> = { premium: 20, prophet_tier: 50 };
    const videoQuota = VIDEO_QUOTAS[userTier] ?? 0;

    if (userId && videoQuota > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const { count } = await supabaseAdmin
        .from("ai_usage_tracking")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("feature", "cinematic_video")
        .gte("created_at", `${currentMonth}-01T00:00:00Z`);

      if ((count ?? 0) >= videoQuota) {
        return new Response(JSON.stringify({
          error: `Monthly cinematic video limit reached (${videoQuota}). ${userTier === "premium" ? "Upgrade to Institutional for more." : "Limit resets next month."}`,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Cost circuit breaker: if user's total monthly AI spend exceeds 60% of tier revenue, throttle
    if (userId) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const { count: totalOps } = await supabaseAdmin
        .from("ai_usage_tracking")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", `${currentMonth}-01T00:00:00Z`);

      // Rough cost estimate: each op ~$0.03 avg, Premium revenue $19, Institutional $79
      const estimatedCost = (totalOps ?? 0) * 0.03;
      const revenueThreshold = userTier === "prophet_tier" ? 79 * 0.6 : 19 * 0.6;

      if (estimatedCost > revenueThreshold) {
        console.warn(`[CINEMATIC-VIDEO] Cost circuit breaker: user ${userId?.slice(0,8)} estimated $${estimatedCost.toFixed(2)} exceeds ${revenueThreshold}`);
        // Don't block, but log for monitoring. Could throttle in future.
      }
    }

    // Track usage
    if (userId) {
      supabaseAdmin.from("ai_usage_tracking").insert({
        user_id: userId,
        feature: "cinematic_video",
        credits_used: scenePlan ? 5 : 1,
        model_used: scenePlan ? "gemini-3-pro-image-preview" : "gemini-2.5-flash",
      }).then(() => {});
    }

    const resolvedType = bookType || "standard";

    // ── Phase 1: Generate photorealistic cinematic script ────
    if (!scenePlan) {
      const visualTypes = VISUAL_TYPES_BY_BOOK[resolvedType] || VISUAL_TYPES_BY_BOOK.standard;
      const model = "google/gemini-2.5-flash";

      const systemPrompt = `You are an Academy Award-winning cinematographer and documentary director. You combine the visual mastery of Roger Deakins, the storytelling of David Attenborough, and the conceptual brilliance of a TED Talk.

Your task: Create a PHOTOREALISTIC cinematic video script. Every scene will be rendered as a stunning, photorealistic AI-generated image with cinematic camera movement.

OUTPUT: Return ONLY a valid JSON array. No markdown, no explanation, no code fences.

Create 5-7 scenes for an immersive, cinematic educational video (target 2-4 minutes). Each scene becomes a full-screen photorealistic shot with professional camera work.

SCENE SCHEMA:
{
  "sceneNumber": number,
  "title": "evocative cinematic title (3-5 words)",
  "narration": "what the narrator says (3-5 sentences — vivid, sensory, emotionally resonant. Use concrete imagery, rhetorical questions, dramatic pauses. Make the viewer FEEL the concept)",
  "visualType": "one of: ${visualTypes.join(", ")}",
  "imagePrompt": "PHOTOREALISTIC SCENE DESCRIPTION (80-120 words). You are directing a real camera crew. Specify EXACTLY:
    - SUBJECT: What is in frame (specific objects, people, environments with precise details)
    - COMPOSITION: Rule of thirds placement, foreground/midground/background layers, leading lines
    - CAMERA: Lens (24mm wide, 85mm portrait, 100mm macro), angle (low hero angle, bird's eye, eye level), distance
    - LIGHTING: Time of day, light direction, quality (harsh/soft), color temperature, practical lights in scene
    - ATMOSPHERE: Weather, particles in air (dust motes, fog, rain), depth haze
    - TEXTURE: Material surfaces (brushed steel, aged wood, wet concrete, silk fabric)
    - COLOR: Dominant and accent colors, shadows color, highlights warmth
    - MOOD: Emotional tone conveyed through all visual elements
    ABSOLUTELY NO text, words, letters, numbers, watermarks, or UI elements in the image",
  "textOverlay": "1 powerful insight (shown as elegant subtitle)",
  "cameraMove": "one of: slow_zoom_in, slow_zoom_out, pan_left, pan_right, pan_up, ken_burns_tl_to_br, ken_burns_br_to_tl, static_with_pulse, dolly_forward, orbital_slow, rack_focus, crane_up",
  "duration": 15-25 (seconds — dramatic pacing),
  "transition": "fade | crossfade | dissolve | zoom",
  "emoji": "single emoji capturing the scene's emotion"
}

DIRECTING RULES:
- Every imagePrompt MUST be 80-120 words of specific photographic direction
- Think in REAL PHOTOGRAPHY — describe what a camera would actually capture
- Scene 1: Epic establishing shot (wide lens, dramatic scale, environmental storytelling)
- Use visual metaphors — abstract concepts rendered as tangible, photographable scenes
- Vary shot scales: wide → medium → close-up → macro → wide (cinematic rhythm)
- Vary camera moves: never repeat consecutively, match energy to content
- Final scene: Powerful emotional closing (intimate or epic, depending on content)
- Color continuity: maintain a cohesive color palette across all scenes
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
            { role: "user", content: `Create a photorealistic cinematic video for:\nBOOK: "${bookTitle}"\nCHAPTER ${chapterNumber || 1}: "${chapterTitle}"\n\nSOURCE CONTENT:\n${(chapterContent || "").substring(0, 10000)}\n\nReturn ONLY the JSON array of scenes.` },
          ],
          temperature: 0.75,
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

      const validCameraMoves = new Set(CAMERA_MOVES);
      scenes = scenes.map((s: any, i: number) => ({
        sceneNumber: i + 1,
        title: s.title || `Scene ${i + 1}`,
        narration: s.narration || "",
        visualType: s.visualType || visualTypes[i % visualTypes.length],
        imagePrompt: s.imagePrompt || `Photorealistic cinematic scene: ${s.title || chapterTitle}. Shot on ARRI ALEXA, dramatic lighting, 8K detail.`,
        textOverlay: s.textOverlay || s.title || "",
        cameraMove: validCameraMoves.has(s.cameraMove) ? s.cameraMove : CAMERA_MOVES[i % CAMERA_MOVES.length],
        duration: Math.max(12, Math.min(25, s.duration || 18)),
        transition: s.transition || ["fade", "crossfade", "dissolve", "zoom"][i % 4],
        emoji: s.emoji || "",
      }));

      return new Response(JSON.stringify({ phase: "plan", scenes, bookType: resolvedType, chapterTitle, bookTitle }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Phase 2: Generate photorealistic images for scene batch ────
    const { scenes, batchStart = 0, batchSize = 2 } = scenePlan;
    const batch = (scenes as any[]).slice(batchStart, batchStart + batchSize);
    const imageStyle = getBookTypeImageStyle(resolvedType);

    const imageResults = await Promise.allSettled(
      batch.map(async (scene: any) => {
        const prompt = `Create a photorealistic cinematic image. ${scene.imagePrompt}

Technical specifications: ${imageStyle}

CRITICAL RULES:
- Photorealistic quality — this must look like a real photograph or cinematic film frame
- NO text, words, letters, numbers, watermarks, logos, or UI elements anywhere in the image
- 16:9 widescreen cinematic composition
- Rich detail in every pixel — textures, reflections, atmospheric effects
- Professional color grading with cinematic depth`;

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
