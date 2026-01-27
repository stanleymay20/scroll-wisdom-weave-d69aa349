import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Slide layout types based on NotebookLM quality standards
type SlideLayout = 
  | 'title-visual'
  | 'learning-objectives'
  | 'concept-text'
  | 'concept-visual'
  | 'diagram-focus'
  | 'comparison'
  | 'example-walkthrough'
  | 'summary-proof';

interface SlideData {
  type: string;
  layout: SlideLayout;
  heading: string;
  content: string[]; // Max 5 bullets, max 15 words each
  sourceReference?: string;
  speakerNotes?: string;
  visual?: {
    type: 'diagram' | 'chart' | 'illustration' | 'icon';
    description: string;
    imageUrl?: string; // AI-generated image URL
  };
}

interface DeckGenerationParams {
  scope: 'chapter' | 'book';
  chapterNumbers?: number[];
  targetAudience: string;
  tone: string;
  maxSlides: number;
  includeVisuals: boolean;
  certificationContext: {
    bookId: string;
    bookVersion: string;
    contentHash: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, params, bookTitle } = await req.json() as {
      bookId: string;
      params: DeckGenerationParams;
      bookTitle: string;
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Storage client (used to avoid returning huge base64 payloads)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const storageClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    // Build NotebookLM-quality system prompt with strict presentation discipline
    const systemPrompt = `You are a premium Learning Deck generator for ScrollLibrary, trained to produce slides matching Google NotebookLM quality.

## PRESENTATION DISCIPLINE (MANDATORY - ENFORCED)

### SLIDE DENSITY LIMITS (HARD RULES)
- Maximum 5 bullet points per slide
- Maximum 12-15 words per bullet point
- ONE concept per slide only
- White space is intentional, not empty
- Heading must be under 8 words

### NARRATIVE SLIDE FLOW
Every deck follows this arc:
1. What is this? (Introduction)
2. Why does it matter? (Relevance)
3. How does it work? (Mechanism)
4. Show me an example (Application)
5. Key takeaway (Summary)

### VISUAL-FIRST PRINCIPLE
- Prefer diagram > text explanation
- Prefer chart > bullet points
- Prefer illustration > paragraph
- Every concept slide should suggest a visual if possible

## AVAILABLE LAYOUTS (pick from these ONLY)
1. "title-visual" - Title slide with book info and visual element
2. "learning-objectives" - 3-5 objectives as bullet points
3. "concept-text" - One concept with 3-5 bullets
4. "concept-visual" - Concept with primary visual element
5. "diagram-focus" - Visual dominates, minimal text
6. "comparison" - Two-column comparison layout
7. "example-walkthrough" - Step-by-step example
8. "summary-proof" - Key takeaways + verification badge

## SLIDE STRUCTURE

### Slide 1: Title (layout: title-visual)
- Book title (heading)
- Chapters covered
- "Verified Learning Deck"
- Version info
- Visual: Book cover or thematic illustration

### Slide 2: Learning Objectives (layout: learning-objectives)
- 3-5 clear, actionable objectives
- Start with verbs: "Understand", "Apply", "Analyze"
- Directly from book content

### Slides 3-N: Core Concepts
For each major concept:
- Choose appropriate layout (concept-text, concept-visual, diagram-focus, comparison)
- ONE concept per slide
- 3-5 bullets maximum
- Include suggested visual when appropriate
- MUST include source reference

### Application Slide (layout: example-walkthrough)
- Real-world example or scenario
- Step-by-step walkthrough
- Concrete, not abstract

### Final Slide: Summary (layout: summary-proof)
- 3-5 key takeaways
- Verification badge section
- "Generated after verified reading & assessment"

## SPEAKER NOTES
Include brief speaker notes for each slide:
- 2-3 sentences expanding on the slide content
- Talking points for presenters
- NOT visible on slides

## VISUAL DESCRIPTIONS (IMPORTANT FOR IMAGE GENERATION)
For each visual field, provide a DETAILED description that can be used to generate an image:
- Be specific about style: "minimalist flat design", "photorealistic", "hand-drawn sketch"
- Include colors, composition, and key elements
- Describe what the visual should communicate
- Example: "A circular flowchart showing 5 interconnected nodes representing the learning cycle, using blue and gold colors, minimalist flat design style"

## OUTPUT FORMAT (STRICT JSON)
{
  "slides": [
    {
      "type": "title|learning-objectives|core-concept|application|summary-proof",
      "layout": "title-visual|learning-objectives|concept-text|concept-visual|diagram-focus|comparison|example-walkthrough|summary-proof",
      "heading": "Short heading under 8 words",
      "content": ["bullet 1 (max 15 words)", "bullet 2"],
      "sourceReference": "Chapter X, Section Y",
      "speakerNotes": "Expanded talking points for presenter...",
      "visual": {
        "type": "diagram|chart|illustration|icon",
        "description": "DETAILED description for image generation - be specific about style, colors, composition, and what it should communicate"
      }
    }
  ]
}

## FORBIDDEN
- NO walls of text
- NO more than 5 bullets
- NO bullets over 15 words
- NO generic templates
- NO content not in the book
- NO AI hallucinations
- NO MCQ-style content

## PARAMETERS FOR THIS DECK
- Maximum slides: ${params.maxSlides}
- Tone: ${params.tone}
- Target audience: ${params.targetAudience}
- Include visuals: ${params.includeVisuals}`;

    const userPrompt = `Generate a NotebookLM-quality learning deck for: "${bookTitle}"

Scope: ${params.scope}
${params.chapterNumbers?.length ? `Chapters: ${params.chapterNumbers.join(', ')}` : 'Full book'}
Target Audience: ${params.targetAudience}
Tone: ${params.tone}
Max Slides: ${params.maxSlides}

CRITICAL: Follow the narrative arc (What → Why → How → Example → Takeaway).
CRITICAL: Max 5 bullets per slide, max 15 words per bullet.
CRITICAL: Include speaker notes for each slide.
CRITICAL: Provide DETAILED visual descriptions for each slide that can be used for AI image generation.

Return ONLY valid JSON matching the schema.`;

    console.log("[VLD] Generating deck for:", bookTitle);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6, // Lower for more consistent formatting
        max_tokens: 6000,
      }),
    });

    if (!response.ok) {
      const errorStatus = response.status;
      console.error(`[VLD] AI gateway error: ${errorStatus}`);
      if (errorStatus === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (errorStatus === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${errorStatus}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    // Parse and validate JSON response
    let slides: SlideData[] = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        slides = parsed.slides || [];
        
        // Validate and enforce density limits
        slides = slides.map((slide: SlideData) => ({
          ...slide,
          // Enforce max 5 bullets
          content: (slide.content || []).slice(0, 5).map((bullet: string) => {
            // Enforce max 15 words per bullet
            const words = bullet.split(' ');
            return words.length > 15 ? words.slice(0, 15).join(' ') + '...' : bullet;
          }),
          // Ensure layout exists
          layout: slide.layout || 'concept-text',
        }));
      }
    } catch (parseError) {
      console.error("[VLD] Failed to parse AI response:", parseError);
      // Create fallback slides with proper structure
      slides = [
        {
          type: "title",
          layout: "title-visual",
          heading: bookTitle,
          content: ["Verified Learning Deck", "Generated by ScrollLibrary"],
          speakerNotes: "Welcome to this learning deck generated from your verified reading.",
          visual: {
            type: "illustration",
            description: "A professional book cover design with golden accents, featuring an open book with rays of light emanating from its pages, symbolizing knowledge and learning"
          }
        },
        {
          type: "summary-proof",
          layout: "summary-proof",
          heading: "Summary",
          content: ["Generation encountered an issue", "Please try again"],
          speakerNotes: "The deck generation needs to be retried.",
        },
      ];
    }

    console.log("[VLD] Generated", slides.length, "slides, now generating visuals...");

    // ===========================================
    // VISUAL GENERATION - NotebookLM Quality (with rate limit handling)
    // ===========================================
    const warnings: string[] = [];

    if (params.includeVisuals) {
      // IMPORTANT: Generate visuals sequentially to prevent burst rate-limits
      // and upload base64 data URLs to storage to avoid oversized JSON responses.
      const updatedSlides: SlideData[] = [];
      const deckAssetPrefix = `vld/${crypto.randomUUID()}`;
      const MAX_VISUALS = Math.min(slides.length, 12);

      if (slides.length > MAX_VISUALS) {
        warnings.push(`Visuals were generated for the first ${MAX_VISUALS} slides only (to keep generation reliable).`);
      }

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];

        if (i >= MAX_VISUALS) {
          updatedSlides.push(slide);
          continue;
        }

        // Skip if no visual description or already has imageUrl
        if (!slide.visual?.description || slide.visual.imageUrl) {
          updatedSlides.push(slide);
          continue;
        }

        // Small delay between requests to avoid 429s
        await new Promise((r) => setTimeout(r, 650));

        try {
          console.log(`[VLD] Generating visual for slide ${i + 1}: ${slide.heading}`);
          const imagePrompt = buildSlideImagePrompt(slide, params.tone);

          const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              messages: [{ role: "user", content: imagePrompt }],
              modalities: ["image", "text"],
            }),
          });

          if (!imageResponse.ok) {
            console.log(`[VLD] Image skipped for slide ${i + 1}: ${imageResponse.status}`);
            updatedSlides.push(slide);
            continue;
          }

          const imageData = await imageResponse.json();
          const rawImageUrl: string | undefined = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (!rawImageUrl) {
            updatedSlides.push(slide);
            continue;
          }

          let finalImageUrl = rawImageUrl;

          // If the model returns base64 data URLs, upload to storage and use a public URL.
          if (rawImageUrl.startsWith("data:image/") && storageClient) {
            const match = rawImageUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (match) {
              const mime = match[1];
              const base64 = match[2];
              const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

              // Keep files reasonably sized; if huge, skip upload and keep slide w/o image.
              if (bytes.byteLength > 6 * 1024 * 1024) {
                console.log(`[VLD] Image too large (${bytes.byteLength} bytes) for slide ${i + 1}; skipping.`);
                warnings.push(`Slide ${i + 1} visual was skipped because it was too large.`);
                updatedSlides.push(slide);
                continue;
              }

              const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
              const path = `${deckAssetPrefix}/slide-${String(i + 1).padStart(2, "0")}.${ext}`;
              const { error: uploadError } = await storageClient
                .storage
                .from("book-assets")
                .upload(path, bytes, {
                  contentType: mime,
                  upsert: true,
                });

              if (uploadError) {
                console.log(`[VLD] Upload failed for slide ${i + 1}: ${uploadError.message}`);
                warnings.push(`Slide ${i + 1} visual upload failed; using text-only slide.`);
                updatedSlides.push(slide);
                continue;
              }

              const { data: publicData } = storageClient
                .storage
                .from("book-assets")
                .getPublicUrl(path);

              if (publicData?.publicUrl) {
                finalImageUrl = publicData.publicUrl;
              }
            }
          }

          console.log(`[VLD] Visual generated for slide ${i + 1}`);
          updatedSlides.push({
            ...slide,
            visual: {
              type: slide.visual.type,
              description: slide.visual.description,
              imageUrl: finalImageUrl,
            },
          });
        } catch (imgError) {
          console.log(`[VLD] Visual error for slide ${i + 1}:`, imgError);
          warnings.push(`Slide ${i + 1} visual generation failed; using text-only slide.`);
          updatedSlides.push(slide);
        }
      }

      slides = updatedSlides;
    }

    // Count slides with generated visuals
    const visualsGenerated = slides.filter(s => s.visual?.imageUrl).length;
    console.log("[VLD] Generated", visualsGenerated, "visuals out of", slides.length, "slides");

    // Build the deck object with full metadata
    const deck = {
      id: crypto.randomUUID(),
      title: `${bookTitle} - Learning Deck`,
      slides,
      metadata: {
        bookId: params.certificationContext.bookId,
        bookVersion: params.certificationContext.bookVersion,
        contentHash: params.certificationContext.contentHash,
        chaptersCovered: params.chapterNumbers || [],
        generatedAt: new Date().toISOString(),
        generatedAfterAssessment: true,
        scope: params.scope,
        targetAudience: params.targetAudience,
        tone: params.tone,
        visualsGenerated,
      },
      isValid: true,
      eligibility: {
        isEligible: true,
        chaptersRead: params.chapterNumbers || [],
        chaptersRequired: params.chapterNumbers || [],
        quizzesAttempted: params.chapterNumbers || [],
        quizzesRequired: params.chapterNumbers || [],
        readProgress: 100,
        hasIntegrityFlags: false,
      },
    };

    return new Response(JSON.stringify({ deck, warnings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[VLD] Generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Build an optimized image prompt for presentation slide visuals
 */
function buildSlideImagePrompt(slide: SlideData, tone: string): string {
  const visualDesc = slide.visual?.description || '';
  const visualType = slide.visual?.type || 'illustration';
  
  // Style based on tone
  let styleGuide = '';
  switch (tone) {
    case 'academic':
      styleGuide = 'Professional, clean, minimalist design with blue and gray color palette. Suitable for university presentations.';
      break;
    case 'simple':
      styleGuide = 'Simple, clear, friendly design with soft colors. Easy to understand at a glance.';
      break;
    case 'visual':
      styleGuide = 'Bold, vibrant, eye-catching design with rich colors and strong visual hierarchy.';
      break;
    case 'children':
      styleGuide = 'Colorful, playful, fun design with rounded shapes and bright primary colors. Child-friendly.';
      break;
    default:
      styleGuide = 'Modern, professional presentation style with clean lines and balanced composition.';
  }
  
  // Visual type specific instructions
  let typeGuide = '';
  switch (visualType) {
    case 'diagram':
      typeGuide = 'Create a clear, labeled diagram showing relationships and flow. Use arrows and connecting lines.';
      break;
    case 'chart':
      typeGuide = 'Create a clean data visualization. Use appropriate chart type (bar, pie, line) for the data.';
      break;
    case 'illustration':
      typeGuide = 'Create an illustrative image that captures the concept visually.';
      break;
    case 'icon':
      typeGuide = 'Create a simple, recognizable icon or symbol representing the concept.';
      break;
  }
  
  return `Create a presentation slide visual for a learning deck.

Slide Title: "${slide.heading}"
Visual Description: ${visualDesc}

Style Requirements:
${styleGuide}
${typeGuide}

Technical Requirements:
- 16:9 aspect ratio (presentation format)
- Clean white or light background
- No text in the image (text will be overlaid)
- High contrast for projection readability
- Professional quality suitable for educational presentations

Generate a polished, NotebookLM-quality visual that effectively communicates the concept.`;
}