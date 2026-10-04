# Content quality gate artifacts

- `SCROLLLIBRARY_CONTENT_QUALITY_STANDARD.md` — authoritative Draft / Verified / ScrollLibrary Press Certified doctrine, thresholds, evidence rules and tier semantics.
- `QUALITY_CLAIMS_MATRIX.md` — allowed/prohibited customer claims.
- `standard-text-qualification-corpus.json` — five-book representative Standard Text corpus.
- `standard-text-human-review-template.json` — structured independent reviewer evidence.
- `QUALITY_ACCEPTANCE_RUNBOOK.md` — empirical qualification procedure and no-cheating rules.
- `qualification-evidence/standard-text/` — admissible completed evidence only.
- `CONTENT_VALUE_AUDIT_2026-10-04.md` — pricing/content audit findings.
- `PRICING_SEMANTICS.md` — customer-facing unit meanings and bundle-value invariant.
- `ASSISTED_PUBLISHING_LAUNCH_SERVICE_SCOPE.md` — $399 service scope draft and operational prerequisites.
- `TOMORROW_LOVABLE_DEPLOYMENT_CHECKLIST.md` — production convergence steps through Lovable.
- `COMMERCIAL_GA_ACTIVATION.md` — commercial activation contract, including corrected publishing-service catalogue blockers.

Machine policy:

- `supabase/functions/_shared/press-certification.ts` — strict manuscript state evaluator.
- `supabase/functions/_shared/press-certification_test.ts` — Draft / Verified / Press Certified boundary tests.
- `node scripts/check-content-quality-standard.mjs` — doctrine, pricing and evidence-policy convergence check.
- `node scripts/check-standard-text-human-review.mjs` — validates any committed empirical human-review evidence without pretending missing evidence is a pass.
