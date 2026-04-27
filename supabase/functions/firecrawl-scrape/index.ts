import {
  preflight,
  json,
  serverError,
  requireUser,
  validateBody,
  enforceRateLimit,
  z,
} from "../_shared/http.ts";

const BodySchema = z.object({
  url: z.string().min(4).max(2048),
});

// Block private / link-local / metadata IP ranges to prevent SSRF
// against the Supabase platform or other internal services.
const PRIVATE_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local + metadata
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
];

function isUnsafeUrl(raw: string): { ok: false; reason: string } | { ok: true; url: URL } {
  let formatted = raw.trim();
  if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
    formatted = `https://${formatted}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(formatted);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) URLs are allowed" };
  }
  const host = parsed.hostname;
  if (PRIVATE_HOSTS.some((re) => re.test(host))) {
    return { ok: false, reason: "Private or loopback hosts are blocked" };
  }
  return { ok: true, url: parsed };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    // Limit external scrapes to prevent abuse / runaway costs.
    const limited = enforceRateLimit({
      name: "firecrawl-scrape",
      key: auth.userId,
      limit: 30,
      windowSec: 60,
    });
    if (limited) return limited;

    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const check = isUnsafeUrl(body.url);
    if (!check.ok) {
      return json({ success: false, error: check.reason, code: "unsafe_url" }, 400);
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return json({ success: false, error: "Firecrawl not configured" }, 500);
    }

    console.log("[firecrawl-scrape] scraping", { userId: auth.userId, host: check.url.hostname });

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: check.url.toString(),
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[firecrawl-scrape] api error", { status: response.status });
      return json(
        { success: false, error: data?.error || `Request failed with status ${response.status}` },
        response.status >= 400 && response.status < 600 ? response.status : 502,
      );
    }

    const markdown = data?.data?.markdown || data?.markdown || "";
    const title = data?.data?.metadata?.title || data?.metadata?.title || "";

    return json({ success: true, markdown, title });
  } catch (err) {
    console.error("[firecrawl-scrape] unexpected error", err);
    return serverError(err);
  }
});
