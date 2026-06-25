// validate-publication-typography
// Runs the Layout Engine + Page Validator over a book's chapters and
// returns a structured typography/pagination report. Publication-blocking
// rules are enforced by publish-work; this function exists for the UI
// (Typography Report) to preview blockers before requesting certification.
import { preflight, requireUser, validateBody, json, serverError, serviceClient, z } from "../_shared/http.ts";
import { runPublicationGuard } from "../_shared/layout/index.ts";

const Body = z.object({ book_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const body = await validateBody(req, Body); if (body instanceof Response) return body;
    const sc = serviceClient();

    const { data: book } = await sc
      .from("books")
      .select("id, user_id, design_settings")
      .eq("id", body.book_id)
      .maybeSingle();
    if (!book) return json({ error: "book_not_found" }, 404);
    if (book.user_id !== auth.userId) return json({ error: "forbidden" }, 403);

    const { data: chapters } = await sc
      .from("chapters")
      .select("id, chapter_number, title, content")
      .eq("book_id", body.book_id)
      .order("chapter_number");

    const result = runPublicationGuard(chapters ?? []);
    return json(result);
  } catch (e) {
    return serverError(e);
  }
});
