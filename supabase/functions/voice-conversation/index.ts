import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VOICE-CONVERSATION] ${step}${detailsStr}`);
};

// Cognitive level system prompts
const COGNITIVE_PROMPTS: Record<string, string> = {
  familiarisation: `You are a reading assistant. Simply read the chapter content aloud without additional explanation. 
Your role is to help the user familiarize themselves with the material by reading it clearly.
Do NOT add extra explanations or go beyond what's in the text.`,

  functional: `You are a helpful reading assistant. When the user asks questions, provide clear and concise answers.
Focus on helping the user understand the basic concepts and terminology in the text.
You can clarify terms and provide simple explanations, but keep answers straightforward.`,

  applied: `You are an expert teaching assistant helping users achieve Applied Understanding.
When explaining concepts:
- Connect ideas to real-world applications
- Provide practical examples even if not in the text
- Help users see how they could apply this knowledge
- Encourage thinking about use cases and scenarios
Be conversational and engaging, like a knowledgeable tutor.`,

  analytical: `You are a master scholar guiding Critical Analysis.
Your role is to:
- Probe deeper meanings and underlying assumptions
- Encourage analysis of arguments and evidence
- Connect concepts to broader academic frameworks
- Challenge users to think critically and question assumptions
- Provide nuanced explanations that go beyond surface meaning
Be Socratic - ask probing questions to deepen understanding.`,

  mastery: `You are a scholarly mentor guiding toward Knowledge Creation.
Your role is to:
- Synthesize ideas across disciplines
- Challenge users to create new frameworks
- Explore cutting-edge implications and extensions
- Connect to current research and debates
- Guide users to generate original insights
- Encourage academic discourse and scholarly thinking
Be a co-thinker, exploring ideas together at the highest level.`,
};

// ElevenLabs voices
const VOICES: Record<string, string> = {
  alloy: "EXAVITQu4vr4xnSDxMaL",
  nova: "FGY2WhTYpPnrIDTdsKH5",
  shimmer: "Xb7hH8MSUJpSbSDYk0k2",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Authenticate user using getClaims
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      logStep("Auth error", { error: claimsError?.message });
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("User authenticated", { userId: (claimsData.claims.sub as string).slice(0, 8) + "..." });

    const { 
      userMessage, 
      chapterContent, 
      chapterTitle, 
      bookTitle,
      cognitiveLevel = "functional",
      conversationHistory = [],
      voice = "nova",
      generateAudio = true,
    } = await req.json();

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "User message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Processing request", { 
      cognitiveLevel, 
      messageLength: userMessage.length,
      generateAudio,
    });

    // Get cognitive level prompt
    const systemPrompt = COGNITIVE_PROMPTS[cognitiveLevel] || COGNITIVE_PROMPTS.functional;

    // Build messages for AI
    const messages = [
      {
        role: "system",
        content: `${systemPrompt}

CONTEXT:
- Book: "${bookTitle}"
- Chapter: "${chapterTitle}"
- Learning Mode: ${cognitiveLevel}

CHAPTER CONTENT:
${chapterContent?.slice(0, 2500) || ""}

IMPORTANT:
- Respond conversationally as if speaking
- Keep responses concise (2-3 paragraphs max) for voice
- Be warm and engaging
- Match your depth to the cognitive level
${cognitiveLevel === "familiarisation" ? "- ONLY read/explain what's in the text" : "- Feel free to expand beyond the text to teach deeply"}`
      },
      ...conversationHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: "user",
        content: userMessage
      }
    ];

    // Call AI - use fast model for voice latency
    logStep("Calling AI", { model: "google/gemini-3-flash-preview" });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logStep("AI error", { status: aiResponse.status });

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const textResponse = aiData.choices?.[0]?.message?.content;

    if (!textResponse) {
      throw new Error("No response generated");
    }

    logStep("AI response received", { responseLength: textResponse.length });

    // Generate audio response if requested and ElevenLabs is available
    let audioContent = null;
    if (generateAudio && ELEVENLABS_API_KEY) {
      try {
        const voiceId = VOICES[voice] || VOICES.nova;
        
        logStep("Generating audio response", { voiceId });

        const ttsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: textResponse.slice(0, 2000),
              model_id: "eleven_turbo_v2_5",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.3,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (ttsResponse.ok) {
          const audioBuffer = await ttsResponse.arrayBuffer();
          audioContent = base64Encode(audioBuffer);
          logStep("Audio generated", { audioSize: audioBuffer.byteLength });
        } else {
          logStep("TTS failed, returning text only", { status: ttsResponse.status });
        }
      } catch (ttsError) {
        logStep("TTS error, returning text only", { error: String(ttsError) });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: textResponse,
        audio: audioContent,
        cognitiveLevel,
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
