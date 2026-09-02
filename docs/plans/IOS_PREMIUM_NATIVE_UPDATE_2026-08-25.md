# HELM iOS Premium Native Experience + App Store Update — Master Plan

> **Saved to repo memory 2026-08-25 (evening) by the overnight commander session.**
> This is the owner's verbatim master prompt. Any session resuming this work reads
> this file top to bottom and obeys it. Execution state lives in
> `docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md` (produced by Phase 0/5 below)
> and on branch `feat/ios-premium-native-update`.
>
> Owner directives attached at handoff:
> - Work happens overnight 2026-08-25 → 2026-08-26; owner wants to be able to
>   submit in the morning. **Upload/submit itself is owner-only (§89).**
> - Workers run on Sonnet; the commander session plans, orchestrates, verifies.
> - Research first, against official Apple sources (§4), record the research date.
> - The store last saw v1.7; version 2.0 (build 8) is prepared but NOT yet
>   submitted (see `ios/appstore/SUBMISSION.md`). Verify App Store Connect before
>   choosing final version/build.

────────

Product: Helm Sports Labs / GolfHelm
Canonical repo: /Users/ricknini/Downloads/helmv3
Architecture: Next.js/React + Capacitor 8 iOS shell + selective native Swift/UIKit/SwiftUI
Mission: Turn the current iPhone app into a premium Apple-quality product and prepare a safe App Store update without rewriting GolfHelm from scratch.

────────

## 0. THE STANDARD

Claude,

This is not a cosmetic pass.

This is a full iOS product-quality upgrade covering native behavior, UI/UX, haptics, motion, notifications, loading, accessibility, Apple-platform integrations, performance, TestFlight, and App Store readiness.

The final product should feel:

> **Handcrafted, tactile, fast, quiet, precise, forgiving, and unmistakably at home on iPhone.**

It must not feel like:

> **a responsive website placed inside a WKWebView and submitted to the App Store.**

Preserve the current Next.js + Capacitor architecture. Do not rewrite the whole product in SwiftUI. However, when a native Apple technology materially improves the experience, use native Swift/UIKit/SwiftUI instead of forcing the feature through the web layer.

Good selective-native candidates include:

• Core Haptics
• ActivityKit / Live Activities / Dynamic Island
• WidgetKit
• App Intents / Siri / App Shortcuts / Spotlight
• Home Screen quick actions
• native notification categories/actions
• app badge handling
• status bar / lifecycle behavior
• native share surfaces
• native accessibility
• Apple icon tooling
• carefully chosen gesture/refresh integrations

Native code must earn its maintenance cost.

────────

## 1. PREMIUM RESTRAINT

Nick wants tactile feedback, visual haptics, subtle vibration, polished motion, and Apple-native feeling.

Do not translate that into haptic feedback on every tap.

Apple-quality sensory design means:

• the source of feedback is obvious,
• the haptic matches the importance of the action,
• visual response and tactile response occur at the same causal moment,
• motion serves comprehension,
• sound is rare,
• frequent interactions are light,
• rare important moments may have a signature,
• feedback never becomes annoying after repeated use.

If the user notices the vibration system more than the task, it is too much.

────────

## 2. CURRENT KNOWN APP STATE — VERIFY EVERYTHING

Do not assume old audits are current.

Read current source first.

Known current/historical state to verify:

```text
Bundle ID: com.helmsportslabs.golfhelm
Display name: Helm Sports Labs
Capacitor: 8.x
Current Xcode project marketing version: historically 2.0
Current project build: historically 8
Deployment target: historically iOS 15
Target device family: historically iPhone only (TARGETED_DEVICE_FAMILY = 1)
```

Do not choose the next App Store version until App Store Connect is checked.

Inspect at minimum:

```text
capacitor.config.ts

ios/App/App/AppDelegate.swift
ios/App/App/SceneDelegate.swift
ios/App/App/GolfBridgeViewController.swift
ios/App/App/Info.plist
ios/App/App/App.entitlements
ios/App/App/PrivacyInfo.xcprivacy
ios/App/App/Base.lproj/Main.storyboard
ios/App/App/Base.lproj/LaunchScreen.storyboard
ios/App/App.xcodeproj/project.pbxproj
ios/App/CapApp-SPM/Package.swift

src/components/providers/CapacitorProvider.tsx
src/lib/utils/capacitor.ts
src/lib/utils/push-registration.ts
src/lib/utils/haptics-pref.ts
src/lib/fairway/haptics.ts
```

Also inventory all current iOS-related code, config, tests, docs, native bridges, and feature flags.

────────

## 3. IMPORTANT: DO NOT REBUILD WHAT ALREADY WORKS

Current code already includes real native-facing work.

### Haptics

src/lib/utils/capacitor.ts already uses @capacitor/haptics, not browser vibration.

It has impact, notification, and selection haptics.

src/lib/fairway/haptics.ts already has a semantic layer with concepts such as:

```text
selection
light
medium
heavy
success
warning
error
commit
reject
threshold
celebrate
```

It also includes throttling, a scrub/selection lifecycle, native guards, and an app-level haptics preference.

Evolve this into the canonical Helm feedback grammar. Do not create a second competing haptic system.

### Push

Current push logic already contains important fixes around:

• APNs/FCM token registration,
• delaying token persistence until an authenticated session exists,
• foreground notifications,
• deep-link navigation,
• safe internal URL validation,
• soft permission prompting.

Preserve these guarantees.

### Theme/status bar

Current code has light/dark/system behavior and native status-bar synchronization.

Any old audit claiming dark mode or status-bar support is absent must be treated as stale until verified.

────────

