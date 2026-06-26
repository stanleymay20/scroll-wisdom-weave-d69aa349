import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * A+++ Chapter Video Script Generator
 * 
 * Book-type-aware video generation with:
 * - Type-specific scene structures & visual types
 * - Structural variation engine (skeleton rotation)
 * - Tier-routed TTS with book-type voice selection
 * - Emotional architecture for children's books
 * - Framework visualizations for professional books
 */

// ── Book-type visual types ──────────────────────────────────

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

// ── Book-type video style contracts ──────────────────────────

function getBookTypeVideoContract(bookType: string): string {
  const contracts: Record<string, string> = {
    standard: `ACADEMIC LECTURE VIDEO CONTRACT:
- Open with clear learning objectives (what viewer will understand)
- Present 3-5 key concepts with supporting evidence
- Use "key_concept" type for definitions and core ideas
- Use "diagram_description" for processes/relationships
- Close with summary + one Bloom's Taxonomy question (Apply or above)
- Narration tone: authoritative yet accessible professor
- Visual types: ${VISUAL_TYPES_BY_BOOK.standard.join(", ")}`,

    professional: `EXECUTIVE BRIEFING VIDEO CONTRACT:
- Open with executive_summary (30-second value proposition)
- Present findings using frameworks: SWOT, Porter's 5 Forces, matrices
- Use "framework" type for strategic models with labeled quadrants
- Use "data_insight" for statistics and trend analysis
- Use "case_study" for real-world application examples
- Close with "action_items" (3 concrete next steps) + "strategic_question"
- Narration tone: confident business strategist, data-driven language
- Visual types: ${VISUAL_TYPES_BY_BOOK.professional.join(", ")}`,

    children: `CHILDREN'S EMOTIONAL ARCHITECTURE VIDEO CONTRACT:
- Follow emotional arc: Safety → Curiosity → Tension → Resolution → Warmth
- Open with "story_opening" that establishes a safe, inviting world
- Use "adventure_scene" with action verbs and movement
- "character_moment" for empathy and emotional connection
- "sensory_experience" MUST engage 2+ senses (sound words: SPLASH, WHOOSH, textures)
- "discovery" for the learning payoff moment
- Close with warm "reflection_question" (How did that make YOU feel?)
- Narration: ≤12 words per sentence. Warm, playful, wonder-filled voice
- Use emoji liberally in bullet points
- Visual types: ${VISUAL_TYPES_BY_BOOK.children.join(", ")}`,

    reference: `REFERENCE/ENCYCLOPEDIA VIDEO CONTRACT:
- Open with "definition_card" (term + precise definition)
- Use "taxonomy" for classification hierarchies
- "cross_reference" to connect to related concepts
- "example_usage" with real-world application
- "comparison_table" for distinguishing similar concepts
- Close with "quick_quiz" (definition recall)
- Narration tone: precise, encyclopedic, authoritative
- Visual types: ${VISUAL_TYPES_BY_BOOK.reference.join(", ")}`,

    comic: `COMIC/VISUAL NARRATIVE VIDEO CONTRACT:
- Open with "panel_establishing" (wide shot, setting description)
- Use "dialogue_scene" with character name + speech (format: CHARACTER: "dialogue")
- "action_sequence" with dynamic motion descriptions and sound effects
- "reaction_shot" for emotional beats and character development
- "learning_highlight" for educational content woven into story
- Close with "cliffhanger" or "takeaway" with moral/lesson
- Narration tone: dramatic narrator, varied pacing, character voices in dialogue
- Include panel composition hints in imagePrompt
- Visual types: ${VISUAL_TYPES_BY_BOOK.comic.join(", ")}`,

    workbook: `INTERACTIVE WORKBOOK VIDEO CONTRACT:
- Open with "concept_review" (brief recap of the concept)
- "worked_example" with step-by-step walkthrough (numbered steps in bulletPoints)
- "practice_problem" presented as a challenge to pause and try
- "step_by_step" breaking down the solution method
- "solution_reveal" with the answer and explanation
- "self_check" with 2-3 quick validation questions
- Close with "challenge" (harder problem for advanced learners)
- Narration tone: encouraging tutor, "let's work through this together"
- Visual types: ${VISUAL_TYPES_BY_BOOK.workbook.join(", ")}`,

    illustrated: `ILLUSTRATED CONTENT VIDEO CONTRACT:
- Open with "visual_overview" (bird's eye description of the visual landscape)
- "annotated_diagram" with labeled parts and callouts
- "process_flow" showing sequential steps with arrows/connections
- "detail_zoom" focusing on one critical component
- "comparison_visual" for before/after or side-by-side analysis
- "infographic" for data visualization description
- Close with "visual_summary" synthesizing all visual elements
- Narration tone: art director describing a gallery, pointing out details
- imagePrompt MUST be highly detailed for each scene
- Visual types: ${VISUAL_TYPES_BY_BOOK.illustrated.join(", ")}`,

    bestseller: `BESTSELLER/NARRATIVE VIDEO CONTRACT:
- Open with "hook" (provocative question, shocking statistic, or compelling story)
- "story_beat" for narrative progression with tension building
- "key_insight" for the core idea reveal (the "aha" moment)
- "case_narrative" for supporting stories and examples
- "aha_moment" for the transformative realization
- "framework_reveal" for the author's model/system
- Close with "call_to_action" (what the viewer should do NOW)
- Narration tone: TED Talk speaker, passionate, conversational authority
- Visual types: ${VISUAL_TYPES_BY_BOOK.bestseller.join(", ")}`,
  };
  return contracts[bookType] || contracts.standard;
}

