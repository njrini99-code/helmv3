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

## 3. Current native inventory (workflow synthesis)

# Current Native Inventory

*Synthesized from 6 structured inventory passes across the native Swift shell, Capacitor bridge, mobile nav/overlay system, active-round/scoring surfaces, App Store readiness assets, and iOS-adjacent docs/tests/CI. All facts below are anchored to file:line where the source inventory provided it. Branch: `feat/ios-premium-native-update`.*

---

## 1. Environment & Project Facts

| Fact | Value | Source |
|---|---|---|
| Marketing version / build | `2.0` / `8` (Debug and Release identical) | `ios/App/App.xcodeproj/project.pbxproj:327,336,355,364` |
| iOS deployment target | `15.0` (project- and target-level, no variance) | pbxproj:252,310,331,359 |
| Device family | `TARGETED_DEVICE_FAMILY = 1` (iPhone only) — no iPad family value anywhere | pbxproj:344,372 |
| Bundle ID / display name | `com.helmsportslabs.golfhelm` / "Helm Sports Labs" | pbxproj:338,365; Info.plist:9-10 |
| Signing team | `MK49MSX29G`, `CODE_SIGN_STYLE=Automatic` | pbxproj:326,328,354,356 |
| Signing anomaly | Release target config pins `CODE_SIGN_IDENTITY="Apple Development"` (pbxproj:353) with blank `PROVISIONING_PROFILE_SPECIFIER` (pbxproj:367) — no Debug equivalent; atypical for an App Store archive though Automatic signing may override it. Project-level configs also separately carry legacy `"iPhone Developer"` (pbxproj:232,296) | pbxproj (multiple) |
| App category | `public.app-category.sports` | pbxproj:330,358 |
| Swift / tooling | Swift 5.0 (pbxproj:343,371); Package.swift declares `swift-tools-version: 5.9`, `.iOS(.v15)` | Package.swift:1,7 |
| Dependency manager | SPM only — no Podfile anywhere under `ios/` (verified via find). 10 local-path Capacitor plugin packages + `capacitor-swift-pm` 8.4.1 | Package.swift:13-25 |
| Orientations | iPhone: Portrait/LandscapeLeft/LandscapeRight; inert `~ipad` block (Portrait/PortraitUpsideDown/Landscape×2) is dead weight given the iPhone-only device family | Info.plist:64-76 |
| `UIRequiresFullScreen` | `true` — notable alongside iPhone-only family + leftover iPad orientation keys | Info.plist:62-63 |
| Entitlements | `aps-environment=production` (no dev variant); `associated-domains=[applinks:helmsportslabs.com, applinks:www.helmsportslabs.com]`. **Single** `.entitlements` file used for both Debug and Release configs | `App.entitlements:5-11`; pbxproj:325,352 |
| Privacy manifest | `NSPrivacyTracking=false`, no tracking domains; 8 data-type categories declared (Email/Name/UserID/DeviceID linked-AppFunctionality; PerformanceData/CrashData/ProductInteraction not-linked-Analytics; Photos linked; OtherDataTypes linked — "golf performance stats, round data"); exactly 2 required-reason APIs (`UserDefaults` CA92.1, `FileTimestamp` C617.1) | `PrivacyInfo.xcprivacy:5-148` |
| Single native target | Exactly one `PBXNativeTarget` ("App", application) — no widget/Live Activity/share extension exists | pbxproj:90-111 |
| Encryption flag | `ITSAppUsesNonExemptEncryption=false` | Info.plist |
| Assets | App icon: single 1024×1024 universal PNG, opaque/no-alpha, no Dark/Tinted variant. Splash: 3-scale (1x/2x/3x) 2732×2732 PNGs, standard Capacitor pattern, no dark-mode variant | `Assets.xcassets/AppIcon.appiconset/Contents.json`; `Splash.imageset/Contents.json` |
| Native UA marker | `"HelmSportsLabsApp"` appended via `capacitor.config.ts` (ios/android), hardcoded independently in 3 places: `src/proxy.ts:17`, `src/lib/supabase/middleware.ts:138`, `src/lib/auth/session-idle-shared.ts:73` — no shared constant | multiple |
| Capacitor plugins actually imported in `src/` | 7 of 13 installed: `@capacitor/{browser,core,haptics,keyboard,push-notifications,splash-screen,status-bar}`. **Zero** import sites for `@capacitor/{app,share,network,local-notifications}` despite being installed in `package.json` | repo-wide grep |
| CI/CD reality | `vercel.json` disables all Git deploys; production is on-demand CLI promote (CLAUDE.md/shipping.md — not from this inventory but load-bearing context) | n/a |
| CircleCI iOS job | `ios-compile` (executor `ios`, Xcode 26.4.1) runs `cap sync ios` + `xcodebuild -destination 'generic/platform=iOS Simulator'`, compile-only, no signing/TestFlight | `.circleci/config.yml:42-46,228-277` |
| **CircleCI branch gate does not include current branch** | Gated by branch name only: `[main, /release\/.*/, /ios\/.*/, /capacitor\/.*/, /agent\/fix-circleci-ios-.*/]` — `feat/ios-premium-native-update` matches none of these | `.circleci/config.yml:392-404` |
| CodeQL Swift coverage | Explicitly excludes Swift ("thin Capacitor bridge... re-enable once the iOS layer has substantive native logic") | `.github/workflows/codeql.yml:59-62` |

