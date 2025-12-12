// ScrollLibrary Global Configuration

// Launch mode: When true, enables limited free generation for promotional period
export const LAUNCH_MODE = true;

// Launch mode limits
export const LAUNCH_MODE_CONFIG = {
  freeBookLimit: 1, // Books per day for free tier
  freeMaxWordCount: 4000, // Max words per chapter for free tier
  freeExportFormats: ['pdf_low'] as const, // Only low-quality PDF
  showBanner: true, // Show promotional banner
};

// Feature flags
export const FEATURES = {
  enableTTS: true,
  enableAICovers: true,
  enableBatchGeneration: true,
  enableElevenLabsTTS: true,
};
