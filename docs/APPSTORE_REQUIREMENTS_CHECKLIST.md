# Apple App Store Requirements Checklist

**App:** Helm Sports Labs (com.helmsportslabs.golfhelm)
**Type:** Next.js 16 + Capacitor 8 hybrid iOS app (WebView shell loading helmsportslabs.com)
**Target:** College sports SaaS (coaches, student athletes)
**Date:** March 2026
**Guidelines Version:** Apple App Store Review Guidelines (revised November 13, 2025)

---

## Risk Assessment Legend

- **CRITICAL** - Will cause immediate rejection if not addressed
- **HIGH** - Very likely to cause rejection
- **MEDIUM** - May cause rejection or delay
- **LOW** - Best practice / recommended

---

## 1. GUIDELINE 4.2 - MINIMUM FUNCTIONALITY (CRITICAL)

> This is the #1 risk for Capacitor/WebView hybrid apps. Apple requires apps to be "sufficiently different from a mobile web browsing experience."

### Requirements

- [ ] **CRITICAL: App provides native functionality beyond a website wrapper**
  - Must demonstrate clear value over simply visiting helmsportslabs.com in Safari
  - Reviewers will compare app experience to mobile web experience

- [ ] **CRITICAL: Native navigation layer present**
  - Persistent native bottom tab bar or navigation structure
  - Native header/toolbar that remains stable while web content scrolls
  - Smooth screen-based transitions (not page-reload effects)

- [ ] **CRITICAL: Push notifications fully implemented**
  - Primary differentiator from mobile web - must be functional
  - Registration, delivery, and deep-link handling all working

- [ ] **HIGH: Custom offline handling**
  - Custom branded "offline" screen (NOT generic browser error)
  - Retry functionality
  - Graceful degradation of features when offline

- [ ] **HIGH: Native splash screen**
  - Custom branded splash screen during app load
  - Native loading indicators (not browser progress bars)

- [ ] **HIGH: Device capability integration**
  - At least 2-3 native device features (camera, haptics, biometrics, sharing, etc.)
  - Features a website cannot replicate

- [ ] **MEDIUM: External links open in in-app browser**
  - Links should not kick users out to Safari
  - Maintain user context within app

- [ ] **MEDIUM: No browser-like UI elements**
  - No visible URL bars, loading bars resembling Safari
  - No persistent login issues or web-style navigation

### Evidence to Prepare for Reviewer
- Document all native features in App Review Notes
- Explain how the app differs from the website
- Highlight push notifications, offline mode, native UI elements

---

## 2. PERFORMANCE (Guidelines 2.1 - 2.5)

### 2.1 - App Completeness

- [ ] **CRITICAL: App is fully functional** - no placeholder content, broken flows, or "coming soon" features
- [ ] **CRITICAL: All URLs are functional** - no dead links or 404 pages
- [ ] **CRITICAL: Demo account credentials provided** in App Review Notes
  - Reviewer must be able to test all features including gated content
  - Provide a test coach account with sample data
- [ ] **HIGH: No crashes or major bugs** - test on clean device with no cached data
- [ ] **HIGH: App tested on slow/flaky network conditions**

### 2.3 - Accurate Metadata

- [ ] **CRITICAL: Screenshots show actual app UI** (not mockups/concepts)
- [ ] **CRITICAL: Screenshots match the submitted build exactly**
- [ ] **HIGH: App description accurately reflects features**
- [ ] **HIGH: No misleading claims about functionality**
- [ ] **MEDIUM: Keywords are relevant and accurate** (max 100 characters)
- [ ] **MEDIUM: App name is max 30 characters**
- [ ] **MEDIUM: Age rating questionnaire answered honestly**
- [ ] **MEDIUM: "What's New" text clearly describes changes**

### 2.4 - Hardware Compatibility

- [ ] **MEDIUM: iPhone app works on iPad** (or provide clear justification)
- [ ] **LOW: Efficient power usage** - no excessive battery drain or heat generation

### 2.5 - Software Requirements

- [ ] **CRITICAL: Uses only public APIs** - no private API usage
- [ ] **CRITICAL: WebKit framework used for WebView** (Guideline 2.5.6)
  - Capacitor uses WKWebView by default - verify this is configured
