import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.helmsportslabs.golfhelm',
  appName: 'Helm Sports Labs',
  webDir: 'public',
  server: {
    // Point to the app (not the marketing landing page). /golf/dashboard, not
    // /golf/login: an already-authed player at /login gets client-bounced
    // login → welcome (deliberate ~3s splash) → dashboard, painting five
    // sequential shells on every cold start. Landing on the dashboard lets
    // middleware pass authed users straight through (one skeleton) and 307s
    // signed-out users to /golf/login?returnTo=... server-side. Matches the
    // PWA manifest's start_url.
    url: 'https://www.helmsportslabs.com/golf/dashboard',
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
    // Marker appended to UA so the server-side proxy can detect native iOS
    // requests and block marketing/membership pages (App Store Guideline 3.1.1).
    appendUserAgent: 'HelmSportsLabsApp',
  },
  plugins: {
    Keyboard: {
      // @ts-expect-error — Capacitor types don't include 'ionic' but it's valid at runtime
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
