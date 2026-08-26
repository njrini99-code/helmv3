# Change ledger — ios_native_shell

## 2026-08-26 — §61 capability bridge (2.1 keystone)

- What: `src/lib/native/capabilities.ts` — `getNativeAppInfo()` /
  `hasNativeCapability()`, gating every future native feature on the
  installed binary's CFBundleVersion via `@capacitor/app`. Feature
  `ios_native_shell` added to `memory/registry.yml` with its current-state
  doc, closing the mobile feature-awareness gap flagged during the 2.0 run.
- Why: the shell renders deployed web code on old binaries indefinitely
  (premium plan §61); nothing native can ship safely without detection.

## 2026-08-26 — Core Haptics signature plugin (build 10)

- What: `ios/App/App/HelmHapticsPlugin.swift` (CHHapticEngine, transient-only
  patterns helmCommit/helmReject/helmMilestone, reset-self-healing, resolves
  played:false instead of rejecting), registered in
  `GolfBridgeViewController.capacitorDidLoad`; pbxproj gains the file refs;
  build bumped 9 → 10; capability entry `coreHapticsV1: 10` in the same
  change per the bridge's release rule; web bridge
  `src/lib/native/helm-haptics.ts` with preference/capability/hardware
  gating and stock-grammar fallback.
- Why: premium plan §22 — signature moments the UIFeedbackGenerator grammar
  cannot express. Not wired into product flows until the owner's
  physical-device feel pass (§13/§72).

## 2026-08-26 — haptic feel lab (§72 harness)

- What: unlinked dev route `/golf/dashboard/dev/haptics` (mapped in the
  registry under this feature's routes) firing every production haptic path —
  triggerHaptic stock styles, fwHaptic/fwHapticSequence grammar, and the
  Helm signatures via playHelmSignature — with a native-identity/capability
  readout and the §72 evaluation questions on-screen. No new haptic plumbing;
  the lab measures the real paths.
- Why: the owner's physical-device feel pass (§13/§72) needs a TestFlight
  surface; signatures stay out of product flows until that sign-off.
