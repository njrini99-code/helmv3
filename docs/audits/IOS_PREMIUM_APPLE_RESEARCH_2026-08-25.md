# GolfHelm iOS Premium Update — Apple Research Digest

**Research date:** 2026-08-25 · **Toolchain:** Xcode 26.6 (17F113) / iOS 26.5 SDK / Capacitor 8 WKWebView shell · **Target:** App Store submission tonight

Confidence markers used throughout: **[Apple-primary]** = read directly off a developer.apple.com/apple.com page. **[secondary/press]** = TechCrunch/MacRumors/etc., not Apple. **[forum]** = Apple Developer Forums, community-sourced, not documentation. Unmarked = Apple-primary by default.

---

## 1. Submission-critical requirements

Sorted by "would this actually block or fail an upload/review tonight" — not by how alarming it sounds.

### 1.1 Real blockers — check/act on these regardless of code changes

- **Age-rating questionnaire (highest priority — console action, not code).** Apple replaced the 4+/9+/12+/17+ tiers with 4+/9+/13+/16+/18+ and added new required questions (In-app controls, Capabilities, Medical/wellness, Violent themes, plus a **Social Media** question added 2026-07-09). The compliance deadline was **January 31, 2026 — already passed as of today.** A further hard submission-time gate lands September 2026, i.e. imminent. **If GolfHelm's App Store Connect record hasn't answered the updated questionnaire, the submission may be blocked outright, independent of build readiness.** Verify this in App Store Connect before doing anything else tonight. (developer.apple.com/news/?id=ks775ehf; /news/?id=tlur8uvi; /news/upcoming-requirements/?id=07242025a)
  - Explicitly decide (and record the decision) whether GolfHelm/BaseballHelm's team messaging/announcements meet Apple's Social Media capability definition: "the ability to redistribute, amplify, or interact with user-generated content through a social feed or similar discovery method." Private team-scoped messaging most likely does not qualify — but this is a deliberate yes/no, not a default.
- **Privacy manifests (PrivacyInfo.xcprivacy).** Live since May 1, 2024, still an active upload-time gate. Audit **every** bundled Capacitor/Cordova plugin (not just Capacitor core) for Required Reason API usage (File timestamp, System boot time, Disk space, Active keyboard, User defaults APIs — an open/expandable list). A plugin using UserDefaults/file-timestamp APIs without a manifest entry causes an **App Store Connect upload-time rejection**, which surfaces faster than review but is just as blocking tonight. (developer.apple.com/documentation/technotes/tn3183; /news/?id=3d8a9yyh)
- **2.1(a) App Completeness.** Binary must be final, tested on-device, no placeholder content; if the app is login-gated, a working demo account (or Apple-preapproved demo mode) must be supplied with the backend live. (developer.apple.com/app-store/review/guidelines/)
- **Screenshots.** Supply at least one **6.9" set**: portrait 1260×2736 px, .png/.jpg, **no alpha channel/transparency**, 1–10 images — this is the one required size; Apple auto-scales smaller buckets from it. Confirm the auto-generated smaller sizes render acceptably during upload rather than assuming. (developer.apple.com/help/app-store-connect/reference/screenshot-specifications)

### 1.2 Conditional blockers — only apply if you touch this specific thing

- **App icon alpha channel (ITMS-90717).** The flattened 1024×1024 App Store icon must be fully opaque. **This only bites if you adopt Icon Composer** for the new layered/Liquid-Glass icon: a documented bug (reported against an Xcode 26 RC, community-confirmed workaround, **not independently re-verified against 26.6**) shows a group with **Blur enabled** whose SVG artwork sits **near the canvas edge** can bake an unwanted alpha channel into the exported PNG even when source layers look opaque. Workaround: disable Blur on any edge-adjacent group. **If you keep the legacy asset-catalog icon instead of migrating to Icon Composer, this specific risk does not apply** — but note the asset catalog cannot produce a Clear-appearance icon at all (see §2). Either way: do a real test archive/upload before the final one and inspect the compiled icon for an alpha channel. (developer.apple.com/forums/thread/795411)
- **SF Symbols in the app icon/logo.** Prohibited by both HIG prose and a binding license clause — Xcode and Apple SDKs Agreement §2.10 "System-Provided Images": you may not "incorporate the System-Provided Images... into app icons, logos or make any other trademark use." Only relevant if that was under consideration. (apple.com/legal/sla/docs/xcode.pdf §2.10; developer.apple.com/design/human-interface-guidelines/sf-symbols)
  - Separately, SF Symbols used inside the WKWebView-rendered web content vs. reused on a plain-browser marketing site sit differently under the license's grant ("developing Applications for Apple-branded products that run on the system") — flag before reusing any SF-Symbols-derived glyphs on the public marketing site.

