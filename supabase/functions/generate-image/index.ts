import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GENERATE-IMAGE] ${step}${detailsStr}`);
};

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
      logStep("Auth error", { error: authError?.message });
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Authenticated user", { userId: user.id.slice(0, 8) + "..." });

    // Get user's subscription plan from subscriptions table (source of truth)
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", user.id)
      .maybeSingle();

    const userPlan = (subscription?.status === 'active' && subscription?.tier) ? subscription.tier : "free";
    const isPremiumPlan = userPlan === "premium" || userPlan === "prophet_tier";

    // Check AI image quota (Free: 0, Student: 20, Premium: 100, Institutional: unlimited)
    const imageQuotas: Record<string, number> = { free: 0, student: 20, premium: 100, prophet_tier: -1 };
    const quota = imageQuotas[userPlan] ?? 0;

    if (quota === 0) {
      return new Response(JSON.stringify({ error: "AI image generation requires a paid plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (quota > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const { count } = await supabase
        .from("ai_usage_tracking")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("feature", "image_gen")
        .eq("month", currentMonth);

      if ((count ?? 0) >= quota) {
        return new Response(JSON.stringify({ error: `Monthly AI image limit reached (${quota}). Upgrade for more.` }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { 
      prompt, 
      style = "illustration",
      bookType,
      isPremium = false,
      chapterTitle,
      category,
    } = await req.json();

    // Use premium model only if user has premium plan
    const effectiveIsPremium = isPremium && isPremiumPlan;

    logStep("Generating image", { prompt: prompt.slice(0, 100), style, bookType, plan: userPlan });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // ===========================================
    // BOOK-TYPE-AWARE ART DIRECTION (Universal Illustration Engine)
    // Each book type activates a distinct visual identity
    // ===========================================
    const BOOK_TYPE_ART_DIRECTION: Record<string, string> = {
      academic: `ACADEMIC TEXTBOOK — SCHOLARLY DIAGRAM QUALITY:
