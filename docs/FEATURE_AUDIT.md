<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Committed 2026-03-05 ("comprehensive app stability overhaul"), iOS App Store submission scope. Not confirmed against current App Store Connect status in the 2026-07-10 sweep — re-verify before relying on this; treat as historical if the submission has since moved forward.
KEPT FOR HISTORY -- do not delete this file.
-->

# Feature & Functionality Audit for App Store Readiness

**Date:** 2026-03-05
**Auditor:** Features & Functionality Auditor
**App:** Helm Sports Labs (GolfHelm) - iOS via Capacitor
**Bundle ID:** `com.helmsportslabs.golfhelm`

---

## Executive Summary

The GolfHelm app is a Next.js 16 web application wrapped in a Capacitor iOS shell that loads from a live URL (`https://www.helmsportslabs.com/golf/login`). The core features (auth, onboarding, offline sync, shot tracking) are well-implemented with premium UI quality. However, there are **5 critical issues** and **8 important issues** that should be addressed for App Store readiness.

### Overall Readiness: **7/10 - Needs Targeted Fixes**

---

## A. Auth Flows

### Login (`/golf/login`)
**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| Email/password auth | PASS | Uses `loginAction` server action via Supabase |
| Error handling | PASS | User-friendly error messages with `getErrorMessage()` mapping |
| Already-logged-in detection | PASS | Detects existing session, offers "Continue to Dashboard" or "Sign out" |
| Return-to URL handling | PASS | Validates returnTo to prevent open redirects (only allows `/golf/` or `/baseball/` prefixes) |
| Loading states | PASS | Animated bouncing dots with sr-only text for screen readers |
| Accessibility | PASS | Skip-to-content link, proper labels, `role="alert"` on errors |
| Native-aware UI | PASS | Hides "Back to HelmLabs" link when `isNativeApp()` is true |
| Privacy/Terms links | PASS | Links to `/privacy` and `/terms` |
| Session cookie propagation | PASS | `router.refresh()` + 100ms delay before navigation |

**Minor issue:** Login page uses `text-base lg:text-sm` which makes text 16px on mobile (good for iOS to prevent zoom) but shrinks on desktop.

### Signup (`/golf/signup`)
**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| Role selection (Player/Coach) | PASS | Toggle with visual feedback, `aria-pressed` |
| Name + email + password fields | PASS | Proper `autoComplete` attributes |
| Password strength indicator | PASS | Visual strength meter component |
| Duplicate account handling | PASS | Shows "Go to sign in" link when account exists |
| Google SSO button | INFO | Present but **disabled** - placeholder only |
| Terms/Privacy consent | PASS | "By creating an account..." text with links |
| Post-signup flow | PASS | Routes to onboarding (`/golf/coach` or `/golf/player`) |

**Issue:** Google SSO button is disabled/placeholder. Apple may question why it's shown if not functional. **Recommendation:** Either implement it or remove the button before submission.

### Forgot Password (`/golf/forgot-password`)
**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| Email input | PASS | Uses Supabase `resetPasswordForEmail()` |
| Redirect URL | PASS | Correctly uses `window.location.origin + '/golf/reset-password'` |
| Success state | PASS | Shows email icon, "Check your email" message, expiry info |
| Error handling | PASS | `role="alert"` on error messages |

### Reset Password (`/golf/reset-password`)
**Status: PASS with ISSUE**

| Aspect | Status | Notes |
|--------|--------|-------|
| Password validation | PASS | Min 8 chars, match confirmation, strength indicator |
| Password match UX | PASS | Real-time match/mismatch indicators |
| Update flow | PASS | Uses `supabase.auth.updateUser({ password })` |

**CRITICAL ISSUE:** On line 50, after successful password reset, the redirect uses:
```typescript
router.push('/golf/login?message=Password updated successfully');
```
But the login page uses **predefined message codes** (line 17-21 of login/page.tsx) and will NOT display raw message strings. The key `"Password updated successfully"` doesn't match any predefined code. Should be `?message=password_reset` to display "Password reset successfully. Please sign in with your new password."

### Coach Onboarding (3-step: Program > Profile > Complete)
**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| Step 1: Program setup | PASS | Org name (required), division, conference, city, state, team name |
| Step 2: Profile | PASS | Avatar upload, full name (required), title |
| Step 3: Completion | PASS | Team join code display with copy-to-clipboard |
| Auth retry logic | PASS | Retries `getUser()` up to 5 times with 500ms delays |
| Already-onboarded redirect | PASS | Redirects to dashboard if `onboarding_completed` |
| Step animations | PASS | Smooth slide transitions with framer-motion |
| Step indicator | PASS | Accessible with `aria-current="step"` and sr-only text |

