# ScrollLibrary empirical quality acceptance runbook

## Goal

Produce auditable evidence that a generation route repeatedly creates complete books meeting ScrollLibrary's near-10 qualification doctrine.

## Per-sample procedure

1. Generate one complete book from the canonical corpus brief with no hidden manual manuscript rewriting.
2. Record tier route, provider/model, prompt/policy versions and generated book ID.
3. Complete all chapters.
4. Run evidence grounding/verification when required.
5. Run Chief Editor audit and permitted automatic repair passes.
6. Run final evidence re-verification after any editorial rewrite.
7. Run copyediting.
8. Run technical code audit where applicable.
9. Run deterministic publishability QA.
10. Render and certify the canonical production artifact.
11. Record the exact manuscript/publication scope hash.
12. Have an independent human reviewer read the complete book and complete the controlled review template.
13. Store admissible evidence under `docs/release/qualification-evidence/standard-text/`.
14. Repeat across the full five-book corpus.

## No-cheating rules

- Do not hand-edit a failing sample into a pass without recording the intervention; such a sample measures human rescue, not autonomous generation quality.
- Do not discard bad generations silently. Failure/regeneration rate is part of product quality.
- Do not select only the best chapters for human review; the reviewer reads the complete book.
- Do not reuse a human review after the manuscript scope hash changes.
- Do not substitute deterministic or AI scores for independent human review.
- Do not qualify one subscription/model route and automatically inherit the result to another route.

## Promotion decision

A route is promoted only when all minimum sample counts and thresholds pass. Otherwise it remains unqualified and customer-facing copy must stay at Draft/Verified semantics.
