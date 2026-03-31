// Subscription tier configuration for ScrollLibrary
// NOTE: Replace these placeholder price IDs with real Stripe price IDs from your Stripe dashboard

export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price_id: null,
    product_id: null,
    monthlyPrice: 0,
    features: {
      canGenerateBooks: true, // 1 book/month for PMF validation
      maxBooksPerMonth: 1,
      maxWordCount: 4000,
      exportFormats: ['pdf'],
      ttsMinutes: 5, // 5 min free TTS (cost control)
      interactiveVoiceMinutes: 5,
      aiCovers: false,
      commercialRights: false,
      batchGeneration: false,
      prioritySupport: false,
      elevenLabsTTS: false,
      aiImageQuota: 0, // No AI image gen for free tier
      cinematicVideo: false,
    }
  },
  student: {
    name: 'Student',
    price_id: 'price_1SdFbTJYFIBeCvefKzHWUrcb',
    product_id: 'prod_TaQSrotoUkTuPC',
    monthlyPrice: 9,
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: 10,
      maxWordCount: 4000,
      exportFormats: ['pdf', 'epub', 'docx'],
      ttsMinutes: 30,
      interactiveVoiceMinutes: 30,
      aiCovers: true,
      commercialRights: false,
      batchGeneration: false,
      prioritySupport: false,
      elevenLabsTTS: false,
      aiImageQuota: 20, // 20 AI images/month
      cinematicVideo: false, // Slideshow only
    }
  },
  premium: {
    name: 'Premium',
    price_id: 'price_1SdFddJYFIBeCvefJr1ZY92E',
    product_id: 'prod_TaQU3ILEUpbXOT',
    monthlyPrice: 19,
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: 30,
      maxWordCount: 6000,
      exportFormats: ['pdf', 'epub', 'docx', 'mobi'],
      ttsMinutes: 60,
      interactiveVoiceMinutes: 120,
      aiCovers: true,
      commercialRights: true,
      batchGeneration: false,
      prioritySupport: true,
      elevenLabsTTS: false,
      aiImageQuota: 100, // 100 AI images/month
      cinematicVideo: true, // Full cinematic video
    }
  },
  prophet_tier: {
    name: 'Institutional',
    price_id: 'price_1T2eR8JYFIBeCvefx02IXTz6',
    product_id: 'prod_U0fmlf14TPlMKj',
    monthlyPrice: 79,
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: 100,      // Capped for economic sustainability
      maxWordCount: 6000,
      exportFormats: ['pdf', 'epub', 'docx', 'mobi', 'kpf'],
      ttsMinutes: 300,            // 5 hours/month cap
      interactiveVoiceMinutes: 300,
      aiCovers: true,
      commercialRights: true,
      batchGeneration: true,
      prioritySupport: true,
      prophetMode: true,
      aiResearchAssistant: true,
      elevenLabsTTS: true,
      aiImageQuota: 500,          // 500 images/month cap
      cinematicVideo: true,       // Full cinematic video (50 videos/month server-side)
    }
  }
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

export function getTierFromProductId(productId: string | null): SubscriptionTier {
  if (!productId) return 'free';
  
  for (const [tier, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (config.product_id === productId) {
      return tier as SubscriptionTier;
    }
  }
  return 'free';
}

export function canGenerateBooks(tier: SubscriptionTier): boolean {
  return SUBSCRIPTION_TIERS[tier].features.canGenerateBooks;
}

export function getMaxWordCount(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.maxWordCount;
}

export function canExportFormat(tier: SubscriptionTier, format: string): boolean {
  const formats = SUBSCRIPTION_TIERS[tier].features.exportFormats as readonly string[];
  return formats.includes(format);
}

export function getTTSMinutes(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.ttsMinutes;
}

export function hasCommercialRights(tier: SubscriptionTier): boolean {
  return SUBSCRIPTION_TIERS[tier].features.commercialRights;
}

export function hasElevenLabsTTS(tier: SubscriptionTier): boolean {
  return 'elevenLabsTTS' in SUBSCRIPTION_TIERS[tier].features && 
         SUBSCRIPTION_TIERS[tier].features.elevenLabsTTS === true;
}

export function canBatchGenerate(tier: SubscriptionTier): boolean {
  return SUBSCRIPTION_TIERS[tier].features.batchGeneration;
}

export function canUseCinematicVideo(tier: SubscriptionTier): boolean {
  return 'cinematicVideo' in SUBSCRIPTION_TIERS[tier].features &&
         SUBSCRIPTION_TIERS[tier].features.cinematicVideo === true;
}

export function getAiImageQuota(tier: SubscriptionTier): number {
  return 'aiImageQuota' in SUBSCRIPTION_TIERS[tier].features
    ? (SUBSCRIPTION_TIERS[tier].features as any).aiImageQuota
    : 0;
}

export function getInteractiveVoiceMinutes(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.interactiveVoiceMinutes;
}

// Word count options based on tier
// Note: DeepSeek API max_tokens is 8192, so max ~6000 words per chapter
export function getWordCountOptions(tier: SubscriptionTier): number[] {
  const maxWords = getMaxWordCount(tier);
  const allOptions: number[] = [2000, 3000, 4000, 5000, 6000];
  return allOptions.filter((w: number) => w <= maxWords);
}
