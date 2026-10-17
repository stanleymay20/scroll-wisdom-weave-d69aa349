# ScrollLibrary Print Fulfillment Architecture

Status: design foundation for issue #152. This document is intentionally non-operational: it defines contracts, states, gates, and rollout order without enabling production print commerce.

## 1. Product objective

ScrollLibrary should support physical editions without becoming a printer-specific application.

Target customer journey:

`Create → Verify → Publish edition → Print preflight → Quote → Pay → Manufacture → Ship → Track → Reconcile`

Initial product scope:

1. Author proof copies and author copies.
2. Reader direct purchase from eligible ScrollLibrary book pages.
3. Wholesale/distribution integrations as a separate later workflow.

Supported launch bindings:

- Paperback.
- Hardcover.

Future provider-supported bindings may be added without changing the domain contract.

## 2. Hard release dependency

Commercial print fulfillment MUST remain disabled until issue #133 is closed.

The print pipeline inherits the exact manuscript and PDF integrity requirements of the canonical export pipeline. A generated PDF is not sufficient evidence of print readiness. Before any print flag can be enabled, ScrollLibrary must have:

- Unicode-safe interior PDF rendering with embedded-font evidence.
- No silent manuscript transliteration/deletion.
- Correct trim, bleed, gutter, pagination, figure, and barcode geometry.
- Hardcover-specific cover/spine geometry where the provider requires it.
- At least one real paperback proof received and signed off.
- At least one real hardcover proof received and signed off.
- Exact-release evidence tying artifacts to the deployed source revision.

## 3. Domain boundaries

### Canonical publication domain

Owns:

- work/book identity;
- manuscript content;
- author identity;
- publication edition identity;
- ISBN and imprint metadata;
- interior/cover artifacts;
- certification and publication provenance.

### Print fulfillment domain

Owns:

- print variants;
- manufacturing compatibility;
- short-lived quotes;
- fulfillment orders;
- provider jobs;
- shipping/tracking state;
- provider events and reconciliation;
- print-specific customer service outcomes such as reprint/refund/cancel.

The print provider must never become the system of record for manuscript content or publication identity.

### Payment domain

Owns customer payment and refunds. Payment state and provider fulfillment state are related but distinct. A payment success must never be interpreted as manufacturing success.

## 4. Edition identity

A ScrollLibrary work may have several publication-format editions.

Example:

- ebook edition;
- paperback edition;
- hardcover edition.

Where retail/distribution rules require it, each format must have its own ISBN. A provider SKU or print-job ID is not a substitute for ScrollLibrary's canonical publication edition identity.

Suggested invariant:

`work → publication edition → print variant → quote → print order → provider job`

A print order MUST reference an immutable publication artifact fingerprint so later manuscript edits cannot silently change a job already quoted or ordered.

## 5. Provider-neutral contract

The first fulfillment adapter may be Lulu Print API / Lulu Direct, but application code should depend on a ScrollLibrary provider interface.

Illustrative TypeScript contract:

```ts
export interface PrintProvider {
  validateVariant(input: PrintVariantInput): Promise<VariantValidation>;
  quote(input: PrintQuoteRequest): Promise<PrintQuoteResult>;
  createOrder(input: ProviderOrderRequest): Promise<ProviderOrderResult>;
  getOrder(providerOrderId: string): Promise<ProviderOrderSnapshot>;
  cancelOrder(providerOrderId: string): Promise<ProviderCancelResult>;
  normalizeEvent(input: unknown): ProviderEvent;
}
```

Provider-specific product codes, status names, shipping levels, and metadata must be mapped inside the adapter.

## 6. Core data model

Names are provisional and should be reconciled against the live production schema before migration authoring.

### `print_variants`

Represents a manufacturable physical configuration tied to one publication edition.

Suggested fields:

- `id`
- `publication_edition_id`
- `binding` (`paperback`, `hardcover`)
- `trim_width_in`
- `trim_height_in`
- `interior_color_mode`
- `paper_type`
- `cover_finish`
- `bleed`
- `page_count`
- `interior_artifact_sha256`
- `cover_artifact_sha256`
- `provider_profile_version`
- `status` (`draft`, `preflight_passed`, `blocked`, `retired`)
- timestamps

### `print_quotes`

