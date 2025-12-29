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

// Comic style presets for visual consistency
const COMIC_STYLE_PRESETS: Record<string, {
  artStyle: string;
  colorPalette: string;
  lineWeight: string;
  shadingStyle: string;
  characterNotes: string;
}> = {
  modern_superhero: {
    artStyle: 'Modern American superhero comic style, dynamic poses, bold lines',
    colorPalette: 'Vibrant primary colors with dramatic shadows',
    lineWeight: 'Bold outlines with varied line weights for depth',
    shadingStyle: 'Cell shading with dramatic lighting',
    characterNotes: 'Muscular heroic proportions, expressive faces, detailed costumes',
  },
  african_superhero: {
    artStyle: 'Afrofuturistic comic style blending traditional African art with modern superhero aesthetics',
    colorPalette: 'Rich earth tones, gold accents, vibrant African-inspired patterns',
    lineWeight: 'Bold confident lines with decorative pattern elements',
    shadingStyle: 'Dramatic lighting with cultural pattern integration',
    characterNotes: 'Diverse African features, traditional + futuristic costume fusion, cultural symbols',
  },
  children_book: {
    artStyle: 'Friendly children book illustration, rounded shapes, warm and inviting',
    colorPalette: 'Bright, cheerful colors with soft gradients',
    lineWeight: 'Soft rounded lines, minimal harsh edges',
    shadingStyle: 'Soft gradients and gentle shadows',
    characterNotes: 'Cute proportions, big eyes, friendly expressions, simple clothing',
  },
  manga: {
    artStyle: 'Japanese manga style with expressive eyes and dynamic motion lines',
    colorPalette: 'Clean black and white with screen tones, or soft pastel colors',
    lineWeight: 'Clean thin lines with emphasis on speed lines and effects',
    shadingStyle: 'Screen tones and crosshatching',
    characterNotes: 'Large expressive eyes, varied hair styles, emotional expressions',
  },
  graphic_novel: {
    artStyle: 'Realistic graphic novel style with detailed environments',
    colorPalette: 'Muted, sophisticated color palette with mood-driven tones',
    lineWeight: 'Detailed linework with cross-hatching',
    shadingStyle: 'Realistic lighting with atmospheric effects',
    characterNotes: 'Realistic proportions, detailed clothing, subtle expressions',
  },
};

