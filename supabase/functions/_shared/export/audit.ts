/**
 * Export integrity audit writer (S4).
 *
 * Writes the immutable `exports` row plus a matching `authorship_audit_log`
 * entry. Persistence failures remain non-fatal to the export itself, but the
 * return value explicitly states whether evidence was persisted so callers
 * must not describe a successful download as certified when its audit write
 * failed.
 */

export interface ExportStructuralPreflightEvidence {
  artifactFormat: string;
  exactArtifactSha256: string;
  byteSize: number;
  ruleSetVersion: string;
  status: string;
  score: number;
  preflightLevel: string;
  profile: unknown;
  issues: unknown[];
  metrics: unknown;
  unverifiedCapabilities: string[];
  claim: string;
}

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
  /** Exact-byte structural preflight evidence, when the emitted format has one. */
  structuralPreflightEvidence?: ExportStructuralPreflightEvidence | null;
}

export interface RecordExportEventResult {
  exportEventId: string | null;
  evidencePersisted: boolean;
  structuralPreflightEvidencePersisted: boolean;
}

function structuralEvidenceMatchesArtifact(
  evidence: ExportStructuralPreflightEvidence,
  format: string,
  fileHash: string,
  byteSize: number,
): boolean {
  return evidence.artifactFormat === format
    && evidence.exactArtifactSha256 === fileHash
    && evidence.byteSize === byteSize;
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
    structuralPreflightEvidence = null,
  } = opts;

  let exportEventId: string | null = null;
  let evidencePersisted = false;
  let structuralPreflightEvidencePersisted = false;

  // Never persist a preflight report against different bytes/format. A failed
  // binding must remain visibly unpersisted rather than becoming misleading
  // certification evidence.
  if (structuralPreflightEvidence && !structuralEvidenceMatchesArtifact(
    structuralPreflightEvidence,
    format,
    fileHash,
    byteSize,
  )) {
    console.warn("[EXPORT] structural preflight evidence does not match exact artifact; audit write skipped");
    return { exportEventId: null, evidencePersisted: false, structuralPreflightEvidencePersisted: false };
  }

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
        structural_preflight: structuralPreflightEvidence,
        structural_preflight_evidence_state: structuralPreflightEvidence ? "persisted_with_export" : "not_applicable",
      },
    }).select("id").single();

    if (expErr) {
      console.warn("[EXPORT] exports insert failed (non-fatal):", expErr);
    } else if (expRow) {
      exportEventId = expRow.id;
      evidencePersisted = true;
      structuralPreflightEvidencePersisted = Boolean(structuralPreflightEvidence);
      const { error: auditErr } = await supabase.from("authorship_audit_log").insert({
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
          structural_preflight_rule_set: structuralPreflightEvidence?.ruleSetVersion ?? null,
          structural_preflight_status: structuralPreflightEvidence?.status ?? null,
          structural_preflight_exact_artifact_sha256: structuralPreflightEvidence?.exactArtifactSha256 ?? null,
        },
      } as any);
      if (auditErr) console.warn("[EXPORT] authorship audit log insert failed (non-fatal):", auditErr);
    }
  } catch (e) {
    console.warn("[EXPORT] export event logging failed (non-fatal):", e);
  }

  return { exportEventId, evidencePersisted, structuralPreflightEvidencePersisted };
}