## 4. OFFICIAL APPLE RESEARCH FIRST

Before deciding implementation details, perform fresh research using official Apple sources.

Re-verify current guidance for:

• Human Interface Guidelines
• Design Principles
• Liquid Glass
• Apple Design Resources
• SF Symbols
• Icon Composer
• Core Haptics
• UIFeedbackGenerator
• UserNotifications
• ActivityKit
• WidgetKit
• App Intents
• Siri / App Shortcuts / Spotlight
• accessibility
• Xcode / Simulator / XCTest
• Instruments / responsiveness
• App Store Review Guidelines
• App Store Connect
• current SDK/upload requirements
• privacy requirements
• age-rating requirements
• accessibility labels

Record the research date.

Do not use blogs when official documentation answers the question.

────────

## 5. CURRENT APP STORE REQUIREMENT

At the time of this handoff, Apple states App Store uploads have required Xcode 26+ and the iOS 26 SDK+ since April 28, 2026.

Verify current requirements again before building the release candidate.

Also verify the current:

• age-rating questionnaire,
• privacy requirements,
• accessibility feature declarations,
• screenshot requirements,
• App Store Connect agreements,
• currently accepted SDK.

Do not assume "Xcode build succeeded" means "App Store submission ready."

────────

## 6. APP REVIEW GUIDELINE 4.2 IS PART OF THE DESIGN

Apple's current Minimum Functionality guideline says apps need functionality, content, and UI that elevate them beyond a repackaged website.

Helm uses WKWebView, so this matters.

Do not respond by adding meaningless native gimmicks.

Instead make the app genuinely integrated with iOS:

• tactile interaction,
• push notifications,
• deep links,
• native actions,
• native system appearance,
• Live Activities if valuable,
• widgets/intents if valuable,
• Spotlight/Shortcuts if valuable,
• native sharing,
• native app lifecycle,
• permissions,
• accessibility,
• offline/recovery,
• notifications/actions,
• platform-aware launch and navigation.

Document this value clearly in App Review notes.

────────

## 7. ARCHITECTURE RULE

Core business logic stays in the web app.

Use native extensions/plugins mostly for Apple platform capabilities.

Preferred direction:

```text
Next.js GolfHelm
  ├─ product/business logic
  ├─ Golf workflows
  ├─ CoachHelm
  ├─ role logic
  └─ DB interaction

Capacitor bridge
  ├─ standard plugins
  └─ narrowly scoped Helm native plugins

Native iOS
  ├─ Core Haptics signature patterns
  ├─ notification categories/actions
  ├─ Live Activity
  ├─ widget
  ├─ App Intents
  ├─ Spotlight / quick actions
  ├─ lifecycle
  └─ Apple-specific rendering/integration
```

Do not duplicate product logic in TypeScript and Swift.

Native UI should project state from the product, not become a second backend.

────────

## 8. GIT SAFETY

Do this only after the HELM_FRESH_START convergence has made repository state understandable.

Desired normal state:

```text
/Users/ricknini/Downloads/helmv3
main
clean
```

If clean main, create one intentional task branch:

```text
feat/ios-premium-native-update
```

Do not create extra worktrees without a concrete reason.

If the canonical checkout is dirty on an existing task branch, do not switch away and strand work.

Do not upload to App Store, deploy production, or mutate production data without explicit owner approval.

────────

## 9. PHASE 0 — CURRENT NATIVE INVENTORY

Create/update one active audit:

```text
docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md
```

Inventory:

• macOS
• Xcode
• SDK
• iOS deployment target
• app version/build
• bundle ID
• signing team
• target family
• Swift version
• SPM
• Capacitor
• native plugins
• custom Swift code
• entitlements
• capabilities
• app icon
• splash/launch
• status bar
• lifecycle
• safe areas
• haptics
• push
• local notifications
• badges
• universal links
• keyboard
• share/browser/network
• theme
• privacy manifest
• orientation
• TestFlight/App Store state if accessible

No large redesign before this exists.

────────

## 10. PHASE 1 — USE THE iOS SIMULATOR YOURSELF

Do not audit the app only from source.

Build it and use it.

Use:

• Claude's simulator capability
• Xcode
• xcodebuild
• xcrun simctl
• screenshots
• screen recordings
• Console/device logs
• Accessibility Inspector
• XCTest/XCUITest where useful

Before assuming commands:

```bash
xcrun simctl help
xcodebuild -help
```

Discover current simulator destinations.

────────

## 11. DEVICE MATRIX

Audit at minimum:

### Small iPhone class

Use smallest useful simulator supported by installed Xcode/runtime.

Look for:

• clipped labels
• bad sheet heights
• keyboard overlap
• bottom-nav issues
• horizontal overflow
• tiny targets

### Current Dynamic Island iPhone

This is primary visual QA.

Test:

• top safe area
• status bar
• headers
• bottom Home Indicator
• sheets
• active round
• navigation

### Large Pro Max class

Look for:

• excessive empty space
• stretched cards
• poor information density
• bad sheet width

### Landscape

The app historically declares iPhone landscape support.

Either make it excellent or intentionally restrict it.

Do not ship a broken supported orientation.

### iPad

The Xcode target has historically been iPhone-only.

Do not casually expand to iPad.

Decide explicitly whether iPhone-only remains correct.

────────

## 12. SIMULATOR AUTOMATION

Where supported, use simctl for:

• install
• launch
• terminate
• relaunch
• cold start
• screenshots
• deep links
• universal links
• appearance
• permission resets
• notification payloads
• logs

Use simulator push support where appropriate to test notification routing.

Use simulator deep links to test cold/warm navigation.

────────

## 13. HAPTICS REQUIRE REAL IPHONE APPROVAL

