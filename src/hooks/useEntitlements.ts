import { useSubscription } from '@/contexts/SubscriptionContext';
import { useIsAdmin } from './useAdmin';
import { SubscriptionTier } from '@/lib/subscription';

export interface Entitlements {
  // Core access flags - use these, NOT tier names
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
  // Tier info (for display only, NOT for gating)
  tier: SubscriptionTier;
  // Role flags - use these for access checks
  isAdmin: boolean;
  isProphet: boolean;
  isPremium: boolean;
  isStudent: boolean;
  isScrollStudent: boolean;
  isPaid: boolean;
}

/**
 * SINGLE SOURCE OF TRUTH FOR ALL ENTITLEMENTS
 * 
 * Priority order:
 * 1. Admin → unrestricted access to everything
 * 2. Prophet tier → unrestricted access to all features
 * 3. Paid tiers → access according to plan
 * 4. Free users → restricted
 * 
 * FAIL-SAFE: If resolution fails, default to MORE access for paid users
 */
export function useEntitlements(): Entitlements {
  const { tier, isLoading: subLoading } = useSubscription();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  // Tier checks
  const isProphet = tier === 'prophet_tier';
  const isPremium = tier === 'premium';
  const isStudent = tier === 'student';
  const isPaid = isProphet || isPremium || isStudent;

  // FAIL-OPEN during loading: If still loading AND we have hints of paid status, grant access
  // This prevents false upgrade prompts while data loads
  const stillLoading = subLoading || adminLoading;

  // ADMIN: GOD MODE - bypass everything, NO EXCEPTIONS
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
      isProphet: true, // Admin effectively has all privileges
      isPremium: true,
      isStudent: true,
      isScrollStudent: true,
      isPaid: true,
    };
  }

  // PROPHET TIER: Full override - all features unlocked, NO EXCEPTIONS
  if (isProphet) {
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
      isAdmin: false,
      isProphet: true,
      isPremium: true, // Prophet includes all Premium features
      isStudent: true,
      isScrollStudent: true,
      isPaid: true,
    };
  }

  // PREMIUM TIER - Full export and TTS access
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
    };
  }

  // STUDENT TIER (ScrollUniversity) - Premium-equivalent access
  if (isStudent) {
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
      isPremium: true, // Student has Premium-equivalent access
      isStudent: true,
      isScrollStudent: true,
      isPaid: true,
    };
  }

  // FAIL-OPEN during loading: If tier isn't 'free' explicitly and we're loading, assume paid
  if (stillLoading && tier !== 'free') {
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
      isProphet: isProphet,
      isPremium: isPremium || isProphet,
      isStudent: isStudent,
      isScrollStudent: isStudent,
      isPaid: true, // Assume paid during loading if tier isn't explicitly 'free'
    };
  }

  // FREE TIER - restricted
  return {
    canPublish: false,
    canExport: false,
    canDownload: false,
    canGenerateBooks: false,
    canUseAllFormats: false,
    canExportAllFormats: false,
    hasCommercialRights: false,
    bypassAllLimits: false,
    canUseAiCovers: false,
    canUseTTS: false,
    canUseOpenAITTS: false,
    canUseElevenLabsTTS: false,
    canBatchGenerate: false,
    tier,
    isAdmin: false,
    isProphet: false,
    isPremium: false,
    isStudent: false,
    isScrollStudent: false,
    isPaid: false,
  };
}

/**
 * Check if user has access to a specific feature
 * Returns true if access granted, false otherwise
 * NEVER blocks paid users due to transient issues
 */
export function hasFeatureAccess(
  entitlements: Entitlements,
  feature: 'publish' | 'export' | 'download' | 'generate' | 'allFormats' | 'commercial' | 'aiCovers' | 'tts' | 'openaiTTS' | 'elevenLabsTTS' | 'batch'
): boolean {
  // Admin and Prophet always have access - NO EXCEPTIONS
  if (entitlements.isAdmin || entitlements.isProphet) {
    return true;
  }

  // Student tier (ScrollUniversity) has Premium-equivalent access
  if (entitlements.isScrollStudent) {
    return true;
  }

  // FAIL-SAFE: Paid users get access if resolution is uncertain
  if (entitlements.isPaid) {
    // For paid users, default to allowing access
    switch (feature) {
      case 'publish':
        return entitlements.canPublish;
      case 'export':
      case 'download':
        return entitlements.canExport || entitlements.canDownload;
      case 'generate':
        return entitlements.canGenerateBooks;
      case 'allFormats':
        return entitlements.canUseAllFormats || entitlements.canExportAllFormats;
      case 'commercial':
        return entitlements.hasCommercialRights;
      case 'aiCovers':
        return entitlements.canUseAiCovers;
      case 'tts':
      case 'openaiTTS':
        return entitlements.canUseTTS || entitlements.canUseOpenAITTS;
      case 'elevenLabsTTS':
        return entitlements.canUseElevenLabsTTS;
      case 'batch':
        return entitlements.canBatchGenerate;
      default:
        // FAIL-SAFE: Grant access to paid users for unknown features
        return true;
    }
  }

  // Free tier - check specific entitlements
  switch (feature) {
    case 'publish':
      return entitlements.canPublish;
    case 'export':
    case 'download':
      return entitlements.canExport || entitlements.canDownload;
    case 'generate':
      return entitlements.canGenerateBooks;
    case 'allFormats':
      return entitlements.canUseAllFormats;
    case 'commercial':
      return entitlements.hasCommercialRights;
    case 'aiCovers':
      return entitlements.canUseAiCovers;
    case 'tts':
    case 'openaiTTS':
      return entitlements.canUseTTS || entitlements.canUseOpenAITTS;
    case 'elevenLabsTTS':
      return entitlements.canUseElevenLabsTTS;
    case 'batch':
      return entitlements.canBatchGenerate;
    default:
      return false;
  }
}
