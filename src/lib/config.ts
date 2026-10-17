// ScrollLibrary Global Configuration
// ===========================================
// 60-DAY PMF VALIDATION MODE
// ===========================================

export const TRIAL_MODE = false;
export const TRIAL_END_DATE = new Date('2026-01-20');

export const isTrialActive = (): boolean => false;

// Launch mode: free generation for validation
export const LAUNCH_MODE = true;

export const isLaunchModeActive = (): boolean => true;

export const LAUNCH_MODE_CONFIG = {
  freeBookLimit: 1, // 1 book per month for free tier
  freeMaxWordCount: 4000,
  freeExportFormats: ['pdf'] as const, // Free tier gets PDF only
  showBanner: false,
};

// Export formats
export const EXPORT_FORMATS = ['pdf', 'epub', 'docx'] as const;
export type ExportFormat = typeof EXPORT_FORMATS[number];

// ===========================================
// PMF MODE: Feature flags
// Only Generate → Read → Quiz → Certificate
// ===========================================
export const PMF_MODE = true; // GA launch scope: core Generate → Read → Quiz → Certificate

function explicitClientFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

// Master commercial release hold. A master release decision must never activate
// unqualified product journeys by itself. Each independent capability below
// requires BOTH this master hold and its own explicit, default-OFF flag.
export const COMMERCIAL_GA_ENABLED = explicitClientFlag(
  import.meta.env.VITE_COMMERCIAL_GA_ENABLED,
);

const commercialCapabilityEnabled = (value: string | undefined): boolean =>
  COMMERCIAL_GA_ENABLED && explicitClientFlag(value);

// Browser flags are presentation/route boundaries only. The matching Edge
// Function GA flags remain authoritative and fail closed separately.
const INDIVIDUAL_SUBSCRIPTION_CHECKOUT_ENABLED = commercialCapabilityEnabled(
  import.meta.env.VITE_GA_INDIVIDUAL_SUBSCRIPTIONS_ENABLED,
);
const USAGE_ADDON_CHECKOUT_ENABLED = commercialCapabilityEnabled(
  import.meta.env.VITE_GA_USAGE_ADDONS_ENABLED,
);
const TEAMS_SUBSCRIPTION_CHECKOUT_ENABLED = commercialCapabilityEnabled(
  import.meta.env.VITE_GA_TEAMS_SUBSCRIPTIONS_ENABLED,
);
const PUBLISHING_SERVICE_CHECKOUT_ENABLED = commercialCapabilityEnabled(
  import.meta.env.VITE_GA_PUBLISHING_SERVICES_ENABLED,
);

// Creator marketplace money movement has an additional dependency: verified
// seller payout settlement. Keep it independently fail-closed even when SaaS
// subscriptions and ScrollLibrary Press commerce are live.
export const MARKETPLACE_GA_ENABLED = explicitClientFlag(
  import.meta.env.VITE_MARKETPLACE_GA_ENABLED,
);

export const SPECIALIZED_AUTHORING_ENABLED = explicitClientFlag(
  import.meta.env.VITE_SPECIALIZED_AUTHORING_ENABLED,
);

export const FEATURES = {
  enableTTS: true,
  enableAICovers: commercialCapabilityEnabled(import.meta.env.VITE_GA_AI_COVERS_ENABLED),
  enableBatchGeneration: false,
  enableElevenLabsTTS: false,
  // PMF-disabled features
  enableComics: !PMF_MODE,
  enableIllustrated: !PMF_MODE,
  enableWorkbooks: !PMF_MODE,
  enableFlashcards: !PMF_MODE,
  enableLearningDecks: !PMF_MODE,
  enableCodePlayground: !PMF_MODE,
  enableVoiceConversation: !PMF_MODE,
  enableInteractiveQA: !PMF_MODE,
  enableDeepResearch: !PMF_MODE,
  enableSkillRadar: !PMF_MODE,
  enableComicMode: !PMF_MODE,
  enableChapterVideo: !PMF_MODE,
  enableKnowledgeGraph: !PMF_MODE,
  enableStudyMusic: !PMF_MODE,
  // Independent, explicit commercial authorizations. Do not collapse these
  // into COMMERCIAL_GA_ENABLED, which is only a master kill switch.
  enableSubscriptionCheckout: INDIVIDUAL_SUBSCRIPTION_CHECKOUT_ENABLED,
  enableUsageAddonCheckout: USAGE_ADDON_CHECKOUT_ENABLED,
  enableTeamsSubscriptionCheckout: TEAMS_SUBSCRIPTION_CHECKOUT_ENABLED,
  enablePublishingServicesCheckout: PUBLISHING_SERVICE_CHECKOUT_ENABLED,
  enableStripeConnect: MARKETPLACE_GA_ENABLED && explicitClientFlag(import.meta.env.VITE_GA_STRIPE_CONNECT_ENABLED),
  enableMarketplace: MARKETPLACE_GA_ENABLED,
  enableSpecializedAuthoring: SPECIALIZED_AUTHORING_ENABLED,
  enableAdvancedAuthoring: commercialCapabilityEnabled(import.meta.env.VITE_GA_ADVANCED_AUTHORING_ENABLED),
  enableChapterRegeneration: commercialCapabilityEnabled(import.meta.env.VITE_GA_CHAPTER_REGENERATION_ENABLED),
  enableCustomCover: commercialCapabilityEnabled(import.meta.env.VITE_GA_CUSTOM_COVER_ENABLED),
  enableExports: commercialCapabilityEnabled(import.meta.env.VITE_GA_EXPORTS_ENABLED),
  enableEditorialPipeline: commercialCapabilityEnabled(import.meta.env.VITE_GA_EDITORIAL_PIPELINE_ENABLED),
  enableReleaseScheduling: commercialCapabilityEnabled(import.meta.env.VITE_GA_RELEASE_SCHEDULING_ENABLED),
  enableCanonicalPublication: commercialCapabilityEnabled(import.meta.env.VITE_GA_CANONICAL_PUBLICATION_ENABLED),
};