Immutable short-lived economics snapshot.

Suggested fields:

- `id`
- `print_variant_id`
- `provider`
- `provider_quote_id` if supplied
- `quantity`
- destination country/region abstraction
- `currency`
- `manufacturing_amount`
- `shipping_amount`
- `fulfillment_fee_amount`
- `tax_amount`
- `provider_total_amount`
- `scrolllibrary_fee_amount`
- `retail_amount` when reader purchase
- `expires_at`
- normalized shipping method data
- provider response fingerprint/provenance
- timestamps

Quotes MUST expire. Checkout after expiry requires a re-quote.

### `print_orders`

Canonical ScrollLibrary order state.

Suggested fields:

- `id`
- `print_variant_id`
- `quote_id`
- `order_kind` (`proof`, `author_copy`, `reader_purchase`)
- `buyer_user_id` nullable for guest checkout where later allowed
- encrypted/tokenized address reference rather than raw address where feasible
- `payment_reference`
- `status`
- `idempotency_key`
- `provider`
- `provider_order_id`
- economics snapshot
- `placed_artifact_sha256`
- timestamps

### `print_order_events`

Append-only audit trail.

Suggested fields:

- `id`
- `print_order_id`
- `source` (`scrolllibrary`, `payment`, `provider`, `reconciler`, `admin`)
- `event_type`
- normalized status
- source event ID
- source event fingerprint
- safe/redacted payload summary
- timestamp

Raw customer address must never be copied into this audit table.

## 7. Order state machine

Recommended normalized states:

- `draft`
- `quoted`
- `payment_pending`
- `paid`
- `submission_pending`
- `submitted`
- `accepted_by_provider`
- `in_production`
- `shipped`
- `delivered`
- `cancel_pending`
- `cancelled`
- `refund_pending`
- `refunded`
- `provider_rejected`
- `needs_review`

Terminal/error state must retain enough provenance to support deterministic recovery.

Important transitions:

### Paid but provider rejects

`paid → submission_pending → provider_rejected → refund_pending/needs_review`

Never report `ordered` merely because payment succeeded.

### Provider accepted but webhook delayed

`submitted → accepted_by_provider`

A periodic reconciler may advance state from provider readback. Reconciliation must be idempotent.

### Duplicate client retry

The same `idempotency_key` must return the same logical order. It must not create another payment or provider job.

## 8. Security and privacy

- Provider credentials live only in server/edge secret storage.
- Client code never calls a print provider with privileged credentials.
- Shipping PII must not be logged.
- Webhooks must be signature-verified where supported. If a provider does not support signed webhooks, use an untrusted notification only as a trigger for authenticated server-side readback.
- Provider event IDs/fingerprints must prevent replay.
- Admin print-order tools require explicit authorization independent of ordinary author permissions.
- Public tracking views reveal only minimal fulfillment data.
- Order lookup tokens must not expose sequential identifiers.

## 9. Economics

Two commercial modes must remain distinct.

### Author proof / author copies

Author pays provider-equivalent cost plus any disclosed ScrollLibrary service fee and taxes. No author royalty is created.

### Reader purchase

Reader-facing price may include:

`manufacturing + shipping + provider fee + tax + payment fee allocation + ScrollLibrary fee + author earnings`

Author earnings should be posted only from settled, reconciled economics. Estimated checkout margin is not final earnings.

Pricing floors must block orders whose configured retail price cannot cover required costs.

## 10. Checkout sequencing

Recommended pattern:

1. Validate edition and print preflight.
2. Create provider quote.
3. Persist immutable ScrollLibrary quote.
4. Show quote with expiry.
5. Create payment intent/session using the immutable quote.
6. After authoritative payment confirmation, enqueue provider submission.
7. Submit provider job exactly once.
8. Persist provider ID and normalized response.
9. Track/reconcile to shipped/delivered.
10. Settle author economics after the platform's defined settlement boundary.

Do not invoke provider manufacturing directly from the browser checkout success page.

## 11. Release flags

Suggested fail-closed server flags:

- `GA_PRINT_FULFILLMENT_ENABLED`
- `GA_PRINT_READER_CHECKOUT_ENABLED`
- `GA_PRINT_DISTRIBUTION_ENABLED`

Rules:

