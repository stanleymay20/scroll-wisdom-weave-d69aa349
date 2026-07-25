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

    // Ownership check
    const { data: book, error: bookErr } = await sc
      .from("books")
      .select("id, user_id, cover_url, book_type")
      .eq("id", bookId)
      .maybeSingle();
    if (bookErr) return serverError(bookErr);
    if (!book) return badRequest("Book not found");
    if (book.user_id !== auth.userId) {
      // admin bypass
      const { data: adminRow } = await sc
        .from("user_roles").select("role").eq("user_id", auth.userId).eq("role", "admin").maybeSingle();
      if (!adminRow) return forbidden("Not the owner of this book");
    }

    const { data: chapters, error: chErr } = await sc
      .from("chapters")
      .select("chapter_number, title, content")
      .eq("book_id", bookId)
      .order("chapter_number", { ascending: true });
    if (chErr) return serverError(chErr);

    const report = auditBookForPublishability(
      (chapters ?? []).map((c) => ({
        chapter_number: c.chapter_number,
        title: c.title ?? "",
        content: c.content,
      })),
      { hasCover: !!book.cover_url, bookType: book.book_type },
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

    return json({ id: inserted.id, report });
  } catch (e) {
    return serverError(e);
  }
});