### Player Onboarding (3-step: About You > Profile > Complete)
**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| Step 1: About You | PASS | First/last name (required), graduation year, handicap, hometown |
| Step 2: Profile | PASS | Avatar upload, GPA (optional) |
| Step 3: Completion | PASS | Personalized "Welcome, {firstName}!" message |
| Pre-fill from existing data | PASS | Loads existing golf_players record |
| `ensurePlayerRecord()` call | PASS | Creates golf_players record early |

**Note:** CLAUDE.md says player onboarding is 4-step, but implementation is 3-step (`about` > `profile` > `complete`). This is fine for functionality but documentation is inconsistent.

### Join Team Flow (`/golf/join/[code]`)
**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| Unauthenticated users | PASS | Redirects to signup with `returnTo` |
| Un-onboarded players | PASS | Redirects to player onboarding with `joinCode` |
| Invalid codes | PASS | Shows error UI with "Go to Dashboard" link |
| Code normalization | PASS | Uppercases join code for case-insensitive matching |
| Server component | PASS | Data fetched server-side, client component for interaction |

---

## B. Offline Handling

**Status: PASS - Comprehensive Implementation**

### Architecture
The offline system has three layers:

1. **Service Worker** (`public/sw.js`) - Caches static assets, API responses, and pages
2. **IndexedDB storage** (`src/lib/offline/indexed-db.ts`) - Stores shots and rounds locally
3. **Sync engine** (`src/lib/offline/sync-engine.ts`) - Background sync with retry logic

### Hooks
| Hook | Purpose | Status |
|------|---------|--------|
| `use-offline-sync.ts` | Shot/round queuing, auto-sync, IndexedDB management | PASS |
| `use-connection-status.ts` | Real-time connectivity monitoring, quality detection | PASS |
| `use-service-worker.ts` | SW registration, update detection, background sync | PASS |

### Store
| Store | Purpose | Status |
|-------|---------|--------|
| `offline-sync-store.ts` (Zustand) | Centralized sync state, pending counts, history, UI state | PASS |

### Key Features
- **Auto-sync on reconnect:** 2-second delay after coming back online
- **Periodic sync:** Every 30 seconds for pending items
- **Connection quality detection:** Uses Network Information API (rtt, effectiveType)
- **Offline page:** Custom branded offline fallback page in service worker
- **Sync history:** Last 50 sync attempts persisted
- **Max retry attempts:** Configurable, prevents infinite retry loops

### Service Worker Cache Strategy
- Static assets: Cache-first (versioned `golfhelm-v1`)
- API responses: Network-first with cache fallback
- Pages: Stale-while-revalidate
- Offline fallback: Custom branded HTML page

**IMPORTANT ISSUE:** The service worker caches pages like `/golf/dashboard` in `STATIC_ASSETS`, but since the app loads from a live URL via Capacitor, these cached pages may serve stale HTML. The SW's `self.skipWaiting()` on install means it takes control immediately, which could cache the initial WebView load and serve stale content on subsequent visits.

---

## C. Splash Screen / Launch Screen

**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| LaunchScreen.storyboard | PRESENT | Uses "Splash" image asset with `scaleAspectFill` |
| Splash image assets | PRESENT | 3 scales in `Splash.imageset/` (2732x2732 at 1x, 2x, 3x) |
| Background color | PASS | Uses `systemBackgroundColor` (white) |
| Contents.json | PASS | Properly configured for universal idiom at all 3 scales |

**Note:** No `@capacitor/splash-screen` plugin is installed. The splash screen relies entirely on the iOS native LaunchScreen.storyboard. This is actually fine and is the simpler/more reliable approach for Capacitor apps loading remote URLs.

**IMPORTANT ISSUE:** Since the app loads from a live URL, there's a gap between the native splash screen dismissing and the WebView finishing loading the remote page. The user may see a blank white screen during this time. There's no intermediate loading state shown by Capacitor.

---

## D. App Icon

**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| AppIcon.appiconset | PRESENT | Single 1024x1024 asset (`AppIcon-512@2x.png`) |
| Contents.json | PASS | Uses modern universal idiom (single 1024x1024 icon) |
| Platform | PASS | Correctly specifies `"platform": "ios"` |

Modern Xcode (13+) accepts a single 1024x1024 icon and auto-generates all required sizes. This is the recommended approach.

---

## E. Deep Linking / Universal Links

**Status: NOT IMPLEMENTED - CRITICAL GAP**

| Aspect | Status | Notes |
|--------|--------|-------|
| Universal Links (AASA) | MISSING | No `apple-app-site-association` file found |
| Associated Domains entitlement | MISSING | No `com.apple.developer.associated-domains` in project |
| Custom URL scheme | NOT FOUND | No custom URL scheme configured |
| AppDelegate Universal Links | PARTIAL | Handler exists in `AppDelegate.swift` (standard Capacitor boilerplate) but no domain association |

