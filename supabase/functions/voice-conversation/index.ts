import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  estimateConversationSeconds,
  releaseInteractiveVoiceSeconds,
  reserveInteractiveVoiceSeconds,
} from "../_shared/interactive-voice-gate.ts";
import { gateDenied, gateResponse, recordGateEvent } from "../_shared/usage-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_TURN_SECONDS = 15;
const MAX_USER_MESSAGE_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 2_500;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_CHARS = 2_000;

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VOICE-CONVERSATION] ${step}${detailsStr}`);
};

const COGNITIVE_PROMPTS: Record<string, string> = {
  familiarisation: `You are a reading assistant. Simply read the chapter content aloud without additional explanation.
Your role is to help the user familiarize themselves with the material by reading it clearly.
Do NOT add extra explanations or go beyond what's in the text.`,
  functional: `You are a helpful reading assistant. When the user asks questions, provide clear and concise answers.
Focus on helping the user understand the basic concepts and terminology in the text.
You can clarify terms and provide simple explanations, but keep answers straightforward.`,
  applied: `You are an expert teaching assistant helping users achieve Applied Understanding.
When explaining concepts:
- Connect ideas to real-world applications
- Provide practical examples even if not in the text
- Help users see how they could apply this knowledge
- Encourage thinking about use cases and scenarios
Be conversational and engaging, like a knowledgeable tutor.`,
  analytical: `You are a master scholar guiding Critical Analysis.
Your role is to:
- Probe deeper meanings and underlying assumptions
- Encourage analysis of arguments and evidence
- Connect concepts to broader academic frameworks
- Challenge users to think critically and question assumptions
- Provide nuanced explanations that go beyond surface meaning
Be Socratic - ask probing questions to deepen understanding.`,
  mastery: `You are a scholarly mentor guiding toward Knowledge Creation.
Your role is to:
- Synthesize ideas across disciplines
- Challenge users to create new frameworks
- Explore cutting-edge implications and extensions
- Connect to current research and debates
- Guide users to generate original insights
- Encourage academic discourse and scholarly thinking
Be a co-thinker, exploring ideas together at the highest level.`,
};

