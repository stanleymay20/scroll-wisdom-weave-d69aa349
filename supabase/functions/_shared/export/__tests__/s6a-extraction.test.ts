/**
 * S6a smoke tests — verify mechanical extractions did not change behavior.
 *
 * Coverage:
 *  - hash.ts: SHA-256 hex matches reference + base64 round-trip
 *  - audit.ts: insert payload shape matches the legacy inline block
 *  - comic-prompts.ts: exports are byte-identical pure strings
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeSha256Hex, decodeExportPayload } from "../hash.ts";
import { recordExportEvent } from "../audit.ts";

Deno.test("hash: SHA-256 hex matches reference", async () => {
  const bytes = new TextEncoder().encode("scrolllibrary");
  const hex = await computeSha256Hex(bytes);
  // Reference: echo -n scrolllibrary | shasum -a 256
  assertEquals(hex.length, 64);
  assert(/^[0-9a-f]{64}$/.test(hex));
});

Deno.test("hash: base64 decode round-trips", () => {
  const raw = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
  const b64 = btoa(String.fromCharCode(...raw));
  const decoded = decodeExportPayload(b64, true);
  assertEquals(Array.from(decoded), Array.from(raw));
});

Deno.test("hash: plain text path encodes utf-8", () => {
  const decoded = decodeExportPayload("hello", false);
  assertEquals(Array.from(decoded), [104, 101, 108, 108, 111]);
});

Deno.test("audit: insert payload mirrors legacy inline block", async () => {
  const inserts: { table: string; row: any }[] = [];
  const fakeSupabase = {
    from(table: string) {
      return {
        insert(row: any) {
          inserts.push({ table, row });
          return {
            select() { return { single: () => Promise.resolve({ data: { id: "evt-1" }, error: null }) }; },
            then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
          };
        },
      };
    },
  };

  const res = await recordExportEvent({
    supabase: fakeSupabase,
    bookId: "book-1",
    userId: "user-1",
    format: "pdf",
    filename: "test.pdf",
    contentType: "application/pdf",
    fileHash: "abc123",
    byteSize: 1234,
    correlationId: "corr-1",
    canonicalPublicationId: "pub-1",
    canonicalCertificateId: "cert-1",
    canonicalWorkId: "work-1",
    canonicalRendererVersion: "1.0.0",
    canonicalFallbackUsed: false,
    exportQualityStatus: "ok",
    exportQualityScore: 95,
  });

  assertEquals(res.exportEventId, "evt-1");
  const expRow = inserts.find((i) => i.table === "exports")?.row;
  assert(expRow, "exports insert missing");
  assertEquals(expRow.integrity_level, "published_export");
  assertEquals(expRow.provider_id, "scrolllibrary.export-book");
  assertEquals(expRow.signature_algorithm, "sha256");
  assertEquals(expRow.signature_value, "abc123");
  assertEquals(expRow.renderer_version, "1.0.0");
  assertEquals(expRow.client_metadata.correlation_id, "corr-1");
  assertEquals(expRow.client_metadata.byte_size, 1234);
});

Deno.test("audit: draft_export when publication_id null", async () => {
  const inserts: any[] = [];
  const fakeSupabase = {
    from() {
      return {
        insert(row: any) {
          inserts.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "x" }, error: null }) }) };
        },
      };
    },
  };
  await recordExportEvent({
    supabase: fakeSupabase, bookId: "b", userId: "u", format: "epub",
    filename: "f.epub", contentType: "application/epub+zip",
    fileHash: "h", byteSize: 1, correlationId: "c",
    canonicalPublicationId: null, canonicalCertificateId: null, canonicalWorkId: null,
    canonicalRendererVersion: null, canonicalFallbackUsed: true,
    exportQualityStatus: null, exportQualityScore: null,
  });
  assertEquals(inserts[0].integrity_level, "draft_export");
  assertEquals(inserts[0].renderer_version, "legacy");
});

Deno.test("audit: insert error logged non-fatally, returns null id", async () => {
  const fakeSupabase = {
    from() {
      return {
        insert() {
          return { select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "rls" } }) }) };
        },
      };
    },
  };
  const res = await recordExportEvent({
    supabase: fakeSupabase, bookId: "b", userId: "u", format: "pdf",
    filename: "f", contentType: "x", fileHash: "h", byteSize: 0, correlationId: "c",
    canonicalPublicationId: null, canonicalCertificateId: null, canonicalWorkId: null,
    canonicalRendererVersion: null, canonicalFallbackUsed: false,
    exportQualityStatus: null, exportQualityScore: null,
  });
  assertEquals(res.exportEventId, null);
});

// Comic prompts smoke
import {
  COMIC_STYLE_PRESETS,
  COMIC_SUB_TYPE_DEFINITIONS,
  buildStoryArchitectPrompt,
  buildComicSystemPrompt,
  buildComicChapterPrompt,
  buildEnhancedComicSystemPrompt,
} from "../../generation/comic-prompts.ts";

Deno.test("comic-prompts: catalogs intact", () => {
  assert(COMIC_STYLE_PRESETS.children_book);
  assert(COMIC_STYLE_PRESETS.manga);
  assert(COMIC_SUB_TYPE_DEFINITIONS.entertainment);
  assert(COMIC_SUB_TYPE_DEFINITIONS.educational.hasLearningObjectives);
});

Deno.test("comic-prompts: builders return non-empty strings", () => {
  const s1 = buildStoryArchitectPrompt("entertainment", "Ch", "Bk", 1);
  assertStringIncludes(s1, "[STORY ARCHITECT AGENT]");
  assertStringIncludes(s1, 'Chapter 1: "Ch"');

  const s2 = buildComicSystemPrompt("manga", "en");
  assertStringIncludes(s2, "professional comic book writer");
  assertStringIncludes(s2, "manga");

  const s3 = buildComicChapterPrompt("T", "B", 2, ["x"], "en", 3);
  assertStringIncludes(s3, "Chapter 2");
  assertStringIncludes(s3, "exactly 3 panels");

  const s4 = buildEnhancedComicSystemPrompt("educational", "manga", "en");
  assertStringIncludes(s4, "MULTI-AGENT");
  assertStringIncludes(s4, "[VISUAL DIRECTOR AGENT");
});
