import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.8a3582c02c2b49a9957f5eb218b15058',
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
