/**
 * Reject legacy or source-unbound books before they enter provider qualification.
 * This is an admission gate, NOT proof that the deployed source matches GitHub:
 * the release owner must separately compare the Lovable/hosted release identity.
 * Read-only snapshots from Supabase, no manuscript content or secrets in results.
 */
const RELEASE = /^[a-f0-9]{40}$/;
const MIN_COHORT_START = Date.parse("2026-09-29T00:00:00Z");
const CHAPTER_CAPS = Object.freeze({ free: 5, student: 30, premium: 50, prophet_tier: 100 });
const MODEL_RANK = Object.freeze({
  "google/gemini-2.5-flash-lite": 1,
  "google/gemini-2.5-flash": 2,
  "google/gemini-2.5-pro": 3,
});
const routineFloor = (tier) => tier === "free"
  ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-flash";
function stageHasModelFloor(stage, floor) {
  return stage && typeof stage === "object"
    && typeof stage.model === "string"
    && typeof MODEL_RANK[stage.model] === "number"
    && MODEL_RANK[stage.model] >= MODEL_RANK[floor];
}
function materialRoutePasses(row, tier, start) {
  const data = row?.generation_outline?.materialModelProvenance;
  if (!data || data.version !== "v1" || data.plan !== tier
    || !["routine", "chief_editor"].includes(data.route)) return false;
  const floor = data.route === "chief_editor" && ["premium", "prophet_tier"].includes(tier)
    ? "google/gemini-2.5-pro" : routineFloor(tier);
  if (data.routeFloorModel !== floor
    || !Array.isArray(data.materialModelRoute)
    || data.materialModelRoute.length === 0
    || !data.materialModelRoute.every((stage) => stageHasModelFloor(stage, floor))
    || !stageHasModelFloor({ model: data.finalMaterialModel }, floor)
    || !Number.isFinite(instant(data.recordedAt))
    || instant(data.recordedAt) < start) return false;
  return true;
}

function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : NaN;
}

export function validateCampaignContext({ releaseSha, campaignStartedAt, qualificationTier, bookType }) {
  if (typeof releaseSha !== "string" || !RELEASE.test(releaseSha)) {
    throw new Error("QUALIFICATION_RELEASE_SHA_REQUIRED");
  }
  if (!Object.hasOwn(CHAPTER_CAPS, qualificationTier)) {
    throw new Error("QUALIFICATION_TIER_REQUIRED");
  }
  if (typeof bookType !== "string" || !bookType.trim()) {
    throw new Error("QUALIFICATION_BOOK_TYPE_REQUIRED");
  }
  const start = instant(campaignStartedAt);
  if (!Number.isFinite(start) || start < MIN_COHORT_START || start > Date.now()) {
    throw new Error("CAMPAIGN_START_TIMESTAMP_INVALID");
  }
  return { releaseSha, campaignStartedAt, qualificationTier, bookType, start };
}

export function evaluateFreshCohortSample(context, { book, chapters, job }) {
  const blockers = [];
  const { releaseSha, start, qualificationTier, bookType } = validateCampaignContext(context);
  if (!book || typeof book.id !== "string") return ["BOOK_MISSING"];
  if (!job || job.book_id !== book.id || job.user_id !== book.user_id) {
    blockers.push("MATCHING_GENERATION_JOB_MISSING");
  }
  if (job?.metadata?.qualificationSourceSha !== releaseSha) {
    blockers.push("SERVER_RECORDED_RELEASE_SHA_MISSING_OR_MISMATCH");
  }
  if (job?.metadata?.qualificationTier !== qualificationTier
    || job?.metadata?.model !== routineFloor(qualificationTier)) {
    blockers.push("SERVER_RECORDED_TIER_OR_MODEL_MISSING_OR_MISMATCH");
  }
  if (bookType === "text" && job?.metadata?.qualificationAdminBypass !== false) {
    blockers.push("ADMIN_QUOTA_BYPASS_NOT_REPRESENTATIVE_OF_STANDARD_CUSTOMER");
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
    if (chapters.length > CHAPTER_CAPS[qualificationTier]) {
      blockers.push("BOOK_EXCEEDS_QUALIFIED_TIER_CHAPTER_CAP");
    }
    const chapterNumbers = chapters.map((row) => row.chapter_number);
    if (new Set(chapterNumbers).size !== chapterNumbers.length
      || chapterNumbers.some((n, i) => n !== i + 1)) {
      blockers.push("CHAPTER_NUMBERS_NOT_SEQUENTIAL");
    }
    if (chapters.some((row) => !materialRoutePasses(row, qualificationTier, start))) {
      blockers.push("CHAPTER_MATERIAL_MODEL_PROVENANCE_MISSING_OR_BELOW_TIER");
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
