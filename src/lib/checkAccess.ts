/**
 * checkAccess — central client-side gating function.
 *
 * One entry point used by:
 *  - book generation (Generate.tsx)
 *  - audio playback (TextToSpeechPlayer / TTSMiniPlayer)
 *  - learning-mode switching (cognitive level / advanced features)
 *
 * Server is still the source of truth. This is a fast pre-flight check that
 * lets the UI:
 *  - show a soft "almost out" warning before the limit
 *  - block actions cleanly with a consistent UpgradeModal
 *  - never break reading or trap the user
 *
 * SYSTEM exhaustion (provider down, AI quota out) is NOT decided here —
 * that comes back from the edge function as a UsageGateResult and is parsed
 * via parseGateError(). This file only reasons about USER plan limits.
 */

import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "@/lib/subscription";
import {
  type UsageGateResult,
  type UsageGateUsage,
  denied,
  allowed,
  recommendNextPlan,
  logGateEvent,
} from "@/lib/usageGate";

export type GatedFeature =
  | "generate_book"
  | "tts_audio"
  | "interactive_voice"
  | "ai_image"
  | "cinematic_video"
  | "advanced_export"
  | "batch_generation"
  | "commercial_rights"
  | "learning_mode_advanced"
  | "elevenlabs_tts";

export interface AccessUser {
  id?: string | null;
  tier?: SubscriptionTier | string | null;
  isAdmin?: boolean;
}

export interface AccessUsageInput {
  /** Books generated this billing period. */
  booksThisMonth?: number;
  /** TTS minutes consumed this billing period. */
  ttsMinutesUsed?: number;
  /** Interactive voice minutes consumed. */
  voiceMinutesUsed?: number;
  /** AI images generated this billing period. */
  aiImagesUsed?: number;
}

export interface AccessOptions {
  /** Treat usage at >= this fraction of the cap as "almost out" (default 0.8). */
  warnThreshold?: number;
  /** Optional cost of the action being attempted (e.g. minutes about to play). */
  pendingCost?: number;
  /** Tag for analytics (component name). */
  source?: string;
}

export interface AccessResult extends UsageGateResult {
  /** True when the user is *under* the cap but within `warnThreshold`. */
  approachingLimit: boolean;
  /** Remaining units before the cap (minutes / books / images). null = unlimited. */
  remaining: number | null;
  /** Soft, friendly warning copy when approachingLimit, else null. */
  warning: string | null;
}

/* ────────────────────────────────────────────────────────────────────── */

const ADMIN_ALLOWED: Pick<AccessResult, "approachingLimit" | "remaining" | "warning"> = {
  approachingLimit: false,
  remaining: null,
  warning: null,
};

function tierFeatures(tier: string) {
  const t = (tier as SubscriptionTier) in SUBSCRIPTION_TIERS
    ? (tier as SubscriptionTier)
    : "free";
  return { tier: t, features: SUBSCRIPTION_TIERS[t].features };
}

function buildAllowed(
  plan: string,
  usage: UsageGateUsage,
  remaining: number | null,
  warning: string | null,
  approachingLimit: boolean,
): AccessResult {
  return {
    ...allowed(usage, plan),
    remaining,
    warning,
    approachingLimit,
  };
}

function buildDenied(
  reason: Parameters<typeof denied>[0],
  plan: string,
  usage: UsageGateUsage,
  message?: string,
): AccessResult {
  return {
    ...denied(reason, {
      currentPlan: plan,
      recommendedPlan: recommendNextPlan(plan),
      usage,
      message,
    }),
    approachingLimit: false,
    remaining: 0,
    warning: null,
  };
}

/* ────────────────────────────────────────────────────────────────────── */

/**
 * Pure, synchronous access check. Cheap to call on every render or button
 * click. Pair with the server-side gate for the authoritative answer.
 */
