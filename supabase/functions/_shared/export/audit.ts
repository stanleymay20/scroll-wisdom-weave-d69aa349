/**
 * Export integrity audit writer (S4).
 *
 * Mechanical extraction from supabase/functions/export-book/index.ts.
 * Writes the immutable `exports` row plus a matching `authorship_audit_log`
 * entry. All fields, defaults, and non-fatal error handling are preserved
 * exactly — failures are logged via console.warn and never thrown.
 */

export interface RecordExportEventOptions {
  supabase: any;
  bookId: string;
  userId: string;
  format: string;
  filename: string;
  contentType: string;
  fileHash: string;
  byteSize: number;
  correlationId: string;
  canonicalPublicationId: string | null;
  canonicalCertificateId: string | null;
  canonicalWorkId: string | null;
  canonicalRendererVersion: string | null;
  canonicalFallbackUsed: boolean;
  exportQualityStatus: string | null;
  exportQualityScore: number | null;
}

export interface RecordExportEventResult {
  exportEventId: string | null;
}

export async function recordExportEvent(
  opts: RecordExportEventOptions,
): Promise<RecordExportEventResult> {
  const {
    supabase, bookId, userId, format, filename, contentType,
    fileHash, byteSize, correlationId,
    canonicalPublicationId, canonicalCertificateId, canonicalWorkId,
    canonicalRendererVersion, canonicalFallbackUsed,
    exportQualityStatus, exportQualityScore,
  } = opts;

  let exportEventId: string | null = null;

  try {
    const integrityLevel = canonicalPublicationId ? "published_export" : "draft_export";
    const { data: expRow, error: expErr } = await supabase.from("exports").insert({
      publication_id: canonicalPublicationId,
      certificate_id: canonicalCertificateId,
      work_id: canonicalWorkId,
      book_id: bookId,
      exported_by: userId,
      provider_id: "scrolllibrary.export-book",
      format,
      integrity_level: integrityLevel,
      file_hash: fileHash,
      signature_algorithm: "sha256",
      signature_value: fileHash, // TODO(phase2): ed25519 signing
      public_key_id: "phase1-hash-only",
      renderer_version: canonicalRendererVersion || "legacy",
      scrolllibrary_version: "export-book@phase1",
      watermark: {},
      client_metadata: {
        correlation_id: correlationId,
        byte_size: byteSize,
        filename,
        content_type: contentType,
        canonical_fallback_used: canonicalFallbackUsed,
        export_quality_status: exportQualityStatus,
        export_quality_score: exportQualityScore,
      },
    }).select("id").single();

    if (expErr) {
      console.warn("[EXPORT] exports insert failed (non-fatal):", expErr);
    } else if (expRow) {
      exportEventId = expRow.id;
      await supabase.from("authorship_audit_log").insert({
        work_id: canonicalWorkId,
        book_id: bookId,
        publication_id: canonicalPublicationId,
        user_id: userId,
        actor_kind: "user",
        action: "export",
        allowed: true,
        correlation_id: correlationId,
        metadata: {
          export_id: expRow.id,
          format,
          file_hash: fileHash,
          byte_size: byteSize,
          renderer: canonicalRendererVersion || "legacy",
        },
      } as any);
    }
  } catch (e) {
    console.warn("[EXPORT] export event logging failed (non-fatal):", e);
  }

  return { exportEventId };
}
