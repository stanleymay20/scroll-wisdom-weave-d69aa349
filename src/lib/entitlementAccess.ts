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

/**
 * Resolve access from explicit capabilities. Paid status and compatibility
 * aliases must never override a denied capability. Only deliberate
 * administrator/institutional overrides bypass individual flags.
 */
export function hasFeatureAccess(
  entitlements: Entitlements,
  feature: EntitlementFeature,
): boolean {
  if (entitlements.isAdmin || entitlements.isProphet) {
    return true;
  }

  switch (feature) {
    case "publish":
      return entitlements.canPublish;
    case "export":
    case "download":
      return entitlements.canExport || entitlements.canDownload;
    case "generate":
      return entitlements.canGenerateBooks;
    case "allFormats":
      return entitlements.canUseAllFormats || entitlements.canExportAllFormats;
    case "commercial":
      return entitlements.hasCommercialRights;
    case "aiCovers":
      return entitlements.canUseAiCovers;
    case "tts":
    case "openaiTTS":
      return entitlements.canUseTTS || entitlements.canUseOpenAITTS;
    case "elevenLabsTTS":
      return entitlements.canUseElevenLabsTTS;
    case "batch":
      return entitlements.canBatchGenerate;
    default:
      return false;
  }
}
