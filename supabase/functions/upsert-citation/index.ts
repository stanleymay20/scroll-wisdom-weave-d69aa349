// upsert-citation — author-scoped write for a single book_citations row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, preflight, json, badRequest, unauthorized, forbidden, requireUser, serverError } from "../_shared/http.ts";

const AuthorSchema = z.object({
  family: z.string().optional(),
  given: z.string().optional(),
  literal: z.string().optional(),
  orcid: z.string().optional(),
});

const BodySchema = z.object({
  id: z.string().uuid().optional(),
  book_id: z.string().uuid(),
  chapter_id: z.string().uuid().nullish(),
  source_type: z.enum([
    "journal_article","book","government_report","company_report",
    "white_paper","news_article","standard","regulation","website","dataset",
  ]).default("journal_article"),
  citation_text: z.string().min(1).max(2000),
  citation_key: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_\-]+$/),
  authors: z.array(AuthorSchema).default([]),
  publisher: z.string().max(300).nullish(),
  container_title: z.string().max(300).nullish(),
  volume: z.string().max(40).nullish(),
  issue: z.string().max(40).nullish(),
  pages: z.string().max(40).nullish(),
  doi: z.string().max(200).nullish(),
  isbn: z.string().max(40).nullish(),
  url: z.string().url().max(1000).nullish(),
  accessed_at: z.string().nullish(),
  publication_date: z.string().max(40).nullish(),
  confidence: z.enum(["verified","unverified","requires_review"]).default("unverified"),
  notes: z.string().max(2000).nullish(),
});

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid input", parsed.error.flatten());
    const body = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ownership check: user must be book owner or collaborator.
    const { data: book } = await admin
      .from("books")
      .select("id,user_id,creator_id")
      .eq("id", body.book_id)
      .maybeSingle();
    if (!book) return badRequest("Book not found");

    const isOwner = book.user_id === auth.userId || book.creator_id === auth.userId;
    let isCollab = false;
    if (!isOwner) {
      const { data: collab } = await admin
        .from("book_collaborators")
        .select("id")
        .eq("book_id", body.book_id)
        .eq("user_id", auth.userId)
        .maybeSingle();
      isCollab = !!collab;
    }
    if (!isOwner && !isCollab) return forbidden("Only authors can manage citations");

    // Optional DOI/ISBN dedupe (skip when updating same row)
    if (body.doi) {
      const { data: dupe } = await admin
        .from("book_citations")
        .select("id")
        .eq("book_id", body.book_id)
        .eq("doi", body.doi)
        .maybeSingle();
      if (dupe && dupe.id !== body.id) {
        return badRequest("A citation with this DOI already exists for this book", { existing_id: dupe.id });
      }
    }

    const payload = {
      ...body,
      authors: body.authors as unknown as object,
      accessed_at: body.accessed_at || null,
    };

    const upsert = body.id
      ? admin.from("book_citations").update(payload).eq("id", body.id).select().single()
      : admin.from("book_citations").insert(payload).select().single();

    const { data, error } = await upsert;
    if (error) return badRequest(error.message);
    return json({ citation: data });
  } catch (e) {
    return serverError(e);
  }
});
