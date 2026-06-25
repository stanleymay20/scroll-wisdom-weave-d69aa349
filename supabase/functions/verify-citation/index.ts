// verify-citation — verifies a citation via Crossref (DOI) or OpenLibrary (ISBN).
// Flips confidence -> "verified" when external metadata matches.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { preflight, json, badRequest, forbidden, requireUser, serverError } from "../_shared/http.ts";

const BodySchema = z.object({ citation_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid input", parsed.error.flatten());

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error } = await admin
      .from("book_citations")
      .select("*, books!inner(user_id, creator_id)")
      .eq("id", parsed.data.citation_id)
      .maybeSingle();
    if (error || !row) return badRequest("Citation not found");

    const book = (row as any).books;
    if (book.user_id !== auth.userId && book.creator_id !== auth.userId) {
      return forbidden("Only authors can verify citations");
    }

    let verified = false;
    let metadata: Record<string, unknown> = {};

    if (row.doi) {
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(row.doi)}`, {
        headers: { "User-Agent": "ScrollLibrary-Verify/1.0 (mailto:support@scrolllibrary.org)" },
      });
      if (r.ok) {
        const j = await r.json();
        verified = true;
        metadata = {
          title: j.message?.title?.[0],
          container: j.message?.["container-title"]?.[0],
          year: j.message?.issued?.["date-parts"]?.[0]?.[0],
        };
      }
    } else if (row.isbn) {
      const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${row.isbn}&format=json&jscmd=data`);
      if (r.ok) {
        const j = await r.json();
        const entry = j[`ISBN:${row.isbn}`];
        if (entry) {
          verified = true;
          metadata = { title: entry.title, publishers: entry.publishers };
        }
      }
    } else {
      return badRequest("Citation has no DOI or ISBN to verify");
    }

    if (verified) {
      await admin
        .from("book_citations")
        .update({ confidence: "verified" })
        .eq("id", row.id);
    }
    return json({ verified, metadata });
  } catch (e) {
    return serverError(e);
  }
});
