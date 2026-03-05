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
  },
  plugins: {
    Keyboard: { resizeOnFullScreen: true },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    SplashScreen: { launchAutoHide: false, showSpinner: false },
    StatusBar: { style: 'LIGHT' },
  },
};

export default config;
