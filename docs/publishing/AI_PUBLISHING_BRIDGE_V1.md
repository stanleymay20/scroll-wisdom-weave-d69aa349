# ScrollLibrary AI Publishing Bridge v1

## Purpose

ScrollLibrary is the canonical publishing system of record. General-purpose AI systems may help an author think, research, draft and revise, but they must not silently overwrite the canonical manuscript or manufacture publication readiness.

The AI Publishing Bridge creates a stable handoff contract for ChatGPT, Claude, Gemini and future agents:

**AI reads context → AI proposes a revision → ScrollLibrary records provenance → author reviews → ScrollLibrary accepts transactionally → publication trust gates become stale naturally when canonical content changes.**

Certified live publications remain immutable. A proposal may still be stored for a certified title, but acceptance returns `certified_revision_required` until a revision/edition workflow exists.

## Endpoint

Supabase Edge Function:

`POST /functions/v1/ai-publishing-bridge`

Authentication is the existing ScrollLibrary bearer-token contract. The gateway does not grant an external model direct database credentials.

## Actions

### `book_context`

Request:

```json
{
  "action": "book_context",
  "book_id": "<uuid>",
  "chapter_id": "<optional uuid>"
}
```

When `chapter_id` is provided, the response includes the canonical chapter content plus `base_content_hash`. An external AI must use that exact hash when proposing a revision.

### `propose_revision`

```json
{
  "action": "propose_revision",
  "book_id": "<uuid>",
  "chapter_id": "<uuid>",
  "provider": "chatgpt",
  "source_model": "optional model label",
  "external_request_id": "provider-side idempotency key",
  "source_conversation_ref": "optional conversation reference",
  "base_content_hash": "<64-char hash from book_context>",
  "proposed_title": "Optional replacement title",
  "proposed_content": "Complete proposed chapter text",
  "rationale": "Why the change was proposed",
  "metadata": {}
}
```

A stale base hash is rejected with HTTP 409. Retrying the same `external_request_id` is idempotent.

### `list_proposals`

```json
{
  "action": "list_proposals",
  "book_id": "<uuid>",
  "status": "proposed",
  "limit": 50
}
```

Returns bounded previews, not the full manuscript payload.

### `proposal_detail`

```json
{
  "action": "proposal_detail",
  "proposal_id": "<uuid>"
}
```

Returns the full proposed content alongside the current canonical chapter for human review.

### `accept_proposal`

```json
{
  "action": "accept_proposal",
  "proposal_id": "<uuid>"
}
```

Acceptance is a database transaction. It re-checks ownership, chapter identity, current base hash and certified-publication immutability, then writes an immutable before/after revision ledger and increments the chapter version.

### `reject_proposal`

```json
{
  "action": "reject_proposal",
  "proposal_id": "<uuid>"
}
```

## Trust model

1. External AI has no direct canonical manuscript mutation path.
2. Browser roles cannot insert/update/delete proposal authority or revision-ledger rows directly.
3. The Edge function authenticates the user and uses service authority only after proving book ownership.
4. `compute_chapter_authoring_hash` supplies optimistic concurrency for drafts.
5. Existing `compute_book_publication_hash` remains the whole-publication certification authority.
6. Accepted revisions to uncertified books change the publication scope hash; earlier attestations therefore stop matching without trusting the browser to announce the edit.
7. Certified-live manuscripts stay immutable and require an explicit revision/edition workflow.

## Product role

This bridge is the integration boundary that lets ScrollLibrary benefit from stronger general-purpose models instead of competing with them. ChatGPT or Claude can become an authoring interface; ScrollLibrary retains manuscript identity, provenance, publishing state, validation, ISBN/edition identity, release evidence and distribution lifecycle.
