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

const MODEL = "google/gemini-3-pro-image-preview";
const PROVIDER = "lovable_ai_gateway";
const COVER_BUCKET = "book-images";
const MAX_GENERATED_COVER_BYTES = 10 * 1024 * 1024;

const BodySchema = z.object({
  bookId: z.string().uuid(),
  title: z.string().min(1).max(500),
  category: z.string().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
  theme: z.string().max(100).optional(),
  authorName: z.string().max(500).optional(),
});

type MaterializedCover = {
  publicUrl: string;
  storagePath: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function acceptedImageType(value: string | null): MaterializedCover["contentType"] | null {
  const normalized = (value || "").split(";", 1)[0].trim().toLowerCase();
  if (normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp") {
    return normalized;
  }
  return null;
}

function extensionFor(contentType: MaterializedCover["contentType"]): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return "png";
}

function decodeDataImage(rawUrl: string): { bytes: Uint8Array; contentType: MaterializedCover["contentType"] } | null {
  const match = rawUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
  if (!match) return null;

  const contentType = acceptedImageType(match[1]);
  if (!contentType) throw new Error("Generated cover has an unsupported image type");

  const base64 = match[2].replace(/\s+/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const estimatedBytes = Math.floor((base64.length * 3) / 4) - padding;
  if (estimatedBytes <= 0 || estimatedBytes > MAX_GENERATED_COVER_BYTES) {
    throw new Error("Generated cover payload is empty or exceeds the 10 MB production limit");
  }

  let decoded: string;
  try {
    decoded = atob(base64);
  } catch {
    throw new Error("Generated cover contains invalid base64 image data");
  }

  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_GENERATED_COVER_BYTES) {
    throw new Error("Generated cover payload is empty or exceeds the 10 MB production limit");
  }

  return { bytes, contentType };
}

