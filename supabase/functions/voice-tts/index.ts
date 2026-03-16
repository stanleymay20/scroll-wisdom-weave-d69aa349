import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VOICE-TTS] ${step}${detailsStr}`);
};

// ElevenLabs voices
const ELEVEN_VOICES: Record<string, string> = {
  alloy: "EXAVITQu4vr4xnSDxMaL", // Sarah
  echo: "JBFqnCBsd6RMkjVDRZzb", // George
  nova: "FGY2WhTYpPnrIDTdsKH5", // Laura
  shimmer: "Xb7hH8MSUJpSbSDYk0k2", // Alice
  onyx: "N2lVS1w4EtoT3dr4eOWO", // Callum
  fable: "CwhRBWXzGAHq8TQ4Fs17", // Roger
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const useElevenLabs = !!ELEVENLABS_API_KEY;
    const useOpenAI = !!OPENAI_API_KEY;

    if (!useElevenLabs && !useOpenAI) {
      throw new Error("No TTS service configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
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

    logStep("User authenticated", { userId: user.id.slice(0, 8) + "..." });

    const { text, voice = "nova" } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit and clean text
    const cleanText = text.slice(0, 5000).trim();
    logStep("Processing text", { textLength: cleanText.length, voice });

    let audioBuffer: ArrayBuffer | null = null;

    // Try ElevenLabs first (higher quality)
    if (useElevenLabs) {
      try {
        const voiceId = ELEVEN_VOICES[voice] || ELEVEN_VOICES.nova;
        logStep("Sending to ElevenLabs TTS", { voiceId });

        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: cleanText,
              model_id: "eleven_turbo_v2_5",
              output_format: "mp3_44100_128",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.3,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (response.ok) {
          audioBuffer = await response.arrayBuffer();
          logStep("ElevenLabs TTS successful", { audioSize: audioBuffer.byteLength });
        } else {
          const errorText = await response.text();
          logStep("ElevenLabs TTS failed", { status: response.status, error: errorText });
          
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          if (!useOpenAI) {
            throw new Error(`ElevenLabs TTS error: ${response.status}`);
          }
        }
      } catch (elevenLabsError) {
        if (!useOpenAI) throw elevenLabsError;
        logStep("ElevenLabs failed, trying OpenAI fallback");
      }
    }

    // Fallback to OpenAI TTS
    if (!audioBuffer && useOpenAI) {
      logStep("Sending to OpenAI TTS");
      
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: cleanText,
          voice: voice === "nova" ? "nova" : voice === "shimmer" ? "shimmer" : "alloy",
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logStep("OpenAI TTS error", { status: response.status, error: errorText });
        
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        throw new Error(`OpenAI TTS error: ${response.status}`);
      }

      audioBuffer = await response.arrayBuffer();
      logStep("OpenAI TTS successful", { audioSize: audioBuffer.byteLength });
    }

    if (!audioBuffer) {
      throw new Error("Failed to generate audio");
    }

    const base64Audio = base64Encode(audioBuffer);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
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
