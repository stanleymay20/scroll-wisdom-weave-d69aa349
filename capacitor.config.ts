import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reversible beta-only identity; not a registered store/production identity.
  appId: 'org.scrolllibrary.beta',
  appName: 'ScrollLibrary',
  webDir: 'dist-native.local',
  // Packaged assets only; never load a remote preview server.
  server: { cleartext: false },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0f172a',
    preferredContentMode: 'mobile',
    scrollEnabled: true
  },
  android: {
    backgroundColor: '#0f172a',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#d4af37'
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a'
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    }
  }
};

export default config;
