<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Committed 2026-03-05 ("comprehensive app stability overhaul"), iOS App Store submission scope. Not confirmed against current App Store Connect status in the 2026-07-10 sweep — re-verify before relying on this; treat as historical if the submission has since moved forward.
KEPT FOR HISTORY -- do not delete this file.
-->

# iOS Native Integration & Capacitor Audit

**Date:** 2026-03-05
**App:** Helm Sports Labs (GolfHelm)
**Bundle ID:** `com.helmsportslabs.golfhelm`
**Capacitor Version:** 8.1.0
**Deployment Target:** iOS 15.0
**Swift Version:** 5.0

---

## Executive Summary

**Overall Risk Level: CRITICAL**

This app is a Capacitor 8 wrapper that loads the live website (`https://www.helmsportslabs.com/golf/login`) via WKWebView with virtually zero native integration. It has only 2 Capacitor plugins installed (Keyboard and Browser), no push notifications, no entitlements file, no native code beyond the stock Capacitor boilerplate, and no app icon configuration beyond a single 1024x1024 image.

**The #1 risk is Apple Guideline 4.2 (Minimum Functionality) rejection.** In its current state, this app provides no functionality that Safari cannot provide. Apple will almost certainly reject it.

---

## 1. Info.plist Analysis

**File:** `ios/App/App/Info.plist`

### Present
| Key | Value | Status |
|-----|-------|--------|
| `CFBundleDisplayName` | "Helm Sports Labs" | OK |
| `CFBundleShortVersionString` | `$(MARKETING_VERSION)` = 1.0.0 | OK |
| `CFBundleVersion` | `$(CURRENT_PROJECT_VERSION)` = 1 | OK |
| `LSRequiresIPhoneOS` | true | OK |
| `UILaunchStoryboardName` | LaunchScreen | OK |
| `UIMainStoryboardFile` | Main | OK |
| `UISupportedInterfaceOrientations` | Portrait, LandscapeLeft, LandscapeRight | OK |
| `UIViewControllerBasedStatusBarAppearance` | true | OK |
| `ITSAppUsesNonExemptEncryption` | false | OK - avoids export compliance dialog |
| `NSCameraUsageDescription` | Present | OK |
| `NSPhotoLibraryUsageDescription` | Present | OK |

### Missing (CRITICAL)
| Key | Purpose | Impact |
|-----|---------|--------|
| `NSLocationWhenInUseUsageDescription` | Location for golf courses | Crash if location requested without this |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | Background location | Needed if tracking rounds |
| `UIBackgroundModes` | Push notifications, background fetch | Required for push notifications |
| `CFBundleURLTypes` | Deep linking / URL schemes | No deep linking support |
| `NSMicrophoneUsageDescription` | Voice input | If CoachHelm AI uses voice |

### Issues
- **No `UIBackgroundModes`** = no push notifications, no background fetch, no background processing
- **No `CFBundleURLTypes`** = no deep linking, no OAuth callback URL scheme
- **No `UISupportedInterfaceOrientations~ipad`** = iPad orientation not explicitly configured
- Privacy descriptions exist for Camera and Photo Library but these are likely carried over from Capacitor defaults - the web app doesn't appear to use native camera/photo features

---

## 2. Entitlements

**STATUS: NO ENTITLEMENTS FILE EXISTS**

No `.entitlements` file was found anywhere in `ios/`. This means:

| Capability | Status | Impact |
|------------|--------|--------|
| Push Notifications | NOT CONFIGURED | Cannot receive push notifications |
| Associated Domains | NOT CONFIGURED | No Universal Links (deep linking) |
| Sign in with Apple | NOT CONFIGURED | Cannot use Apple ID auth |
| Background Modes | NOT CONFIGURED | No background processing |
| App Groups | NOT CONFIGURED | Cannot share data with extensions |

