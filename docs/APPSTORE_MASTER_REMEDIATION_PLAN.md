<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Committed 2026-03-05 ("comprehensive app stability overhaul"), iOS App Store submission scope. Not confirmed against current App Store Connect status in the 2026-07-10 sweep — re-verify before relying on this; treat as historical if the submission has since moved forward.
KEPT FOR HISTORY -- do not delete this file.
-->

# App Store Master Remediation Plan

**App:** Helm Sports Labs (com.helmsportslabs.golfhelm)
**Date:** 2026-03-05
**Source:** 7 comprehensive audit reports (Push Notifications, iOS Native, Security, Features, Privacy/COPPA, UI/UX, App Store Requirements)

---

## Overall Verdict: NOT READY — Estimated 15-22 days to submittable state

### Risk Summary
| Category | Grade | Blocker? |
|----------|-------|----------|
| iOS Native Integration | F | YES — ~95% Guideline 4.2 rejection risk |
| Push Notifications | F | YES — zero iOS native push infrastructure |
| COPPA/Privacy | F | YES — minors sign up with no age gate or parental consent |
| Features & Functionality | B- | 5 critical bugs to fix |
| UI/UX Quality | B+ | Not a blocker — strong mobile UI |
| Security | A | PASS — no critical vulnerabilities |

---

## PHASE 1: SHOWSTOPPERS (Must fix — will be rejected without these)

### 1.1 Guideline 4.2 — Escape the "Website Wrapper" Rejection
**Risk: ~95% rejection in current state. App loads 100% from live URL with 2 trivial native features.**

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 1 | Install `@capacitor/push-notifications` + configure + sync iOS | 1 day | P0 |
| 2 | Create `.entitlements` file with `aps-environment` + associated domains | 0.5 day | P0 |
| 3 | Add `UIBackgroundModes` (remote-notification) to Info.plist | 0.5 hr | P0 |
| 4 | Install `@capacitor/app` (lifecycle management, back button, deep links) | 0.5 day | P0 |
| 5 | Install `@capacitor/status-bar` + configure for light theme | 0.5 day | P0 |
| 6 | Install `@capacitor/haptics` + replace broken `navigator.vibrate()` calls | 0.5 day | P0 |
| 7 | Install `@capacitor/splash-screen` + keep splash until WebView loads | 0.5 day | P0 |
| 8 | Install `@capacitor/share` for native share sheet | 0.5 day | P1 |
| 9 | Install `@capacitor/local-notifications` for round reminders | 1 day | P1 |
| 10 | Install `@capacitor/geolocation` for golf course auto-detection | 1 day | P1 |
| 11 | Install `@capacitor/network` for proper offline/online detection | 0.5 day | P1 |
| 12 | Add first-launch offline fallback HTML in app bundle | 0.5 day | P0 |
| 13 | Register all new plugins in SPM Package.swift | 0.5 day | P0 |
| 14 | Run `npx cap sync ios` after all plugin installations | 0.5 hr | P0 |

### 1.2 Push Notifications — Full APNs Pipeline (End-to-End)
**Current state: ZERO iOS push notification infrastructure.**

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 15 | Apple Developer Portal: Enable push for App ID, generate APNs key (.p8) | 0.5 day | P0 |
| 16 | Configure Xcode: Add Push Notifications capability to project | 0.5 hr | P0 |
| 17 | Add AppDelegate push delegate methods (didRegisterForRemoteNotifications) | 0.5 day | P0 |
| 18 | Create `device_tokens` DB migration (user_id, token, platform, device_name) | 0.5 day | P0 |
| 19 | Implement frontend push permission request flow (explain UI → request → store token) | 1 day | P0 |
| 20 | Implement APNs sending via Supabase Edge Function (HTTP/2 API with .p8 key) | 2 days | P0 |
| 21 | Wire push to Messages — send push to all recipients on new message | 1 day | P0 |
| 22 | Wire push to Announcements — push to team on new/urgent announcement | 0.5 day | P0 |
| 23 | Wire push to Tasks — push on assignment and reminders | 0.5 day | P1 |
| 24 | Wire push to Calendar Events — push on creation, update, RSVP reminder | 1 day | P1 |
| 25 | Implement iOS app icon badge count sync with notification counts | 0.5 day | P1 |
| 26 | Handle notification tap → deep link to correct screen | 1 day | P1 |
| 27 | Respect notification preferences (push_messages, push_events, push_task_reminders) | 0.5 day | P1 |
| 28 | Fix default prefs: change push_messages and push_events defaults to `true` | 0.5 hr | P1 |

