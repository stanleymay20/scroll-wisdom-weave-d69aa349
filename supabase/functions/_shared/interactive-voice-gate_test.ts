import {
  estimateConversationSeconds,
  estimateSpeechSeconds,
  estimateWebmSeconds,
  normalizeVoicePlan,
} from "./interactive-voice-gate.ts";

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("interactive voice uses the canonical billing plan namespace", () => {
  assertEquals(normalizeVoicePlan("free"), "free", "free");
  assertEquals(normalizeVoicePlan("student"), "student", "creator");
  assertEquals(normalizeVoicePlan("premium"), "premium", "pro");
  assertEquals(normalizeVoicePlan("prophet_tier"), "prophet_tier", "teams");
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
