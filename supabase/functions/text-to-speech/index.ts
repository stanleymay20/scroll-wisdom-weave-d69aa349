import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { gateDenied, gateResponse, recordGateEvent } from "../_shared/usage-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** TTS monthly limits by plan tier (in minutes) — aligned with subscription.ts */
const TIER_TTS_LIMITS: Record<string, number> = {
  free: 5,
  student: 30,
  premium: 60,
  prophet_tier: 300,
};

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

type TtsReservation = {
  allowed: boolean;
  minutes_used: number;
  remaining_minutes: number;
};

serve(async (req) => {
  console.log("[TTS] Request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let refundReservation: (() => Promise<void>) | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Paid provider access is authenticated-only. Anonymous callers must never
    // be able to consume OpenAI TTS without durable per-user quota accounting.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required for premium voice synthesis." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const userId = !userError ? userData?.user?.id ?? null : null;

    if (!userId) {
      console.warn("[TTS] Invalid or expired user session");
      return new Response(
        JSON.stringify({ error: "Authentication required for premium voice synthesis." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[TTS] Authenticated user: ${userId.slice(0, 8)}...`);

    // Parse and clean text before quota reservation so the exact charge is known
    // before any paid provider call is attempted.
    const body = await req.json();
    console.log("[TTS] Request params:", { textLength: body.text?.length, voice: body.voice });

    const { text, voice = "alloy", language = "en" } = body;
    void language;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "TTS service not configured. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const maxLength = 4096;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) : text;

    const cleanedText = truncatedText
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/#{1,6}\s*/g, "")
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
      .replace(/`[^`]+`/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, " ")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanedText) {
      return new Response(
        JSON.stringify({ error: "No readable text found after cleaning" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const selectedVoice: OpenAIVoice = OPENAI_VOICES.includes(voice as OpenAIVoice)
      ? (voice as OpenAIVoice)
      : "alloy";

    const currentMonth = new Date().toISOString().slice(0, 7);
    const estimatedMinutes = Math.max(1, Math.ceil(cleanedText.length / 750));

    // Canonical authority comes from user_roles. profiles.role is legacy and is
    // intentionally never consulted.
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleData;

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();

    const userPlan = profile?.plan || "free";
    const monthlyLimit = isAdmin ? -1 : (TIER_TTS_LIMITS[userPlan] ?? TIER_TTS_LIMITS.free);

    if (isAdmin) {
      console.log("[TTS] Admin user - unlimited quota, usage still tracked");
    }

    // Atomic reservation closes both single-request overshoot and concurrent
    // request races. Browser roles cannot execute this RPC directly.
    const { data: reservationData, error: reservationError } = await supabase.rpc(
      "reserve_tts_minutes",
      {
        _user_id: userId,
        _month: currentMonth,
        _minutes: estimatedMinutes,
        _limit: monthlyLimit,
      },
    );

    if (reservationError) {
      console.error("[TTS] Quota reservation failed:", reservationError);
      return new Response(
        JSON.stringify({ error: "Unable to verify audio usage right now. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const reservation = (Array.isArray(reservationData) ? reservationData[0] : reservationData) as TtsReservation | null;

    if (!reservation) {
      console.error("[TTS] Quota reservation returned no result");
      return new Response(
        JSON.stringify({ error: "Unable to verify audio usage right now. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!reservation.allowed) {
      console.log(`[TTS] Monthly limit would be exceeded: ${reservation.minutes_used}/${monthlyLimit} min (${userPlan})`);
      const gate = gateDenied("AUDIO_LIMIT_REACHED", {
        message: `This request exceeds your remaining audio allowance (${monthlyLimit} min for ${userPlan}). Upgrade to keep listening.`,
        currentPlan: userPlan,
        usage: { audioMinutesUsed: reservation.minutes_used, audioMinutesLimit: monthlyLimit },
      });
      await recordGateEvent(supabase, {
        user_id: userId,
        feature: "tts",
        reason: gate.reason,
        allowed: false,
        plan: userPlan,
        usage_snapshot: {
          used: reservation.minutes_used,
          limit: monthlyLimit,
          requested: estimatedMinutes,
          remaining: reservation.remaining_minutes,
        },
      });
      return gateResponse(gate, corsHeaders);
    }

    let reservationActive = true;
    refundReservation = async () => {
      if (!reservationActive) return;
      reservationActive = false;
      const { error: releaseError } = await supabase.rpc("release_tts_minutes", {
        _user_id: userId,
        _month: currentMonth,
        _minutes: estimatedMinutes,
      });
      if (releaseError) {
        console.error("[TTS] Failed to refund quota reservation:", releaseError);
      }
    };

    console.log(`[TTS] Generating speech: ${cleanedText.length} chars, voice: ${selectedVoice}, reserved: ${estimatedMinutes} min`);

    let response: Response | null = null;
    let lastError = "";
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: cleanedText,
            voice: selectedVoice,
            response_format: "mp3",
          }),
        });

        if (response.ok) break;

        const errorData = await response.text();
        console.error(`[TTS] OpenAI error (attempt ${attempt + 1}):`, response.status, errorData);

        let msg = "Text-to-speech temporarily unavailable. Please try again later.";

        try {
          const parsed = JSON.parse(errorData);
          if (response.status === 429) {
            if (parsed.error?.code === "insufficient_quota" || parsed.error?.type === "insufficient_quota") {
              msg = "TTS service quota exhausted. The API key needs additional credits. Please contact support.";
              lastError = msg;
              break;
            }
            msg = "TTS service is temporarily busy. Please wait and try again.";
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              continue;
            }
          } else if (response.status === 401 || parsed.error?.code === "billing_not_active") {
            msg = "TTS service configuration issue. Please contact support.";
            lastError = msg;
            break;
          } else if (response.status === 400) {
            msg = "Invalid text for speech synthesis. Try with different content.";
            lastError = msg;
            break;
          }
        } catch { /* keep default */ }

        lastError = msg;

        if (![429, 500, 503].includes(response.status)) break;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      } catch (fetchError) {
        console.error(`[TTS] Fetch error (attempt ${attempt + 1}):`, fetchError);
        lastError = "Network error connecting to TTS service. Please try again.";
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    if (!response || !response.ok) {
      await refundReservation();

      const isQuotaExhausted =
        /quota|insufficient|billing|credits/i.test(lastError || "") ||
        response?.status === 402;
      const isProviderDown = response?.status === 503 || response?.status === 500 || !response;

      if (isQuotaExhausted || isProviderDown) {
        await recordGateEvent(supabase, {
          user_id: userId,
          feature: "tts",
          reason: "SERVICE_UNAVAILABLE",
          allowed: false,
          plan: userPlan,
          usage_snapshot: { providerStatus: response?.status ?? 0, lastError },
        });
        return new Response(
          JSON.stringify({
            success: false,
            fallback: true,
            reason: isQuotaExhausted ? "PROVIDER_QUOTA_EXHAUSTED" : "PROVIDER_UNAVAILABLE",
            error: "Premium voice is temporarily unavailable. Using your device voice.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ error: lastError || "TTS service unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`[TTS] Received ${audioBuffer.byteLength} bytes`);

    const base64Audio = base64Encode(audioBuffer);

    // Successful provider generation consumes the reservation. There is no
    // second direct tts_usage write here; the database reservation is canonical.
    console.log(`[TTS] Success. Usage: ${reservation.minutes_used}/${monthlyLimit} min`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        contentType: "audio/mpeg",
        voice: selectedVoice,
        method: "openai-tts",
        charCount: cleanedText.length,
        minutesUsed: estimatedMinutes,
        totalMinutesUsed: reservation.minutes_used,
        remainingMinutes: reservation.remaining_minutes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (refundReservation) {
      try {
        await refundReservation();
      } catch (refundError) {
        console.error("[TTS] Reservation refund failed during exception handling:", refundError);
      }
    }
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: "TTS service error. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
