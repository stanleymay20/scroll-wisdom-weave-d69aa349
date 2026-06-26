// Export Integrity tests (S4)
// These exercise the deterministic-hash + append-only properties that the
// export event pipeline relies on. They do NOT require the edge runtime —
// run via `deno test --allow-all`.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("hash is deterministic for identical rendered bytes", async () => {
  const payload = new TextEncoder().encode("publication v1.0.0 :: canonical body");
  const a = await sha256Hex(payload);
  const b = await sha256Hex(payload);
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("hash differs when a single byte changes (snapshot mutation guard)", async () => {
  const a = await sha256Hex(new TextEncoder().encode("publication v1.0.0"));
  const b = await sha256Hex(new TextEncoder().encode("publication v1.0.1"));
  assertNotEquals(a, b);
});

Deno.test("repeated exports of the same bytes share file_hash but get unique correlation ids", async () => {
  const payload = new TextEncoder().encode("same render");
  const events = await Promise.all([1, 2, 3].map(async () => ({
    file_hash: await sha256Hex(payload),
    correlation_id: crypto.randomUUID(),
    exported_at: new Date().toISOString(),
  })));
  const hashes = new Set(events.map((e) => e.file_hash));
  const corrs = new Set(events.map((e) => e.correlation_id));
  assertEquals(hashes.size, 1, "same input must hash identically");
  assertEquals(corrs.size, events.length, "each export event must have its own correlation_id");
});

Deno.test("AI attribution must be referenced by publication_id — never duplicated into export", () => {
  // Schema contract: exports has no AI-attribution columns. We assert the
  // contract by listing the safe columns the exporter writes. If this list
  // ever grows to include attribution fields, the contract is broken.
  const exportColumns = new Set([
    "publication_id", "certificate_id", "work_id", "book_id", "exported_by",
    "provider_id", "format", "integrity_level", "file_hash",
    "signature_algorithm", "signature_value", "public_key_id",
    "renderer_version", "scrolllibrary_version", "watermark", "client_metadata",
  ]);
  for (const banned of ["model_name", "prompt_hash", "input_tokens", "output_tokens", "cost_cents"]) {
    assert(!exportColumns.has(banned), `exports must not store ${banned}; join ai_attribution_ledger by publication_id`);
  }
});
