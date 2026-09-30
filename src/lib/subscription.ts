// ScrollLibrary subscription catalogue.
//
// Public product ladder:
//   Free -> Creator -> Pro -> Teams
//
// Internal tier keys (student/premium/prophet_tier) are retained temporarily for
// backward compatibility with existing database rows and historical Stripe
// subscriptions. Public copy and new billing logic must use the names below.
//
// IMPORTANT:
// - Subscription plans buy software access + bounded AI usage.
// - ISBNs are never sold as subscription inventory.
// - Publishing services and usage add-ons are separate one-time products.
// - Provider/GA feature flags still control whether an entitled capability is live.

export type BillingCycle = 'monthly' | 'annual';

export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    publicId: 'free',
    monthlyPrice: 0,
    annualPrice: 0,
    legacyProductIds: [] as string[],
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: 1,
      aiTextWordsPerMonth: 25_000,
      maxWordCount: 4000,
      exportFormats: ['pdf'],
      audioCredits: 5,
      ttsMinutes: 5, // compatibility: one standard narration minute ~= one audio credit
      interactiveVoiceMinutes: 0,
      visualCredits: 0,
      aiImageQuota: 0, // compatibility alias for standard image credits
      aiCovers: false,
      batchGeneration: false,
      prioritySupport: false,
      elevenLabsTTS: false,
      cinematicVideo: false,
      seats: 1,
      marketplaceFeeBps: 1500,
      deepResearch: false,
      creatorBusinessHub: false,
      organizationTools: false,
    },
  },
  student: {
    name: 'Creator',
    publicId: 'creator',
    monthlyPrice: 19,
    annualPrice: 190,
    legacyProductIds: ['prod_TaQSrotoUkTuPC'],
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: 10,
      aiTextWordsPerMonth: 250_000,
      maxWordCount: 4000,
      exportFormats: ['pdf', 'epub', 'docx'],
      audioCredits: 15,
      ttsMinutes: 15,
      interactiveVoiceMinutes: 0,
      visualCredits: 10,
      aiImageQuota: 10,
      aiCovers: true,
      batchGeneration: false,
      prioritySupport: false,
      elevenLabsTTS: false,
      cinematicVideo: false,
      seats: 1,
      marketplaceFeeBps: 1000,
      deepResearch: false,
      creatorBusinessHub: false,
      organizationTools: false,
    },
  },
  premium: {
    name: 'Pro',
    publicId: 'pro',
    monthlyPrice: 69,
    annualPrice: 690,
    legacyProductIds: ['prod_TaQU3ILEUpbXOT'],
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: 30,
      aiTextWordsPerMonth: 1_000_000,
      maxWordCount: 6000,
      exportFormats: ['pdf', 'epub', 'docx', 'kdp-pdf'],
      audioCredits: 60,
      ttsMinutes: 60,
      interactiveVoiceMinutes: 20,
      visualCredits: 60,
      aiImageQuota: 60,
      aiCovers: true,
      batchGeneration: false,
      prioritySupport: true,
      elevenLabsTTS: true,
      cinematicVideo: true,
      seats: 1,
      marketplaceFeeBps: 500,
      deepResearch: true,
      creatorBusinessHub: true,
      organizationTools: false,
    },
  },
  prophet_tier: {
    name: 'Teams',
    publicId: 'teams',
    monthlyPrice: 199,
    annualPrice: 1990,
    legacyProductIds: ['prod_U0fmlf14TPlMKj', 'prod_TaQWA7MSUntiMy'],
    features: {
      canGenerateBooks: true,
      maxBooksPerMonth: 100,
      aiTextWordsPerMonth: 2_500_000,
      maxWordCount: 6000,
      exportFormats: ['pdf', 'epub', 'docx', 'kdp-pdf'],
      audioCredits: 180,
      ttsMinutes: 180,
      interactiveVoiceMinutes: 60,
      visualCredits: 200,
      aiImageQuota: 200,
      aiCovers: true,
      batchGeneration: true,
      prioritySupport: true,
      prophetMode: true,
      aiResearchAssistant: true,
      elevenLabsTTS: true,
      cinematicVideo: true,
      seats: 5,
      marketplaceFeeBps: 300,
      deepResearch: true,
      creatorBusinessHub: true,
      organizationTools: true,
    },
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;
export type PublicPlanId = (typeof SUBSCRIPTION_TIERS)[SubscriptionTier]['publicId'];

export const PUBLISHING_SERVICE_PACKAGES = {
  single_edition: {
    name: 'Single Edition',
    price: 49,
    priceCents: 4900,
    maxIsbns: 1,
    formats: 1,
    description: 'One publication format with identity, metadata validation, barcode, and an eligible ScrollLibrary Press ISBN.',
  },
  print_digital: {
    name: 'Print + Digital',
    price: 99,
    priceCents: 9900,
    maxIsbns: 2,
    formats: 2,
    description: 'Two publication formats with format-specific identifiers, metadata, and production validation.',
  },
  complete_edition: {
    name: 'Complete Edition',
    price: 149,
    priceCents: 14900,
    maxIsbns: 3,
    formats: 3,
    description: 'Paperback, hardcover, and EPUB publication records with up to three eligible ScrollLibrary Press ISBNs.',
  },
  assisted_launch: {
    name: 'Assisted Publishing Launch',
    price: 399,
    priceCents: 39900,
    maxIsbns: 3,
    formats: 3,
    description: 'Human-assisted publishing setup, metadata QA, distribution preparation, and launch support. Starts at $399.',
  },
} as const;

export const USAGE_ADDONS = {
  ai_text_250k: {
    name: '+250k AI text words',
    price: 15,
    priceCents: 1500,
    aiTextWords: 250_000,
  },
  visual_50: {
    name: '+50 visual credits',
    price: 20,
    priceCents: 2000,
    visualCredits: 50,
  },
  audio_60: {
    name: '+60 audio credits',
    price: 15,
    priceCents: 1500,
    audioCredits: 60,
  },
  team_seat: {
    name: 'Additional Teams seat',
    price: 25,
    priceCents: 2500,
    seats: 1,
  },
} as const;

// Legacy publisher-tier subscriptions are reconciliation-only. They must never
// reappear as a second public subscription family.
export const CREATOR_SUBSCRIPTION_TIERS = {
  creator: {
    name: 'Legacy Publisher',
    price_id: 'price_1TalITJYFIBeCvefdkr4LeL7',
    product_id: 'prod_UZv8Eine5sKy0j',
    monthlyPrice: 19,
    currency: 'EUR',
  },
  creator_pro: {
    name: 'Legacy Publisher Pro',
    price_id: 'price_1TalIUJYFIBeCvefHU67sm3O',
    product_id: 'prod_UZv8yPrOGDBuWE',
    monthlyPrice: 49,
    currency: 'EUR',
  },
} as const;

export type CreatorTier = keyof typeof CREATOR_SUBSCRIPTION_TIERS;

export function getTierFromProductId(productId: string | null): SubscriptionTier {
  if (!productId) return 'free';
  for (const [tier, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if ((config.legacyProductIds as readonly string[]).includes(productId)) {
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

export function getAiTextWordLimit(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.aiTextWordsPerMonth;
}

export function getVisualCreditLimit(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.visualCredits;
}

export function getAudioCreditLimit(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.audioCredits;
}

export function getMarketplaceFeeBps(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.marketplaceFeeBps;
}

export function canExportFormat(tier: SubscriptionTier, format: string): boolean {
  const formats = SUBSCRIPTION_TIERS[tier].features.exportFormats as readonly string[];
  return formats.includes(format);
}

export function getTTSMinutes(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.ttsMinutes;
}

// Ownership/commercial rights are not subscription entitlements. This helper is
// retained for compatibility with older UI call sites and always returns true.
export function hasCommercialRights(_tier: SubscriptionTier): boolean {
  return true;
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
  return SUBSCRIPTION_TIERS[tier].features.aiImageQuota;
}

export function getInteractiveVoiceMinutes(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS[tier].features.interactiveVoiceMinutes;
}

export function getWordCountOptions(tier: SubscriptionTier): number[] {
  const maxWords = getMaxWordCount(tier);
  const allOptions: number[] = [2000, 3000, 4000, 5000, 6000];
  return allOptions.filter((w: number) => w <= maxWords);
}
