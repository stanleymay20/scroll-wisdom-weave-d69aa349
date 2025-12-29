// Build-time constants injected by Vite
declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;

export const BUILD_INFO = {
  id: `web:${typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}`,
  time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString(),
} as const;