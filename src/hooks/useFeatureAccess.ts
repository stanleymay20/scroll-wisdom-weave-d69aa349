import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from './useEntitlements';
import { SUBSCRIPTION_TIERS, SubscriptionTier, canExportFormat } from '@/lib/subscription';
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
    // Only an actual administrator or explicit trial/test bypass can ignore
    // individual capability/tier limits. Paid status alone never does.
    if (entitlements.isAdmin || entitlements.bypassAllLimits) {
      return { hasAccess: true };
    }

    const tierConfig = SUBSCRIPTION_TIERS[tier];

    switch (feature) {
      case 'generateBooks':
        if (LAUNCH_MODE && tier === 'free') {
          return { hasAccess: true };
        }
        if (!entitlements.canGenerateBooks) {
          return { 
            hasAccess: false, 
            reason: 'Book generation requires a paid subscription',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };

      case 'aiCovers':
        if (!entitlements.canUseAiCovers) {
          return { 
            hasAccess: false, 
            reason: 'AI cover generation requires Student tier or higher',
            upgradeRequired: 'student'
          };
        }
        return { hasAccess: true };

      case 'tts':
        if (!entitlements.canUseTTS) {
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
          reason: 'ElevenLabs TTS requires Institutional tier',
          upgradeRequired: 'prophet_tier'
        };

      case 'batchGeneration':
        if (entitlements.canBatchGenerate) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false, 
          reason: 'Batch generation requires Institutional tier',
          upgradeRequired: 'prophet_tier'
        };

      case 'commercialRights':
        if (entitlements.hasCommercialRights) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false,
          reason: 'Commercial publishing rights require Premium tier or higher',
          upgradeRequired: 'premium'
        };

      case 'exportPdf':
        return { hasAccess: entitlements.canExport || entitlements.canDownload };

      case 'exportEpub':
        if (entitlements.canExport && canExportFormat(tier, 'epub')) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false,
          reason: 'EPUB export requires Student plan or higher',
          upgradeRequired: 'student'
        };

      case 'exportDocx':
        if (entitlements.canExport && canExportFormat(tier, 'docx')) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false,
          reason: 'DOCX export requires Student plan or higher',
          upgradeRequired: 'student'
        };

      case 'exportKdpPdf':
        if (entitlements.canExport && canExportFormat(tier, 'kdp-pdf')) {
          return { hasAccess: true };
        }
        return { 
          hasAccess: false,
          reason: 'KDP PDF export requires Premium plan or higher',
          upgradeRequired: 'premium'
        };

      default:
        return { hasAccess: false, reason: 'Unknown feature' };
    }
  };

  const getMaxWordCount = (): number => {
    if (entitlements.isAdmin || entitlements.bypassAllLimits) {
      return 6000;
    }
    
    if (LAUNCH_MODE && tier === 'free') {
      return LAUNCH_MODE_CONFIG.freeMaxWordCount;
    }
    
    return SUBSCRIPTION_TIERS[tier].features.maxWordCount;
  };

  const getTTSMinutes = (): number => {
    if (entitlements.isAdmin || entitlements.bypassAllLimits) {
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
