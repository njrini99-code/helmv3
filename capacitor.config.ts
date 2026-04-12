import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.helmsportslabs.golfhelm',
  appName: 'Helm Sports Labs',
  webDir: 'public',
  server: {
    // Point to the app (not the marketing landing page)
    url: 'https://www.helmsportslabs.com/golf/login',
    cleartext: false,
    allowNavigation: ['*.helmsportslabs.com', 'helmsportslabs.com'],
  },
  ios: {
    allowsLinkPreview: false,
    scrollEnabled: true,
    // Prevent the web inspector toolbar in debug builds
    webContentsDebuggingEnabled: false,
    // Mobile UA so the web app gets mobile layout
    preferredContentMode: 'mobile',
    // Edge-to-edge content — web code handles env(safe-area-inset-*) itself
    contentInset: 'never',
  },
  plugins: {
    Keyboard: {
      resize: 'ionic',
      resizeOnFullScreen: true,
      scrollAssist: true,
      scrollPadding: true,
    },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    SplashScreen: { launchAutoHide: false, showSpinner: false },
    StatusBar: { style: 'LIGHT' },
  },
};

export default config;
