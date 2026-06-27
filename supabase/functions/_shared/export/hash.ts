/**
 * Deterministic hashing helper for export integrity (S4).
 *
 * Mechanical extraction from supabase/functions/export-book/index.ts.
 * Behavior must remain byte-identical: SHA-256 over the raw rendered bytes,
 * encoded as lowercase hex.
 */

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Decode an export payload to its raw byte form for hashing.
 * Mirrors the original inline logic in export-book.
 */
export function decodeExportPayload(content: string, isBase64: boolean): Uint8Array {
  return isBase64
    ? Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(content);
}