**Required Actions:**
1. Create `App.entitlements` file
2. Add `aps-environment` entitlement for push notifications
3. Add `com.apple.developer.associated-domains` for Universal Links
4. Configure in Xcode under Signing & Capabilities

---

## 3. App Icons

**Directory:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

### Current State
- **1 file:** `AppIcon-512@2x.png` (110KB, 1024x1024)
- **Contents.json:** Single universal entry with `"platform": "ios"`, `"size": "1024x1024"`

### Assessment
This is the **modern single-icon format** (Xcode 14+/iOS 16+) where you provide one 1024x1024 image and Xcode auto-generates all sizes. This is technically valid for iOS 16+.

**However:**
- Since the deployment target is iOS 15.0, older devices may not get properly scaled icons
- The single-icon approach is fine for iOS 16+, but for iOS 15 support, the traditional multi-size icon set is safer
- Verify the icon meets Apple's guidelines: no transparency, no rounded corners (iOS applies them), appropriate design at small sizes

**Recommendation:** Either raise deployment target to iOS 16.0 (recommended) or provide the full icon set for iOS 15 compatibility.

---

## 4. Launch Screen / Splash Screen

### LaunchScreen.storyboard
**File:** `ios/App/App/Base.lproj/LaunchScreen.storyboard`

- Uses `scaleAspectFill` image view with `image="Splash"`
- Background: `systemBackgroundColor` (white)
- Fixed frame: 375x667 (iPhone 8 size) with `autoresizingMask`
- References `Splash.imageset` from Assets.xcassets

### Splash.imageset
- 3 identical 2732x2732 splash images at 1x, 2x, 3x (41KB each = ~123KB total)
- All three files appear to be the same image duplicated

### Issues
- **All three splash files are the same size (41KB, 2732x2732)** - wasteful, should be properly scaled for each density
- The storyboard uses fixed dimensions (375x667) which may not scale properly on newer devices
- No dark mode variant
- Launch screen should ideally be a simple storyboard with constraints, not a bitmap image (Apple prefers constraint-based launch screens)

---

## 5. Xcode Project Configuration

**File:** `ios/App/App.xcodeproj/project.pbxproj`

### Build Settings
| Setting | Value | Assessment |
|---------|-------|------------|
| `IPHONEOS_DEPLOYMENT_TARGET` | 15.0 | Low - could raise to 16.0 or 17.0 |
| `SWIFT_VERSION` | 5.0 | Outdated - current is Swift 6.x |
| `TARGETED_DEVICE_FAMILY` | 1 (iPhone only) | OK for now, but iPad support is expected |
| `MARKETING_VERSION` | 1.0.0 | OK |
| `CURRENT_PROJECT_VERSION` | 1 | OK |
| `CODE_SIGN_STYLE` | Automatic | OK for development |
| `PRODUCT_BUNDLE_IDENTIFIER` | com.helmsportslabs.golfhelm | OK |

### Signing Configuration
- `CODE_SIGN_IDENTITY` = "iPhone Developer" (project level)
- `CODE_SIGN_STYLE` = Automatic (target level)
- No development team is configured in the project file
- **Must configure team ID and provisioning profiles before submission**

### Dependency Management
- Uses Swift Package Manager (SPM) via local package `CapApp-SPM`
- No CocoaPods (no Podfile found)
- No Carthage

### Issues
- `LastSwiftUpdateCheck = 0920` / `LastUpgradeCheck = 0920` - project was created with Xcode 9.2, very old
- `compatibilityVersion = "Xcode 8.0"` - ancient, should be updated
- No development team configured
- CLANG_CXX_LANGUAGE_STANDARD = "gnu++14" - outdated
- `UIRequiredDeviceCapabilities` requires `armv7` which is obsolete (all iOS 15+ devices are arm64)

---

## 6. Capacitor Configuration

