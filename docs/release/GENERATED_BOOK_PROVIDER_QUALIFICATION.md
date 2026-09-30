# Generated-Book Provider Qualification

## Purpose

Publication certification answers whether **one exact book** is ready to ship.

Provider qualification answers a harder question:

> Has this specialized generation mode repeatedly produced complete, certifiable books with enough reliability and human-reviewed quality that ScrollLibrary may expose the mode to users?

A model name is never qualification evidence. A prompt is never qualification evidence. Historical word count is never qualification evidence. Only current, full-book outcomes produced by the hardened pipeline count.

## Public release remains fail-closed

Specialized modes have two independent server controls:

1. `PROVIDER_QUALIFICATION_BOOK_TYPES` — controlled campaign access. This permits an **admin-owned** qualification book to exercise a mode without releasing it publicly.
2. `GA_QUALIFIED_BOOK_TYPES` — public server release allow-list. A specialized mode must appear here **and** `GA_ADVANCED_AUTHORING_ENABLED` must be explicitly enabled before ordinary callers can use it.

The browser independently filters specialized modes through `VITE_QUALIFIED_BOOK_TYPES`. A browser flag never grants server authority.

During qualification, keep the public release controls closed. For example:

```text
PROVIDER_QUALIFICATION_BOOK_TYPES=academic
GA_ADVANCED_AUTHORING_ENABLED=false
GA_QUALIFIED_BOOK_TYPES=
VITE_SPECIALIZED_AUTHORING_ENABLED=false
VITE_QUALIFIED_BOOK_TYPES=
```

This lets an administrator generate Academic qualification samples while every ordinary user remains on the GA Standard Text path.

## Qualification order

All generated modes are benchmarked against the same near-10 publication doctrine. Specialized modes remain fail-closed behind their release allow-list; Standard Text is the baseline path and must satisfy the same empirical quality benchmark even though it is not a specialized-mode feature flag.

Qualification order:

1. Standard Text
2. Academic
3. Technical
4. Reference
5. Professional
6. Bestseller
7. Workbook
8. Illustrated
9. Children
10. Comic
11. Fiction

Passing a later type never qualifies an earlier or adjacent type.

## Minimum empirical evidence

| Mode | Complete samples | Passing human-reviewed samples |
| --- | ---: | ---: |
| Standard Text | 5 | 3 |
| Academic | 5 | 3 |
| Technical | 5 | 3 |
| Reference | 5 | 3 |
| Professional | 5 | 3 |
| Bestseller | 5 | 3 |
| Workbook | 5 | 3 |
| Illustrated | 5 | 3 |
| Children | 5 | 3 |
| Comic | 5 | 3 |
| Fiction | 5 | 3 |

Every sample must independently pass its contract. Qualification is not based on an average that can hide a failed book.

## Universal sample thresholds

A sample must satisfy all of the following:

- Generation reaches `completed`.
- Generated chapter count exactly matches the expected chapter count.
- Chapter-attempt failure rate stays at or below the type policy limit.
- Regeneration/revision rate stays at or below the type policy limit.
- Chief Editor certification is eligible.
- Chief Editor overall score is at least **95/100**.
- Deterministic publishability status is `ready`.
- Publishability score is at least **98/100**.
- Publishability has **zero blockers and zero warnings**.
- Current-state Editorial, QA, Structural, Rights, and Production attestations pass.
- Evidence attestations pass for evidence-governed modes.
- The canonical Contract 6 book-type validator passes every generated chapter.
- Required human reviews average at least **9.5/10**, every rubric dimension is at least **9.0/10**, and there are zero critical issues.
- Chapter-attempt failure rate is at most **2%**.
- Regeneration/revision rate is at most **5%**.
- No critical defect may be averaged away by a high composite score.

Technical additionally requires a current, content-hash-bound passing code audit for every code-bearing chapter.

Illustrated, Children, and Comic additionally require current rights and production evidence for their visual assets. Qualification also proves that the rendered chapter content is actually visual:

- Illustrated: at least **3 rendered images per chapter**.
- Children: at least **4 rendered images per chapter**.
- Comic: at least **4 panel images per chapter** and images for at least **80% of detected panels**.

Every mode now uses the same maximum **2%** chapter-attempt failure rate and **5%** regeneration rate. Visual and technical modes retain their additional specialized gates.

## Reliability telemetry

Qualification measures **chapter attempts**, not raw provider API calls.

A chapter can fan out internally to research, text generation, image generation, retries, or other services. Calling a worker invocation a "provider call" would overstate what ScrollLibrary actually observes.

The generation worker therefore persists:

```json
{
  "qualificationTelemetry": {
    "chapterAttempts": 12,
    "chapterFailures": 0
  }
}
```

Historical books generated before this telemetry exists are not valid reliability samples. The collector deliberately fails them closed and asks for a fresh qualification sample.

