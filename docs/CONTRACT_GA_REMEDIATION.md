# ScrollLibrary Contract GA Remediation

Status: IN PROGRESS
Branch: `claude/scroll-wisdom-weave-review-mtckux`

This document records the executable remediation of the contract audit. It is intentionally fail-closed: public trust claims must not outrun server-authoritative evidence.

## Required invariants

1. Credential evidence is server authoritative. Browser roles may not fabricate integrity evidence or authoritative assessment scores.
2. Contract 6C is the only issuance authority. It must evaluate learner reading/assessment state, not book-generation state.
3. Contract 12 uses a real SHA-256 content digest over a canonical book representation. Missing live provenance is `unverifiable`, never implicitly valid.
4. Public verification status is derived from revocation + provenance + coverage + integrity. `not revoked` is not synonymous with `valid`.
5. Contract 2 user-content determinism overrides Contract 3 auto-remediation once content has been accepted or user-edited. Automatic retries are permitted only before committed content becomes user-owned.
6. Book-type governance has one canonical contract model shared by client/server generation paths.
7. Contract 8 assessment-rigor evidence is persisted and required by server-side certificate issuance.
8. Contracts 9–11 must distinguish advisory checks from blocking checks accurately; frozen summaries must match executable behavior.
9. Certificate issuer identity and public certificate labels are canonical and non-overclaiming.
10. Verified Learning Deck language is reserved for decks that actually satisfy reading/assessment/integrity requirements.
11. Performance SLAs measure elapsed time from an operation/page baseline, not absolute `performance.now()` values.

No contract may be described as cryptographic, immutable, verified, or hard-enforced unless the corresponding server-side invariant is actually enforced and regression-tested.