- [ ] **HIGH: Built with current Xcode and SDK** (Xcode 15+ required)
- [ ] **HIGH: Fully functional on IPv6-only networks** (Guideline 2.5.5)
- [ ] **MEDIUM: No deprecated APIs** (especially UIWebView - must use WKWebView)
- [ ] **MEDIUM: App runs in sandbox** - no reads/writes outside container

---

## 3. PRIVACY & DATA PROTECTION (Guidelines 5.1)

### 5.1.1 - Privacy Policy

- [ ] **CRITICAL: Privacy policy URL in App Store Connect metadata**
- [ ] **CRITICAL: Privacy policy accessible within the app** (Settings/About)
- [ ] **CRITICAL: Privacy policy clearly states:**
  - What data is collected
  - How data is used
  - Third-party data sharing
  - Data retention periods
  - How to request data deletion
  - How to withdraw consent

### 5.1.1(ii) - User Consent

- [ ] **CRITICAL: Explicit user consent before collecting data**
- [ ] **HIGH: Clear purpose strings for all permission requests** (Info.plist usage descriptions)
- [ ] **HIGH: Paid features NOT dependent on broad data access**
- [ ] **HIGH: Easy mechanism to withdraw consent**

### 5.1.1(v) - Account Requirements

- [ ] **CRITICAL: In-app account deletion option** (not email-only support)
  - Must initiate deletion from within the app
  - Deletion should happen within days, not months
- [ ] **HIGH: No forced login for features that don't require an account**
- [ ] **MEDIUM: Alternative to social login if social login is not core functionality**

### 5.1.2 - Data Use & Sharing

- [ ] **CRITICAL: App Tracking Transparency (ATT) implemented** if tracking users
  - Must use ATT framework for any cross-app/cross-site tracking
  - NSUserTrackingUsageDescription in Info.plist
- [ ] **HIGH: No sharing personal data without explicit permission**
- [ ] **HIGH: Third-party SDKs disclosed in privacy labels**
- [ ] **HIGH: Cannot require push notifications for app access** (Guideline 5.1.2(i))

---

## 4. PRIVACY MANIFEST & LABELS (CRITICAL - New Requirements)

### Privacy Manifest (PrivacyInfo.xcprivacy)

- [ ] **CRITICAL: PrivacyInfo.xcprivacy file included in app bundle**
- [ ] **CRITICAL: All Required Reason APIs declared with approved reasons:**
  - NSPrivacyAccessedAPICategoryUserDefaults (reason code CA92.1)
  - NSPrivacyAccessedAPICategoryFileTimestamp (reason code 3B52.1)
  - NSPrivacyAccessedAPICategorySystemBootTime (reason code 35F9.1)
  - NSPrivacyAccessedAPICategoryDiskSpace (reason code 7D9E.1)
  - Review all third-party SDKs for their Required Reason API usage
- [ ] **CRITICAL: Third-party SDK privacy manifests included**
  - Each SDK must provide its own PrivacyInfo.xcprivacy
  - Verify Capacitor plugins have privacy manifests

### App Store Privacy Labels (App Store Connect)

- [ ] **CRITICAL: Privacy nutrition labels accurately filled out**
  - 14 data categories must be reviewed and disclosed
  - Must match actual app behavior (Apple verifies with automated scanning)
- [ ] **HIGH: Data linked to user identity properly categorized**
- [ ] **HIGH: Data used for tracking properly categorized**
- [ ] **HIGH: Data collection purposes accurately described**

---

## 5. PUSH NOTIFICATIONS (Guideline 4.5.4)

### APNs Configuration

- [ ] **CRITICAL: Push Notifications capability enabled in Xcode project**
- [ ] **CRITICAL: Background Modes capability enabled with "Remote notifications"**
- [ ] **CRITICAL: Valid APNs certificate or key configured**
  - APNs certificates updated (production certs updated Feb 24, 2025)
  - Certificate must not be expired
- [ ] **CRITICAL: App ID registered with Push Notifications capability** (no wildcard App ID)

### Implementation Requirements

