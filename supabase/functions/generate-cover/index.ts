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

const BodySchema = z.object({
  bookId: z.string().uuid(),
  title: z.string().min(1).max(500),
  category: z.string().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
  theme: z.string().max(100).optional(),
  authorName: z.string().max(500).optional(),
});

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

    const coverUrl = generated.payload.coverUrl as string;
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

    // The raw generator has already activated the cover. Publication rights remain
    // fail-closed until this server-owned provenance row exists. If persistence
    // fails, restore the previous cover only when no concurrent actor replaced it.
    const { error: provenanceErr } = await sc
      .from("book_asset_provenance")
      .upsert({
        book_id: body.bookId,
        asset_role: "cover",
        asset_url: coverUrl,
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
          theme: body.theme ?? "classic",
          generator: "generate-cover-raw",
        },
      }, {
        onConflict: "book_id,asset_role,asset_url",
      });

    if (provenanceErr) {
      await sc
        .from("books")
        .update({ cover_image_url: previousCoverUrl })
        .eq("id", body.bookId)
        .eq("cover_image_url", coverUrl);

      return serverError(new Error(`Cover provenance could not be recorded: ${provenanceErr.message}`));
    }

    // Detect a concurrent cover replacement after the raw producer returned. The
    // provenance row remains a harmless historical record, but this request must
    // not report success for a cover that is no longer the active book cover.
    const { data: currentBook, error: currentBookErr } = await sc
      .from("books")
      .select("cover_image_url")
      .eq("id", body.bookId)
      .single();
    if (currentBookErr) return serverError(currentBookErr);

    if (currentBook.cover_image_url !== coverUrl) {
      return json({
        success: false,
        error: "COVER_CHANGED_DURING_PROVENANCE",
        message: "The book cover changed while generated-cover provenance was being recorded.",
      }, 409);
    }

    return json({
      ...generated.payload,
      success: true,
      coverUrl,
      provenance: {
        sourceType: "ai_generated",
        rightsBasis: "platform_generated_output",
        provider: PROVIDER,
        model: MODEL,
        requestHash,
      },
      authority: "server_cover_provenance",
    });
  } catch (error) {
    return serverError(error);
  }
});