Simulator cannot tell you whether a haptic feels good.

Use simulator for integration.

Use physical iPhone for sensory design.

Create a physical-device QA checklist for Nick if Claude cannot physically evaluate the haptic.

No haptic system is "approved" until tested on Taptic Engine hardware.

────────

## 14. CREATE A VISUAL BASELINE ATLAS

Before major visual changes, capture screenshots of important states.

Player:

• login
• home
• start round
• active round
• shot tracking
• rounds/history
• round review
• stats
• calendar
• messages
• qualifier
• settings

Coach:

• home
• roster
• player detail
• calendar
• stats
• qualifiers
• messages
• CoachHelm
• settings

Global:

• sheet
• dialog
• loading
• skeleton
• empty
• error
• offline
• destructive confirm
• success
• push navigation

Capture light and dark.

────────

## 15. SCREEN QUALITY RUBRIC

Score critical screens 1–5 on:

```text
Hierarchy
Native feel
Touchability
Motion
Haptic fit
Typography
Spacing
Consistency
Safe area
Loading
Empty state
Error state
Keyboard
Accessibility
Dark mode
Performance
```

Critical screens below 4 require a plan.

────────

## 16. LIQUID GLASS — DO NOT TURN EVERYTHING INTO BLUR

Current Apple design uses Liquid Glass primarily as control/navigation material.

Do not imitate it by putting CSS backdrop-filter on every card.

Audit existing glassmorphism aggressively.

Use glass/material primarily for:

• navigation
• tab chrome
• floating controls
• toolbars
• primary control surfaces

Keep content readable and stable.

If blur hurts frame rate or daylight legibility, remove it.

A stable opaque premium surface is better than fake glass with hitches.

────────

## 17. HELM MUST KEEP ITS OWN IDENTITY

Do not make GolfHelm look like a clone of Settings.app.

Preserve:

• warm sports aesthetic
• cream/brand surfaces
• golf identity
• data-forward design
• calm coaching tone
• premium hierarchy

Adopt Apple principles for:

• behavior
• motion
• interaction
• tactile feedback
• system integration
• accessibility

────────

## 18. THE HELM SENSORY FEEDBACK GRAMMAR

Create one canonical semantic feedback layer using the existing haptic architecture.

A developer should request meaning, not motor strength.

Conceptually:

```text
feedback.selection()
feedback.tap()
feedback.confirm()
feedback.commit()
feedback.success()
feedback.warning()
feedback.reject()
feedback.destructive()
feedback.threshold()
feedback.snap()
feedback.milestone()
```

Adapt names to current code.

Each semantic event defines:

```text
visual response
motion
haptic
optional audio
```

────────

## 19. HAPTIC INTENSITY RULES

### No haptic

Use for:

• normal scrolling
• passive content
• loading
• background sync
• every tiny navigation change

### Selection

Use for:

• tabs
• segmented controls
• pickers
• score steps
• filter changes
• slider/chart detents

Feels dry, small, precise.

### Light impact

Use for:

• tactile primary press
• small commit
• expanding an interactive surface
• immediate add action where appropriate

### Medium

Use for:

• meaningful commit
• drag/drop landing
• destructive confirmation
• important save

### Heavy

Rare.

Use only for a genuinely weighty physical-feeling snap/land.

### Success

Only after a real meaningful outcome:

• round successfully submitted
• lineup posted
• qualifier action completed
• major save finished

### Warning/error

Only for meaningful warnings/failures.

Never use error haptic for harmless empty state.

────────

## 20. VISUAL HAPTICS — CRITICAL

Every haptic should have a visual cause.

Examples:

Button

```text
touch down
→ slight visual compression
→ haptic at causal point
→ spring return
```

Tab

```text
indicator begins moving
→ selection detent
→ content settles
```

Score/picker

```text
value crosses detent
→ number changes
→ selection tick
```

Drag reorder

```text
item lifts
→ slot crossing gives selection ticks
→ drop gets landing impact
```

Sheet snap

```text
sheet tracks finger
→ reaches snap point
→ tactile snap
→ spring settles
```

Round submit

```text
commit starts
→ committed loading state
→ DB confirms
→ success haptic + success visual
→ transition
```

Do not make vibration arrive detached from the visual change.

────────

## 21. MOTION SYSTEM

Create a small tokenized motion grammar for:

• press
• control state
• reveal
• sheet
• modal
• navigation
• insertion/removal
• success
• error

Motion must be short and purposeful.

Avoid arbitrary 500–800 ms web animations for ordinary navigation.

Critical interaction response must feel immediate.

Respect Reduce Motion.

────────

## 22. CORE HAPTICS — EVALUATE A CUSTOM CAPACITOR PLUGIN

Existing Capacitor haptics are a strong baseline.

Evaluate a small native Core Haptics bridge only for signature moments.

Possible patterns:

```text
helmCommit
helmReject
helmMilestone
```

Potential helmCommit:

```text
subtle transient
→ slightly firmer landing
```

Potential milestone:

```text
rare, tasteful, short
```

Do not create arcade-style buzzing.

If custom Core Haptics is implemented:

• use CHHapticEngine
• check hardware capabilities
• handle engine reset/interruption
• never block UI
• respect haptics preference
• fall back safely
• native plugin must be narrow and testable

────────

## 23. HAPTIC SETTINGS

Preserve the existing user opt-out.

All direct and semantic haptic calls must honor it.

Do not create an intensity slider unless strong evidence supports it.

────────

## 24. AUDIO

Default should be silent-first.

If audio is added to a signature moment:

• subtle
• rare
• synchronized with haptic
• system-respectful
• visually redundant

