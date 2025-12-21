import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { 
      prompt, 
      style = "illustration", // illustration, comic, children, realistic
      isPremium = false, // Use higher quality model for premium
    } = await req.json();

    logStep("Generating image", { prompt: prompt.slice(0, 100), style, isPremium });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Style-specific prompt enhancements
    const stylePrompts: Record<string, string> = {
      illustration: "Digital illustration style, vibrant colors, clean lines, professional artwork.",
      comic: "Comic book art style, bold outlines, dynamic composition, panel-ready illustration.",
      children: "Children's book illustration style, soft colors, friendly characters, whimsical and engaging.",
      realistic: "Photorealistic style, detailed, high quality, professional photography aesthetic.",
    };

    const enhancedPrompt = `${prompt}. ${stylePrompts[style] || stylePrompts.illustration}`;

    // Use Gemini 2.5 Flash Image for standard, Gemini 3 Pro Image for premium
    const model = isPremium 
      ? "google/gemini-3-pro-image-preview" 
      : "google/gemini-2.5-flash-image-preview";

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
      logStep("AI gateway error", { status: response.status, error: errorText });
      
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
      logStep("No image in response", { data });
      throw new Error("No image generated");
    }

    logStep("Image generated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl, // base64 data URL
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
