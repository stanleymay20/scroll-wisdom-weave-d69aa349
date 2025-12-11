// Subscription tier configuration for ScrollLibrary
// NOTE: Replace these placeholder price IDs with real Stripe price IDs from your Stripe dashboard

export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price_id: null,
    product_id: null,
    monthlyPrice: 0,
    features: {
      canGenerateBooks: false,
      maxBooksPerMonth: 5,
      maxWordCount: 4000,
      exportFormats: ['pdf_low'],
      ttsMinutes: 0,
      aiCovers: false,
      commercialRights: false,
      batchGeneration: false,
      prioritySupport: false,
    }
  },
  premium: {
    name: 'Premium',
    // TODO: Replace with actual Stripe price ID after creating product in Stripe dashboard
    price_id: 'price_premium_placeholder',
    product_id: 'prod_premium_placeholder',
    monthlyPrice: 19,
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: -1, // unlimited
      maxWordCount: 10000,
      exportFormats: ['pdf', 'epub', 'docx', 'mobi'],
      ttsMinutes: 60,
      aiCovers: true,
      commercialRights: true,
      batchGeneration: false,
      prioritySupport: true,
    }
  },
  prophet_tier: {
    name: 'Prophet Tier',
    // TODO: Replace with actual Stripe price ID after creating product in Stripe dashboard
    price_id: 'price_prophet_placeholder',
    product_id: 'prod_prophet_placeholder',
    monthlyPrice: 49,
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: -1,
      maxWordCount: 20000,
      exportFormats: ['pdf', 'epub', 'docx', 'mobi', 'kpf'],
      ttsMinutes: -1, // unlimited with ElevenLabs
      aiCovers: true,
      commercialRights: true,
      batchGeneration: true,
      prioritySupport: true,
      prophetMode: true,
      aiResearchAssistant: true,
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

// Word count options based on tier
export function getWordCountOptions(tier: SubscriptionTier): number[] {
  const maxWords = getMaxWordCount(tier);
  const allOptions: number[] = [2000, 4000, 6000, 8000, 10000, 15000, 20000];
  return allOptions.filter((w: number) => w <= maxWords);
}
