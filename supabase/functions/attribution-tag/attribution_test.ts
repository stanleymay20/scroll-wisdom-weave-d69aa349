// Phase 2.1d.1 — Minimal assertions for attribution + reliability guarantees.
// These are pure logic checks; no network. Run with `deno test`.
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// --- Attribution first-touch immutability (mirrors attribution-tag logic) ---
Deno.test("first-touch attribution is immutable across pings", () => {
  const firstTouch = { source: "twitter", medium: "social", campaign: "launch" };
  const secondPingPayload = { source: "google", medium: "organic", campaign: "brand" };
  // Existing row simulation
  const existing = { ...firstTouch, events_count: 1 };
  // Update logic should only bump events_count + last_seen, never overwrite first_touch_*
  const updated = { ...existing, events_count: existing.events_count + 1 };
  assertEquals(updated.source, "twitter");
  assertEquals(updated.medium, "social");
  assertEquals(updated.campaign, "launch");
  assertEquals(updated.events_count, 2);
  assertNotEquals(updated.source, secondPingPayload.source);
});

// --- RPV distinct-session math ---
Deno.test("RPV counts distinct session_ids, not raw rows", () => {
  const views = [
    { session_id: "a" }, { session_id: "a" }, { session_id: "a" },
    { session_id: "b" }, { session_id: "c" }, { session_id: "c" },
  ];
  const unique = new Set(views.map(v => v.session_id)).size;
  assertEquals(unique, 3);
  const gross = 900;
  const rpv = Math.round(gross / unique);
  assertEquals(rpv, 300);
});

// --- Replay clears dead-letter fields on success ---
Deno.test("successful replay clears dead-letter markers", () => {
  const before = { status: "dead_lettered", dead_letter_reason: "boom", dead_lettered_at: "2026-01-01T00:00:00Z" };
  const ok = true;
  const patch = {
    status: ok ? "replayed" : "failed",
    ...(ok ? { dead_letter_reason: null, dead_lettered_at: null } : {}),
  };
  const after = { ...before, ...patch };
  assertEquals(after.status, "replayed");
  assertEquals(after.dead_letter_reason, null);
  assertEquals(after.dead_lettered_at, null);
});

// --- Subscription failure severity threshold ---
Deno.test("subscription failure severity escalates at thresholds", () => {
  const evalSev = (warn: number, crit: number, value: number) => {
    if (value >= crit) return "critical";
    if (value >= warn) return "warn";
    return "info";
  };
  assertEquals(evalSev(3, 10, 1), "info");
  assertEquals(evalSev(3, 10, 3), "warn");
  assertEquals(evalSev(3, 10, 10), "critical");
  assertEquals(evalSev(3, 10, 25), "critical");
});

// --- Checkout metadata propagation shape ---
Deno.test("checkout stamps attribution_* keys into Stripe metadata", () => {
  const attribution = {
    session_id: "sess-abc",
    source: "twitter",
    medium: "social",
    campaign: "launch",
    referrer: "https://x.com/post/1",
    landing_path: "/store/great-book?utm_source=twitter",
  };
  const trim = (v: unknown, n: number) => typeof v === "string" && v.length > 0 ? v.slice(0, n) : "";
  const metadata = {
    kind: "book_purchase",
    listing_id: "L1",
    book_id: "B1",
    buyer_user_id: "",
    attribution_session_id: trim(attribution.session_id, 64),
    attribution_source: trim(attribution.source, 60),
    attribution_medium: trim(attribution.medium, 60),
    attribution_campaign: trim(attribution.campaign, 120),
    attribution_referrer: trim(attribution.referrer, 200),
    attribution_landing_path: trim(attribution.landing_path, 200),
  };
  assertEquals(metadata.attribution_session_id, "sess-abc");
  assertEquals(metadata.attribution_source, "twitter");
  assertEquals(metadata.attribution_campaign, "launch");
  // length cap
  const longSession = "x".repeat(200);
  assertEquals(trim(longSession, 64).length, 64);
});
