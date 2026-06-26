// Tests for the shared AI router.
// Run with: deno test --allow-env --allow-net supabase/functions/_shared/ai-router.test.ts
//
// These tests use an injected fetch stub — no real network. They prove the
// two constraints the user explicitly called out:
//   1. 402 / 403 must NOT retry (zero credit burn after the first failure).
//   2. 429 / 5xx use bounded exponential backoff, max 2 retries total.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { __resetProBreaker, routeChat, type RouterDeps } from "./ai-router.ts";

function makeDeps(fetchImpl: typeof fetch): RouterDeps {
  return {
    apiKey: "test-key",
    supabaseUrl: "http://localhost:54321",
    supabaseServiceKey: "test-service-key",
    fetchImpl,
  };
}

function jsonOk(text = "hello") {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

Deno.test("402 stops immediately — no retry, no credit burn", async () => {
  __resetProBreaker();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response('{"error":"Payment required"}', { status: 402 });
  }) as unknown as typeof fetch;

  const res = await routeChat(
    { task: "draft", model: "google/gemini-2.5-flash", prompt: "x", allowCache: false },
    makeDeps(fetchImpl),
  );

  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.errorCode, "PAYMENT_REQUIRED");
  assertEquals(calls, 1, "402 must NOT retry");
});

Deno.test("403 stops immediately — no retry", async () => {
  __resetProBreaker();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response("forbidden", { status: 403 });
  }) as unknown as typeof fetch;

  const res = await routeChat(
    { task: "editorial_audit", model: "google/gemini-2.5-pro", prompt: "x", allowCache: false },
    makeDeps(fetchImpl),
  );

  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.errorCode, "FORBIDDEN");
  assertEquals(calls, 1, "403 must NOT retry");
});

Deno.test("400 stops immediately — no retry", async () => {
  __resetProBreaker();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response("bad request", { status: 400 });
  }) as unknown as typeof fetch;

  const res = await routeChat(
    { task: "draft", model: "google/gemini-2.5-flash", prompt: "x", allowCache: false },
    makeDeps(fetchImpl),
  );
  assertEquals(calls, 1);
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.errorCode, "BAD_REQUEST");
});

Deno.test("429 retries with backoff, max 2 retries (3 total attempts)", async () => {
  __resetProBreaker();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response("rate limited", { status: 429 });
  }) as unknown as typeof fetch;

  const res = await routeChat(
    { task: "draft", model: "google/gemini-2.5-flash", prompt: "x", allowCache: false },
    makeDeps(fetchImpl),
  );

  assertEquals(calls, 3, "429 retries up to MAX_RETRIES_RETRYABLE (2) on top of initial = 3 attempts");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.errorCode, "RATE_LIMITED");
});

Deno.test("5xx retries then succeeds on the third attempt", async () => {
  __resetProBreaker();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    if (calls < 3) return new Response("upstream", { status: 502 });
    return jsonOk("ok-third");
  }) as unknown as typeof fetch;

  const res = await routeChat(
    { task: "draft", model: "google/gemini-2.5-flash", prompt: "x", allowCache: false },
    makeDeps(fetchImpl),
  );
  assertEquals(calls, 3);
  assertEquals(res.ok, true);
  if (res.ok) assertEquals(res.text, "ok-third");
});

Deno.test("gemini-2.5-pro circuit breaker opens after 3 consecutive failures and refuses next call", async () => {
  __resetProBreaker();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response("forbidden", { status: 403 });
  }) as unknown as typeof fetch;

  const deps = makeDeps(fetchImpl);

  // 3 failed pro calls → breaker opens
  for (let i = 0; i < 3; i++) {
    await routeChat(
      { task: "editorial_audit", model: "google/gemini-2.5-pro", prompt: "x" + i, allowCache: false },
      deps,
    );
  }
  assertEquals(calls, 3, "each 403 = 1 network call (no retry)");

  // 4th call must NOT hit the network — breaker is open
  const res = await routeChat(
    { task: "editorial_audit", model: "google/gemini-2.5-pro", prompt: "another", allowCache: false },
    deps,
  );
  assertEquals(calls, 3, "circuit open → no network call");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.errorCode, "CIRCUIT_OPEN");
});

Deno.test("in-memory cache returns identical text without a second network call", async () => {
  __resetProBreaker();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return jsonOk("cached-text");
  }) as unknown as typeof fetch;

  const deps = makeDeps(fetchImpl);

  const r1 = await routeChat(
    { task: "metadata", model: "google/gemini-2.5-flash-lite", prompt: "same prompt" },
    deps,
  );
  const r2 = await routeChat(
    { task: "metadata", model: "google/gemini-2.5-flash-lite", prompt: "same prompt" },
    deps,
  );
  assertEquals(calls, 1, "second identical request must hit cache");
  assert(r1.ok && r2.ok);
  if (r1.ok && r2.ok) {
    assertEquals(r1.text, r2.text);
    assertEquals(r2.cached, true);
    assertEquals(r2.costCents, 0);
  }
});