async function loadGeneratedImage(rawUrl: string): Promise<{
  bytes: Uint8Array;
  contentType: MaterializedCover["contentType"];
}> {
  const dataImage = decodeDataImage(rawUrl);
  if (dataImage) return dataImage;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Generated cover did not return a valid image URL or data image");
  }
  if (url.protocol !== "https:") {
    throw new Error("Generated cover URL must use HTTPS");
  }

  const response = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Generated cover could not be downloaded (${response.status})`);
  }

  const contentType = acceptedImageType(response.headers.get("content-type"));
  if (!contentType) {
    throw new Error("Generated cover download is not PNG, JPEG, or WebP");
  }

  const declaredSize = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declaredSize) && declaredSize > MAX_GENERATED_COVER_BYTES) {
    throw new Error("Generated cover exceeds the 10 MB production limit");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_GENERATED_COVER_BYTES) {
    throw new Error("Generated cover is empty or exceeds the 10 MB production limit");
  }

  return { bytes, contentType };
}

async function authorizeBook(
  sc: ReturnType<typeof serviceClient>,
  bookId: string,
  userId: string,
): Promise<{ found: boolean; authorized: boolean; coverUrl: string | null }> {
  const { data: book, error: bookErr } = await sc
    .from("books")
    .select("id,creator_id,cover_image_url")
    .eq("id", bookId)
    .maybeSingle();
  if (bookErr) throw bookErr;
  if (!book) return { found: false, authorized: false, coverUrl: null };

  let authorized = book.creator_id === userId;
  if (!authorized && book.creator_id == null) {
    const { data: modern, error: modernErr } = await sc
      .from("books")
      .select("user_id")
      .eq("id", bookId)
      .maybeSingle();

    if (!modernErr) {
      authorized = modern?.user_id === userId;
    } else {
      const missing = modernErr.code === "42703"
        || /user_id.*does not exist|column .*user_id/i.test(modernErr.message ?? "");
      if (!missing) throw modernErr;
    }
  }

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

  return {
    found: true,
    authorized,
    coverUrl: typeof book.cover_image_url === "string" ? book.cover_image_url : null,
  };
}

async function invokeRawGenerator(req: Request, body: z.infer<typeof BodySchema>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");

  if (!supabaseUrl || !serviceKey || !authorization) {
    throw new Error("Cover generator is not configured");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-cover-raw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: authorization,
      "x-scroll-cover-wrapper": "provenance-v1",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      payload: payload || { error: `Cover generation failed (${response.status})` },
    };
  }

  if (payload?.error && !payload?.coverUrl) {
    return {
      ok: false as const,
      status: payload?.code === "AI_QUOTA_EXHAUSTED" ? 402 : 500,
      payload,
    };
  }

  if (typeof payload?.coverUrl !== "string" || payload.coverUrl.length === 0) {
    return {
      ok: false as const,
      status: 502,
      payload: { error: "Raw cover generator returned no cover URL." },
    };
  }

  return { ok: true as const, status: 200, payload };
}

async function restorePreviousCover(
  sc: ReturnType<typeof serviceClient>,
  bookId: string,
  expectedCurrentUrl: string,
  previousCoverUrl: string | null,
) {
  await sc
    .from("books")
    .update({ cover_image_url: previousCoverUrl })
    .eq("id", bookId)
    .eq("cover_image_url", expectedCurrentUrl);
}

async function materializeCover(
  sc: ReturnType<typeof serviceClient>,
  rawCoverUrl: string,
  userId: string,
  bookId: string,
): Promise<MaterializedCover> {
  const { bytes, contentType } = await loadGeneratedImage(rawCoverUrl);
  const extension = extensionFor(contentType);
  const storagePath = `${userId}/covers/${bookId}-ai-${crypto.randomUUID()}.${extension}`;

  const { error: uploadErr } = await sc.storage
    .from(COVER_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadErr) {
    throw new Error(`Generated cover could not be persisted: ${uploadErr.message}`);
  }

  const { data } = sc.storage.from(COVER_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) {
    await sc.storage.from(COVER_BUCKET).remove([storagePath]);
    throw new Error("Generated cover storage returned no public URL");
  }

  return {
    publicUrl: data.publicUrl,
    storagePath,
    contentType,
    byteSize: bytes.byteLength,
  };
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
      name: "generate-cover-provenance",
      key: auth.userId,
      limit: 5,
      windowSec: 60,
    });
    if (rate) return rate;

    const sc = serviceClient();
    const ownership = await authorizeBook(sc, body.bookId, auth.userId);
    if (!ownership.found) return badRequest("Book not found");
    if (!ownership.authorized) return forbidden("Not the owner of this book");

    const previousCoverUrl = ownership.coverUrl;
    const generated = await invokeRawGenerator(req, body);
    if (!generated.ok) {
      return json(generated.payload, generated.status);
    }

    const rawCoverUrl = generated.payload.coverUrl as string;
    let materialized: MaterializedCover;
    try {
      materialized = await materializeCover(sc, rawCoverUrl, auth.userId, body.bookId);
    } catch (error) {
      await restorePreviousCover(sc, body.bookId, rawCoverUrl, previousCoverUrl);
      throw error;
    }

    // Replace the model-returned URL/data URI only if it is still the active cover.
    // A concurrent cover edit wins; the newly persisted file is removed and this
    // request fails rather than overwriting another actor's newer decision.
    const { data: stabilizedBook, error: stabilizeErr } = await sc
      .from("books")
      .update({ cover_image_url: materialized.publicUrl })
      .eq("id", body.bookId)
      .eq("cover_image_url", rawCoverUrl)
      .select("cover_image_url")
      .maybeSingle();

    if (stabilizeErr || stabilizedBook?.cover_image_url !== materialized.publicUrl) {
      await sc.storage.from(COVER_BUCKET).remove([materialized.storagePath]);
      if (stabilizeErr) return serverError(stabilizeErr);
      return json({
        success: false,
        error: "COVER_CHANGED_DURING_MATERIALIZATION",
        message: "The book cover changed while the generated image was being persisted.",
      }, 409);
    }

    const generatedAt = new Date().toISOString();
    const requestHash = await sha256(JSON.stringify({
      bookId: body.bookId,
      title: body.title,
      category: body.category,
      description: body.description ?? null,
      theme: body.theme ?? "classic",
      authorName: body.authorName ?? null,
      model: MODEL,
    }));
    const rawOutputHash = await sha256(rawCoverUrl);

    const { error: provenanceErr } = await sc
      .from("book_asset_provenance")
      .upsert({
        book_id: body.bookId,
        asset_role: "cover",
        asset_url: materialized.publicUrl,
        source_type: "ai_generated",
        rights_basis: "platform_generated_output",
        license: null,
        attribution: `AI-generated cover for ${body.title}`,
        source_url: null,
        provider: PROVIDER,
        model: MODEL,
        user_attested: false,
        attested_by: null,
        metadata: {
          generatedAt,
          requestHash,
          rawOutputHash,
          theme: body.theme ?? "classic",
          generator: "generate-cover-raw",
          storageBucket: COVER_BUCKET,
          storagePath: materialized.storagePath,
          contentType: materialized.contentType,
          byteSize: materialized.byteSize,
        },
      }, {
        onConflict: "book_id,asset_role,asset_url",
      });

    if (provenanceErr) {
      await restorePreviousCover(sc, body.bookId, materialized.publicUrl, previousCoverUrl);
      await sc.storage.from(COVER_BUCKET).remove([materialized.storagePath]);
      return serverError(new Error(`Cover provenance could not be recorded: ${provenanceErr.message}`));
    }

    const { data: currentBook, error: currentBookErr } = await sc
      .from("books")
      .select("cover_image_url")
      .eq("id", body.bookId)
      .single();
    if (currentBookErr) return serverError(currentBookErr);

    if (currentBook.cover_image_url !== materialized.publicUrl) {
      return json({
        success: false,
        error: "COVER_CHANGED_DURING_PROVENANCE",
        message: "The book cover changed while generated-cover provenance was being recorded.",
      }, 409);
    }

    return json({
      ...generated.payload,
      success: true,
      coverUrl: materialized.publicUrl,
      provenance: {
        sourceType: "ai_generated",
        rightsBasis: "platform_generated_output",
        provider: PROVIDER,
        model: MODEL,
        requestHash,
        storagePath: materialized.storagePath,
        contentType: materialized.contentType,
        byteSize: materialized.byteSize,
      },
      authority: "server_cover_provenance",
    });
  } catch (error) {
    return serverError(error);
  }
});
