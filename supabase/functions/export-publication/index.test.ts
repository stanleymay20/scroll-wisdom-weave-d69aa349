// Regression tests for Phase 1 Authorship & Export Permissions Guard.
// These are unit-level checks on the pure helpers — full e2e tests are
// deferred to Phase 2 (TODO: dedicated test harness against a seeded DB).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripProtectedExportFields } from "../_shared/publicationSnapshot.ts";

Deno.test("stripProtectedExportFields removes spoofable identity fields", () => {
  const payload = {
    publication_id: "abc",
    format: "pdf",
    author: "Forger McSpoof",
    authors: [{ name: "Forger" }],
    copyright_holder: "Acme Forgers",
    publisher: "Spoof Press",
    isbn: "000-0",
    price: 99,
    distribution_channels: ["amazon"],
    content_hash: "deadbeef",
    certificate_id: "11111111-1111-1111-1111-111111111111",
    safe_passthrough: "ok",
  };
  const clean = stripProtectedExportFields(payload);
  assert(!("author" in clean));
  assert(!("authors" in clean));
  assert(!("copyright_holder" in clean));
  assert(!("publisher" in clean));
  assert(!("isbn" in clean));
  assert(!("price" in clean));
  assert(!("distribution_channels" in clean));
  assert(!("content_hash" in clean));
  assert(!("certificate_id" in clean));
  const c = clean as Record<string, unknown>;
  assertEquals(c.publication_id, "abc");
  assertEquals(c.format, "pdf");
  assertEquals(c.safe_passthrough, "ok");
});

Deno.test("stripProtectedExportFields handles empty payload", () => {
  const clean = stripProtectedExportFields({});
  assertEquals(Object.keys(clean).length, 0);
});