- [ ] **HIGH: Explicit opt-in for marketing/promotional notifications**
- [ ] **HIGH: Method to opt out of notifications provided**
- [ ] **HIGH: No sensitive/confidential information in notifications**
- [ ] **MEDIUM: Push notifications not required for app functionality**
- [ ] **MEDIUM: Deep-linking from notifications works correctly**

### Info.plist Keys

- [ ] **HIGH: NSUserNotificationsUsageDescription** (iOS 15.4+) - customize permission alert text
- [ ] **HIGH: UIBackgroundModes includes "remote-notification"**

---

## 6. CHILDREN'S PRIVACY (COPPA/FERPA) - Guidelines 1.3, 5.1.4

> **IMPORTANT: This app involves student athletes who may be minors (under 18, some under 13)**

### Age Considerations

- [ ] **CRITICAL: Determine if app will be used by users under 13**
  - If YES: Full COPPA compliance required
  - College athletes are typically 18+, but recruiting features may involve high school students (minors)
- [ ] **CRITICAL: Age rating set correctly in App Store Connect**
  - Answer age rating questionnaire honestly
  - Consider if any content requires 12+ or 17+ rating

### COPPA Compliance (if minors under 13 may use app)

- [ ] **CRITICAL: Verifiable parental consent before collecting PII from children under 13**
- [ ] **CRITICAL: No third-party analytics collecting PII from children**
- [ ] **CRITICAL: No behavioral advertising to children**
- [ ] **HIGH: Parental gates for purchases and external links**

### FERPA Compliance (student educational records)

- [ ] **CRITICAL: Student educational records protected per FERPA**
- [ ] **CRITICAL: Proper consent mechanisms for sharing student data**
- [ ] **HIGH: Data minimization - collect only what's necessary**
- [ ] **HIGH: Directory information handling policies defined**

### Kids Category Decision

- [ ] **MEDIUM: Determine if app should be in Kids Category** (ages 5-11 only)
  - Likely NOT appropriate for this app (college sports SaaS)
  - If NOT in Kids Category, do NOT use "For Kids" or "For Children" in metadata

### State Age Verification Laws (Effective 2026-2027)

- [ ] **MEDIUM: Monitor upcoming state requirements:**
  - Texas (effective Jan 1, 2026) - age verification required
  - Utah (effective May 7, 2026)
  - Louisiana (effective July 1, 2026)
  - California (effective Jan 1, 2027)

---

## 7. SCREENSHOTS & APP PREVIEWS (Guideline 2.3.3)

### Screenshot Requirements

- [ ] **CRITICAL: Minimum 3 screenshots** (up to 10 allowed)
- [ ] **CRITICAL: Screenshots show app in use** (not just title/login screen)
- [ ] **CRITICAL: Format: .png or .jpg (RGB, no alpha channels)**
- [ ] **HIGH: Base sizes for 2026:**
  - **iPhone 6.9":** 1320 x 2868 pixels (required base, auto-scales for smaller)
  - **iPad 13":** 2064 x 2752 pixels (if supporting iPad)
- [ ] **HIGH: Screenshots reflect exact submitted build**
- [ ] **MEDIUM: Text overlays clear and within safe areas**
- [ ] **MEDIUM: No prices, terms, or non-specific descriptions in screenshots**
- [ ] **LOW: Screenshots must adhere to 4+ age rating regardless of app rating**

### App Preview (Optional but Recommended)

- [ ] **MEDIUM: Video 15-25 seconds duration**
- [ ] **MEDIUM: Max file size 500 MB**
- [ ] **MEDIUM: Shows actual app screen capture only**

---

## 8. INFO.PLIST REQUIRED KEYS

### Permission Usage Descriptions (MUST be human-readable)

- [ ] **CRITICAL (if using camera):** NSCameraUsageDescription
- [ ] **CRITICAL (if using photos):** NSPhotoLibraryUsageDescription
- [ ] **CRITICAL (if saving photos):** NSPhotoLibraryAddUsageDescription
- [ ] **CRITICAL (if using location):** NSLocationWhenInUseUsageDescription
- [ ] **CRITICAL (if using microphone):** NSMicrophoneUsageDescription
- [ ] **CRITICAL (if tracking):** NSUserTrackingUsageDescription
- [ ] **HIGH:** NSUserNotificationsUsageDescription (push notification prompt text)

