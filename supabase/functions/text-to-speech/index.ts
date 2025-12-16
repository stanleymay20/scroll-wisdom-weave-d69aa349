import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// OpenAI TTS voices
const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = "alloy", language = "en" } = await req.json();

    if (!text) {
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

    // Limit text length to avoid timeouts (OpenAI TTS has limits)
    const maxLength = 4096;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) : text;

    // Clean text for speech
    const cleanedText = truncatedText
      .replace(/#{1,6}\s*/g, "") // Remove markdown headers
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
      .replace(/`[^`]+`/g, "") // Remove inline code
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to just text
      .replace(/^\s*[-*]\s+/gm, "") // Remove list markers
      .replace(/^\s*\d+\.\s+/gm, "") // Remove numbered list markers
      .replace(/\n{2,}/g, ". ") // Replace multiple newlines with pause
      .replace(/\n/g, " ") // Replace single newlines with space
      .replace(/\s{2,}/g, " ") // Normalize spaces
      .trim();

    if (!cleanedText) {
      return new Response(
        JSON.stringify({ error: "No readable text found after cleaning" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate voice selection
    const selectedVoice: OpenAIVoice = OPENAI_VOICES.includes(voice as OpenAIVoice) 
      ? voice as OpenAIVoice 
      : "alloy";

    console.log(`[TTS] Generating speech for ${cleanedText.length} characters with voice: ${selectedVoice}, language: ${language}`);

    // Call OpenAI TTS API
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TTS] OpenAI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate speech. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get audio as ArrayBuffer
    const audioBuffer = await response.arrayBuffer();
    
    // Convert to base64 using Deno's encoding library (safe for large files)
    const base64Audio = base64Encode(audioBuffer);

    console.log(`[TTS] Successfully generated ${audioBuffer.byteLength} bytes of audio`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: base64Audio,
        contentType: "audio/mpeg",
        voice: selectedVoice,
        method: "openai-tts",
        charCount: cleanedText.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[TTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
