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
      isPremium = false,
    } = await req.json();

    // Use premium model only if user has premium plan
    const effectiveIsPremium = isPremium && isPremiumPlan;

    logStep("Generating image", { prompt: prompt.slice(0, 100), style, plan: userPlan, premium: effectiveIsPremium });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Style-specific prompt enhancements
    const stylePrompts: Record<string, string> = {
      illustration: "Modern editorial illustration, sophisticated color theory, dynamic composition with layered depth, rich textures, dramatic directional lighting, museum-quality artwork.",
      comic: "Publication-quality comic book art, bold ink lines, dynamic foreshortening, cel-shading with halftone shadows, expressive characters, dramatic panel-ready composition.",
      children: "Children's picture book illustration, soft watercolor with digital refinement, warm pastels, rounded organic shapes, expressive characters with large eyes, Caldecott Medal quality.",
      realistic: "Photorealistic rendering, cinematic lighting with volumetric atmosphere, shallow depth of field, professional photography aesthetic, 8K detail.",
      professional: "Clean infographic design, modern flat style with subtle gradients, corporate color palette (navy, teal, amber), grid-based layout, McKinsey presentation quality.",
      reference: "Precise technical illustration, clean vector aesthetics, structured labeling, flowchart nodes, taxonomy branches, engineering manual standard.",
      bestseller: "Bold concept visualization, strong central metaphor, dramatic chiaroscuro lighting, high-impact palette with gold accents, TED Talk slide quality.",
      workbook: "Clean instructional design, step-by-step visual clarity, numbered annotations, friendly approachable aesthetics, textbook-grade quality.",
    };

    const enhancedPrompt = `${prompt}. ${stylePrompts[style] || stylePrompts.illustration} IMPORTANT: Do NOT render any text, words, or letters in the image.`;

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
