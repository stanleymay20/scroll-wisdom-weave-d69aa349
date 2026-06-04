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
  /** Decoded pixel dimensions when the format is JPEG, PNG or WEBP. */
  widthPx?: number;
  heightPx?: number;
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

  const dims = readImageDimensions(buf, detected);

  return {
    bytes: buf,
    mime: detected,
    ext: detected === "image/png" ? "png" : detected === "image/webp" ? "webp" : "jpg",
    source: url,
    widthPx: dims?.width,
    heightPx: dims?.height,
  };
}

/**
 * Decode width/height from a JPEG, PNG or WEBP byte stream without parsing
 * the full image. The selling-safety verifier needs real pixel dimensions
 * to enforce KDP / storefront cover-size rules, and we'd rather walk a few
 * bytes here than ship a heavy image library to the edge runtime.
 */
export function readImageDimensions(b: Uint8Array, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return readPng(b);
    if (mime === "image/jpeg") return readJpeg(b);
    if (mime === "image/webp") return readWebp(b);
  } catch (_) { /* fall through */ }
  return null;
}

function readPng(b: Uint8Array): { width: number; height: number } | null {
  // PNG IHDR chunk follows the 8-byte signature: 4 length + "IHDR" + 4 width + 4 height.
  if (b.length < 24) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpeg(b: Uint8Array): { width: number; height: number } | null {
  // Walk segments. SOFn markers (C0..CF excluding C4/C8/CC) contain the
  // frame header with height/width as 16-bit big-endian after a 1-byte
  // precision.
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    while (i < b.length && b[i] === 0xff) i++;
    const marker = b[i++];
    if (marker === 0xd8 || marker === 0xd9) return null;
    // Markers without a length byte:
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (i + 1 >= b.length) return null;
    const segLen = (b[i] << 8) | b[i + 1];
    // SOFn = baseline / progressive / extended sequential frame start.
    const isSof = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      // i = length hi, i+1 = length lo, i+2 = precision, i+3..i+4 = height, i+5..i+6 = width.
      if (i + 6 >= b.length) return null;
      const height = (b[i + 3] << 8) | b[i + 4];
      const width = (b[i + 5] << 8) | b[i + 6];
      return { width, height };
    }
    i += segLen;
  }
  return null;
}

function readWebp(b: Uint8Array): { width: number; height: number } | null {
  // VP8 lossy: 'VP8 ' chunk; width/height at bytes 26-29 (each 14 bits + 2 bits).
  // VP8L lossless: 'VP8L' chunk; bytes 21-24.
  // VP8X extended: 'VP8X' chunk; width-1 / height-1 at 24..29 (each 24-bit LE).
  if (b.length < 30) return null;
  const fourCC = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (fourCC === "VP8 ") {
    const w = (b[26] | (b[27] << 8)) & 0x3fff;
    const h = (b[28] | (b[29] << 8)) & 0x3fff;
    return { width: w, height: h };
  }
  if (fourCC === "VP8L") {
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (fourCC === "VP8X") {
    if (b.length < 30) return null;
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { width: w, height: h };
  }
  return null;
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
