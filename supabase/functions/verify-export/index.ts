// verify-export (public, no auth)
// Returns ONLY safe public information about an export — never the full
// snapshot, prompts, internal IDs beyond the export id, or unpublished
// metadata. Backed by the SECURITY DEFINER function verify_export_public.
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
    if (!data) return json({ verified: false, reason: "not_found" }, 404);

    // Whitelist response shape — never spread unknown columns.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return json({ verified: false, reason: "not_found" }, 404);

    return json({
      verified: true,
      title: row.title ?? null,
      authors: row.authors ?? [],
      version: row.version ?? null,
      certificate_id: row.certificate_id ?? null,
      integrity_level: row.integrity_level ?? null,
      publisher: row.publisher ?? null,
      copyright_holder: row.copyright_holder ?? null,
      content_hash: row.content_hash ?? null,
      published_at: row.published_at ?? null,
      exported_at: row.exported_at ?? null,
      format: row.format ?? null,
    });
  } catch (e) {
    return serverError(e);
  }
});
