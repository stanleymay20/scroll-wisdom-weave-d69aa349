// ScrollLibrary Global Configuration

// Launch mode: When true, enables limited free generation for promotional period
export const LAUNCH_MODE = true;

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
