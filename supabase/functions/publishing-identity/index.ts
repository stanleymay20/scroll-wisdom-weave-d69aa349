import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  preflight,
  json,
  badRequest,
  forbidden,
  serverError,
  requireUser,
  validateBody,
  z,
  serviceClient,
  enforceRateLimit,
} from "../_shared/http.ts";
import { isValidIsbn13, normalizeIsbn13 } from "../_shared/isbn.ts";

const ProductForm = z.enum(["paperback", "hardcover", "epub", "pdf", "audiobook"]);
const PublisherMode = z.enum(["own_imprint", "platform_imprint", "kdp_independent"]);
const PrintStrategy = z.enum(["own_isbn", "platform_isbn", "kdp_free", "unassigned"]);
const EbookStrategy = z.enum(["own_isbn", "platform_isbn", "unassigned"]);
const DistributionScope = z.enum(["global", "kdp_only", "direct_only"]);
const ClaimStatus = z.enum(["pending", "approved", "rejected", "cancelled"]);

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get"), bookId: z.string().uuid() }),
  z.object({
    action: z.literal("save_profile"),
    bookId: z.string().uuid(),
    publisherMode: PublisherMode,
    publisherName: z.string().trim().min(1).max(200).optional(),
    imprintName: z.string().trim().min(1).max(100).optional(),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).optional(),
    isbnAgencyName: z.string().trim().max(200).optional(),
    registrantName: z.string().trim().max(200).optional(),
    confirmAgencyMatch: z.boolean().optional(),
    platformImprintId: z.string().uuid().optional(),
    editionLabel: z.string().trim().min(1).max(120).default("First edition"),
    language: z.string().trim().min(2).max(20).default("en"),
    printIdentifierStrategy: PrintStrategy.default("unassigned"),
    ebookIdentifierStrategy: EbookStrategy.default("unassigned"),
    distributionScope: DistributionScope.default("global"),
  }),
  z.object({
    action: z.literal("submit_owned_isbn_claim"),
    bookId: z.string().uuid(),
    isbn13: z.string().min(10).max(40),
    agencyReference: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("assign_owned_isbn"),
    bookId: z.string().uuid(),
    isbn13: z.string().min(10).max(40),
    productForm: ProductForm,
    language: z.string().trim().min(2).max(20).default("en"),
    editionLabel: z.string().trim().min(1).max(120).default("First edition"),
  }),
  z.object({
    action: z.literal("allocate_platform_isbn"),
    bookId: z.string().uuid(),
    productForm: ProductForm,
    language: z.string().trim().min(2).max(20).default("en"),
    editionLabel: z.string().trim().min(1).max(120).default("First edition"),
  }),
  z.object({
    action: z.literal("review_imprint"),
    imprintId: z.string().uuid(),
    approved: z.boolean(),
    verificationReference: z.string().trim().min(1).max(500),
    verificationMethod: z.string().trim().min(1).max(120).default("manual_agency_record_review"),
    notes: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("review_owned_isbn_claim"),
    claimId: z.string().uuid(),
    approved: z.boolean(),
    notes: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("list_isbn_claims"),
    status: ClaimStatus.default("pending"),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  z.object({
    action: z.literal("upsert_platform_imprint"),
    imprintId: z.string().uuid().optional(),
    publisherName: z.string().trim().min(1).max(200),
    imprintName: z.string().trim().min(1).max(100),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
    isbnAgencyName: z.string().trim().min(1).max(200),
    registrantName: z.string().trim().min(1).max(200),
    verificationReference: z.string().trim().min(1).max(500),
    verificationMethod: z.string().trim().min(1).max(120).default("agency_allocation_record"),
    verificationNotes: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("add_platform_pool"),
    imprintId: z.string().uuid(),
    isbns: z.array(z.string().min(10).max(40)).min(1).max(200),
    provenanceReference: z.string().trim().min(1).max(500),
  }),
]);

type Service = ReturnType<typeof serviceClient>;

async function authorizeBook(sc: Service, bookId: string, userId: string) {
  const { data: book, error } = await sc
    .from("books")
    .select("id,user_id,creator_id,title")
    .eq("id", bookId)
    .maybeSingle();
  if (error) throw error;
  if (!book) return { found: false, authorized: false, book: null };
  let authorized = book.user_id === userId || book.creator_id === userId;
  if (!authorized) {
    const { data: admin, error: adminErr } = await sc
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminErr) throw adminErr;
    authorized = !!admin;
  }
  return { found: true, authorized, book };
}

