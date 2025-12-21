import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cover theme definitions
const coverThemes: Record<string, { name: string; style: string }> = {
  classic: {
    name: "Classic",
    style: `Dark, sophisticated color palette with deep indigo/navy blues (#1a1a2e) and gold accents (#d4af37).
Minimalist yet striking design with elegant serif typography.
Premium, high-end aesthetic suitable for scholarly books.
Subtle textures or patterns that evoke ancient scrolls or manuscripts.
Gold foil effect on title text.`
  },
  modern: {
    name: "Modern",
    style: `Clean, contemporary design with bold geometric shapes.
Vibrant gradient backgrounds (purple to blue or teal to cyan).
Sans-serif typography with strong visual hierarchy.
Minimalist approach with plenty of white space.
Sleek, tech-forward aesthetic.`
  },
  vintage: {
    name: "Vintage",
    style: `Aged paper texture with worn edges and sepia tones.
Ornate decorative borders and flourishes.
Classic Victorian or Art Nouveau inspired typography.
Muted color palette (browns, creams, burgundy).
Nostalgic, antique bookshop aesthetic.`
  },
  nature: {
    name: "Nature",
    style: `Organic, earthy color palette (forest greens, warm browns, sky blues).
Natural elements like leaves, trees, mountains, or flowing water.
Soft, watercolor-like textures and gradients.
Handwritten or organic typography style.
Peaceful, serene aesthetic inspired by the natural world.`
  },
  cosmic: {
    name: "Cosmic",
    style: `Deep space imagery with stars, nebulae, and galaxies.
Dark backgrounds with glowing, ethereal light effects.
Futuristic, sci-fi inspired typography.
Rich purples, blues, and cosmic pinks.
Mysterious, otherworldly aesthetic.`
  },
  minimalist: {
    name: "Minimalist",
    style: `Pure black or white background.
Single accent color for key elements.
Ultra-clean, sans-serif typography.
Maximum negative space.
Bold, statement-making simplicity.`
  },
  african: {
    name: "African Heritage",
    style: `Rich, warm earth tones (terracotta, ochre, deep browns, sunset oranges).
Traditional African patterns and geometric designs (kente, ankara, adinkra symbols).
Bold, powerful typography with cultural authenticity.
Textures inspired by African textiles and crafts.
Celebration of African art and heritage.`
  },
  prophetic: {
    name: "Prophetic",
    style: `Heavenly imagery with rays of divine light breaking through clouds.
Rich golds, royal purples, and celestial blues.
Sacred, reverent atmosphere with subtle religious iconography.
Elegant calligraphic typography.
Spiritual, awe-inspiring aesthetic.`
  }
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
      console.error("[GENERATE-COVER] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GENERATE-COVER] Authenticated user: ${user.id.slice(0, 8)}...`);

    const { bookId, title, category, description, theme = "classic" } = await req.json();

    // Verify user owns the book
    const { data: book } = await supabase
      .from("books")
      .select("creator_id")
      .eq("id", bookId)
      .single();

    if (book && book.creator_id !== user.id) {
      console.log(`[GENERATE-COVER] User ${user.id.slice(0, 8)}... not authorized for book`);
      return new Response(JSON.stringify({ error: "Not authorized to modify this book" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get theme style or default to classic
    const selectedTheme = coverThemes[theme] || coverThemes.classic;
    console.log(`[GENERATE-COVER] Generating ${selectedTheme.name} cover for book: ${title}`);

    // Create a detailed prompt for the book cover - NO TEXT to avoid spelling issues
    // The title will be overlaid digitally on the frontend
    const coverPrompt = `Create a professional, elegant book cover BACKGROUND design with ABSOLUTELY NO TEXT WHATSOEVER.

Book Theme: ${category.replace(/_/g, " ")} - ${description || "A scholarly work on this topic"}

COVER STYLE - ${selectedTheme.name.toUpperCase()}:
${selectedTheme.style}

CRITICAL REQUIREMENTS - NO TEXT:
1. DO NOT include ANY text, letters, words, or typography of any kind
2. DO NOT write the book title "${title}" on the cover
3. DO NOT include publisher names, author names, or any written content
4. Create ONLY abstract imagery, patterns, textures, and visual elements
5. Leave clean space in the center/lower area where a title can be overlaid digitally

DESIGN FOCUS:
- Create a striking visual composition that evokes the subject matter
- Use powerful abstract imagery, geometric patterns, and symbolic visuals
- Include appropriate colors and textures for the ${category.replace(/_/g, " ")} theme
- Aspect ratio: vertical book cover (3:4)
- Ultra high resolution, professional quality
- Reserve a clean, readable area for digital title overlay (center or lower third)
- Focus on atmosphere, mood, and visual storytelling without any text`;

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
      console.error("[GENERATE-COVER] AI gateway error:", response.status, errorText);
      
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

    console.log("[GENERATE-COVER] Cover generated successfully, saving to database...");

    // Update the book with the cover image URL
    const { error: updateError } = await supabase
      .from("books")
      .update({ cover_image_url: imageUrl })
      .eq("id", bookId);

    if (updateError) {
      console.error("[GENERATE-COVER] Error updating book cover:", updateError);
      throw new Error(`Failed to save cover: ${updateError.message}`);
    }

    console.log("[GENERATE-COVER] Cover saved successfully");

    return new Response(
      JSON.stringify({
        success: true,
        coverUrl: imageUrl,
        theme: selectedTheme.name,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[GENERATE-COVER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
