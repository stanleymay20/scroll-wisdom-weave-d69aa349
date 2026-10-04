# ScrollLibrary Full Commercial GA Activation

This document is the production activation contract for ScrollLibrary's commercial surface.

## Release doctrine

Commercial GA is independent from specialized book-type qualification.

Commercial GA may open subscriptions, usage packs, exports, ScrollLibrary Press
publishing services, release scheduling, canonical publication, and organization/Teams
workflows.

Creator marketplace commerce is a separate release domain because it additionally
requires verified seller payout settlement. General commercial GA must never imply
third-party paid book sales are open.

Specialized authoring modes remain fail-closed until they pass the empirical provider
qualification contract and appear in both the server and client allow-lists.

Content-quality claims are also independent from commercial activation. Opening paid
checkout does not authorize near-10/10 or ScrollLibrary Press Certified claims unless
the applicable tier/model route has passed the controlled empirical qualification doctrine.

## Production Stripe catalogue — economic-v1

These identifiers are public operational IDs, not credentials.

### Recurring subscriptions

| Plan | Product | Monthly price | Annual price |
| --- | --- | --- | --- |
| Creator | `prod_VMT9BjzHXGyBlg` | `price_1ULkEvJYFIBeCvefVwBP152V` ($19) | `price_1ULkExJYFIBeCvefGSiQpyft` ($190) |
| Pro | `prod_VMTAtBU2pdiaTU` | `price_1ULkEzJYFIBeCvefmajZm6FI` ($69) | `price_1ULkF1JYFIBeCvefPPtW9NpI` ($690) |
| Teams | `prod_VMTAGw56PV9GCL` | `price_1ULkF3JYFIBeCvef3zPihTEm` ($199) | `price_1ULkF4JYFIBeCvefrtYto69u` ($1,990) |

Creator and Pro are classified in Stripe Tax as cloud-based AIaaS personal-use products.
Teams is classified as cloud-based AIaaS business-use.

### One-time usage packs

| SKU | Customer meaning | Price |
| --- | --- | --- |
| ai_text_250k | +250k AI-generated words | `price_1ULkF6JYFIBeCvefEBzHbLD8` ($15) |
| visual_50 | +50 AI-generated visual requests | `price_1ULkF8JYFIBeCvefbtz5HkGs` ($20) |
| audio_60 | +60 standard narration minutes | `price_1ULkFAJYFIBeCvefkmV2Gx84` ($15) |

### ScrollLibrary Press publishing services

| Service | Price ID | Price |
| --- | --- | ---: |
| Single Edition | `price_1ULkFCJYFIBeCvefONqZ9EHX` | $49 |
| Print + Digital | **PROVISION NEW STRIPE PRICE BEFORE GA** | $89 |
| Complete Edition | **PROVISION NEW STRIPE PRICE BEFORE GA** | $129 |
| Assisted Publishing Launch | `price_1ULkFIJYFIBeCvefbGw8qpDf` | $399 |

The former $99 Print + Digital and $149 Complete Edition price IDs are retired for new
public checkout because those bundle prices exceeded the equivalent number of $49 Single
Edition purchases. Do not reuse the historical IDs for the corrected catalogue.

Payment for a publishing service never assigns an ISBN directly. ISBN allocation remains
a downstream, format-specific, validation-gated publishing transaction.

Assisted Publishing Launch must remain unavailable until the operational service contract
in `ASSISTED_PUBLISHING_LAUNCH_SERVICE_SCOPE.md` has a staffed owner, response/turnaround
targets and tracked fulfillment lifecycle.

## Required production environment

### Browser build

```
VITE_COMMERCIAL_GA_ENABLED=true
VITE_MARKETPLACE_GA_ENABLED=false
```

Set `VITE_MARKETPLACE_GA_ENABLED=true` only after Stripe Connect onboarding,
transfer/payout settlement, refund reversal, and seller payout reconciliation have
passed production lifecycle validation.

Specialized authoring remains independent:

```
VITE_SPECIALIZED_AUTHORING_ENABLED=false
VITE_QUALIFIED_BOOK_TYPES=
```

until provider qualification evidence passes.

### Supabase Edge runtime

