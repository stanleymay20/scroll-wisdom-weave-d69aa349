// Asset fetcher used by bundle generation.
//
// The previous bundle pipeline did `await fetch(coverUrl)` with no retry,
// no size cap, and no MIME validation. Bundles routinely shipped without a
// cover when the upstream CDN had a transient blip, and a hostile URL could
// stream an unbounded body straight into memory.
//
// This helper:
//   * Retries transient failures with backoff.
//   * Enforces a hard byte cap (default 8 MB — comfortably bigger than any
//     legitimate book cover, much smaller than a memory-eviction risk).
//   * Validates Content-Type and refuses anything that isn't a real image
//     format we can ship to Kindle / Gumroad / Etsy without conversion.
//   * Re-detects format from the magic bytes when the upstream Content-Type
//     is missing or wrong (a surprisingly common pattern with edge-cached
//     covers served as `application/octet-stream`).
import { fetchWithRetry } from "./upstream-retry.ts";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface FetchedAsset {
  bytes: Uint8Array;
  mime: string;
  /** Best filename extension for the inferred MIME ("jpg"/"png"/"webp"). */
  ext: "jpg" | "png" | "webp";
  source: string;
}

export interface FetchAssetOptions {
  maxBytes?: number;
  timeoutMs?: number;
  /** Allow caller to widen the MIME allowlist (e.g. SVG for KDP cover later). */
  extraAllowedMime?: string[];
}

export async function fetchImageAsset(
  url: string,
  opts: FetchAssetOptions = {},
): Promise<FetchedAsset | null> {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  } catch { return null; }

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowed = new Set<string>([...ALLOWED_IMAGE_MIME, ...(opts.extraAllowedMime ?? [])]);

  let res: Response;
  try {
    res = await fetchWithRetry(url, { method: "GET" }, {
      attempts: 3, timeoutMs: opts.timeoutMs ?? 15_000,
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    try { await res.body?.cancel(); } catch (_) { /* noop */ }
    return null;
  }

  // Refuse before reading the body if Content-Length is already past the cap.
  const lenHdr = res.headers.get("content-length");
  if (lenHdr && Number(lenHdr) > maxBytes) {
    try { await res.body?.cancel(); } catch (_) { /* noop */ }
    return null;
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > maxBytes) return null;

  const detected = detectImageMime(buf) ?? (res.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
  if (!detected || !allowed.has(detected)) return null;

  return {
    bytes: buf,
    mime: detected,
    ext: detected === "image/png" ? "png" : detected === "image/webp" ? "webp" : "jpg",
    source: url,
  };
}

/** Detect image MIME from magic bytes. Returns null when no match. */
export function detectImageMime(b: Uint8Array): string | null {
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Compute a hex SHA-256 of a UTF-8 string. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
