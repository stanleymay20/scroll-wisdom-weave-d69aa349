// ScrollLibrary Global Configuration

// ===========================================
// TRIAL MODE - 30 DAY FREE ACCESS FOR ALL USERS
// Set to false after trial period ends to restore normal subscription logic
// ===========================================
export const TRIAL_MODE = true;
export const TRIAL_END_DATE = new Date('2026-01-20'); // 30 days from Dec 21, 2025

// Check if trial is still active
export const isTrialActive = (): boolean => {
  if (!TRIAL_MODE) return false;
  return new Date() < TRIAL_END_DATE;
};

// Launch mode: When true, enables limited free generation for promotional period
// NOTE: Launch mode is disabled during trial mode - trial gives full access
export const LAUNCH_MODE = true;

// Check if launch mode restrictions should apply (disabled during trial)
export const isLaunchModeActive = (): boolean => {
  if (isTrialActive()) return false; // Trial mode overrides launch mode
  return LAUNCH_MODE;
};

// Launch mode limits
export const LAUNCH_MODE_CONFIG = {
  freeBookLimit: 1, // Books per day for free tier
  freeMaxWordCount: 4000, // Max words per chapter for free tier
  freeExportFormats: [] as const, // Free tier cannot export
  showBanner: true, // Show promotional banner
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
