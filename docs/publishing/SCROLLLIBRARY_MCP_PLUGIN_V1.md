# ScrollLibrary MCP Plugin v1

## Product boundary

ScrollLibrary is the canonical publishing system of record. ChatGPT, Claude, Gemini and other MCP clients may be authoring interfaces, but the connector deliberately does **not** give them authority to accept manuscript revisions, certify releases, assign ISBNs or publish books.

The connector exposes a proposal-only authoring workflow:

1. OAuth-authenticated client identifies the ScrollLibrary account.
2. Client lists books owned/available to that account.
3. Client reads canonical book/chapter context.
4. Client receives the chapter's `base_content_hash`.
5. Client submits a complete revision proposal through the existing AI Publishing Bridge.
6. ScrollLibrary stores the proposal with provenance and optimistic-concurrency protection.
7. The author reviews it in `/book/:bookId/ai-handoffs`.
8. Only the ScrollLibrary review surface can accept the proposal into the canonical manuscript.

## Endpoint

After controlled deployment:

```
https://lrricdforqfkaaciammv.supabase.co/functions/v1/mcp
```

The endpoint uses MCP Streamable HTTP and Supabase Auth as its OAuth 2.1 authorization server.

## OAuth

The repository config prepares:

```toml
[auth.oauth_server]
enabled = true
authorization_url_path = "/oauth/consent"
allow_dynamic_registration = true

[functions.mcp]
verify_jwt = false
```

`verify_jwt=false` is intentional for this endpoint. Authentication is performed inside the function by the current Supabase MCP middleware:

- `withOAuthProtectedResource()` — RFC 9728 protected-resource metadata and `WWW-Authenticate` challenges.
- `withSupabase({ auth: "user" })` — validates the OAuth bearer token and provides an RLS-scoped Supabase client.

The consent UI is `/oauth/consent`.

### Production prerequisite

Before production OAuth is enabled, verify the Lovable-managed Supabase project uses an **asymmetric JWT signing key (ES256 or RS256)**. Current Supabase MCP middleware rejects legacy HS256 for this authenticated pattern.

Do not rotate or migrate the production signing key from an uncontrolled chat session. Perform that through the controlled Lovable/Supabase operational workflow, then test existing web/mobile sessions and the MCP OAuth handshake.

## Tools

### `whoami`
Read-only. Returns the connected ScrollLibrary profile and is marked as the OpenAI profile tool.

### `list_my_books`
Read-only. Lists books available to the authenticated account.

### `get_book_context`
Read-only. Returns canonical book state and the chapter index. When `chapter_id` is supplied it returns the full canonical chapter and `base_content_hash`.

### `list_ai_handoffs`
Read-only, paginated. Returns bounded proposal previews only.

### `get_ai_handoff`
Read-only. Returns one selected proposal and the current canonical chapter for comparison.

### `propose_chapter_revision`
Non-destructive write. Calls the existing `ai-publishing-bridge` with the user's bearer token. It never receives direct canonical manuscript authority. The tool returns the ScrollLibrary review URL and explicitly states that the canonical manuscript has not changed.

There is intentionally no MCP `accept_proposal`, `publish_book`, `certify_publication` or `assign_isbn` tool in v1.

## ChatGPT

Current OpenAI plugins use MCP. In ChatGPT developer mode, connect the production HTTPS endpoint above. The server advertises OAuth on each tool and exposes an authenticated profile tool for multi-account clarity.

## Claude and other MCP clients

Use the same endpoint. Supabase Auth performs OAuth 2.1 login/consent and each tool call runs under the signed-in user's permissions.

## Controlled rollout checklist

1. Merge only after the exact feature head passes full ScrollLibrary CI/GA gates.
2. In the controlled Lovable/Supabase environment, verify production JWT signing is ES256 or RS256.
3. Confirm the production Auth Site URL is the ScrollLibrary web origin hosting `/oauth/consent`.
4. Apply/push the OAuth server config through the controlled deployment workflow.
5. Deploy the `mcp` Edge Function.
6. Verify unauthenticated `POST /functions/v1/mcp` returns 401 with a protected-resource `WWW-Authenticate` challenge.
7. Verify `GET /functions/v1/mcp/oauth-protected-resource` points to the project's Auth issuer.
8. Test OAuth in MCP Inspector.
9. Connect ChatGPT in developer mode and test all six tools.
10. Connect Claude to the same endpoint and repeat.
11. Verify a revision submitted from either client appears in ScrollLibrary's AI Handoff Inbox and cannot mutate canonical content without author acceptance.
12. Review registered OAuth clients and test revocation.

## Security notes

- External model identity strings (`provider`, `source_model`) are provenance labels, not security principals.
- Authorization is derived only from the validated OAuth user.
- Tool inputs are untrusted and validated with Zod.
- The MCP adapter does not expose the service role to tool handlers.
- Proposal mutation is delegated to the already-hardened AI Publishing Bridge using the same bearer token.
- Canonical acceptance remains server-owned and author-mediated.