export function checkAccess(
  user: AccessUser | null | undefined,
  feature: GatedFeature,
  usage: AccessUsageInput = {},
  opts: AccessOptions = {},
): AccessResult {
  const warnAt = opts.warnThreshold ?? 0.8;
  const cost = Math.max(0, opts.pendingCost ?? 0);

  // Not signed in → must auth first; treat as PLAN_REQUIRED so the
  // UpgradeModal nudges them to /pricing (which has a sign-in CTA).
  if (!user?.id) {
    return buildDenied("PLAN_REQUIRED", "free", {}, "Sign in to use this feature.");
  }

  // Admins bypass everything (still subject to server gate).
  if (user.isAdmin) {
    return {
      ...allowed({}, (user.tier as string) || "prophet_tier"),
      ...ADMIN_ALLOWED,
    };
  }

  const plan = (user.tier as string) || "free";
  const { features } = tierFeatures(plan);

  switch (feature) {
    case "generate_book": {
      if (!features.canGenerateBooks) {
        return buildDenied("PLAN_REQUIRED", plan, {});
      }
      const limit = features.maxBooksPerMonth;
      const used = Math.max(0, usage.booksThisMonth ?? 0);
      const remaining = Math.max(0, limit - used);
      const u: UsageGateUsage = { booksGenerated: used, booksLimit: limit };
      if (used + Math.max(1, cost) > limit) {
        return buildDenied("BOOK_LIMIT_REACHED", plan, u);
      }
      const approaching = remaining > 0 && used / limit >= warnAt;
      const warning = approaching
        ? `You have ${remaining} book${remaining === 1 ? "" : "s"} left this month.`
        : null;
      return buildAllowed(plan, u, remaining, warning, approaching);
    }

    case "tts_audio":
    case "elevenlabs_tts": {
      if (feature === "elevenlabs_tts" && !("elevenLabsTTS" in features && features.elevenLabsTTS)) {
        return buildDenied("FEATURE_NOT_IN_PLAN", plan, {});
      }
      const limit = features.ttsMinutes;
      if (limit <= 0) return buildDenied("PLAN_REQUIRED", plan, {});
      const used = Math.max(0, usage.ttsMinutesUsed ?? 0);
      const remaining = Math.max(0, limit - used);
      const u: UsageGateUsage = { audioMinutesUsed: used, audioMinutesLimit: limit };
      if (used + cost > limit) {
        return buildDenied("AUDIO_LIMIT_REACHED", plan, u);
      }
      const approaching = remaining > 0 && used / limit >= warnAt;
      const warning = approaching
        ? `You have ${Math.ceil(remaining)} minute${remaining === 1 ? "" : "s"} of audio left this month.`
        : null;
      return buildAllowed(plan, u, remaining, warning, approaching);
    }

    case "interactive_voice": {
      const limit = features.interactiveVoiceMinutes;
      if (limit <= 0) return buildDenied("PLAN_REQUIRED", plan, {});
      const used = Math.max(0, usage.voiceMinutesUsed ?? 0);
      const remaining = Math.max(0, limit - used);
      const u: UsageGateUsage = { audioMinutesUsed: used, audioMinutesLimit: limit };
      if (used + cost > limit) return buildDenied("AUDIO_LIMIT_REACHED", plan, u);
      const approaching = remaining > 0 && used / limit >= warnAt;
      return buildAllowed(
        plan,
        u,
        remaining,
        approaching ? `You have ${Math.ceil(remaining)} voice minutes left.` : null,
        approaching,
      );
    }

    case "ai_image": {
      const limit = "aiImageQuota" in features ? (features as { aiImageQuota: number }).aiImageQuota : 0;
      if (limit <= 0) return buildDenied("FEATURE_NOT_IN_PLAN", plan, {});
      const used = Math.max(0, usage.aiImagesUsed ?? 0);
      const remaining = Math.max(0, limit - used);
      const u: UsageGateUsage = { aiRequestsUsed: used, aiRequestsLimit: limit };
      if (used + Math.max(1, cost) > limit) {
        return buildDenied("MONTHLY_LIMIT_REACHED", plan, u);
      }
      const approaching = remaining > 0 && used / limit >= warnAt;
      return buildAllowed(
        plan,
        u,
        remaining,
        approaching ? `${remaining} AI image generations left this month.` : null,
        approaching,
      );
    }

    case "cinematic_video": {
      const ok = "cinematicVideo" in features && features.cinematicVideo === true;
      return ok
        ? buildAllowed(plan, {}, null, null, false)
        : buildDenied("FEATURE_NOT_IN_PLAN", plan, {});
    }

    case "advanced_export": {
      const formats = features.exportFormats as readonly string[];
      const ok = formats.length > 1; // free = pdf only
      return ok
        ? buildAllowed(plan, {}, null, null, false)
        : buildDenied("FEATURE_NOT_IN_PLAN", plan, {});
    }

    case "batch_generation": {
      return features.batchGeneration
        ? buildAllowed(plan, {}, null, null, false)
        : buildDenied("FEATURE_NOT_IN_PLAN", plan, {});
    }

    case "commercial_rights": {
      return features.commercialRights
        ? buildAllowed(plan, {}, null, null, false)
        : buildDenied("FEATURE_NOT_IN_PLAN", plan, {});
    }

    case "learning_mode_advanced": {
      // Advanced cognitive levels (Applied / Analytical / Mastery) require a
      // paid plan. Free tier stays on Familiarisation / Functional.
      const ok = plan !== "free";
      return ok
        ? buildAllowed(plan, {}, null, null, false)
        : buildDenied("FEATURE_NOT_IN_PLAN", plan, {});
    }

    default:
      return buildAllowed(plan, {}, null, null, false);
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Convenience wrappers                                                    */

/**
 * Run a check and emit a structured analytics event. Use at the call site
 * just before invoking a premium edge function, so we get a clean record of
 * "user tried X, was at usage Y, plan Z, allowed=…".
 */
export function checkAccessWithTelemetry(
  user: AccessUser | null | undefined,
  feature: GatedFeature,
  usage: AccessUsageInput = {},
  opts: AccessOptions = {},
): AccessResult {
  const result = checkAccess(user, feature, usage, opts);
  logGateEvent({
    feature: opts.source ? `${feature}:${opts.source}` : feature,
    reason: result.reason,
    allowed: result.allowed,
    plan: result.currentPlan,
    usage: result.usage,
    userId: user?.id ?? undefined,
  });
  return result;
}

/** Quick boolean wrapper for conditional UI. */
export function canUse(
  user: AccessUser | null | undefined,
  feature: GatedFeature,
  usage: AccessUsageInput = {},
): boolean {
  return checkAccess(user, feature, usage).allowed;
}
