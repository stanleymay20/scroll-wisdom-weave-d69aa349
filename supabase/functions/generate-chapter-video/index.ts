import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generate Chapter Video Script
 * 
 * Tier routing:
 * - Free/Student: Text-only slide script (client renders animated slides)
 * - Premium: Slide script + TTS narration audio
 * - Institutional: Slide script + TTS + AI-generated scene images
 * 
 * Returns a structured video plan with scenes, narration, and visual cues.
 */

interface VideoScene {
  sceneNumber: number;
  title: string;
  narration: string;
  visualType: "text_slide" | "key_concept" | "diagram_description" | "summary" | "title_card" | "quiz_prompt";
  bulletPoints?: string[];
  keyTerms?: string[];
  duration: number; // seconds
  transition: "fade" | "slide_left" | "slide_up" | "zoom" | "dissolve";
  backgroundColor?: string;
  imagePrompt?: string; // For institutional tier
}

interface VideoPlan {
  chapterTitle: string;
  bookTitle: string;
  bookType: string;
  totalDuration: number;
  scenes: VideoScene[];
  narrationAudioBase64?: string;
  sceneImages?: { sceneNumber: number; imageUrl: string }[];
}

function getBookTypeVideoStyle(bookType: string): string {
  const styles: Record<string, string> = {
    standard: `Academic lecture style. Use clear headings, bullet points, and key concept highlights. 
               Structure: Title → Learning Objectives → Key Concepts (3-5 slides) → Summary → Review Question.`,
    professional: `Executive briefing style. Use frameworks (SWOT, matrices), data-driven insights, and action items.
                   Structure: Executive Summary → Key Findings → Framework Analysis → Strategic Implications → Action Items.`,
    children: `Fun, colorful storytelling style. Use simple language, emoji indicators, and imagination prompts.
               Structure: Story Opening → Adventure Scene → Discovery Moment → Fun Fact → Reflection Question.
               Keep sentences under 12 words. Use sensory language.`,
    reference: `Encyclopedia/dictionary style. Use definitions, taxonomies, and cross-references.
                Structure: Term/Concept → Definition → Context → Related Terms → Quick Quiz.`,
    comic: `Visual storytelling with dialogue. Describe panel compositions and character expressions.
            Structure: Scene Setting → Character Introduction → Conflict → Resolution → Learning Takeaway.`,
    workbook: `Interactive exercise style. Include practice problems, fill-in-the-blank, and step-by-step solutions.
               Structure: Concept Review → Worked Example → Practice Problem → Solution Walkthrough → Self-Check.`,
    illustrated: `Visual-heavy presentation. Each slide should reference a specific illustration or diagram.
                  Structure: Visual Overview → Annotated Diagram → Process Flow → Detail Zoom → Summary Infographic.`,
  };
  return styles[bookType] || styles.standard;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chapterContent, chapterTitle, bookTitle, bookType, tier, language } = await req.json();

    if (!chapterContent || !chapterTitle) {
      return new Response(
        JSON.stringify({ error: "Chapter content and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Select model based on tier
    const model = tier === "prophet_tier" || tier === "premium"
      ? "google/gemini-2.5-flash"
      : "google/gemini-2.5-flash-lite";

    const videoStyle = getBookTypeVideoStyle(bookType || "standard");
    const targetLang = language || "en";

    const systemPrompt = `You are a world-class educational video scriptwriter. Create a video scene plan for a chapter.

OUTPUT: Return ONLY a valid JSON array of scene objects. No markdown, no explanation.

STYLE FOR THIS BOOK TYPE:
${videoStyle}

RULES:
- Create 6-12 scenes depending on content length
- Each scene should be 8-20 seconds of narration
- Total video should be 2-5 minutes
- Narration must be natural, conversational, and engaging
- Include varied visual types for engagement
- Use transitions that match the content flow
- Output language: ${targetLang}
- For each scene, include an imagePrompt describing a professional visual that could accompany it

SCENE SCHEMA:
{
  "sceneNumber": number,
  "title": "short title",
  "narration": "what the narrator says (2-4 sentences)",
  "visualType": "text_slide" | "key_concept" | "diagram_description" | "summary" | "title_card" | "quiz_prompt",
  "bulletPoints": ["optional", "bullet", "points"],
  "keyTerms": ["highlighted", "terms"],
  "duration": seconds,
  "transition": "fade" | "slide_left" | "slide_up" | "zoom" | "dissolve",
  "imagePrompt": "description of a professional illustration for this scene"
}`;

    const userPrompt = `Create a video script for this chapter:

BOOK: "${bookTitle}"
CHAPTER: "${chapterTitle}"
BOOK TYPE: ${bookType || "standard"}

CHAPTER CONTENT (summarize into engaging video scenes):
${chapterContent.substring(0, 8000)}

Return ONLY the JSON array of scenes.`;

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
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "[]";

    // Parse JSON from response (handle markdown code blocks)
    let scenes: VideoScene[];
    try {
      const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      scenes = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent.substring(0, 500));
      throw new Error("Failed to generate video script");
    }

    // Validate and enrich scenes
    scenes = scenes.map((scene, i) => ({
      sceneNumber: i + 1,
      title: scene.title || `Scene ${i + 1}`,
      narration: scene.narration || "",
      visualType: scene.visualType || "text_slide",
      bulletPoints: scene.bulletPoints || [],
      keyTerms: scene.keyTerms || [],
      duration: Math.max(5, Math.min(30, scene.duration || 12)),
      transition: scene.transition || "fade",
      imagePrompt: scene.imagePrompt || "",
    }));

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    // For Premium/Institutional: Generate TTS narration
    let narrationAudioBase64: string | undefined;
    if (tier === "premium" || tier === "prophet_tier") {
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          const fullNarration = scenes.map(s => s.narration).join(" ... ");
          const ttsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_22050_32`,
            {
              method: "POST",
              headers: {
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text: fullNarration.substring(0, 5000),
                model_id: "eleven_turbo_v2_5",
                voice_settings: {
                  stability: 0.6,
                  similarity_boost: 0.75,
                  style: 0.3,
                  speed: 0.95,
                },
              }),
            }
          );

          if (ttsResponse.ok) {
            const audioBuffer = await ttsResponse.arrayBuffer();
            // Encode to base64 using Deno standard library
            const { encode: base64Encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
            narrationAudioBase64 = base64Encode(audioBuffer);
          } else {
            console.warn("TTS generation failed:", ttsResponse.status);
          }
        } catch (ttsError) {
          console.warn("TTS error (non-fatal):", ttsError);
        }
      }
    }

    const videoPlan: VideoPlan = {
      chapterTitle,
      bookTitle,
      bookType: bookType || "standard",
      totalDuration,
      scenes,
      narrationAudioBase64,
    };

    return new Response(JSON.stringify(videoPlan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Video generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Video generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