### 1.3 Review-judgment risk — not a mechanical gate, but a real reviewer call

- **Guideline 4.2.2 ("web clippings").** "Apps shouldn't primarily be... web clippings, content aggregators." This is the single biggest subjective risk for a WKWebView-wrapped Next.js app. Mitigate by explicitly enumerating the native-Swift functionality (push, native auth/biometrics, camera, haptics, any Live Activity/widget work) in the **review notes / What's New**, since Guideline 2.5.6 (WebKit requirement) is satisfied by construction — Capacitor uses WKWebView exclusively, no entitlement needed for a US release. (developer.apple.com/app-store/review/guidelines/)

### 1.4 Verified non-issues — state once, don't spend more time here

- **Xcode/SDK floor:** Since April 28, 2026, uploads must use Xcode 26+/an *OS 26 SDK. **Xcode 26.6 / iOS 26.5 SDK already clears this** (26.6>26, 26.5>26). This is a build-SDK rule, not a deployment-target rule — the historical iOS 15 deployment target is unaffected and Xcode 26.6 supports it. No action needed. (developer.apple.com/news/upcoming-requirements/; /news/?id=ueeok6yw)
- **Notarization:** Not applicable. "Notarization" in current Apple docs refers exclusively to the EU Digital Markets Act alternative-distribution pathway. A standard App Store Connect submission (which this is) has no separate notarization step — don't budget time for it. (developer.apple.com/support/dma-and-apps-in-the-eu/)
- **Accessibility Nutrition Labels:** New, but currently **voluntary** (no published mandatory date). The safe default for a same-night ship is to **publish the build without declaring any of the 9 nutrition-label features**, and only declare later after a real end-to-end walkthrough per feature with the actual assistive tech on — declaring a feature you haven't verified is an App Store Guideline 2.3 (accurate metadata) risk. (developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)
- **TestFlight for tonight:** Internal testing (own team, ≤100 members) needs **no Beta App Review** — fastest path to get a build in hands tonight. External testing's first build **does** require Beta App Review with no published SLA — don't rely on it if you need testers tonight. (developer.apple.com/testflight/)

---

## 2. Design guidance — imperative bullets

### Liquid Glass / materials
- **Never simulate Liquid Glass inside WKWebView content.** Apple's own rule: "Don't use Liquid Glass in the content layer." A WKWebView's rendered page **is** the content layer by Apple's definition — no backdrop-filter tricks to mimic system glass, and especially not the private/undocumented `-apple-visual-effect` WebKit CSS property some devs surfaced **[secondary/unverified — private API, App Store risk, do not use]**. (developer.apple.com/design/human-interface-guidelines/materials)
- Put all Liquid Glass adoption in **native chrome surrounding the WebView**: standard, unmodified UIKit tab bar / nav bar / toolbar / sheets pick up Liquid Glass automatically on iOS 26+ — zero custom code, lowest-risk path tonight.
- If you add any bespoke native element (custom FAB, native search field, custom bottom bar), apply glass via system button styles (`glass`/`glassProminent`) or a single `glassEffect(_:in:)` **sparingly on one element**; wrap multiple custom glass shapes together in a `GlassEffectContainer` for correct morphing.
- If a custom bar sits above scrolling WKWebView content, register it for the scroll-edge effect via `safeAreaBar(...)` — otherwise contrast against arbitrary web content may suffer.
- **Sanctioned escape hatch:** `UIDesignRequiresCompatibility` Info.plist key freezes the pre-Liquid-Glass UIKit appearance. A legitimate, explicit choice if there's no time to validate new chrome tonight — treat it as a documented decision, not a silent default. (developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- **Regenerate the app icon via Icon Composer** for the 6-variant set (Default/Dark/Clear Light/Clear Dark/Tinted Light/Tinted Dark) — the legacy asset catalog only supports 3 (Any/Dark/Tinted) and **cannot produce Clear at all**. Icon Composer's Refraction control is settable now but **inert on-device pre-iOS 27** — set it for forward-compat, don't QA for a visual difference. (developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer)
- Use **SF Symbols 7** (bundled with this Xcode/iOS generation) — not SF Symbols 8, which is iOS-27-beta-only (see §4).