// ── Structural variation skeletons ──────────────────────────

const SKELETON_VARIANTS: Record<string, string[][]> = {
  standard: [
    ["title_card", "learning_objectives", "key_concept", "text_slide", "key_concept", "diagram_description", "text_slide", "summary", "quiz_prompt"],
    ["title_card", "key_concept", "diagram_description", "key_concept", "text_slide", "key_concept", "summary", "quiz_prompt"],
    ["title_card", "text_slide", "key_concept", "text_slide", "diagram_description", "key_concept", "quiz_prompt", "summary"],
  ],
  professional: [
    ["title_card", "executive_summary", "framework", "data_insight", "case_study", "data_insight", "action_items", "strategic_question"],
    ["title_card", "data_insight", "framework", "case_study", "framework", "action_items", "strategic_question"],
    ["title_card", "executive_summary", "case_study", "data_insight", "framework", "action_items", "strategic_question"],
  ],
  children: [
    ["story_opening", "adventure_scene", "character_moment", "sensory_experience", "discovery", "fun_fact", "reflection_question"],
    ["story_opening", "sensory_experience", "adventure_scene", "character_moment", "discovery", "reflection_question"],
    ["story_opening", "character_moment", "adventure_scene", "sensory_experience", "fun_fact", "discovery", "reflection_question"],
  ],
  comic: [
    ["panel_establishing", "dialogue_scene", "action_sequence", "reaction_shot", "dialogue_scene", "learning_highlight", "takeaway"],
    ["panel_establishing", "action_sequence", "dialogue_scene", "reaction_shot", "learning_highlight", "cliffhanger"],
    ["panel_establishing", "dialogue_scene", "reaction_shot", "action_sequence", "dialogue_scene", "learning_highlight", "takeaway"],
  ],
};

function getSkeletonForChapter(bookType: string, chapterNumber: number): string[] | undefined {
  const skeletons = SKELETON_VARIANTS[bookType];
  if (!skeletons) return undefined;
  return skeletons[chapterNumber % skeletons.length];
}

// ── TTS voice routing by book type ──────────────────────────

function getTTSVoiceForBookType(bookType: string): { voiceId: string; speed: number; stability: number; style: number } {
  const voices: Record<string, { voiceId: string; speed: number; stability: number; style: number }> = {
    standard: { voiceId: "onwK4e9ZLuTAKqWW03F9", speed: 0.95, stability: 0.6, style: 0.2 },    // Daniel - clear academic
    professional: { voiceId: "nPczCjzI2devNBz1zQrb", speed: 0.9, stability: 0.7, style: 0.3 },  // Brian - authoritative
    children: { voiceId: "EXAVITQu4vr4xnSDxMaL", speed: 0.85, stability: 0.4, style: 0.6 },    // Sarah - warm, expressive
    reference: { voiceId: "JBFqnCBsd6RMkjVDRZzb", speed: 0.9, stability: 0.8, style: 0.1 },    // George - precise
    comic: { voiceId: "IKne3meq5aSn9XLyUdCD", speed: 1.0, stability: 0.35, style: 0.7 },       // Charlie - dramatic
    workbook: { voiceId: "N2lVS1w4EtoT3dr4eOWO", speed: 0.92, stability: 0.5, style: 0.4 },    // Callum - encouraging tutor
    illustrated: { voiceId: "Xb7hH8MSUJpSbSDYk0k2", speed: 0.88, stability: 0.55, style: 0.35 }, // Matilda - descriptive
    bestseller: { voiceId: "TX3LPaxmHKxFdv7VOQHJ", speed: 0.95, stability: 0.45, style: 0.55 }, // Liam - TED Talk energy
  };
  return voices[bookType] || voices.standard;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber } = await req.json();

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

    const resolvedType = bookType || "standard";
    const model = tier === "prophet_tier" || tier === "premium"
      ? "google/gemini-2.5-flash-lite"
      : "google/gemini-2.5-flash-lite";

    const videoContract = getBookTypeVideoContract(resolvedType);
    const skeleton = getSkeletonForChapter(resolvedType, chapterNumber || 1);
    const visualTypes = VISUAL_TYPES_BY_BOOK[resolvedType] || VISUAL_TYPES_BY_BOOK.standard;
    const targetLang = language || "en";

    const skeletonInstruction = skeleton
      ? `\nPREFERRED SCENE FLOW (adapt to content, but follow this structure):\n${skeleton.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    const systemPrompt = `You are a world-class educational video scriptwriter specializing in ${resolvedType} content.

