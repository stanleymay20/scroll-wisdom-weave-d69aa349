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
  corsHeaders,
} from "../_shared/http.ts";
import { isValidIsbn13, publisherFromPublicationSnapshot } from "../_shared/isbn.ts";
import { renderOnix31Product, validateOnixProduct, type OnixProductInput } from "../_shared/onix.ts";

const ProductForm = z.enum(["paperback", "hardcover", "epub"]);
const BodySchema = z.object({
  bookId: z.string().uuid(),
  productForm: ProductForm,
});

type Service = ReturnType<typeof serviceClient>;
type ProductForm = z.infer<typeof ProductForm>;

async function authorizeBook(sc: Service, bookId: string, userId: string) {
  const { data: book, error } = await sc
    .from("books")
    .select("id,user_id,creator_id,title,current_publication_id")
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

function snapshotString(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function germanyTradeReleaseBlockers(
  sc: Service,
  bookId: string,
  productForm: ProductForm,
  language: string,
  editionLabel: string,
): Promise<string[]> {
  const blockers: string[] = [];

  const { data: profile, error: profileErr } = await sc
    .from("book_publishing_profiles")
    .select("imprint_id,publisher_mode")
    .eq("book_id", bookId)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile || profile.publisher_mode === "kdp_independent" || !profile.imprint_id) {
    blockers.push("verified_publishing_identity");
  }

  if (profile?.imprint_id) {
    const { data: imprint, error: imprintErr } = await sc
      .from("publishing_imprints")
      .select("verified,country_code")
      .eq("id", profile.imprint_id)
      .maybeSingle();
    if (imprintErr) throw imprintErr;
    if (!imprint?.verified) blockers.push("verified_publishing_identity");
    if (imprint?.country_code !== "DE") blockers.push("manual_review_non_de_publisher");
  }

  const { data: assignment, error: assignmentErr } = await sc
    .from("book_isbn_assignments")
    .select("id")
    .eq("book_id", bookId)
    .eq("product_form", productForm)
    .eq("language", language)
    .eq("edition_label", editionLabel)
    .maybeSingle();
  if (assignmentErr) throw assignmentErr;
  if (!assignment) blockers.push("format_specific_isbn_assignment");

  const { data: gatesCurrent, error: gatesErr } = await sc
    .rpc("has_current_publication_attestations", { p_book_id: bookId });
  if (gatesErr) throw gatesErr;
  if (gatesCurrent !== true) blockers.push("current_publication_trust_gates");

  const { data: declaration, error: declarationErr } = await sc
    .from("publication_compliance_declarations")
    .select("german_market_intended,commercial_release,publisher_state_code,publisher_operating_basis_confirmed,imprint_notice_confirmed,dnb_deposit_plan_confirmed,state_deposit_plan_confirmed,direct_sales_enabled,direct_sales_legal_notice_confirmed,packaging_responsibility,lucid_status")
    .eq("book_id", bookId)
    .eq("jurisdiction", "DE")
    .eq("product_form", productForm)
    .eq("language", language)
    .eq("edition_label", editionLabel)
    .maybeSingle();
  if (declarationErr) throw declarationErr;

  if (!declaration) {
    blockers.push("germany_release_declarations");
    return [...new Set(blockers)];
  }

  if (!declaration.german_market_intended || !declaration.commercial_release) blockers.push("germany_commercial_release_scope");
  if (!declaration.publisher_operating_basis_confirmed) blockers.push("publisher_operating_basis");
  if (!declaration.imprint_notice_confirmed) blockers.push("book_imprint_notice");
  if (!declaration.dnb_deposit_plan_confirmed) blockers.push("dnb_deposit_plan");

  if (declaration.publisher_state_code !== "BB") {
    blockers.push("state_deposit_manual_review");
  } else if (!declaration.state_deposit_plan_confirmed) {
    blockers.push("brandenburg_deposit_plan");
  }

  if (declaration.direct_sales_enabled && !declaration.direct_sales_legal_notice_confirmed) {
    blockers.push("direct_sales_legal_notice");
  }

  if (productForm === "paperback" || productForm === "hardcover") {
    const packagingReady = declaration.packaging_responsibility === "third_party_confirmed"
      || (declaration.packaging_responsibility === "publisher_responsible" && declaration.lucid_status === "registered");
    if (!packagingReady) blockers.push("packaging_lucid_responsibility");
  }

  return [...new Set(blockers)];
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const rate = enforceRateLimit({ name: "export-onix", key: auth.userId, limit: 20, windowSec: 60 });
    if (rate) return rate;

    const sc = serviceClient();
    const access = await authorizeBook(sc, body.bookId, auth.userId);
    if (!access.found) return badRequest("Book not found");
    if (!access.authorized) return forbidden("Not the owner of this book");
    if (!access.book?.current_publication_id) {
      return json({ error: "PUBLICATION_REQUIRED", message: "Publish and certify the book before exporting distribution metadata." }, 409);
    }

    const { data: publication, error: publicationErr } = await sc
      .from("publications")
      .select("id,status,version,snapshot,published_at,scroll_edition_id")
      .eq("id", access.book.current_publication_id)
      .eq("status", "published")
      .maybeSingle();
    if (publicationErr) throw publicationErr;
    if (!publication) {
      return json({ error: "PUBLISHED_SNAPSHOT_REQUIRED", message: "The current immutable Publication snapshot is unavailable." }, 409);
    }

    const { data: product, error: productErr } = await sc
      .from("publication_products")
      .select("id,scroll_product_id,product_form")
      .eq("publication_id", publication.id)
      .eq("product_form", body.productForm)
      .maybeSingle();
    if (productErr) throw productErr;
    if (!product?.scroll_product_id) {
      return json({ error: "SCROLL_PRODUCT_ID_REQUIRED", message: `The ${body.productForm} publication product identity has not been materialized.` }, 409);
    }

    const snapshot = (publication.snapshot ?? {}) as Record<string, unknown>;
    const publisher = publisherFromPublicationSnapshot(snapshot);
    const isbnByFormat = snapshot.isbn_by_format && typeof snapshot.isbn_by_format === "object" && !Array.isArray(snapshot.isbn_by_format)
      ? snapshot.isbn_by_format as Record<string, unknown>
      : {};
    const isbnCandidate = isbnByFormat[body.productForm];
    const isbn13 = typeof isbnCandidate === "string" ? isbnCandidate : "";
    if (!isValidIsbn13(isbn13)) {
      return json({
        error: "FORMAT_ISBN_REQUIRED",
        message: `A valid ${body.productForm} ISBN-13 must be frozen into the Publication before ONIX export.`,
      }, 409);
    }

    const language = snapshotString(snapshot, "language");
    const editionLabel = snapshotString(snapshot, "edition");
    if (!language || !editionLabel) {
      return json({ error: "PUBLICATION_IDENTITY_INCOMPLETE", missing: [!language ? "language" : null, !editionLabel ? "edition" : null].filter(Boolean) }, 409);
    }

    const { data: metadata, error: metadataErr } = await sc
      .from("book_distribution_metadata")
      .select("publication_date,warengruppe_code,product_availability,publishing_status,price_type,price_cents,currency,price_country,tax_rate_code,tax_rate_percent")
      .eq("book_id", body.bookId)
      .eq("product_form", body.productForm)
      .eq("language", language)
      .eq("edition_label", editionLabel)
      .maybeSingle();
    if (metadataErr) throw metadataErr;
    if (!metadata) {
      return json({ error: "DISTRIBUTION_METADATA_REQUIRED", message: `Complete ${body.productForm} distribution metadata before ONIX export.` }, 409);
    }

    if (metadata.price_country === "DE") {
      const germanyBlockers = await germanyTradeReleaseBlockers(sc, body.bookId, body.productForm, language, editionLabel);
      const fixedPriceReady = metadata.price_type === "04" && metadata.price_cents != null && metadata.currency === "EUR";
      if (!fixedPriceReady) germanyBlockers.push("german_fixed_retail_price");
      if (germanyBlockers.length > 0) {
        return json({
          error: "DE_CONTROLLED_RELEASE_REQUIRED",
          message: "Germany-facing ONIX export is blocked until the controlled-release prerequisites are complete.",
          blockers: [...new Set(germanyBlockers)],
        }, 409);
      }
    }

    const authorsRaw = Array.isArray(snapshot.authors) ? snapshot.authors as Array<Record<string, unknown>> : [];
    const contributors = authorsRaw
      .slice()
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map((author) => ({ displayName: typeof author.display_name === "string" ? author.display_name.trim() : "", role: "A01" }))
      .filter((author) => author.displayName.length > 0);

    const title = snapshotString(snapshot, "title") ?? "";
    const subtitle = snapshotString(snapshot, "subtitle");
    const publisherName = publisher.publisherName ?? "";

    const onixInput: OnixProductInput = {
      recordReference: product.scroll_product_id,
      notificationType: "03",
      proprietaryProductId: product.scroll_product_id,
      isbn13,
      title,
      subtitle,
      contributors,
      publisherName,
      imprintName: publisher.imprintName,
      language,
      productForm: body.productForm,
      editionLabel,
      publicationDate: metadata.publication_date ?? "",
      warengruppeCode: metadata.warengruppe_code ?? "",
      productAvailability: metadata.product_availability ?? "",
      publishingStatus: metadata.publishing_status ?? null,
      priceType: metadata.price_type ?? "",
      priceCents: metadata.price_cents ?? -1,
      currency: metadata.currency ?? "",
      priceCountry: metadata.price_country ?? "",
      taxRateCode: metadata.tax_rate_code ?? "",
      taxRatePercent: metadata.tax_rate_percent == null ? Number.NaN : Number(metadata.tax_rate_percent),
      senderName: publisherName,
      sentAt: new Date(),
    };

    const issues = validateOnixProduct(onixInput);
    if (issues.length > 0) {
      return json({
        error: "ONIX_VALIDATION_FAILED",
        message: "The distribution record is incomplete or inconsistent.",
        issues,
      }, 409);
    }

    const output = renderOnix31Product(onixInput);
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "book";
    const filename = `${safeTitle}-${body.productForm}-onix-3.1.xml`;

    return new Response(output, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-ONIX-Release": "3.1",
        "X-Publication-ID": publication.id,
        "X-Scroll-Edition-ID": publication.scroll_edition_id ?? "",
        "X-Scroll-Product-ID": product.scroll_product_id,
      },
    });
  } catch (error) {
    return serverError(error);
  }
});
