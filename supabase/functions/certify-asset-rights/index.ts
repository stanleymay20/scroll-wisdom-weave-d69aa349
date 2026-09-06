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
import { evaluateAssetRights } from "../_shared/assetRights.ts";

const BodySchema = z.object({ bookId: z.string().uuid() });

type RightsIssue = {
  severity: "blocker" | "warning";
  code: string;
  message: string;
  assetRole: "cover" | "chapter_media";
  assetId?: string;
  chapterId?: string;
};

async function authorizeBook(sc: ReturnType<typeof serviceClient>, bookId: string, userId: string) {
  const { data: book, error: bookErr } = await sc
    .from("books")
    .select("id,creator_id")
    .eq("id", bookId)
    .maybeSingle();
  if (bookErr) throw bookErr;
  if (!book) return { found: false, authorized: false };

  let authorized = book.creator_id === userId;
  if (!authorized && book.creator_id == null) {
    const { data: modern, error: modernErr } = await sc
      .from("books")
      .select("user_id")
      .eq("id", bookId)
      .maybeSingle();
    if (!modernErr) authorized = modern?.user_id === userId;
    else {
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
      name: "certify-asset-rights",
      key: auth.userId,
      limit: 15,
      windowSec: 60,
    });
    if (rate) return rate;

    const sc = serviceClient();
    const ownership = await authorizeBook(sc, body.bookId, auth.userId);
    if (!ownership.found) return badRequest("Book not found");
    if (!ownership.authorized) return forbidden("Not the owner of this book");

    const scopeBefore = await captureBookScopeHash(sc, body.bookId);
    if (!scopeBefore) {
      return json({ passed: false, status: "blocked", error: "PUBLICATION_SCOPE_UNAVAILABLE" }, 409);
    }

    const { data: book, error: bookErr } = await sc
      .from("books")
      .select("id,cover_image_url")
      .eq("id", body.bookId)
      .single();
    if (bookErr) throw bookErr;

    const { data: links, error: linksErr } = await sc
      .from("scrollvision_chapter_assets")
      .select("id,chapter_id,asset_id,caption")
      .eq("book_id", body.bookId)
      .eq("is_active", true);
    if (linksErr) throw linksErr;

    const assetIds = [...new Set((links || []).map((link) => link.asset_id).filter(Boolean))];
    let assets: Array<{
      id: string;
      source: string;
      source_url: string;
      image_url: string;
      license: string | null;
      attribution: string | null;
      title: string | null;
    }> = [];

    if (assetIds.length > 0) {
      const { data: assetRows, error: assetsErr } = await sc
        .from("scrollvision_assets")
        .select("id,source,source_url,image_url,license,attribution,title")
        .in("id", assetIds);
      if (assetsErr) throw assetsErr;
      assets = assetRows || [];
    }

    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const issues: RightsIssue[] = [];
    let chapterAssetsPassed = 0;

    for (const link of links || []) {
      const asset = assetById.get(link.asset_id);
      if (!asset) {
        issues.push({
          severity: "blocker",
          code: "linked_asset_missing",
          message: "An active chapter-media link points to a missing provenance asset.",
          assetRole: "chapter_media",
          assetId: link.asset_id,
          chapterId: link.chapter_id,
        });
        continue;
      }

      const decision = evaluateAssetRights({
        source: asset.source,
        sourceUrl: asset.source_url,
        imageUrl: asset.image_url,
        license: asset.license,
        attribution: asset.attribution,
      });

      if (!decision.allowed) {
        issues.push({
          severity: "blocker",
          code: decision.code,
          message: `${asset.title || "Chapter media"}: ${decision.reason}`,
          assetRole: "chapter_media",
          assetId: asset.id,
          chapterId: link.chapter_id,
        });
      } else {
        chapterAssetsPassed++;
      }
    }

    let coverStatus: "not_present" | "passed" | "blocked" = "not_present";
    let coverProvenanceType: string | null = null;

    if (typeof book.cover_image_url === "string" && book.cover_image_url.trim().length > 0) {
      const { data: provenance, error: provenanceErr } = await sc
        .from("book_asset_provenance")
        .select("id,source_type,rights_basis,license,attribution,source_url,provider,model,user_attested,attested_by,asset_url")
        .eq("book_id", body.bookId)
        .eq("asset_role", "cover")
        .eq("asset_url", book.cover_image_url)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (provenanceErr) throw provenanceErr;

      if (!provenance) {
        coverStatus = "blocked";
        issues.push({
          severity: "blocker",
          code: "cover_provenance_missing",
          message: "The current cover has no server-owned provenance record for its exact URL.",
          assetRole: "cover",
        });
      } else {
        coverProvenanceType = provenance.source_type;

        if (provenance.source_type === "ai_generated") {
          const valid = provenance.rights_basis === "platform_generated_output"
            && typeof provenance.provider === "string" && provenance.provider.trim().length > 0
            && typeof provenance.model === "string" && provenance.model.trim().length > 0;
          coverStatus = valid ? "passed" : "blocked";
          if (!valid) {
            issues.push({
              severity: "blocker",
              code: "generated_cover_provenance_incomplete",
              message: "AI-generated cover provenance must record platform output rights basis, provider, and model.",
              assetRole: "cover",
            });
          }
        } else if (provenance.source_type === "user_upload") {
          const valid = provenance.user_attested === true
            && typeof provenance.attested_by === "string"
            && provenance.attested_by === auth.userId
            && typeof provenance.rights_basis === "string"
            && provenance.rights_basis.trim().length > 0;
          coverStatus = valid ? "passed" : "blocked";
          if (!valid) {
            issues.push({
              severity: "blocker",
              code: "uploaded_cover_rights_unattested",
              message: "A user-uploaded cover requires an explicit server-recorded publication-rights attestation by the book owner.",
              assetRole: "cover",
            });
          }
        } else if (provenance.source_type === "external_licensed") {
          const decision = evaluateAssetRights({
            source: provenance.rights_basis,
            sourceUrl: provenance.source_url,
            imageUrl: provenance.asset_url,
            license: provenance.license,
            attribution: provenance.attribution,
          });
          coverStatus = decision.allowed ? "passed" : "blocked";
          if (!decision.allowed) {
            issues.push({
              severity: "blocker",
              code: decision.code,
              message: `Cover: ${decision.reason}`,
              assetRole: "cover",
            });
          }
        } else {
          coverStatus = "blocked";
          issues.push({
            severity: "blocker",
            code: "cover_source_type_unsupported",
            message: "The current cover provenance source type is not certifiable.",
            assetRole: "cover",
          });
        }
      }
    }

    const scopeAfter = await captureBookScopeHash(sc, body.bookId);
    const scopeError = scopeStabilityError(scopeBefore, scopeAfter);
    if (scopeError) {
      return json({ passed: false, status: "blocked", error: scopeError }, 409);
    }

    const blockers = issues.filter((issue) => issue.severity === "blocker");
    const passed = blockers.length === 0
      && chapterAssetsPassed === (links || []).length
      && coverStatus !== "blocked";

    const attestationError = await recordBoundAttestation(sc, {
      bookId: body.bookId,
      userId: auth.userId,
      gate: "rights",
      status: passed ? "passed" : "blocked",
      expectedScopeHash: scopeBefore,
      artifact: {
        audit: "asset_rights_v1",
        chapterAssetCount: (links || []).length,
        chapterAssetsPassed,
        coverPresent: Boolean(book.cover_image_url),
        coverStatus,
        coverProvenanceType,
        issues,
        inspectedAt: new Date().toISOString(),
      },
    });
    if (attestationError) return serverError(new Error(attestationError));

    return json({
      passed,
      status: passed ? "ready" : "blocked",
      chapterAssetCount: (links || []).length,
      chapterAssetsPassed,
      coverStatus,
      coverProvenanceType,
      issues,
      authority: "server_rights_attestation",
    });
  } catch (error) {
    return serverError(error);
  }
});
