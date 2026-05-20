// Phase 2.1c.2 — threshold + override tests.
// Pure function tests (no network).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function tierFromScore(score: number): "low" | "medium" | "high" | "blocked" {
  if (score >= 80) return "blocked";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

Deno.test("tier thresholds map correctly", () => {
  assertEquals(tierFromScore(0), "low");
  assertEquals(tierFromScore(24), "low");
  assertEquals(tierFromScore(25), "medium");
  assertEquals(tierFromScore(49), "medium");
  assertEquals(tierFromScore(50), "high");
  assertEquals(tierFromScore(79), "high");
  assertEquals(tierFromScore(80), "blocked");
  assertEquals(tierFromScore(100), "blocked");
});

Deno.test("manual override always wins (effective tier logic)", () => {
  const effective = (computed: string, override: string | null) => override ?? computed;
  assertEquals(effective("low", "blocked"), "blocked");
  assertEquals(effective("blocked", "low"), "low");   // admin can de-escalate
  assertEquals(effective("high", null), "high");
});

Deno.test("enforcement matrix", () => {
  const blocks = (tier: string, action: "free_unlock" | "export" | "paid_checkout" | "page_view") => {
    if (tier === "blocked") return action !== "page_view"; // blocked for everything except viewing
    if (tier === "high") return action === "free_unlock" || action === "export";
    return false;
  };
  assertEquals(blocks("low", "free_unlock"), false);
  assertEquals(blocks("medium", "free_unlock"), false);
  assertEquals(blocks("high", "free_unlock"), true);
  assertEquals(blocks("high", "paid_checkout"), false);
  assertEquals(blocks("high", "page_view"), false);
  assertEquals(blocks("blocked", "paid_checkout"), true);
  assertEquals(blocks("blocked", "page_view"), false);
});
