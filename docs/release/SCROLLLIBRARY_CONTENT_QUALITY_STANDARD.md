# ScrollLibrary Content Quality Standard

Status: Controlled release doctrine

## Purpose

ScrollLibrary distinguishes generation from verification and verification from publication certification. No generated manuscript is described as publication-ready merely because generation completed successfully.

The product exposes three quality states:

1. **Draft** — AI-generated, editable content. No publication-quality claim.
2. **Verified** — deterministic integrity, evidence, structural, technical and rendering checks have passed for the current manuscript bytes.
3. **ScrollLibrary Press Certified** — the manuscript satisfies the stricter near-10 publication doctrine below and all required attestations remain bound to the current manuscript/publication scope.

A manuscript change invalidates stale certification evidence and requires the applicable checks to run again.

## Draft

A Draft may be complete enough to read or edit but has not earned a publication claim. Draft status may include generated chapters that have not yet completed the full publication-quality pipeline.

Required customer wording:

> AI-generated draft. Review and edit before publication.

Draft status MUST NOT be represented as:

- publication-ready;
- professionally edited;
- fact-checked;
- verified;
- ScrollLibrary Press Certified.

## Verified

Verified is a technical and integrity state, not a claim of elite literary quality.

A manuscript may be called Verified only when every applicable current-scope gate passes:

- all declared chapters exist and are fully generated;
- no unresolved generation placeholders or editorial markers remain;
- deterministic content-artifact QA passes;
- required evidence verification passes for every governed chapter;
- material factual/legal/statistical claims requiring evidence are traceable;
- technical code has passing content-bound audit evidence where applicable;
- structural consistency passes;
- asset-rights attestation passes where applicable;
- canonical production rendering passes;
- publication-scope attestations are current and bound to the manuscript hash.

Verified does not by itself mean that prose quality is 9.5/10.

## ScrollLibrary Press Certified

ScrollLibrary Press Certified is the premium publication-quality state.

A manuscript MUST NOT receive this label unless all Verified requirements pass and the following thresholds are met on the exact current manuscript:

| Dimension | Minimum |
| --- | ---: |
| Chief Editor overall | 95/100 |
| Chief Editor structural | 90/100 |
| Chief Editor academic/cognitive rigor | 90/100 |
| Chief Editor pedagogical quality | 90/100 |
| Deterministic publishability | 98/100 |
| Publishability blockers | 0 |
| Publishability warnings | 0 |
| Production-render blockers | 0 |
| Evidence blockers (when required) | 0 |
| Technical-code blockers (when applicable) | 0 |
| Rights blockers (when applicable) | 0 |

The publication pipeline may automatically repair a manuscript, but certification is awarded only after the repaired final manuscript is re-audited and all current-scope attestations pass.

## Generation-mode qualification

A book type or specialized generation mode is not promoted as near-10 quality merely because the code path exists.

Before a generation mode may be advertised as ScrollLibrary Press Certified-capable, it must complete the empirical provider-qualification campaign:

- at least 5 complete representative books;
- at least 3 independently human-reviewed passing samples;
- human-review overall average >= 9.5/10;
- every scored human-review dimension >= 9.0/10;
- zero critical human-review issues;
- Chief Editor overall >= 95/100 on passing samples;
- publishability >= 98/100 with zero blockers and zero warnings;
- required evidence, technical, rights and production gates pass;
- regeneration/revision rate remains within the generation-mode policy limit.

Qualification evidence must identify provider/model, prompt/policy version, generation mode, sample identity, audit results and human reviewer evidence. A successful deterministic test suite alone does not constitute empirical qualification.

## Representative acceptance corpus

The baseline Standard Text qualification corpus must include materially different books so the system cannot pass by overfitting one easy genre:

1. **General non-fiction / explanatory** — low-stakes topic, prose/coherence focus.
2. **Business / economics** — quantified claims and current evidence required.
3. **History / governance** — dates, named events and evidence integrity.
4. **Technical / software** — executable code, technical audit and rendering integrity.
5. **Long-form narrative non-fiction** — voice, repetition, transitions and AI-detectability pressure.

Additional specialized modes require their own mode-specific corpus before activation.

## Human-review rubric

The empirical campaign uses the existing provider-qualification reviewer contract; it does not introduce a parallel scoring schema. Human reviewers score 0.0–10.0 on:

- `contentIntegrity` — factual integrity for nonfiction; internal truth and continuity for fiction;
- `coherence` — chapter-to-chapter logic, progression, contradictions and repetition;
- `typeFidelity` — whether the complete result genuinely behaves like the declared book type;
- `readerValue` — depth, usefulness, engagement, comprehension, pedagogy and fitness for the target reader;
- `editorialPolish` — prose naturalness, pacing, structure, clarity, formatting, non-formulaic treatment and readiness for professional publication.

The existing qualification collector computes the arithmetic mean and preserves the weakest dimension. A reviewer also records their identity/controlled reviewer reference and the number of critical issues. Review notes or excerpts supporting unusually low/high scores should be retained with the review evidence without changing the collector's canonical five-dimension schema.

A sample fails human review if any critical issue exists, any dimension is below 9.0, or the computed mean is below 9.5.

## Tier semantics

Subscription tiers may use different generation or editorial models. Therefore quality claims must be evidence-backed per tier/model route.

- Free: draft/verification claims only unless separately qualified.
- Creator: may receive Verified output; ScrollLibrary Press Certified-capable status requires Creator-route empirical qualification.
- Pro: intended primary individual publication tier; certification requires Pro-route empirical qualification.
- Teams: certification requires the same manuscript quality standard as Pro plus organization workflow validation.

No tier is permitted to inherit another tier's empirical certification solely because they share application code.

## Customer-facing pricing semantics

Marketing and pricing must describe capacities truthfully:

- a **book project** is a creation slot, not a promise of a fixed manuscript length;
- monthly AI-word allowance is the governing text-generation capacity;
- one **visual credit** means one generated visual request unless the backend contract changes;
- one **audio credit** currently corresponds to approximately one standard narration minute and should be presented to customers as narration minutes;
- marketplace fee benefits must be described as available only when marketplace GA is enabled;
- publishing-service payment creates an order/eligibility record, not an immediate unconditional ISBN assignment.

## Publishing-service value rule

A publishing bundle must never cost more than buying its constituent equivalent Single Edition services separately unless the bundle clearly contains additional named services whose value is disclosed before checkout.

## Release rule

Commercial GA and content-quality certification are independent gates.

Opening subscriptions does not authorize near-10/10 marketing claims. Specialized authoring and ScrollLibrary Press Certified claims remain fail-closed until their empirical qualification evidence exists and is current.

## Auditability

Every certification result must be attributable to:

- exact manuscript/publication scope hash;
- audit model and prompt/policy version;
- deterministic QA result;
- evidence/technical/rights/production attestations as applicable;
- timestamp;
- generation tier/model route;
- human-review evidence where required by generation-mode qualification.

ScrollLibrary's defensible claim is therefore not that AI always writes perfect books. It is that the platform distinguishes drafts from verified manuscripts and can prove when a manuscript has earned a defined publication-quality certification.
