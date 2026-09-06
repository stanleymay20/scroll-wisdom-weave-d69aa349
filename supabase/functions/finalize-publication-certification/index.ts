// finalize-publication-certification
// ---------------------------------
// Final server-authoritative publication verdict for the current persisted book.
// The browser may orchestrate quality checks, but it never decides readiness or
// writes publication workflow state directly.
//
// POST { bookId: uuid, mode?: "evaluate" | "interrupted" }

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
  mode: z.enum(["evaluate", "interrupted"]).optional().default("evaluate"),
});

type GateName = "structural" | "rights" | "production";
type ProducerName = "structural" | "rights";

type ProducerOutcome = {
  passed: boolean;
  status: string;
  error: string | null;
  source: "current_attestation" | "producer" | "not_run";
};

const PRODUCERS: Record<ProducerName, { path: string; label: string }> = {
  structural: {
    path: "cross-chapter-consistency-audit",
    label: "Structural consistency audit",
  },
  rights: {
    path: "certify-asset-rights",
    label: "Asset rights certification",
  },
};

async function latestGatePassed(
  sc: ReturnType<typeof serviceClient>,
  bookId: string,
  scopeHash: string,
  gate: GateName,
): Promise<boolean> {
  const { data, error } = await sc
    .from("publication_gate_attestations")
    .select("status")
    .eq("book_id", bookId)
    .eq("gate", gate)
    .eq("scope", "book")
    .eq("scope_hash", scopeHash)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.status === "passed";
}

async function invokeGateProducer(
  req: Request,
  bookId: string,
  producer: ProducerName,
): Promise<ProducerOutcome> {
  const config = PRODUCERS[producer];
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!supabaseUrl || !serviceKey || !authHeader) {
    return {
      passed: false,
      status: "blocked",
      error: `${config.label} producer is not configured.`,
      source: "producer",
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${config.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: authHeader,
      },
      body: JSON.stringify({ bookId }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        passed: false,
        status: "blocked",
        error: payload?.error || payload?.message || `${config.label} failed (${response.status}).`,
        source: "producer",
      };
    }

    return {
      passed: payload?.passed === true && payload?.status === "ready",
      status: typeof payload?.status === "string" ? payload.status : "blocked",
      error: typeof payload?.error === "string" ? payload.error : null,
      source: "producer",
    };
  } catch (error) {
    return {
      passed: false,
      status: "blocked",
      error: error instanceof Error ? error.message : String(error),
      source: "producer",
    };
  }
}

