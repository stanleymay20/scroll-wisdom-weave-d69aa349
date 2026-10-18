/**
 * Reject legacy or source-unbound books before they enter provider qualification.
 * This is an admission gate, NOT proof that the deployed source matches GitHub:
 * the release owner must separately compare the Lovable/hosted release identity.
 * Read-only snapshots from Supabase, no manuscript content or secrets in results.
 */
const RELEASE = /^[a-f0-9]{40}$/;
const MIN_COHORT_START = Date.parse("2026-09-29T00:00:00Z");

function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : NaN;
}

export function validateCampaignContext({ releaseSha, campaignStartedAt }) {
  if (typeof releaseSha !== "string" || !RELEASE.test(releaseSha)) {
    throw new Error("QUALIFICATION_RELEASE_SHA_REQUIRED");
  }
  const start = instant(campaignStartedAt);
  if (!Number.isFinite(start) || start < MIN_COHORT_START || start > Date.now()) {
    throw new Error("CAMPAIGN_START_TIMESTAMP_INVALID");
  }
  return { releaseSha, campaignStartedAt, start };
}

export function evaluateFreshCohortSample(context, { book, chapters, job }) {
  const blockers = [];
  const { releaseSha, start } = validateCampaignContext(context);
  if (!book || typeof book.id !== "string") return ["BOOK_MISSING"];
  if (!job || job.book_id !== book.id || job.user_id !== book.user_id) {
    blockers.push("MATCHING_GENERATION_JOB_MISSING");
  }
  if (job?.metadata?.qualificationSourceSha !== releaseSha) {
    blockers.push("SERVER_RECORDED_RELEASE_SHA_MISSING_OR_MISMATCH");
  }

  for (const [name, createdAt] of [
    ["BOOK", book.created_at], ["GENERATION_JOB", job?.created_at],
  ]) {
    const time = instant(createdAt);
    if (!Number.isFinite(time) || time < start) blockers.push(name + "_PREDATES_CAMPAIGN");
  }
  if (!Array.isArray(chapters) || !chapters.length) {
    blockers.push("NO_CHAPTER_ROWS");
  } else {
    const chapterNumbers = chapters.map((row) => row.chapter_number);
    if (new Set(chapterNumbers).size !== chapterNumbers.length
      || chapterNumbers.some((n, i) => n !== i + 1)) {
      blockers.push("CHAPTER_NUMBERS_NOT_SEQUENTIAL");
    }
    for (const row of chapters) {
      const time = instant(row.created_at);
      if (row.book_id !== book.id || !Number.isFinite(time) || time < start) {
        blockers.push("CHAPTER_PREDATES_CAMPAIGN_OR_BOOK_MISMATCH");
        break;
      }
    }
  }
  return [...new Set(blockers)];
}
