// export-publication
// Hardened export endpoint. Resolves ALL metadata from the Publication
// snapshot — client-supplied author/copyright/publisher/ISBN/price fields
// are dropped. Records every export in `exports` for audit.
//
// Phase 1: emits a manifest only (PDF/EPUB renderers continue to live in
// existing export-* functions). TODO(phase2): export provider registry,
// asymmetric signatures, asset provenance manifest.
import { preflight, requireUser, validateBody, json, serverError, serviceClient, z } from "../_shared/http.ts";
import { hasCapability, denyResponse } from "../_shared/permissions.ts";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";
import { resolvePublication, stripProtectedExportFields } from "../_shared/publicationSnapshot.ts";
import { buildReferencesSection, type CitationRecord } from "../_shared/citationFormat.ts";
import { resolveDesign } from "../_shared/publisherDesign.ts";

const Body = z.object({
  publication_id: z.string().uuid(),
  format: z.enum(["pdf", "epub", "docx", "kdp", "manifest"]),
  // Anything else the client sends is preserved as client_metadata
  // only AFTER stripProtectedExportFields() removes spoofable identity fields.
}).passthrough();

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const raw = await validateBody(req, Body); if (raw instanceof Response) return raw;

    const sc = serviceClient();
    const pub = await resolvePublication(sc, raw.publication_id);
    if (!pub) return json({ error: "publication_not_found" }, 404);

    const decision = await hasCapability(sc, "canExportPublication", { userId: auth.userId, workId: pub.work_id });
    if (!decision.allowed) {
      await logAuthorshipEvent(sc, {
        workId: pub.work_id, publicationId: pub.id, userId: auth.userId,
        action: "denied", allowed: false, reason: decision.reason,
        metadata: { attempted: "export", format: raw.format },
      });
      return json(denyResponse(decision, "canExportPublication"), 403);
    }

    // CRITICAL: discard any spoofable author/copyright/publisher/etc.
    const cleanClientMeta = stripProtectedExportFields(raw as Record<string, unknown>);

    // Resolve design + citations from the snapshot (NEVER from client input).
    const snap = pub.snapshot as Record<string, unknown>;
    const design = resolveDesign(snap.design as never);
    const citations = (snap.citations as CitationRecord[] | undefined) ?? [];
    const references = buildReferencesSection(citations, design.citation_style);

    const canonical = {
      title: pub.title,
      authors: pub.authors,
      rights_holders: pub.rights_holders,
      version: pub.version,
      content_hash: pub.content_hash,
      certificate_id: pub.certificate_id,
      integrity_level: pub.integrity_level,
      published_at: pub.published_at,
      language: pub.language,
      design,
      references,
    };

    // File hash placeholder — a real renderer fills this from the rendered bytes.
    const fileHashSource = JSON.stringify({ canonical, format: raw.format });
    const enc = new TextEncoder().encode(fileHashSource);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const fileHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: exp, error: expErr } = await sc.from("exports").insert({
      publication_id: pub.id,
      certificate_id: pub.certificate_id,
      work_id: pub.work_id,
      book_id: pub.book_id,
      exported_by: auth.userId,
      provider_id: "scrolllibrary.builtin",
      format: raw.format,
      integrity_level: pub.integrity_level,
      file_hash: fileHash,
      signature_algorithm: "sha256",
      signature_value: fileHash, // TODO(phase2): ed25519 signing
      public_key_id: "phase1-hash-only",
      renderer_version: "phase1.0.0",
      scrolllibrary_version: "phase1",
      watermark: decision.isOwner ? null : { collaborator: true, user_id: auth.userId },
      client_metadata: cleanClientMeta,
    }).select("id, exported_at").single();
    if (expErr) throw expErr;

    await logAuthorshipEvent(sc, {
      workId: pub.work_id, bookId: pub.book_id, publicationId: pub.id, userId: auth.userId,
      action: "export", allowed: true,
      metadata: { export_id: exp.id, format: raw.format, file_hash: fileHash },
    });

    return json({
      export_id: exp.id,
      exported_at: exp.exported_at,
      canonical, // exporters/renderers must use this — never the client input
      verify_url: `/verify/${exp.id}`,
    });
  } catch (e) {
    return serverError(e);
  }
});
