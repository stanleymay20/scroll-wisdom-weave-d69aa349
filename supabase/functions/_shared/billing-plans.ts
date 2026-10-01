// Server-side billing economics for ScrollLibrary.
//
// Internal plan keys remain compatible with existing rows:
//   student -> Creator
//   premium -> Pro
//   prophet_tier -> Teams
//
// These limits are authoritative for paid compute. Frontend mirrors are checked
// in CI, but Edge Functions must always enforce this server copy.

export type BillingPlanTier = "free" | "student" | "premium" | "prophet_tier";

export interface BillingPlanLimits {
  publicName: "Free" | "Creator" | "Pro" | "Teams";
  booksPerMonth: number;
  aiTextWordsPerMonth: number;
  visualCreditsPerMonth: number;
  audioCreditsPerMonth: number;
  maxWordsPerChapter: number;
  maxChaptersPerBook: number;
  marketplaceFeeBps: number;
  seats: number;
}

export const BILLING_PLAN_LIMITS: Readonly<Record<BillingPlanTier, BillingPlanLimits>> = Object.freeze({
  free: Object.freeze({
    publicName: "Free",
    booksPerMonth: 1,
    aiTextWordsPerMonth: 25_000,
    visualCreditsPerMonth: 0,
    audioCreditsPerMonth: 5,
    maxWordsPerChapter: 4_000,
    maxChaptersPerBook: 5,
    marketplaceFeeBps: 1_500,
    seats: 1,
  }),
  student: Object.freeze({
    publicName: "Creator",
    booksPerMonth: 10,
    aiTextWordsPerMonth: 250_000,
    visualCreditsPerMonth: 10,
    audioCreditsPerMonth: 15,
    maxWordsPerChapter: 4_000,
    maxChaptersPerBook: 30,
    marketplaceFeeBps: 1_000,
    seats: 1,
  }),
  premium: Object.freeze({
    publicName: "Pro",
    booksPerMonth: 30,
    aiTextWordsPerMonth: 1_000_000,
    visualCreditsPerMonth: 60,
    audioCreditsPerMonth: 60,
    maxWordsPerChapter: 6_000,
    maxChaptersPerBook: 50,
    marketplaceFeeBps: 500,
    seats: 1,
  }),
  prophet_tier: Object.freeze({
    publicName: "Teams",
    booksPerMonth: 100,
    aiTextWordsPerMonth: 2_500_000,
    visualCreditsPerMonth: 200,
    audioCreditsPerMonth: 180,
    maxWordsPerChapter: 6_000,
    maxChaptersPerBook: 100,
    marketplaceFeeBps: 300,
    seats: 5,
  }),
});

export function billingPlanFor(value: unknown): BillingPlanTier {
  return typeof value === "string" && value in BILLING_PLAN_LIMITS
    ? value as BillingPlanTier
    : "free";
}