### capacitor.config.ts (Source of Truth)
```typescript
const config: CapacitorConfig = {
  appId: 'com.helmsportslabs.golfhelm',
  appName: 'Helm Sports Labs',
  webDir: 'public',
  server: {
    url: 'https://www.helmsportslabs.com/golf/login',
    cleartext: false,
    allowNavigation: ['*.helmsportslabs.com', 'helmsportslabs.com'],
  },
  ios: {
    allowsLinkPreview: false,
    scrollEnabled: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Keyboard: { resizeOnFullScreen: true },
  },
};
```

### CRITICAL ISSUE: Remote URL Server Configuration

**`server.url: 'https://www.helmsportslabs.com/golf/login'`**

This means the app loads 100% of its content from the live website. The `public/` folder included in the bundle is essentially unused (it contains static assets from the website build, not a standalone app).

**This is the single biggest App Store rejection risk.** Apple's Guideline 4.2 states:
> "Your app should include features, content, and UI that elevate it beyond a repackaged website."

This app literally IS a repackaged website. There is no local bundle - everything comes from the remote URL.

### Compiled capacitor.config.json (iOS bundle)
Mirrors the TypeScript config exactly, with `packageClassList: ["KeyboardPlugin"]` added by Capacitor CLI.

---

## 7. Capacitor Plugins Audit

### Currently Installed (package.json)
| Plugin | Version | Purpose | Actually Used? |
|--------|---------|---------|----------------|
| `@capacitor/core` | 8.1.0 | Core runtime | Yes (required) |
| `@capacitor/cli` | 8.1.0 | Build tooling | Dev only |
| `@capacitor/ios` | 8.1.0 | iOS platform | Yes (required) |
| `@capacitor/keyboard` | 8.0.1 | Keyboard management | Yes - hides accessory bar |
| `@capacitor/browser` | 8.0.1 | In-app browser | Yes - opens external URLs |

