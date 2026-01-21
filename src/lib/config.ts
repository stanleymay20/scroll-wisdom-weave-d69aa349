// ScrollLibrary Global Configuration

// ===========================================
// PRODUCTION MODE - Trial period has ended
// ===========================================
export const TRIAL_MODE = false;
export const TRIAL_END_DATE = new Date('2026-01-20'); // Trial ended

// Check if trial is still active (now returns false)
export const isTrialActive = (): boolean => {
  return false; // Trial period ended - use normal subscription logic
};

// Launch mode: When true, enables limited free generation for promotional period
export const LAUNCH_MODE = false; // Disabled for production

// Check if launch mode restrictions should apply
export const isLaunchModeActive = (): boolean => {
  return false; // Production mode - use full subscription logic
};

// Launch mode limits (kept for reference)
export const LAUNCH_MODE_CONFIG = {
  freeBookLimit: 1, // Books per day for free tier
  freeMaxWordCount: 4000, // Max words per chapter for free tier
  freeExportFormats: [] as const, // Free tier cannot export
  showBanner: false, // No promotional banner in production
};

// Export formats (production-only, no HTML/markdown)
export const EXPORT_FORMATS = ['pdf', 'epub', 'docx'] as const;
export type ExportFormat = typeof EXPORT_FORMATS[number];

// Feature flags
export const FEATURES = {
  enableTTS: true,
  enableAICovers: true,
  enableBatchGeneration: true,
  enableElevenLabsTTS: true,
};
