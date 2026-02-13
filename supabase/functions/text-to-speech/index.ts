import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** TTS monthly limits by plan tier (in minutes) */
const TIER_TTS_LIMITS: Record<string, number> = {
  free: 10,
  student: 60,
  premium: 300,
  prophet_tier: 1000,
};

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

serve(async (req) => {
  console.log("[TTS] Request received");

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
      console.error("[TTS] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[TTS] Authenticated user: ${user.id.slice(0, 8)}...`);

    // Get user's plan from profiles (use user_id column, select only existing columns)
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("user_id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    const monthlyLimit = TIER_TTS_LIMITS[userPlan] ?? TIER_TTS_LIMITS.free;

    // Check TTS usage from the dedicated tts_usage table
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    const { data: usageRow } = await supabase
      .from("tts_usage")
      .select("minutes_used")
      .eq("user_id", user.id)
      .eq("month", currentMonth)
      .maybeSingle();

    const currentUsage = usageRow?.minutes_used ?? 0;

    if (currentUsage >= monthlyLimit) {
      console.log(`[TTS] Monthly limit reached: ${currentUsage}/${monthlyLimit} min (${userPlan})`);
      return new Response(JSON.stringify({
        error: `Monthly TTS limit reached (${monthlyLimit} min for ${userPlan} plan). Upgrade for more.`,
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    console.log("[TTS] Request params:", { textLength: body.text?.length, voice: body.voice });

    const { text, voice = "alloy", language = "en" } = body;

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

    // Limit and clean text
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

    // Validate voice
    const selectedVoice: OpenAIVoice = OPENAI_VOICES.includes(voice as OpenAIVoice)
      ? (voice as OpenAIVoice)
      : "alloy";

    console.log(`[TTS] Generating speech: ${cleanedText.length} chars, voice: ${selectedVoice}`);

    // Call OpenAI TTS API with retry
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
      return new Response(
        JSON.stringify({ error: lastError || "TTS service unavailable." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Encode audio to base64
    const audioBuffer = await response.arrayBuffer();
    console.log(`[TTS] Received ${audioBuffer.byteLength} bytes`);

    const bytes = new Uint8Array(audioBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Audio = btoa(binary);

    // Track usage in tts_usage table
    const estimatedMinutes = Math.ceil(cleanedText.length / 750);

    if (usageRow) {
      // Update existing row
      await supabase
        .from("tts_usage")
        .update({ minutes_used: currentUsage + estimatedMinutes })
        .eq("user_id", user.id)
        .eq("month", currentMonth);
    } else {
      // Insert new row for this month
      await supabase
        .from("tts_usage")
        .insert({
          user_id: user.id,
          month: currentMonth,
          minutes_used: estimatedMinutes,
        });
    }

    console.log(`[TTS] Success. Usage: ${currentUsage + estimatedMinutes}/${monthlyLimit} min`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        contentType: "audio/mpeg",
        voice: selectedVoice,
        method: "openai-tts",
        charCount: cleanedText.length,
        minutesUsed: estimatedMinutes,
        remainingMinutes: monthlyLimit - currentUsage - estimatedMinutes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: "TTS service error. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
