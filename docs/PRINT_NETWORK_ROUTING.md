# ScrollLibrary Print Network Routing

Status: design + deterministic domain foundation. No provider credentials, production flags, checkout activation, or database mutation are introduced by this document.

## Purpose

ScrollLibrary must not depend on a single printer. The platform should operate a qualified print network and route physical-book jobs to the most appropriate provider for the order.

The network separates four provider roles:

- `api_pod`: automated print-on-demand for ordinary one-off/low-volume fulfillment.
- `regional_bulk`: qualified local/regional commercial printers for larger runs.
- `premium_specialty`: specialist printers for finishes such as foil, ribbons, printed endpapers, or jacketed hardcovers.
- `distribution`: wholesale/distribution infrastructure; never treated as ordinary direct fulfillment.

Provider names and commercial contracts are configuration, not domain logic.

## Routing is two-stage

### Stage 1 — capability shortlist

The router filters providers by facts that are knowable before requesting prices:

- qualification status;
- provider enabled/suspended state;
- paperback/hardcover capability;
- destination market;
- quantity range;
- required product capabilities;
- live-quote capability;
- blind-shipping capability;
- tracking capability;
- direct fulfillment vs distribution boundary.

For public reader checkout, a provider must support live quoting, blind shipping, and tracking. Manual regional quotes are useful for bulk author orders but must not silently back a real-time storefront promise.

A routing miss returns no provider. It must never invent a fallback.

### Stage 2 — compare real quotes

Only after eligible providers return actual quotes may ScrollLibrary select a provider on economics.

The quote selector compares:

- landed cost;
- quote freshness;
- delivery SLA;
- provider reliability floor.

Quotes in different currencies are not compared until an upstream currency-normalization step has produced comparable amounts. Silent numerical comparison of EUR, USD, GBP, etc. is forbidden.

Price never overrides qualification. A suspended or unqualified printer cannot win because it is cheaper.

## Default routing behavior

These are routing preferences, not permanent vendor assignments:

- one/few ordinary copies → qualified API POD first;
- bulk orders (default comparison threshold: 50 copies) → qualified regional printer first, API POD retained as quoteable fallback where its quantity limits allow;
- premium/special-edition requirements → qualified specialty provider first;
- wholesale/bookstore/library distribution → distribution adapter only.

The final choice is based on eligible, fresh, comparable quotes rather than the pre-quote preference alone.

## Local/regional print partner standard

A local printer is not added to the production routing pool merely because it can print books or offers a low price.

Minimum evidence before `qualified` status:

- physical sample approved;
- ScrollLibrary print artifacts pass the printer's file-preflight path;
- packaging approved;
- reprint/defect policy confirmed;
- privacy/data-processing terms confirmed;
- shipping PII is not exposed in printer/logging workflows beyond operational need;
- turnaround SLA confirmed;
- shipment tracking confirmed;
- blind/white-label shipping confirmed for workflows that require it.

A printer may be `probation` while evidence is incomplete or after reliability degradation. `suspended` providers are excluded from all automatic routing.

## Reliability

Provider reliability is represented as basis points (0–10,000) in the pure routing layer. The initial automated quote selector uses a default minimum of 9,500 bps (95%). This is a policy default, not a claim about any existing provider.

A future operational implementation should derive reliability from measured evidence such as:

- successful manufacturing rate;
- defect/reprint rate;
- on-time shipment rate;
- tracking quality;
- cancellation/refund handling;
- support response time;
- quote-to-settlement cost variance.

Reliability must never be self-reported by the provider and blindly trusted.

## Privacy boundary

The routing engine only needs destination country/region for shortlist decisions. Full delivery address remains outside the routing domain until a provider quote/order actually requires it.

Provider credentials stay server-only. Shipping PII must not enter analytics, audit logs, error messages, or client-visible provider payloads.

## Commercial activation boundary

The Print Network foundation can merge while all print switches remain OFF, but actual manufacturing must not be sold or marketed as production-ready until issue #133 is closed and representative paperback + hardcover physical proofs are received and signed off.

Suggested independent server flags remain:

- `GA_PRINT_FULFILLMENT_ENABLED`
- `GA_PRINT_READER_CHECKOUT_ENABLED`
- `GA_PRINT_DISTRIBUTION_ENABLED`

General ScrollLibrary commercial GA must not imply any of these flags.

## Initial provider strategy

The provider-neutral architecture allows a first API POD adapter (for example Lulu, subject to current API/commercial due diligence), later qualified German/EU regional printers for bulk/specialty work, and a separate wholesale distribution adapter (for example Ingram, subject to account/API validation).

No exclusive printer relationship is required by the architecture.