---

## 2. What Already Works and Must Not Be Rebuilt (plan §3 verification)

All four of plan §3's headline claims were checked against live code and are **CONFIRMED**, with the exact anchors:

| Plan §3 claim | Verdict | Anchor |
|---|---|---|
| Haptics vocabulary already exists: selection/light/medium/heavy/success/warning/error + commit/reject/threshold/celebrate | **CONFIRMED, exact match** | `src/lib/fairway/haptics.ts` — `FwHapticKind` (7 values), `FwHapticSequence` (4 values, lines 67-82) |
| Haptics preference gate (single on/off switch) | **CONFIRMED**, sits at the lowest shared layer so both `triggerHaptic()` (112 sites) and `fwHaptic()` (14 sites) honor it | `src/lib/utils/capacitor.ts:65-87` gates on `areHapticsEnabled()` from `src/lib/utils/haptics-pref.ts` |
| Push: APNs/FCM registration, delayed persistence until authenticated session, foreground notifications, deep-link navigation, safe-URL validation, soft permission prompting | **CONFIRMED in full** | `src/lib/utils/push-registration.ts:79-343` (park-then-flush state machine with exponential backoff; `isSafeInternalPath()` gate at `safe-redirect.ts:14-24`) |
| Theme/status-bar: light/dark/system + native status-bar sync, "any old audit claiming absence is stale" | **CONFIRMED** | `syncStatusBarToTheme()` + a `MutationObserver` on `<html>` class (`CapacitorProvider.tsx`) — reactive, not one-shot |
| Safe-area: body-level padding deliberately avoided (fixed a prior double-padding bug) | **CONFIRMED**, exact rationale reproduced in-code | `GolfBridgeViewController.swift:48-53` |
| WKWebView cache clear scoped to disk+memory only, cookies/session untouched | **CONFIRMED** | `GolfBridgeViewController.swift:19-21` (`WKWebsiteDataTypeDiskCache`/`MemoryCache` only) |
| Universal Links / associated domains already configured | **CONFIRMED**, both apex + www | `App.entitlements:8-11` |
| Round-submit haptic gated on confirmed DB result (fresh-start path only) | **CONFIRMED for `new-round-client.tsx`** | `new-round-client.tsx:1818` (`triggerHaptic('success')` only after awaited `submitGolfRoundComprehensive` resolves); `:1834` (`error`) |
| Hole-completion checkpoint UI (saving→failed→retry) | **CONFIRMED, mature** | `FairwayCompletedHole.tsx:60-74` — honest copy, dedicated retry |
| 4-tier round durability stack (localStorage emergencySave, ~15s debounced network autosave with backoff+circuit-breaker, blocking hole-checkpoint, IndexedDB offline-draft+sync-engine) | **CONFIRMED, more sophisticated than plan assumes** | `use-shot-state-machine.ts:649-763`; `new-round-client.tsx:1364-1419`; `@/lib/offline/*` |
| Guideline 3.1.1 remediation (pricing nudge hidden in native app) | **CONFIRMED** | `DemoPricingNudge.tsx:99` — hard `if (isNativeApp()) return;` before any timer arms |
| FairwayBottomNav / MoreNavSheet 5-column mobile nav (honest badges, safe-area, z-index below overlays) | **CONFIRMED, well-factored, shared cross-sport** | `src/components/fairway/app-shell/{FairwayBottomNav,MoreNavSheet,more-nav}.ts` |
| fairway/overlays/Sheet.tsx (vaul-based, ONE canonical sheet per design-system.md) | **CONFIRMED mature** — focus-trap, scroll-lock, safe-area, deliberately-disabled iOS half-detent with documented reason | `Sheet.tsx:92-110,152-158` |