OUTPUT: Return ONLY a valid JSON array of scene objects. No markdown, no explanation.

=== VIDEO CONTRACT ===
${videoContract}
${skeletonInstruction}

RULES:
- Create 8-12 scenes for a comprehensive 3-5 minute video
- Each scene: 12-25 seconds of narration
- Total video: 3-5 minutes
- Narration must be vivid, conversational, and cinematic — paint pictures with words
- ONLY use visualType values from this list: ${visualTypes.join(", ")}
- Vary transitions for visual rhythm (don't repeat same transition consecutively)
- Output language: ${targetLang}
- Each scene MUST include an imagePrompt with ultra-detailed visual description (50+ words)
- Build dramatic pacing: hook → build → climax → resolve

SCENE SCHEMA:
{
  "sceneNumber": number,
  "title": "compelling punchy title (3-6 words)",
  "narration": "what the narrator says (3-5 sentences, vivid TED-Talk energy)",
  "visualType": "one of the allowed types above",
  "bulletPoints": ["optional", "bullet", "points"],
  "keyTerms": ["highlighted", "terms"],
  "dialogueLines": [{"character": "Name", "line": "What they say"}],
  "duration": 12-25 seconds,
  "transition": "fade" | "slide_left" | "slide_up" | "zoom" | "dissolve",
  "imagePrompt": "ultra-detailed cinematic visual (50+ words): specify camera angle, lighting setup, color palette, mood, foreground/background layers, depth of field. NO text in image.",
  "emoji": "single relevant emoji for this scene"
}`;

    const userPrompt = `Create a ${resolvedType} video script for:

BOOK: "${bookTitle}"
CHAPTER: "${chapterTitle}" (Chapter ${chapterNumber || 1})

CHAPTER CONTENT:
${chapterContent.substring(0, 8000)}

Return ONLY the JSON array.`;

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

    let scenes: any[];
    try {
      const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      scenes = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent.substring(0, 500));
      throw new Error("Failed to generate video script");
    }

    // Validate, enrich, and enforce type constraints
    const allowedTypes = new Set(visualTypes);
    scenes = scenes.map((scene: any, i: number) => ({
      sceneNumber: i + 1,
      title: scene.title || `Scene ${i + 1}`,
      narration: scene.narration || "",
      visualType: allowedTypes.has(scene.visualType) ? scene.visualType : visualTypes[0],
      bulletPoints: Array.isArray(scene.bulletPoints) ? scene.bulletPoints : [],
      keyTerms: Array.isArray(scene.keyTerms) ? scene.keyTerms : [],
      dialogueLines: Array.isArray(scene.dialogueLines) ? scene.dialogueLines : [],
      duration: Math.max(10, Math.min(25, scene.duration || 15)),
      transition: scene.transition || ["fade", "slide_left", "slide_up", "zoom", "dissolve"][i % 5],
      imagePrompt: scene.imagePrompt || "",
      emoji: scene.emoji || "",
    }));

    const totalDuration = scenes.reduce((sum: number, s: any) => sum + s.duration, 0);

    // TTS narration with book-type voice routing
    let narrationAudioBase64: string | undefined;
    if (tier === "premium" || tier === "prophet_tier") {
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          const voiceConfig = getTTSVoiceForBookType(resolvedType);
          const fullNarration = scenes.map((s: any) => s.narration).join(" ... ");

          const ttsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.voiceId}?output_format=mp3_22050_32`,
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
                  stability: voiceConfig.stability,
                  similarity_boost: 0.75,
                  style: voiceConfig.style,
                  speed: voiceConfig.speed,
                },
              }),
            }
          );

          if (ttsResponse.ok) {
            const audioBuffer = await ttsResponse.arrayBuffer();
            narrationAudioBase64 = base64Encode(audioBuffer);
          } else {
            console.warn("TTS generation failed:", ttsResponse.status);
          }
        } catch (ttsError) {
          console.warn("TTS error (non-fatal):", ttsError);
        }
      }
    }

    const videoPlan = {
      chapterTitle,
      bookTitle,
      bookType: resolvedType,
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
