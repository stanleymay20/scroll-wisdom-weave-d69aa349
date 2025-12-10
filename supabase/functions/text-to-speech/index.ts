import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = "alloy" } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit text length to avoid timeouts
    const maxLength = 4000;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

    console.log(`Generating speech for ${truncatedText.length} characters with voice: ${voice}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use Lovable AI to generate speech-friendly text first (optional enhancement)
    // Then use browser's built-in TTS or return text for client-side TTS
    
    // For now, we'll return processed text for client-side Web Speech API
    // This is more efficient and doesn't require external TTS APIs
    
    // Clean and prepare text for speech
    const cleanedText = truncatedText
      .replace(/#{1,6}\s*/g, "") // Remove markdown headers
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
      .replace(/`[^`]+`/g, "") // Remove inline code
      .replace(/\n{2,}/g, ". ") // Replace multiple newlines with pause
      .replace(/\n/g, " ") // Replace single newlines with space
      .replace(/\s{2,}/g, " ") // Normalize spaces
      .trim();

    return new Response(
      JSON.stringify({
        success: true,
        text: cleanedText,
        voice,
        method: "web-speech-api"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("TTS error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});