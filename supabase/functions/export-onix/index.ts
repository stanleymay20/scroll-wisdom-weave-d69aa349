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
