import {
  badRequest,
  forbidden,
  json,
  preflight,
  requireUser,
  serverError,
  serviceClient,
  validateBody,
  z,
  enforceDurableRateLimit,
} from "../_shared/http.ts";
import {
  normalizeProvider,
  proposalPreview,
  sha256Hex,
} from "../_shared/ai-handoff.ts";

const BookContext = z.object({
  action: z.literal("book_context"),
  book_id: z.string().uuid(),
  chapter_id: z.string().uuid().optional(),
});

const ProposeRevision = z.object({
  action: z.literal("propose_revision"),
  book_id: z.string().uuid(),
  chapter_id: z.string().uuid(),
  provider: z.string().min(1).max(40),
  source_model: z.string().max(120).optional(),
  external_request_id: z.string().max(240).optional(),
  source_conversation_ref: z.string().max(1000).optional(),
  base_content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  proposed_title: z.string().max(500).optional(),
  proposed_content: z.string().min(1).max(1_000_000),
  rationale: z.string().max(8000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ListProposals = z.object({
  action: z.literal("list_proposals"),
  book_id: z.string().uuid(),
  status: z.enum(["proposed", "accepted", "rejected", "superseded"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const ProposalDetail = z.object({
  action: z.literal("proposal_detail"),
  proposal_id: z.string().uuid(),
});

const AcceptProposal = z.object({
  action: z.literal("accept_proposal"),
  proposal_id: z.string().uuid(),
});

const RejectProposal = z.object({
  action: z.literal("reject_proposal"),
  proposal_id: z.string().uuid(),
});

const Body = z.discriminatedUnion("action", [
  BookContext,
  ProposeRevision,
  ListProposals,
  ProposalDetail,
  AcceptProposal,
  RejectProposal,
]);

type Admin = ReturnType<typeof serviceClient>;

async function ownedBook(admin: Admin, userId: string, bookId: string) {
  const { data, error } = await admin
    .from("books")
    .select("id,title,user_id,creator_id,current_publication_id,work_id,updated_at")
    .eq("id", bookId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.user_id !== userId && data.creator_id !== userId) return null;
  return data;
}

async function currentChapterHash(admin: Admin, chapterId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("compute_chapter_authoring_hash", {
    p_chapter_id: chapterId,
  });
  if (error) throw error;
  return typeof data === "string" && /^[0-9a-f]{64}$/.test(data) ? data : null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST required");

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const admin = serviceClient();
    const limited = await enforceDurableRateLimit(admin, {
      name: "ai-publishing-bridge",
      key: auth.userId,
      limit: 120,
      windowSec: 60,
    });
    if (limited) return limited;

    const body = await validateBody(req, Body);
    if (body instanceof Response) return body;

    if (body.action === "book_context") {
      const book = await ownedBook(admin, auth.userId, body.book_id);
      if (!book) return forbidden("Book not found or not owned by user");

      const { data: chapters, error: chaptersError } = await admin
        .from("chapters")
        .select("id,chapter_number,title,word_count,is_generated,version_number,updated_at")
        .eq("book_id", body.book_id)
        .order("chapter_number", { ascending: true });
      if (chaptersError) throw chaptersError;

      let chapter: Record<string, unknown> | null = null;
      if (body.chapter_id) {
        const { data: target, error: targetError } = await admin
          .from("chapters")
          .select("id,book_id,chapter_number,title,content,word_count,is_generated,version_number,academic_mode,citation_style,chapter_references,updated_at")
          .eq("id", body.chapter_id)
          .eq("book_id", body.book_id)
          .maybeSingle();
        if (targetError) throw targetError;
        if (!target) return json({ error: "chapter_not_found" }, 404);

        const baseHash = await currentChapterHash(admin, target.id);
        chapter = {
          ...target,
          base_content_hash: baseHash,
        };
      }

      const { data: publicationHash } = await admin.rpc(
        "compute_book_publication_hash",
        { p_book_id: body.book_id },
      );

      return json({
        book: {
          id: book.id,
          title: book.title,
          work_id: book.work_id,
          current_publication_id: book.current_publication_id,
          certified_live: Boolean(book.current_publication_id),
          updated_at: book.updated_at,
        },
        chapters: chapters ?? [],
        chapter,
        publication_scope_hash:
          typeof publicationHash === "string" ? publicationHash : null,
        authoring_contract: {
          canonical_mutation: "proposal_then_author_acceptance",
          certified_live_mutation: "blocked_requires_revision_edition",
          base_hash_required: true,
        },
      });
    }

    if (body.action === "propose_revision") {
      const book = await ownedBook(admin, auth.userId, body.book_id);
      if (!book) return forbidden("Book not found or not owned by user");

      const { data: chapter, error: chapterError } = await admin
        .from("chapters")
        .select("id,book_id,chapter_number,title,version_number,updated_at")
        .eq("id", body.chapter_id)
        .eq("book_id", body.book_id)
        .maybeSingle();
      if (chapterError) throw chapterError;
      if (!chapter) return json({ error: "chapter_not_found" }, 404);

      if (body.external_request_id) {
        const provider = normalizeProvider(body.provider);
        const { data: existing, error: existingError } = await admin
          .from("ai_handoff_proposals")
          .select("id,status,book_id,chapter_id,created_at")
          .eq("user_id", auth.userId)
          .eq("provider", provider)
          .eq("external_request_id", body.external_request_id)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          return json({
            idempotent: true,
            proposal: existing,
            certified_revision_required: Boolean(book.current_publication_id),
          });
        }
      }

      const currentHash = await currentChapterHash(admin, body.chapter_id);
      if (!currentHash) {
        return json({ error: "chapter_hash_unavailable" }, 409);
      }
      if (currentHash !== body.base_content_hash) {
        return json({
          error: "stale_base",
          expected_base_hash: body.base_content_hash,
          current_base_hash: currentHash,
        }, 409);
      }

      const provider = normalizeProvider(body.provider);
      const proposedContentHash = await sha256Hex(body.proposed_content);

      const { data: proposal, error: insertError } = await admin
        .from("ai_handoff_proposals")
        .insert({
          user_id: auth.userId,
          book_id: body.book_id,
          chapter_id: body.chapter_id,
          provider,
          source_model: body.source_model ?? null,
          operation: "replace_chapter",
          external_request_id: body.external_request_id ?? null,
          source_conversation_ref: body.source_conversation_ref ?? null,
          base_content_hash: body.base_content_hash,
          proposed_title: body.proposed_title?.trim() || null,
          proposed_content: body.proposed_content,
          proposed_content_hash: proposedContentHash,
          rationale: body.rationale ?? null,
          metadata: body.metadata ?? {},
          status: "proposed",
        })
        .select("id,status,provider,source_model,book_id,chapter_id,base_content_hash,proposed_content_hash,created_at")
        .single();

      if (insertError) {
        if (insertError.code === "23505" && body.external_request_id) {
          const { data: existing } = await admin
            .from("ai_handoff_proposals")
            .select("id,status,book_id,chapter_id,created_at")
            .eq("user_id", auth.userId)
            .eq("provider", provider)
            .eq("external_request_id", body.external_request_id)
            .maybeSingle();
          return json({
            idempotent: true,
            proposal: existing,
            certified_revision_required: Boolean(book.current_publication_id),
          });
        }
        throw insertError;
      }

      return json({
        idempotent: false,
        proposal,
        certified_revision_required: Boolean(book.current_publication_id),
        next_action: book.current_publication_id
          ? "review_proposal_then_create_revision_edition"
          : "review_proposal_then_accept_or_reject",
      }, 201);
    }

    if (body.action === "list_proposals") {
      const book = await ownedBook(admin, auth.userId, body.book_id);
      if (!book) return forbidden("Book not found or not owned by user");

      let query = admin
        .from("ai_handoff_proposals")
        .select("id,chapter_id,provider,source_model,operation,status,proposed_title,rationale,proposed_content,proposed_content_hash,base_content_hash,source_conversation_ref,created_at,decided_at")
        .eq("user_id", auth.userId)
        .eq("book_id", body.book_id)
        .order("created_at", { ascending: false })
        .limit(body.limit ?? 50);
      if (body.status) query = query.eq("status", body.status);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []).map((row) => ({
        ...row,
        proposed_content_preview: proposalPreview(row.proposed_content ?? ""),
        proposed_content: undefined,
      }));

      return json({
        proposals: rows,
        certified_live: Boolean(book.current_publication_id),
      });
    }

    if (body.action === "proposal_detail") {
      const { data: proposal, error } = await admin
        .from("ai_handoff_proposals")
        .select("*")
        .eq("id", body.proposal_id)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (error) throw error;
      if (!proposal) return json({ error: "proposal_not_found" }, 404);

      const book = await ownedBook(admin, auth.userId, proposal.book_id);
      if (!book) return forbidden();

      const { data: chapter, error: chapterError } = await admin
        .from("chapters")
        .select("id,chapter_number,title,content,version_number,updated_at")
        .eq("id", proposal.chapter_id)
        .eq("book_id", proposal.book_id)
        .maybeSingle();
      if (chapterError) throw chapterError;

      return json({
        proposal,
        current_chapter: chapter,
        current_base_hash: chapter
          ? await currentChapterHash(admin, chapter.id)
          : null,
        certified_live: Boolean(book.current_publication_id),
      });
    }

    if (body.action === "accept_proposal") {
      const { data, error } = await admin.rpc("accept_ai_handoff_proposal", {
        p_user_id: auth.userId,
        p_proposal_id: body.proposal_id,
      });
      if (error) throw error;
      const result = (data ?? {}) as Record<string, unknown>;
      if (result.accepted === true) return json(result);
      const reason = String(result.reason ?? "proposal_not_accepted");
      const status = reason === "forbidden" ? 403
        : reason === "proposal_not_found" ? 404
        : 409;
      return json(result, status);
    }

    if (body.action === "reject_proposal") {
      const { data, error } = await admin.rpc("reject_ai_handoff_proposal", {
        p_user_id: auth.userId,
        p_proposal_id: body.proposal_id,
      });
      if (error) throw error;
      const result = (data ?? {}) as Record<string, unknown>;
      if (result.rejected === true) return json(result);
      const reason = String(result.reason ?? "proposal_not_rejected");
      const status = reason === "forbidden" ? 403
        : reason === "proposal_not_found" ? 404
        : 409;
      return json(result, status);
    }

    return badRequest("Unknown action");
  } catch (error) {
    return serverError(error, "ai_publishing_bridge_error");
  }
});
