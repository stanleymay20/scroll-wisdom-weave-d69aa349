# Germany Publication Compliance V1

Status: implementation candidate
Reviewed against public official sources: 2026-09-15

## Purpose

ScrollLibrary must not treat possession of an ISBN as permission, proof of rights, or proof of legal compliance.

This V1 introduces a Germany-focused controlled-release workflow that combines:

1. **system-verifiable facts** already owned by ScrollLibrary; and
2. **publisher declarations** for obligations that the platform cannot independently prove from the book record.

The result is deliberately called **controlled-release readiness**, not legal certification.

## Assurance boundary

ScrollLibrary may say:

- publication trust gates are current;
- a verified publishing identity is attached;
- a format-specific ISBN is assigned;
- explicit German price metadata exists;
- the publisher made specified declarations at a recorded time;
- a legal-deposit completion record was entered.

ScrollLibrary must not say:

- the publisher is legally entitled to operate merely because a checkbox was selected;
- the book is legally compliant in every respect;
- a LUCID declaration has been independently verified unless a separate verification workflow exists;
- a self-declared imprint or deposit action is equivalent to regulator confirmation.

## V1 pre-release checks

### System checked

- current ScrollLibrary publication attestations pass for the current manuscript state;
- canonical Publishing Identity exists and the imprint is marked verified;
- the selected paperback, hardcover or EPUB product has its own ISBN assignment for the canonical language and edition;
- for a commercial release declared as intended for Germany, the distribution record contains an explicit Germany/EUR price and ONIX price type `04`.

### Publisher declared

- the publisher's operating/business basis has been reviewed;
- the book's Impressum/imprint has been checked;
- a German National Library legal-deposit plan has been acknowledged where the publisher is Germany-based;
- the applicable state legal-deposit plan has been acknowledged;
- if direct publisher-to-consumer sales are enabled, the direct-sales legal notice has been checked;
- for physical German-market fulfilment, packaging responsibility is identified and, where the publisher declares itself responsible, LUCID registration status is recorded.

## Brandenburg rule modeled in V1

V1 explicitly models Brandenburg because the initial ScrollLibrary Press operating context is Brandenburg.

For a Brandenburg-based publisher (`publisher_state_code = BB`), ScrollLibrary requires acknowledgement of the Brandenburg legal-deposit plan before controlled release and tracks completion after publication.

For another German state, V1 fails closed with **manual review** rather than assuming Brandenburg law applies nationally. Future releases should add state-specific rules as independent policy modules.

## Post-release tracking

When a current Publication has `published_at`, the engine changes from pre-release only to post-release tracking.

For a Germany-based publisher it calculates the DNB one-week window from publication time and reports:

- pending;
- completed; or
- overdue.

Brandenburg completion is tracked separately because the Brandenburg rule is tied to the beginning of distribution and has its own state-law basis.

Completion timestamps are publisher declarations unless ScrollLibrary later integrates a regulator/library receipt or submission API.

## Authoritative sources

The V1 engine links to official sources rather than copying legal text into product logic.

- German Book Price Fixing Act (Buchpreisbindungsgesetz):
  https://www.gesetze-im-internet.de/buchprg/
- German National Library Act (DNBG):
  https://www.gesetze-im-internet.de/dnbg/
- Brandenburg Press Act (BbgPG), including Impressum and legal-deposit provisions:
  https://bravors.brandenburg.de/gesetze/bbgpg
- Central Agency Packaging Register / LUCID:
  https://www.verpackungsregister.org/

### Rules reflected in V1

- BuchPrG § 5 requires the publisher/importer to set and publish a VAT-inclusive retail price for an edition intended for sale to final customers in Germany; the Act also covers qualifying electronic books.
- DNBG §§ 14–16 provide for deposit of physical and non-physical media and establish the one-week delivery period from the start of distribution/public access for covered deposits.
- BbgPG § 8 requires specified printer/publisher identity and address information for printed works in scope.
- BbgPG § 13 contains Brandenburg state legal-deposit obligations, including a rule for digital editions.
- Packaging obligations depend on the actual fulfilment/packaging role. ScrollLibrary therefore records responsibility first and never infers LUCID applicability merely from the existence of a printed book.

## Data model

`publication_compliance_declarations` is keyed by:

`book + jurisdiction + product_form + language + edition_label`

That prevents a declaration for a paperback from silently carrying over to a hardcover or EPUB and preserves the same product identity discipline as ISBN allocation.

Browser roles have owner-filtered read access only. All writes go through the authenticated `de-publication-compliance` Edge Function using the service role after an ownership check.

## Readiness states

- `CONTROLLED_RELEASE_READY`: all V1 pre-release controls applicable to the declared scope are satisfied.
- `REQUIRES_ATTENTION`: at least one pre-release control is blocking.
- `POST_RELEASE_ACTION_REQUIRED`: pre-release controls passed, a Publication exists, and a post-release deposit action remains pending/overdue/manual-review.

These states are operational controls. They are not legal opinions.

## Future hardening

- add state-law modules for all German Länder;
- attach cryptographically bound evidence artifacts for imprint and deposit receipts;
- integrate official DNB submission receipts where technically available;
- add independent administrator/counsel review without allowing self-review;
- connect Germany controlled-release readiness to trade-distribution release gates only after staging validation and legal review;
- preserve the distinction between legal obligations, trade requirements, and ScrollLibrary quality policy.
