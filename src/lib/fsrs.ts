/**
 * FSRS-5 (Free Spaced Repetition Scheduler) — open algorithm
 * ===========================================================
 * Drop-in replacement for SM-2 with significantly better retention forecasting.
 * Based on the published FSRS-5 weights (Open Spaced Repetition project, 2024).
 *
 * We map FSRS state onto our existing `spaced_repetition_cards` columns without
 * a schema change:
 *   • difficulty → ease_factor      (range ~1.0 – 10.0)
 *   • stability  → interval_days    (rounded to nearest day, min 1)
 *   • repetitions → repetitions     (count of successful reviews)
 *
 * This keeps backwards-compatibility with all existing queries (`due cards`,
 * `mature/learning`, etc.) while delivering the FSRS retention boost.
 */
import type { ReviewQuality } from './spacedRepetition';

/** FSRS-5 default weights (w0..w18) — published parameters. */
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
];

/** FSRS rating: 1=Again, 2=Hard, 3=Good, 4=Easy. */
export type FsrsRating = 1 | 2 | 3 | 4;

/** Target retention — 0.9 is the standard Anki/FSRS default (90% recall target). */
const TARGET_RETENTION = 0.9;
const FACTOR = Math.pow(0.9, -1 / -0.5) - 1; // ~0.0809... DSR formula constant
const DECAY = -0.5;

export interface FsrsState {
  /** Difficulty 1.0–10.0; lower is easier. */
  difficulty: number;
  /** Memory stability in days. */
  stability: number;
  /** Number of successful reviews. */
  repetitions: number;
}

export interface FsrsResult extends FsrsState {
  /** Days until next optimal review. */
  intervalDays: number;
  /** ISO timestamp when this card is next due. */
  nextReviewAt: Date;
}

/** Map our 0–5 SM-2 quality to FSRS 1–4 rating. */
export function qualityToFsrsRating(q: ReviewQuality): FsrsRating {
  if (q <= 1) return 1; // Again
  if (q === 2) return 2; // Hard
  if (q <= 4) return 3; // Good
  return 4; // Easy (q === 5)
}

/** Initial difficulty for a brand-new card given the first rating. */
function initDifficulty(rating: FsrsRating): number {
  const d = W[4] - Math.exp(W[5] * (rating - 1)) + 1;
  return clamp(d, 1, 10);
}

/** Initial stability for a brand-new card given the first rating. */
function initStability(rating: FsrsRating): number {
  return Math.max(W[rating - 1], 0.1);
}

/** Update difficulty after a review. */
function nextDifficulty(d: number, rating: FsrsRating): number {
  const deltaD = -W[6] * (rating - 3);
  const newD = d + linearDamping(deltaD, d);
  // Mean-reversion toward initial difficulty for "Easy" anchor
  const target = initDifficulty(4);
  return clamp(meanReversion(target, newD), 1, 10);
}

function linearDamping(deltaD: number, d: number) {
  return (deltaD * (10 - d)) / 9;
}

function meanReversion(target: number, current: number) {
  return W[7] * target + (1 - W[7]) * current;
}

/** Forgetting curve: P(recall) = (1 + FACTOR * t/S)^DECAY */
export function recallProbability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/** Compute next stability after a *successful* review. */
function nextStabilitySuccess(d: number, s: number, r: number, rating: FsrsRating): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const factor =
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return s * (1 + factor);
}

/** Compute next stability after a *lapse* (rating === 1). */
function nextStabilityLapse(d: number, s: number, r: number): number {
  const lapse =
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r));
  return Math.min(lapse, s);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Optimal next interval given current stability and the global target retention.
 * I = (ln(R) / ln(0.9)) * S
 */
function optimalInterval(stability: number): number {
  const interval = (Math.log(TARGET_RETENTION) / Math.log(0.9)) * stability;
  return Math.max(1, Math.round(interval));
}

/**
 * Run a single FSRS-5 review.
 * `prev` may be null/zeroed for brand-new cards.
 */
export function reviewFsrs(
  prev: FsrsState | null,
  rating: FsrsRating,
  elapsedDays: number,
): FsrsResult {
  // First exposure
  if (!prev || prev.repetitions === 0 || prev.stability <= 0) {
    const difficulty = initDifficulty(rating);
    const stability = initStability(rating);
    const intervalDays = optimalInterval(stability);
    return buildResult(difficulty, stability, rating === 1 ? 0 : 1, intervalDays);
  }

  const r = recallProbability(elapsedDays, prev.stability);
  const newDifficulty = nextDifficulty(prev.difficulty, rating);

  let newStability: number;
  let newReps: number;
  if (rating === 1) {
    newStability = nextStabilityLapse(prev.difficulty, prev.stability, r);
    newReps = 0;
  } else {
    newStability = nextStabilitySuccess(prev.difficulty, prev.stability, r, rating);
    newReps = prev.repetitions + 1;
  }

  const intervalDays = optimalInterval(newStability);
  return buildResult(newDifficulty, newStability, newReps, intervalDays);
}

function buildResult(d: number, s: number, reps: number, intervalDays: number): FsrsResult {
  const next = new Date();
  next.setDate(next.getDate() + intervalDays);
  return {
    difficulty: round2(d),
    stability: round2(s),
    repetitions: reps,
    intervalDays,
    nextReviewAt: next,
  };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Quick helper: fraction of cards expected to still be retained today. */
export function expectedRetention(
  cards: Array<{ stability: number; lastReviewedAt: string | null }>,
): number {
  if (cards.length === 0) return 0;
  const now = Date.now();
  const sum = cards.reduce((acc, c) => {
    if (!c.lastReviewedAt || c.stability <= 0) return acc + 1;
    const days = (now - new Date(c.lastReviewedAt).getTime()) / 86_400_000;
    return acc + recallProbability(Math.max(0, days), c.stability);
  }, 0);
  return Math.round((sum / cards.length) * 100);
}
