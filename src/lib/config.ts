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

export const FEATURES = {
  enableTTS: true,
  enableAICovers: !PMF_MODE,
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
  // External financial writes stay closed until the exact-head Stripe sandbox
  // lifecycle has passed and production is deliberately opened.
  enablePaidCheckout: !PMF_MODE,
  enableSubscriptionCheckout: !PMF_MODE,
  enableStripeConnect: !PMF_MODE,
  enableAdvancedAuthoring: !PMF_MODE,
  enableChapterRegeneration: !PMF_MODE,
  enableCustomCover: !PMF_MODE,
  enableExports: !PMF_MODE,
  enableEditorialPipeline: !PMF_MODE,
  enableReleaseScheduling: !PMF_MODE,
  enableCanonicalPublication: !PMF_MODE,
};
