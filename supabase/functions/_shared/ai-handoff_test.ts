import {
  countWords,
  isSha256,
  normalizeProvider,
  proposalPreview,
  sha256Hex,
} from "./ai-handoff.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("AI handoff normalizes known and unknown providers", () => {
  assert(normalizeProvider(" ChatGPT ") === "chatgpt", "ChatGPT should normalize");
  assert(normalizeProvider("CLAUDE") === "claude", "Claude should normalize");
  assert(normalizeProvider("custom-agent") === "other", "unknown providers must become other");
});

Deno.test("AI handoff SHA-256 is deterministic and validated", async () => {
  const a = await sha256Hex("chapter text");
  const b = await sha256Hex("chapter text");
  const c = await sha256Hex("chapter text changed");
  assert(a === b, "same input must hash identically");
  assert(a !== c, "changed input must change hash");
  assert(isSha256(a), "hash must be lowercase SHA-256 hex");
  assert(!isSha256("ABC"), "invalid hashes must be rejected");
});

Deno.test("AI handoff word counting handles empty and Unicode whitespace", () => {
  assert(countWords("") === 0, "empty content should be zero");
  assert(countWords("one  two\nthree\tfour") === 4, "whitespace should collapse");
});

Deno.test("AI handoff proposal previews are compact and bounded", () => {
  assert(proposalPreview(" a\n b   c ") === "a b c", "preview should compact whitespace");
  const preview = proposalPreview("x".repeat(400), 20);
  assert(preview.length === 20, "preview must respect requested length");
  assert(preview.endsWith("…"), "truncated preview should show ellipsis");
});
