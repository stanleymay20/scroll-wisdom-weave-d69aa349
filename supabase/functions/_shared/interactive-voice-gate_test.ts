import {
  estimateConversationSeconds,
  estimateSpeechSeconds,
  estimateWebmSeconds,
  INTERACTIVE_VOICE_LIMIT_MINUTES,
  normalizeVoicePlan,
} from "./interactive-voice-gate.ts";

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("interactive voice limits match canonical plans", () => {
  assertEquals(INTERACTIVE_VOICE_LIMIT_MINUTES.free, 5, "free");
  assertEquals(INTERACTIVE_VOICE_LIMIT_MINUTES.student, 30, "student");
  assertEquals(INTERACTIVE_VOICE_LIMIT_MINUTES.premium, 120, "premium");
  assertEquals(INTERACTIVE_VOICE_LIMIT_MINUTES.prophet_tier, 300, "institutional");
});

Deno.test("unknown plans fail closed to free", () => {
  assertEquals(normalizeVoicePlan("unknown"), "free", "unknown plan");
  assertEquals(normalizeVoicePlan(null), "free", "null plan");
});

Deno.test("64 kbps webm accounting converts bytes to seconds", () => {
  assertEquals(estimateWebmSeconds(8_000), 1, "one second");
  assertEquals(estimateWebmSeconds(80_000), 10, "ten seconds");
});

Deno.test("speech accounting uses bounded minimums", () => {
  assertEquals(estimateSpeechSeconds("a"), 1, "short speech");
  assertEquals(estimateSpeechSeconds("a".repeat(750)), 60, "one minute speech");
  assertEquals(estimateConversationSeconds("short answer"), 15, "conversation floor");
});
