import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, title, category, description } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Generating cover for book: ${title} (${category})`);

    // Create a detailed prompt for the book cover
    const coverPrompt = `Create a professional, elegant book cover design for ScrollLibrary™.

Book Title: "${title}"
Category: ${category.replace(/_/g, " ")}
Theme: ${description || "A scholarly work on this topic"}

CRITICAL REQUIREMENTS:
- If including ANY text on the cover, use ONLY: "ScrollLibrary™" as the publisher/brand name
- DO NOT include "Oxford", "Academic Press", "Penguin", or any other publisher names
- The book title "${title}" can be shown on the cover
- Include "ScrollLibrary™" as a small publisher mark at the bottom

Style requirements:
- Dark, sophisticated color palette with deep indigo/navy blues (#1a1a2e) and gold accents (#d4af37)
- Minimalist yet striking design with elegant typography
- Premium, high-end aesthetic suitable for scholarly books
- Aspect ratio: vertical book cover (3:4)
- Subtle textures or patterns that evoke ancient scrolls or manuscripts
- Gold foil effect on title text
- Ultra high resolution, professional quality`;


    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: coverPrompt
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Failed to generate cover image");
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      throw new Error("No image generated");
    }

    console.log("Cover generated successfully, saving to database...");

    // Update the book with the cover image URL
    const { error: updateError } = await supabase
      .from("books")
      .update({ cover_image_url: imageUrl })
      .eq("id", bookId);

    if (updateError) {
      console.error("Error updating book cover:", updateError);
      throw new Error(`Failed to save cover: ${updateError.message}`);
    }

    console.log("Cover saved successfully");

    return new Response(
      JSON.stringify({
        success: true,
        coverUrl: imageUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-cover function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