### 1.3 COPPA Compliance — Minors Data Protection
**Current state: High school athletes (minors) sign up with zero age verification or parental consent.**

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 29 | Add age gate at signup — collect DOB or use graduation year to calculate age | 1 day | P0 |
| 30 | Block users under 13 OR implement verifiable parental consent (COPPA) | 2 days | P0 |
| 31 | Add parent/guardian consent flow for ages 13-17 (parent email + verification) | 2 days | P0 |
| 32 | Update Privacy Policy with "Children's Privacy" section | 0.5 day | P0 |
| 33 | Minimize data collection for minors — review what's truly necessary | 0.5 day | P1 |
| 34 | Configure Sentry PII scrubbing (beforeSend to strip emails/names for minors) | 0.5 day | P1 |
| 35 | Consider anonymizing Datadog user context for minors | 0.5 day | P1 |

### 1.4 Privacy Manifest & Labels
**Required since May 2024. 12% rejection rate for violations.**

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 36 | Create PrivacyInfo.xcprivacy manifest declaring all Required Reason APIs | 1 day | P0 |
| 37 | Complete Apple Privacy Labels in App Store Connect (10+ categories) | 1 day | P0 |
| 38 | Verify all Capacitor plugins include their own privacy manifests | 0.5 day | P0 |
| 39 | Add tracking consent mechanism (ATT prompt if using IDFA) | 1 day | P1 |

---

## PHASE 2: CRITICAL BUGS (Must fix — will cause rejection or major issues)

| # | Task | Source | Effort | Priority |
|---|------|--------|--------|----------|
| 40 | Fix reset password redirect bug — use `?message=password_reset` not raw string | Feature Audit | 0.5 hr | P0 |
| 41 | Remove or implement disabled Google SSO button (reviewers will flag it) | Feature Audit | 0.5 day | P0 |
| 42 | Implement Sign in with Apple (REQUIRED if any social login is offered) | App Store Req | 2 days | P0 |
| 43 | Configure Universal Links (AASA file + Associated Domains entitlement) | Feature Audit | 1 day | P0 |
| 44 | Fix `useHapticFeedback()` — replace Web Vibration API with @capacitor/haptics | UI/UX Audit | 0.5 day | P0 |
| 45 | Fix `useSafeAreaInsets()` hook — always returns 0 (use CSS custom property bridge) | UI/UX Audit | 0.5 day | P1 |
| 46 | Configure development team & provisioning profiles in Xcode | iOS Audit | 0.5 day | P0 |
| 47 | Update deployment target to iOS 16.0+ (enables single app icon format) | iOS Audit | 0.5 hr | P1 |
| 48 | Fix `UIRequiredDeviceCapabilities` — remove obsolete `armv7` | iOS Audit | 0.5 hr | P0 |
| 49 | Restrict `config.xml` access origin from `*` to helmsportslabs.com only | iOS Audit | 0.5 hr | P1 |
| 50 | Update Swift version from 5.0 to 5.9+ | iOS Audit | 0.5 hr | P1 |

---

## PHASE 3: HIGH PRIORITY (Should fix before submission)

