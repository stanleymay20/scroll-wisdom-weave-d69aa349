# Standard Text — controlled five-book qualification campaign (PREPARATION ONLY)

## Candidate and the actual evidence deficit

This is **not** a generated-book report and grants no commercial readiness. The Lovable-managed production database was read-only checked on 2026-10-18: all 81 retained books predate 2026-09-29, chapters are all earlier than that date, and no retained `generation_jobs` or `exports` records were found. There are currently **0/5 admissible full-book qualification results** and **0/3 admissible independent human reviews** for the latest release candidate. The prior provider smoke generated one real 2,496-word chapter on an earlier controlled Test backend; it does not establish five-book capability.

The fixed campaign corpus is `docs/release/standard-text-qualification-corpus.json`, not the legacy library. All five samples must be attempted and included in the outcome, even if they fail or require retries.

| Sample brief | Chapters | Target words/chapter | Target words total |
|---|---:|---:|---:|
| `std-general-explanatory-01` | 8 | 2,500 | 20,000 |
| `std-business-economics-01` | 8 | 2,500 | 20,000 |
| `std-history-governance-01` | 8 | 2,500 | 20,000 |
| `std-technical-software-01` | 8 | 2,500 | 20,000 |
| `std-narrative-nonfiction-01` | 10 | 2,500 | 25,000 |
| **Total** | **42** | — | **105,000** |

Targets are **not** generated outcomes or estimates of provider tokens/billing.

## Qualification tier scope

The five-book corpus is **not runnable as a normal Free-tier cohort**: Free currently caps books at five chapters and one book/month, whereas these briefs require eight or ten chapters. Creator (`student` internally) has a 30-chapter-per-book ceiling and ten books/month; Pro (`premium`) has a 50-chapter ceiling. The campaign must use an independently verified, normal non-admin Creator or Pro route and record its provider model. An admin's elevated `prophet_tier` quota must not be mistaken for ordinary subscriber capabilities. The collector requires the actual `--tier` and the server-stamped job tier to match. Do **not** count a Creator or Pro campaign as proof of Free-tier quality.

## Explicit go/no-go before any provider charges

1. Integrate the reviewed exact-head branch only after mandatory CI and operator sign-off; identify the source, backend and immutable frontend release using their independently verified hashes. A passing PR CI is not hosted deployment evidence.
2. Use a segregated, authorized **non-production** Lovable/Supabase environment. Keep actual customer accounts, production books and public paid flags untouched.
3. Confirm provider/model route and capacity, per-stage cost accounting, a maximum total EUR/USD budget, per-book stop threshold, and operator authorization. **No billable five-book job is permitted without that approval.** Do not assume usage quotas mean free compute.
4. In the controlled backend set `QUALIFICATION_SOURCE_SHA` to the exactly deployed source SHA, after verified deployment identity, and capture a UTC `campaign_start` timestamp. The new job metadata is stamped by the server; clients cannot claim their own release SHA. If unset/mismatched, collector must fail closed.
5. Pre-register the five briefs, exact prompt/policy version, intended tier, model route, timestamps, expected chapter count and original brief hash in a **private** cohort manifest. Treat all failures as campaign evidence. Do not select only flattering samples.
6. Generate one **pilot** book only after approved budget and source identity, observe each persisted chapter attempt, total provider charge and the full QA/evidence chain. Stop if any unbudgeted or unrecoverable failure occurs. Do not count this pilot twice.
7. Complete the remaining campaign only if pilot's cost and technical gates meet the approved policy. Collect 5 full-book results, independently read them, and conduct 3 genuinely independent complete-book reviews. Enforce at least 95/100 Chief Editor, 98/100 publishability with zero warnings/blockers, at most 2% chapter failures and 5% regeneration, and 9.5/10 human mean with each dimension at least 9.0 and no critical issue.
8. Record final exact hashes, financial totals, terminal generation states and human-review origin. Run `Generated Book Provider Qualification` workflow with `campaign_start` and book IDs only after all controlled proofs exist. Release remains NO-GO until the owner signs off.

## Anti-replay admission contract

The collector requires `--release-sha` and `--campaign-start`. Book, generation job and every chapter must be created during that exact campaign; job ownership and server-stamped release identity must match; chapter numbering must be sequential; repeated book IDs or sample IDs cannot count as separate books. Human reviews require `humanReview.manuscriptSha256`, computed from the ordered current persisted chapters, so editing invalidates an old review.

All collector outputs are **admission and QA evidence only**, not an independent audit of the hosted source or the integrity of an external provider. An operator must verify the actual deployed source separately. No fake passing scores, copied reviewer notes, synthetic prompt outputs, legacy books, cleanup-erased failed attempts, or weakened release gates.

**Current decision:** 0/5 fresh complete book passes; 0/3 current-hash human reviews. **No provider calls have been run as part of this preparation.**
