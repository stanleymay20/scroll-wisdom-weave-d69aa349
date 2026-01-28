import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Premium tier check - only premium/prophet users can use ElevenLabs TTS
const PREMIUM_TIERS = ['premium', 'prophet_tier'];

// ElevenLabs voice IDs - high quality voices
const ELEVENLABS_VOICES = {
  'rachel': 'EXAVITQu4vr4xnSDxMaL', // Sarah - warm female
  'adam': 'JBFqnCBsd6RMkjVDRZzb',   // George - authoritative male
  'bella': 'FGY2WhTYpPnrIDTdsKH5',  // Laura - friendly female
  'josh': 'TX3LPaxmHKxFdv7VOQHJ',   // Liam - clear male
  'sam': 'pFZP5JQG7iQjIQuC4Bku',    // Lily - energetic female
  'default': 'pFZP5JQG7iQjIQuC4Bku', // Default to Lily
} as const;

type VoiceKey = keyof typeof ELEVENLABS_VOICES;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ELEVENLABS-TTS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    // Check for ElevenLabs API key
    const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!elevenLabsKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }
    logStep("ElevenLabs key verified");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id.slice(0, 8) });

    // Get user's subscription plan
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    
    // Check premium tier access
    if (!PREMIUM_TIERS.includes(userPlan)) {
      logStep("Premium tier required", { userPlan });
      return new Response(
        JSON.stringify({ 
          error: "ElevenLabs TTS requires Premium or Prophet tier subscription",
          requiresUpgrade: true,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    logStep("Premium access verified", { userPlan });

    // Parse request body
    const body = await req.json();
    const { text, voice = 'default' } = body;

    if (!text || typeof text !== 'string') {
      throw new Error("Text is required");
    }

    // Limit text length (ElevenLabs has a character limit)
    const maxLength = 5000;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) : text;
    
    // Clean text for speech
    const cleanedText = truncatedText
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")      // Images
      .replace(/#{1,6}\s*/g, "")                   // Headings
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")    // Bold/italic
      .replace(/`[^`]+`/g, "")                     // Inline code
      .replace(/```[\s\S]*?```/g, "")              // Code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")    // Links
      .replace(/^\s*[-*]\s+/gm, "")                // Bullets
      .replace(/^\s*\d+\.\s+/gm, "")               // Numbered lists
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanedText) {
      throw new Error("No readable text found after cleaning");
    }

    // Get voice ID
    const voiceKey = (voice in ELEVENLABS_VOICES ? voice : 'default') as VoiceKey;
    const voiceId = ELEVENLABS_VOICES[voiceKey];
    
    logStep("Generating speech", { textLength: cleanedText.length, voice: voiceKey, voiceId });

    // Call ElevenLabs TTS API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logStep("ElevenLabs API error", { status: response.status, error: errorText });
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "ElevenLabs rate limit reached. Please wait and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();
    logStep("Audio generated", { bytes: audioBuffer.byteLength });

    // Convert to base64 safely using Deno's encoding
    const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    const base64Audio = encode(audioBuffer);

    logStep("Success - returning audio");

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        contentType: "audio/mpeg",
        voice: voiceKey,
        method: "elevenlabs-tts",
        charCount: cleanedText.length,
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
