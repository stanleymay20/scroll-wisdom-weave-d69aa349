/**
 * Remote error tracking for Supabase Edge Functions.
 *
 * The Sentry Deno SDK is loaded only when SENTRY_DSN is configured. With no
 * DSN this module performs no network access and adds no runtime dependency to
 * the request path beyond this small guard.
 */

/**
 * The SDK surface this module uses, declared locally rather than derived from
 * `typeof import("npm:@sentry/deno@...")`.
 *
 * A static type-level import forces `deno check` to resolve the npm specifier,
 * which needs a node_modules directory that CI does not have — it fails with
 * "Could not find a matching package". The runtime import below is unaffected:
 * the Supabase Edge Runtime resolves npm: specifiers natively.
 */
interface SentryApi {
  init(options: SentryInitOptions): void;
  withScope(callback: (scope: SentryScope) => void): void;
  captureException(error: unknown): string;
}

interface SentryScope {
  setTag(key: string, value: string): void;
}

interface SentryRequest {
  url?: string;
  cookies?: unknown;
  data?: unknown;
  headers?: Record<string, string | undefined>;
}

interface SentryEvent {
  user?: unknown;
  request?: SentryRequest;
}

interface SentryInitOptions {
  dsn: string;
  environment?: string;
  release?: string;
  sendDefaultPii?: boolean;
  tracesSampleRate?: number;
  beforeSend?: (event: SentryEvent) => SentryEvent | null;
}

/**
 * Held in a constant so the dynamic import below is not a statically analyzable
 * specifier either — `deno check` resolves literal dynamic imports too, and
 * would fail on the same missing node_modules directory.
 *
 * The cost is that dependency scanners no longer see this edge on a static
 * read, so the version is pinned here and must be bumped by hand.
 */
const SENTRY_MODULE = "npm:@sentry/deno@10.73.0";

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
      const Sentry = (await import(SENTRY_MODULE)) as unknown as SentryApi;
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
