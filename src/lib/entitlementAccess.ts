import type { SubscriptionTier } from "./subscription";

export interface Entitlements {
  canPublish: boolean;
  canExport: boolean;
  canDownload: boolean;
  canGenerateBooks: boolean;
  canUseAllFormats: boolean;
  canExportAllFormats: boolean;
  hasCommercialRights: boolean;
  bypassAllLimits: boolean;
  canUseAiCovers: boolean;
  canUseTTS: boolean;
  canUseOpenAITTS: boolean;
  canUseElevenLabsTTS: boolean;
  canBatchGenerate: boolean;
  tier: SubscriptionTier;
  isAdmin: boolean;
  isProphet: boolean;
  isPremium: boolean;
  isStudent: boolean;
  /** @deprecated Legacy compatibility alias. Use isStudent. */
  isScrollStudent: boolean;
  isPaid: boolean;
  isTrialMode: boolean;
}

export interface EntitlementResolutionInput {
  tier: SubscriptionTier;
  isAdmin: boolean;
  trialActive: boolean;
  stillLoading: boolean;
}

export type EntitlementFeature =
  | "publish"
  | "export"
  | "download"
  | "generate"
  | "allFormats"
  | "commercial"
  | "aiCovers"
  | "tts"
  | "openaiTTS"
  | "elevenLabsTTS"
  | "batch";

const TIER_PRIORITY: Record<SubscriptionTier, number> = {
  free: 0,
  student: 1,
  premium: 2,
  prophet_tier: 3,
};

/**
 * Resolve the client capability snapshot from authenticated subscription/admin
 * inputs. This object controls UI availability only; server-authoritative
 * operations must independently authenticate and authorize every request.
 *
 * There are deliberately no hard-coded account/email overrides here. Review
 * accounts must receive their real server-side plan/entitlement assignment.
 */