### Motion
- Motion must be purposeful and brief; never the sole channel for essential info (pair with haptics/text); never uncancelable, especially on repeated interactions. (developer.apple.com/design/human-interface-guidelines/motion)
- `@media (prefers-reduced-motion: reduce)` / `@media (prefers-reduced-transparency: reduce)` should work automatically inside WKWebView since WebKit surfaces these as standard CSS media features tied to the same system toggles **[search-corroborated, not confirmed via a directly-quoted developer.apple.com page in this research — verify on a real device before relying on it for any accessibility claim]**.
- Any custom transition/skeleton/pull-to-refresh replacement must be re-tested with Reduce Motion, Reduce Transparency, Increase Contrast, and the Liquid Glass Tinted/Clear toggle all on — only genuine system components auto-adapt; custom code does not.

### Haptics
- Use the three standard `UIFeedbackGenerator` categories per their **documented meanings** — selection (value changes), impact (light/medium/heavy/rigid/soft — collision-weight semantics), notification (success/warning/error only, no neutral case) — don't repurpose one to mean something else. (developer.apple.com/design/human-interface-guidelines/playing-haptics)
- Call `prepare()` on an earlier signal (e.g. JS `pointerdown`), not immediately before the trigger — "calling prepare() and then immediately triggering feedback... does not improve latency." Given the JS→native bridge round-trip this app uses, design the two calls around genuinely separate events.
- **Never gate a haptic call on device type or foreground/background state** — call it on the correct semantic event every time; the system silently no-ops when it can't honor the request (battery, Haptics setting off, unsupported hardware).
- Keep app (non-game) haptics **short and event-bound**, not continuous/sustained; make haptics optional and keep the app fully usable with them off.
- If using Core Haptics for a bespoke pattern (e.g. round-saved), set `resetHandler`/`stoppedHandler` **before** the first `start()` call, and exhaustively handle all 7 `CHHapticEngine.StoppedReason` cases, not just the 4 in Apple's abbreviated sample.
- Classic generators (Impact/Selection/Notification, bare initializers) and Core Haptics are all iOS 10+/13+ — **safe unconditionally against the historical iOS 15 floor.** The newer view-attached `init(view:)` and location-aware trigger methods (`impactOccurred(at:)` etc.) are **iOS 17.5+ and must be `@available`-guarded** if iOS 15 stays the floor.

### Accessibility
- **Dynamic Type does NOT propagate into WKWebView-rendered HTML/CSS automatically** — this is the single most important WKWebView-specific gap. Bridge it natively: read `UIContentSizeCategory` (and observe its `didChangeNotification`) in Swift, inject the value into the page via CSS custom property/JS global so the web app's own responsive type scale can react. Do not rely on `-apple-system-body` CSS tricks — reported inconsistent on-device. **[forum-sourced pattern, not Apple documentation — needs engineering validation]**
- Test VoiceOver's **initial focus target** on a real device — forum reports describe focus landing on a hidden/phantom text field inside WKWebView on Capacitor/Ionic apps as a known failure mode. **Never set `isAccessibilityElement = true` on the root WKWebView** — it collapses the entire DOM into one opaque VoiceOver stop; leave WKWebView's default DOM/ARIA-derived accessibility tree intact. VoiceOver compliance here is overwhelmingly a Next.js/ARIA problem (labels, roles, focus order, `aria-modal` + focus trap, live regions for toasts), not a Swift-side API problem.
- Apply the 44×44pt minimum hit-target rule to any **native** chrome Capacitor adds (splash, native sheets/alerts) — distinct from web tap-target sizing, check both. **[HIG page body could not be directly re-fetched this session; corroborated by search index and by the existence of the `.hitRegion` XCUITest audit type, treat as high-confidence not independently re-verified]**
- Run `XCUIApplication.performAccessibilityAudit()` against key screens as a CI/regression check — fully supported on this toolchain — but remember Apple's own caveat: a clean audit is necessary, not sufficient; pair with a manual VoiceOver walkthrough before any nutrition-label declaration.

