const DEFAULT_ADMIN_ORIGIN = "https://scrolllibrary.org";

const ADMIN_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

const ADMIN_ALLOW_METHODS = "POST, OPTIONS";

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredAdminOrigins(): string[] {
  const publicSite = Deno.env.get("PUBLIC_SITE_URL")?.trim() || DEFAULT_ADMIN_ORIGIN;
  const appOrigin = Deno.env.get("APP_ORIGIN")?.trim();
  const extras = (Deno.env.get("ADMIN_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [publicSite, appOrigin, ...extras].filter((value): value is string => Boolean(value));
}

function allowedOriginSet(origins: readonly string[]): Set<string> {
  const normalized = origins
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
  return new Set(normalized);
}

function mergeVary(existing: string | null, value: string): string {
  const values = new Set(
    (existing || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  values.add(value);
  return [...values].join(", ");
}

function baseAdminCorsHeaders(existing?: Headers): Headers {
  const headers = new Headers(existing);
  headers.delete("Access-Control-Allow-Origin");
  headers.set("Access-Control-Allow-Headers", ADMIN_ALLOW_HEADERS);
  headers.set("Access-Control-Allow-Methods", ADMIN_ALLOW_METHODS);
  headers.set("Access-Control-Max-Age", "600");
  headers.set("Vary", mergeVary(headers.get("Vary"), "Origin"));
  return headers;
}

/**
 * Reject a browser Origin that is not explicitly configured before an admin
 * request can reach authentication, Stripe or privileged database operations.
 * Requests without an Origin are retained for trusted server-to-server tooling.
 */
export function adminOriginGuard(
  req: Request,
  allowedOrigins: readonly string[] = configuredAdminOrigins(),
): Response | null {
  const rawOrigin = req.headers.get("origin");
  const origin = normalizeOrigin(rawOrigin);
  const allowed = allowedOriginSet(allowedOrigins);

  if (rawOrigin && (!origin || !allowed.has(origin))) {
    const headers = baseAdminCorsHeaders();
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ error: "Origin not allowed", code: "origin_forbidden" }), {
      status: 403,
      headers,
    });
  }

  if (req.method === "OPTIONS") {
    const headers = baseAdminCorsHeaders();
    if (origin && allowed.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }

  return null;
}

/** Replace any inherited wildcard CORS header on every admin response. */
export function withAdminOriginAllowList(
  req: Request,
  response: Response,
  allowedOrigins: readonly string[] = configuredAdminOrigins(),
): Response {
  const headers = baseAdminCorsHeaders(response.headers);
  const origin = normalizeOrigin(req.headers.get("origin"));
  const allowed = allowedOriginSet(allowedOrigins);

  if (origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
