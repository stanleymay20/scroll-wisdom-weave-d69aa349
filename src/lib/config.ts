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
export const PMF_MODE = false; // All features enabled

export const FEATURES = {
  enableTTS: true,
  enableAICovers: true,
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
  enableDeepResearch: !PMF_MODE,
  enableSkillRadar: !PMF_MODE,
  enableComicMode: !PMF_MODE,
  enableChapterVideo: !PMF_MODE,
};