---

## 3. Ecosystem opportunities — ranked by effort, minimum requirements, realistic scope for tonight

**1. Home Screen quick actions (`UIApplicationShortcutItem`) — iOS 13+, ship tonight, no extension.**
Static via `Info.plist` `UIApplicationShortcutItems` array, or dynamic via `UIApplication.shared.shortcutItems` (set in `sceneWillResignActive`). Handle cold-launch via `connectionOptions.shortcutItem`, warm via `windowScene(_:performActionFor:completionHandler:)`. System caps displayed shortcuts to what fits on-screen (~4-6) — no self-imposed limit needed. Lowest-risk, highest-certainty win regardless of the historical iOS 15 floor. (developer.apple.com/documentation/uikit/uiapplicationshortcutitem)

**2. App Shortcuts (`AppShortcutsProvider`) — iOS 16+, deep-link only, no bespoke intent logic needed.**
One type conforming to `AppShortcutsProvider`; **2-5 recommended, 10 hard ceiling** per Apple's own sample-code guidance (the reference docs state no cap, but the accompanying sample article gives this number explicitly). Each `AppShortcut` needs the `\(.applicationName)` token in its phrase. `perform()` bodies should just deep-link into existing web routes via a custom URL scheme/universal link the Capacitor App plugin's `appUrlOpen` listener intercepts — don't reimplement business logic natively. Requires `@available(iOS 16.0, *)`. (developer.apple.com/documentation/appintents/app-shortcuts)

