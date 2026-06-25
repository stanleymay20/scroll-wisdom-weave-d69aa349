// import-citations — preview & commit batch import of citations.
// Accepts CSL-JSON (preferred) or BibTeX-lite parsed client-side into CSL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { preflight, json, badRequest, forbidden, requireUser, serverError } from "../_shared/http.ts";

const ItemSchema = z.object({
  citation_key: z.string().min(1).max(64),
  source_type: z.string().default("journal_article"),
  citation_text: z.string().min(1).max(2000),
  authors: z.array(z.object({
    family: z.string().optional(), given: z.string().optional(), literal: z.string().optional(),
  })).default([]),
  publisher: z.string().nullish(),
  container_title: z.string().nullish(),
  volume: z.string().nullish(),
  issue: z.string().nullish(),
  pages: z.string().nullish(),
  doi: z.string().nullish(),
  isbn: z.string().nullish(),
  url: z.string().nullish(),
  publication_date: z.string().nullish(),
});

const BodySchema = z.object({
  book_id: z.string().uuid(),
  items: z.array(ItemSchema).min(1).max(200),
  commit: z.boolean().default(false),
});

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid input", parsed.error.flatten());
    const { book_id, items, commit } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: book } = await admin.from("books").select("user_id, creator_id").eq("id", book_id).maybeSingle();
    if (!book) return badRequest("Book not found");
    if (book.user_id !== auth.userId && book.creator_id !== auth.userId) {
      return forbidden("Only authors can import citations");
    }

    const { data: existing } = await admin
      .from("book_citations")
      .select("citation_key, doi")
      .eq("book_id", book_id);
    const existingKeys = new Set((existing ?? []).map((r) => r.citation_key));
    const existingDois = new Set((existing ?? []).map((r) => r.doi).filter(Boolean));

    const preview = items.map((it) => {
      const dupKey = existingKeys.has(it.citation_key);
      const dupDoi = it.doi ? existingDois.has(it.doi) : false;
      return { ...it, _dup_key: dupKey, _dup_doi: dupDoi, _will_skip: dupKey || dupDoi };
    });

    if (!commit) return json({ preview, would_insert: preview.filter((p) => !p._will_skip).length });

    const toInsert = preview
      .filter((p) => !p._will_skip)
      .map(({ _dup_key, _dup_doi, _will_skip, ...rest }) => ({ ...rest, book_id }));

    if (toInsert.length === 0) return json({ inserted: 0, skipped: preview.length });

    const { error, data } = await admin.from("book_citations").insert(toInsert).select("id");
    if (error) return badRequest(error.message);
    return json({ inserted: data?.length ?? 0, skipped: preview.length - (data?.length ?? 0) });
  } catch (e) {
    return serverError(e);
  }
});