Golf is used outdoors, around teammates, and sometimes in quiet settings.

────────

## 25. NAVIGATION AUDIT

Audit:

• bottom tab bar
• active-tab behavior
• Back
• route transitions
• push deep links
• universal links
• nested pages
• modals vs pages
• "More"
• history
• auth redirect

Users must always know where they are and how to get back.

────────

## 26. SWIPE-BACK

Evaluate real iOS edge-swipe/back behavior.

Do not blindly enable WKWebView history gestures.

Test:

• active round
• unsaved state
• auth
• modal
• qualifier
• push-linked screen
• root tab

If native swipe-back cannot be reliable with Next history, use a clear explicit Back affordance instead of broken browser behavior.

────────

## 27. TAB BAR

The mobile tab bar strongly controls perceived nativeness.

Audit:

• stable placement
• tab count
• labels
• badges
• safe area
• material
• active state
• hit areas
• haptic
• scroll-to-top
• hidden-on-scroll behavior

Question whether hiding it on scroll actually feels iOS-native.

Do not move navigation chrome to Swift only because "native sounds better." Compare complexity and quality.

────────

## 28. SHEETS / DIALOGS / MENUS

Audit every Drawer/Dialog/sheet/modal.

Look for:

• desktop modal proportions on phone
• bad keyboard interaction
• body scroll behind modal
• unsafe bottom area
• inconsistent dismiss
• modal stacking
• wrong height
• weak pressed states

Create one coherent mobile sheet grammar.

Use native-like behavior, but do not rewrite every sheet in Swift.

────────

## 29. PULL TO REFRESH

Evaluate for safe list/feed/dashboard screens.

Do not use for active shot entry/forms where refresh risks state loss.

If native UIRefreshControl is used:

• bridge to data refresh, not full WebView reload
• fire threshold haptic once
• only activate at top
• preserve state

────────

## 30. SCROLL PHYSICS

Audit current overscroll-behavior, touch-action, nested scroll, and WKWebView scroll behavior.

Do not globally disable iOS bounce unless necessary.

A WKWebView that scrolls like a constrained web page is a major "wrapper tell."

────────

## 31. KEYBOARD

Audit whether hiding Apple's keyboard accessory bar is actually desirable.

Test:

• messages
• login
• password manager
• numeric score fields
• forms
• sheets
• keyboard avoidance
• Done
• next/previous
• autofill

Use correct:

• inputmode
• autocomplete
• input font size to avoid zoom

No primary action should be covered by keyboard.

────────

## 32. SCORE ENTRY SHOULD FEEL PHYSICAL

This is a high-value tactile workflow.

Suggested direction:

```text
score +/-:
selection detent

save hole:
subtle commit

next hole:
selection/snap

round submit:
commit then success
```

Avoid heavy haptics on every number.

Design for one-handed outdoor use.

────────

## 33. SHOT TRACKING POLISH MUST FOLLOW REAL DURABILITY

Do not allow fancy feedback to lie about database state.

Ideal:

```text
tap Add Shot
→ immediate visual pressed state

optimistic UI if safe

DB commit confirmed
→ subtle success/commit only if meaningful

DB rejected
→ clear rollback + error feedback
```

Never play success haptic before a high-risk operation is truly committed if that could mislead the user.

────────

## 34. LOADING SYSTEM

No cheap global spinners as default.

The app already has extensive skeletons.

Audit quality:

• skeleton matches final geometry
• no layout shift
• animation restrained
• reduced motion honored
• no skeleton flicker for very fast operations
• preserve previous content during background refresh

Use state-specific loading:

```text
initial page → skeleton
button mutation → inline progress / stable button width
background refresh → preserve content
long AI task → meaningful status
round submit → explicit transactional state
```

────────

## 35. TRANSITION FROM LOADING TO CONTENT

Avoid:

```text
skeleton disappears
page jumps
```

Prefer:

• matching dimensions
• short crossfade
• stable scroll position
• restrained number transitions

────────

## 36. OPTIMISTIC UI

Use only where truth can be reconciled safely.

Low-risk preferences can be optimistic.

High-risk operations such as:

• shots
• round completion
• qualifiers
• lineup
• destructive actions

need clear commit/reconciliation semantics.

Premium means honest state, not fake speed.

────────

## 37. EMPTY / ERROR / OFFLINE

Empty states should explain what comes next.

Errors should answer:

1. what happened?
2. did my data save?
3. what should I do?
4. can the app retry automatically?

Never show raw Supabase/SQLSTATE errors.

Golf may be used with weak signal.

Audit:

• launch offline
• lose network mid-session
• slow network
• mutation failure
• active-round weak signal
• reconnect

Do not build a new offline-write engine casually, but treat reliability on golf courses as a major product requirement.

────────

## 38. LAUNCH EXPERIENCE

Measure:

```text
tap app icon
→ launch screen
→ WebView
→ auth/session
→ first usable screen
```

Audit:

• time to visual
• time to interaction
• white flash
• unnecessary redirects
• splash duration
• signed-in launch
• signed-out launch
• slow network
• offline

The current app historically starts directly at /golf/dashboard to avoid multiple shells.

Preserve or improve based on evidence.

────────

## 39. SAFE AREA / STATUS BAR

Do not use one giant body safe-area padding.

Current native code historically avoided this because it caused double padding.

Test:

• Dynamic Island
• Home Indicator
• fixed bottom nav
• message composer
• sheet
• keyboard
• active round
• landscape

Test status bar on:

• light
• dark
• system switch
• modal
• deep-link cold launch

────────

## 40. DARK MODE / CONTRAST / OUTDOOR USE

Audit all current dark mode, not stale docs.

