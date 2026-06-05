// Same-origin allow-listing for OAuth return URLs.
//
// Why this exists
// ---------------
// connect-* edge functions previously accepted any client-supplied
// return_url, sliced it to 500 chars, and stored it. The OAuth callback
// then 302-redirected to it without origin validation. That is a textbook
// open-redirect primitive: a third-party site could construct a Connect
// flow that, after OAuth completes or fails, bounces the victim from
// scrolllibrary.org to evil.com — abusing our domain's trust for phishing.
//
// safeReturnUrl validates that the supplied URL points at one of our
// own origins. Anything else collapses to null, in which case the
// callback falls back to the canonical post-connect destination.
//
// Acceptable shapes:
//   * Absolute URL whose origin matches APP_PUBLIC_URL (or its preview
//     origins, configurable via ALLOWED_RETURN_ORIGINS).
//   * Site-relative path starting with "/" (always same-origin).
//
// Anything else — different host, javascript:/data:/file: schemes,
// scheme-relative URLs, malformed input — returns null.

const MAX_LEN = 500;

// Read env via a globalThis lookup so tests under vitest (which shim
// globalThis.Deno) and edge runtime (which provides Deno natively) both
// resolve the same way. Avoids needing a triple-slash Deno reference here.
function envGet(key: string): string | undefined {
  const d = (globalThis as unknown as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno;
  return d?.env?.get(key);
}

function loadAllowList(): Set<string> {
  const origins = new Set<string>();
  const primary = envGet("APP_PUBLIC_URL");
  if (primary) {
    try { origins.add(new URL(primary).origin); } catch (_) { /* noop */ }
  }
  const extra = envGet("ALLOWED_RETURN_ORIGINS");
  if (extra) {
    for (const raw of extra.split(",")) {
      try { origins.add(new URL(raw.trim()).origin); } catch (_) { /* noop */ }
    }
  }
  return origins;
}

/**
 * Validate a caller-supplied return URL against the app's own origins.
 * Returns the URL on success; null on any rejection condition. Caller
 * decides what to do with null (typically: fall back to the canonical
 * post-connect destination).
 */
export function safeReturnUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LEN) return null;

  // Site-relative path is unambiguously same-origin.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  // Otherwise: must be a parseable absolute URL whose origin is allow-listed.
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const allowed = loadAllowList();
  // If no allowlist is configured (local dev without APP_PUBLIC_URL set),
  // fall back to rejecting absolute URLs entirely. Same-origin paths above
  // still work for the dev case.
  if (allowed.size === 0) return null;
  if (!allowed.has(parsed.origin)) return null;
  return parsed.toString();
}
