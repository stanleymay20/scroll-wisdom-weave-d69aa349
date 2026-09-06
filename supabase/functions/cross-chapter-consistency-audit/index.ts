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
import { routeChat } from "../_shared/ai-router.ts";
import {
  captureBookScopeHash,
  recordBoundAttestation,
  scopeStabilityError,
} from "../_shared/publicationScope.ts";
import {
  buildConsistencyDigest,
  deterministicConsistencyIssues,
  parseSemanticConsistencyReview,
  type ConsistencyChapter,
} from "../_shared/structuralConsistency.ts";

const BodySchema = z.object({ bookId: z.string().uuid() });

function modelForPlan(plan: string): string {
  return plan === "premium" || plan === "prophet_tier"
    ? "google/gemini-2.5-pro"
    : "google/gemini-2.5-flash";
}

async function authorizeBook(sc: ReturnType<typeof serviceClient>, bookId: string, userId: string) {
  const { data: book, error: legacyErr } = await sc
    .from("books")
    .select("id, creator_id")
    .eq("id", bookId)
    .maybeSingle();
  if (legacyErr) throw legacyErr;
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
      .select("id")
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

    const limited = enforceRateLimit({
      name: "cross-chapter-consistency-audit",
      key: auth.userId,
      limit: 8,
      windowSec: 60,
    });
    if (limited) return limited;

    const sc = serviceClient();
    const ownership = await authorizeBook(sc, body.bookId, auth.userId);
    if (!ownership.found) return badRequest("Book not found");
    if (!ownership.authorized) return forbidden("Not the owner of this book");

    const scopeBefore = await captureBookScopeHash(sc, body.bookId);
    if (!scopeBefore) {
      return json({ passed: false, status: "blocked", error: "PUBLICATION_SCOPE_UNAVAILABLE" }, 409);
    }

    const [{ data: book, error: bookErr }, { data: chapterRows, error: chapterErr }] = await Promise.all([
      sc.from("books").select("id,title,category,book_type,language").eq("id", body.bookId).single(),
      sc.from("chapters")
        .select("chapter_number,title,content,word_count,is_generated")
        .eq("book_id", body.bookId)
        .order("chapter_number", { ascending: true }),
    ]);
    if (bookErr) throw bookErr;
    if (chapterErr) throw chapterErr;

    const chapters = (chapterRows || []) as ConsistencyChapter[];
    const deterministic = deterministicConsistencyIssues(chapters);
    const deterministicBlockers = deterministic.filter((issue) => issue.severity === "blocker");

    let semantic = null as ReturnType<typeof parseSemanticConsistencyReview>;
    let semanticFailure: string | null = null;
    let usedModel: string | null = null;
    let correlationId: string | null = null;

    // Do not spend model tokens on a manuscript already known to be structurally invalid.
    if (deterministicBlockers.length === 0) {
      const { data: subscription } = await sc
        .from("subscriptions")
        .select("tier,status")
        .eq("user_id", auth.userId)
        .maybeSingle();
      const plan = subscription?.status === "active" ? subscription.tier : "free";
      const model = modelForPlan(plan || "free");
      const digest = buildConsistencyDigest(chapters);
      const prompt = `You are ScrollLibrary's independent cross-chapter consistency auditor.

BOOK: ${book.title}
CATEGORY: ${book.category || "unknown"}
TYPE: ${book.book_type || "text"}
LANGUAGE: ${book.language || "en"}

Audit ONLY the supplied chapter signatures. Look for material contradictions across chapters, terminology/definition drift, incompatible chronology or numeric claims, duplicate exposition, chapter-purpose collisions, and conclusions that contradict earlier premises. Do not invent missing context and do not penalize legitimate progression where a later chapter explicitly refines an earlier idea.

A blocker must be publication-material: a reasonable reader could be misled, confused about the book's own position, or encounter substantially duplicated chapters. Minor wording differences are warnings only.

Return JSON only with this exact shape:
{
  "analysisComplete": true,
  "status": "passed" | "blocked",
  "blockers": [{"code":"...","message":"...","chapters":[1,2]}],
  "warnings": [{"code":"...","message":"...","chapters":[1,2]}]
}

Rules:
- status MUST be blocked when blockers is non-empty.
- status MAY be passed with warnings.
- analysisComplete must be false if the supplied signatures are insufficient to reach a defensible whole-book consistency verdict.
- Cite chapter numbers in every finding.

CHAPTER SIGNATURES:
${digest}`;

      correlationId = crypto.randomUUID();
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!lovableKey || !supabaseUrl || !serviceKey) {
        semanticFailure = "Consistency review model is not configured.";
      } else {
        const routed = await routeChat({
          task: "editorial_audit",
          model,
          prompt,
          messages: [
            {
              role: "system",
              content: "You are an independent publishing consistency auditor. Be conservative, evidence-bound, and return valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.05,
          responseFormat: "json_object",
          workId: body.bookId,
          userId: auth.userId,
          correlationId,
          allowCache: false,
        }, {
          apiKey: lovableKey,
          supabaseUrl,
          supabaseServiceKey: serviceKey,
        });

        if (!routed.ok) {
          semanticFailure = `${routed.errorCode}: ${routed.message.slice(0, 160)}`;
        } else {
          usedModel = routed.model;
          semantic = parseSemanticConsistencyReview(routed.text);
          if (!semantic) semanticFailure = "Semantic consistency verdict could not be parsed as the required JSON contract.";
          else if (!semantic.analysisComplete) semanticFailure = "Semantic consistency analysis was incomplete.";
        }
      }
    }

    const scopeAfter = await captureBookScopeHash(sc, body.bookId);
    const scopeError = scopeStabilityError(scopeBefore, scopeAfter);
    if (scopeError) {
      return json({ passed: false, status: "blocked", error: scopeError }, 409);
    }

    const semanticBlockers = semantic?.blockers || [];
    const passed = deterministicBlockers.length === 0
      && !semanticFailure
      && semantic?.analysisComplete === true
      && semantic.status === "passed"
      && semanticBlockers.length === 0;

    const attestationError = await recordBoundAttestation(sc, {
      bookId: body.bookId,
      userId: auth.userId,
      gate: "structural",
      status: passed ? "passed" : "blocked",
      expectedScopeHash: scopeBefore,
      artifact: {
        audit: "cross_chapter_consistency_v1",
        deterministic,
        semantic,
        semanticFailure,
        model: usedModel,
        correlationId,
        chapterCount: chapters.length,
        inspectedAt: new Date().toISOString(),
      },
    });
    if (attestationError) return serverError(new Error(attestationError));

    return json({
      passed,
      status: passed ? "ready" : "blocked",
      deterministicIssues: deterministic,
      semantic,
      error: semanticFailure,
      model: usedModel,
      authority: "server_structural_attestation",
    });
  } catch (error) {
    return serverError(error);
  }
});
