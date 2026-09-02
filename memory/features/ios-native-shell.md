# Feature: iOS Native Shell

## Status

- active

## Current State

Verified 2026-08-26 against the shipped 2.0 (build 9) binary and current code.

The iPhone app is a Capacitor 8 shell (`ios/App`, SPM via `CapApp-SPM`, no
CocoaPods) that renders the deployed web app from
`https://www.helmsportslabs.com/golf/dashboard` (`capacitor.config.ts`).
Business logic lives in the web layer; the native layer owns platform
integration only. Because old binaries run new web code indefinitely, every
native feature the web calls must be capability-detected — that contract is
`src/lib/native/capabilities.ts` (`getNativeAppInfo()` /
`hasNativeCapability()`, gated on the installed CFBundleVersion via
`@capacitor/app`). A capability's min-build entry lands in the same PR as the
native code that ships it; the map is empty at build 9.

Native surface today:

- **Shell**: `GolfBridgeViewController.swift` (scoped WKWebView disk/memory
  cache clear on launch — cookies/session untouched; body-level safe-area
  padding deliberately avoided), `AppDelegate`/`SceneDelegate` lifecycle,
  storyboard splash with light + dark variants token-matched to
  `--fw-color-canvas` (2026-08-26).
- **Identity**: portrait-only iPhone (Info.plist, intentional restriction
  2026-08-26), app icon with Default/Dark/Tinted variants, associated
  domains for universal links (apex + www), `aps-environment=production`.
- **Haptics**: `@capacitor/haptics` behind `triggerHaptic()`
  (`src/lib/utils/capacitor.ts`, honors the user preference for all callers)
  and the semantic layer `src/lib/fairway/haptics.ts` (`fwHaptic`). Wired at
  primitives: Button → light, Segmented → selection, bottom-nav tabs →
  selection.
- **Push**: `src/lib/utils/push-registration.ts` park-then-flush token state
  machine (persistence deferred until an authenticated session), value-first
  pre-prompt `src/components/golf/PushPermissionSoftAsk.tsx`, deep links
  validated by `isSafeInternalPath`.
- **Theme/status bar**: `CapacitorProvider.tsx` syncs the native status bar
  to the app theme reactively.

In code for the build-10 binary (2.1 arc, unshipped until that build
uploads): `HelmHapticsPlugin.swift` (Core Haptics signature patterns
helmCommit/helmReject/helmMilestone; app-local plugin registered in
`GolfBridgeViewController.capacitorDidLoad`) with the web bridge
`src/lib/native/helm-haptics.ts` (`playHelmSignature`, preference + capability
+ hardware gated, stock-grammar fallback). Pattern curves await the owner's
physical-device feel pass before any product flow wires them (§13/§72).
Still planned: badge bridge, notification categories/actions, active-round
Live Activity — each gated behind a capability entry when its binary lands. Release process:
`ios/appstore/RELEASE_CANDIDATE_2.0-9.md`; audit:
`docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md`.

## Business Rules

- The web layer must degrade gracefully on every binary: no web deploy may
  hard-require a native capability the oldest supported binary lacks. Probe
  through `hasNativeCapability`, never through version sniffing elsewhere.
- The shell's navigation allowlist (non-helmsportslabs origins open
  externally) is a security boundary — do not widen it for convenience.
- The WKWebView cache clear must never touch cookies or session storage.
- All haptic paths must honor the user's haptics preference at the shared
  gate in `triggerHaptic`.
- Push tokens are persisted only after an authenticated session exists.
- The keyboard never resizes the WebView (`resize: 'ionic'` with no
  `<ion-app>`), and Mobile Safari never resizes its layout viewport. The ONLY
  keyboard contract is the pair `CapacitorProvider` publishes —
  `--keyboard-height` and `body.keyboard-open` — from native
  `keyboardWillShow/Hide`, and since 2026-09-02 from `visualViewport` on the
  web (coarse-pointer only; pinch-zoom is gated out by `scale`). Consumers:
  `<body>` pads by the keyboard height (globals.css) so a focused field on any
  page — shell or not — can be scrolled above it; a surface that lays itself out against the height
  instead (`FairwayMessages`) carries `data-fw-keyboard-aware`, which tells the
  provider's scroll-into-view to leave it alone. Contract test:
  `src/components/fairway/app-shell/__tests__/keyboard-inset.test.ts`.

## Tests

- `src/test/lib/native-capabilities.test.ts` — capability bridge contract.
- `src/test/lib/haptics-pref.test.ts` — preference gate.
- `src/test/lib/push-registration-pending-token.test.ts` — token parking.
- `src/components/fairway/overlays/keyboard-inset.test.ts` — every overlay
  edge that touches the bottom of the screen (`Sheet` bottom/left/right,
  `ModalShell`, the CoachHelm phone drawer) lifts by `--keyboard-height` and
  carries `data-fw-keyboard-aware`; the WebView never resizes for the keyboard
  (audit 2026-09-02: 27 sheets/modals carry text inputs).