### App Transport Security

- [ ] **HIGH: ATS properly configured**
  - Must use HTTPS for all connections
  - Exceptions must be justified

### Other Required Keys

- [ ] **CRITICAL: CFBundleIdentifier** = com.helmsportslabs.golfhelm
- [ ] **CRITICAL: CFBundleVersion and CFBundleShortVersionString** set correctly
- [ ] **HIGH: UIRequiredDeviceCapabilities** - list required hardware
- [ ] **HIGH: UISupportedInterfaceOrientations** configured
- [ ] **MEDIUM: UILaunchStoryboardName** set for launch screen

---

## 9. SECURITY (Guideline 1.6)

- [ ] **CRITICAL: HTTPS for all network connections**
- [ ] **CRITICAL: No hardcoded credentials, API keys, or secrets in client code**
- [ ] **HIGH: End-to-end encryption for sensitive data transmission**
- [ ] **HIGH: Proper authentication token handling**
- [ ] **HIGH: No sensitive data stored in plaintext on device**
- [ ] **MEDIUM: Certificate pinning for critical API endpoints**
- [ ] **MEDIUM: Jailbreak detection** (optional but recommended)

---

## 10. BUSINESS MODEL (Guidelines 3.1)

### In-App Purchases

- [ ] **CRITICAL: All digital feature unlocks use Apple IAP** (if applicable)
  - No license keys, QR codes, or external payment for digital content
- [ ] **CRITICAL: "Restore Purchases" button exists and works** (if IAP used)
- [ ] **HIGH: SaaS exception** - if this is pure B2B SaaS for institutions:
  - Guideline 3.1.3(c): Enterprise services purchased by organizations may use alternative payment
  - BUT: if individual coaches/users purchase subscriptions, IAP required

### Reader App / Multiplatform Exception

- [ ] **MEDIUM: Determine if Reader App entitlement applies**
  - If users access content purchased/subscribed to on the web, may qualify
  - Must apply for External Link Account Entitlement

---

## 11. USER GENERATED CONTENT (Guideline 1.2)

> If coaches or athletes can post content, comments, or messages

- [ ] **CRITICAL (if UGC exists): Content filtering/moderation system**
- [ ] **CRITICAL (if UGC exists): Abuse/content reporting mechanism**
- [ ] **CRITICAL (if UGC exists): User blocking functionality**
- [ ] **CRITICAL (if UGC exists): Published support contact info**

---

## 12. LOGIN & AUTHENTICATION (Guideline 4.8)

- [ ] **CRITICAL: If using third-party login (Google, Apple, Facebook):**
  - Must offer Sign in with Apple as an equivalent alternative
  - Or provide email/password signup option
- [ ] **HIGH: Sign in with Apple implemented** (required if any third-party social login is offered)
- [ ] **MEDIUM: Login flow works smoothly with no errors**

---

## 13. APP STORE CONNECT SUBMISSION

### Required Information

- [ ] **CRITICAL: App name** (max 30 chars)
- [ ] **CRITICAL: App description** (accurate, no misleading claims)
- [ ] **CRITICAL: Primary category selection** (Sports)
- [ ] **CRITICAL: Privacy policy URL**
- [ ] **CRITICAL: Support URL**
- [ ] **CRITICAL: Marketing URL** (recommended)
- [ ] **HIGH: Keywords** (max 100 chars, relevant)
- [ ] **HIGH: Age rating questionnaire completed**
- [ ] **HIGH: Copyright info**
- [ ] **HIGH: Contact info for App Review team**

### App Review Notes

- [ ] **CRITICAL: Demo account credentials** (username/password for reviewer)
- [ ] **HIGH: Explanation of WebView architecture** - why app provides native value
- [ ] **HIGH: List of native features** (push notifications, offline mode, etc.)
- [ ] **MEDIUM: Any region restrictions or special setup**
- [ ] **MEDIUM: Description of any gated features and how to access them**

### Build Requirements

- [ ] **CRITICAL: Valid distribution certificate**
- [ ] **CRITICAL: Correct provisioning profile** (App Store distribution)
- [ ] **CRITICAL: App thinning / bitcode** (if applicable)
- [ ] **HIGH: No debug code or test flags in production build**

