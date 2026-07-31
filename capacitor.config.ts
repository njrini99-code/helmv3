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
  android: {
    // Mirrors the iOS block. Every value here has a reason — do not drop one
    // assuming the Android default is equivalent.
    //
    // appendUserAgent is LOAD-BEARING, not cosmetic. src/proxy.ts keys its
    // marketing-route block on the literal string 'HelmSportsLabsApp'
    // (NATIVE_UA_MARKER). Omit it and the Android shell is treated as an
    // ordinary browser: the landing page, pricing and membership surfaces all
    // render inside the app. Play does not enforce Apple's Guideline 3.1.1, but
    // the block is also what makes this read as an app rather than a website in
    // a frame — and it keeps the two platforms behaving identically.
    appendUserAgent: 'HelmSportsLabsApp',
    // The web app is served over HTTPS from helmsportslabs.com; never let the
    // WebView silently downgrade a subresource.
    allowMixedContent: false,
    // Same posture as iOS: no inspector in shipped builds.
    webContentsDebuggingEnabled: false,
    // Cream (#EDE0C8) matches the splash and the app's canvas, so the window
    // behind the WebView never flashes white during navigation or rotation.
    backgroundColor: '#EDE0C8',
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
    // launchAutoHide MUST stay true. The only code path that hides this splash
    // is hideSplashScreen() in CapacitorProvider, which runs after the WebView
    // has fetched the remote app, downloaded the bundle and hydrated React.
    // With launchAutoHide:false, ANY failure before that point -- slow network,
    // a bad deploy, an offline device, a reviewer on hotel wifi -- left the
    // splash up forever with no watchdog, and the app read as permanently
    // frozen rather than merely slow. Reproduced on an Android 16 emulator:
    // stuck on the splash indefinitely. launchShowDuration is the ceiling, not
    // the target -- a healthy cold start still hides early via hideSplashScreen().
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 10000,
      backgroundColor: '#EDE0C8',
      showSpinner: false,
    },
    StatusBar: { style: 'LIGHT' },
  },
};

export default config;
