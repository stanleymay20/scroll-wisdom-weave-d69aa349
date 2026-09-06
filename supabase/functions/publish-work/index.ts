// publish-work
// Mint an immutable Publication snapshot for a Work and apply the
// publish-lock to authorship/rights. Only the owner can call this.
import { preflight, requireUser, validateBody, json, serverError, serviceClient, z } from "../_shared/http.ts";
import { hasCapability, denyResponse } from "../_shared/permissions.ts";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";
import { runPublicationGuard } from "../_shared/layout/index.ts";

const Body = z.object({
  work_id: z.string().uuid(),
  edition_kind: z.string().default("primary"),
  language: z.string().default("en"),
  integrity_level: z.enum(["draft", "standard", "verified", "certified"]).default("standard"),
  notes: z.string().max(2000).optional(),
  override_typography_blockers: z.boolean().default(false),
});

type Service = ReturnType<typeof serviceClient>;
type PublicationGate = "structural" | "rights" | "production";

async function latestGatePassed(sc: Service, bookId: string, scopeHash: string, gate: PublicationGate): Promise<boolean> {
  const { data, error } = await sc
    .from("publication_gate_attestations")
    .select("status")
    .eq("book_id", bookId)
    .eq("gate", gate)
    .eq("scope", "book")
    .eq("scope_hash", scopeHash)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.status === "passed";
}

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
    if (!book?.id) return json({ error: "publication_blocked", reason: "book_record_required" }, 409);

    // Pull display_name for each rights holder. Rights holders remain distinct
    // from publisher/imprint identity; a copyright owner is not automatically a publisher.
    const holderIds = [...new Set((rights ?? []).map((r) => r.rights_holder_id).filter(Boolean))];
    const { data: holders } = holderIds.length
      ? await sc.from("rights_holders").select("id, display_name, holder_type, country_code").in("id", holderIds)
      : { data: [] as Array<{ id: string; display_name: string; holder_type: string; country_code: string | null }> };

    let chapters: Array<{ id: string; chapter_number: number; title: string }> = [];
    let chaptersForGuard: Array<{ id: string; chapter_number: number; title: string; content: string }> = [];
    const { data: ch } = await sc
      .from("chapters")
      .select("id, chapter_number, title, content")
      .eq("book_id", book.id)
      .order("chapter_number");
    chapters = (ch ?? []).map((c) => ({ id: c.id, chapter_number: c.chapter_number, title: c.title }));
    chaptersForGuard = (ch ?? []).map((c) => ({
      id: c.id, chapter_number: c.chapter_number, title: c.title ?? "", content: c.content ?? "",
    }));

    // P0 Typography & Pagination Guard — refuse certification with blockers.
    const guard = runPublicationGuard(chaptersForGuard);
    if (!guard.publicationReady && !body.override_typography_blockers) {
      await logAuthorshipEvent(sc, {
        workId: body.work_id, bookId: book.id, userId: auth.userId,
        action: "denied", allowed: false, reason: "typography_blockers",
        metadata: { blockerCount: guard.report.blockerCount, score: guard.report.validationScore },
      });
      return json({
        error: "publication_blocked",
        reason: "typography_blockers",
        validation_report: guard.report,
      }, 409);
    }

    // Server-authoritative trust gate. Do not let the older Work publishing path
    // mint a publication that bypasses the current book-level trust engine.
    const { data: scopeHash, error: hashErr } = await sc.rpc("compute_book_publication_hash", { p_book_id: book.id });
    if (hashErr) return serverError(hashErr);
    if (typeof scopeHash !== "string" || scopeHash.length !== 64) {
      return json({ error: "publication_blocked", reason: "publication_hash_unavailable" }, 409);
    }

    const [{ data: baseReady, error: readyErr }, structuralPassed, rightsPassed, productionPassed] = await Promise.all([
      sc.rpc("has_current_publication_attestations", { p_book_id: book.id }),
      latestGatePassed(sc, book.id, scopeHash, "structural"),
      latestGatePassed(sc, book.id, scopeHash, "rights"),
      latestGatePassed(sc, book.id, scopeHash, "production"),
    ]);
    if (readyErr) return serverError(readyErr);
    if (baseReady !== true || !structuralPassed || !rightsPassed || !productionPassed) {
      const blockers = [
        baseReady !== true ? "current editorial/evidence/publishability attestations" : null,
        !structuralPassed ? "cross-chapter structural consistency" : null,
        !rightsPassed ? "asset/cover publication rights" : null,
        !productionPassed ? "rendered production artifact" : null,
      ].filter(Boolean);
      return json({
        error: "publication_blocked",
        reason: "publication_trust_gates",
        blockers,
        scope_hash: scopeHash,
      }, 409);
    }

    // Canonical publisher/imprint identity is required BEFORE the immutable
    // publication snapshot is minted. This separates publisher from rights holder.
    const { data: publishingProfile, error: profileErr } = await sc
      .from("book_publishing_profiles")
      .select("imprint_id,publisher_mode,edition_label,publication_language,print_identifier_strategy,ebook_identifier_strategy,distribution_scope")
      .eq("book_id", book.id)
      .maybeSingle();
    if (profileErr) return serverError(profileErr);
    if (!publishingProfile) {
      return json({ error: "publication_blocked", reason: "publishing_identity_required" }, 409);
    }

    let publisherSnapshot: Record<string, unknown>;
    if (publishingProfile.publisher_mode === "kdp_independent") {
      if (publishingProfile.print_identifier_strategy !== "kdp_free" || publishingProfile.distribution_scope !== "kdp_only") {
        return json({ error: "publication_blocked", reason: "invalid_kdp_independent_profile" }, 409);
      }
      publisherSnapshot = {
        mode: "kdp_independent",
        publisher_name: null,
        imprint_name: "Independently published",
        country_code: null,
        isbn_agency_name: null,
        registrant_name: null,
        verification: "kdp_free_isbn_at_submission",
      };
    } else {
      if (!publishingProfile.imprint_id) {
        return json({ error: "publication_blocked", reason: "publisher_imprint_required" }, 409);
      }
      const { data: imprint, error: imprintErr } = await sc
        .from("publishing_imprints")
        .select("id,scope,owner_user_id,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name,agency_record_attested,verified,verified_at")
        .eq("id", publishingProfile.imprint_id)
        .maybeSingle();
      if (imprintErr) return serverError(imprintErr);
      if (!imprint) return json({ error: "publication_blocked", reason: "publisher_imprint_missing" }, 409);

      if (publishingProfile.publisher_mode === "own_imprint") {
        if (imprint.scope !== "user" || imprint.owner_user_id !== auth.userId || imprint.agency_record_attested !== true) {
          return json({ error: "publication_blocked", reason: "isbn_agency_match_attestation_required" }, 409);
        }
      } else if (publishingProfile.publisher_mode === "platform_imprint") {
        if (imprint.scope !== "platform" || imprint.verified !== true) {
          return json({ error: "publication_blocked", reason: "verified_platform_imprint_required" }, 409);
        }
      } else {
        return json({ error: "publication_blocked", reason: "unknown_publisher_mode" }, 409);
      }

      publisherSnapshot = {
        mode: publishingProfile.publisher_mode,
        imprint_id: imprint.id,
        publisher_name: imprint.publisher_name,
        imprint_name: imprint.imprint_name,
        country_code: imprint.country_code,
        isbn_agency_name: imprint.isbn_agency_name,
        registrant_name: imprint.registrant_name,
        verification: publishingProfile.publisher_mode === "platform_imprint" ? "platform_verified" : "user_attested_agency_match",
        verified_at: publishingProfile.publisher_mode === "platform_imprint" ? imprint.verified_at : null,
      };
    }

    const { data: isbnAssignments, error: assignmentsErr } = await sc
      .from("book_isbn_assignments")
      .select("id,isbn_id,product_form,language,edition_label,assigned_at,locked_at")
      .eq("book_id", book.id)
      .order("product_form");
    if (assignmentsErr) return serverError(assignmentsErr);

    const isbnIds = [...new Set((isbnAssignments ?? []).map((a) => a.isbn_id).filter(Boolean))];
    const inventoryMap = new Map<string, { isbn13: string; source: string; imprint_id: string }>();
    if (isbnIds.length > 0) {
      const { data: inventory, error: inventoryErr } = await sc
        .from("isbn_inventory")
        .select("id,isbn13,source,imprint_id")
        .in("id", isbnIds);
      if (inventoryErr) return serverError(inventoryErr);
      for (const row of inventory ?? []) inventoryMap.set(row.id, row);
    }

    const identifiers = (isbnAssignments ?? []).map((assignment) => {
      const inventory = inventoryMap.get(assignment.isbn_id);
      if (!inventory) throw new Error(`ISBN inventory missing for assignment ${assignment.id}`);
      if (publishingProfile.imprint_id && inventory.imprint_id !== publishingProfile.imprint_id) {
        throw new Error(`ISBN imprint mismatch for assignment ${assignment.id}`);
      }
      return {
        scheme: "ISBN-13",
        value: inventory.isbn13,
        product_form: assignment.product_form,
        language: assignment.language,
        edition_label: assignment.edition_label,
        source: inventory.source,
        assigned_at: assignment.assigned_at,
      };
    });

    const isbnByFormat: Record<string, string> = {};
    for (const identifier of identifiers) isbnByFormat[identifier.product_form] = identifier.value;

    // If a strategy says a real ISBN is required, do not freeze an incomplete
    // identity. KDP-free is intentionally different: Amazon assigns it during submission.
    if (publishingProfile.print_identifier_strategy === "own_isbn" || publishingProfile.print_identifier_strategy === "platform_isbn") {
      if (!isbnByFormat.paperback && !isbnByFormat.hardcover) {
        return json({ error: "publication_blocked", reason: "print_isbn_assignment_required" }, 409);
      }
    }
    if (publishingProfile.ebook_identifier_strategy === "own_isbn" || publishingProfile.ebook_identifier_strategy === "platform_isbn") {
      if (!isbnByFormat.epub) {
        return json({ error: "publication_blocked", reason: "epub_isbn_assignment_required" }, 409);
      }
    }

    // Freeze design snapshot (Publisher Design System).
    const design_snapshot = (book.design_settings as Record<string, unknown> | null) ?? null;

    // Freeze citations snapshot (Evidence & Citation Engine).
    let citations_snapshot: unknown[] = [];
    const { data: cites } = await sc
      .from("book_citations")
      .select("id, citation_key, source_type, citation_text, authors, publisher, container_title, volume, issue, pages, doi, isbn, url, accessed_at, publication_date, confidence")
      .eq("book_id", book.id);
    citations_snapshot = cites ?? [];

    const printCompatibilityIsbn = isbnByFormat.paperback ?? isbnByFormat.hardcover ?? null;
    const snapshot = {
      title: work.title,
      language: publishingProfile.publication_language || work.original_language || body.language,
      edition: publishingProfile.edition_label,
      publisher: publisherSnapshot,
      publisher_name: publisherSnapshot.publisher_name ?? null,
      publisher_imprint: publisherSnapshot.imprint_name ?? null,
      identifiers,
      isbn_by_format: isbnByFormat,
      // Legacy compatibility is intentionally PRINT-only. Exporters must use
      // isbn_by_format/identifiers for format-specific selection.
      isbn: printCompatibilityIsbn,
      isbn_13: printCompatibilityIsbn,
      print_identifier_strategy: publishingProfile.print_identifier_strategy,
      ebook_identifier_strategy: publishingProfile.ebook_identifier_strategy,
      distribution_scope: publishingProfile.distribution_scope,
      authors: authors ?? [],
      rights_holders: holders ?? [],
      rights: rights ?? [],
      chapters,
      design: design_snapshot,
      citations: citations_snapshot,
      publication_trust: {
        scope_hash: scopeHash,
        structural: "passed",
        rights: "passed",
        production: "passed",
      },
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

    // Two-phase publication: mint an approved immutable candidate first. ISBNs
    // are locked before the row becomes publicly published. If locking/certification
    // fails, the candidate never masquerades as a completed publication.
    const { data: pub, error: pubErr } = await sc
      .from("publications")
      .insert({
        work_id: body.work_id,
        edition_kind: body.edition_kind,
        language: publishingProfile.publication_language || body.language,
        version,
        semver_major: major, semver_minor: minor, semver_patch: patch,
        status: "approved",
        integrity_level: body.integrity_level,
        snapshot,
        design_snapshot,
        content_hash: contentHash,
        published_at: null,
        published_by: auth.userId,
        notes: body.notes ?? null,
      })
      .select("id, version, content_hash")
      .single();
    if (pubErr) throw pubErr;

    const { error: lockErr } = await sc.rpc("lock_book_isbn_assignments", {
      p_book_id: book.id,
      p_publication_id: pub.id,
    });
    if (lockErr) return serverError(lockErr);

    const { data: cert, error: certErr } = await sc
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
    if (certErr) return serverError(certErr);

    const publishedAt = new Date().toISOString();
    const { error: publishErr } = await sc
      .from("publications")
      .update({
        status: "published",
        published_at: publishedAt,
        certificate_id: cert.id,
      })
      .eq("id", pub.id)
      .eq("status", "approved");
    if (publishErr) return serverError(publishErr);

    await sc.from("works").update({
      current_publication_id: pub.id,
      publish_locked_at: publishedAt,
      publish_locked_by: auth.userId,
      publish_lock_reason: "published",
    }).eq("id", body.work_id);

    await sc.from("books").update({
      current_publication_id: pub.id,
      publish_locked_at: publishedAt,
      publish_locked_by: auth.userId,
    }).eq("id", book.id);

    await logAuthorshipEvent(sc, {
      workId: body.work_id, bookId: book.id, publicationId: pub.id,
      userId: auth.userId, action: "publish", allowed: true,
      metadata: {
        version,
        integrity_level: body.integrity_level,
        content_hash: contentHash,
        publisher_mode: publishingProfile.publisher_mode,
        identifier_product_forms: identifiers.map((i) => i.product_form),
      },
    });

    return json({
      publication_id: pub.id,
      certificate_id: cert.id,
      version,
      content_hash: contentHash,
      published_at: publishedAt,
      publisher: publisherSnapshot,
      identifiers,
    });
  } catch (e) {
    return serverError(e);
  }
});