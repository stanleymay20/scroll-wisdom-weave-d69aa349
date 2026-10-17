import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertCertifiedExportAudit, CertifiedExportAuditError } from "./qualification.ts";
import { recordExportEvent } from "./audit.ts";

const hash = "c".repeat(64);

const options = {
  bookId: "book",
  userId: "user",
  format: "kdp-pdf",
  filename: "book.pdf",
  contentType: "application/pdf",
  fileHash: hash,
  byteSize: 555,
  correlationId: "test",
  canonicalPublicationId: "publication",
  canonicalCertificateId: "certificate",
  canonicalWorkId: "work",
  canonicalRendererVersion: "1",
  canonicalFallbackUsed: false,
  exportQualityStatus: "pass",
  exportQualityScore: 100,
};

Deno.test("certified publication requires hash, ledger ID and acknowledged authorship audit", () => {
  assertCertifiedExportAudit("published", hash, { exportEventId: "evt", auditLogRecorded: true });
  for (const result of [
    { fileHash: null, record: { exportEventId: "evt", auditLogRecorded: true } },
    { fileHash: "truncated", record: { exportEventId: "evt", auditLogRecorded: true } },
    { fileHash: hash, record: { exportEventId: null, auditLogRecorded: true } },
    { fileHash: hash, record: { exportEventId: "evt", auditLogRecorded: false } },
  ]) {
    const thrown = assertThrows(
      () => assertCertifiedExportAudit("published", result.fileHash, result.record),
      CertifiedExportAuditError,
    );
    assertEquals(thrown.code, "CERTIFIED_EXPORT_AUDIT_INCOMPLETE");
  }
});

Deno.test("draft export remains best-effort; never misrepresents certified evidence", () => {
  assertCertifiedExportAudit(null, null, { exportEventId: null, auditLogRecorded: false });
});

Deno.test("writer acknowledges both insert results when completed", async () => {
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      return {
        insert(_row: unknown) {
          calls.push(table);
          if (table === "exports") {
            return { select: () => ({ single: async () => ({ data: { id: "evt" }, error: null }) }) };
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const result = await recordExportEvent({ ...options, supabase });
  assertEquals(result, { exportEventId: "evt", auditLogRecorded: true });
  assertEquals(calls, ["exports", "authorship_audit_log"]);
});

Deno.test("writer flags failed authorship audit rather than claiming complete evidence", async () => {
  const supabase = {
    from(table: string) {
      return {
        insert(_row: unknown) {
          if (table === "exports") {
            return { select: () => ({ single: async () => ({ data: { id: "evt" }, error: null }) }) };
          }
          return Promise.resolve({ error: { message: "audit_insert_denied" } });
        },
      };
    },
  };
  const result = await recordExportEvent({ ...options, supabase });
  assertEquals(result, { exportEventId: "evt", auditLogRecorded: false });
  assertThrows(
    () => assertCertifiedExportAudit("publication", hash, result),
    CertifiedExportAuditError,
  );
});

Deno.test("writer never claims evidence when export insert fails", async () => {
  const supabase = {
    from(_table: string) {
      return {
        insert(_row: unknown) {
          return { select: () => ({ single: async () => ({ data: null, error: { message: "insert_denied" } }) }) };
        },
      };
    },
  };
  const result = await recordExportEvent({ ...options, supabase });
  assertEquals(result, { exportEventId: null, auditLogRecorded: false });
});