- General commercial GA MUST NOT imply any of these flags.
- Author-copy launch may enable `GA_PRINT_FULFILLMENT_ENABLED` while reader checkout remains disabled.
- Distribution remains independently disabled until its own operational evidence passes.
- Client UI may hide/disable unavailable capabilities, but server flags remain authoritative.

## 12. Phase 1: author proof and author copies

This is the safest first commercial slice.

Required UI:

- binding selector;
- trim/interior/paper/finish options allowed by the selected provider;
- quantity;
- delivery destination;
- live/short-lived quote;
- order confirmation;
- order status/tracking.

Required evidence:

- paperback proof order completed;
- hardcover proof order completed;
- artifact fingerprints match the edition ordered;
- quote/order totals reconcile with provider records;
- duplicate submission test produces one provider job;
- PII/log redaction test passes;
- failed-provider path tested.

## 13. Phase 2: reader physical checkout

Only after Phase 1 proves manufacturing reliability.

Required additional work:

- public product availability rules;
- author retail price configuration;
- economics floor validation;
- customer checkout;
- shipping method selection where supported;
- customer notifications;
- refund/reprint support;
- author earnings ledger integration;
- abuse/risk controls;
- consumer tax/legal review by supported market.

## 14. Phase 3: wholesale distribution

Wholesale distribution is not the same as direct POD fulfillment.

Keep separate states for:

- publication edition;
- direct POD availability;
- wholesale distribution submission;
- distributor approval;
- retailer availability.

An Ingram/Lightning Source adapter should be designed only after the exact operational/API path for the ScrollLibrary Press account is confirmed. Do not emulate distribution with direct-ship jobs.

## 15. Provider strategy

### Lulu first

Why it fits the direct-fulfillment slice:

- print-on-demand model;
- paperback and hardcover configurations;
- API-oriented direct fulfillment;
- manufacturing and shipping economics per order;
- no inventory requirement for ordinary POD jobs.

All concrete product codes and API request/response schemas must be sourced from current official provider documentation during implementation.

### Ingram later

Why it fits distribution:

- paperback and hardcover printing;
- global distribution infrastructure;
- retail/library channel focus;
- format-specific publishing/ISBN workflow.

Treat it as a distribution adapter, not as the canonical ScrollLibrary publication record.

## 16. Observability and reconciliation

Required metrics/events:

- quote success/failure by provider/product/country;
- quote latency;
- payment-to-submission latency;
- provider submission success/failure;
- duplicate suppression count;
- production duration;
- ship/delivery latency;
- cancellations/refunds/reprints;
- provider reconciliation drift;
- margin variance between quote and settled cost.

Alert on:

- paid orders with no provider job after threshold;
- provider jobs with no canonical order;
- stale fulfillment states;
- cost variance above tolerance;
- webhook verification failure spikes.

## 17. Testing matrix

At minimum:

- paperback vs hardcover;
- one copy vs multiple copies;
- domestic vs cross-border shipping;
- quote expiration;
- payment retry;
- provider timeout;
- provider 4xx validation failure;
- provider 5xx retry;
- duplicate webhook;
- replayed webhook;
- delayed webhook + successful reconciliation;
- cancel before production where permitted;
- cancel after production has begun;
- refund after provider rejection;
- unsupported product combination;
- stale artifact hash;
- publication edition changed after quote;
- address PII absent from logs.

## 18. Rollout order

1. Close #133 and archive print-safe artifact evidence.
2. Finalize this architecture against live schema.
3. Implement provider-neutral domain types/state machine.
4. Add Lulu adapter in sandbox/test mode.
5. Add author proof/author-copy flow behind `GA_PRINT_FULFILLMENT_ENABLED=false`.
6. Receive and sign off real paperback + hardcover proofs.
7. Run exact-release operational tests.
8. Enable author-copy print fulfillment only.
9. Observe reliability/cost/support load.
10. Build reader checkout behind separate flag.
11. Add distribution only after direct fulfillment is stable.

## 19. Definition of done for the architecture phase

- Provider-neutral domain accepted.
- No direct provider coupling in publication/manuscript models.
- State machine and failure recovery documented.
- Security/privacy boundary documented.
- Release flags independent of existing commercial GA.
- #133 remains an explicit commercial blocker.
- First implementation task is small enough to build/test without enabling production commerce.