async function requireAdmin(sc: Service, userId: string): Promise<boolean> {
  const { data, error } = await sc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function getIdentity(sc: Service, bookId: string, userId: string) {
  const authz = await authorizeBook(sc, bookId, userId);
  if (!authz.found) return { error: "Book not found", status: 404 } as const;
  if (!authz.authorized) return { error: "Not the owner of this book", status: 403 } as const;

  const { data: profile, error: profileErr } = await sc
    .from("book_publishing_profiles")
    .select("book_id,imprint_id,publisher_mode,edition_label,publication_language,print_identifier_strategy,ebook_identifier_strategy,distribution_scope,updated_at")
    .eq("book_id", bookId)
    .maybeSingle();
  if (profileErr) throw profileErr;

  let imprint: Record<string, unknown> | null = null;
  if (profile?.imprint_id) {
    const { data, error } = await sc
      .from("publishing_imprints")
      .select("id,scope,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name,agency_record_attested,verified,verified_at,verification_reference,verification_method")
      .eq("id", profile.imprint_id)
      .maybeSingle();
    if (error) throw error;
    imprint = data;
  }

  const { data: assignmentRows, error: assignmentErr } = await sc
    .from("book_isbn_assignments")
    .select("id,isbn_id,product_form,language,edition_label,assigned_at,locked_at,locked_publication_id")
    .eq("book_id", bookId)
    .order("product_form");
  if (assignmentErr) throw assignmentErr;

  const ids = [...new Set((assignmentRows ?? []).map((row) => row.isbn_id).filter(Boolean))];
  const inventoryMap = new Map<string, Record<string, unknown>>();
  if (ids.length > 0) {
    const { data: inventory, error } = await sc
      .from("isbn_inventory")
      .select("id,isbn13,source,status,imprint_id,provenance_status,provenance_reference")
      .in("id", ids);
    if (error) throw error;
    for (const row of inventory ?? []) inventoryMap.set(row.id, row);
  }

  const assignments = (assignmentRows ?? []).map((row) => ({
    id: row.id,
    productForm: row.product_form,
    language: row.language,
    editionLabel: row.edition_label,
    assignedAt: row.assigned_at,
    lockedAt: row.locked_at,
    publicationId: row.locked_publication_id,
    isbn13: inventoryMap.get(row.isbn_id)?.isbn13 ?? null,
    source: inventoryMap.get(row.isbn_id)?.source ?? null,
    provenanceStatus: inventoryMap.get(row.isbn_id)?.provenance_status ?? null,
  }));

  let isbnClaims: Record<string, unknown>[] = [];
  let ownedIsbns: Record<string, unknown>[] = [];
  if (profile?.publisher_mode === "own_imprint" && profile.imprint_id) {
    const [{ data: claims, error: claimsErr }, { data: owned, error: ownedErr }] = await Promise.all([
      sc.from("isbn_claim_requests")
        .select("id,isbn13,agency_reference,status,reviewed_at,review_notes,created_at")
        .eq("user_id", userId)
        .eq("imprint_id", profile.imprint_id)
        .order("created_at", { ascending: false })
        .limit(50),
      sc.from("isbn_inventory")
        .select("id,isbn13,status,provenance_status,provenance_reference")
        .eq("imprint_id", profile.imprint_id)
        .eq("source", "publisher_owned")
        .eq("claimed_by_user_id", userId)
        .order("created_at"),
    ]);
    if (claimsErr) throw claimsErr;
    if (ownedErr) throw ownedErr;
    isbnClaims = claims ?? [];
    ownedIsbns = owned ?? [];
  }

  const { data: platformImprints, error: platformErr } = await sc
    .from("publishing_imprints")
    .select("id,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name")
    .eq("scope", "platform")
    .eq("verified", true)
    .order("publisher_name");
  if (platformErr) throw platformErr;

  const platformOptions = [];
  for (const row of platformImprints ?? []) {
    const { count, error } = await sc
      .from("isbn_inventory")
      .select("id", { count: "exact", head: true })
      .eq("imprint_id", row.id)
      .eq("source", "platform_pool")
      .eq("status", "available")
      .eq("provenance_status", "verified");
    if (error) throw error;
    platformOptions.push({ ...row, availableIsbns: count ?? 0 });
  }

  return {
    status: 200,
    data: {
      book: { id: authz.book!.id, title: authz.book!.title },
      profile,
      imprint,
      assignments,
      isbnClaims,
      ownedIsbns,
      platformImprints: platformOptions,
    },
  } as const;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const rate = enforceRateLimit({ name: "publishing-identity", key: auth.userId, limit: 40, windowSec: 60 });
    if (rate) return rate;
    const sc = serviceClient();

    if (body.action === "get") {
      const result = await getIdentity(sc, body.bookId, auth.userId);
      if ("error" in result) return json({ error: result.error }, result.status);
      return json(result.data);
    }

    if (body.action === "list_isbn_claims") {
      if (!(await requireAdmin(sc, auth.userId))) return forbidden("Administrator role required");
      const { data, error } = await sc
        .from("isbn_claim_requests")
        .select("id,user_id,imprint_id,isbn13,agency_reference,status,reviewed_by,reviewed_at,review_notes,created_at,updated_at")
        .eq("status", body.status)
        .order("created_at", { ascending: true })
        .limit(body.limit ?? 100);
      if (error) return serverError(error);
      return json({ claims: data ?? [] });
    }

    if (body.action === "review_imprint") {
      if (!(await requireAdmin(sc, auth.userId))) return forbidden("Administrator role required");
      const { data, error } = await sc.rpc("review_publishing_imprint", {
        p_admin_user_id: auth.userId,
        p_imprint_id: body.imprintId,
        p_approved: body.approved,
        p_verification_reference: body.verificationReference,
        p_notes: body.notes ?? null,
        p_verification_method: body.verificationMethod,
      });
      if (error) return json({ error: error.message, code: error.code }, 409);
      return json({ success: true, review: data });
    }

    if (body.action === "review_owned_isbn_claim") {
      if (!(await requireAdmin(sc, auth.userId))) return forbidden("Administrator role required");
      const { data, error } = await sc.rpc("review_owned_isbn_claim", {
        p_admin_user_id: auth.userId,
        p_claim_id: body.claimId,
        p_approved: body.approved,
        p_review_notes: body.notes ?? null,
      });
      if (error) return json({ error: error.message, code: error.code }, 409);
      return json({ success: true, review: data });
    }

    if (body.action === "upsert_platform_imprint") {
      if (!(await requireAdmin(sc, auth.userId))) return forbidden("Administrator role required");
      const payload = {
        owner_user_id: null,
        scope: "platform",
        publisher_name: body.publisherName,
        imprint_name: body.imprintName,
        country_code: body.countryCode.toUpperCase(),
        isbn_agency_name: body.isbnAgencyName,
        registrant_name: body.registrantName,
        agency_record_attested: true,
        agency_record_attested_at: new Date().toISOString(),
        agency_record_attested_by: auth.userId,
        verified: false,
        verified_at: null,
      };
      const query = body.imprintId
        ? sc.from("publishing_imprints").update(payload).eq("id", body.imprintId)
        : sc.from("publishing_imprints").insert(payload);
      const { data: imprint, error } = await query
        .select("id,publisher_name,imprint_name,country_code,verified")
        .single();
      if (error) return serverError(error);

      const { data: review, error: reviewErr } = await sc.rpc("review_publishing_imprint", {
        p_admin_user_id: auth.userId,
        p_imprint_id: imprint.id,
        p_approved: true,
        p_verification_reference: body.verificationReference,
        p_notes: body.verificationNotes ?? null,
        p_verification_method: body.verificationMethod,
      });
      if (reviewErr) return json({ error: reviewErr.message, code: reviewErr.code }, 409);
      return json({ success: true, imprint: { ...imprint, verified: true }, verification: review });
    }

    if (body.action === "add_platform_pool") {
      if (!(await requireAdmin(sc, auth.userId))) return forbidden("Administrator role required");
      const { data: imprint, error: imprintErr } = await sc
        .from("publishing_imprints")
        .select("id,scope,verified,verification_reference")
        .eq("id", body.imprintId)
        .maybeSingle();
      if (imprintErr) return serverError(imprintErr);
      if (!imprint || imprint.scope !== "platform" || imprint.verified !== true || !imprint.verification_reference) {
        return badRequest("A provenance-verified platform imprint is required");
      }

      const normalized = [...new Set(body.isbns.map(normalizeIsbn13))];
      const invalid = normalized.filter((isbn) => !isValidIsbn13(isbn));
      if (invalid.length > 0) return badRequest(`Invalid ISBN-13: ${invalid.slice(0, 5).join(", ")}`);

      const { data: existing, error: existingErr } = await sc
        .from("isbn_inventory")
        .select("isbn13,imprint_id,source")
        .in("isbn13", normalized);
      if (existingErr) return serverError(existingErr);
      const conflict = (existing ?? []).find((row) => row.imprint_id !== body.imprintId || row.source !== "platform_pool");
      if (conflict) {
        return json({ error: `ISBN_ALREADY_REGISTERED:${conflict.isbn13}`, code: "isbn_conflict" }, 409);
      }

      const now = new Date().toISOString();
      if ((existing?.length ?? 0) > 0) {
        const existingNumbers = (existing ?? []).map((row) => row.isbn13);
        const { error: verifyErr } = await sc
          .from("isbn_inventory")
          .update({
            provenance_status: "verified",
            provenance_reference: body.provenanceReference,
            provenance_verified_at: now,
            provenance_verified_by: auth.userId,
          })
          .eq("imprint_id", body.imprintId)
          .eq("source", "platform_pool")
          .in("isbn13", existingNumbers);
        if (verifyErr) return serverError(verifyErr);
      }

      const existingSet = new Set((existing ?? []).map((row) => row.isbn13));
      const rows = normalized
        .filter((isbn13) => !existingSet.has(isbn13))
        .map((isbn13) => ({
          imprint_id: body.imprintId,
          isbn13,
          source: "platform_pool",
          status: "available",
          added_by: auth.userId,
          provenance_status: "verified",
          provenance_reference: body.provenanceReference,
          provenance_verified_at: now,
          provenance_verified_by: auth.userId,
          claimed_by_user_id: null,
        }));

      if (rows.length > 0) {
        const { error } = await sc.from("isbn_inventory").insert(rows);
        if (error) return serverError(error);
      }
      return json({ success: true, accepted: normalized.length, supplied: normalized.length, provenanceVerified: true });
    }

    const bookId = "bookId" in body ? body.bookId : null;
    if (!bookId) return badRequest("Book id required");
    const authz = await authorizeBook(sc, bookId, auth.userId);
    if (!authz.found) return badRequest("Book not found");
    if (!authz.authorized) return forbidden("Not the owner of this book");

    if (body.action === "save_profile") {
      let imprintId: string | null = null;
      const publisherMode = body.publisherMode;
      let printStrategy = body.printIdentifierStrategy;
      let ebookStrategy = body.ebookIdentifierStrategy;
      let distributionScope = body.distributionScope;

      if (publisherMode === "kdp_independent") {
        printStrategy = "kdp_free";
        ebookStrategy = "unassigned";
        distributionScope = "kdp_only";
      } else if (publisherMode === "platform_imprint") {
        if (!body.platformImprintId) return badRequest("Select a verified platform imprint");
        const { data: platform, error } = await sc
          .from("publishing_imprints")
          .select("id,scope,verified,verification_reference")
          .eq("id", body.platformImprintId)
          .maybeSingle();
        if (error) return serverError(error);
        if (!platform || platform.scope !== "platform" || platform.verified !== true || !platform.verification_reference) {
          return badRequest("Selected platform imprint is not provenance-verified");
        }
        const { count: availablePool, error: poolErr } = await sc
          .from("isbn_inventory")
          .select("id", { count: "exact", head: true })
          .eq("imprint_id", platform.id)
          .eq("source", "platform_pool")
          .eq("status", "available")
          .eq("provenance_status", "verified");
        if (poolErr) return serverError(poolErr);
        if (!availablePool) {
          return badRequest("ScrollLibrary Press ISBN inventory is currently unavailable");
        }
        imprintId = platform.id;
      } else {
        if (!body.publisherName || !body.imprintName || body.confirmAgencyMatch !== true) {
          return badRequest("Publisher name, imprint name and ISBN-agency match confirmation are required");
        }
        const country = body.countryCode?.toUpperCase() ?? null;
        const { data: existing, error: existingErr } = await sc
          .from("publishing_imprints")
          .select("id")
          .eq("scope", "user")
          .eq("owner_user_id", auth.userId)
          .eq("publisher_name", body.publisherName)
          .eq("imprint_name", body.imprintName)
          .maybeSingle();
        if (existingErr) return serverError(existingErr);

        if (existing) {
          const { error } = await sc
            .from("publishing_imprints")
            .update({
              country_code: country,
              isbn_agency_name: body.isbnAgencyName ?? null,
              registrant_name: body.registrantName ?? null,
              agency_record_attested: true,
              agency_record_attested_at: new Date().toISOString(),
              agency_record_attested_by: auth.userId,
            })
            .eq("id", existing.id);
          if (error) return serverError(error);
          imprintId = existing.id;
        } else {
          const { data, error } = await sc
            .from("publishing_imprints")
            .insert({
              owner_user_id: auth.userId,
              scope: "user",
              publisher_name: body.publisherName,
              imprint_name: body.imprintName,
              country_code: country,
              isbn_agency_name: body.isbnAgencyName ?? null,
              registrant_name: body.registrantName ?? null,
              agency_record_attested: true,
              agency_record_attested_at: new Date().toISOString(),
              agency_record_attested_by: auth.userId,
              verified: false,
            })
            .select("id")
            .single();
          if (error) return serverError(error);
          imprintId = data.id;
        }
      }

      const profile = {
        book_id: body.bookId,
        owner_user_id: auth.userId,
        imprint_id: imprintId,
        publisher_mode: publisherMode,
        edition_label: body.editionLabel,
        publication_language: body.language,
        print_identifier_strategy: printStrategy,
        ebook_identifier_strategy: ebookStrategy,
        distribution_scope: distributionScope,
      };
      const { data, error } = await sc
        .from("book_publishing_profiles")
        .upsert(profile, { onConflict: "book_id" })
        .select("*")
        .single();
      if (error) return serverError(error);

      const { error: compatibilityErr } = await sc
        .from("books")
        .update({ publisher_imprint_id: imprintId, publisher_mode: publisherMode, edition_label: body.editionLabel })
        .eq("id", body.bookId);
      if (compatibilityErr) return serverError(compatibilityErr);
      return json({ success: true, profile: data });
    }

    if (body.action === "submit_owned_isbn_claim") {
      const normalized = normalizeIsbn13(body.isbn13);
      if (!isValidIsbn13(normalized)) return badRequest("Invalid ISBN-13 checksum or prefix");
      const { data, error } = await sc.rpc("submit_owned_isbn_claim", {
        p_user_id: auth.userId,
        p_book_id: body.bookId,
        p_isbn: normalized,
        p_agency_reference: body.agencyReference,
      });
      if (error) return json({ error: error.message, code: error.code }, 409);
      return json({ success: true, claim: data });
    }

    if (body.action === "assign_owned_isbn") {
      const normalized = normalizeIsbn13(body.isbn13);
      if (!isValidIsbn13(normalized)) return badRequest("Invalid ISBN-13 checksum or prefix");
      const { data, error } = await sc.rpc("assign_owned_isbn", {
        p_user_id: auth.userId,
        p_book_id: body.bookId,
        p_isbn: normalized,
        p_product_form: body.productForm,
        p_language: body.language,
        p_edition_label: body.editionLabel,
      });
      if (error) return json({ error: error.message, code: error.code }, 409);
      return json({ success: true, assignment: data?.[0] ?? null });
    }

    if (body.action === "allocate_platform_isbn") {
      const { data, error } = await sc.rpc("allocate_platform_isbn", {
        p_user_id: auth.userId,
        p_book_id: body.bookId,
        p_product_form: body.productForm,
        p_language: body.language,
        p_edition_label: body.editionLabel,
      });
      if (error) return json({ error: error.message, code: error.code }, 409);
      return json({ success: true, assignment: data?.[0] ?? null });
    }

    return badRequest("Unsupported action");
  } catch (error) {
    return serverError(error);
  }
});