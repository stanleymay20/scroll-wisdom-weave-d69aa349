import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VOICE-STT] ${step}${detailsStr}`);
};

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768): Uint8Array {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

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
      throw new Error("No STT service configured (need ELEVENLABS_API_KEY or OPENAI_API_KEY)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user using getClaims
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      logStep("Auth error", { error: claimsError?.message });
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    logStep("User authenticated", { userId: userId.slice(0, 8) + "..." });

    const { audio, language = "en" } = await req.json();

    if (!audio) {
      return new Response(JSON.stringify({ error: "Audio data is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Processing audio", { audioLength: audio.length, language });

    const binaryAudio = processBase64Chunks(audio);
    logStep("Audio processed", { binarySize: binaryAudio.length });

    let transcriptText = "";

    if (useElevenLabs) {
      try {
        const formData = new FormData();
        const blob = new Blob([binaryAudio.buffer as ArrayBuffer], { type: "audio/webm" });
        formData.append("file", blob, "audio.webm");
        formData.append("model_id", "scribe_v1");
        
        const languageMap: Record<string, string> = {
          en: "eng", es: "spa", fr: "fra", de: "deu", 
          pt: "por", sw: "swa", ar: "ara",
        };
        
        if (languageMap[language]) {
          formData.append("language_code", languageMap[language]);
        }

        logStep("Sending to ElevenLabs STT");

        const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_API_KEY! },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          transcriptText = result.text || "";
          logStep("ElevenLabs transcription successful", { textLength: transcriptText.length });
        } else {
          const errorText = await response.text();
          logStep("ElevenLabs STT failed, trying fallback", { status: response.status, error: errorText });
          throw new Error(`ElevenLabs STT error: ${response.status}`);
        }
      } catch (elevenLabsError) {
        if (!useOpenAI) throw elevenLabsError;
        logStep("Falling back to OpenAI Whisper");
      }
    }

    if (!transcriptText && useOpenAI) {
      const formData = new FormData();
      const blob = new Blob([binaryAudio.buffer as ArrayBuffer], { type: "audio/webm" });
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-1");
      if (language !== "auto") {
        formData.append("language", language);
      }

      logStep("Sending to OpenAI Whisper");

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logStep("OpenAI Whisper error", { status: response.status, error: errorText });
        
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`OpenAI Whisper error: ${response.status}`);
      }

      const result = await response.json();
      transcriptText = result.text || "";
      logStep("OpenAI transcription successful", { textLength: transcriptText.length });
    }

    if (!transcriptText) {
      throw new Error("Failed to transcribe audio");
    }

    return new Response(
      JSON.stringify({ success: true, text: transcriptText }),
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