Test:

• charts
• cards
• dividers
• glass
• skeletons
• errors/success
• native status bar
• splash transition

Also test daylight readability.

Golf is an outdoor product.

Low-opacity text and beautiful transparent surfaces that vanish in sunlight are unacceptable.

────────

## 41. ACCESSIBILITY

Run Accessibility Inspector on representative screens.

Use VoiceOver manually.

Critical workflows:

• login
• dashboard
• active round
• score/shot entry
• qualifier
• messages
• stats
• settings
• modal/sheet

Audit:

• reading order
• labels
• active state
• modal focus
• focus restoration
• error announcements
• chart alternatives
• toasts
• icon-only buttons

Use 44pt default control sizing intent for primary iOS interactions.

Test Larger Text/Dynamic Type-like conditions.

Test Reduce Motion, Increase Contrast, and Reduce Transparency where relevant.

No important information may rely only on haptic, color, sound, or animation.

────────

## 42. PERFORMANCE

Premium = actual responsiveness.

Use:

• Thread Performance Checker
• Time Profiler
• Hitches
• Allocations
• Leaks
• Energy Log
• Xcode Organizer
• network tools

Profile:

• launch
• tab switch
• long dashboard scroll
• message thread
• active shot entry
• chart
• sheet open
• CoachHelm

Fix hangs before cosmetic hitches.

Audit heavy backdrop-blur, long animations, sticky layers, and unnecessary re-renders.

────────

## 43. LONG-ROUND ENERGY / MEMORY

Simulate a long round.

Monitor:

• CPU
• memory
• timers
• event listener accumulation
• network
• repeated bridge calls
• WebView stability

No memory leak that grows hole by hole.

Haptics must be event-driven, never continuous background work.

────────

## 44. NOTIFICATIONS — FULL SYSTEM AUDIT

Trace:

```text
permission rationale
→ system prompt
→ APNs token
→ backend registration
→ push payload
→ OS delivery
→ badge
→ foreground/background/terminated
→ action/tap
→ deep link
→ read state
```

Current token persistence logic includes important auth-retry behavior. Preserve it.

────────

## 45. NOTIFICATION PERMISSION

Do not prompt at random app launch.

Use a value-first pre-prompt.

Example tone:

```text
Stay in sync with your team

Get notified about qualifier updates, messages,
schedule changes, and important team actions.

Enable Notifications
Not now
```

Do not nag after denial.

Provide a route to iOS Settings later.

────────

## 46. NOTIFICATION TAXONOMY

Define types such as:

```text
TEAM_MESSAGE
QUALIFIER_UPDATE
QUALIFIER_START
QUALIFIER_RESULT
ROUND_RECAP_READY
SCHEDULE_CHANGE
LINEUP_POSTED
COACH_ASSIGNMENT
COACHHELM_INSIGHT_READY
REMINDER
```

For each define:

• audience
• urgency
• sound
• badge
• interruption level
• thread/group
• deep link
• actions

Not every server event deserves a push.

────────

## 47. INTERRUPTION LEVELS

Use:

```text
Passive
Active
Time Sensitive
Critical
```

correctly.

Time Sensitive only for truly time-critical team events.

Do not misuse it to bypass Focus.

Critical is almost certainly inappropriate for GolfHelm unless a genuinely entitlement-worthy safety use case exists.

────────

## 48. ACTIONABLE NOTIFICATIONS

Evaluate native UNNotificationCategory.

Potential examples:

Team message:

```text
Reply
View
```

Qualifier:

```text
View Qualifier
Open Round
```

Schedule:

```text
View Event
```

Register categories at launch.

Handle every action.

Use text reply only if end-to-end security/product behavior is solid.

────────

## 49. NOTIFICATION GROUPING + BADGE

Use meaningful threads such as conversation/team/qualifier.

Audit app-icon badge.

Current push code historically noted delivered notifications do not necessarily clear the badge.

If needed add a supported badge plugin or a narrow native bridge.

Badge must reflect real unread state.

Test read, read-all, sign-out, account switch, reinstall.

────────

## 50. FOREGROUND NOTIFICATIONS

Avoid duplicated sensory overload.

Do not simultaneously create:

```text
system banner
+ toast
+ sound
+ haptic
+ badge
```

for every foreground event.

If the user is already on the relevant screen, update that screen quietly where possible.

────────

## 51. LIVE ACTIVITY / DYNAMIC ISLAND — HIGH PRIORITY

An active golf round is an excellent ActivityKit candidate.

Investigate seriously.

Potential Lock Screen:

```text
Pinehurst No. 2
Hole 7 • Par 4

Today +2
Hole 3 shots

Open Round
```

Potential Dynamic Island compact:

```text
H7
+2
```

Expanded state:

• hole/par
• score to par
• current hole state
• quick return

Keep it glanceable.

────────

## 52. LIVE ACTIVITY LIFECYCLE

```text
round starts
→ activity starts

hole/round state changes
→ activity updates

background
→ stays glanceable

tap
→ exact active round deep link

round finishes/discards
→ activity ends
```

Live Activity is a projection, never source of truth.

Recover/end stale activity gracefully.

Do not vibrate on every Live Activity update.

────────

## 53. WIDGETKIT

After Live Activity, evaluate one genuinely useful widget.

Player candidates:

• next team event
• active qualifier
• active round shortcut
• recent round/trend

Coach candidates:

• today's schedule
• active qualifier
• unread messages/team snapshot

One excellent widget is better than ten weak ones.

────────

## 54. APP INTENTS / SIRI / SHORTCUTS / ACTION BUTTON

Research current App Intents.

Potential high-value intents:

