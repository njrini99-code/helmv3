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

Planned (2.1 arc, not yet shipped): Core Haptics signature plugin, badge
bridge, notification categories/actions, active-round Live Activity — each
gated behind a capability entry when its binary lands. Release process:
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

## Tests

- `src/test/lib/native-capabilities.test.ts` — capability bridge contract.
- `src/test/lib/haptics-pref.test.ts` — preference gate.
- `src/test/lib/push-registration-pending-token.test.ts` — token parking.
