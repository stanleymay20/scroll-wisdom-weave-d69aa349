// Shared retry-with-backoff for outbound calls to third-party publishing APIs
// (Gumroad, Shopify). Retries only on transient classes — network errors,
// 429 Too Many Requests, and 5xx — never on 4xx auth/validation failures
// which would re-fail identically and burn rate-limit budget.

export interface RetryOptions {
  /** Max number of attempts including the initial one. Default 3. */
  attempts?: number;
  /** Initial backoff in milliseconds. Default 400. */
  baseDelayMs?: number;
  /** Per-attempt overall timeout in milliseconds. Default 20000. */
  timeoutMs?: number;
  /** Optional logger called between attempts. */
  onRetry?: (info: { attempt: number; status: number | null; reason: string; delayMs: number }) => void;
}

const DEFAULTS: Required<Pick<RetryOptions, "attempts" | "baseDelayMs" | "timeoutMs">> = {
  attempts: 3,
  baseDelayMs: 400,
  timeoutMs: 20_000,
};

function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
}

function backoffWithJitter(attempt: number, baseMs: number): number {
  const exp = baseMs * 2 ** (attempt - 1);
  const cap = Math.min(exp, 8000);
  // Decorrelated jitter so retries from many callers don't synchronise.
  return Math.floor(cap / 2 + Math.random() * (cap / 2));
}

function honoursRetryAfter(headers: Headers): number | null {
  const ra = headers.get("retry-after");
  if (!ra) return null;
  const asNum = Number(ra);
  if (Number.isFinite(asNum)) return Math.min(8000, Math.max(0, asNum * 1000));
  const asDate = Date.parse(ra);
  if (!Number.isNaN(asDate)) return Math.min(8000, Math.max(0, asDate - Date.now()));
  return null;
}

/**
 * Wraps `fetch` with retry-with-backoff. Returns the final `Response` (which may
 * still be non-ok if all retries failed) or throws on aborted/network failures
 * past the attempt budget.
 */
export async function fetchWithRetry(
  input: string | URL | Request,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const o = { ...DEFAULTS, ...opts };
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= o.attempts; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: ctl.signal });
      clearTimeout(timer);

      if (res.ok || !isRetriableStatus(res.status) || attempt === o.attempts) {
        return res;
      }

      const retryAfter = honoursRetryAfter(res.headers);
      const delay = retryAfter ?? backoffWithJitter(attempt, o.baseDelayMs);
      opts.onRetry?.({
        attempt, status: res.status, reason: `http_${res.status}`, delayMs: delay,
      });
      // Drain body so the underlying connection can be reused.
      try { await res.body?.cancel(); } catch (_) { /* noop */ }
      await sleep(delay);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt === o.attempts) throw err;
      const delay = backoffWithJitter(attempt, o.baseDelayMs);
      opts.onRetry?.({
        attempt, status: null,
        reason: (err as Error)?.name === "AbortError" ? "timeout" : "network",
        delayMs: delay,
      });
      await sleep(delay);
    }
  }
  // Unreachable — the loop always returns or throws.
  throw lastErr ?? new Error("fetchWithRetry: exhausted without response");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
