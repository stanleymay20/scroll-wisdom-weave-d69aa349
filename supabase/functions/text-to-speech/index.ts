import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const body = await req.json();
    console.log("[TTS] Request body:", { textLength: body.text?.length, voice: body.voice, language: body.language });
    
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

    console.log(`[TTS] Generating speech for ${cleanedText.length} characters with voice: ${selectedVoice}, language: ${language}`);

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
          break; // Success, exit retry loop
        }

        const errorData = await response.text();
        console.error(`[TTS] OpenAI API error (attempt ${attempt + 1}):`, response.status, errorData);

        // Parse error for specific handling
        let errorMessage = `OpenAI TTS failed: ${response.status}`;
        let userFriendlyMessage = "Text-to-speech temporarily unavailable. Please try again later.";
        
        try {
          const parsedError = JSON.parse(errorData);
          if (parsedError.error?.message) {
            console.error("[TTS] Error message:", parsedError.error.message);
            
            // Handle specific error types
            if (response.status === 429) {
              userFriendlyMessage = "TTS service is temporarily busy. Please wait a moment and try again.";
              // Wait before retry
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
              }
            } else if (response.status === 401 || parsedError.error.code === "billing_not_active") {
              userFriendlyMessage = "TTS service configuration issue. Please contact support.";
              lastError = userFriendlyMessage;
              break; // Don't retry auth/billing issues
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
        
        // Don't retry on non-retryable errors
        if (response.status !== 429 && response.status !== 500 && response.status !== 503) {
          break;
        }
        
        // Wait before retry for server errors
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

    console.log(`[TTS] Successfully generated audio, base64 length: ${base64Audio.length}`);

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
      JSON.stringify({ error: "TTS service error. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
