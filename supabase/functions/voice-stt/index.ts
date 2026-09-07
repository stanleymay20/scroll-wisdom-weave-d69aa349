import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  estimateWebmSeconds,
  releaseInteractiveVoiceSeconds,
  reserveInteractiveVoiceSeconds,
} from "../_shared/interactive-voice-gate.ts";
import { gateDenied, gateResponse, recordGateEvent } from "../_shared/usage-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_AUDIO_BASE64_CHARS = 3_300_000; // ~5 minutes at the fixed 64 kbps recorder bitrate

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VOICE-STT] ${step}${detailsStr}`);
};

function processBase64Chunks(base64String: string, chunkSize = 32768): Uint8Array {
  const chunks: Uint8Array[] = [];
  let position = 0;

  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    for (let i = 0; i < binaryChunk.length; i++) bytes[i] = binaryChunk.charCodeAt(i);
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let serviceClient: ReturnType<typeof createClient> | null = null;
  let userId: string | null = null;
  let reservedSeconds = 0;
  let reservationActive = false;

  const refund = async () => {
    if (!reservationActive || !serviceClient || !userId || reservedSeconds <= 0) return;
    reservationActive = false;
    try {
      await releaseInteractiveVoiceSeconds(serviceClient, userId, reservedSeconds);
    } catch (error) {
      logStep("Quota refund failed", { error: String(error) });
    }
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase configuration is missing");
    if (!ELEVENLABS_API_KEY && !OPENAI_API_KEY) throw new Error("No STT service configured");

    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice("Bearer ".length);
    const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
    userId = !userError ? userData?.user?.id ?? null : null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const audio = typeof body?.audio === "string" ? body.audio : "";
    const language = typeof body?.language === "string" && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(body.language)
      ? body.language
      : "en";

    if (!audio) {
      return new Response(JSON.stringify({ error: "Audio data is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (audio.length > MAX_AUDIO_BASE64_CHARS) {
      return new Response(JSON.stringify({ error: "Audio request is too long. Keep each utterance under five minutes." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const binaryAudio = processBase64Chunks(audio);
    reservedSeconds = estimateWebmSeconds(binaryAudio.length);

    const reservation = await reserveInteractiveVoiceSeconds(serviceClient, userId, reservedSeconds);
    if (!reservation.allowed) {
      const gate = gateDenied("AUDIO_LIMIT_REACHED", {
        currentPlan: reservation.plan,
        message: `Your interactive voice allowance is exhausted for this month (${Math.round(reservation.limitSeconds / 60)} min on ${reservation.plan}).`,
        usage: {
          audioMinutesUsed: reservation.secondsUsed / 60,
          audioMinutesLimit: reservation.limitSeconds / 60,
        },
      });
      await recordGateEvent(serviceClient, {
        user_id: userId,
        feature: "interactive_voice_stt",
        reason: gate.reason,
        allowed: false,
        plan: reservation.plan,
        usage_snapshot: {
          usedSeconds: reservation.secondsUsed,
          limitSeconds: reservation.limitSeconds,
          requestedSeconds: reservedSeconds,
          remainingSeconds: reservation.remainingSeconds,
        },
      });
      return gateResponse(gate, corsHeaders);
    }
    reservationActive = true;

    logStep("Quota reserved", {
      userId: userId.slice(0, 8) + "...",
      plan: reservation.plan,
      requestedSeconds: reservedSeconds,
      remainingSeconds: reservation.remainingSeconds,
    });

    let transcriptText = "";

    if (ELEVENLABS_API_KEY) {
      try {
        const formData = new FormData();
        const blob = new Blob([binaryAudio.buffer as ArrayBuffer], { type: "audio/webm" });
        formData.append("file", blob, "audio.webm");
        formData.append("model_id", "scribe_v1");
        const languageMap: Record<string, string> = {
          en: "eng", es: "spa", fr: "fra", de: "deu", pt: "por", sw: "swa", ar: "ara",
        };
        if (languageMap[language]) formData.append("language_code", languageMap[language]);

        const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
          body: formData,
        });
        if (response.ok) {
          const result = await response.json();
          transcriptText = typeof result?.text === "string" ? result.text : "";
        } else {
          logStep("ElevenLabs STT failed", { status: response.status });
        }
      } catch (error) {
        logStep("ElevenLabs STT error", { error: String(error) });
      }
    }

    if (!transcriptText && OPENAI_API_KEY) {
      const formData = new FormData();
      const blob = new Blob([binaryAudio.buffer as ArrayBuffer], { type: "audio/webm" });
      formData.append("file", blob, "audio.webm");
      formData.append("model", "whisper-1");
      if (language !== "auto") formData.append("language", language);

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });
      if (!response.ok) {
        throw new Error(response.status === 429 ? "provider_rate_limited" : `openai_stt_${response.status}`);
      }
      const result = await response.json();
      transcriptText = typeof result?.text === "string" ? result.text : "";
    }

    if (!transcriptText) throw new Error("transcription_failed");

    reservationActive = false;
    return new Response(
      JSON.stringify({
        success: true,
        text: transcriptText,
        voiceSecondsUsed: reservedSeconds,
        totalVoiceSecondsUsed: reservation.secondsUsed,
        remainingVoiceSeconds: reservation.remainingSeconds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    await refund();
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    const status = errorMessage === "provider_rate_limited" ? 429 : 500;
    return new Response(
      JSON.stringify({ error: status === 429 ? "Rate limit exceeded. Please try again." : "Voice transcription failed. Please try again." }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