**Do not rebuild:** the semantic haptic grammar, the push token park/flush/backoff state machine, status-bar theme sync, the safe-area avoidance, the WKWebView cache scoping, associated domains, the bottom-nav/MoreNavSheet system, `fairway/overlays/Sheet.tsx`, or the 4-tier round-durability stack. Extend these; none are gaps.

---

## 3. Mobile UX Surface Map

**Bottom nav / shell**
- `src/components/fairway/app-shell/FairwayBottomNav.tsx` (287 lines) — 4 destination tabs + "More" (5 columns), shared golf/baseball/bridge. Built by `src/lib/golf/nav-registry.ts:460-500` (`buildCoachBottomNavItems` / `buildPlayerBottomNavItems`).
- `src/components/fairway/app-shell/MoreNavSheet.tsx` (240 lines), `MoreSheetFooter.tsx`, `more-nav.ts` — overflow sheet, `selectOverflow()` dedupe logic (more-nav.ts:51-70).
- `src/components/fairway/app-shell/AppShell.tsx` — content padding-bottom math (`AppShell.tsx:443`); `FairwayTopBar.tsx` — mobile leading slot is a non-interactive `<span>`, no back control (lines 260-268); `FairwaySidebar.tsx` — desktop rail equivalent.

**Overlay/sheet primitives (3 coexisting families)**
1. `src/components/fairway/overlays/{Sheet.tsx, ModalShell.tsx, PopoverPanel.tsx}` — canonical, escalation ladder documented in `overlays/_shared.ts:19-29`.
2. `src/components/ui/drawer.tsx` — separate vaul wrapper, still imported by 18 files under the pre-Fairway `src/components/golf/` tree (`EventDetailModal.tsx`, `AddClassModal.tsx`, `CourseFormDrawer.tsx`, `TeeFormDrawer.tsx`, `DrillSheet.tsx`, `NewAnnouncementsModal.tsx`, `UploadNewVersionModal.tsx`, `PushPermissionSoftAsk.tsx`, +2 fairway/pages files, 1 action file).
3. `src/components/ui/{dialog.tsx, modal.tsx, confirm-dialog.tsx}` — zero import hits under golf surfaces; effectively dead code there.

**Active round / shot entry / score submission**
- `src/components/fairway/pages/rounds-tracking/FairwayShotTracking.tsx` — `handleNextShot` (307-434), hole-nav haptics (223,230), shot-record haptic (403).
- `FairwayShotEntry.tsx` (result-chip radiogroup + "Next shot →"), `FairwayShotPills.tsx`, `FairwayPenaltyModal.tsx`, `FairwayUnsavedNavModal.tsx`, `FairwayCompletedHole.tsx`, `FairwayEditShotModal.tsx`, `FairwayScorecardHeader.tsx` (`AutoSaveChip`, lines 58-110).
- Entry points: `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx` (fresh start, submit at 1720-1839) and `.../rounds/continue/[id]/continue-round-client.tsx` (resume, submit at 879-1004).
- Hooks: `src/hooks/golf/use-shot-state-machine.ts` (autosave scheduling, circuit breaker), `use-edit-shot-modal.ts`, `use-undo-manager.ts`, `use-penalty-handler.ts`.
- Qualifier rounds reuse the identical tree via `?qualifier=<id>` (`FairwayMyQualifiers.tsx:51`) — no parallel implementation.
- Player dashboard: `src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx`, fed by `src/app/golf/actions/player-hub-data.ts` (`getPlayerHubSummaryData`) — one "New round" CTA only, no in-progress-round card.

**Capacitor/native bridge (web side)**
- `src/lib/utils/capacitor.ts` (haptics funnel, status-bar, splash), `src/components/providers/CapacitorProvider.tsx` (lifecycle wiring, keyboard, push, status-bar sync), `src/lib/utils/push-registration.ts`, `src/lib/utils/haptics-pref.ts`, `src/lib/fairway/haptics.ts`.

---

## 4. Discrepancies vs. Master Plan's Historical Claims

