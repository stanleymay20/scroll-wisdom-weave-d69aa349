import { useSubscription } from '@/contexts/SubscriptionContext';
import { useIsAdmin } from './useAdmin';
import { SubscriptionTier } from '@/lib/subscription';

export interface Entitlements {
  canPublish: boolean;
  canExport: boolean;
  canGenerateBooks: boolean;
  canUseAllFormats: boolean;
  hasCommercialRights: boolean;
  bypassAllLimits: boolean;
  canUseAiCovers: boolean;
  canUseTTS: boolean;
  canUseElevenLabsTTS: boolean;
  canBatchGenerate: boolean;
  tier: SubscriptionTier;
  isAdmin: boolean;
  isProphet: boolean;
  isPremium: boolean;
  isStudent: boolean;
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
  const { tier, isLoading } = useSubscription();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  // Tier checks
  const isProphet = tier === 'prophet_tier';
  const isPremium = tier === 'premium';
  const isStudent = tier === 'student';
  const isPaid = isProphet || isPremium || isStudent;

  // ADMIN: GOD MODE - bypass everything
  if (isAdmin) {
    return {
      canPublish: true,
      canExport: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      hasCommercialRights: true,
      bypassAllLimits: true,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseElevenLabsTTS: true,
      canBatchGenerate: true,
      tier,
      isAdmin: true,
      isProphet,
      isPremium,
      isStudent,
      isPaid: true,
    };
  }

  // PROPHET TIER: Full override - all features unlocked
  if (isProphet) {
    return {
      canPublish: true,
      canExport: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      hasCommercialRights: true,
      bypassAllLimits: true,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseElevenLabsTTS: true,
      canBatchGenerate: true,
      tier,
      isAdmin: false,
      isProphet: true,
      isPremium: false,
      isStudent: false,
      isPaid: true,
    };
  }

  // PREMIUM TIER
  if (isPremium) {
    return {
      canPublish: true,
      canExport: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      hasCommercialRights: true,
      bypassAllLimits: false,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseElevenLabsTTS: false,
      canBatchGenerate: false,
      tier,
      isAdmin: false,
      isProphet: false,
      isPremium: true,
      isStudent: false,
      isPaid: true,
    };
  }

  // STUDENT TIER
  if (isStudent) {
    return {
      canPublish: true,
      canExport: true,
      canGenerateBooks: true,
      canUseAllFormats: true,
      hasCommercialRights: true,
      bypassAllLimits: false,
      canUseAiCovers: true,
      canUseTTS: true,
      canUseElevenLabsTTS: false,
      canBatchGenerate: false,
      tier,
      isAdmin: false,
      isProphet: false,
      isPremium: false,
      isStudent: true,
      isPaid: true,
    };
  }

  // FREE TIER - restricted
  return {
    canPublish: false,
    canExport: false,
    canGenerateBooks: false,
    canUseAllFormats: false,
    hasCommercialRights: false,
    bypassAllLimits: false,
    canUseAiCovers: false,
    canUseTTS: false,
    canUseElevenLabsTTS: false,
    canBatchGenerate: false,
    tier,
    isAdmin: false,
    isProphet: false,
    isPremium: false,
    isStudent: false,
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
  feature: 'publish' | 'export' | 'generate' | 'allFormats' | 'commercial' | 'aiCovers' | 'tts' | 'elevenLabsTTS' | 'batch'
): boolean {
  // Admin and Prophet always have access
  if (entitlements.isAdmin || entitlements.isProphet) {
    return true;
  }

  switch (feature) {
    case 'publish':
      return entitlements.canPublish;
    case 'export':
      return entitlements.canExport;
    case 'generate':
      return entitlements.canGenerateBooks;
    case 'allFormats':
      return entitlements.canUseAllFormats;
    case 'commercial':
      return entitlements.hasCommercialRights;
    case 'aiCovers':
      return entitlements.canUseAiCovers;
    case 'tts':
      return entitlements.canUseTTS;
    case 'elevenLabsTTS':
      return entitlements.canUseElevenLabsTTS;
    case 'batch':
      return entitlements.canBatchGenerate;
    default:
      // FAIL-SAFE: If unknown feature, grant access to paid users
      return entitlements.isPaid;
  }
}
