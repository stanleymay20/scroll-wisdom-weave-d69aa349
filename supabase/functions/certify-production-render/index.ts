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
import {
  captureBookScopeHash,
  recordBoundAttestation,
  scopeStabilityError,
} from "../_shared/publicationScope.ts";
import { auditRenderedPdf } from "../_shared/productionArtifactAudit.ts";
import { computeSha256Hex } from "../_shared/export/hash.ts";

const BodySchema = z.object({
  bookId: z.string().uuid(),
});

function decodeBase64(content: string): Uint8Array {
  return Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
}

async function responseToPdfBytes(response: Response): Promise<Uint8Array> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error));

  const downloadUrl = payload?.downloadUrl || payload?.download_url;
  if (downloadUrl) {
    const fileResponse = await fetch(downloadUrl, { cache: "no-store" });
    if (!fileResponse.ok) {
      throw new Error(`Rendered PDF download failed (${fileResponse.status})`);
    }
    return new Uint8Array(await fileResponse.arrayBuffer());
  }

  if (typeof payload?.content !== "string" || payload.content.length === 0) {
    throw new Error("Render service returned no PDF bytes");
  }

  return payload.isBase64
    ? decodeBase64(payload.content)
    : new TextEncoder().encode(payload.content);
}

async function authorizeBook(sc: ReturnType<typeof serviceClient>, bookId: string, userId: string) {
  const { data: book, error: bookErr } = await sc
    .from("books")
    .select("id, creator_id")
    .eq("id", bookId)
    .maybeSingle();
  if (bookErr) throw bookErr;
  if (!book) return { found: false, authorized: false };

  let authorized = book.creator_id === userId;
  if (!authorized && book.creator_id == null) {
    const { data: modernOwner, error: modernOwnerErr } = await sc
      .from("books")
      .select("user_id")
      .eq("id", bookId)
      .maybeSingle();

    if (!modernOwnerErr) {
      authorized = modernOwner?.user_id === userId;
    } else {
      const missingUserIdColumn = modernOwnerErr.code === "42703"
        || /user_id.*does not exist|column .*user_id/i.test(modernOwnerErr.message ?? "");
      if (!missingUserIdColumn) throw modernOwnerErr;
    }
  }

  if (!authorized) {
    const { data: adminRow, error: adminErr } = await sc
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminErr) throw adminErr;
    authorized = !!adminRow;
  }

  return { found: true, authorized };
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
      name: "certify-production-render",
      key: auth.userId,
      limit: 10,
      windowSec: 60,
    });
    if (rate) return rate;

    const sc = serviceClient();
    const ownership = await authorizeBook(sc, body.bookId, auth.userId);
    if (!ownership.found) return badRequest("Book not found");
    if (!ownership.authorized) return forbidden("Not the owner of this book");

    const scopeBefore = await captureBookScopeHash(sc, body.bookId);
    if (!scopeBefore) {
      return json({
        passed: false,
        status: "blocked",
        error: "PUBLICATION_SCOPE_UNAVAILABLE",
      }, 409);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!supabaseUrl || !serviceKey || !authHeader) {
      return serverError(new Error("Production render service is not configured"));
    }

    let bytes: Uint8Array;
    let renderFailure: string | null = null;
    try {
      const renderResponse = await fetch(`${supabaseUrl}/functions/v1/export-book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: authHeader,
          "x-scroll-export-response": "binary",
          "x-scroll-production-certification": "1",
        },
        body: JSON.stringify({
          bookId: body.bookId,
          format: "pdf",
        }),
      });

      if (!renderResponse.ok) {
        const contentType = renderResponse.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await renderResponse.json().catch(() => null);
          throw new Error(payload?.error || payload?.message || `PDF render failed (${renderResponse.status})`);
        }
        throw new Error((await renderResponse.text().catch(() => "")) || `PDF render failed (${renderResponse.status})`);
      }

      bytes = await responseToPdfBytes(renderResponse);
    } catch (error) {
      bytes = new Uint8Array();
      renderFailure = error instanceof Error ? error.message : String(error);
    }

    const scopeAfter = await captureBookScopeHash(sc, body.bookId);
    const scopeError = scopeStabilityError(scopeBefore, scopeAfter);
    if (scopeError) {
      return json({ passed: false, status: "blocked", error: scopeError }, 409);
    }

    if (renderFailure) {
      const attestationError = await recordBoundAttestation(sc, {
        bookId: body.bookId,
        userId: auth.userId,
        gate: "production",
        status: "blocked",
        expectedScopeHash: scopeBefore,
        artifact: {
          format: "pdf",
          canonical: true,
          renderer: "export-book",
          error: renderFailure,
          inspectedAt: new Date().toISOString(),
        },
      });
      if (attestationError) return serverError(new Error(attestationError));

      return json({
        passed: false,
        status: "blocked",
        score: 0,
        issues: [{ severity: "blocker", code: "render_failed", message: renderFailure }],
      });
    }

    const report = await auditRenderedPdf(bytes);
    const fileHash = await computeSha256Hex(bytes);
    const passed = report.status === "ready";

    const attestationError = await recordBoundAttestation(sc, {
      bookId: body.bookId,
      userId: auth.userId,
      gate: "production",
      status: passed ? "passed" : "blocked",
      expectedScopeHash: scopeBefore,
      artifact: {
        format: "pdf",
        canonical: true,
        renderer: "export-book",
        fileHash,
        byteSize: bytes.byteLength,
        report,
        inspectedAt: new Date().toISOString(),
      },
    });
    if (attestationError) return serverError(new Error(attestationError));

    return json({
      passed,
      status: report.status,
      score: report.score,
      fileHash,
      metrics: report.metrics,
      issues: report.issues,
      authority: "server_production_attestation",
    });
  } catch (error) {
    return serverError(error);
  }
});