// Extract visual identity from comic chapter content
function extractVisualIdentityFromContent(content: string): {
  mainCharacters: string[];
  keyScene: string;
  dominantColors: string[];
  settingDescription: string;
} {
  const characters: string[] = [];
  const scenes: string[] = [];
  const colors: string[] = [];
  
  // Extract character names from dialogue patterns
  const dialoguePattern = /-\s*([A-Z][A-Za-z_\s]+?):\s*"/g;
  let match;
  while ((match = dialoguePattern.exec(content)) !== null) {
    const charName = match[1].trim().replace(/\*+/g, '');
    if (!characters.includes(charName) && charName.length < 30) {
      characters.push(charName);
    }
  }
  
  // Extract visual descriptions
  const visualPattern = /Visual:?\s*([^D\n]+)/gi;
  while ((match = visualPattern.exec(content)) !== null) {
    scenes.push(match[1].trim().slice(0, 200));
  }
  
  // Extract color mentions
  const colorPattern = /\b(golden|blue|red|green|amber|purple|orange|yellow|black|white|silver|bronze|crimson|emerald|azure|violet|pink|brown|grey|gray)\b/gi;
  while ((match = colorPattern.exec(content)) !== null) {
    const color = match[1].toLowerCase();
    if (!colors.includes(color)) {
      colors.push(color);
    }
  }
  
  // Extract setting from first visual
  const settingMatch = content.match(/Visual:?\s*([^.]+\.)/i);
  const setting = settingMatch ? settingMatch[1].trim() : 'A dynamic scene from the story';
  
  return {
    mainCharacters: characters.slice(0, 5),
    keyScene: scenes[0] || 'A dramatic moment featuring the main characters',
    dominantColors: colors.slice(0, 5),
    settingDescription: setting,
  };
}

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

    // Get book details including comic-specific fields
    const { data: book } = await supabase
      .from("books")
      .select("creator_id, book_type, comic_style_id, palette_hint, line_weight_hint, character_sheet")
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

    // ===========================================
    // COMIC COVER CONSISTENCY CONTRACT
    // ===========================================
    
    const isComic = book?.book_type === 'comic';
    let coverPrompt: string;
    
    if (isComic) {
      console.log("[GENERATE-COVER] Comic book detected - extracting visual identity from chapters...");
      
      // Get the first generated chapter to extract visual identity
      const { data: chapters } = await supabase
        .from("chapters")
        .select("content")
        .eq("book_id", bookId)
        .eq("is_generated", true)
        .order("chapter_number", { ascending: true })
        .limit(2);
      
      const combinedContent = chapters?.map(c => c.content).join('\n\n') || '';
      const visualIdentity = extractVisualIdentityFromContent(combinedContent);
      
      // Get comic style
      const comicStyleId = book?.comic_style_id || 'children_book';
      const styleGuide = COMIC_STYLE_PRESETS[comicStyleId] || COMIC_STYLE_PRESETS.children_book;
      
      // Use character sheet if available
      const characterSheet = book?.character_sheet || {};
      const characterDescriptions = Object.entries(characterSheet)
        .map(([name, desc]) => `${name}: ${desc}`)
        .join('; ');
      
      console.log(`[GENERATE-COVER] Extracted ${visualIdentity.mainCharacters.length} characters, style: ${comicStyleId}`);
      
      // Build comic-consistent cover prompt
      coverPrompt = `Create a professional COMIC BOOK COVER that matches the visual identity of the comic panels.

=== COMIC COVER CONSISTENCY CONTRACT ===

BOOK DETAILS:
- Title: "${title}"
- Category: ${category.replace(/_/g, " ")}
- Author: "ScrollAuthor AI"

VISUAL STYLE (MUST MATCH COMIC PANELS EXACTLY):
- Art Style: ${styleGuide.artStyle}
- Color Palette: ${styleGuide.colorPalette}${book?.palette_hint ? ` with custom hints: ${book.palette_hint}` : ''}
- Line Weight: ${styleGuide.lineWeight}${book?.line_weight_hint ? ` (${book.line_weight_hint})` : ''}
- Shading: ${styleGuide.shadingStyle}
- Character Design: ${styleGuide.characterNotes}

EXTRACTED VISUAL IDENTITY FROM PANELS:
- Main Characters: ${visualIdentity.mainCharacters.length > 0 ? visualIdentity.mainCharacters.join(', ') : 'Feature the protagonist prominently'}
${characterDescriptions ? `- Character Details: ${characterDescriptions}` : ''}
- Key Scene Reference: ${visualIdentity.keyScene}
- Dominant Colors: ${visualIdentity.dominantColors.length > 0 ? visualIdentity.dominantColors.join(', ') : styleGuide.colorPalette}
- Setting: ${visualIdentity.settingDescription}

MANDATORY COVER REQUIREMENTS:
1. Feature the main characters EXACTLY as they appear in the panels
2. Use the SAME art style as the comic panels - NO deviation
3. Create a dynamic, action-packed composition reflecting the comic's tone
4. Include the title "${title}" prominently displayed
5. Include "By ScrollAuthor AI" as author credit
6. Match the color palette from the panels exactly
7. The cover should look like it belongs to the same comic

FORBIDDEN:
- Different art style from panels
- New characters not in the comic
- Different character appearances (costume, face, body)
- Conflicting color palettes

Aspect ratio: vertical book cover (3:4)
Ultra high resolution, professional comic book cover quality.`;
      
    } else {
      // Standard book cover generation
      const selectedTheme = coverThemes[theme] || coverThemes.classic;
      console.log(`[GENERATE-COVER] Generating ${selectedTheme.name} cover for book: ${title}`);

      coverPrompt = `Create a professional, elegant book cover design with the title and author clearly visible.

BOOK DETAILS:
- Title: "${title}"
- Category: ${category.replace(/_/g, " ")}
- Theme: ${description || "A scholarly work on this topic"}
- Author: "ScrollAuthor AI"

COVER STYLE - ${selectedTheme.name.toUpperCase()}:
${selectedTheme.style}

CRITICAL TEXT REQUIREMENTS:
1. MUST include the book title "${title}" prominently displayed on the cover
2. MUST include "By ScrollAuthor AI" or "ScrollAuthor AI" as the author credit
3. Title should be the LARGEST text element, positioned for maximum visual impact
4. Author name should be smaller, positioned below the title or at the bottom
5. Use elegant, readable typography that matches the ${selectedTheme.name} style
6. Ensure HIGH CONTRAST between text and background for readability
7. Text should be properly spelled exactly as provided

DESIGN REQUIREMENTS:
- Create a striking visual composition that evokes the ${category.replace(/_/g, " ")} subject matter
- Use powerful imagery, patterns, and visual elements appropriate to the theme
- Aspect ratio: vertical book cover (3:4)
- Ultra high resolution, professional quality
- The background should complement and not compete with the text
- Create visual hierarchy: Title first, then imagery, then author name
- Include appropriate symbolic or thematic imagery for the topic`;
    }

    // Retry logic for image generation
    const maxRetries = 3;
    let imageUrl: string | null = null;
    let lastError: string = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[GENERATE-COVER] Attempt ${attempt}/${maxRetries}...`);
        
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
          console.error(`[GENERATE-COVER] AI gateway error (attempt ${attempt}):`, response.status, errorText);
          
          if (response.status === 429) {
            if (attempt < maxRetries) {
              console.log(`[GENERATE-COVER] Rate limited, waiting ${attempt * 2}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 2000));
              continue;
            }
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
          
          lastError = `AI gateway error: ${response.status}`;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error(lastError);
        }

        const data = await response.json();
        console.log(`[GENERATE-COVER] Response received, checking for images...`);
        
        // Check multiple possible locations for the image
        const possibleImageUrl = 
          data.choices?.[0]?.message?.images?.[0]?.image_url?.url ||
          data.choices?.[0]?.message?.content?.images?.[0]?.image_url?.url ||
          data.images?.[0]?.image_url?.url;

        if (possibleImageUrl) {
          imageUrl = possibleImageUrl;
          console.log(`[GENERATE-COVER] Image URL found on attempt ${attempt}`);
          break;
        }

        // Log the response structure for debugging
        console.log(`[GENERATE-COVER] No image in response structure. Keys:`, Object.keys(data));
        if (data.choices?.[0]?.message) {
          console.log(`[GENERATE-COVER] Message keys:`, Object.keys(data.choices[0].message));
        }
        
        lastError = "No image in AI response";
        if (attempt < maxRetries) {
          console.log(`[GENERATE-COVER] Retrying in ${attempt}s...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      } catch (fetchError) {
        console.error(`[GENERATE-COVER] Fetch error (attempt ${attempt}):`, fetchError);
        lastError = fetchError instanceof Error ? fetchError.message : "Network error";
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    if (!imageUrl) {
      console.error(`[GENERATE-COVER] All ${maxRetries} attempts failed: ${lastError}`);
      return new Response(JSON.stringify({ 
        error: "Failed to generate cover image after multiple attempts. Please try again.",
        details: lastError
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        theme: isComic ? 'comic-consistent' : (coverThemes[theme]?.name || 'Classic'),
        isComicCover: isComic,
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