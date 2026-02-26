# GolfHelm iOS App — Pre-App Store Test Results

**Date**: 2026-02-25
**App**: Helm Sports Labs (GolfHelm)
**Bundle ID**: `com.helmsportslabs.golfhelm`
**Architecture**: Capacitor WebView shell → Next.js web app at `helmsportslabs.com`
**Xcode Scheme**: `App` (in `ios/App/App.xcodeproj`)

---

## Test Matrix

### Build & Static Analysis

| Test | Result | Details |
|------|--------|---------|
| TypeScript (`npm run typecheck`) | **PASS** | Had 1 error in `src/lib/utils/capacitor.ts` — fixed by casting `window` through `unknown` |
| ESLint (`npm run lint`) | **PASS** | 0 errors, 33 warnings (all in baseball code, not golf) |
| Next.js production build (`npm run build`) | **PASS** | All routes compile — static + dynamic |
| iOS Xcode build (`xcodebuild -scheme App`) | **FAIL** | Signing not configured — needs development team in Xcode Signing & Capabilities |

### Live App Testing (production URL: helmsportslabs.com)

Tested at iPhone 14 Pro viewport (390x844) and desktop (1200x800).

| Page | Route | Mobile | Desktop | Console Errors |
|------|-------|--------|---------|----------------|
| Login | `/golf/login` | PASS | PASS | icon-192.png 404 |
| Signup | `/golf/signup` | PASS | PASS | icon-192.png 404 |
| Forgot Password | `/golf/forgot-password` | PASS | PASS | icon-192.png 404 |
| Player Dashboard | `/golf/dashboard` | PASS | PASS | icon-192.png 404, Google Fonts 404, UnrecognizedActionError |
| Admin Dashboard | `/golf/admin` | PASS | PASS | icon-192.png 404, CSP media-src block |
| Privacy Policy | `/privacy` | PASS | PASS | icon-192.png 404 |
| Terms of Service | `/terms` | PASS | PASS | icon-192.png 404 |

### iOS Project Structure

| Check | Result | Location |
|-------|--------|----------|
| App icon (1024x1024) | PASS | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |
| Launch screen | PASS | `ios/App/App/Assets.xcassets/Splash.imageset/` |
| Bundle ID | PASS | `com.helmsportslabs.golfhelm` in `ios/App/App.xcodeproj/project.pbxproj` |
| Version number | **NEEDS FIX** | `MARKETING_VERSION = 1.0` — must be `1.0.0` (three-part semver) in `project.pbxproj` |
| Build number | PASS | `CURRENT_PROJECT_VERSION = 1` |
| Capacitor config | PASS | `capacitor.config.ts` — points to `helmsportslabs.com/golf/login` |
| Service worker | PASS | `public/sw.js` — has offline fallback, caching, background sync |
| Manifest | PASS | `public/manifest.json` — correct name, icons, theme color |
| Privacy descriptions | **MISSING** | No `NS*UsageDescription` keys in `ios/App/App/Info.plist` |

---

## Issues Found

### CRITICAL

#### 1. Manifest icon returns 404 in production

- **What**: `/icons/icon-192.png` returns HTTP 404 on every page load in production
- **Impact**: Console error on every page, broken PWA install, Apple reviewers may flag
- **Where**: Files exist locally at `public/icons/icon-192.png` and `public/icons/icon-512.png`
- **Root cause**: Likely not deployed to Vercel — check if `public/icons/` is gitignored or excluded
- **Fix**: Ensure `public/icons/` is committed and deployed. Verify with `curl -I https://helmsportslabs.com/icons/icon-192.png`

#### 2. iOS signing not configured

- **What**: `xcodebuild` fails with "Signing for 'App' requires a development team"
- **Impact**: Cannot archive or submit to App Store
- **Where**: `ios/App/App.xcodeproj` → Signing & Capabilities tab
- **Fix**: Open in Xcode, select your Apple Developer team, let Xcode auto-provision

### MEDIUM

#### 3. CSP blocks notification/audio sounds

