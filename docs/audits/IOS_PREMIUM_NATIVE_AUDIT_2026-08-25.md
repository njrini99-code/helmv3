# iOS Premium Native Audit — 2026-08-25

> The active audit for the iOS premium native update. Master plan:
> `docs/plans/IOS_PREMIUM_NATIVE_UPDATE_2026-08-25.md`. Branch:
> `feat/ios-premium-native-update`. Evidence:
> `docs/audits/evidence/ios-premium-2026-08-25/`.
> Status: IN PROGRESS (overnight run, commander session). Sections marked
> PENDING fill in as workflow results land.

## 1. Environment truth (verified live, 2026-08-25 ~22:50 ET)

| Fact | Value | How verified |
|---|---|---|
| macOS | Darwin 25.3.0 (macOS 26) | `uname` |
| Xcode | 26.6 (17F113), App Store install | `xcodebuild -version` |
| iOS SDK | 26.5.1 (23F81a) | `simctl runtime match list` |
| Simulator runtime | iOS 26.5 (23F77), Ready | `simctl runtime list` |
| Devices | iPhone 17 family + iPads (default set); 17e / 17 Pro / Pro Max booted | `simctl list devices` |
| Simulator build | `xcodebuild -scheme App -destination 'generic/platform=iOS Simulator'` → **BUILD SUCCEEDED** | tonight, exit 0 |
| App runs | installed + launched on all three iPhones; login renders correctly | screenshots in evidence dir |
| Capacitor | CLI 8.4.2, capacitor-swift-pm 8.4.1 via SPM (CapApp-SPM); **no CocoaPods** | `xcodebuild -list` resolution |
| Scheme | `App` (project `ios/App/App.xcodeproj`), Debug/Release | `xcodebuild -list` |
| Device family | iPhone-only (`TARGETED_DEVICE_FAMILY = 1`) | project.pbxproj |
| Orientations (iPhone) | Portrait + LandscapeLeft + LandscapeRight **declared** | Info.plist |
| App icon | Single universal 1024 PNG (`AppIcon-512@2x.png`); **no Dark/Tinted variants, no Icon Composer layered icon** | Assets.xcassets |

## 2. Hands-on simulator findings (signed-out surface, tonight)

Evidence files referenced are in `docs/audits/evidence/ios-premium-2026-08-25/`.

- **F-DARK-01 (P1, verify intent):** With system appearance = dark, the login
  screen renders the light theme (`login-dark-iphone17e.jpeg`,
  `login-dark-promax.jpeg`). Either signed-out surfaces ignore
  system appearance or the theme sync does not cover auth. The dashboard is
  believed to have full dark mode (SUBMISSION.md) — verify where the split is
  and make it intentional. Status bar text stayed correct (dark-on-light).
- **F-ICON-01 (P1, App Store visual):** Home-screen icon is a flat cream tile
  with the green wheel (`homescreen-dark-icon.jpeg`). Next to iOS 26 system
  icons (layered/glass, dark variants) it reads dated, and in dark mode it is
  the only bright-cream tile on the grid. Source confirms a single 1024 PNG
  with no dark/tinted variants. §64: prepare Default/Dark/Tinted variants that
  preserve the current mark; owner approves before final.
- **F-BRAND-01 (P2):** The splash/app-icon mark is the ship's-wheel Helm logo;
  the login page mark is a golf-ball-in-wheel variant. Two adjacent brand marks
  in the first 5 seconds of first launch. Decide one story (likely fine:
  company mark → product mark, but note it).
- **F-UL-01 (PASS):** Universal link `https://www.helmsportslabs.com/golf/dashboard`
  while signed out fronts the app and lands on the login screen
  (`universallink-signedout-settled.jpeg`). ReturnTo preservation after login
  still to verify (needs authed session).
- **F-ORIENT-01 (P1 decision):** iPhone landscape is declared in Info.plist but
  the product is designed portrait-first. Per plan §11: make it excellent or
  intentionally restrict. Recommendation pending landscape QA.
- **F-LAUNCH-01 (measure):** Cold launch shows the cream splash for multiple
  seconds while the remote WebView loads (first-ever launch ~30s on fresh
  install+network; warm relaunches faster). Proper §38 timing measurement
  pending; WKWebView cache clearing in GolfBridgeViewController (§60) is a
  suspect for repeat-launch cost.

## 3. Current native inventory (workflow synthesis) — PENDING

## 4. Apple platform research digest (official sources, 2026-08-25) — PENDING

## 5. UX quality rubric + P0/P1/P2/P3 — PENDING

## 6. Implementation phases chosen for tonight — PENDING

## 7. Release readiness / App Store package state — PENDING

## Constraints honored tonight

- No App Store upload / Submit / production deploy — owner-only (§89).
- Credentials are never typed by the agent; authed-surface simulator QA needs
  the owner to log in once on the simulator panel (session persists), or runs
  through the existing Playwright auth harness on the web layer.
- Haptic FEEL approval requires physical iPhone (§13) — a device checklist
  ships with the RC report.
