import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createMcpHandler, McpServer } from "npm:@modelcontextprotocol/server@^2.0.0";
import { withOAuthProtectedResource, withSupabase } from "npm:@supabase/server@^1.6.0";
import { z } from "npm:zod@^4.3.6";

import {
  enforceDurableRateLimit,
  serviceClient,
} from "../_shared/http.ts";

const OAUTH_SECURITY = [{ type: "oauth2" as const, scopes: ["email"] }];
const OAUTH_META = { securitySchemes: OAUTH_SECURITY };
const DEFAULT_APP_ORIGIN = "https://scrolllibrary.org";

const GenericObjectSchema = z.record(z.string(), z.unknown());

const BookContextOutputSchema = z.object({
  book: z.object({
    id: z.string(),
    title: z.string(),
    work_id: z.string().nullable(),
    current_publication_id: z.string().nullable(),
    certified_live: z.boolean(),
    updated_at: z.string().nullable(),
  }),
  chapters: z.array(z.object({
    id: z.string(),
    chapter_number: z.number(),
    title: z.string(),
    word_count: z.number().nullable(),
    is_generated: z.boolean().nullable().optional(),
    version_number: z.number().nullable(),
    updated_at: z.string().nullable(),
  })),
  chapter: GenericObjectSchema.nullable(),
  publication_scope_hash: z.string().nullable(),
  authoring_contract: z.object({
    canonical_mutation: z.string(),
    certified_live_mutation: z.string(),
    base_hash_required: z.boolean(),
  }),
});

const HandoffListOutputSchema = z.object({
  proposals: z.array(GenericObjectSchema),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
  certified_live: z.boolean(),
});

type BridgeAction =
  | {
      action: "book_context";
      book_id: string;
      chapter_id?: string;
    }
  | {
      action: "list_proposals";
      book_id: string;
      status?: "proposed" | "accepted" | "rejected" | "superseded";
      limit?: number;
      offset?: number;
    }
  | {
      action: "proposal_detail";
      proposal_id: string;
    }
  | {
      action: "propose_revision";
      book_id: string;
      chapter_id: string;
      provider: "chatgpt" | "claude" | "gemini" | "other";
      source_model?: string;
      external_request_id?: string;
      source_conversation_ref?: string;
      base_content_hash: string;
      proposed_title?: string;
      proposed_content: string;
      rationale?: string;
      metadata?: Record<string, unknown>;
    };

function publicOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
}

function appOrigin(): string {
  return (Deno.env.get("SCROLLLIBRARY_APP_URL") ?? DEFAULT_APP_ORIGIN).replace(/\/$/, "");
}

function reviewUrl(bookId: string): string {
  return `${appOrigin()}/book/${bookId}/ai-handoffs`;
}

function resultText(data: unknown, summary: string) {
  return {
    content: [
      { type: "text" as const, text: summary },
      { type: "text" as const, text: JSON.stringify(data) },
    ],
    structuredContent: data as Record<string, unknown>,
  };
}

function errorResult(message: string, details?: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: details ? `${message}\n${JSON.stringify(details)}` : message,
      },
    ],
  };
}

async function callPublishingBridge(
  req: Request,
  body: BridgeAction,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; data: Record<string, unknown> }> {
  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return {
      ok: false,
      status: 401,
      data: { error: "missing_authorization" },
    };
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    return {
      ok: false,
      status: 500,
      data: { error: "bridge_backend_not_configured" },
    };
  }

  const response = await fetch(
    `${publicOrigin(req)}/functions/v1/ai-publishing-bridge`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        apikey: anonKey,
      },
      body: JSON.stringify(body),
    },
  );

  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    data = { error: "invalid_bridge_response" };
  }

  return response.ok
    ? { ok: true, data }
    : { ok: false, status: response.status, data };
}