### Registered in SPM (Package.swift)
Only `CapacitorKeyboard` is registered. `@capacitor/browser` is used from JS but not registered as a native SPM dependency (it may work via Capacitor's plugin auto-detection, but this should be verified).

### Missing Essential Plugins
| Plugin | Purpose | Priority |
|--------|---------|----------|
| `@capacitor/push-notifications` | Push notifications | **CRITICAL** - required for App Store |
| `@capacitor/app` | App lifecycle, deep linking, state | **CRITICAL** - required for proper native behavior |
| `@capacitor/splash-screen` | Splash screen control | **HIGH** - programmatic splash management |
| `@capacitor/status-bar` | Status bar style/color | **HIGH** - native look and feel |
| `@capacitor/haptics` | Haptic feedback | **HIGH** - native feel for interactions |
| `@capacitor/share` | Native share sheet | **MEDIUM** - share round/stats data |
| `@capacitor/local-notifications` | Local notifications | **MEDIUM** - round reminders, sync alerts |
| `@capacitor/camera` | Native camera | **MEDIUM** - if camera features needed |
| `@capacitor/geolocation` | GPS location | **MEDIUM** - golf course detection |
| `@capacitor/network` | Network status | **MEDIUM** - offline/online detection |
| `@capacitor/preferences` | Local storage | **LOW** - persistent key-value |
| `@capacitor/screen-orientation` | Screen lock | **LOW** - lock during rounds |

---

## 8. Native Code Analysis

### AppDelegate.swift
**File:** `ios/App/App/AppDelegate.swift`

This is the **stock Capacitor boilerplate** with zero customization:
- Standard `UIApplicationDelegate` methods (all empty/default comments)
- `ApplicationDelegateProxy.shared` for URL and Universal Link handling
- No push notification registration
- No custom initialization
- No analytics SDK initialization
- No crash reporting setup

### Missing from AppDelegate:
```swift
// Push notification registration
func application(_ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) { }
func application(_ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error) { }

// Background fetch
func application(_ application: UIApplication,
    performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) { }
```

---

## 9. Web-Side Native Feature Usage

### capacitor.ts Utility
The web codebase has a thin Capacitor integration layer (`src/lib/utils/capacitor.ts`):

1. **`isNativeApp()`** - Detects Capacitor runtime (window.Capacitor)
2. **`initCapacitor()`** - Hides keyboard accessory bar
3. **`openExternalUrl()`** - Opens URLs in SFSafariViewController on native, new tab on web

### Usage in Auth Pages
- `login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx` all import `isNativeApp`
- Used to conditionally hide/show elements in native mode (e.g., hide navigation back to marketing site)

### Usage in Components
- `DocumentCard.tsx` and `DocumentPreview.tsx` use `openExternalUrl` for document links
- `MessageAttachment.tsx` uses `openExternalUrl` for attachment links

### CapacitorProvider
- Mounted in root `layout.tsx`
- Calls `initCapacitor()` on mount (hides keyboard accessory bar)

### Summary of Native Features Actually Used
| Feature | Implementation | Native Integration Level |
|---------|---------------|------------------------|
| Keyboard accessory bar | Hide toolbar | Trivial |
| External URL opening | In-app browser | Trivial |
| Native detection | Show/hide elements | Trivial |

**Total native integration: MINIMAL (3 trivial features)**

---

## 10. Service Worker & PWA

A service worker (`sw.js`) exists in the public directory with:
- Offline caching strategy (static + dynamic + API caches)
- Background sync for shot data
- Push notification handling (web push, not native APNs)
- Offline page fallback

**Note:** The service worker is designed for web PWA functionality. In a Capacitor app loading from a remote URL, its behavior may be unpredictable. The push notification code in `sw.js` uses Web Push API, not native APNs push - these are completely different systems.

---

## 11. Guideline 4.2 Risk Assessment

### Current Native Feature Count: 2
1. Keyboard accessory bar hiding
2. In-app browser for external links

### What Apple Reviewers Will See
1. App launches
2. WebView loads `https://www.helmsportslabs.com/golf/login`
3. Entire app is the website rendered in WKWebView
4. No push notifications
5. No native navigation
6. No haptic feedback
7. No native share functionality
8. No offline capability (beyond what the service worker provides)
9. No app-exclusive features
10. Safari can do everything this app does

### Apple's Guideline 4.2 - Minimum Functionality
> "We don't approve apps that are merely a website bundled as an app."

**Rejection probability: ~95%**

Apple has been increasingly strict about web wrapper apps since 2023. Capacitor/Ionic apps CAN be approved, but they must demonstrate native value beyond the website.

### What Must Be Added for Approval

#### CRITICAL (Without these, rejection is almost certain)
1. **Push Notifications** - Native APNs, not web push. Requires:
   - `@capacitor/push-notifications` plugin
   - Entitlements file with `aps-environment`
   - `UIBackgroundModes` with `remote-notification`
   - Server-side APNs integration
   - Registration in AppDelegate

2. **Offline Functionality** - Must work meaningfully without internet:
   - Local data caching of rounds, stats, roster
   - Offline round entry
   - Sync when online
   - Currently loads remote URL so no offline capability at all

3. **Native UI Elements** - Must look and feel like a native app:
   - Status bar configuration
   - Haptic feedback on key interactions
   - Native share sheet
   - Proper splash screen transition

#### HIGH PRIORITY (Significantly improve approval chances)
4. **Deep Linking / Universal Links**
   - Entitlements with associated domains
   - `CFBundleURLTypes` in Info.plist
   - Handle links from emails, messages, etc.

5. **App Lifecycle Management**
   - `@capacitor/app` plugin for proper state management
   - Handle backgrounding/foregrounding
   - Handle back button behavior

6. **Geolocation for Golf Course Detection**
   - `@capacitor/geolocation` for auto-detecting courses
   - Location-based features exclusive to mobile

7. **Local Notifications**
   - Round reminders
   - Task deadlines
   - Practice schedule alerts

#### NICE TO HAVE (Differentiation)
8. Camera integration for round photos
9. Screen orientation locking during rounds
10. Biometric authentication (Face ID / Touch ID)
11. Widget support (Today Extension)
12. Siri Shortcuts integration

---

## 12. config.xml and Cordova Artifacts

**File:** `ios/App/App/config.xml`
```xml
<widget version="1.0.0">
  <access origin="*" />
</widget>
```

The `<access origin="*" />` allows the WebView to load content from any origin. Combined with the Cordova compatibility files (`cordova.js`, `cordova_plugins.js`), these are standard Capacitor artifacts.

**Security concern:** `<access origin="*" />` is overly permissive. Should be restricted to `helmsportslabs.com` domains only.

---

## 13. Summary of Required Actions

### Priority 1 - BLOCKERS (Must fix before submission)

| # | Action | Effort | Files |
|---|--------|--------|-------|
| 1 | Install & configure `@capacitor/push-notifications` | High | Package.swift, AppDelegate.swift, Info.plist, entitlements |
| 2 | Create `.entitlements` file with push + associated domains | Medium | New file, project.pbxproj |
| 3 | Add `UIBackgroundModes` (remote-notification) to Info.plist | Low | Info.plist |
| 4 | Install & configure `@capacitor/app` (lifecycle) | Medium | Package.swift, capacitor.config.ts |
| 5 | Install & configure `@capacitor/status-bar` | Low | Package.swift, capacitor.config.ts |
| 6 | Install & configure `@capacitor/haptics` | Low | Package.swift, web components |
| 7 | Install & configure `@capacitor/splash-screen` | Low | Package.swift, capacitor.config.ts |
| 8 | Configure development team & provisioning | Low | project.pbxproj / Xcode |
| 9 | Implement meaningful offline functionality | High | Multiple web files |
| 10 | Fix `UIRequiredDeviceCapabilities` (remove armv7) | Low | Info.plist |

### Priority 2 - STRONG RECOMMENDATIONS

| # | Action | Effort |
|---|--------|--------|
| 11 | Install `@capacitor/share` for native sharing | Low |
| 12 | Install `@capacitor/local-notifications` | Medium |
| 13 | Install `@capacitor/geolocation` for course detection | Medium |
| 14 | Add Universal Links / deep linking | Medium |
| 15 | Update Swift version to 5.9+ | Low |
| 16 | Update Xcode project compatibility version | Low |
| 17 | Restrict `config.xml` access origin | Low |
| 18 | Add `NSLocationWhenInUseUsageDescription` if using geolocation | Low |

### Priority 3 - POLISH

| # | Action | Effort |
|---|--------|--------|
| 19 | Verify app icon quality at all sizes | Low |
| 20 | Add dark mode splash screen variant | Low |
| 21 | Replace splash image with constraint-based storyboard | Low |
| 22 | Consider raising deployment target to iOS 16.0+ | Low |
| 23 | Add iPad support (`TARGETED_DEVICE_FAMILY` = "1,2") | Medium |

---

## 14. Estimated Effort

| Category | Estimated Effort |
|----------|-----------------|
| Push Notification (end-to-end) | 3-5 days |
| Offline functionality | 5-8 days |
| Native plugins integration | 2-3 days |
| Entitlements & signing | 1 day |
| Info.plist fixes | 0.5 day |
| Deep linking / Universal Links | 1-2 days |
| Testing & QA | 2-3 days |
| **Total** | **~15-22 days** |

---

## 15. Conclusion

This app is in **early prototype stage** for iOS. The Capacitor shell is properly set up structurally, but it lacks every native integration that Apple expects from an App Store app. The remote URL configuration (`server.url`) makes this functionally identical to a Safari bookmark, which Apple will reject under Guideline 4.2.

**The app CANNOT be submitted to the App Store in its current state.** At minimum, push notifications, offline functionality, and several native UI enhancements must be implemented before submission has a reasonable chance of approval.
