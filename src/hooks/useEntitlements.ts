import { useSubscription } from '@/contexts/SubscriptionContext';
import { useIsAdmin } from './useAdmin';
import { SubscriptionTier } from '@/lib/subscription';
import { isTrialActive } from '@/lib/config';

// Reviewer accounts get unrestricted access for Google Play review
const REVIEWER_EMAILS = ['reviewer@scrolllibrary.org'];

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
  /** @deprecated Legacy compatibility alias. Use isStudent. */
  isScrollStudent: boolean;
  isPaid: boolean;
  // Trial mode flag
  isTrialMode: boolean;
}

/**
 * SINGLE SOURCE OF TRUTH FOR ALL ENTITLEMENTS
 *
 * Priority order:
 * 0. Trial Mode → ALL users get full access (temporary testing period)
 * 1. Admin → unrestricted access to everything
 * 2. Prophet tier → unrestricted access to all features
 * 3. Paid tiers → access according to plan
 * 4. Free users → restricted
 */
export function useEntitlements(): Entitlements {
  const { tier, user, isLoading: subLoading } = useSubscription();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  const trialActive = isTrialActive();
  const isReviewer = user?.email ? REVIEWER_EMAILS.includes(user.email.toLowerCase()) : false;

  const isProphet = tier === 'prophet_tier';
  const isPremium = tier === 'premium';
  const isStudent = tier === 'student';
  const isPaid = isProphet || isPremium || isStudent;
  const stillLoading = subLoading || adminLoading;

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
      isProphet: true,
      isPremium: true,
      isStudent: true,
      isScrollStudent: true,
      isPaid: true,
      isTrialMode: true,
    };
  }

  if (isAdmin || isReviewer) {
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
      isProphet: true,
      isPremium: true,
      isStudent: true,
      isScrollStudent: true,
      isPaid: true,
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
      bypassAllLimits: true,
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

  // Student is a paid ScrollLibrary plan, not a Premium alias. Keep its
  // capability flags aligned to src/lib/subscription.ts.
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

  // During transient loading, never invent Premium capabilities. Preserve only
  // the tier information already known locally.
  if (stillLoading && tier !== 'free') {
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
 * Check if user has access to a specific feature.
 * Paid status alone never overrides an explicit capability flag.
 */
export function hasFeatureAccess(
  entitlements: Entitlements,
  feature: 'publish' | 'export' | 'download' | 'generate' | 'allFormats' | 'commercial' | 'aiCovers' | 'tts' | 'openaiTTS' | 'elevenLabsTTS' | 'batch'
): boolean {
  if (entitlements.isAdmin || entitlements.isProphet) {
    return true;
  }

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
      return false;
  }
}