## Human-review rubric

Human review is structured; reviewers do not enter an arbitrary overall score.

Each dimension is scored from 0 to 10:

- `contentIntegrity` — factual integrity for nonfiction; internal truth/continuity for fiction.
- `coherence` — chapter-to-chapter logic, progression, and absence of contradictions/repetition.
- `typeFidelity` — whether the result genuinely behaves like the declared book type.
- `readerValue` — usefulness, engagement, comprehension, and fitness for the target reader.
- `editorialPolish` — prose, pacing, clarity, formatting, and readiness for professional publication.

The qualification collector computes the arithmetic mean and preserves the weakest dimension. A sample passes human review only when the mean is at least 9.5/10, the weakest dimension is at least 9.0/10, and there are zero critical issues. Any critical issue blocks the sample regardless of the average.

Example review file:

```json
{
  "books": {
    "00000000-0000-4000-8000-000000000001": {
      "humanReview": {
        "reviewer": "Independent Reviewer Name",
        "criticalIssues": 0,
        "dimensions": {
          "contentIntegrity": 9.8,
          "coherence": 9.6,
          "typeFidelity": 9.7,
          "readerValue": 9.5,
          "editorialPolish": 9.6
        }
      }
    }
  }
}
```

For a visual mode, a reviewer may set `"visualAssetGatePassed": false` to veto a visually defective sample. Setting it to `true` cannot override failed server Rights or Production gates.

## Collect evidence locally

The preferred server credential is a Supabase secret key. Legacy service-role keys are accepted for compatibility. An owner-scoped publishable key + user JWT is also supported.

```bash
export QUALIFICATION_SUPABASE_URL="https://<project-ref>.supabase.co"
export QUALIFICATION_SUPABASE_SECRET_KEY="<server-only-secret>"

bun run qualification:collect -- \
  --type academic \
  --book <book-uuid-1> \
  --book <book-uuid-2> \
  --book <book-uuid-3> \
  --reviews qualification/reviews/academic.json \
  --output provider-qualification-evidence.json
```

The output contains metrics and verdicts, not manuscript text or credentials.

Exit status is non-zero unless the complete campaign qualifies.

## GitHub manual workflow

Use **Generated Book Provider Qualification** from GitHub Actions after the qualification books and reviews exist.

The workflow requires:

- book type,
- comma- or newline-separated book UUIDs,
- qualification Supabase URL,
- optional repository review JSON path,
- repository secret `QUALIFICATION_SUPABASE_SECRET_KEY` (preferred) or legacy `QUALIFICATION_SUPABASE_SERVICE_ROLE_KEY`.

The workflow always attempts to upload `provider-qualification-evidence.json` for diagnosis, then fails if the campaign is not qualified.

## Release procedure

A successful qualification workflow is necessary but does **not** automatically release a type.

After the evidence artifact is reviewed:

1. Add only the passed type to the server `GA_QUALIFIED_BOOK_TYPES` allow-list.
2. Add the same type to `VITE_QUALIFIED_BOOK_TYPES`.
3. Set `VITE_SPECIALIZED_AUTHORING_ENABLED=true` for the specialized-generation surface only.
4. Set `GA_ADVANCED_AUTHORING_ENABLED=true` on the backend when the qualified mode is deliberately released.
5. **Do not disable `PMF_MODE` just to expose a qualified book type.** Payments, exports, study tooling, canonical publication controls, and other post-GA features remain independently closed.
6. Redeploy from the exact reviewed `main` head.
7. Run production verification.
8. Revoke the qualification-only type from `PROVIDER_QUALIFICATION_BOOK_TYPES` if the campaign is complete.

Never put an unqualified mode into a public allow-list merely to generate test data.

## Current status

At introduction of this contract, **no specialized mode is qualified by default**.

The hardened architecture is evidence that a campaign is worth running; it is not evidence that a mode has passed the campaign. Fresh full-book samples generated after the reliability telemetry is deployed are required.


## Near-10 doctrine

“≈10/10” is an operational release standard, not a claim that automated generation is infallible. It means ScrollLibrary refuses to certify a generated book while any **known critical defect** remains.

The universal contract therefore treats the following as fail-closed defects:

- fabricated or unsupported material factual claims;
- stale time-sensitive action guidance;
- unverifiable laws, thresholds, statistics, acquisitions, valuations, or named real-world events;
- categorical prescriptions presented as universal fact when scope or exceptions matter;
- reader-visible TODO/TBD text, raw figure-generation instructions, or repeated generation notices;
- unresolved contradictions, incomplete chapters, broken code, missing required visuals, rights failures, or production defects.

For evidence-governed nonfiction, deterministic QA and the current-state evidence attestation are complementary: deterministic QA detects suspicious claim patterns and missing local evidence, while reference verification must bind traceable evidence to the current manuscript state. Neither can override a failure in the other.