```text
Start a Golf Round
Open My Active Round
Open Today's Qualifier
View Today's Team Schedule
Open Team Messages
View My Latest Round
```

Expose predictable, habitual actions.

App Shortcuts can make actions available through Siri, Spotlight, Shortcuts, and supported iPhone Action button configuration.

A strong use case:

```text
Action button → Open Active Round
```

Do not overexpose every feature.

────────

## 55. SPOTLIGHT

Index only relevant private user content with correct security/lifecycle.

Potential:

• active qualifier
• upcoming event
• recent round

Clear private indexed content on sign-out or access loss.

Do not index the entire team database.

────────

## 56. HOME SCREEN QUICK ACTIONS

Evaluate up to four predictable quick actions.

Player:

```text
Start Round
Active Round
Today's Qualifier
Messages
```

Coach:

```text
Team Today
Active Qualifier
Roster
Messages
```

Do not reshuffle them unpredictably.

────────

## 57. SHARE SHEET

Audit existing Capacitor Share usage.

Good native share candidates:

• scorecard
• round result
• stat card
• qualifier result
• schedule item

Use system share sheet.

If generating share cards, create clean exported content rather than screenshotting app chrome.

────────

## 58. UNIVERSAL LINKS / DEEP LINKS

Current associated domains exist.

Test:

• Safari
• Messages
• notification
• cold app
• warm app
• signed out
• wrong role
• inaccessible team

Create one canonical deep-link routing contract.

Do not let push payloads navigate WKWebView to arbitrary remote URLs.

External destinations should use the native browser surface.

────────

## 59. APP LIFECYCLE

Audit SceneDelegate callbacks.

Evaluate appropriate reconciliation on:

```text
become active
resign active
enter background
enter foreground
```

Potential uses:

• unread badge refresh
• active round reconciliation
• pending APNs token flush
• network recovery
• Live Activity refresh

Do not reload WebView on every foreground.

Test backgrounding during pending shot save/round state.

────────

## 60. WEBVIEW CACHE / SESSION

Current GolfBridgeViewController historically clears WKWebView disk/memory cache to pick up latest Vercel deployment.

Audit whether this:

• hurts cold launch
• breaks expected caching
• affects sessions
• causes excess network use

Do not clear cookies/auth unless intentional.

Distinguish HTTP cache from session/storage.

────────

## 61. REMOTE WEB APP COMPATIBILITY

Because native shell loads remote web content, old App Store binaries may run new web code.

This is a major architectural constraint.

Any new native API must be capability-detected.

Consider exposing:

```text
platform
appVersion
buildNumber
nativeCapabilities
```

Examples:

```text
coreHapticsV1
liveActivityV1
badgeV1
notificationActionsV1
```

New web deploys must gracefully fall back on older App Store builds.

Do not make the website require a native plugin only available in the upcoming binary.

────────

## 62. NATIVE EXTENSION AUTH

Widgets/Live Activities/App Intents do not automatically share WKWebView browser auth.

Design securely.

If shared private state requires:

• App Group
• Keychain access group
• native secure token
• server endpoint

design explicitly.

Do not copy browser cookies into extensions casually.

If secure auth is not ready, defer the feature rather than ship a dangerous bridge.

────────

## 63. PRIVACY / SECURITY

Audit:

```text
PrivacyInfo.xcprivacy
App Store Connect privacy labels
privacy policy
actual SDK behavior
```

Current repo includes/has included:

• Sentry
• Datadog
• PostHog
• Vercel analytics

Audit what really executes in iOS and what data is sent.

Review:

• camera/photo permission
• APNs token handling
• deep-link trust
• native bridge validation
• sensitive logs
• tracking definition

Do not show ATT unless Apple's tracking definition actually applies.

────────

## 64. APP ICON

Audit current icon.

Apple now supports Icon Composer and layered Liquid Glass app icons.

Evaluate a modern Helm icon that:

• is recognizable at tiny size
• uses simple bold layers
• works Default
• works Dark
• works Mono/tinted
• lets system generate glass/refraction
• retains Helm identity
• avoids tiny text/details

Use Icon Composer if current tooling supports it.

Do not change final icon without Nick's visual approval.

────────

## 65. SF SYMBOLS

Use SF Symbols in native surfaces.

Do not export Apple symbols as arbitrary web assets in violation of platform rules.

For web icons, maintain one consistent semantic icon language.

Native surfaces should use appropriate symbol weight/scale and accessibility labels.

────────

## 66. APP STORE CONNECT AUDIT

If authenticated access is available, inspect:

• live version
• live build
• TestFlight builds
• rejection history
• screenshots
• subtitle
• description
• keywords
• promotional text
• privacy answers
• age rating
• accessibility declarations
• review notes
• support URL
• privacy URL

Do not edit or submit during audit.

If unavailable, provide exact manual steps.

────────

## 67. VERSION / BUILD

Current project historically reports 2.0 (8).

Do not assume that is the public App Store version.

Verify App Store Connect.

Then propose the next marketing version/build.

A major native refresh may justify a meaningful version bump, but do not choose arbitrarily.

────────

## 68. APP STORE SCREENSHOTS

Current screenshots should be replaced if stale.

Create a screenshot story based on current product value:

1. dashboard/team command center
2. active round / shot tracking
3. stats
4. qualifier
5. CoachHelm
6. team calendar/messages

Use current accepted screenshot sizes.

Do not show obsolete UI.

Screenshots must reflect real shipping functionality.

────────

## 69. APP STORE METADATA

Update:

• description
• subtitle if needed
• keywords
• What's New
• screenshots
• review notes

Release notes should be concise and truthful.

Possible final style, only if actually shipped:

