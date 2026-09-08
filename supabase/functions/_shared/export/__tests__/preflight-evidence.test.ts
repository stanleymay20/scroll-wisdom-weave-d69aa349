import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { recordExportEvent, type ExportStructuralPreflightEvidence } from "../audit.ts";

function makeFakeSupabase(inserts: { table: string; row: any }[], failExports = false) {
  return {
    from(table: string) {
      return {
        insert(row: any) {
          inserts.push({ table, row });
          if (table === "exports") {
            return {
              select() {
                return {
                  single: () => Promise.resolve(failExports
                    ? { data: null, error: { message: "write failed" } }
                    : { data: { id: "evt-1" }, error: null }),
                };
              },
            };
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

const exactEvidence: ExportStructuralPreflightEvidence = {
  artifactFormat: "kdp-pdf",
  exactArtifactSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  byteSize: 4242,
  ruleSetVersion: "kdp-structural-v1",
  status: "ready",
  score: 100,
  preflightLevel: "structural",
  profile: { kind: "kdp_paperback", trimSize: "6x9", bleed: false, printProfile: "black_white" },
  issues: [],
  metrics: { pageCount: 120, expectedPageWidth: 432, expectedPageHeight: 648 },
  unverifiedCapabilities: ["font_embedding", "image_effective_dpi"],
  claim: "KDP paperback structural preflight only; not KDP compliance certification.",
};

function baseOptions(supabase: any) {
  return {
    supabase,
    bookId: "book-1",
    userId: "user-1",
    format: "kdp-pdf",
    filename: "book-kdp.pdf",
    contentType: "application/pdf",
    fileHash: exactEvidence.exactArtifactSha256,
    byteSize: exactEvidence.byteSize,
    correlationId: "corr-1",
    canonicalPublicationId: "pub-1",
    canonicalCertificateId: "cert-1",
    canonicalWorkId: "work-1",
    canonicalRendererVersion: "renderer-v1",
    canonicalFallbackUsed: false,
    exportQualityStatus: "ready",
    exportQualityScore: 100,
  };
}

Deno.test("structural preflight evidence persists with exact artifact hash, profile and ruleset", async () => {
  const inserts: { table: string; row: any }[] = [];
  const supabase = makeFakeSupabase(inserts);
  const result = await recordExportEvent({
    ...baseOptions(supabase),
    structuralPreflightEvidence: exactEvidence,
  });

  assertEquals(result.exportEventId, "evt-1");
  assertEquals(result.evidencePersisted, true);
  assertEquals(result.structuralPreflightEvidencePersisted, true);

  const exportRow = inserts.find((i) => i.table === "exports")?.row;
  assert(exportRow);
  assertEquals(exportRow.file_hash, exactEvidence.exactArtifactSha256);
  assertEquals(exportRow.client_metadata.structural_preflight.exactArtifactSha256, exactEvidence.exactArtifactSha256);
  assertEquals(exportRow.client_metadata.structural_preflight.ruleSetVersion, "kdp-structural-v1");
  assertEquals(exportRow.client_metadata.structural_preflight.profile.kind, "kdp_paperback");
  assertEquals(exportRow.client_metadata.structural_preflight_evidence_state, "persisted_with_export");
});

Deno.test("mismatched structural evidence is never persisted against different bytes", async () => {
  const inserts: { table: string; row: any }[] = [];
  const supabase = makeFakeSupabase(inserts);
  const result = await recordExportEvent({
    ...baseOptions(supabase),
    structuralPreflightEvidence: { ...exactEvidence, exactArtifactSha256: "different-hash" },
  });

  assertEquals(result.exportEventId, null);
  assertEquals(result.evidencePersisted, false);
  assertEquals(result.structuralPreflightEvidencePersisted, false);
  assertEquals(inserts.length, 0);
});

Deno.test("non-fatal audit persistence failure remains visibly unpersisted", async () => {
  const inserts: { table: string; row: any }[] = [];
  const supabase = makeFakeSupabase(inserts, true);
  const result = await recordExportEvent({
    ...baseOptions(supabase),
    structuralPreflightEvidence: exactEvidence,
  });

  assertEquals(result.exportEventId, null);
  assertEquals(result.evidencePersisted, false);
  assertEquals(result.structuralPreflightEvidencePersisted, false);
});
