// publish-work
// Mint an immutable Publication snapshot for a Work and apply the
// publish-lock to authorship/rights. Only the owner can call this.
import { preflight, requireUser, validateBody, json, serverError, serviceClient, z } from "../_shared/http.ts";
import { hasCapability, denyResponse } from "../_shared/permissions.ts";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";
import { runPublicationGuard } from "../_shared/layout/index.ts";
import { newScrollIdentifier } from "../_shared/scroll-identity.ts";

const Body = z.object({
  work_id: z.string().uuid(),
  edition_kind: z.enum(["original", "translation", "revision", "adaptation", "student_edition", "executive_edition", "audiobook_edition", "print_edition"]).default("original"),
  language: z.string().default("en"),
  notes: z.string().max(2000).optional(),
  override_typography_blockers: z.boolean().default(false),
});

type Service = ReturnType<typeof serviceClient>;
type PublicationGate = "structural" | "rights" | "production";
const PUBLISHED_INTEGRITY = "verified_published" as const;

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
      sc.from("works").select("id, title, original_language, scroll_work_id").eq("id", body.work_id).maybeSingle(),
      sc.from("work_authors").select("user_id, display_name, author_role, sort_order, contribution_percentage").eq("work_id", body.work_id).order("sort_order"),
      sc.from("work_rights").select("rights_holder_id, rights_class, rights_scope, territory, language").eq("work_id", body.work_id),
      sc.from("books").select("id, title, design_settings").eq("work_id", body.work_id).maybeSingle(),
    ]);
    if (!work) return json({ error: "work_not_found" }, 404);
    if (!book?.id) return json({ error: "publication_blocked", reason: "book_record_required" }, 409);
    if (typeof work.scroll_work_id !== "string" || !work.scroll_work_id.startsWith("SLW-")) {
      return json({ error: "publication_blocked", reason: "scroll_work_identity_required" }, 409);
    }
    const scrollEditionId = newScrollIdentifier("SLE");

    // Subtitle is bibliographic identity, not mutable storefront decoration.
    const { data: listingIdentity, error: listingIdentityErr } = await sc
      .from("public_listings")
      .select("subtitle")
      .eq("book_id", book.id)
      .maybeSingle();
    if (listingIdentityErr) return serverError(listingIdentityErr);

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
    // publication snapshot is minted. Publisher ownership and ISBN provenance
    // must already have passed the server-owned verification workflow.
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
        .select("id,scope,owner_user_id,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name,agency_record_attested,verified,verified_at,verification_reference,verification_method")
        .eq("id", publishingProfile.imprint_id)
        .maybeSingle();
      if (imprintErr) return serverError(imprintErr);
      if (!imprint) return json({ error: "publication_blocked", reason: "publisher_imprint_missing" }, 409);

      if (publishingProfile.publisher_mode === "own_imprint") {
        if (imprint.scope !== "user" || imprint.owner_user_id !== auth.userId || imprint.agency_record_attested !== true) {
          return json({ error: "publication_blocked", reason: "isbn_agency_match_attestation_required" }, 409);
        }
        if (imprint.verified !== true || !imprint.verification_reference) {
          return json({ error: "publication_blocked", reason: "isbn_imprint_verification_required" }, 409);
        }
      } else if (publishingProfile.publisher_mode === "platform_imprint") {
        if (imprint.scope !== "platform" || imprint.verified !== true || !imprint.verification_reference) {
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
        verification: publishingProfile.publisher_mode === "platform_imprint"
          ? "platform_agency_verified"
          : "user_imprint_agency_verified",
        verification_reference: imprint.verification_reference,
        verification_method: imprint.verification_method,
        verified_at: imprint.verified_at,
      };
    }

    const { data: isbnAssignments, error: assignmentsErr } = await sc
      .from("book_isbn_assignments")
      .select("id,isbn_id,product_form,language,edition_label,assigned_at,locked_at")
      .eq("book_id", book.id)
      .order("product_form");
    if (assignmentsErr) return serverError(assignmentsErr);

    const isbnIds = [...new Set((isbnAssignments ?? []).map((a) => a.isbn_id).filter(Boolean))];
    const inventoryMap = new Map<string, {
      isbn13: string;
      source: string;
      imprint_id: string;
      provenance_status: string;
      provenance_reference: string | null;
    }>();
    if (isbnIds.length > 0) {
      const { data: inventory, error: inventoryErr } = await sc
        .from("isbn_inventory")
        .select("id,isbn13,source,imprint_id,provenance_status,provenance_reference")
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
      if (inventory.provenance_status !== "verified" || !inventory.provenance_reference) {
        throw new Error(`ISBN provenance not verified for assignment ${assignment.id}`);
      }
      return {
        scheme: "ISBN-13",
        value: inventory.isbn13,
        product_form: assignment.product_form,
        language: assignment.language,
        edition_label: assignment.edition_label,
        source: inventory.source,
        provenance_status: inventory.provenance_status,
        provenance_reference: inventory.provenance_reference,
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
      scroll_work_id: work.scroll_work_id,
      scroll_edition_id: scrollEditionId,
      title: work.title,
      subtitle: listingIdentity?.subtitle ?? null,
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
        publisher_identity: publishingProfile.publisher_mode === "kdp_independent" ? "kdp_managed" : "agency_verified",
        isbn_provenance: identifiers.length > 0 ? "verified" : "not_applicable",
      },
      frozen_at: new Date().toISOString(),
    };

    // Compute SHA-256 over canonical snapshot JSON. This remains the immutable
    // artifact hash; the database derives a separate retry key that excludes
    // only the newly-generated scroll edition id and freeze timestamp.
    const enc = new TextEncoder().encode(JSON.stringify(snapshot));
    const hashBuf = await crypto.subtle.digest("SHA-256", enc);
    const contentHash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const publicationLanguage = publishingProfile.publication_language || body.language;

    // Database-owned minting serializes version allocation, re-checks current
    // trust/publishing identity inside the transaction, finalizes ISBN locks and
    // certification atomically, and returns the original Publication on a safe
    // retry of the same frozen publishing state.
    const { data: mintData, error: mintErr } = await sc.rpc("mint_verified_publication_release", {
      p_user_id: auth.userId,
      p_work_id: body.work_id,
      p_book_id: book.id,
      p_scroll_edition_id: scrollEditionId,
      p_edition_kind: body.edition_kind,
      p_language: publicationLanguage,
      p_snapshot: snapshot,
      p_design_snapshot: design_snapshot,
      p_content_hash: contentHash,
      p_notes: body.notes ?? null,
    });
    if (mintErr) return serverError(mintErr);

    const mint = (mintData ?? {}) as Record<string, unknown>;
    const publicationId = typeof mint.publication_id === "string" ? mint.publication_id : null;
    const certificateId = typeof mint.certificate_id === "string" ? mint.certificate_id : null;
    const version = typeof mint.version === "string" ? mint.version : null;
    const publishedAt = typeof mint.published_at === "string" ? mint.published_at : null;
    const publishedContentHash = typeof mint.content_hash === "string" ? mint.content_hash : null;
    const publishedScrollEditionId = typeof mint.scroll_edition_id === "string" ? mint.scroll_edition_id : null;
    const scrollIdentity = mint.scroll_identity ?? null;
    const idempotentRetry = mint.idempotent === true;
    if (!publicationId || !certificateId || !version || !publishedAt || !publishedContentHash || !publishedScrollEditionId) {
      return serverError(new Error("PUBLICATION_MINT_INCOMPLETE"));
    }

    await logAuthorshipEvent(sc, {
      workId: body.work_id, bookId: book.id, publicationId,
      userId: auth.userId, action: "publish", allowed: true,
      metadata: {
        version,
        integrity_level: PUBLISHED_INTEGRITY,
        content_hash: publishedContentHash,
        publisher_mode: publishingProfile.publisher_mode,
        identifier_product_forms: identifiers.map((i) => i.product_form),
        isbn_provenance: identifiers.map((i) => ({
          product_form: i.product_form,
          status: i.provenance_status,
          reference: i.provenance_reference,
        })),
        scroll_work_id: work.scroll_work_id,
        scroll_edition_id: publishedScrollEditionId,
        scroll_products: scrollIdentity,
        idempotent_retry: idempotentRetry,
      },
    });

    return json({
      publication_id: publicationId,
      certificate_id: certificateId,
      version,
      content_hash: publishedContentHash,
      published_at: publishedAt,
      publisher: publisherSnapshot,
      scroll_identity: scrollIdentity,
      identifiers,
      idempotent: idempotentRetry,
    });
  } catch (e) {
    return serverError(e);
  }
});