**3. Live Activity (round-in-progress) — iOS 16.1+, requires a NEW Widget Extension target, moderate effort.**
Architecture: one Widget Extension ("Include Live Activity"); a shared `RoundAttributes: ActivityAttributes` (static: course/player) + nested `ContentState` (dynamic: hole/score/thru) compiled into **both** targets; SwiftUI views for Lock Screen + all 4 Dynamic Island regions (compact/minimal/expanded) live only in the extension; `Activity.request/update/end` calls only in the **main app process**, reached via a thin native Capacitor plugin (`startRoundActivity()`/`updateRoundActivity()`/`endRoundActivity()`) — the web JS layer never touches ActivityKit directly.
Hard limits: **4 KB combined static+dynamic payload cap** (validate before shipping — over-cap silently fails to start); image assets must not exceed the presentation size they render in. **8-hour active lifetime**, then up to **4 more hours** on Lock Screen before auto-dismissal (HIG recommends a custom 15-30 min dismissal window via `end(_:dismissalPolicy:)`, not the full default).
Because a round spans hours with the phone likely locked/backgrounded, prefer the **push-token update path** over local foreground `update()` — the token arrives asynchronously via `pushTokenUpdates`, not synchronously after `request()`; forward it to the existing Supabase backend and drive updates with `apns-priority: 5` (doesn't count against the hourly push budget), reserving `priority: 10` + an `AlertConfiguration` for events worth surfacing (eagle, round complete). `NSSupportsLiveActivitiesFrequentUpdates` only needed for genuinely shot-by-shot cadence — likely unnecessary for per-hole updates. Requires `@available(iOS 16.1, *)` guards throughout given the historical iOS 15 floor. (developer.apple.com/documentation/activitykit; /documentation/activitykit/displaying-live-data-with-live-activities)

**4. CoreSpotlight indexing (player/round/roster content) — iOS 18+ for the `IndexedEntity` bridge (or manual `CSSearchableItem` back to earlier OSes), moderate effort, real privacy requirement.**
Indexing is entirely **on-device, private, never synced or shared with Apple**. Given this app's team/roster/RLS model, any indexed content must use a protection class no weaker than `.completeUntilFirstUserAuthentication`, and must be explicitly purged on sign-out/account-switch via `deleteAllSearchableItems` or scoped `deleteSearchableItems(withDomainIdentifiers:)` per team/user — this directly parallels the repo's own recent "recap persist crosses `helm_private` as a definer boundary" fix; the native index must not become an unguarded side-channel around existing RLS discipline. (developer.apple.com/documentation/corespotlight; TN2416)

**5. Controls / Action Button integration — iOS 18+, requires a second native extension, defer.**
Real first-class Action Button access needs the WidgetKit **Controls** framework (`ControlWidget` in a `WidgetBundle`), a materially larger native build/signing lift than anything above, and the app cannot pre-select itself as the default Action Button behavior regardless — users assign it from Settings. App Shortcuts already feed the Action Button's "Shortcut" option for free once App Shortcuts exist. **Recommendation: ship #1-#2 tonight, defer Controls.** (developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system)

---

## 4. Changed vs. pre-2026 assumptions

### Genuinely new since 2025/2026 — corrects stale pre-2026 knowledge
- **Liquid Glass itself** is new since iOS/iPadOS 26 (WWDC 2025, shipped Sept 2025) — supersedes any "frosted glass"/iOS-18-era translucency assumptions. Apple tuned it further after legibility backlash: iOS 26.1 added a Clear/Tinted toggle, iOS 26.2 extended it to the Lock Screen clock **[secondary/press, not Apple docs, though widely corroborated]**.
- **App icon appearance variants** expanded 3 (Any/Light, Dark, Tinted — iOS 18) → **6** (adds Clear Light, Clear Dark) with iOS 26 — only reachable via the new Icon Composer tool, not the legacy asset catalog.
- **`UIApplication.applicationIconBadgeNumber`** deprecated iOS 17 → use `UNUserNotificationCenter.setBadgeCount(_:withCompletionHandler:)` (iOS 16+).
- **`UNNotificationPresentationOptions.alert`** deprecated iOS 14 → use `.banner` + `.list`. Old Capacitor/Ionic AppDelegate boilerplate commonly still passes the deprecated case.
- **`UNAuthorizationOptions.timeSensitive`** deprecated in the *same* release it was introduced (iOS 15) — current guidance is to declare the `com.apple.developer.usernotifications.time-sensitive` **entitlement** (self-service, can be added tonight) rather than pass the option.
- **`summaryArgument`/`summaryArgumentCount`** silently ignored by the system since iOS 15 on every platform except macOS, while `categorySummaryFormat` (which consumes them) is **not** marked deprecated — a real documentation inconsistency; don't build custom group-summary text around it on iOS.
- **Location-aware haptics** (`impactOccurred(at:)`, `selectionChanged(at:)`, `notificationOccurred(_:at:)`, `init(view:)`) are iOS 17.5+ and now the docs' primary example — but the plain, pre-17.5 initializers still work fine (deprecated ≠ unavailable) and are what an iOS-15-floor app should keep using without an availability guard.
- **Age-rating tiers** overhauled 4+/9+/12+/17+ → 4+/9+/13+/16+/18+ (2026-07-24), plus a new Social Media question (2026-07-09) — both post-dates most pre-2026 App Store checklists.
- **Accessibility Nutrition Labels** (9 declarable features, voluntary) are an entirely new App Store Connect surface not present in pre-2026 knowledge.
- **Xcode 26+/iOS 26 SDK upload requirement** took effect April 28, 2026 — an annual bump, but squarely inside anyone's "is my toolchain current" assumption.

### iOS 27 beta-only — NOT available on this toolchain, a distinct trap from stale-knowledge
This is the failure mode most likely for an engineer who read *current* blog/WWDC26 coverage and assumed it applies to tonight's build. It doesn't — the toolchain is Xcode 26.6/iOS 26.5 SDK, one generation behind:
- `isDynamicIslandLimitedInWidth` and Dynamic Island landscape support (WWDC26, iOS 27-tagged, marked **Beta** on its live doc page).
- **SF Symbols 8** (beta, iOS 27-tagged) — this toolchain ships **SF Symbols 7**; don't pull glyph names/features from SF Symbols 8 beta coverage.
- Icon Composer **Refraction** — a real, settable control today, but Apple's own current docs state it "has no visible effect" on any OS below 27; specular (Inside/Outside) is what actually renders on iOS 26.
- The entire WWDC26 App Intents overhaul — App Schema domains, onscreen awareness (`.appEntityIdentifier`), `ValueRepresentation`, `RelevantEntities`, `EntityCollection<T>`, `SyncableEntity`, `@UnionValue`, `LongRunningIntent`+`CancellableIntent`, `ExecutionTargets` — explicitly scoped by Apple to "the 2027 releases." Availability on Xcode 26.6 was **not verified either way**; treat as absent unless confirmed against actual SDK headers.
- Apple's own Design Resources page **already** only distributes an "iOS 27 and iPadOS 27" UI kit — one generation ahead of this SDK. Treat the live iOS 26.5 simulator/device as ground truth over any downloaded kit.
- Both the ActivityKit and WidgetKit "updates" changelog index pages stop at June 2025 entries and have not been refreshed for WWDC26 additions — a real documentation-lag gap, not evidence those additions don't exist.

**Net governing rule for tonight:** every native API used must be verifiably present in iOS 26.5 SDK headers, not merely "current" per 2026 press/WWDC26 coverage — and every native API above the historical iOS 15 floor needs an explicit `@available` guard (summary: haptics location-aware methods 17.5+, `setBadgeCount` 16+, ActivityKit 16.1+/push-to-start 17.2+/channels 18+, `IndexedEntity`+Controls 18+).

---

## 5. Source list

### Apple-primary — Human Interface Guidelines & Liquid Glass
- <https://developer.apple.com/design/human-interface-guidelines/materials>
- <https://developer.apple.com/design/human-interface-guidelines/motion>
- <https://developer.apple.com/design/human-interface-guidelines/design-principles>
- <https://developer.apple.com/design/human-interface-guidelines/>
- <https://developer.apple.com/design/human-interface-guidelines/designing-for-ios>
- <https://developer.apple.com/documentation/technologyoverviews/liquid-glass>
- <https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass>
- <https://developer.apple.com/design/resources/>
- <https://developer.apple.com/videos/play/wwdc2025/219/> (Meet Liquid Glass)
- <https://developer.apple.com/videos/play/wwdc2025/356/> (Get to know the new design system)
- <https://developer.apple.com/news/?id=v8a3aetj>

### Apple-primary — App icons, Icon Composer, SF Symbols
- <https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer>
- <https://developer.apple.com/design/human-interface-guidelines/app-icons>
- <https://developer.apple.com/design/human-interface-guidelines/sf-symbols>
- <https://developer.apple.com/documentation/Xcode/configuring-your-app-icon>
- <https://developer.apple.com/icon-composer/>
- <https://developer.apple.com/sf-symbols/>
- <https://www.apple.com/legal/sla/docs/xcode.pdf> (§2.10 System-Provided Images)
- <https://developer.apple.com/support/terms/>

### Apple-primary — Haptics
- <https://developer.apple.com/design/human-interface-guidelines/playing-haptics>
- <https://developer.apple.com/documentation/uikit/uifeedbackgenerator> (+ /prepare(), /init(view:))
- <https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator> (+ /feedbackstyle, /impactoccurred(at:), /impactoccurred(intensity:))
- <https://developer.apple.com/documentation/uikit/uiselectionfeedbackgenerator>
- <https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator> (+ /feedbacktype)
- <https://developer.apple.com/documentation/uikit/uicanvasfeedbackgenerator>
- <https://developer.apple.com/documentation/applepencil/playing-haptic-feedback-in-your-app>
- <https://developer.apple.com/documentation/corehaptics> (+ /chhapticengine, /preparing-your-app-to-play-haptics, /playing-a-single-tap-haptic-pattern, /chhapticevent, /chhapticevent/eventtype, /chhapticevent/parameterid, /chhapticengine/stoppedreason, /chhapticdevicecapability)

### Apple-primary — Notifications
- <https://developer.apple.com/documentation/usernotifications/unnotificationcategory> (+ /unnotificationcategoryoptions, /categorysummaryformat)
- <https://developer.apple.com/documentation/usernotifications/unnotificationaction> (+ /unnotificationactionoptions)
- <https://developer.apple.com/documentation/usernotifications/untextinputnotificationaction>
- <https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types>
- <https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel> (+ /critical, /timesensitive)
- <https://developer.apple.com/documentation/usernotifications/unauthorizationoptions> (+ /criticalalert, /timesensitive, /provisional)
- <https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts>
- <https://developer.apple.com/documentation/usernotifications/unnotificationsettings/timesensitivesetting>
- <https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications>
- <https://developer.apple.com/documentation/usernotifications/unmutablenotificationcontent/threadidentifier> (+ /summaryargument)
- <https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/setbadgecount(_:withcompletionhandler:)>
- <https://developer.apple.com/documentation/uikit/uiapplication/applicationiconbadgenumber>
- <https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate/usernotificationcenter(_:willpresent:withcompletionhandler:)> (+ /didreceive:)
- <https://developer.apple.com/documentation/usernotifications/unnotificationpresentationoptions> (+ /banner, /alert)
- <https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/>

### Apple-primary — ActivityKit / WidgetKit / Dynamic Island
- <https://developer.apple.com/documentation/activitykit> (+ /activity, /pushtype, /pushtype/channel(_:), /activity/pushtostarttokenupdates, /activity/request(...), /activitystyle, /activitystyle/transient, /activityauthorizationinfo)
- <https://developer.apple.com/documentation/updates/activitykit>
- <https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications>
- <https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities>
- <https://developer.apple.com/documentation/bundleresources/information-property-list/nssupportsliveactivities> (+ /nssupportsliveactivitiesfrequentupdates)
- <https://developer.apple.com/documentation/widgetkit/activityfamily>
- <https://developer.apple.com/documentation/swiftui/environmentvalues/isdynamicislandlimitedinwidth>
- <https://developer.apple.com/documentation/widgetkit/dynamicisland>
- <https://developer.apple.com/design/human-interface-guidelines/live-activities>
- <https://developer.apple.com/documentation/widgetkit> (+ /updates/widgetkit, /creating-a-widget-extension, /creating-controls-to-perform-actions-across-the-system)
- <https://developer.apple.com/videos/play/wwdc2026/223/>
- <https://developer.apple.com/videos/play/wwdc2023/10185/>
- <https://developer.apple.com/videos/play/wwdc2024/10069/>
- <https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html>

### Apple-primary — App Intents / Shortcuts / Spotlight / Quick Actions
- <https://developer.apple.com/documentation/appintents/app-shortcuts> (+ /appshortcutsprovider, /appshortcut, /appshortcutsbuilder)
- <https://developer.apple.com/documentation/appintents/getting-started-with-the-app-intents-framework>
- <https://developer.apple.com/documentation/AppIntents/AcceleratingAppInteractionsWithAppIntents>
- <https://developer.apple.com/documentation/appintents/indexedentity>
- <https://developer.apple.com/documentation/corespotlight> (+ /cssearchableindex/init(name:protectionclass:), /deleteallsearchableitems, /1620351-deletesearchableitems)
- <https://developer.apple.com/library/archive/technotes/tn2416/_index.html>
- <https://developer.apple.com/documentation/uikit/uiapplicationshortcutitem>
- <https://developer.apple.com/documentation/UIKit/add-home-screen-quick-actions>
- <https://developer.apple.com/design/human-interface-guidelines/home-screen-quick-actions>
- <https://developer.apple.com/videos/play/wwdc2024/10157/>
- <https://developer.apple.com/videos/play/wwdc2025/275/> , /260/
- <https://developer.apple.com/videos/play/wwdc2026/345/> , /240/ , /343/
- <https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/>
- <https://developer.apple.com/documentation/AppIntents/app-schema-domains>
- <https://developer.apple.com/documentation/AppIntents/making-app-entities-available-in-spotlight>

### Apple-primary — Accessibility
- <https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels> (+ /manage-accessibility-nutrition-labels, /voiceover-accessibility-evaluation-criteria, /reduced-motion-evaluation-criteria, /sufficient-contrast-evaluation-criteria, /larger-text-accessibility-evaluation-criteria, /dark-interface-evaluation-criteria, /voice-control-evaluation-criteria, /audio-descriptions-evaluation-criteria)
- <https://developer.apple.com/videos/play/wwdc2025/224/>
- <https://developer.apple.com/videos/play/wwdc2023/10035/>
- <https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app> (+ /accessibility-inspector, /testing-system-accessibility-features-in-your-app)
- <https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/performaccessibilityaudit(for:_:)> (+ /xcuiaccessibilityaudittype)
- <https://developer.apple.com/design/human-interface-guidelines/accessibility> (+ /foundations/accessibility)
- <https://developer.apple.com/videos/play/wwdc2024/10074/>
- <https://developer.apple.com/documentation/uikit/uifontmetrics> (+ /scaling-fonts-automatically, /supporting-voiceover-in-your-app)
- <https://developer.apple.com/documentation/webkit/wkwebview> (+ /wkwebviewconfiguration)
- <https://developer.apple.com/videos/play/wwdc2022/10153/>

### Apple-primary — App Store submission / policy
- <https://developer.apple.com/news/upcoming-requirements/> (+ /news/?id=ueeok6yw)
- <https://developer.apple.com/app-store/review/guidelines/>
- <https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest>
- <https://developer.apple.com/news/?id=3d8a9yyh>
- <https://developer.apple.com/app-store/app-privacy-details/>
- <https://developer.apple.com/news/?id=ks775ehf>
- <https://developer.apple.com/news/?id=tlur8uvi>
- <https://developer.apple.com/news/upcoming-requirements/?id=07242025a>
- <https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications>
- <https://developer.apple.com/testflight/>
- <https://developer.apple.com/support/dma-and-apps-in-the-eu/>
- <https://developer.apple.com/support/xcode/>

### Secondary / press — NOT Apple documentation, corroborating only
- <https://techcrunch.com/2025/12/12/with-ios-26-2-apple-lets-you-roll-back-liquid-glass-again-this-time-on-the-lock-screen/>
- <https://www.macrumors.com/2026/06/08/apple-announces-liquid-glass-improvements/>
- <https://www.tomsguide.com/phones/iphones/ios-26-1-lets-you-adjust-liquid-glass-transparency-on-your-iphone-heres-how-to-do-it>
- <https://macdailynews.com/2026/07/23/crank-up-apples-liquid-glass-to-maximum-transparency-and-youll-enjoy-every-warped-second/>

### Community / forum — flagged, not documentation, do not treat as prescriptive
- <https://biggo.com/news/202509151916_Apple_Hidden_CSS_Property_Liquid_Glass_WebViews> — private CSS property, App Store risk, **do not use**
- <https://alastair.is/apple-has-a-private-css-property-to-add-liquid-glass-effects-to-web-content/> — same, unverified/off-limits
- <https://developer.apple.com/forums/thread/739523> — SF Symbols license wording (secondary confirmation of SLA §2.10)
- <https://developer.apple.com/forums/thread/795411> — Icon Composer alpha-channel bug (ITMS-90717 root cause)
- <https://developer.apple.com/forums/thread/110551> , /105571 , /128293 , /651052 , /674454 — WKWebView Dynamic Type / VoiceOver focus issues (Apple-hosted forum, community posts, not prescriptive docs)