Deno.serve(
  withOAuthProtectedResource(
    withSupabase({ auth: "user" }, async (req, { supabase }) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      const limited = await enforceDurableRateLimit(serviceClient(), {
        name: "scrolllibrary-mcp",
        key: user.id,
        limit: 240,
        windowSec: 60,
      });
      if (limited) return limited;

      const handler = createMcpHandler(() => {
        const server = new McpServer(
          { name: "scrolllibrary", version: "1.0.0" },
          {
            instructions:
              "ScrollLibrary is the canonical publishing system of record. Read canonical book context before editing. External AI may submit revision proposals, but must never claim that a proposal changed the canonical manuscript. Final acceptance remains an author action inside ScrollLibrary.",
          },
        );

        server.registerTool(
          "whoami",
          {
            title: "ScrollLibrary account",
            description:
              "Return the authenticated ScrollLibrary profile for the connected account. Use this to identify which ScrollLibrary account is active.",
            inputSchema: z.object({}),
            outputSchema: z.object({
              id: z.string(),
              name: z.string().optional(),
              email: z.string().optional(),
              nickname: z.string().optional(),
            }),
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
            securitySchemes: OAUTH_SECURITY,
            _meta: { ...OAUTH_META, "openai/profile": true },
          },
          async () => {
            let fullName: string | null = null;
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .or(`user_id.eq.${user.id},id.eq.${user.id}`)
              .maybeSingle();
            fullName = profile?.full_name ?? null;

            const profileResult = {
              id: user.id,
              ...(fullName ? { name: fullName } : {}),
              ...(user.email ? { email: user.email } : {}),
              nickname: fullName
                ? `${fullName} — ScrollLibrary`
                : "ScrollLibrary account",
            };

            return {
              content: [{ type: "text", text: JSON.stringify(profileResult) }],
              structuredContent: profileResult,
              isError: false,
            };
          },
        );

        server.registerTool(
          "list_my_books",
          {
            title: "List my books",
            description:
              "List books the signed-in author can access in ScrollLibrary. Use this before asking the user to copy IDs manually.",
            inputSchema: z.object({
              limit: z.number().int().min(1).max(100).default(50),
            }),
            outputSchema: z.object({
              books: z.array(
                z.object({
                  id: z.string(),
                  title: z.string(),
                  current_publication_id: z.string().nullable(),
                  certified_live: z.boolean(),
                  updated_at: z.string().nullable(),
                }),
              ),
            }),
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
            securitySchemes: OAUTH_SECURITY,
            _meta: OAUTH_META,
          },
          async ({ limit }) => {
            const { data, error } = await supabase
              .from("books")
              .select("id,title,current_publication_id,updated_at,user_id,creator_id")
              .or(`user_id.eq.${user.id},creator_id.eq.${user.id}`)
              .order("updated_at", { ascending: false })
              .limit(limit);

            if (error) return errorResult("Could not list ScrollLibrary books.", { error: error.message });

            const books = (data ?? []).map((book) => ({
              id: book.id,
              title: book.title,
              current_publication_id: book.current_publication_id ?? null,
              certified_live: Boolean(book.current_publication_id),
              updated_at: book.updated_at ?? null,
            }));

            return resultText(
              { books },
              `Found ${books.length} ScrollLibrary book${books.length === 1 ? "" : "s"}.`,
            );
          },
        );

        server.registerTool(
          "get_book_context",
          {
            title: "Get canonical book context",
            description:
              "Read the canonical ScrollLibrary state for one book. Omit chapter_id for the chapter index; include chapter_id to retrieve that complete canonical chapter plus its base_content_hash before proposing a revision.",
            inputSchema: z.object({
              book_id: z.string().uuid(),
              chapter_id: z.string().uuid().optional(),
            }),
            outputSchema: BookContextOutputSchema,
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
            securitySchemes: OAUTH_SECURITY,
            _meta: OAUTH_META,
          },
          async ({ book_id, chapter_id }) => {
            const response = await callPublishingBridge(req, {
              action: "book_context",
              book_id,
              ...(chapter_id ? { chapter_id } : {}),
            });
            if (!response.ok) {
              return errorResult("Could not read canonical book context.", response.data);
            }
            return resultText(
              response.data,
              chapter_id
                ? "Loaded the canonical chapter. Use its base_content_hash unchanged when submitting a revision proposal."
                : "Loaded the canonical book and chapter index.",
            );
          },
        );

        server.registerTool(
          "list_ai_handoffs",
          {
            title: "List AI handoff proposals",
            description:
              "List bounded previews of external-AI revision proposals for a ScrollLibrary book. This never returns full proposed manuscripts.",
            inputSchema: z.object({
              book_id: z.string().uuid(),
              status: z.enum(["proposed", "accepted", "rejected", "superseded"]).optional(),
              limit: z.number().int().min(1).max(100).default(50),
              offset: z.number().int().min(0).max(100000).default(0),
            }),
            outputSchema: HandoffListOutputSchema,
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
            securitySchemes: OAUTH_SECURITY,
            _meta: OAUTH_META,
          },
          async ({ book_id, status, limit, offset }) => {
            const response = await callPublishingBridge(req, {
              action: "list_proposals",
              book_id,
              ...(status ? { status } : {}),
              limit,
              offset,
            });
            if (!response.ok) return errorResult("Could not list AI handoffs.", response.data);
            return resultText(response.data, "Loaded ScrollLibrary AI handoff previews.");
          },
        );

        server.registerTool(
          "get_ai_handoff",
          {
            title: "Get AI handoff proposal",
            description:
              "Retrieve one selected AI revision proposal with the current canonical chapter so the author or model can compare them. This is read-only.",
            inputSchema: z.object({
              proposal_id: z.string().uuid(),
            }),
            outputSchema: GenericObjectSchema,
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              openWorldHint: false,
            },
            securitySchemes: OAUTH_SECURITY,
            _meta: OAUTH_META,
          },
          async ({ proposal_id }) => {
            const response = await callPublishingBridge(req, {
              action: "proposal_detail",
              proposal_id,
            });
            if (!response.ok) return errorResult("Could not load AI handoff.", response.data);
            return resultText(response.data, "Loaded the selected AI handoff and current canonical chapter.");
          },
        );

        server.registerTool(
          "propose_chapter_revision",
          {
            title: "Propose chapter revision",
            description:
              "Submit a complete proposed replacement for one chapter to the ScrollLibrary AI Handoff Inbox. This does NOT modify the canonical manuscript. The author must review and accept it inside ScrollLibrary. Call get_book_context with chapter_id first and pass back its exact base_content_hash.",
            inputSchema: z.object({
              book_id: z.string().uuid(),
              chapter_id: z.string().uuid(),
              provider: z.enum(["chatgpt", "claude", "gemini", "other"]),
              source_model: z.string().max(120).optional(),
              request_id: z.string().max(240).optional(),
              source_conversation_ref: z.string().max(1000).optional(),
              base_content_hash: z.string().regex(/^[0-9a-f]{64}$/),
              proposed_title: z.string().max(500).optional(),
              proposed_content: z.string().min(1).max(1000000),
              rationale: z.string().max(8000).optional(),
            }),
            outputSchema: GenericObjectSchema,
            annotations: {
              readOnlyHint: false,
              destructiveHint: false,
              openWorldHint: false,
            },
            securitySchemes: OAUTH_SECURITY,
            _meta: OAUTH_META,
          },
          async ({
            book_id,
            chapter_id,
            provider,
            source_model,
            request_id,
            source_conversation_ref,
            base_content_hash,
            proposed_title,
            proposed_content,
            rationale,
          }) => {
            const response = await callPublishingBridge(req, {
              action: "propose_revision",
              book_id,
              chapter_id,
              provider,
              ...(source_model ? { source_model } : {}),
              ...(request_id ? { external_request_id: request_id } : {}),
              ...(source_conversation_ref ? { source_conversation_ref } : {}),
              base_content_hash,
              ...(proposed_title ? { proposed_title } : {}),
              proposed_content,
              ...(rationale ? { rationale } : {}),
              metadata: {
                transport: "mcp",
                canonical_mutation_permitted: false,
              },
            });

            if (!response.ok) {
              const stale = response.data.error === "stale_base";
              return errorResult(
                stale
                  ? "The canonical chapter changed after it was read. Fetch fresh book context and regenerate the proposal; do not overwrite newer author work."
                  : "ScrollLibrary did not accept the revision proposal.",
                response.data,
              );
            }

            const result = {
              ...response.data,
              review_url: reviewUrl(book_id),
              canonical_manuscript_changed: false,
            };

            return resultText(
              result,
              "Revision proposal saved to ScrollLibrary. The canonical manuscript has NOT changed; the author must review and accept it in the AI Handoff Inbox.",
            );
          },
        );

        return server;
      });

      return handler.fetch(req);
    }),
  ),
);
