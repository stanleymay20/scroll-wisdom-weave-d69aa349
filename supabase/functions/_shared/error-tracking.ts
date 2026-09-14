/**
 * Remote error tracking for Supabase Edge Functions.
 *
 * The Sentry Deno SDK is loaded only when SENTRY_DSN is configured. With no
 * DSN this module performs no network access and adds no runtime dependency to
 * the request path beyond this small guard.
 */

type SentryApi = typeof import("npm:@sentry/deno@10.73.0");

let sentry: SentryApi | null = null;
let initPromise: Promise<boolean> | null = null;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "proxy-authorization",
]);

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

function sanitizeHeaders(headers: Record<string, string | undefined> | undefined) {
  if (!headers) return headers;
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !SENSITIVE_HEADERS.has(key.toLowerCase())),
  );
}

export function isEdgeErrorTrackingConfigured(): boolean {
  return Boolean(Deno.env.get("SENTRY_DSN")?.trim());
}

export function initEdgeErrorTracking(): Promise<boolean> {
  const dsn = Deno.env.get("SENTRY_DSN")?.trim();
  if (!dsn) return Promise.resolve(false);
  if (sentry) return Promise.resolve(true);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const Sentry = await import("npm:@sentry/deno@10.73.0");
      Sentry.init({
        dsn,
        environment: Deno.env.get("SENTRY_ENVIRONMENT")?.trim() || "unknown",
        release: Deno.env.get("SENTRY_RELEASE")?.trim() || undefined,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend(event) {
          event.user = undefined;
          if (event.request) {
            if (event.request.url) event.request.url = sanitizeUrl(event.request.url);
            event.request.cookies = undefined;
            event.request.data = undefined;
            event.request.headers = sanitizeHeaders(event.request.headers);
          }
          return event;
        },
      });
      sentry = Sentry;
      return true;
    } catch (error) {
      // Error tracking must never make an Edge Function unavailable.
      console.error("[error-tracking] Sentry edge initialization failed", error);
      return false;
    }
  })();

  return initPromise;
}

/** No-op until Sentry has successfully initialized. */
export function captureEdgeException(
  error: unknown,
  tags: Record<string, string | undefined> = {},
): void {
  if (!sentry) return;

  sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      if (value) scope.setTag(key, value);
    }
    sentry?.captureException(error);
  });
}