**CRITICAL:** Without Universal Links, the app cannot:
- Be opened from external links (email invitations, shared team join codes)
- Handle password reset links from email (currently redirect to web browser, not app)
- Support handoff between web and app

The `forgot-password` flow sends a reset link pointing to `${origin}/golf/reset-password`. In the native app, this would open in Safari, not in the app. This is a broken flow for native users.

**Recommendation:** Configure Universal Links for `helmsportslabs.com` to handle:
- `/golf/join/*` (team invitations)
- `/golf/reset-password` (password reset)
- `/golf/dashboard/*` (deep links to dashboard sections)

---

## F. Session Management

**Status: PASS with NOTES**

### Architecture
| Component | Implementation | Notes |
|-----------|---------------|-------|
| Auth store | Zustand with `persist` middleware | Stores user, coach, player, coachMode in localStorage |
| Session refresh | Supabase SSR middleware | Every request calls `supabase.auth.getUser()` which refreshes tokens |
| Cookie management | `@supabase/ssr` | Automatic cookie management in middleware |
| Session expiry | Handled by Supabase | Middleware redirects to login for expired sessions on protected routes |
| Coach mode sync | Cookie + Zustand | `coach_mode` cookie synced for middleware access |
| HTTP timeouts | 10s abort signal | Both client and server Supabase clients have 10s fetch timeout |

### Session Flow
1. **Middleware** (`middleware.ts`) runs on every request matching the route pattern
2. `updateSession()` creates a Supabase server client that reads/writes cookies
3. `supabase.auth.getUser()` validates the session and refreshes tokens if needed
4. If session is expired and route is protected, redirects to sport-specific login with `returnTo`

### Token Refresh
Supabase's `@supabase/ssr` handles token refresh automatically. The middleware is called on every navigation, which triggers a session check and refresh. This is the recommended pattern.

**Note:** The auth store persists user data to localStorage, which means stale user data could remain after session expiry. The `clear()` method exists but isn't called automatically on session expiry - it relies on the login page flow.

---

## G. External Link Handling

**Status: PASS**

| Aspect | Status | Notes |
|--------|--------|-------|
| `@capacitor/browser` | INSTALLED | Used in `src/lib/utils/capacitor.ts` |
| `openExternalUrl()` utility | PASS | Opens in SFSafariViewController on native, new tab on web |
| Fallback behavior | PASS | Falls back to `window.open` if Browser plugin fails |
| `isNativeApp()` detection | PASS | Standard Capacitor detection via `window.Capacitor` |

**Note:** OAuth redirects (if Google SSO were enabled) would go through SFSafariViewController. Since the app loads from a live URL (not local), OAuth callbacks would need to redirect back to the live URL, which the WebView would handle. However, since Google SSO is currently disabled, this is not an active concern.

---

## H. WebView-Specific Issues

**Status: IMPORTANT CONCERNS**

### Architecture
The app is configured as a **remote URL Capacitor app** (not a local web app):
```typescript
server: {
  url: 'https://www.helmsportslabs.com/golf/login',
  cleartext: false,
  allowNavigation: ['*.helmsportslabs.com', 'helmsportslabs.com'],
}
```

### Concerns

| Issue | Severity | Description |
|-------|----------|-------------|
| **Initial load time** | HIGH | User must wait for the live URL to load over the network. On slow connections, this could take several seconds after the splash screen dismisses. |
| **Blank screen gap** | HIGH | Between splash screen dismissal and WebView render, user sees nothing. No loading indicator. |
| **No offline launch** | MEDIUM | If the user opens the app with no internet, the WebView will show an error page. The service worker may help if assets are cached, but on first launch there's no cache. |
| **`webDir: 'public'`** | INFO | This is set to `public/` but since the app uses a remote URL, the web dir is only used for fallback assets. |
| **WebView debugging disabled** | PASS | `webContentsDebuggingEnabled: false` is correctly set for production. |

**CRITICAL RECOMMENDATION:** Add a native splash/loading view that persists until the WebView reports it has loaded. This prevents the blank white screen experience. Options:
1. Use `@capacitor/splash-screen` plugin to keep the splash visible until the page loads
2. Add a custom native loading view in `AppDelegate.swift`

---

## I. App Version Management

**Status: PASS - BASIC**

| Aspect | Value | Notes |
|--------|-------|-------|
| `MARKETING_VERSION` | `1.0.0` | Set in both Debug and Release build settings |
| `CURRENT_PROJECT_VERSION` | `1` | Build number, set in both configurations |
| Bundle identifier | `com.helmsportslabs.golfhelm` | From `capacitor.config.ts` |
| Display name | `Helm Sports Labs` | From `Info.plist` CFBundleDisplayName |

**IMPORTANT ISSUE:** The `CFBundleDisplayName` is "Helm Sports Labs" but the `appName` in Capacitor config is also "Helm Sports Labs". For the App Store, the name should match the App Store listing. Consider whether this should be "GolfHelm" instead, since that's what the app is (the marketing name throughout the UI).

