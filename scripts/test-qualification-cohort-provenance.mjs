import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFreshCohortSample,
  validateCampaignContext,
} from "./qualification-cohort-provenance.mjs";

const sha = "a".repeat(40);
const campaignStartedAt = "2026-10-17T00:00:00Z";
const context = { releaseSha: sha, campaignStartedAt, qualificationTier: "student", bookType: "text" };
const id = "00000000-0000-4000-8000-000000000001";
const user = "00000000-0000-4000-8000-000000000002";
const instant = "2026-10-17T12:00:00Z";
const fixture = () => ({
  book: { id, user_id: user, created_at: instant },
  job: {
    id: "j1", book_id: id, user_id: user, created_at: instant,
    metadata: {
      qualificationSourceSha: sha,
      qualificationTier: "student",
      qualificationAdminBypass: false,
      model: "google/gemini-2.5-flash",
    },
  },
  chapters: Array.from({ length: 8 }, (_, i) => ({
    book_id: id, chapter_number: i + 1, created_at: instant,
  })),
});

test("only new, exact-source books and chapters are eligible", () => {
  assert.deepEqual(evaluateFreshCohortSample(context, fixture()), []);
});

test("legacy pre-hardening books and chapters do not become new samples", () => {
  const old = fixture();
  old.book.created_at = "2025-12-15T12:00:00Z";
  old.chapters[0].created_at = "2026-01-09T12:00:00Z";
  const blockers = evaluateFreshCohortSample(context, old);
  assert(blockers.includes("BOOK_PREDATES_CAMPAIGN"));
  assert(blockers.includes("CHAPTER_PREDATES_CAMPAIGN_OR_BOOK_MISMATCH"));
});

test("generation job must match book, owner, release and start time", () => {
  const old = fixture();
  old.job.book_id = "different";
  old.job.user_id = "different";
  old.job.created_at = "2025-12-01T12:00:00Z";
  old.job.metadata.qualificationSourceSha = "b".repeat(40);
  const blockers = evaluateFreshCohortSample(context, old);
  assert(blockers.includes("MATCHING_GENERATION_JOB_MISSING"));
  assert(blockers.includes("GENERATION_JOB_PREDATES_CAMPAIGN"));
  assert(blockers.includes("SERVER_RECORDED_RELEASE_SHA_MISSING_OR_MISMATCH"));
});

test("missing generation-job lineage cannot qualify", () => {
  const old = fixture();
  old.job = null;
  assert(evaluateFreshCohortSample(context, old).includes("MATCHING_GENERATION_JOB_MISSING"));
});

test("chapter replay, omission, and owner mixup are not accepted", () => {
  const old = fixture();
  old.chapters[1].chapter_number = 1;
  old.chapters[2].book_id = "other-book";
  const blockers = evaluateFreshCohortSample(context, old);
  assert(blockers.includes("CHAPTER_NUMBERS_NOT_SEQUENTIAL"));
  assert(blockers.includes("CHAPTER_PREDATES_CAMPAIGN_OR_BOOK_MISMATCH"));
});

test("missing context, pre-hardening campaign and future-start campaign fail closed", () => {
  assert.throws(() => validateCampaignContext({ ...context, releaseSha: "unknown" }), /QUALIFICATION_RELEASE_SHA_REQUIRED/);
  assert.throws(() => validateCampaignContext({ ...context, campaignStartedAt: "2025-12-01T00:00:00Z" }), /CAMPAIGN_START_TIMESTAMP_INVALID/);
  assert.throws(() => validateCampaignContext({ ...context, campaignStartedAt: "2030-10-17T00:00:00Z" }), /CAMPAIGN_START_TIMESTAMP_INVALID/);
});

test("normal Free user cannot falsely qualify eight chapters under admin privileges", () => {
  const cohort = fixture();
  cohort.job.metadata.qualificationTier = "free";
  cohort.job.metadata.model = "google/gemini-2.5-flash-lite";
  cohort.job.metadata.qualificationAdminBypass = true;
  const blockers = evaluateFreshCohortSample({
    ...context, qualificationTier: "free",
  }, cohort);
  assert(blockers.includes("ADMIN_QUOTA_BYPASS_NOT_REPRESENTATIVE_OF_STANDARD_CUSTOMER"));
  assert(blockers.includes("BOOK_EXCEEDS_QUALIFIED_TIER_CHAPTER_CAP"));
});

test("cross-tier book or missing model cannot inherit qualification", () => {
  const cohort = fixture();
  cohort.job.metadata.qualificationTier = "premium";
  cohort.job.metadata.model = "";
  const blockers = evaluateFreshCohortSample(context, cohort);
  assert(blockers.includes("SERVER_RECORDED_TIER_OR_MODEL_MISSING_OR_MISMATCH"));
  assert.throws(() => validateCampaignContext({ ...context, qualificationTier: "founder" }), /QUALIFICATION_TIER_REQUIRED/);
});