const ELEVEN_VOICES: Record<string, string> = {
  alloy: "EXAVITQu4vr4xnSDxMaL",
  nova: "FGY2WhTYpPnrIDTdsKH5",
  shimmer: "Xb7hH8MSUJpSbSDYk0k2",
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let serviceClient: ReturnType<typeof createClient> | null = null;
  let userId: string | null = null;
  let reservedSeconds = 0;
  let reservationActive = false;

  const refundSeconds = async (seconds: number) => {
    if (!serviceClient || !userId || seconds <= 0) return;
    try {
      await releaseInteractiveVoiceSeconds(serviceClient, userId, seconds);
      reservedSeconds = Math.max(0, reservedSeconds - seconds);
    } catch (error) {
      logStep("Quota refund failed", { error: String(error), seconds });
    }
  };

  const refundAll = async () => {
    if (!reservationActive || reservedSeconds <= 0) return;
    const seconds = reservedSeconds;
    reservationActive = false;
    await refundSeconds(seconds);
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase configuration is missing");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonError("Authentication required", 401);

    const token = authHeader.slice("Bearer ".length);
    const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
    userId = !userError ? userData?.user?.id ?? null : null;
    if (!userId) return jsonError("Invalid authentication", 401);

    const body = await req.json();
    const userMessage = typeof body?.userMessage === "string" ? body.userMessage.trim() : "";
    if (!userMessage) return jsonError("User message is required", 400);
    if (userMessage.length > MAX_USER_MESSAGE_CHARS) return jsonError("User message is too long", 413);

    const chapterContent = typeof body?.chapterContent === "string"
      ? body.chapterContent.slice(0, MAX_CONTEXT_CHARS)
      : "";
    const chapterTitle = typeof body?.chapterTitle === "string" ? body.chapterTitle.slice(0, 300) : "";
    const bookTitle = typeof body?.bookTitle === "string" ? body.bookTitle.slice(0, 300) : "";
    const cognitiveLevel = typeof body?.cognitiveLevel === "string" && body.cognitiveLevel in COGNITIVE_PROMPTS
      ? body.cognitiveLevel
      : "functional";
    const voice = ["nova", "shimmer", "alloy"].includes(body?.voice) ? body.voice : "nova";
    const generateAudio = body?.generateAudio !== false;
    const conversationHistory = Array.isArray(body?.conversationHistory)
      ? body.conversationHistory.slice(-MAX_HISTORY_MESSAGES).flatMap((msg: unknown) => {
          if (!msg || typeof msg !== "object") return [];
          const candidate = msg as { role?: unknown; content?: unknown };
          if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string") {
            return [];
          }
          return [{ role: candidate.role, content: candidate.content.slice(0, MAX_HISTORY_MESSAGE_CHARS) }];
        })
      : [];

    const initialReservation = await reserveInteractiveVoiceSeconds(serviceClient, userId, MIN_TURN_SECONDS);
    if (!initialReservation.allowed) {
      const gate = gateDenied("AUDIO_LIMIT_REACHED", {
        currentPlan: initialReservation.plan,
        message: `Your interactive voice allowance is exhausted for this month (${Math.round(initialReservation.limitSeconds / 60)} min on ${initialReservation.plan}).`,
        usage: {
          audioMinutesUsed: initialReservation.secondsUsed / 60,
          audioMinutesLimit: initialReservation.limitSeconds / 60,
        },
      });
      await recordGateEvent(serviceClient, {
        user_id: userId,
        feature: "interactive_voice_conversation",
        reason: gate.reason,
        allowed: false,
        plan: initialReservation.plan,
        usage_snapshot: {
          usedSeconds: initialReservation.secondsUsed,
          limitSeconds: initialReservation.limitSeconds,
          requestedSeconds: MIN_TURN_SECONDS,
          remainingSeconds: initialReservation.remainingSeconds,
        },
      });
      return gateResponse(gate, corsHeaders);
    }

    reservedSeconds = MIN_TURN_SECONDS;
    reservationActive = true;

    const systemPrompt = COGNITIVE_PROMPTS[cognitiveLevel];
    const messages = [
      {
        role: "system",
        content: `${systemPrompt}\n\nCONTEXT:\n- Book: "${bookTitle}"\n- Chapter: "${chapterTitle}"\n- Learning Mode: ${cognitiveLevel}\n\nCHAPTER CONTENT:\n${chapterContent}\n\nIMPORTANT:\n- Respond conversationally as if speaking\n- Keep responses concise (2-3 paragraphs max) for voice\n- Be warm and engaging\n- Match your depth to the cognitive level\n${cognitiveLevel === "familiarisation" ? "- ONLY read/explain what's in the text" : "- Feel free to expand beyond the text to teach deeply"}`,
      },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) throw new Error("provider_rate_limited");
      if (aiResponse.status === 402) throw new Error("provider_payment_required");
      throw new Error(`conversation_ai_${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const textResponse = typeof aiData?.choices?.[0]?.message?.content === "string"
      ? aiData.choices[0].message.content.trim()
      : "";
    if (!textResponse) throw new Error("conversation_empty_response");

    let latestReservation = initialReservation;
    let audioContent: string | null = null;
    let additionalReserved = 0;
    let voiceLimitReached = false;

    if (generateAudio) {
      const targetSeconds = estimateConversationSeconds(textResponse);
      additionalReserved = Math.max(0, targetSeconds - MIN_TURN_SECONDS);

      if (additionalReserved > 0) {
        const extraReservation = await reserveInteractiveVoiceSeconds(serviceClient, userId, additionalReserved);
        if (!extraReservation.allowed) {
          voiceLimitReached = true;
          additionalReserved = 0;
        } else {
          reservedSeconds += additionalReserved;
          latestReservation = extraReservation;
        }
      }

      if (!voiceLimitReached) {
        const ttsInput = textResponse.slice(0, 1_200);

        if (OPENAI_API_KEY) {
          try {
            const response = await fetch("https://api.openai.com/v1/audio/speech", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "tts-1",
                input: ttsInput,
                voice,
                response_format: "mp3",
              }),
            });
            if (response.ok) audioContent = base64Encode(await response.arrayBuffer());
          } catch (error) {
            logStep("OpenAI TTS error", { error: String(error) });
          }
        }

        const canUseElevenLabsFallback = latestReservation.isAdmin || latestReservation.plan === "prophet_tier";
        if (!audioContent && ELEVENLABS_API_KEY && canUseElevenLabsFallback) {
          try {
            const voiceId = ELEVEN_VOICES[voice] || ELEVEN_VOICES.nova;
            const response = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
              {
                method: "POST",
                headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: ttsInput,
                  model_id: "eleven_turbo_v2_5",
                  voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
                }),
              },
            );
            if (response.ok) audioContent = base64Encode(await response.arrayBuffer());
          } catch (error) {
            logStep("ElevenLabs TTS error", { error: String(error) });
          }
        }

        // The 15-second floor accounts for the successful AI turn. Extra time
        // beyond that exists only to cover generated audio, so refund it if no
        // provider produced audio.
        if (!audioContent && additionalReserved > 0) {
          const refundedSeconds = additionalReserved;
          await refundSeconds(refundedSeconds);
          latestReservation = {
            ...latestReservation,
            secondsUsed: Math.max(0, latestReservation.secondsUsed - refundedSeconds),
            remainingSeconds: latestReservation.remainingSeconds < 0
              ? -1
              : latestReservation.remainingSeconds + refundedSeconds,
          };
          additionalReserved = 0;
        }
      }
    }

    reservationActive = false;
    return new Response(
      JSON.stringify({
        success: true,
        text: textResponse,
        audio: audioContent,
        cognitiveLevel,
        voiceLimitReached,
        voiceSecondsUsed: reservedSeconds,
        totalVoiceSecondsUsed: latestReservation.secondsUsed,
        remainingVoiceSeconds: latestReservation.remainingSeconds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    await refundAll();
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    if (errorMessage === "provider_rate_limited") return jsonError("Rate limits exceeded. Please try again later.", 429);
    if (errorMessage === "provider_payment_required") return jsonError("Voice AI capacity is temporarily unavailable.", 503);
    return jsonError("Voice conversation failed. Please try again.", 500);
  }
});
