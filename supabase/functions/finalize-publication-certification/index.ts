// finalize-publication-certification
// ---------------------------------
// Final server-authoritative publication verdict for the current persisted book.
// The browser may orchestrate quality checks, but it never decides readiness.
//
// POST { bookId: uuid } -> { ready, jobStatus, checkedAt }

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

const BodySchema = z.object({ bookId: z.string().uuid() });

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const parsed = await validateBody(req, BodySchema);
    if (parsed instanceof Response) return parsed;
    const { bookId } = parsed;

    const rate = enforceRateLimit({
      name: "finalize-publication-certification",
      key: auth.userId,
      limit: 30,
      windowSec: 60,
    });
    if (rate) return rate;

    const sc = serviceClient();

    // Legacy-compatible ownership check. Live historically used creator_id;
    // user_id is queried separately so a schema still converging cannot turn a
    // missing modern column into an authorization bypass.
    const { data: book, error: bookErr } = await sc
      .from("books")
      .select("id, creator_id")
      .eq("id", bookId)
      .maybeSingle();
    if (bookErr) return serverError(bookErr);
    if (!book) return badRequest("Book not found");

    let authorized = book.creator_id === auth.userId;
    if (!authorized && book.creator_id == null) {
      const { data: modernOwner, error: modernOwnerErr } = await sc
        .from("books")
        .select("user_id")
        .eq("id", bookId)
        .maybeSingle();

      if (!modernOwnerErr) {
        authorized = modernOwner?.user_id === auth.userId;
      } else {
        const missingUserIdColumn = modernOwnerErr.code === "42703"
          || /user_id.*does not exist|column .*user_id/i.test(modernOwnerErr.message ?? "");
        if (!missingUserIdColumn) return serverError(modernOwnerErr);
      }
    }

    if (!authorized) {
      const { data: adminRow } = await sc
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.userId)
        .eq("role", "admin")
        .maybeSingle();
      authorized = !!adminRow;
    }
    if (!authorized) return forbidden("Not the owner of this book");

    const { data: attestationReady, error: readinessErr } = await sc.rpc(
      "has_current_publication_attestations",
      { p_book_id: bookId },
    );
    if (readinessErr) return serverError(readinessErr);

    const { data: chapters, error: chapterErr } = await sc
      .from("chapters")
      .select("id, is_generated, content")
      .eq("book_id", bookId);
    if (chapterErr) return serverError(chapterErr);

    const chapterCount = chapters?.length ?? 0;
    const generatedCount = (chapters ?? []).filter(
      (chapter) => chapter.is_generated === true && typeof chapter.content === "string" && chapter.content.trim().length > 0,
    ).length;

    const checkedAt = new Date().toISOString();
    const desiredReady = attestationReady === true;

    const { data: job, error: jobErr } = await sc
      .from("generation_jobs")
      .select("id, metadata")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobErr) return serverError(jobErr);

    if (!job) {
      // The trust verdict exists independently of workflow telemetry. Imported or
      // manually managed books may legitimately have no generation job.
      return json({
        ready: desiredReady,
        jobStatus: null,
        checkedAt,
        chapterCount,
        generatedCount,
        authority: "server_attestations",
      });
    }

    const previousMetadata =
      job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
        ? job.metadata as Record<string, unknown>
        : {};

    const { data: updated, error: updateErr } = await sc
      .from("generation_jobs")
      .update({
        status: desiredReady ? "completed" : "partial",
        current_chapter: generatedCount,
        completed_at: desiredReady ? checkedAt : null,
        error_code: desiredReady ? null : "QUALITY_GATE_REQUIRED",
        error_message: desiredReady
          ? null
          : "Current server-attested publication gates are required before completion.",
        metadata: {
          ...previousMetadata,
          publicationQuality: {
            ready: desiredReady,
            authority: "server_attestations",
            checkedAt,
          },
        },
      })
      .eq("id", job.id)
      .select("status, metadata")
      .single();
    if (updateErr) return serverError(updateErr);

    // The generation_jobs trigger independently recomputes readiness on a
    // completed transition. Read back its stored verdict so a manuscript edit in
    // the gap between the readiness RPC and UPDATE cannot produce a false PASS.
    const storedQuality = updated?.metadata && typeof updated.metadata === "object"
      ? (updated.metadata as Record<string, unknown>).publicationQuality
      : null;
    const storedReady = storedQuality && typeof storedQuality === "object"
      ? (storedQuality as Record<string, unknown>).ready === true
      : false;
    const ready = updated?.status === "completed" && storedReady;

    return json({
      ready,
      jobStatus: updated?.status ?? null,
      checkedAt,
      chapterCount,
      generatedCount,
      authority: "server_attestations",
    });
  } catch (e) {
    return serverError(e);
  }
});