| # | Task | Source | Effort | Priority |
|---|------|--------|--------|----------|
| 51 | Update Privacy Policy — list all third-party services by name | Privacy Audit | 0.5 day | P1 |
| 52 | Add specific data retention periods to Privacy Policy | Privacy Audit | 0.5 day | P1 |
| 53 | Add CCPA disclosure section to Privacy Policy | Privacy Audit | 0.5 day | P1 |
| 54 | Verify CASCADE deletes cover ALL user data on account deletion | Privacy Audit | 0.5 day | P1 |
| 55 | Add storage bucket cleanup on account deletion (avatars, attachments) | Privacy Audit | 0.5 day | P1 |
| 56 | Fix Sentry `maskAllText: false` — mask text in session replays for privacy | Feature Audit | 0.5 hr | P1 |
| 57 | Implement nonce-based CSP for production (currently has TODO) | Security Audit | 1 day | P1 |
| 58 | Verify `/api/admin/*` routes have admin role checking | Security Audit | 0.5 day | P1 |
| 59 | Add `inputmode="numeric"` to golf score/number inputs | UI/UX Audit | 0.5 day | P2 |
| 60 | Fix green (#16A34A) on white WCAG AA failure for small text | UI/UX Audit | 0.5 day | P2 |
| 61 | Reduce `backdrop-blur-xl` to `backdrop-blur-sm` on bottom nav for older devices | UI/UX Audit | 0.5 day | P2 |
| 62 | Add `@supports (backdrop-filter: blur(1px))` fallback | UI/UX Audit | 0.5 day | P2 |
| 63 | Create App Store Connect listing (name, description, category, keywords) | App Store Req | 1 day | P1 |
| 64 | Capture 3-10 App Store screenshots (6.9" iPhone format) | App Store Req | 1 day | P1 |
| 65 | Set up demo/reviewer account with sample data | App Store Req | 0.5 day | P1 |
| 66 | Write App Review Notes explaining native features and WebView architecture | App Store Req | 0.5 day | P1 |
| 67 | Add consent checkbox at signup (especially important for minors) | Privacy Audit | 0.5 day | P1 |
| 68 | Store consent timestamps in database | Privacy Audit | 0.5 day | P1 |
| 69 | Set appropriate age rating in App Store Connect | App Store Req | 0.5 hr | P1 |

---

## PHASE 4: MEDIUM PRIORITY (Fix soon after launch)

| # | Task | Source | Effort | Priority |
|---|------|--------|--------|----------|
| 70 | Implement dark mode (infrastructure exists, needs design + implementation) | UI/UX Audit | 3-5 days | P2 |
| 71 | Add iPad layout optimization | UI/UX Audit | 2 days | P2 |
| 72 | Add pull-to-refresh | UI/UX Audit | 1 day | P2 |
| 73 | Implement "Download My Data" feature for GDPR compliance | Privacy Audit | 2 days | P2 |
| 74 | Add cookie/tracking consent banner | Privacy Audit | 1 day | P2 |
| 75 | Implement notification grouping/threading for iOS | Push Audit | 1 day | P2 |
| 76 | Rich notifications (images, action buttons) | Push Audit | 2 days | P2 |
| 77 | Add biometric auth (Face ID / Touch ID) | UI/UX Audit | 2 days | P2 |
| 78 | Add `Secure` flag to coach_mode cookie | Security Audit | 0.5 hr | P2 |
| 79 | Add rate limiting to account deletion endpoint | Security Audit | 0.5 day | P2 |
| 80 | Set up CI/CD for automated build number increments | Feature Audit | 0.5 day | P2 |
| 81 | Silent push for background data refresh | Push Audit | 1 day | P3 |
| 82 | Push notification delivery/open rate analytics | Push Audit | 1 day | P3 |
| 83 | Screen orientation locking during rounds | iOS Audit | 0.5 day | P3 |
| 84 | Widget support (Today Extension) | iOS Audit | 3 days | P3 |
| 85 | Siri Shortcuts integration | iOS Audit | 2 days | P3 |

---

## Implementation Order (Recommended)

### Week 1: Foundation
1. Install all Capacitor plugins (#1-14)
2. Create entitlements file + Info.plist fixes (#2, 3, 48)
3. Apple Developer Portal setup (#15-16)
4. Configure Xcode signing (#46)
5. Fix critical bugs (#40, 41, 44, 50)

### Week 2: Push Notifications + Deep Linking
6. Push notification pipeline (#17-28)
7. Universal Links (#43)
8. Sign in with Apple (#42)

### Week 3: COPPA + Privacy
9. Age gate + parental consent (#29-35)
10. Privacy manifest + labels (#36-39)
11. Privacy policy updates (#51-53)

### Week 4: Polish + Submission
12. App Store Connect setup (#63-66, 69)
13. Remaining P1 fixes (#45, 47, 49, 54-58, 67-68)
14. Testing on clean device
15. Submit to App Store

---

## Audit Reports (Full Details)

| Report | File |
|--------|------|
| App Store Requirements Checklist | `docs/APPSTORE_REQUIREMENTS_CHECKLIST.md` |
| Push Notification Audit | `docs/PUSH_NOTIFICATION_AUDIT.md` |
| UI/UX Audit | `docs/UIUX_AUDIT.md` |
| Security Audit | `docs/SECURITY_AUDIT.md` |
| Privacy & COPPA Audit | `docs/PRIVACY_AUDIT.md` |
| Feature & Functionality Audit | `docs/FEATURE_AUDIT.md` |
| iOS Native Integration Audit | `docs/IOS_NATIVE_AUDIT.md` |

---

## Key Numbers

- **85 total remediation tasks** identified
- **P0 tasks:** 28 (must fix before submission)
- **P1 tasks:** 22 (should fix before submission)
- **P2 tasks:** 20 (fix soon after launch)
- **P3 tasks:** 5 (nice to have)
- **Estimated total effort:** 15-22 working days for P0+P1
- **7 audit reports** totaling ~2,500 lines of detailed findings