```text
A major GolfHelm mobile upgrade:
• Refined iPhone navigation and interaction
• Richer tactile feedback
• Better notifications and deep links
• Smoother loading and transitions
• Improved accessibility and dark mode
• More reliable round and shot-tracking workflows
```

────────

## 70. REVIEW NOTES + DEMO ACCOUNT

Because this is a WebView architecture, proactively describe concrete native value.

Provide step-by-step App Review instructions for native features.

If Live Activity ships, explain exactly how to start a round and see it.

Provide a stable demo account with representative data.

Reviewer must be able to access:

• round
• stats
• qualifier
• messages/calendar
• CoachHelm
• native features

Keep backend available throughout review.

────────

## 71. TESTFLIGHT — REQUIRED

Before App Review:

• archive release candidate
• validate
• upload to TestFlight only after owner approves upload
• install exact build
• test physical device
• test production-like push
• test deep links
• test haptics
• test Live Activity if shipped
• test cold/warm launch

Test upgrade-in-place from current public App Store build.

Verify:

• session survives
• preferences survive
• notification state survives
• theme/haptic preference survives
• WebView storage migration is safe
• older native capability state doesn't corrupt app

Also test clean install.

────────

## 72. PHYSICAL DEVICE HAPTIC LAB

Create a temporary/developer-only haptic test harness if useful.

Test semantics:

```text
selection
light
medium
heavy
success
warning
error
commit
reject
milestone
```

For every pattern ask:

• Is the cause obvious?
• Does it match the visual weight?
• Is timing correct?
• Is it too strong?
• Would it annoy after 50 uses?
• Does it feel distinct from adjacent patterns?

Nick should approve signature patterns physically.

────────

## 73. PERFORMANCE / RELEASE TESTING

Use real-device Instruments for:

• launch
• scroll
• active round
• long sessions
• messages
• stats charts
• sheets
• CoachHelm

Use:

• Time Profiler
• Hitches
• Allocations
• Leaks
• Energy Log
• Thread Performance Checker

Do not sacrifice responsiveness for blur/motion.

────────

## 74. ACCESSIBILITY RELEASE GATE

Run:

• Accessibility Inspector
• VoiceOver
• larger text
• Reduce Motion
• Increase Contrast / Reduce Transparency where relevant
• Voice Control where practical

If native UI tests are appropriate, use XCUIApplication.performAccessibilityAudit(...).

Web layer should retain axe/Playwright accessibility checks.

Do not claim App Store accessibility support unless tested.

────────

## 75. APP STORE PRIVACY / AGE RATING / ACCESSIBILITY LABELS

Before submission re-answer current App Store questions.

Do not copy old answers blindly.

Check:

• privacy labels
• age rating
• user-generated messaging implications
• AI features
• accessibility declarations

Only claim accessibility features that have evidence.

────────

## 76. RELEASE BLOCKER: GUIDELINE 4.2 REVIEW

Before shipping, answer:

> What does the iPhone app do that Safari does not?

Final answer should be concrete.

Potential real examples only if shipped:

• native haptic scoring
• push with actions
• universal links
• Active Round Live Activity
• Dynamic Island
• App Shortcuts
• native sharing
• system theme/status
• native lifecycle
• camera/photo integration
• notification badge/actions
• system accessibility

If the answer is weak, keep improving.

────────

## 77. IMPLEMENTATION PHASES

After audit, propose implementation in controlled phases.

### Phase A — Native foundation

• Xcode/SDK/project health
• Capacitor compatibility
• lifecycle
• capability bridge
• version/build exposure
• safe areas/status
• push/badge correctness

### Phase B — Interaction system

• canonical haptic grammar
• visual haptics
• motion tokens
• pressed states
• sheets/navigation
• scroll/pull refresh
• keyboard

### Phase C — Core Golf mobile UX

• player dashboard
• round entry
• shot tracking
• qualifiers
• coach workflows
• loading/empty/error/offline

### Phase D — Apple ecosystem

• Live Activity
• notification actions
• App Intents
• quick actions
• widget if justified
• Spotlight if justified

### Phase E — Accessibility/performance

• VoiceOver
• larger text
• reduced motion
• Instruments
• long-session testing

### Phase F — App Store

• icon
• screenshots
• metadata
• TestFlight
• review notes
• final release candidate

Core UX comes before shiny ecosystem extras.

────────

## 78. P0 / P1 / P2 / P3

### P0

• crashes
• lost shot/round state
• auth break
• App Review blocker
• privacy/security
• broken upgrade path

### P1

• obvious WebView feel in critical flow
• broken native navigation
• bad loading
• keyboard problems
• push/deep-link bugs
• stale badge
• accessibility failure
• major hitch
• haptic inconsistency

### P2

• Live Activity
• App Intents
• widget
• premium microinteractions
• signature haptics

### P3

• low-value cosmetic polish

Do P0/P1 before P2 delight.

────────

## 79. SCREEN COMPLETION CHECKLIST

A critical screen is not done until checked in:

```text
initial load
loaded
empty
error
offline/degraded
mutation loading
success
light
dark
larger text
keyboard
VoiceOver
small iPhone
current iPhone
large iPhone
orientation if supported
safe area
haptics
pressed states
Reduce Motion
performance
```

────────

## 80. ACTIVE ROUND — GOLD STANDARD

This should be the flagship mobile experience.

Target:

```text
open app
→ active round visible immediately
→ tap
→ near-instant resume
→ thumb-friendly scoring
→ crisp selection detents
→ saves clearly represented
→ background safely
→ Live Activity if shipped
→ Dynamic Island tap returns to exact round
→ submit
→ meaningful commit feedback
→ polished completion
→ stats/CoachHelm downstream state
```

