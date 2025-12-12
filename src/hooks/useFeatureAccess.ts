import { useSubscription } from '@/contexts/SubscriptionContext';
import { useIsAdmin } from './useAdmin';
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
  | 'exportMobi'
  | 'exportKpf';

interface FeatureAccessResult {
  hasAccess: boolean;
  reason?: string;
  upgradeRequired?: SubscriptionTier;
}

export function useFeatureAccess() {
  const { tier, user } = useSubscription();
  const { isAdmin } = useIsAdmin();

  const hasFeature = (feature: Feature): FeatureAccessResult => {
    // Admins bypass all restrictions
    if (isAdmin) {
      return { hasAccess: true };
    }

    const tierConfig = SUBSCRIPTION_TIERS[tier];

    switch (feature) {
      case 'generateBooks':
        // In launch mode, free tier can generate with limits
        if (LAUNCH_MODE && tier === 'free') {
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
        if (!tierConfig.features.aiCovers) {
          return { 
            hasAccess: false, 
            reason: 'AI cover generation requires Student tier or higher',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };

      case 'tts':
        if (tierConfig.features.ttsMinutes === 0) {
          return { 
            hasAccess: false, 
            reason: 'Text-to-speech requires Student tier or higher',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };

      case 'elevenLabsTTS':
        if (!hasElevenLabsTTS(tier)) {
          return { 
            hasAccess: false, 
            reason: 'ElevenLabs TTS requires Prophet tier',
            upgradeRequired: 'prophet_tier'
          };
        }
        return { hasAccess: true };

      case 'batchGeneration':
        if (!tierConfig.features.batchGeneration) {
          return { 
            hasAccess: false, 
            reason: 'Batch generation requires Prophet tier',
            upgradeRequired: 'prophet_tier'
          };
        }
        return { hasAccess: true };

      case 'commercialRights':
        if (!tierConfig.features.commercialRights) {
          return { 
            hasAccess: false, 
            reason: 'Commercial publishing rights require Premium tier or higher',
            upgradeRequired: 'premium'
          };
        }
        return { hasAccess: true };

      case 'exportPdf':
        return { hasAccess: true }; // All tiers can export PDF (quality varies)

      case 'exportEpub':
      case 'exportDocx': {
        const formats = tierConfig.features.exportFormats as readonly string[];
        if (!formats.includes('epub')) {
          return { 
            hasAccess: false, 
            reason: 'EPUB/DOCX export requires Student tier or higher',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };
      }

      case 'exportMobi': {
        const formats = tierConfig.features.exportFormats as readonly string[];
        if (!formats.includes('mobi')) {
          return { 
            hasAccess: false, 
            reason: 'MOBI export requires Premium tier or higher',
            upgradeRequired: 'premium'
          };
        }
        return { hasAccess: true };
      }

      case 'exportKpf': {
        const formats = tierConfig.features.exportFormats as readonly string[];
        if (!formats.includes('kpf')) {
          return { 
            hasAccess: false, 
            reason: 'KPF export requires Prophet tier',
          upgradeRequired: 'prophet_tier'
        };
      }
      }
        return { hasAccess: true };

      default:
        return { hasAccess: false, reason: 'Unknown feature' };
    }
  };

  const getMaxWordCount = (): number => {
    if (isAdmin) return 6000; // Max possible due to API limits
    
    if (LAUNCH_MODE && tier === 'free') {
      return LAUNCH_MODE_CONFIG.freeMaxWordCount;
    }
    
    return SUBSCRIPTION_TIERS[tier].features.maxWordCount;
  };

  const getTTSMinutes = (): number => {
    if (isAdmin) return -1; // Unlimited
    return SUBSCRIPTION_TIERS[tier].features.ttsMinutes;
  };

  return {
    hasFeature,
    getMaxWordCount,
    getTTSMinutes,
    tier,
    isAdmin,
    user,
  };
}
