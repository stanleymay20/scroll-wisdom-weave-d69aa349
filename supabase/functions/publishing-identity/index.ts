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
    action: z.literal("upsert_platform_imprint"),
    imprintId: z.string().uuid().optional(),
    publisherName: z.string().trim().min(1).max(200),
    imprintName: z.string().trim().min(1).max(100),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
    isbnAgencyName: z.string().trim().min(1).max(200),
    registrantName: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("add_platform_pool"),
    imprintId: z.string().uuid(),
    isbns: z.array(z.string().min(10).max(40)).min(1).max(200),
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
      .select("id,scope,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name,agency_record_attested,verified,verified_at")
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
      .select("id,isbn13,source,status,imprint_id")
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
  }));

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
      .eq("status", "available");
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
        verified: true,
        verified_at: new Date().toISOString(),
      };
      const query = body.imprintId
        ? sc.from("publishing_imprints").update(payload).eq("id", body.imprintId)
        : sc.from("publishing_imprints").insert(payload);
      const { data, error } = await query.select("id,publisher_name,imprint_name,country_code,verified").single();
      if (error) return serverError(error);
      return json({ success: true, imprint: data });
    }

    if (body.action === "add_platform_pool") {
      if (!(await requireAdmin(sc, auth.userId))) return forbidden("Administrator role required");
      const { data: imprint, error: imprintErr } = await sc
        .from("publishing_imprints")
        .select("id,scope,verified")
        .eq("id", body.imprintId)
        .maybeSingle();
      if (imprintErr) return serverError(imprintErr);
      if (!imprint || imprint.scope !== "platform" || imprint.verified !== true) {
        return badRequest("A verified platform imprint is required");
      }
      const normalized = [...new Set(body.isbns.map(normalizeIsbn13))];
      const invalid = normalized.filter((isbn) => !isValidIsbn13(isbn));
      if (invalid.length > 0) return badRequest(`Invalid ISBN-13: ${invalid.slice(0, 5).join(", ")}`);
      const rows = normalized.map((isbn13) => ({
        imprint_id: body.imprintId,
        isbn13,
        source: "platform_pool",
        status: "available",
        added_by: auth.userId,
      }));
      const { data, error } = await sc
        .from("isbn_inventory")
        .upsert(rows, { onConflict: "isbn13", ignoreDuplicates: true })
        .select("isbn13");
      if (error) return serverError(error);
      return json({ success: true, accepted: data?.length ?? 0, supplied: normalized.length });
    }

    const authz = await authorizeBook(sc, body.bookId, auth.userId);
    if (!authz.found) return badRequest("Book not found");
    if (!authz.authorized) return forbidden("Not the owner of this book");

    if (body.action === "save_profile") {
      let imprintId: string | null = null;
      let publisherMode = body.publisherMode;
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
          .select("id,scope,verified")
          .eq("id", body.platformImprintId)
          .maybeSingle();
        if (error) return serverError(error);
        if (!platform || platform.scope !== "platform" || platform.verified !== true) {
          return badRequest("Selected platform imprint is not verified");
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
      if (error) {
        const status = /ISBN_POOL_EMPTY/.test(error.message ?? "") ? 409 : 409;
        return json({ error: error.message, code: error.code }, status);
      }
      return json({ success: true, assignment: data?.[0] ?? null });
    }

    return badRequest("Unsupported action");
  } catch (error) {
    return serverError(error);
  }
});