```
GA_PAYMENTS_ENABLED=true
GA_MARKETPLACE_PAYMENTS_ENABLED=false
GA_MARKETPLACE_PAYOUTS_ENABLED=false
GA_PUBLISHING_SERVICES_BILLING_ENABLED=true
GA_PUBLICATION_MINT_ENABLED=true

STRIPE_PRODUCT_CREATOR=prod_VMT9BjzHXGyBlg
STRIPE_PRODUCT_PRO=prod_VMTAtBU2pdiaTU
STRIPE_PRODUCT_TEAMS=prod_VMTAGw56PV9GCL

STRIPE_PRICE_CREATOR_MONTHLY=price_1ULkEvJYFIBeCvefVwBP152V
STRIPE_PRICE_CREATOR_ANNUAL=price_1ULkExJYFIBeCvefGSiQpyft
STRIPE_PRICE_PRO_MONTHLY=price_1ULkEzJYFIBeCvefmajZm6FI
STRIPE_PRICE_PRO_ANNUAL=price_1ULkF1JYFIBeCvefPPtW9NpI
STRIPE_PRICE_TEAMS_MONTHLY=price_1ULkF3JYFIBeCvef3zPihTEm
STRIPE_PRICE_TEAMS_ANNUAL=price_1ULkF4JYFIBeCvefrtYto69u

STRIPE_PRICE_ADDON_AI_TEXT_250K=price_1ULkF6JYFIBeCvefEBzHbLD8
STRIPE_PRICE_ADDON_VISUAL_50=price_1ULkF8JYFIBeCvefbtz5HkGs
STRIPE_PRICE_ADDON_AUDIO_60=price_1ULkFAJYFIBeCvefkmV2Gx84

STRIPE_PRICE_PUBLISH_SINGLE_EDITION=price_1ULkFCJYFIBeCvefONqZ9EHX
STRIPE_PRICE_PUBLISH_PRINT_DIGITAL=<NEW_ACTIVE_89_USD_PRICE_ID>
STRIPE_PRICE_PUBLISH_COMPLETE_EDITION=<NEW_ACTIVE_129_USD_PRICE_ID>
STRIPE_PRICE_PUBLISH_ASSISTED_LAUNCH=price_1ULkFIJYFIBeCvefbGw8qpDf
```

The two placeholder publishing price IDs above are deliberate fail-closed release blockers.
Do not enable publishing-service billing until active recurring/one-time Stripe objects have
been created as applicable and checkout read-back proves product, amount, currency and status.

Do not open specialized generation merely because commercial GA is open.

## Checkout consent gate

All new economic-v1 subscriptions, billing orders, and paid marketplace book checkouts
require Stripe Checkout's Terms checkbox and carry
`commercialConsentVersion=eu-digital-v1`. Fulfillment fails closed when that version is
present but Stripe does not report `consent.terms_of_service=accepted`.

Before opening paid writes, configure the connected Stripe account's public business
profile with the real ScrollLibrary merchant identity and a valid Terms of Service URL.
Stripe requires that public Terms URL before a Checkout Session can require Terms consent.
The custom acceptance text requests immediate digital performance and acknowledges the
withdrawal consequence described in the Terms. Legal wording and merchant identity still
require merchant/legal review; code must not invent them.

## Tax launch gate

Checkout enables Stripe automatic tax, billing-address collection, and tax-ID collection.

Do not enable production payments until the merchant's actual tax registrations are
correctly represented in Stripe Tax. Stripe Tax only collects tax in jurisdictions with
an active registration. At the 2026-10-01 audit, the connected Stripe account had zero
active tax registrations, so this gate remains blocked pending merchant tax/VAT status.

## Production infrastructure gate

The repository targets Supabase project `lrricdforqfkaaciammv`.
Production Supabase deployment/configuration is controlled through Lovable; do not bypass
that control plane with direct production mutations.

Do not turn on commercial browser flags until:
1. production migrations are confirmed applied,
2. billing Edge Functions are deployed from the exact release head through Lovable,
3. the Stripe catalogue variables above are installed with real matching active prices,
4. Stripe webhook secrets and GA switches are verified,
5. the production project passes database/Edge/payment lifecycle smoke tests.

## Final activation order

1. Green exact-head repository CI.
2. Provision the corrected $89 and $129 publishing-service Stripe prices.
3. Through Lovable, deploy migrations + Edge Functions to production Supabase.
4. Through the Lovable-controlled runtime, install/verify Stripe catalogue environment variables.
5. Configure/verify merchant tax registrations.
6. Run live-catalogue checkout in a non-charge test path and webhook read-back.
7. Set server GA payment/publication switches only for proven domains; keep marketplace payment switch false.
8. Set `VITE_COMMERCIAL_GA_ENABLED=true` and redeploy from exact main.
9. Verify production pricing, checkout, entitlements, usage units, exports, publishing, refunds,
   and Teams.
10. Verify creator payout settlement against a real test Connect account, then enable
   `GA_MARKETPLACE_PAYMENTS_ENABLED=true`, `GA_MARKETPLACE_PAYOUTS_ENABLED=true`,
   and `VITE_MARKETPLACE_GA_ENABLED=true`; verify paid storefront sales and payout
   settlement end to end.
11. Release specialized book types only after provider qualification evidence.
12. Activate stronger near-10/Press Certified marketing only after the corresponding
   tier/model empirical quality campaign passes.

## Creator marketplace payout gate

The repository now contains an append-only payout settlement authority and an
admin-triggered `settle-creator-payouts` worker. It atomically reserves matured,
unreversed creator earnings, reuses an active reservation on retry, sends an
idempotent Stripe Connect transfer, and records transfer acknowledgement separately
from the immutable earnings ledger. Failed transfers do not consume ledger entries.

Keep third-party paid book sales closed in production until the new migration and
Edge Function are deployed and one real Connect transfer/retry/refund lifecycle has
been proven:

```
VITE_MARKETPLACE_GA_ENABLED=false
GA_MARKETPLACE_PAYMENTS_ENABLED=false
GA_MARKETPLACE_PAYOUTS_ENABLED=false
```

After production validation, all three marketplace switches may open together.
The 14-day earnings maturity window remains the default reserve against ordinary
refunds; later refunds and chargebacks create negative ledger entries that reduce
future payable balances rather than rewriting paid history.