- **What**: `data:audio/wav;base64,...` blocked by Content Security Policy
- **Console error**: `Loading media from 'data:audio/wav;base64,...' violates CSP directive "default-src 'self'". 'media-src' was not explicitly set.`
- **Impact**: Notification sounds silently fail
- **Where**: CSP headers — check `next.config.js` or `middleware.ts` for Content-Security-Policy
- **Fix**: Add `media-src 'self' data:;` to CSP header

#### 4. Google Fonts intermittent 404

- **What**: `fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;700&display=swap` fails to load
- **Impact**: Falls back to system font — inconsistent typography
- **Where**: Font import — check `src/app/layout.tsx` or global CSS for the Google Fonts import
- **Fix**: Consider using `next/font/google` for self-hosted fonts (more reliable, no external dependency)

### LOW

#### 5. Version number format

- **What**: `MARKETING_VERSION = 1.0` — App Store requires three-part semver `X.Y.Z`
- **Where**: `ios/App/App.xcodeproj/project.pbxproj` (appears twice — Debug and Release configs)
- **Fix**: Change to `1.0.0` in Xcode → Build Settings → Marketing Version

#### 6. No privacy usage descriptions in Info.plist

- **What**: `ios/App/App/Info.plist` has zero `NS*UsageDescription` keys
- **Impact**: If the web app triggers camera/photo/location/microphone permission, app will crash instead of showing permission dialog
- **Where**: `ios/App/App/Info.plist`
- **Fix**: Add any needed keys:
  - `NSCameraUsageDescription` — if users upload photos via camera
  - `NSPhotoLibraryUsageDescription` — if users pick from photo library
  - `NSLocationWhenInUseUsageDescription` — if location is used
  - Only add keys for permissions your app actually uses

---

## Fixed During Testing

| File | Issue | Fix Applied |
|------|-------|-------------|
| `src/lib/utils/capacitor.ts` | TS2352: `window as Record<string, unknown>` type cast error | Changed to `(window as unknown as Record<string, unknown>).Capacitor` |

---

## Key File Locations

### iOS Project
```
ios/App/App.xcodeproj/project.pbxproj    — Xcode project config (version, bundle ID, signing)
ios/App/App/Info.plist                    — iOS app metadata and privacy descriptions
ios/App/App/AppDelegate.swift             — App entry point (standard Capacitor boilerplate)
ios/App/App/Assets.xcassets/              — App icon + splash screen assets
ios/App/CapApp-SPM/                       — Capacitor Swift Package Manager integration
```

### Capacitor Config
```
capacitor.config.ts                       — Capacitor settings (app ID, server URL, iOS options)
```

### Web App (what runs inside the WebView)
```
public/manifest.json                      — PWA manifest (app name, icons, theme)
public/sw.js                              — Service worker (offline, caching, background sync)
public/icons/icon-192.png                 — PWA icon 192x192 (404 in production!)
public/icons/icon-512.png                 — PWA icon 512x512
src/lib/utils/capacitor.ts                — Native app detection utility
```

### Auth Pages (first thing users see in the iOS app)
```
src/app/golf/(auth)/login/page.tsx        — Login page
src/app/golf/(auth)/signup/page.tsx       — Signup page
src/app/golf/(auth)/forgot-password/page.tsx — Forgot password
src/app/golf/(auth)/reset-password/page.tsx  — Reset password
```

### CSP / Headers
```
next.config.js or next.config.ts          — Check for Content-Security-Policy headers
src/middleware.ts                          — May contain CSP headers
```

---

## Pre-Submission Checklist

- [ ] Fix icon 404 — deploy `public/icons/` to production
- [ ] Configure Xcode signing with Apple Developer team
- [ ] Change `MARKETING_VERSION` from `1.0` to `1.0.0`
- [ ] Add `media-src 'self' data:` to CSP if notification sounds are needed
- [ ] Add `NS*UsageDescription` keys to Info.plist if any device permissions are used
- [ ] Provide Apple a **test account** in App Store Connect → App Review Information
- [ ] Archive in Xcode → Distribute App → App Store Connect → Upload
- [ ] Test via TestFlight with internal testers before submitting for review
- [ ] Test on oldest supported iOS version (check `MinimumOSVersion` in build settings)
- [ ] Test with airplane mode to verify offline fallback works in native shell
