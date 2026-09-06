// qa-publishability-audit
// -----------------------
// Runs the deterministic Publishability QA auditor over a book's chapters
// and persists the result to book_qa_reports so the UI can show it and the
// gating layers can consult it. Owner-only.
//
// POST { bookId: uuid } → { report: QAReport, id: string }
//
// verify_jwt defaults are honored by the platform; we validate in-code.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  corsHeaders, preflight, json, badRequest, unauthorized, forbidden,
  serverError, requireUser, validateBody, z, serviceClient, enforceRateLimit,
} from "../_shared/http.ts";
import { auditBookForPublishability } from "../_shared/qaPublishability.ts";
import { captureBookScopeHash, recordBoundAttestation, scopeStabilityError } from "../_shared/publicationScope.ts";


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

    const rate = enforceRateLimit({ name: "qa-audit", key: auth.userId, limit: 30, windowSec: 60 });
    if (rate) return rate;

    const sc = serviceClient();

    // Live historically used creator_id. Query only stable legacy columns first
    // so this function can run before the additive books.user_id migration lands.
    const { data: book, error: bookErr } = await sc
      .from("books")
      .select("id, creator_id, cover_image_url, book_type")
      .eq("id", bookId)
      .maybeSingle();
    if (bookErr) return serverError(bookErr);
    if (!book) return badRequest("Book not found");

    let isOwner = book.creator_id === auth.userId;

    // Newer/imported records may rely on user_id with creator_id null. Query the
    // newer column separately so a legacy schema that does not have user_id does
    // not make the entire ownership lookup fail.
    if (!isOwner && book.creator_id == null) {
      const { data: modernOwner, error: modernOwnerErr } = await sc
        .from("books")
        .select("user_id")
        .eq("id", bookId)
        .maybeSingle();

      if (!modernOwnerErr) {
        isOwner = modernOwner?.user_id === auth.userId;
      } else {
        const missingUserIdColumn = modernOwnerErr.code === "42703"
          || /user_id.*does not exist|column .*user_id/i.test(modernOwnerErr.message ?? "");
        if (!missingUserIdColumn) return serverError(modernOwnerErr);
      }
    }

    if (!isOwner) {
      // admin bypass
      const { data: adminRow } = await sc
        .from("user_roles").select("role").eq("user_id", auth.userId).eq("role", "admin").maybeSingle();
      if (!adminRow) return forbidden("Not the owner of this book");
    }

    // Bind the deterministic audit to the exact manuscript state it inspects.
    const scopeBefore = await captureBookScopeHash(sc, bookId);

    const { data: chapters, error: chErr } = await sc
      .from("chapters")
      .select("chapter_number, title, content")
      .eq("book_id", bookId)
      .order("chapter_number", { ascending: true });
    if (chErr) return serverError(chErr);

    const scopeAfter = await captureBookScopeHash(sc, bookId);
    const scopeLoadError = scopeStabilityError(scopeBefore, scopeAfter);
    if (scopeLoadError) return json({ error: scopeLoadError }, 409);
    const auditScopeHash = scopeAfter as string;

    const report = auditBookForPublishability(
      (chapters ?? []).map((c) => ({
        chapter_number: c.chapter_number,
        title: c.title ?? "",
        content: c.content,
      })),
      { hasCover: !!book.cover_image_url, bookType: book.book_type },
    );

    const { data: inserted, error: insErr } = await sc
      .from("book_qa_reports")
      .insert({
        book_id: bookId,
        score: report.score,
        status: report.status,
        blocker_count: report.blockerCount,
        warning_count: report.warningCount,
        info_count: report.infoCount,
        totals: report.totals,
        issues: report.issues,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    if (insErr) return serverError(insErr);

    // Server-side publication gate attestation (qa), bound to the audited state.
    // Fail closed if the manuscript changed while the audit ran.
    const qaPassed = report.status === "ready" && report.blockerCount === 0;
    const attestFailure = await recordBoundAttestation(sc, {
      bookId,
      userId: auth.userId,
      gate: "qa",
      status: qaPassed ? "passed" : "blocked",
      expectedScopeHash: auditScopeHash,
      artifact: {
        status: report.status,
        score: report.score,
        blockerCount: report.blockerCount,
        warningCount: report.warningCount,
      },
      sourceRecordId: inserted.id,
      chapterId: null,
    });
    if (attestFailure) return serverError(new Error(attestFailure));


    return json({ id: inserted.id, report });
  } catch (e) {
    return serverError(e);
  }
});