This should feel materially better than using the web app in Safari.

────────

## 81. QUALIFIER — GOLD STANDARD

```text
push/dashboard
→ qualifier
→ clear deadline/status
→ start assigned round
→ tactile score entry
→ safe checkpoint/resume
→ submit
→ clear outcome
→ leaderboard
```

No ambiguity about identity, status, or whether the round saved.

────────

## 82. COACH — GOLD STANDARD

Coach mobile UI should not feel like desktop admin shrunk to phone.

Prioritize:

• today's team status
• active qualifier
• schedule
• messages
• roster
• player detail
• useful stats
• CoachHelm

Use compact, high-value actions and native-feeling decision surfaces.

────────

## 83. VISUAL CRAFT PASS

Audit pixel-level details:

• separators
• icon optical alignment
• icon weight
• radius consistency
• shadows
• blur
• button centering
• label baseline
• card padding
• chart padding
• badge placement
• skeleton geometry
• sheet top edge
• tab bar elevation
• status-bar blend

Premium quality is cumulative.

────────

## 84. COPY

Remove technical/web copy.

Bad:

```text
Request failed.
```

Better:

```text
Couldn't save this shot.
Your previous shot data is still safe.
Try again.
```

Keep copy short.

Do not sound like AI-generated prose.

────────

## 85. DO NOT MAKE ONE GIANT STYLE REWRITE

Work feature-by-feature.

For each unit:

1. baseline
2. behavioral test where possible
3. implementation
4. simulator QA
5. screenshot comparison
6. accessibility
7. performance if relevant
8. commit

Do not weaken tests to make a redesign pass.

────────

## 86. FINAL DELIVERABLES

Leave behind:

### Audit

```text
docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md
```

### Active system spec

One current document for:

• interaction grammar
• haptic grammar
• motion grammar
• notification taxonomy
• native capability architecture

### Implementation plan

Exact files, tasks, tests, and rollout.

### Native integration map

```text
capability
↔ Swift/plugin
↔ TypeScript bridge
↔ consumer
```

### Simulator QA evidence

Screenshots / matrix.

### Physical device checklist

Especially:

• haptics
• APNs
• Live Activity
• TestFlight

### App Store checklist

• Xcode/SDK
• version/build
• icon
• screenshots
• metadata
• privacy
• age rating
• accessibility
• demo account
• TestFlight
• review notes
• release steps

────────

## 87. FINAL VERIFICATION

Run appropriate current commands, including:

```text
git diff --check
npm run typecheck
npm run lint
relevant Vitest/Golf tests
Playwright critical flows
Capacitor sync validation
Xcode simulator build
Xcode Release build
native tests
accessibility tests
```

Then physical-device/TestFlight validation.

A passing Next.js build does not prove the iOS app is ready.

────────

## 88. RELEASE CANDIDATE REPORT

Before App Store upload, give Nick:

```text
Version:
Build:

Xcode:
SDK:
Minimum iOS:

Simulator QA:
PASS/FAIL

Physical device:
PASS/FAIL

Push:
PASS/FAIL

Haptics:
PASS/FAIL

Live Activity:
PASS/FAIL/N/A

Accessibility:
PASS/WARN/FAIL

Performance:
PASS/WARN/FAIL

Privacy:
PASS/FAIL

App Store metadata:
PASS/FAIL

Known issues:
...

Recommendation:
SHIP / HOLD
```

Do not recommend SHIP with unresolved P0 or release-blocking P1.

────────

## 89. DO NOT SUBMIT WITHOUT OWNER APPROVAL

Claude may:

• build
• archive locally
• prepare TestFlight build
• prepare screenshots
• prepare metadata
• prepare review notes
• validate release candidate

Stop before:

```text
App Store upload
Submit for Review
Release
```

unless Nick explicitly approves.

────────

## 90. START NOW

Begin in this order.

### 1. Environment truth

Confirm:

```text
canonical repo
branch
Xcode
SDK
Capacitor
current native project
current version/build
```

### 2. Official Apple research

Verify current platform guidance.

### 3. Read current iOS implementation

Do not trust stale audits.

### 4. Build and use simulator

Do not edit yet.

### 5. Produce audit

Report:

```text
Current native architecture
Current App Store state
UX quality
Haptic audit
Motion audit
Navigation
Notifications
Loading/state
Accessibility
Performance
Apple ecosystem opportunities
Guideline 4.2 risk
Release readiness
P0/P1/P2/P3
```

### 6. Design implementation phases

Choose native additions based on user value.

### 7. Execute controlled upgrade

Use simulator continuously.

Use real device for haptics/APNs/release acceptance.

────────

## 91. FINAL PRODUCT VISION

The finished Helm iPhone experience should be:

```text
quiet
fast
confident
tactile
precise
forgiving
glanceable
alive
intentional
```

A tab should feel like a tab.

A score change should feel like a detent.

A sheet should feel attached to the user's finger.

A saved shot should feel reliable.

A round submission should feel meaningful.

A failed operation should feel clear without becoming alarming.

A milestone should feel special precisely because the app does not celebrate everything.

A notification should take the user exactly where expected.

An active round should feel integrated into the iPhone itself.

Loading should feel like continuity, not waiting.

The app should remain beautiful in light mode, dark mode, bright sunlight, and larger text.

It should recover from interruptions.

It should survive an App Store upgrade.

It should not reveal its hybrid implementation through sloppy interaction.

Do not optimize for the greatest number of native features.

Optimize for:

> **the most useful, convincing, premium Apple experience Helm can deliver while protecting the reliability of its golf workflows.**
