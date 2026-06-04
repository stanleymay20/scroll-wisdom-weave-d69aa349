// Behavioural contract for fetchWithRetry. Failures here mean either:
//   (a) transient upstream errors get surfaced to creators as terminal, or
//   (b) hard auth/validation errors get retried until rate-limited.
// Both regressions are user-visible.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry } from "../../../supabase/functions/_shared/upstream-retry";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(responder: (call: number) => Response | Promise<Response> | Error): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = vi.fn(async () => {
    state.calls += 1;
    const out = await responder(state.calls);
    if (out instanceof Error) throw out;
    return out;
  }) as unknown as typeof fetch;
  return state;
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns success on first try without retrying", async () => {
    const state = mockFetch(() => new Response("ok", { status: 200 }));
    const res = await fetchWithRetry("https://example.com");
    expect(res.status).toBe(200);
    expect(state.calls).toBe(1);
  });

  it("does NOT retry on 4xx (auth/validation)", async () => {
    const state = mockFetch(() => new Response("nope", { status: 401 }));
    const res = await fetchWithRetry("https://example.com", {}, { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(401);
    expect(state.calls).toBe(1);
  });

  it("retries on 503 and eventually succeeds", async () => {
    const state = mockFetch((n) =>
      n < 3 ? new Response("busy", { status: 503 }) : new Response("ok", { status: 200 }),
    );
    const res = await fetchWithRetry("https://example.com", {}, { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(state.calls).toBe(3);
  });

  it("retries on 429 and surfaces final response when exhausted", async () => {
    const state = mockFetch(() => new Response("too many", { status: 429 }));
    const res = await fetchWithRetry("https://example.com", {}, { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(429);
    expect(state.calls).toBe(3);
  });

  it("retries on thrown network errors", async () => {
    const state = mockFetch((n) =>
      n === 1 ? new Error("ECONNRESET") : new Response("ok", { status: 200 }),
    );
    const res = await fetchWithRetry("https://example.com", {}, { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(state.calls).toBe(2);
  });

  it("rethrows when all attempts fail with network errors", async () => {
    const state = mockFetch(() => new Error("ECONNRESET"));
    await expect(
      fetchWithRetry("https://example.com", {}, { attempts: 2, baseDelayMs: 1 }),
    ).rejects.toThrow(/ECONNRESET/);
    expect(state.calls).toBe(2);
  });

  it("invokes onRetry with attempt metadata", async () => {
    const observed: Array<{ attempt: number; status: number | null; reason: string }> = [];
    mockFetch((n) =>
      n < 2 ? new Response("busy", { status: 502 }) : new Response("ok", { status: 200 }),
    );
    await fetchWithRetry("https://example.com", {}, {
      attempts: 3,
      baseDelayMs: 1,
      onRetry: ({ attempt, status, reason }) => observed.push({ attempt, status, reason }),
    });
    expect(observed).toEqual([{ attempt: 1, status: 502, reason: "http_502" }]);
  });
});