export function resolveEntitlements({
  tier,
  isAdmin,
  trialActive,
  stillLoading,
}: EntitlementResolutionInput): Entitlements {
  const isProphet = tier === "prophet_tier";
  const isPremium = tier === "premium";
  const isStudent = tier === "student";
  const isPaid = isProphet || isPremium || isStudent;

  if (trialActive) {
    return {
      canPublish: true,
      canExport: true,
      canDownload: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      canExportAllFormats: true,
      hasCommercialRights: true,
      bypassAllLimits: true,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseOpenAITTS: true,
      canUseElevenLabsTTS: true,
      canBatchGenerate: true,
      tier,
      isAdmin,
      isProphet,
      isPremium,
      isStudent,
      isScrollStudent: isStudent,
      isPaid,
      isTrialMode: true,
    };
  }

  if (isAdmin) {
    return {
      canPublish: true,
      canExport: true,
      canDownload: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      canExportAllFormats: true,
      hasCommercialRights: true,
      bypassAllLimits: true,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseOpenAITTS: true,
      canUseElevenLabsTTS: true,
      canBatchGenerate: true,
      tier,
      isAdmin: true,
      isProphet,
      isPremium,
      isStudent,
      isScrollStudent: isStudent,
      isPaid,
      isTrialMode: false,
    };
  }

  if (isProphet) {
    return {
      canPublish: true,
      canExport: true,
      canDownload: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      canExportAllFormats: true,
      hasCommercialRights: true,
      // Institutional is the highest paid plan, but it is still economically
      // capped (for example 300 TTS/interactive-voice minutes per month).
      bypassAllLimits: false,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseOpenAITTS: true,
      canUseElevenLabsTTS: true,
      canBatchGenerate: true,
      tier,
      isAdmin: false,
      isProphet: true,
      isPremium: true,
      isStudent: true,
      isScrollStudent: true,
      isPaid: true,
      isTrialMode: false,
    };
  }

  if (isPremium) {
    return {
      canPublish: true,
      canExport: true,
      canDownload: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      canExportAllFormats: true,
      hasCommercialRights: true,
      bypassAllLimits: false,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseOpenAITTS: true,
      canUseElevenLabsTTS: false,
      canBatchGenerate: false,
      tier,
      isAdmin: false,
      isProphet: false,
      isPremium: true,
      isStudent: false,
      isScrollStudent: false,
      isPaid: true,
      isTrialMode: false,
    };
  }

  if (isStudent) {
    return {
      canPublish: true,
      canExport: true,
      canDownload: true,
      canGenerateBooks: true,
      canUseAllFormats: false,
      canExportAllFormats: false,
      hasCommercialRights: false,
      bypassAllLimits: false,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseOpenAITTS: true,
      canUseElevenLabsTTS: false,
      canBatchGenerate: false,
      tier,
      isAdmin: false,
      isProphet: false,
      isPremium: false,
      isStudent: true,
      isScrollStudent: true,
      isPaid: true,
      isTrialMode: false,
    };
  }

  // This branch is defensive for future subscription adapters that may expose a
  // non-free tier before its full entitlement payload has finished resolving.
  if (stillLoading && tier !== "free") {
    return {
      canPublish: true,
      canExport: true,
      canDownload: true,
      canGenerateBooks: true,
      canUseAllFormats: isPremium || isProphet,
      canExportAllFormats: isPremium || isProphet,
      hasCommercialRights: isPremium || isProphet,
      bypassAllLimits: false,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseOpenAITTS: true,
      canUseElevenLabsTTS: false,
      canBatchGenerate: false,
      tier,
      isAdmin: false,
      isProphet,
      isPremium,
      isStudent,
      isScrollStudent: isStudent,
      isPaid: true,
      isTrialMode: false,
    };
  }

  return {
    canPublish: false,
    canExport: true,
    canDownload: true,
    canGenerateBooks: true,
    canUseAllFormats: false,
    canExportAllFormats: false,
    hasCommercialRights: false,
    bypassAllLimits: false,
    canUseAiCovers: false,
    canUseTTS: true,
    canUseOpenAITTS: true,
    canUseElevenLabsTTS: false,
    canBatchGenerate: false,
    tier,
    isAdmin: false,
    isProphet: false,
    isPremium: false,
    isStudent: false,
    isScrollStudent: false,
    isPaid: false,
    isTrialMode: false,
  };
}

/**
 * Resolve access from explicit capabilities. Paid status and compatibility
 * aliases must never override a denied capability. Only deliberate admin/trial
 * bypass modes override individual capability flags.
 */
export function hasFeatureAccess(
  entitlements: Entitlements,
  feature: EntitlementFeature,
): boolean {
  if (entitlements.isAdmin || entitlements.bypassAllLimits) {
    return true;
  }

  switch (feature) {
    case "publish":
      return entitlements.canPublish;
    case "export":
      return entitlements.canExport;
    case "download":
      return entitlements.canDownload;
    case "generate":
      return entitlements.canGenerateBooks;
    case "allFormats":
      return entitlements.canUseAllFormats || entitlements.canExportAllFormats;
    case "commercial":
      return entitlements.hasCommercialRights;
    case "aiCovers":
      return entitlements.canUseAiCovers;
    case "tts":
      return entitlements.canUseTTS;
    case "openaiTTS":
      return entitlements.canUseOpenAITTS;
    case "elevenLabsTTS":
      return entitlements.canUseElevenLabsTTS;
    case "batch":
      return entitlements.canBatchGenerate;
    default:
      return false;
  }
}

/**
 * Plan wrappers must respect the subscription hierarchy. Being paid is not a
 * substitute for holding the required tier. Explicit admin/trial bypass modes
 * may bypass the hierarchy for UI testing; server checks remain authoritative.
 */
export function hasPlanAccess(
  entitlements: Entitlements,
  requiredTier: SubscriptionTier,
): boolean {
  if (entitlements.isAdmin || entitlements.bypassAllLimits) {
    return true;
  }
  return TIER_PRIORITY[entitlements.tier] >= TIER_PRIORITY[requiredTier];
}