---

## 14. CAPACITOR-SPECIFIC REQUIREMENTS

- [ ] **CRITICAL: Using WKWebView** (Capacitor 4+ uses WKWebView by default - verify)
- [ ] **CRITICAL: No UIWebView references** in any code or dependencies
- [ ] **CRITICAL: All Capacitor plugins have privacy manifests** (PrivacyInfo.xcprivacy)
- [ ] **HIGH: Capacitor framework version 5.0+** (Apple requires updated SDKs)
- [ ] **HIGH: No private API usage from Capacitor plugins**
  - Check for ITMS-90338 warnings (non-public API usage)
- [ ] **HIGH: Server URL (helmsportslabs.com) loads reliably and quickly**
- [ ] **MEDIUM: Proper Capacitor bridge configuration**
- [ ] **MEDIUM: Native status bar styling matches app theme**
- [ ] **MEDIUM: Safe area insets handled correctly** (notch, Dynamic Island)

---

## 15. PRE-SUBMISSION TESTING CHECKLIST

### Clean Device Testing

- [ ] Install on clean device (no prior data/cache)
- [ ] Navigate all main flows end-to-end
- [ ] Test push notification registration and delivery
- [ ] Test offline mode / airplane mode
- [ ] Verify account creation flow
- [ ] Verify account deletion flow
- [ ] Verify privacy policy is accessible
- [ ] Test on slow/flaky network
- [ ] Test on latest iOS version
- [ ] Test on oldest supported iOS version

### Reviewer Simulation

- [ ] Use demo account credentials provided in Review Notes
- [ ] Verify all screenshots match current build
- [ ] Check all URLs in app and metadata are functional
- [ ] Verify age rating matches content
- [ ] Test "Restore Purchases" (if IAP exists)

### Submission Timing

- [ ] **TIP:** Submit Monday-Wednesday to avoid weekend review delays
- [ ] **TIP:** Have app ready for resubmission in case of rejection

---

## HIGH-RISK ITEMS SUMMARY (For This App Specifically)

| Priority | Risk | Guideline | Why It Matters |
|----------|------|-----------|----------------|
| **CRITICAL** | WebView app rejected as "website wrapper" | 4.2 | #1 reason Capacitor apps get rejected. Must demonstrate native value. |
| **CRITICAL** | Missing privacy manifest | New Req | 12% rejection rate for Privacy Manifest violations in Q1 2025 |
| **CRITICAL** | No in-app account deletion | 5.1.1(v) | Required since June 2022, still causes rejections |
| **CRITICAL** | Privacy policy missing or inaccessible | 5.1.1 | Must be in App Store Connect AND accessible in-app |
| **CRITICAL** | Demo account not provided | 2.1 | Reviewer cannot test gated features = rejection |
| **HIGH** | Student athlete data (minors) handling | 5.1.4/COPPA | If any users under 13, COPPA compliance required |
| **HIGH** | Push notification configuration incomplete | 4.5.4 | Key differentiator from website; must work perfectly |
| **HIGH** | Missing Sign in with Apple | 4.8 | Required if any third-party social login is used |
| **HIGH** | Inaccurate privacy labels | 5.1 | Apple now verifies with automated scanning |
| **HIGH** | No offline/error handling | 4.2 | Generic browser errors = looks like a website wrapper |
| **MEDIUM** | Screenshot mismatch | 2.3.3 | Screenshots must match exact submitted build |
| **MEDIUM** | IAP vs SaaS payment model | 3.1 | Must determine if enterprise exception applies |

---

## REFERENCES

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Privacy Manifest Files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- [Deploying Capacitor to App Store](https://capacitorjs.com/docs/ios/deploying-to-app-store)
- [Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Design Safe Experiences for Kids](https://developer.apple.com/kids/)
- [Apple Capacitor Policy Updates 2025](https://capgo.app/blog/apple-policy-updates-for-capacitor-apps-2025/)
- [App Store Review Checklist (nextnative)](https://nextnative.dev/blog/app-store-review-guidelines)
- [WebView App Review Guidelines (mobiloud)](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
