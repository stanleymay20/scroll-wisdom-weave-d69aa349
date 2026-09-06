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

const ProductForm = z.enum(["paperback", "hardcover", "epub"]);
const NullableText = z.string().trim().nullable().optional();
const NullablePrice = z.number().int().min(0).nullable().optional();
const NullableTax = z.number().min(0).max(100).nullable().optional();

const SaveSchema = z.object({
  action: z.literal("save"),
  bookId: z.string().uuid(),
  productForm: ProductForm,
  publicationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  warengruppeCode: z.string().regex(/^\d{4}$/).nullable().optional(),
  productAvailability: z.string().regex(/^\d{2}$/).nullable().optional(),
  publishingStatus: z.string().regex(/^\d{2}$/).nullable().optional(),
  priceType: z.enum(["02", "04", "12", "14"]).nullable().optional(),
  priceCents: NullablePrice,
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).default("EUR"),
  priceCountry: z.string().trim().regex(/^[A-Za-z]{2}$/).default("DE"),
  taxRateCode: z.enum(["R", "S"]).nullable().optional(),
  taxRatePercent: NullableTax,
  unpricedItemType: z.enum(["01", "02"]).nullable().optional(),
  themaCodes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  keywords: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
}).superRefine((value, ctx) => {
  const hasPrice = value.priceCents != null || value.priceType != null;
  if (hasPrice && (value.priceCents == null || value.priceType == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceCents"], message: "priceCents and priceType must be supplied together" });
  }
  if (value.priceCents != null && value.unpricedItemType != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unpricedItemType"], message: "priced and unpriced states are mutually exclusive" });
  }
});

const BodySchema = z.union([
  z.object({ action: z.literal("get"), bookId: z.string().uuid(), productForm: ProductForm }),
  SaveSchema,
]);

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

async function canonicalIdentity(sc: Service, bookId: string) {
  const { data: profile, error } = await sc
    .from("book_publishing_profiles")
    .select("publication_language,edition_label,publisher_mode,imprint_id")
    .eq("book_id", bookId)
    .maybeSingle();
  if (error) throw error;
  return profile;
}

function validateWarengruppe(productForm: "paperback" | "hardcover" | "epub", code: string | null | undefined): string | null {
  if (!code) return null;
  const expected = productForm === "epub" ? "9" : "1";
  return code.startsWith(expected)
    ? null
    : `${productForm} requires a VLB Warengruppe beginning with ${expected}`;
}

async function readRecord(sc: Service, bookId: string, productForm: string, language: string, editionLabel: string) {
  const { data, error } = await sc
    .from("book_distribution_metadata")
    .select("id,book_id,product_form,language,edition_label,publication_date,warengruppe_code,product_availability,publishing_status,price_type,price_cents,currency,price_country,tax_rate_code,tax_rate_percent,unpriced_item_type,thema_codes,keywords,updated_at")
    .eq("book_id", bookId)
    .eq("product_form", productForm)
    .eq("language", language)
    .eq("edition_label", editionLabel)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function hasMatchingIsbn(sc: Service, bookId: string, productForm: string, language: string, editionLabel: string) {
  const { data, error } = await sc
    .from("book_isbn_assignments")
    .select("id")
    .eq("book_id", bookId)
    .eq("product_form", productForm)
    .eq("language", language)
    .eq("edition_label", editionLabel)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const rate = enforceRateLimit({ name: "distribution-metadata", key: auth.userId, limit: 30, windowSec: 60 });
    if (rate) return rate;

    const sc = serviceClient();
    const access = await authorizeBook(sc, body.bookId, auth.userId);
    if (!access.found) return badRequest("Book not found");
    if (!access.authorized) return forbidden("Not the owner of this book");

    const identity = await canonicalIdentity(sc, body.bookId);
    if (!identity) {
      return json({ error: "PUBLISHING_IDENTITY_REQUIRED", message: "Configure Publishing Identity before distribution metadata." }, 409);
    }
    const language = identity.publication_language;
    const editionLabel = identity.edition_label;

    if (body.action === "get") {
      const record = await readRecord(sc, body.bookId, body.productForm, language, editionLabel);
      const isbnAssigned = await hasMatchingIsbn(sc, body.bookId, body.productForm, language, editionLabel);
      return json({
        bookId: body.bookId,
        productForm: body.productForm,
        canonicalLanguage: language,
        canonicalEditionLabel: editionLabel,
        isbnAssigned,
        published: !!access.book?.current_publication_id,
        metadata: record,
      });
    }

    const wgError = validateWarengruppe(body.productForm, body.warengruppeCode);
    if (wgError) return badRequest(wgError);

    const payload = {
      book_id: body.bookId,
      owner_user_id: access.book?.user_id ?? access.book?.creator_id ?? auth.userId,
      product_form: body.productForm,
      language,
      edition_label: editionLabel,
      publication_date: body.publicationDate ?? null,
      warengruppe_code: body.warengruppeCode ?? null,
      product_availability: body.productAvailability ?? null,
      publishing_status: body.publishingStatus ?? null,
      price_type: body.priceType ?? null,
      price_cents: body.priceCents ?? null,
      currency: body.currency.toUpperCase(),
      price_country: body.priceCountry.toUpperCase(),
      tax_rate_code: body.taxRateCode ?? null,
      tax_rate_percent: body.taxRatePercent ?? null,
      unpriced_item_type: body.unpricedItemType ?? null,
      thema_codes: body.themaCodes,
      keywords: body.keywords,
    };

    const { error: saveErr } = await sc
      .from("book_distribution_metadata")
      .upsert(payload, { onConflict: "book_id,product_form,language,edition_label" });
    if (saveErr) throw saveErr;

    const record = await readRecord(sc, body.bookId, body.productForm, language, editionLabel);
    const isbnAssigned = await hasMatchingIsbn(sc, body.bookId, body.productForm, language, editionLabel);
    return json({
      saved: true,
      bookId: body.bookId,
      productForm: body.productForm,
      canonicalLanguage: language,
      canonicalEditionLabel: editionLabel,
      isbnAssigned,
      metadata: record,
    });
  } catch (error) {
    return serverError(error);
  }
});