| Historical claim | Reality | Source |
|---|---|---|
| `docs/PUSH_NOTIFICATION_AUDIT.md`: "@capacitor/push-notifications NOT INSTALLED" (line 50), "AppDelegate push delegate methods MISSING" (line 53) | **FALSE today.** Plugin is `^8.1.2` in `package.json`; `AppDelegate.swift:43,50` has both delegate methods. Doc is self-flagged STALE. | package.json; AppDelegate.swift |
| `docs/UIUX_AUDIT.md`: grades app "B+", calls dark mode "the largest missing piece" (lines 428-432) | **FALSE today.** `tailwind.config darkMode:["class"]` (line 41) + extensive `.dark`/`[data-theme='dark']` rules in `globals.css`. Doc is self-flagged STALE — this is exactly the trap plan §3 line 179 warns about. | tailwind.config.ts; globals.css:233-234 |
| Plan §58: push payloads must not navigate WKWebView to arbitrary remote URLs; external destinations should use native browser | **Not yet implemented.** No `CAPBrowserPlugin` routing/external-URL check exists in any of the 3 Swift files — only `onNavigateAway`'s 3-substring allowlist, which is a return-to-login mechanism, not an external-vs-internal router. `capacitor.config.ts`'s `allowNavigation` scope (`*.helmsportslabs.com`) is *broader* than `onNavigateAway`'s gate, so in-domain non-golf pages trigger an unwanted forced reload to `/golf/login`. | GolfBridgeViewController.swift:80-88; capacitor.config.json:8-11 |
| Plan §9 prerequisite: an active audit doc must exist before any large redesign | Did **not** exist at inventory time (`test -f` failed) — this document is that prerequisite being fulfilled now. | n/a |
| Plan §33: "never play success haptic before a high-risk operation is truly committed" | **Violated today.** `FairwayShotTracking.tsx:403` fires `triggerHaptic('success')` immediately on local dispatch, *before* the awaited `completeHole()` checkpoint at line 417 resolves — can fire even when the hole then fails to save. | FairwayShotTracking.tsx:403,417 |
| Plan §32: "score +/-: selection detent" | **No such control exists.** Score is a derived count (`calculateHoleStats`), entered via result chips + "Next shot →", not a stepper. `NumberField` (which has +/- steppers) is never used for score. | FairwayShotTracking.tsx:505; NumberField.tsx |
| Plan §80: "open app → active round visible immediately" (gold standard) | **Not met.** Dashboard has no in-progress-round card; `/golf/dashboard/rounds/new` explicitly documents it "deliberately does NOT fetch the in-progress round" (page.tsx:33-37); resume only via a separate `/golf/dashboard/rounds` list. | rounds/new/page.tsx:33-37 |
| Plan §61: propose `nativeCapabilities`/version-detection registry | **Does not exist.** No `getAppVersion`/`buildNumber`/`App.getInfo()` call anywhere in `src/`; `@capacitor/app` installed but unimported. | repo-wide grep |
| Plan §57: "audit existing Share usage" | **Nothing to audit** — `@capacitor/share` installed, zero import sites. | grep |
| Plan §28: "desktop modal proportions on phone" (audit target) | **Confirmed live, not hypothetical.** `ModalShell.tsx` (47 call sites) has no mobile-responsive transform; only the effectively-unused `ui/modal.tsx` has an opt-in `sheetOnMobile` prop. | ModalShell.tsx:48-56; modal.tsx:15-22 |
| Plan §5: Apple requires Xcode 26+/iOS 26 SDK for uploads since 2026-04-28 | **Unverifiable from repo** — no App Store Connect / local Xcode-version access from this inventory. | flagged, not confirmed |
| Plan §67: don't assume 2.0(8) is the live App Store version | **Unverifiable** — no ASC access. SUBMISSION.md's own premise (v1.7 live, v2.0/8 unsubmitted) not independently confirmed. | flagged |
| Plan §87 verification checklist assumes Playwright/native-test coverage of capacitor/haptics/push exists | **Does not exist.** Zero e2e specs touch capacitor/haptics/push (grep hits are false positives); zero XCTest/XCUITest target under `ios/`. | e2e/*.spec.ts grep; `find ios -iname '*Tests*'` |

---

## 5. Gaps & Risks (P0/P1/P2)

### P0 — blocks flagship plan targets, violates an explicit plan directive, or blocks tonight's submission

1. **No active/in-progress-round resume affordance on the player dashboard** — directly contradicts plan §80's flagship target ("open app → active round visible immediately"). `FairwayPlayerDashboard.tsx` has zero resume/in-progress UI; "New round" doesn't detect an existing round. *(rounds-tracking area)*
2. **Success haptic fires before hole-completion DB checkpoint is confirmed** — `FairwayShotTracking.tsx:403` vs. the await at `:417`; a direct, plan-flagged (§33) honesty violation — the celebratory haptic can fire on a hole that then fails to save. *(rounds-tracking area)*
3. **Zero submission-ready App Store screenshots exist anywhere in the repo** — the one committed set (`design/appstore-screenshots/`, 2026-04-11) both predates the Fairway rebuild and is the wrong pixel dimension (1284×2778 vs. required 1290×2796). `scripts/gen-appstore-screenshots.mjs` is correctly configured but has never been run/committed (`ios/appstore/screenshots/` doesn't exist on disk). **Single largest concrete blocker to submitting tonight.** *(App Store readiness area)*
4. **CircleCI's `ios-compile` job will not run on this branch** — `feat/ios-premium-native-update` matches none of the branch-name filters (`main`, `release/*`, `ios/*`, `capacitor/*`, `agent/fix-circleci-ios-*`). The only automated iOS build/compile verification in the repo will silently skip all of tonight's native work unless triggered manually or the branch is renamed. *(docs/tests/CI area)*
5. **`aps-environment` hardcoded to `production` for both Debug and Release** — one `.entitlements` file, no sandbox/dev APNs variant (`App.entitlements:5-6`; `CODE_SIGN_ENTITLEMENTS` at pbxproj:325,352). Risk to any device-based push QA under plan §44, severity depends on provisioning profile at build time (not verifiable from repo alone). *(native shell area)*
6. **App Review demo account password freshness cannot be verified** — `demo@golfhelmdemo.com`'s plaintext password lives in `ios/appstore/SUBMISSION.md`, and the only rotation script (`scripts/rotate-demo-passwords.mjs:23-26`) touches 5 *different* accounts, never this one. SUBMISSION.md itself calls a broken demo login "the single most common cause of automatic rejection." Someone must manually confirm this login works before submitting tonight. *(App Store readiness area)*

### P1 — real, verified gaps against plan targets; not launch-blocking tonight but should be closed before this workstream is considered done

7. **`continue-round-client.tsx`'s round-submit path has zero haptic feedback** (success or error) despite mirroring `new-round-client.tsx` line-for-line including the identical "Show success celebration" comment — every resumed round and every qualifier round gets no tactile confirmation on submit. *(rounds-tracking)*
8. **No native-capability/version-detection layer** (plan §61's `nativeCapabilities`/`coreHapticsV1`/etc.) — since `server.url` points at a remote-loaded web app that can out-update the installed native binary, any new native feature (Live Activity, App Intents, Core Haptics custom plugin) has no mechanism to gate itself against older installed builds. Should precede any Phase D ecosystem feature. *(Capacitor bridge area)*
9. **Three coexisting overlay/sheet primitive families** instead of one — `ui/drawer.tsx` (18 consumers, still mixing retired warm/cream vocabulary in `EventDetailModal.tsx:859` alongside current `--fw-*` tokens in `AddClassModal.tsx:396` within the *same* family) vs. canonical `fairway/overlays/*` vs. dead `ui/{dialog,modal}.tsx`. Real "coherent mobile sheet grammar" gap plan §28 should address directly. *(nav/overlay area)*
10. **`ModalShell.tsx` (47 sites) has no mobile-responsive sheet transform** — renders desktop-centered-dialog proportions on phone; the only primitive with an opt-in mobile transform (`ui/modal.tsx`'s `sheetOnMobile`) is unused in golf/fairway code. *(nav/overlay area)*
11. **No shared "Back" affordance in mobile shell chrome** — `FairwayTopBar.tsx`'s mobile leading slot is a non-interactive `<span>` (lines 260-268); back controls exist only ad hoc inside specific sheets. Swipe-back (`allowsBackForwardNavigationGestures`) is unset anywhere in Swift/config — plan §26 needs a deliberate decision, not the current unconfigured default. *(nav/overlay area)*
12. **No hide-on-scroll or scroll-to-top-on-retap on the bottom nav** — plan §27 asks to evaluate both; neither exists today (bar is unconditionally `fixed`; retap on an already-active tab triggers no pathname change so the existing scroll-reset effect never fires). *(nav/overlay area)*
13. **Badge correctness has a real architectural gap** — no installed Capacitor plugin (including `@capacitor/local-notifications`, which is installed but unused for this) can set the badge locally; only server-driven APNs push with an absolute badge value works (documented in `push-registration.ts`'s own JSDoc). Any "mark read → badge decrements" UI must route through a server round-trip. *(Capacitor bridge / plan §49)*
14. **No haptic feedback on shot edit/delete, undo, penalty entry, hole-nav pills, or distance/result chips** — confirmed zero `triggerHaptic`/`fwHaptic` calls in `use-edit-shot-modal.ts`, `use-undo-manager.ts`, `use-penalty-handler.ts`, `FairwayShotPills.tsx`, `FairwayShotEntry.tsx`. These are the concrete call sites needed if plan §32's haptic grammar work proceeds. *(rounds-tracking)*
15. **`fwHaptic` semantic layer is dead code in the entire active-round/qualifier feature area** (0 call sites in rounds-tracking/qualifiers/hooks) — every haptic there uses `triggerHaptic()` directly with string literals, contradicting CLAUDE.md §3's framing of `fwHaptic` as the grammar to evolve. Bottom nav has the same inconsistency (its one haptic call site, the More button, uses `triggerHaptic` via `ui/button.tsx`, not `fwHaptic`). *(cross-cutting)*
16. **Four installed Capacitor plugins have zero web-side usage**: `@capacitor/{app,share,network,local-notifications}` — dead weight unless referenced natively (unlikely). Blocks plan-mandated features (App→lifecycle/version, Share→native share sheet, Network→reconnect handling) until wired up. *(Capacitor bridge)*
17. **No Playwright/e2e coverage of capacitor, haptics, or push** — the one CI-blocking mobile suite (`e2e/mobile-viewports.spec.ts`) covers zero golf routes and runs under desktop-Chrome emulation, not a mobile device profile. Tonight's native-facing changes have no automated regression net. *(docs/tests/CI)*
18. **No native XCTest/XCUITest infrastructure exists at all** — `find ios -iname '*Tests*'` and grep for XCTest/XCUITest both return nothing; plan §74/§87's "native tests" have nothing to build on. *(docs/tests/CI)*
19. **App Review contact phone number missing** — SUBMISSION.md flags this itself (only email listed). *(App Store readiness)*
20. **No Dark/Tinted/Icon-Composer app icon variant** — plan §64 treats this as an open evaluation item; nothing started. *(App Store readiness)*

### P2 — minor, cosmetic, or cleanup-only; low risk, worth fixing opportunistically

21. Two different badge caps in the same `FairwayBottomNav.tsx` component ("99+" on destination tabs vs. "9+" on the More column, lines 209/268) — a prior audit already found this and only half-fixed it.
22. Stale in-file comments in `GolfBridgeViewController.swift:6-7` still describing a "native chooser"/"native home screen" that `SceneDelegate.swift:13-15` says was deleted in May 2026.
23. Debug-only `OTHER_SWIFT_FLAGS` references a `COCOAPODS` flag (pbxproj:337) despite the project being SPM-only — harmless leftover Capacitor-template boilerplate.
24. Three independent hardcodings of the `"HelmSportsLabsApp"` UA marker string (`proxy.ts`, `middleware.ts`, `session-idle-shared.ts`) rather than one shared constant — narrow drift risk if the marker is ever changed.
25. `memory/registry.yml`/`golf-feature-ownership.md` names Player Home's action file as `dashboard-data.ts`; actual code path is `src/app/golf/actions/player-hub-data.ts` — registry drift worth flagging per the repo's own docs:schema-drift/path-drift discipline.
26. CodeQL's Swift-exclusion rationale ("thin bridge, no substantive native logic") is about to be invalidated by any real Swift added tonight (Core Haptics plugin, Live Activity, App Intents) — `.github/workflows/codeql.yml:59-62` will need updating if that happens.
27. `initCapacitor()`'s Keyboard accessory-bar-hide call lacks the `isPluginAvailable()` guard the other two Keyboard/Push call sites use (protected only by surrounding try/catch) — functionally safe today, inconsistent pattern.
28. Golf-specific Playwright auth setup (`playwright/auth.setup.ts`) is orphaned from the main `playwright.config.ts` project list — needs an explicit decision if new capacitor/haptics/push e2e specs are added.
29. Code-comment stale-count example inside `haptics-pref.ts`'s own docstring ("164 of 177 call sites... 13 via fwHaptic") vs. live grep today (112/14) — exactly the "never write a count into prose" trap the repo's own shipping rule warns against, just found inside a code comment rather than a memory doc.

---

## 6. App Store Readiness State

**What exists in `ios/appstore/` tonight:**
- `SUBMISSION.md` — 14 sections, fully drafted: name/bundle/subtitle/category/price (§1), description/keywords/promo text/What's New (§3-6), App Privacy nutrition labels (§7, matches `PrivacyInfo.xcprivacy`), demo account (§8), age rating 4+ all-None (§9), screenshot requirements spec (§10), Guideline 3.1.1 remediation notes (§11), BaseballHelm-excluded-by-design scope note (§12), version/build cross-check (§13). Last touched 2026-07-29; documents a prepared but **not yet submitted** v2.0(8) package (last live version per the doc: 1.7 — unverified against live ASC).
- App icon: single opaque 1024×1024 PNG, no alpha, no Dark/Tinted variant — matches SUBMISSION.md's claim.
- Splash: standard 1x/2x/3x 2732×2732 Capacitor default, on-brand cream, no dark variant.
- Encryption flag, push entitlement, Universal Links entitlement — all in place and independently verified in source.
- `scripts/gen-appstore-screenshots.mjs` — correctly configured (Playwright at exact 1290×2796 / 430×932@3x DPR), logs in with demo coach credentials against production, captures 5 screens (stats/dashboard/recruiting/calendar/roster). **Never executed in this checkout** — its output directory `ios/appstore/screenshots/` does not exist.
- Guideline 3.1.1 fix (pricing nudge hard-gated behind `isNativeApp()`, proxy.ts UA-based marketing-route block) — real, verified, addresses a documented prior rejection (commit `7933eb8be`).

**What's missing tonight (blocking or needing owner action before submission):**
1. **No submission-ready screenshots at all** — the only committed set (`design/appstore-screenshots/`, 5 files, 1284×2778) predates the Fairway rebuild (added 2026-04-11, before the first Fairway shell commit 2026-06-02) *and* is the wrong pixel dimension for current requirements (need 1290×2796 minimum). Must run `gen-appstore-screenshots.mjs` and commit/upload output.
2. **Demo account login cannot be verified from repo** — manual login test required before submitting (SUBMISSION.md's own stated #1 rejection cause).
3. **App Review contact phone number** — not recorded (SUBMISSION.md self-flags this).
4. **Live App Store Connect state is entirely unverified** — current SDK/Xcode compliance (plan §5's Xcode 26+/iOS 26 SDK claim since 2026-04-28), whether v1.7 is truly still live, TestFlight build history, and whether any SUBMISSION.md metadata has already been partially entered into ASC — none of this is checkable from a read-only repo inventory; needs an owner with ASC access.
5. **Dark/Tinted/Icon-Composer app icon variant** — plan §64 evaluation not started.
6. **iOS-compile CI verification will not run automatically** on the current branch (see P0 §4 above) — must be triggered manually or the branch renamed before relying on CircleCI as a build gate for tonight's changes.
7. Metadata prose (description, keywords, promo text, privacy labels, age rating, review notes) is complete and ready to paste into App Store Connect as-is — this is the one readiness area that needs no further repo-side work, only manual ASC entry.

## 4. Apple platform research digest (official sources, 2026-08-25)

Full digest with sources: `docs/audits/IOS_PREMIUM_APPLE_RESEARCH_2026-08-25.md`.
Submission-critical highlights verified against developer.apple.com on 2026-08-25:

- **Xcode 26+/iOS 26 SDK upload floor (since 2026-04-28): CLEARED** by Xcode 26.6 / iOS 26.5.1 SDK. iOS 15 deployment target unaffected.
- **Age-rating questionnaire changed in 2026** (4+/9+/13+/16+/18+ tiers, new Social Media question; compliance deadline already passed). **Must be re-answered in App Store Connect before submitting** — potential hard blocker, owner console action.
- **Privacy manifests** are an upload-time gate; the app manifest declares 2 required-reason APIs; plugin manifests ride in via SPM. Validate on the real archive.
- **Screenshots**: one 6.9-inch set required — portrait 1260×2736 or 1320×2868 px, PNG/JPG, no alpha, 1–10 images.
- **Accessibility Nutrition Labels are voluntary** — declare none for this release (declaring unverified features is a 2.3 metadata risk).
- **TestFlight internal testing needs no Beta App Review** — fastest morning path to a device build.
- **Liquid Glass**: never simulate in WKWebView content (it IS the content layer); adopt only in native chrome. `UIDesignRequiresCompatibility` exists as a sanctioned escape hatch.
- **Guideline 4.2.2** is the main subjective risk for a WebView app → mitigated via review notes enumerating concrete native functionality (see RC package).


## 5. Findings → priorities (post-fix state)

**P0 — none open.** No crashes, data loss, auth breaks, or upgrade-path breaks observed tonight; authed session survived a build 8→9 reinstall.

**P1 — fixed tonight (commit on feat/ios-premium-native-update):**
- F-SAFEAREA-02/03/04 — round chrome + new-round flow rendered under the clock/Dynamic Island → safe-area insets folded into the scorecard header, both entry-step wrappers, and the course-picker close control.
- F-ORIENT-01 — landscape declared but never audited → iPhone locked portrait-only (Info.plist), per plan §11 "restrict intentionally".
- F-ICON-01 — flat single-PNG icon → Dark + Tinted variants added (light mark untouched); compiled Assets.car verified to carry `UIAppearanceDark` + `ISAppearanceTintable`. Owner visual approval pending (§64).
- Build bumped 2.0 (8) → 2.0 (9).
- Tab-bar taps now fire the selection haptic per the feedback grammar (§19); primitives already carried light-impact (Button) and selection (Segmented) — plan §3 confirmed, no second haptic system created.

**P1 — remaining, owner-gated (morning):**
- Deploy the web-layer fixes to production (the shell renders the deployed site — the safe-area fixes are invisible to the binary until then), then re-verify in the simulator before archiving.
- Verify/answer the new age-rating questionnaire in App Store Connect.
- Sign into Xcode (Settings → Accounts) so the archive can be provisioned — Release device compile is already clean with signing disabled.

**P2 — deferred deliberately (multi-day, §62/§77: core before ecosystem; defer over dangerous bridge):**
Live Activity/Dynamic Island for active rounds (top candidate, needs extension target + secure native auth design), App Intents/App Shortcuts, home-screen quick actions, notification categories/actions implementation, Core Haptics signature plugin, dark-mode auth surface (currently intentionally light — ThemeApplier mounts only in the dashboard layout), native pull-to-refresh, badge bridge, F-BRAND-01 (ship-wheel vs golf-ball-wheel mark), Rounds-page "Improving" pills vs "Declining" trend chip consistency.

**P3:** tee-step vertical centering on tall phones (m-auto by design), CoachHelm sub-nav clipped last tab affordance.

## 6. Phases executed tonight (plan §77)

- **Phase A (native foundation):** DONE — toolchain truth, portrait lock, icon variants, build 9, privacy-manifest posture confirmed, Release compile clean.
- **Phase B (interaction system):** DONE for scope — safe-area chrome fixes, haptic grammar verified at primitives, tab selection haptic; sheets/keyboard audited (Sheet.tsx mature per inventory; no changes needed tonight).
- **Phase C (core golf UX):** VALIDATED — hands-on flagship flow walkthrough found the durability stack, honest save states, and form logic strong; no product-logic changes made (deliberately — §85).
- **Phase D (ecosystem):** DEFERRED with rationale (see P2).
- **Phase E (accessibility/perf):** PARTIAL — no regressions introduced; full VoiceOver/Dynamic-Type pass listed in the physical-device checklist.
- **Phase F (App Store):** package assembled — see `ios/appstore/RELEASE_CANDIDATE_2.0-9.md`.

## 7. Release readiness

See `ios/appstore/RELEASE_CANDIDATE_2.0-9.md` for the §88 release-candidate report, the morning runbook (exact owner steps), and the physical-device checklist (§13/§71/§72).

## Constraints honored tonight

- No App Store upload / Submit / production deploy — owner-only (§89).
- Credentials are never typed by the agent; authed-surface simulator QA needs
  the owner to log in once on the simulator panel (session persists), or runs
  through the existing Playwright auth harness on the web layer.
- Haptic FEEL approval requires physical iPhone (§13) — a device checklist
  ships with the RC report.
