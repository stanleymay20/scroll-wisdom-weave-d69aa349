# Issue #132 — Paid generation model floor (design review, plan only)

Reviewed `supabase/functions/generate-chapter/index.ts` at `d8549ffa`. All six defects you listed are confirmed. Your design holds up, with the corrections and edge cases below.

## Confirmed defects (with line references)
- Lines 4754–4762: `FALLBACK_MODELS = [generationModel, flash, flash-lite]`, deduplicated.
- Line 4807: `currentModelIdx++` on 429. A Pro/Teams Chief Editor run can go Pro → Flash → Lite. A Creator/Pro routine run can go Flash → Lite.
- Line 4833: empty-response retries reuse `currentModelIdx`, so they stay downgraded.
- Line 4907: stress-test is hard-coded to Lite and replaces `finalContent` at line 5000.
- Line 5035: compression is hard-coded to Lite and replaces `finalContent` at line 5074.
- Line 2221: the existing chapter fetch selects only `content, is_generated`. `generation_outline` is never read or written here.

## Design verdict
Points 1, 2, 4, 5, 7 and 8: agreed as written.

Point 3 needs tightening:
- Paid routes get a single-model chain: `[routeFloorModel]`. A 429 retries the same model under the existing backoff, then fails honestly.
- Do not add an "equal-or-better" ladder now. Pro is the top tier, and Flash → Pro on 429 quietly raises cost against the 60% margin breaker. Leave it out until it is explicitly qualified.
- Free routine may fall back upward from Lite to Flash. I recommend leaving this out too: it changes cost and gives Free users a paid route. Default: no fallback. If you want it, it should be a one-line, separately reviewed change.
- If all retries fail, refund the text reservation first (as the 402 path already does), then return 503 or 429 with a structured code such as `AI_RATE_LIMITED`. Don't throw a generic 500.

Point 6: agreed. One correction: the merge must use the outline as read at fetch time, and the fenced write already protects against stale writers (see below).

Point 9: agreed. One ratchet to add: there must be no `"google/gemini-2.5-flash-lite"` literal inside any `finalContent =`-producing call.

## Hidden edge cases found
1. **Retry-loop bookkeeping.** Today a 429 consumes an attempt and also moves the model. With a single-model chain, `activeModel` is always the floor. `materialModelRoute[0]` must record the model of the response that actually succeeded, including when it came from an empty-response retry. Don't record `generationModel` blindly.
2. **The empty-response loop doesn't handle 429 at all.** It treats any non-ok status as `continue` and never refunds. Keep it on the same floor model. That bug is not in #132's scope, so note it and don't fix it.
3. **Comic (line 2783) and workbook (line 3201) paths** already use `generationModel` with no fallback. They are floor-safe but exit early (lines 3153 and 3257) with their own saves and responses. Either add provenance to them too, or explicitly scope it to the main path. Recommendation: add the same `materialModelProvenance` through the shared helper, because they also save manuscript text. Both modes are GA-gated off today.
4. **The Chief Editor flag depends on `advancedAuthoringEnabled()`** (line 2086). With GA off, `route` is always `routine`. The boundary test at `scripts/test-generation-boundaries.ts:102` already proves the caller marker can't force Pro in GA. Keep that test.
5. **Stress-test length guard.** Moving from Lite to Flash/Pro changes output length. The existing accept rules (length ratio, the 60%/1000-char compression guard) stay as they are. Provenance records a stage only when its output is accepted, which already happens in those branches.
6. **Pro latency and timeouts.** Running stress-test and compression on Pro for Pro/Teams Chief Editor (when GA enables it) adds two Pro calls. Today the Chief Editor route skips stress-test (`!editIntent`), so only compression applies. Keep it that way. If wall-clock limits are hit, fail closed: skip the optional pass, which keeps the floor-model draft. Never fall back to Lite.
7. **Non-mutating Lite calls stay as they are:** OCR (line 2126) and comic story summary (line 3100, metadata only). Perplexity `sonar` (line 1598) is research, not manuscript text. Image models are unchanged.
8. **Merging `generation_outline`.** `save_generated_chapter_fenced` uses `jsonb_populate_record(_chapter, _patch)`, which replaces the whole column. The patch must contain the full merged object: `{...existingOutline, materialModelProvenance}`. Treat a non-object or null outline as `{}`. Never drop `description` or `keyTopics`, which `generation-worker` reads at line 206. The fenced `_expected_content` check prevents a race with a concurrent writer.
9. **Background reference attach** (line 5993) updates `chapter_references` only, so it doesn't conflict with the outline.
10. **The `plan` value in provenance** is the server-resolved tier key (`free/student/premium/prophet_tier`), not client input. Include no prompts, edit-intent text, user IDs or keys.

## Recommended file set (smallest safe)
- `supabase/functions/_shared/generation-model-floor.ts` (new, pure, no I/O):
  - `getModelForPlan` and `getRewriteModelForPlan`, moved from `generate-chapter`, unchanged.
  - `floorSafeModelChain(route, plan)` returns `[floor]`.
  - `isBelowFloor(model, floor)`.
  - `buildMaterialModelProvenance({ plan, route, floor, accepted[] })` and `mergeGenerationOutline(existing, provenance)`.
- `supabase/functions/_shared/generation-model-floor_test.ts` (new): Deno tests covering every point-9 case.
- `supabase/functions/generate-chapter/index.ts`:
  - Import the helpers and use a single-model chain.
  - Remove the 429 index increment.
  - Return the honest failure with a refund.
  - Use `generationModel` in stress-test and compression.
  - Add `generation_outline` to the select at line 2221.
  - Track accepted stages, include the merged outline in the `saveGeneratedChapter` patch, and add `materialModelProvenance` to the success response (main, comic and workbook paths).
- `scripts/check-chapter-regeneration-contract.mjs`: add static ratchets.
  - No `gemini-2.5-flash-lite` near the stress-test or compression call sites.
  - No `currentModelIdx++`.
  - The `generation_outline` merge must be present.
- `scripts/check-deno-test-coverage.mjs`: register the new test file, if the script enforces an allow-list (to check during implementation).

**Helper placement: extract one small pure module.** The file is 6,046 lines and runs `serve()` at import, so local helpers can only be tested through the heavy rewrite harness in `test-generation-boundaries.ts`. A pure `_shared` module gives fast, deterministic tests. It doesn't add a second routing system: the functions move, they aren't copied. `_shared/ai-router.ts` is a separate generic router and stays untouched.

## Verification (at implementation time)
- `deno test supabase/functions/_shared/generation-model-floor_test.ts`
- `deno test` on `scripts/test-generation-boundaries.ts` and `_shared/ai-router.test.ts`
- `deno check supabase/functions/generate-chapter/index.ts`
- `node scripts/check-chapter-regeneration-contract.mjs`

## Out of scope
Issues #133 and #136. Fixing 429/refund handling in the empty-response loop (noted only). Publishing, database, flag and Stripe changes.

## Delivery constraint (unchanged)
Edits here sync straight to `main`. Implementation needs the 1/2/3 choice from last turn: a reviewed branch, a patch file, or explicit permission to work on `main`.
