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

const BodySchema = z.object({
  bookId: z.string().uuid(),
  assetUrl: z.string().url(),
  confirmPublicationRights: z.literal(true),
});

function isOwnedCoverStorageUrl(assetUrl: string, supabaseUrl: string, userId: string, bookId: string): boolean {
  try {
    const asset = new URL(assetUrl);
    const base = new URL(supabaseUrl);
    if (asset.origin !== base.origin) return false;

    const prefix = `/storage/v1/object/public/book-images/${encodeURIComponent(userId)}/covers/${encodeURIComponent(bookId)}-`;
    return asset.pathname.startsWith(prefix);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const rate = enforceRateLimit({
      name: "register-custom-cover",
      key: auth.userId,
      limit: 10,
      windowSec: 60,
    });
    if (rate) return rate;

    const sc = serviceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) return serverError(new Error("Supabase configuration is missing"));

    const { data: book, error: legacyErr } = await sc
      .from("books")
      .select("id,creator_id")
      .eq("id", body.bookId)
      .maybeSingle();
    if (legacyErr) return serverError(legacyErr);
    if (!book) return badRequest("Book not found");

    let authorized = book.creator_id === auth.userId;
    if (!authorized && book.creator_id == null) {
      const { data: modern, error: modernErr } = await sc
        .from("books")
        .select("user_id")
        .eq("id", body.bookId)
        .maybeSingle();
      if (!modernErr) authorized = modern?.user_id === auth.userId;
      else {
        const missing = modernErr.code === "42703"
          || /user_id.*does not exist|column .*user_id/i.test(modernErr.message ?? "");
        if (!missing) return serverError(modernErr);
      }
    }

    if (!authorized) {
      const { data: admin, error: adminErr } = await sc
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (adminErr) return serverError(adminErr);
      authorized = !!admin;
    }
    if (!authorized) return forbidden("Not the owner of this book");

    if (!isOwnedCoverStorageUrl(body.assetUrl, supabaseUrl, auth.userId, body.bookId)) {
      return badRequest("Cover URL must be an uploaded book-images cover owned by this user and book.");
    }

    const now = new Date().toISOString();
    const { error: provenanceErr } = await sc
      .from("book_asset_provenance")
      .upsert({
        book_id: body.bookId,
        asset_role: "cover",
        asset_url: body.assetUrl,
        source_type: "user_upload",
        rights_basis: "user_attested_publication_rights",
        license: null,
        attribution: "Cover supplied by the book owner",
        source_url: null,
        provider: "user_upload",
        model: null,
        user_attested: true,
        attested_by: auth.userId,
        metadata: {
          attestation: "I created/own this cover or have sufficient permission/license to publish and commercially distribute it.",
          attestedAt: now,
        },
      }, {
        onConflict: "book_id,asset_role,asset_url",
      });
    if (provenanceErr) return serverError(provenanceErr);

    const { data: updated, error: updateErr } = await sc
      .from("books")
      .update({ cover_image_url: body.assetUrl })
      .eq("id", body.bookId)
      .select("cover_image_url")
      .single();
    if (updateErr) return serverError(updateErr);

    return json({
      success: true,
      coverUrl: updated.cover_image_url,
      provenance: "user_attested_publication_rights",
      authority: "server_cover_provenance",
    });
  } catch (error) {
    return serverError(error);
  }
});
