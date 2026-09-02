# Change ledger — ios_native_shell

## 2026-08-27 — feel lab reachable in-app; header corrected to match

- SHA: 1a57943e6.
- Change: added the "Feel lab" row to Settings > Haptics (`HapticsPanel`),
  the page's only entry point. It inherits that panel's `if (!native) return
  null`, so it exists only in the installed app. The page header no longer
  claims it is "deliberately UNLINKED from every nav surface" — it is absent
  from every GENERATED nav surface, which is a different and now-accurate
  claim.
- Why: "reachable only by URL" is reachable NOT AT ALL inside a Capacitor
  WebView, which has no address bar — the lab was unusable on the exact
  device it exists to measure.
- Watch: the row carries NO role check, so every signed-in user of the
  installed build sees it, players included. Acceptable while distribution is
  TestFlight-only and the page is read-only tuning UI; gate on coach/owner
  before any public App Store release. Recorded in the page header too.

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

## 2026-08-26 — mobile focus rule: no keyboard-on-open, sweep + primitive fixes

- What: owner's TestFlight pass surfaced overlays opening with the iOS
  keyboard burying the form. Root causes closed at every focus mechanism:
  ModalShell + legacy ui/dialog now cancel Radix's first-tabbable autofocus
  on coarse pointers (focus lands on the panel, tabIndex -1);
  ui/modal + use-focus-trap (17 consumers) gate their imperative
  first-focusable focus the same way; explicit `autoFocus` attrs and
  setTimeout `.focus()` calls gated on `(pointer: fine)` across Ask
  composer, create-task, new-message, broadcast (both steps),
  announcements, both log-progress drawers, and baseball watchlist.
  Shared util: `src/lib/utils/pointer.ts` `isCoarsePointer()`.
  A 6-area Sonnet sweep (wf_07e7042d-6fa) audited every popup subscreen
  and every dashboard loading.tsx; its skeleton-fidelity corrections
  landed via wf_73417160-934 (team-hub rewrite off the retired tabbed
  layout, travel/tasks/roster/settings/qualifiers/coachhelm/announcements/
  stats shape fixes). Structural: FairwayCreateFromTemplateModal adopted
  Body/Footer (buttons were clippable off-screen), FairwayRoundSummarySheet
  pinned Submit Round, FairwayEditShotModal footer got the safe-area
  formula.
- Why: §28/§31/§34 of the premium plan — sheets must open readable, and a
  skeleton must not promise chrome the page never paints (the Ask void).
- Known gap (recorded per OS): `src/components/fairway/overlays/**`,
  `src/components/ui/{modal,dialog}.tsx`, `src/hooks/use-focus-trap.ts`
  map to NO feature in memory/registry.yml — the shared overlay kit is
  unrouted. Mapping it is real work owed, not done here.
- Deferred to the 2.1 binary: capacitor.config.ts `Keyboard.resize:'ionic'`
  is a silent no-op (no <ion-app> in this DOM) — keyboard-avoidance needs
  the on-device layout-viewport check before choosing 'native' vs 'body',
  then ships with build 10.
