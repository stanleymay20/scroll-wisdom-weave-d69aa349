import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from './useEntitlements';
import { SUBSCRIPTION_TIERS, SubscriptionTier, hasElevenLabsTTS } from '@/lib/subscription';
import { LAUNCH_MODE, LAUNCH_MODE_CONFIG } from '@/lib/config';

export type Feature = 
  | 'generateBooks'
  | 'aiCovers'
  | 'tts'
  | 'elevenLabsTTS'
  | 'batchGeneration'
  | 'commercialRights'
  | 'exportPdf'
  | 'exportEpub'
  | 'exportDocx'
  | 'exportKdpPdf';

interface FeatureAccessResult {
  hasAccess: boolean;
  reason?: string;
  upgradeRequired?: SubscriptionTier;
}

export function useFeatureAccess() {
  const { tier, user } = useSubscription();
  const entitlements = useEntitlements();

  const hasFeature = (feature: Feature): FeatureAccessResult => {
    // ABSOLUTE PRIORITY: Admin → unrestricted access to everything
    if (entitlements.isAdmin) {
      return { hasAccess: true };
    }

    // ABSOLUTE PRIORITY: Prophet tier → unrestricted access to all features
    if (entitlements.isProphet) {
      return { hasAccess: true };
    }

    // FAIL-SAFE: If paid user, be generous with access
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    switch (feature) {
      case 'generateBooks':
        // In launch mode, free tier can generate with limits
        if (LAUNCH_MODE && tier === 'free') {
          return { hasAccess: true };
        }
        // Paid users always can generate
        if (entitlements.isPaid) {
          return { hasAccess: true };
        }
        if (!tierConfig.features.canGenerateBooks) {
          return { 
            hasAccess: false, 
            reason: 'Book generation requires a paid subscription',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };

      case 'aiCovers':
        // All paid users get AI covers
        if (entitlements.isPaid) {
          return { hasAccess: true };
        }
        if (!tierConfig.features.aiCovers) {
          return { 
            hasAccess: false, 
            reason: 'AI cover generation requires Student tier or higher',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };

      case 'tts':
        // All paid users get TTS
        if (entitlements.isPaid) {
          return { hasAccess: true };
        }
        if (tierConfig.features.ttsMinutes <= 0) {
          return { 
            hasAccess: false, 
            reason: 'Text-to-speech requires Student tier or higher',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };

      case 'elevenLabsTTS':
        if (entitlements.canUseElevenLabsTTS) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false, 
          reason: 'ElevenLabs TTS requires Prophet tier',
          upgradeRequired: 'prophet_tier'
        };

      case 'batchGeneration':
        if (entitlements.canBatchGenerate) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false, 
          reason: 'Batch generation requires Prophet tier',
          upgradeRequired: 'prophet_tier'
        };

      case 'commercialRights':
        // All paid users get commercial rights
        if (entitlements.isPaid) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false, 
          reason: 'Commercial publishing rights require Premium tier or higher',
          upgradeRequired: 'premium'
        };

      case 'exportPdf':
        // PDF is available to ALL users (free tier included)
        return { hasAccess: true };

      case 'exportEpub':
      case 'exportDocx':
        // EPUB/DOCX require Student tier or higher
        if (entitlements.isPaid) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false, 
          reason: `${feature === 'exportDocx' ? 'DOCX' : 'EPUB'} export requires Student plan or higher`,
          upgradeRequired: 'student'
        };

      case 'exportKdpPdf':
        // KDP-PDF requires Premium tier
        if (entitlements.isPaid && (tier === 'premium' || tier === 'prophet_tier')) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false, 
          reason: 'KDP PDF export requires Premium plan or higher',
          upgradeRequired: 'premium'
        };

      default:
        // FAIL-SAFE: If paid, grant access
        if (entitlements.isPaid) {
          return { hasAccess: true };
        }
        return { hasAccess: false, reason: 'Unknown feature' };
    }
  };

  const getMaxWordCount = (): number => {
    // Admin and Prophet get max
    if (entitlements.isAdmin || entitlements.isProphet) {
      return 6000;
    }
    
    if (LAUNCH_MODE && tier === 'free') {
      return LAUNCH_MODE_CONFIG.freeMaxWordCount;
    }
    
    return SUBSCRIPTION_TIERS[tier].features.maxWordCount;
  };

  const getTTSMinutes = (): number => {
    // Admin and Prophet get unlimited
    if (entitlements.isAdmin || entitlements.isProphet) {
      return -1;
    }
    return SUBSCRIPTION_TIERS[tier].features.ttsMinutes;
  };

  return {
    hasFeature,
    getMaxWordCount,
    getTTSMinutes,
    tier,
    isAdmin: entitlements.isAdmin,
    user,
    entitlements,
  };
}
