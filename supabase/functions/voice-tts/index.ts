import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  estimateSpeechSeconds,
  releaseInteractiveVoiceSeconds,
  reserveInteractiveVoiceSeconds,
} from "../_shared/interactive-voice-gate.ts";
import { gateDenied, gateResponse, recordGateEvent } from "../_shared/usage-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VOICE-TTS] ${step}${detailsStr}`);
};

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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase configuration is missing");
    if (!OPENAI_API_KEY) throw new Error("No TTS service configured");

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
    const { data: userData, error: authError } = await serviceClient.auth.getUser(token);
    userId = !authError ? userData?.user?.id ?? null : null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const voice = typeof body?.voice === "string" ? body.voice : "nova";
    if (!text) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanText = text.slice(0, 5_000).trim();
    reservedSeconds = estimateSpeechSeconds(cleanText);
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
        feature: "interactive_voice_tts",
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

    const selectedVoice = voice === "nova" ? "nova" : voice === "shimmer" ? "shimmer" : "alloy";
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: cleanText,
        voice: selectedVoice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      throw new Error(response.status === 429 ? "provider_rate_limited" : `openai_tts_${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(audioBuffer);
    reservationActive = false;

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
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
      JSON.stringify({ error: status === 429 ? "Rate limit exceeded. Please try again." : "Voice playback unavailable. Please try again." }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
