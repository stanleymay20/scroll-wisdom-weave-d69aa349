// verify-export (public, no auth)
// Canonical trust record for an exported file. Returns publication, certificate,
// export, hash, and an AI attribution SUMMARY (derived by join on publication_id —
// never duplicated). Sensitive snapshot/prompt data is never exposed.
import { preflight, json, serverError, serviceClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const url = new URL(req.url);
    const exportId = url.searchParams.get("export_id") ?? url.pathname.split("/").pop();
    if (!exportId) return json({ error: "missing_export_id" }, 400);

    const sc = serviceClient();
    const { data, error } = await sc.rpc("verify_export_public", { _export_id: exportId });
    if (error) throw error;
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) return json({ verified: false, reason: "not_found" }, 404);

    // The RPC returns either the flat legacy shape (title/authors/...) or the
    // rich jsonb shape ({ publication, work, authors, rights, ... }). Support both.
    const publication = row.publication ?? {
      id: null, version: row.version ?? null, content_hash: row.content_hash ?? null,
      published_at: row.published_at ?? null, status: null, edition_kind: null, language: null,
    };
    const work = row.work ?? { id: null, title: row.title ?? null };
    const publicationId = publication?.id ?? null;

    // AI attribution SUMMARY — joined, never duplicated.
    let aiAttribution: {
      total_operations: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_cents: number;
      models: { model_name: string; provider: string | null; operations: number }[];
      human_reviewed: number;
    } | null = null;

    if (publicationId) {
      const { data: ledger } = await sc
        .from("ai_attribution_ledger")
        .select("model_name, model_provider, input_tokens, output_tokens, cost_cents, human_review_status")
        .eq("publication_id", publicationId);
      if (ledger && ledger.length > 0) {
        const byModel = new Map<string, { provider: string | null; operations: number }>();
        let inTok = 0, outTok = 0, cost = 0, reviewed = 0;
        for (const r of ledger as any[]) {
          inTok += r.input_tokens ?? 0;
          outTok += r.output_tokens ?? 0;
          cost += r.cost_cents ?? 0;
          if (r.human_review_status && r.human_review_status !== "unreviewed") reviewed++;
          const k = r.model_name ?? "unknown";
          const cur = byModel.get(k) ?? { provider: r.model_provider ?? null, operations: 0 };
          cur.operations++;
          byModel.set(k, cur);
        }
        aiAttribution = {
          total_operations: ledger.length,
          total_input_tokens: inTok,
          total_output_tokens: outTok,
          total_cost_cents: cost,
          models: Array.from(byModel.entries())
            .map(([model_name, v]) => ({ model_name, provider: v.provider, operations: v.operations }))
            .sort((a, b) => b.operations - a.operations),
          human_reviewed: reviewed,
        };
      } else {
        aiAttribution = {
          total_operations: 0, total_input_tokens: 0, total_output_tokens: 0,
          total_cost_cents: 0, models: [], human_reviewed: 0,
        };
      }
    }

    // Canonical trust record
    return json({
      verified: true,
      verification_status: row.revoked ? "revoked" : "valid",
      export: {
        id: row.export_id ?? exportId,
        exported_at: row.exported_at ?? null,
        format: row.format ?? null,
        provider_id: row.provider_id ?? null,
        integrity_level: row.integrity_level ?? null,
        file_hash: row.file_hash ?? null,
        signature_algorithm: row.signature_algorithm ?? null,
      },
      publication: {
        id: publicationId,
        version: publication?.version ?? null,
        edition_kind: publication?.edition_kind ?? null,
        language: publication?.language ?? null,
        status: publication?.status ?? null,
        published_at: publication?.published_at ?? null,
        content_hash: publication?.content_hash ?? null,
      },
      certificate: {
        id: row.certificate_id ?? null,
        revoked: !!row.revoked,
      },
      work: {
        id: work?.id ?? null,
        title: work?.title ?? row.title ?? null,
      },
      authors: row.authors ?? [],
      rights: row.rights ?? {
        publisher: row.publisher ?? null,
        copyright_holder: row.copyright_holder ?? null,
      },
      ai_attribution: aiAttribution, // joined summary, not duplicated
    });
  } catch (e) {
    return serverError(e);
  }
});