**Note:** Build number management appears manual. For CI/CD, consider automating build number increments (e.g., `agvtool bump -all`).

---

## J. Crash Reporting (Sentry)

**Status: PASS - Well Configured**

### Integration Points
| File | Purpose | Status |
|------|---------|--------|
| `instrumentation.ts` | Server-side + Edge Sentry init | PASS |
| `instrumentation-client.ts` | Client-side Sentry init | PASS |
| `sentry.server.config.ts` | Server Sentry config (legacy/fallback) | PASS |
| `sentry.edge.config.ts` | Edge Sentry config (legacy/fallback) | PASS |

### Configuration Details

**Server-side:**
- Traces: 100% in prod, 10% in dev
- Profiling: 30% session sample rate in prod, 0% in dev
- Profile lifecycle: `trace` (only during active traces)
- Ignores: `NEXT_NOT_FOUND`, `NEXT_REDIRECT`

**Client-side:**
- Traces: 100% in prod, 10% in dev
- Session Replay: 100% of error sessions, 10% of all sessions
- Replay config: `maskAllText: false`, `blockAllMedia: false` (full visibility)
- Browser tracing integration enabled
- Ignores: browser extension errors, network errors, AbortError

**Note:** `maskAllText: false` in replay means PII could be captured in session replays. This should be reviewed for privacy compliance, especially for COPPA (college players could be under 18).

---

## Critical Issues Summary

### CRITICAL (Must fix before submission)

1. **Reset Password Redirect Bug** - Uses raw message string instead of predefined code key. Password reset flow appears broken (no success message shown on login). Fix: Change to `?message=password_reset`.

2. **No Loading State After Splash Screen** - WebView loads remote URL with no intermediate loading indicator. Users see blank white screen on slow connections. Fix: Implement `@capacitor/splash-screen` to keep splash until WebView reports ready.

3. **No Universal Links** - Cannot open app from external links (team invitations, password reset emails). Fix: Configure AASA file, Associated Domains entitlement, and app link handling.

4. **No First-Launch Offline Handling** - If user opens app for the first time without internet, they see a WebView error. Fix: Add a fallback HTML page in `webDir` that shows a branded offline message.

5. **Google SSO Button Shown but Disabled** - Apple reviewers may flag a non-functional button. Fix: Remove or implement.

### IMPORTANT (Should fix)

1. **App Display Name Mismatch** - "Helm Sports Labs" vs "GolfHelm" branding throughout the app
2. **Service Worker May Serve Stale Content** - `skipWaiting()` on install + caching remote pages could cause version mismatches
3. **Auth Store Stale Data** - localStorage-persisted auth data not cleared on session expiry
4. **Session Replay PII** - `maskAllText: false` may capture sensitive student data in Sentry replays
5. **Missing `NSLocationWhenInUseUsageDescription`** - If any golf course features use location (not found, but worth confirming)
6. **No Push Notification Permission String** - `Info.plist` has camera/photo strings but no push notification description (if push is used)
7. **Build Number Management** - Version 1.0.0 build 1 is manual; no CI/CD automation for increments
8. **`ITSAppUsesNonExemptEncryption` set to false** - Verify this is correct; HTTPS connections may technically count as encryption, but standard HTTPS is exempt

### INFO (Nice to have)

1. Player onboarding documented as 4-step but implemented as 3-step (documentation drift)
2. `webDir` is set to `public/` but unused since app loads from remote URL
3. Keyboard plugin configured (`resizeOnFullScreen: true`) - good for form handling
4. `allowNavigation` correctly limits WebView to `*.helmsportslabs.com`
5. All auth pages have safe-area-aware padding (`env(safe-area-inset-top)`, `min-h-dvh`)

---

## Feature Completeness Matrix

| Feature | Implemented | Stable | App Store Ready |
|---------|:-----------:|:------:|:---------------:|
| Login | YES | YES | YES |
| Signup | YES | YES | PARTIAL (Google SSO) |
| Forgot Password | YES | YES | YES |
| Reset Password | YES | PARTIAL | NO (redirect bug) |
| Coach Onboarding | YES | YES | YES |
| Player Onboarding | YES | YES | YES |
| Join Team | YES | YES | YES |
| Offline Sync | YES | YES | PARTIAL (first launch) |
| Service Worker | YES | YES | PARTIAL (stale content risk) |
| Connection Detection | YES | YES | YES |
| Splash Screen | YES | YES | PARTIAL (blank gap) |
| App Icon | YES | YES | YES |
| Deep Linking | NO | N/A | NO |
| Session Management | YES | YES | YES |
| External Links | YES | YES | YES |
| Crash Reporting | YES | YES | YES |
| Version Management | YES | YES | PARTIAL (manual) |
