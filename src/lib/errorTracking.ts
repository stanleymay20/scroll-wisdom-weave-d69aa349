/**
 * Remote browser error tracking.
 *
 * Sentry is deliberately lazy-loaded and completely inert unless
 * VITE_SENTRY_DSN is configured. User-facing error UX remains in
 * errorNotifier.ts; this module is only a diagnostic sink.
 */

type SentryApi = typeof import("@sentry/react");

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

export function sanitizeTelemetryUrl(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
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

export function isErrorTrackingConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SENTRY_DSN?.trim());
}

/** Initialize before React mounts so render failures can be captured. */
export function initErrorTracking(): Promise<boolean> {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return Promise.resolve(false);
  if (sentry) return Promise.resolve(true);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const Sentry = await import("@sentry/react");
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        release: __BUILD_ID__,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend(event) {
          // Keep diagnostics useful without shipping customer identity or
          // request payloads. Query strings are excluded because application
          // routes may carry user-supplied values.
          event.user = undefined;
          if (event.request) {
            if (event.request.url) event.request.url = sanitizeTelemetryUrl(event.request.url);
            event.request.cookies = undefined;
            event.request.data = undefined;
            event.request.headers = sanitizeHeaders(event.request.headers);
          }
          return event;
        },
        beforeBreadcrumb(breadcrumb) {
          const url = breadcrumb.data?.url;
          if (typeof url === "string") {
            breadcrumb.data = { ...breadcrumb.data, url: sanitizeTelemetryUrl(url) };
          }
          return breadcrumb;
        },
      });
      sentry = Sentry;
      return true;
    } catch (error) {
      // Observability must never become an availability dependency.
      console.error("[error-tracking] Sentry initialization failed", error);
      return false;
    }
  })();

  return initPromise;
}

/** No-op until Sentry has successfully initialized. */
export function captureException(
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
