import type { RecordExportEventResult } from "./audit.ts";

/**
 * Production certification claims are bound to an immutable, hash-addressable
 * export event and an authorship audit entry. An unrecorded published artifact
 * must not leave the server, including on the direct-binary download path.
 *
 * Draft exports remain best effort and are not represented as certified.
 */
export class CertifiedExportAuditError extends Error {
  readonly code = "CERTIFIED_EXPORT_AUDIT_INCOMPLETE";
  constructor() {
    super("Certified export evidence is unavailable. Please retry later.");
    this.name = "CertifiedExportAuditError";
  }
}

export function assertCertifiedExportAudit(
  canonicalPublicationId: string | null,
  fileHash: string | null,
  result: RecordExportEventResult,
): void {
  if (!canonicalPublicationId) return;

  if (!fileHash || !/^[a-f0-9]{64}$/.test(fileHash)
      || !result.exportEventId?.trim() || result.auditLogRecorded !== true) {
    throw new CertifiedExportAuditError();
  }
}
