# ScrollLibrary pricing semantics

This contract defines customer-facing meanings for pricing units. UI copy and backend metering must not diverge from these meanings.

## Book project

A book project is a monthly creation slot. It is not a promise that every project can consume the plan's maximum chapters multiplied by maximum words per chapter.

The monthly AI-generated word pool is the authoritative shared text-generation capacity across projects.

Recommended customer note:

> Book projects are creation slots. Your monthly AI-word allowance is shared across the books you generate.

## AI-generated words

AI-generated words are a shared monthly compute allowance. Successful text generation consumes the allowance according to the server billing meter. Failed/reserved usage must follow the existing reservation/refund contract.

## Generated visuals

Under the current backend contract, one visual credit is reserved for one AI visual generation request.

Customer-facing pricing should prefer "AI-generated visuals" over opaque "visual credits" and disclose the unit semantics in help text.

## Narration minutes

Under the current TTS contract, one standard narration minute consumes one audio credit. Customer-facing pricing should therefore display narration minutes rather than audio credits.

This is an allowance for generated speech, not a promise that a complete audiobook is included.

## Marketplace service fee

The listed percentage is ScrollLibrary's service fee only. Payment processing, taxes, refunds, chargebacks and currency conversion may be separate.

Until marketplace GA is enabled and verified, pricing must qualify the benefit, for example:

> Marketplace service fee when marketplace selling is available.

## Publishing-service ISBN eligibility

Publishing-service payment creates a service order and format eligibility. It does not instantly sell or transfer a raw ISBN number. ISBN assignment occurs only for an eligible defined publication product after validation.

## Bundle-value invariant

Unless a higher-priced bundle explicitly includes additional named service value, the bundle price must be lower than buying the equivalent number of Single Edition services separately.