async function getBookScopeHash(
  sc: ReturnType<typeof serviceClient>,
  bookId: string,
): Promise<string | null> {
  const { data, error } = await sc.rpc(
    "compute_book_publication_hash",
    { p_book_id: bookId },
  );
  if (error) throw error;
  return typeof data === "string" && data.length > 0 ? data : null;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const parsed = await validateBody(req, BodySchema);
    if (parsed instanceof Response) return parsed;
    const { bookId, mode } = parsed;

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
      const { data: adminRow, error: adminErr } = await sc
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (adminErr) return serverError(adminErr);
      authorized = !!adminRow;
    }
    if (!authorized) return forbidden("Not the owner of this book");

    if (mode === "interrupted") {
      const { data: job, error: jobErr } = await sc
        .from("generation_jobs")
        .select("id")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (jobErr) return serverError(jobErr);

      if (!job) {
        return json({
          ready: false,
          jobStatus: null,
          authority: "server_interrupted",
        });
      }

      const { data: updated, error: updateErr } = await sc
        .from("generation_jobs")
        .update({
          status: "partial",
          completed_at: null,
          error_code: "QUALITY_PIPELINE_ERROR",
          error_message: "Publication quality review stopped before certification completed.",
        })
        .eq("id", job.id)
        .select("status")
        .single();
      if (updateErr) return serverError(updateErr);

      return json({
        ready: false,
        jobStatus: updated?.status ?? "partial",
        authority: "server_interrupted",
      });
    }

    const { data: chapters, error: chapterErr } = await sc
      .from("chapters")
      .select("id, is_generated, content")
      .eq("book_id", bookId);
    if (chapterErr) return serverError(chapterErr);

    const chapterCount = chapters?.length ?? 0;
    const generatedCount = (chapters ?? []).filter(
      (chapter) => chapter.is_generated === true
        && typeof chapter.content === "string"
        && chapter.content.trim().length > 0,
    ).length;
    const completeManuscript = chapterCount > 0 && generatedCount === chapterCount;

    const initialScopeHash = await getBookScopeHash(sc, bookId);
    let initialStructuralPassed = false;
    let initialRightsPassed = false;

    if (initialScopeHash) {
      [initialStructuralPassed, initialRightsPassed] = await Promise.all([
        latestGatePassed(sc, bookId, initialScopeHash, "structural"),
        latestGatePassed(sc, bookId, initialScopeHash, "rights"),
      ]);
    }

    let consistency: ProducerOutcome = initialStructuralPassed
      ? { passed: true, status: "ready", error: null, source: "current_attestation" }
      : { passed: false, status: "blocked", error: null, source: "not_run" };
    let rights: ProducerOutcome = initialRightsPassed
      ? { passed: true, status: "ready", error: null, source: "current_attestation" }
      : { passed: false, status: "blocked", error: null, source: "not_run" };

    if (completeManuscript) {
      // Only run producers whose current-hash PASS is missing. This avoids paying
      // for the semantic consistency model every time an already-certified job is
      // merely re-read, while still rerunning after edits or a latest BLOCKED row.
      if (!initialStructuralPassed) {
        consistency = await invokeGateProducer(req, bookId, "structural");
      }
      if (!initialRightsPassed) {
        rights = await invokeGateProducer(req, bookId, "rights");
      }
    } else {
      consistency = {
        passed: false,
        status: "blocked",
        error: "All chapters must be generated before structural consistency certification.",
        source: "not_run",
      };
      rights = {
        passed: false,
        status: "blocked",
        error: "All chapters must be generated before publication-rights certification.",
        source: "not_run",
      };
    }

    // Producers are not allowed to mutate publication scope, but another actor may
    // edit the book concurrently. Recompute and refuse READY if the scope changed.
    const finalScopeHash = await getBookScopeHash(sc, bookId);
    const scopeStable = Boolean(initialScopeHash)
      && initialScopeHash === finalScopeHash;

    let structuralPassed = false;
    let rightsPassed = false;
    let productionPassed = false;

    if (scopeStable && finalScopeHash) {
      [structuralPassed, rightsPassed, productionPassed] = await Promise.all([
        latestGatePassed(sc, bookId, finalScopeHash, "structural"),
        latestGatePassed(sc, bookId, finalScopeHash, "rights"),
        latestGatePassed(sc, bookId, finalScopeHash, "production"),
      ]);
    }

    const { data: attestationReady, error: readinessErr } = await sc.rpc(
      "has_current_publication_attestations",
      { p_book_id: bookId },
    );
    if (readinessErr) return serverError(readinessErr);

    const checkedAt = new Date().toISOString();

    // Defense in depth during rollout: even if an environment still has an older
    // has_current_publication_attestations() definition, this endpoint refuses
    // READY unless current-hash structural, rights, and production attestations
    // all pass and no concurrent publication-scope change occurred.
    const desiredReady = completeManuscript
      && scopeStable
      && consistency.passed
      && rights.passed
      && structuralPassed
      && rightsPassed
      && productionPassed
      && attestationReady === true;

    const { data: job, error: jobErr } = await sc
      .from("generation_jobs")
      .select("id, metadata")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobErr) return serverError(jobErr);

    const diagnostics = {
      scopeStable,
      structuralPassed,
      rightsPassed,
      productionPassed,
      consistencyStatus: consistency.status,
      consistencyError: consistency.error,
      consistencySource: consistency.source,
      rightsStatus: rights.status,
      rightsError: rights.error,
      rightsSource: rights.source,
    };

    if (!job) {
      // The trust verdict exists independently of workflow telemetry. Imported or
      // manually managed books may legitimately have no generation job.
      return json({
        ready: desiredReady,
        jobStatus: null,
        checkedAt,
        chapterCount,
        generatedCount,
        ...diagnostics,
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
          : "Current server-attested editorial, evidence, structural, rights, publishability, and production gates are required before completion.",
        metadata: {
          ...previousMetadata,
          publicationQuality: {
            ready: desiredReady,
            authority: "server_attestations",
            checkedAt,
            ...diagnostics,
          },
        },
      })
      .eq("id", job.id)
      .select("status, metadata")
      .single();
    if (updateErr) return serverError(updateErr);

    // The generation_jobs trigger independently recomputes readiness on a
    // completed transition. Read back its stored verdict so a manuscript/media
    // edit in the gap between the readiness RPC and UPDATE cannot produce a PASS.
    const storedQuality = updated?.metadata && typeof updated.metadata === "object"
      ? (updated.metadata as Record<string, unknown>).publicationQuality
      : null;
    const storedReady = storedQuality && typeof storedQuality === "object"
      ? (storedQuality as Record<string, unknown>).ready === true
      : false;
    const ready = updated?.status === "completed"
      && storedReady
      && scopeStable
      && structuralPassed
      && rightsPassed
      && productionPassed;

    return json({
      ready,
      jobStatus: updated?.status ?? null,
      checkedAt,
      chapterCount,
      generatedCount,
      ...diagnostics,
      authority: "server_attestations",
    });
  } catch (e) {
    return serverError(e);
  }
});
