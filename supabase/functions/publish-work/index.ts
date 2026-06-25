// publish-work
// Mint an immutable Publication snapshot for a Work and apply the
// publish-lock to authorship/rights. Only the owner can call this.
import { preflight, requireUser, validateBody, json, forbidden, serverError, serviceClient, z } from "../_shared/http.ts";
import { hasCapability, denyResponse } from "../_shared/permissions.ts";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";

const Body = z.object({
  work_id: z.string().uuid(),
  edition_kind: z.string().default("primary"),
  language: z.string().default("en"),
  integrity_level: z.enum(["draft", "standard", "verified", "certified"]).default("standard"),
  notes: z.string().max(2000).optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const body = await validateBody(req, Body); if (body instanceof Response) return body;

    const sc = serviceClient();
    const decision = await hasCapability(sc, "canPublishWork", { userId: auth.userId, workId: body.work_id });
    if (!decision.allowed) {
      await logAuthorshipEvent(sc, {
        workId: body.work_id, userId: auth.userId, action: "denied",
        allowed: false, reason: decision.reason, metadata: { attempted: "publish" },
      });
      return json(denyResponse(decision, "canPublishWork"), 403);
    }

    // Resolve current Work + authors + rights → freeze into a snapshot.
    const [{ data: work }, { data: authors }, { data: rights }, { data: book }] = await Promise.all([
      sc.from("works").select("id, title, original_language").eq("id", body.work_id).maybeSingle(),
      sc.from("work_authors").select("user_id, display_name, author_role, sort_order, contribution_percentage").eq("work_id", body.work_id).order("sort_order"),
      sc.from("work_rights").select("rights_holder_id, rights_class, rights_scope, territory, language").eq("work_id", body.work_id),
      sc.from("books").select("id, title, design_settings").eq("work_id", body.work_id).maybeSingle(),
    ]);
    if (!work) return json({ error: "work_not_found" }, 404);

    // Pull display_name for each rights holder.
    const holderIds = [...new Set((rights ?? []).map((r) => r.rights_holder_id).filter(Boolean))];
    const { data: holders } = holderIds.length
      ? await sc.from("rights_holders").select("id, display_name, holder_type, country_code").in("id", holderIds)
      : { data: [] as Array<{ id: string; display_name: string; holder_type: string; country_code: string | null }> };

    let chapters: Array<{ id: string; chapter_number: number; title: string }> = [];
    if (book?.id) {
      const { data: ch } = await sc.from("chapters").select("id, chapter_number, title").eq("book_id", book.id).order("chapter_number");
      chapters = ch ?? [];
    }

    // Freeze design snapshot (Phase 2.1 — Publisher Design System).
    const design_snapshot = (book?.design_settings as Record<string, unknown> | null) ?? null;

    // Freeze citations snapshot (Phase 2.1 — Evidence & Citation Engine).
    let citations_snapshot: unknown[] = [];
    if (book?.id) {
      const { data: cites } = await sc
        .from("book_citations")
        .select("id, citation_key, source_type, citation_text, authors, publisher, container_title, volume, issue, pages, doi, isbn, url, accessed_at, publication_date, confidence")
        .eq("book_id", book.id);
      citations_snapshot = cites ?? [];
    }

    const snapshot = {
      title: work.title,
      language: work.original_language ?? body.language,
      authors: authors ?? [],
      rights_holders: holders ?? [],
      rights: rights ?? [],
      chapters,
      design: design_snapshot,
      citations: citations_snapshot,
      frozen_at: new Date().toISOString(),
    };

    // Compute SHA-256 over canonical snapshot JSON.
    const enc = new TextEncoder().encode(JSON.stringify(snapshot));
    const hashBuf = await crypto.subtle.digest("SHA-256", enc);
    const contentHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

    // Determine next semver. Phase 1: increment minor on each publish.
    const { data: latest } = await sc
      .from("publications")
      .select("semver_major, semver_minor, semver_patch")
      .eq("work_id", body.work_id)
      .order("semver_major", { ascending: false })
      .order("semver_minor", { ascending: false })
      .order("semver_patch", { ascending: false })
      .limit(1)
      .maybeSingle();
    const major = latest?.semver_major ?? 1;
    const minor = (latest?.semver_minor ?? -1) + 1;
    const patch = 0;
    const version = `${major}.${minor}.${patch}`;

    const { data: pub, error: pubErr } = await sc
      .from("publications")
      .insert({
        work_id: body.work_id,
        edition_kind: body.edition_kind,
        language: body.language,
        version,
        semver_major: major, semver_minor: minor, semver_patch: patch,
        status: "published",
        integrity_level: body.integrity_level,
        snapshot,
        design_snapshot,
        content_hash: contentHash,
        published_at: new Date().toISOString(),
        published_by: auth.userId,
        notes: body.notes ?? null,
      })
      .select("id, version, content_hash, published_at")
      .single();
    if (pubErr) throw pubErr;

    const { data: cert } = await sc
      .from("publication_certificates")
      .insert({
        publication_id: pub.id,
        work_id: body.work_id,
        authors_snapshot: snapshot.authors,
        rights_holders_snapshot: snapshot.rights_holders,
        content_hash: contentHash,
        signature_algorithm: "sha256",
        signature_value: contentHash, // TODO(phase2): asymmetric ed25519 signing
        public_key_id: "phase1-hash-only",
        issuer: "scrolllibrary",
      })
      .select("id")
      .single();

    await sc.from("publications").update({ certificate_id: cert?.id ?? null }).eq("id", pub.id);

    await sc.from("works").update({
      current_publication_id: pub.id,
      publish_locked_at: new Date().toISOString(),
      publish_locked_by: auth.userId,
      publish_lock_reason: "published",
    }).eq("id", body.work_id);

    if (book?.id) {
      await sc.from("books").update({
        current_publication_id: pub.id,
        publish_locked_at: new Date().toISOString(),
        publish_locked_by: auth.userId,
      }).eq("id", book.id);
    }

    await logAuthorshipEvent(sc, {
      workId: body.work_id, bookId: book?.id ?? null, publicationId: pub.id,
      userId: auth.userId, action: "publish", allowed: true,
      metadata: { version, integrity_level: body.integrity_level, content_hash: contentHash },
    });

    return json({ publication_id: pub.id, certificate_id: cert?.id, version, content_hash: contentHash });
  } catch (e) {
    return serverError(e);
  }
});