Art style: Clean academic diagrams, labeled charts, conceptual frameworks. Minimal color, vector style.
Composition: Clear visual hierarchy with labeled components, proper axes, annotated callouts.
Elements: Process diagrams, taxonomy trees, risk matrices, architecture diagrams, conceptual frameworks.
Color palette: Minimal — navy (#1E3A5F), slate (#475569), white backgrounds. Accent color for emphasis only.
Quality: University textbook figure standard. Every element labeled. Optimized for print and screen clarity.
Avoid: Decorative artwork, cartoon graphics, narrative scenes.`,

      bestseller: `BESTSELLER/TRADE BOOK — CONCEPT VISUALIZATION:
Art style: Bold, memorable concept art that makes abstract ideas tangible. Modern illustration with metaphorical depth.
Composition: Strong central metaphor with supporting visual elements. Cinematic framing with dramatic perspective.
Color palette: High-impact — deep navy backgrounds with gold/amber highlights, or clean white with bold accent colors. Maximum 3 colors per image.
Elements: Visual metaphors (icebergs for hidden depth, compasses for direction, bridges for connection), transformation arcs, before/after contrasts.
Lighting: Dramatic chiaroscuro for emphasis. Spotlight effects on key concepts. Atmospheric depth with subtle glow.
Quality: TED Talk slide quality. Instantly shareable. The image alone should communicate the core idea.`,

      technical: `TECHNICAL GUIDE — SYSTEM ARCHITECTURE QUALITY:
Art style: System architecture diagrams, flowcharts, technical process visuals with labeled modules.
Composition: Structured layout with clear flow direction, numbered steps, connection lines between components.
Elements: Software architecture boxes, pipeline diagrams, network topology, API flow diagrams, database schemas.
Color palette: Professional tech — dark blue (#1E40AF), cyan (#06B6D4), gray (#6B7280), white backgrounds.
Annotation: Every module labeled. Data flow arrows. Version indicators where relevant.
Quality: Engineering documentation standard. Clear at any zoom level.`,

      professional: `PROFESSIONAL/BUSINESS BOOK — INFOGRAPHIC QUALITY:
Art style: Clean, modern infographic design. Flat design with subtle gradients and isometric elements.
Composition: Grid-based layout with clear visual hierarchy. Data-first design with labeled axes and legends.
Color palette: Corporate-grade — navy (#1B2A4A), teal (#0D9488), warm amber (#F59E0B), slate gray (#64748B). White backgrounds.
Elements: Strategic frameworks, 2x2 matrices, decision trees, implementation roadmaps, competitive positioning maps.
Charts/Diagrams: Publication-ready with proper axis labels, data points, trend lines, and clear legends.
Quality: McKinsey/Harvard Business Review standard. Boardroom-presentable. Zero decorative clutter.`,

      workbook: `WORKBOOK/EDUCATIONAL — INSTRUCTIONAL DIAGRAM:
Art style: Clean instructional design with friendly, approachable aesthetics. Step-by-step visual clarity.
Composition: Sequential layout with numbered steps, clear start/end points, progress indicators.
Color palette: Encouraging — soft blue (#3B82F6), warm orange (#F97316), green (#22C55E), light backgrounds.
Elements: Blank frameworks, partially completed diagrams, fill-in templates, annotated examples, reflection charts.
Quality: Textbook-grade. Optimized for both screen and print. Accessible to diverse learning styles.`,

      comic: `COMIC BOOK — PUBLICATION QUALITY:
Art style: Dynamic comic art with bold ink lines, dramatic foreshortening, speed lines for action.
Composition: Panel-ready framing with gutters in mind. Dutch angles for tension, worm-eye for power, bird-eye for scope.
Color palette: Saturated comic palette with cel-shading, halftone dots for shadows, rim lighting on characters.
Characters: Expressive with exaggerated emotion, dynamic poses, consistent character design. Speech bubble-ready.
Quality: Marvel/DC publication standard. Print-ready with proper bleed areas.`,

      children: `CHILDREN'S PICTURE BOOK — PUBLICATION QUALITY:
Art style: Soft watercolor with digital refinement, rounded organic shapes, warm inviting palette.
Characters: Expressive faces with large eyes, gentle proportions, age-appropriate (4-8 year old protagonists).
Composition: Clear focal point, simple uncluttered backgrounds with subtle texture, rule of thirds.
Color palette: Warm pastels (peach, soft yellow, sky blue, mint) with one saturated accent color per scene.
Mood: Safe, magical, wonder-filled. Soft rim lighting, dappled sunlight, cozy atmosphere.
Quality: Caldecott Medal standard. Print-ready. No harsh edges or scary elements.`,

      fiction: `FICTION/NOVEL — CINEMATIC SCENE ILLUSTRATION:
Art style: Cinematic scene illustrations with rich atmosphere and mood. Character environments with emotional depth.
Composition: Wide establishing shots for settings, medium shots for character moments, dramatic lighting for tension.
Color palette: Mood-driven — warm golden tones for comfort, cool blues for mystery, deep shadows for tension.
Elements: Setting visuals, character silhouettes, atmospheric scenes, symbolic imagery.
Lighting: Cinematic with volumetric atmosphere, god rays, dusk/dawn palettes, firelight warmth.
Quality: Novel cover art standard. Evocative and atmospheric. Captures the emotional essence of the scene.`,

      reference: `REFERENCE/HANDBOOK — TECHNICAL DIAGRAM QUALITY:
Art style: Precise technical illustration with clean vector aesthetics. Blueprint-inspired with modern refinement.
Composition: Structured grid layout, systematic labeling, numbered callouts, clear flow direction arrows.
Color palette: High-contrast — blue (#2563EB) for primary, red (#DC2626) for warnings, green (#16A34A) for success, gray (#6B7280) for secondary.
Elements: Classification trees, comparison charts, taxonomy diagrams, decision flowcharts, summary visuals.
Annotation: Every element labeled. Cross-reference numbers. Scale indicators where relevant.
Quality: Engineering manual standard. ISO-compliant visual language. Optimized for print clarity at any size.`,

      text: `STANDARD TEXT — LIGHT CONCEPTUAL VISUAL:
Art style: Simple, clean conceptual diagrams when useful. Minimal decoration.
Composition: Clear focal subject, generous whitespace, single concept per image.
Color palette: Subdued — grayscale with one accent color for emphasis.
Quality: Clean and readable. Only generate if the image adds educational value.`,
    };

    // Legacy style fallbacks for backward compatibility
    const LEGACY_STYLE_PROMPTS: Record<string, string> = {
      illustration: BOOK_TYPE_ART_DIRECTION.bestseller,
      realistic: "Photorealistic rendering, cinematic lighting with volumetric atmosphere, shallow depth of field, professional photography aesthetic, 8K detail.",
    };

    // Resolve art direction: bookType takes priority, then style param, then default
    const artDirection = (bookType && BOOK_TYPE_ART_DIRECTION[bookType])
      ? BOOK_TYPE_ART_DIRECTION[bookType]
      : LEGACY_STYLE_PROMPTS[style] || BOOK_TYPE_ART_DIRECTION[style] || BOOK_TYPE_ART_DIRECTION.text;

    const contextHint = category ? `Subject: ${category.replace(/_/g, ' ')}.` : '';
    const chapterHint = chapterTitle ? `Chapter context: ${chapterTitle}.` : '';
    const enhancedPrompt = `${prompt}.\n\n${artDirection}\n\n${contextHint} ${chapterHint} IMPORTANT: Do NOT render any text, words, or letters in the image.`;

    // Use Gemini 3 Pro Image for all tiers (only supported image model)
    const model = "google/gemini-3-pro-image-preview";

    logStep("Using model", { model });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "user", content: enhancedPrompt }
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logStep("AI gateway error", { status: response.status });
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Failed to generate image");
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      logStep("No image in response");
      throw new Error("No image generated");
    }

    logStep("Image generated successfully");

    // Track usage (fire-and-forget)
    supabase.from("ai_usage_tracking").insert({
      user_id: user.id,
      feature: "image_gen",
      credits_used: 1,
      model_used: model,
    }).then(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl,
        model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
