import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TTS monthly limits by tier (in minutes)
const TIER_TTS_LIMITS = {
  free: 10,
  student: 60,
  premium: 300,
  prophet_tier: 1000,
};

// OpenAI TTS voices
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

    // Authenticate user from JWT token
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

    // Get user's subscription plan and TTS usage
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, tts_minutes_used, tts_month")
      .eq("id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    const monthlyLimit = TIER_TTS_LIMITS[userPlan as keyof typeof TIER_TTS_LIMITS] || TIER_TTS_LIMITS.free;
    
    // Check current month's usage
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const currentUsage = profile?.tts_month === currentMonth ? (profile?.tts_minutes_used || 0) : 0;

    if (currentUsage >= monthlyLimit) {
      console.log(`[TTS] Monthly limit reached for user ${user.id.slice(0, 8)}... (${userPlan}: ${currentUsage}/${monthlyLimit} min)`);
      return new Response(JSON.stringify({ 
        error: `Monthly TTS limit reached (${monthlyLimit} min for ${userPlan} plan). Upgrade for more.` 
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    console.log("[TTS] Request params:", { textLength: body.text?.length, voice: body.voice });
    
    const { text, voice = "alloy", language = "en" } = body;

    if (!text) {
      console.error("[TTS] No text provided");
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("[TTS] OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "TTS service not configured. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit text length to avoid timeouts
    const maxLength = 4096;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) : text;

    // Clean text for speech
    const cleanedText = truncatedText
      .replace(/#{1,6}\s*/g, "")
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
      .replace(/`[^`]+`/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanedText) {
      console.error("[TTS] No readable text after cleaning");
      return new Response(
        JSON.stringify({ error: "No readable text found after cleaning" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate voice selection
    const selectedVoice: OpenAIVoice = OPENAI_VOICES.includes(voice as OpenAIVoice) 
      ? voice as OpenAIVoice 
      : "alloy";

    console.log(`[TTS] Generating speech for ${cleanedText.length} characters with voice: ${selectedVoice}`);

    // Call OpenAI TTS API with retry logic
    let response: Response | null = null;
    let lastError: string = "";
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: cleanedText,
            voice: selectedVoice,
            response_format: "mp3",
          }),
        });

        if (response.ok) {
          break;
        }

        const errorData = await response.text();
        console.error(`[TTS] OpenAI API error (attempt ${attempt + 1}):`, response.status, errorData);

        let userFriendlyMessage = "Text-to-speech temporarily unavailable. Please try again later.";
        
        try {
          const parsedError = JSON.parse(errorData);
          if (parsedError.error?.message) {
            if (response.status === 429) {
              userFriendlyMessage = "TTS service is temporarily busy. Please wait a moment and try again.";
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
              }
            } else if (response.status === 401 || parsedError.error.code === "billing_not_active") {
              userFriendlyMessage = "TTS service configuration issue. Please contact support.";
              lastError = userFriendlyMessage;
              break;
            } else if (response.status === 400) {
              userFriendlyMessage = "Invalid text for speech synthesis. Try with different content.";
              lastError = userFriendlyMessage;
              break;
            }
          }
        } catch {
          // Keep default error message
        }

        lastError = userFriendlyMessage;
        
        if (response.status !== 429 && response.status !== 500 && response.status !== 503) {
          break;
        }
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      } catch (fetchError) {
        console.error(`[TTS] Fetch error (attempt ${attempt + 1}):`, fetchError);
        lastError = "Network error connecting to TTS service. Please try again.";
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    if (!response || !response.ok) {
      return new Response(
        JSON.stringify({ error: lastError || "TTS service unavailable. Please try again later." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get audio as ArrayBuffer
    const audioBuffer = await response.arrayBuffer();
    console.log(`[TTS] Received ${audioBuffer.byteLength} bytes of audio data`);
    
    // Convert to base64 safely
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Audio = btoa(binary);

    // Estimate minutes used (approximately 150 words per minute, 5 chars per word)
    const estimatedMinutes = Math.ceil(cleanedText.length / 750);
    
    // Update TTS usage
    await supabase
      .from("profiles")
      .update({
        tts_minutes_used: currentUsage + estimatedMinutes,
        tts_month: currentMonth,
      })
      .eq("id", user.id);

    console.log(`[TTS] Successfully generated audio, usage: ${currentUsage + estimatedMinutes}/${monthlyLimit} min`);

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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: "TTS service error. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
