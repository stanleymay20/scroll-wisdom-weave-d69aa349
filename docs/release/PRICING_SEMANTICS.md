# ScrollLibrary pricing semantics

This contract defines customer-facing meanings for pricing units. UI copy and backend metering must not diverge from these meanings.

## Subscription ladder

Public list prices are:

- Free: $0.
- Creator: $19/month or $190/year.
- Pro: $69/month or $690/year.
- Teams: $199/month or $1,990/year.

Annual pricing is approximately ten months of monthly list price for twelve months of service. Institution / Enterprise contracts are negotiated separately and are not a fifth self-serve subscription tier.

## Book project

A book project is a monthly creation slot. It is not a promise that every project can consume the plan's maximum chapters multiplied by maximum words per chapter.

The monthly AI-generated word pool is the authoritative shared text-generation capacity across projects.

Recommended customer note:

> Book projects are creation slots. Your monthly AI-word allowance is shared across the books you generate.

## AI-generated words

AI-generated words are a shared monthly compute allowance. Successful text generation consumes the allowance according to the server billing meter. Failed/reserved usage must follow the existing reservation/refund contract.

ScrollLibrary must not create silent paid overages. When a bounded monthly compute allowance is exhausted, the paid compute path stays blocked until the customer deliberately upgrades or purchases an eligible add-on.

## Generated visuals

Under the current backend contract, one visual credit is reserved for one AI visual generation request.

Customer-facing pricing should prefer "AI-generated visuals" over opaque "visual credits" and disclose the unit semantics in help text.

## Narration minutes

Under the current TTS contract, one standard narration minute consumes one audio credit. Customer-facing pricing should therefore display narration minutes rather than audio credits.

This is an allowance for generated speech, not a promise that a complete audiobook is included.

## One-time usage packs

The current production billing authority grants one-time text, visual and narration packs into the current UTC calendar month. Until the durable wallet migration is implemented and qualified, customer-facing copy must state that unused add-on units reset at UTC month-end and do not roll over.

A future non-expiring purchased-credit wallet requires a separate reservation/refund-safe ledger migration; the UI must not advertise that behavior before the server authority exists.

## Marketplace service fee

The public fee ladder for future ScrollLibrary-facilitated marketplace sales is:

- Free: 10%.
- Creator: 7%.
- Pro: 5%.
- Teams: 3%.

The listed percentage is ScrollLibrary's service fee only. Payment processing, taxes, refunds, chargebacks and currency conversion may be separate.

The marketplace fee applies only where ScrollLibrary facilitates the customer transaction. ScrollLibrary must not take an additional marketplace commission on royalties or proceeds from external channels such as KDP, Ingram, bookstores or other off-platform sales.

Until marketplace GA is enabled and verified, pricing must qualify the benefit, for example:

> Marketplace service fee when marketplace selling is available.

## Publishing-service ISBN eligibility

Publishing-service payment creates a service order and format eligibility. It does not instantly sell or transfer a raw ISBN number. ISBN assignment occurs only for an eligible defined publication product after validation.

## Print fulfillment

Physical manufacturing and shipping are separate from subscription access and publishing-service identity work. When print fulfillment becomes GA-ready, checkout must show the provider/manufacturing amount, shipping, taxes, ScrollLibrary fulfillment/service fee and total before payment. Reader marketplace checkout must not stack an undisclosed second platform commission on top of the published marketplace fee.

## Bundle-value invariant

Unless a higher-priced bundle explicitly includes additional named service value, the bundle price must be lower than buying the equivalent number of Single Edition services separately.
