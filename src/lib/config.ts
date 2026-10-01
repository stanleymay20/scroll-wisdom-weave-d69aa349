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

// Full commercial GA is independent from specialized-generation qualification.
// It opens the paid/publishing surface, while book types such as academic,
// technical, illustrated, children, comic, fiction, etc. still require the
// separate empirical provider-qualification allow-list below.
export const COMMERCIAL_GA_ENABLED = explicitClientFlag(
  import.meta.env.VITE_COMMERCIAL_GA_ENABLED,
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
  enableAICovers: COMMERCIAL_GA_ENABLED,
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
  // Commercial GA is opened deliberately and independently from PMF-only
  // experimental/study features. Backend financial/publication gates remain
  // authoritative even when these browser surfaces are enabled.
  enablePaidCheckout: COMMERCIAL_GA_ENABLED,
  enableSubscriptionCheckout: COMMERCIAL_GA_ENABLED,
  enableStripeConnect: MARKETPLACE_GA_ENABLED,
  enableMarketplace: MARKETPLACE_GA_ENABLED,
  enableSpecializedAuthoring: SPECIALIZED_AUTHORING_ENABLED,
  enableAdvancedAuthoring: COMMERCIAL_GA_ENABLED,
  enableChapterRegeneration: COMMERCIAL_GA_ENABLED,
  enableCustomCover: COMMERCIAL_GA_ENABLED,
  enableExports: COMMERCIAL_GA_ENABLED,
  enableEditorialPipeline: COMMERCIAL_GA_ENABLED,
  enableReleaseScheduling: COMMERCIAL_GA_ENABLED,
  enableCanonicalPublication: COMMERCIAL_GA_ENABLED,
};
