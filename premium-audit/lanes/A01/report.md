# Lane A01 — Native shell, startup, lifecycle, keyboard, and haptic bridge

Baseline: `3c90f9f174ac103af5fafc600aebecd98243decc` (worktree HEAD, per WORKER_BRIEF.md; the
master plan document's own evidence-register links pin an older SHA, `4674b38e1...` — this
report reads the worktree at the brief's baseline, which is later and supersedes it).
No device, simulator, or build was available. Every claim below is `SOURCE`, `RISK`, or
`PROPOSAL` per the evidence discipline; `OBSERVED`/`REPRODUCED` are not used anywhere in
this report.

## Top 5 actionable findings

1. **A01-001** (P0, RISK) — The native URL-navigation classifier in
   `GolfBridgeViewController.swift:82-96` allowlists only 4 hardcoded substrings
   (`/golf/`, `/about`, `/privacy`, `/terms`). It does not know about `/admin` or
   `/baseball/`, both of which the web app's own code treats as first-class, safe,
   reachable destinations (`src/lib/utils/safe-redirect.ts:12-28` explicitly allowlists
   `/admin` for the redirect-safety check; the AASA registers `/baseball/*` universal
   links under GolfHelm's own app ID). Traced end to end: the production super-admin
   account's post-login destination resolves to `/admin` and is `router.replace`'d from
   `src/app/golf/(auth)/welcome/page.tsx:326`, and a real Baseball invite link
   (`src/components/baseball/command-center/BaseballInviteButton.tsx:42`) resolves to
   `/baseball/join/<code>` — both get bounced to `/golf/login` by
   `SceneDelegate.swift:20-29`'s `onNavigateAway` handler.
2. **A01-002** (P1, SOURCE) — Haptic feedback for one logical outcome fires through three
   independent, uncoordinated emitters: the Fairway `Button` primitive's automatic
   tap haptic (`controls/button.tsx:163-172`), a handler's own explicit
   `triggerHaptic('success'|'error')` call, and `ToastStack.tsx:145-151`'s own haptic
   inside `fairwayToast.success/error(...)` — confirmed stacking at 6+ call sites across
   `FairwaySettingsGeneral.tsx` and `FairwayTeamSettings.tsx`.
3. **A01-003** (P1, SOURCE) — `GolfBridgeViewController.swift:49-53` hardcodes the
   WKWebView/view/scrollView background to a fixed light cream with no dark-mode
   awareness anywhere in the native project (no `traitCollectionDidChange`, no
   `UIUserInterfaceStyle`), and that color (`#FFFEFA`) doesn't even match the
   launch-screen/splash color (`#EDE0C8`) — a native-shell color seam independent of
   theme, plus a persistent light rim under dark mode.
4. **A01-004** (P2, SOURCE) — The haptic rate limiter (`haptics.ts:119-128`) is only
   reachable through `fwHaptic()` (21 call sites); 117 direct `triggerHaptic()` call
   sites never touch it, so the majority of the app's haptic traffic is unthrottled.
5. **A01-005** (P2, SOURCE) — The WKWebView disk+memory HTTP cache is unconditionally
   wiped on every cold launch (`GolfBridgeViewController.swift:22-28`), racing the page
   load `super.viewDidLoad()` already started, forcing a full re-fetch of every JS
   chunk/font/image on every launch with no version-aware policy.

## All findings

See `findings.jsonl` in this directory for the complete, machine-readable records (one
JSON object per line, full schema per WORKER_BRIEF.md §finding record). Summarized here:

```yaml
id: A01-001
severity: P0
evidence_label: RISK
related_prior_ids: [G24]
summary: >
  Substring URL classifier in GolfBridgeViewController.swift bounces two real,
  deliberately-reachable same-origin destinations (/admin for the sole production
  super-admin account; /baseball/join/<code> shared invite links) to /golf/login.
source_ranges:
  - ios/App/App/GolfBridgeViewController.swift:82-96
  - ios/App/App/SceneDelegate.swift:16-37
  - src/lib/golf/admin-redirect.ts:31-34
  - src/lib/utils/safe-redirect.ts:12-28
  - src/components/auth/golf-sign-in-form.tsx:159-201
  - src/app/golf/(auth)/welcome/page.tsx:225-238,320-326
  - src/components/NativeRedirect.tsx:44-58
  - src/app/page.tsx:33-39
  - public/.well-known/apple-app-site-association:1-13
  - ios/App/App/App.entitlements:5-11
  - src/components/baseball/command-center/BaseballInviteButton.tsx:38-44
proposed_fix: >
  Replace the substring OR-list with an exact-match allowlist mirroring
  safe-redirect.ts's own prefixes (/golf/, /baseball/, /admin, + legal pages),
  parsed via URLComponents rather than String.contains.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-002
severity: P1
evidence_label: SOURCE
related_prior_ids: [G07]
summary: >
  Three uncoordinated haptic emitters (Button auto-tap, explicit handler haptic,
  ToastStack's own haptic) stack for one outcome; confirmed at 6+ call sites.
source_ranges:
  - src/components/fairway/controls/button.tsx:163-172
  - src/components/fairway/feedback/ToastStack.tsx:145-151
  - src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:585-599,1554-1557,1665-1673
  - src/components/fairway/pages/team/FairwayTeamSettings.tsx:185-260
proposed_fix: >
  Make fairwayToast the single owner of outcome haptics; remove the explicit
  triggerHaptic('success'|'error') calls immediately preceding a matching toast call.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-003
severity: P1
evidence_label: SOURCE
related_prior_ids: [G23]
summary: >
  Native WKWebView background is a hardcoded light cream with no dark-mode path,
  and mismatches the splash/launch-screen color independent of theme.
source_ranges:
  - ios/App/App/GolfBridgeViewController.swift:49-53
  - src/lib/utils/capacitor.ts:190-194
  - capacitor.config.ts:79-83
  - ios/App/App/Base.lproj/LaunchScreen.storyboard:25
  - src/styles/design-tokens.css:288-290
proposed_fix: >
  Read the persisted theme (or OS trait) before first paint and set the native
  background accordingly; bridge live in-app theme toggles to update it; align
  splash/launch-screen color with the first real background shown.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-004
severity: P2
evidence_label: SOURCE
related_prior_ids: [G07]
summary: >
  The 32ms haptic throttle is only reachable via fwHaptic (21 sites); 117 direct
  triggerHaptic call sites bypass it entirely.
source_ranges:
  - src/lib/fairway/haptics.ts:110-140
  - src/lib/utils/capacitor.ts:54-87
proposed_fix: >
  Move the throttle into triggerHaptic itself so every call site is covered.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-005
severity: P2
evidence_label: SOURCE
related_prior_ids: [G23]
summary: >
  Cache-clear at viewDidLoad races the page load it precedes textually but not
  temporally (async, empty completion handler, issued after super.viewDidLoad());
  wipes disk+memory HTTP cache (not cookies/localStorage/IndexedDB/SW) on every
  cold launch with no version-aware policy.
source_ranges:
  - ios/App/App/GolfBridgeViewController.swift:22-28
  - ios/App/App/SceneDelegate.swift:16-37,75-84
proposed_fix: >
  Key the clear off a stored release identifier (C01); only clear when the
  deployed SHA changed; issue it before the load begins.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-006
severity: P2
evidence_label: SOURCE
related_prior_ids: [G07]
summary: >
  FairwayBottomNav fires a selection haptic on every tab tap, including a
  repeat-tap of the already-active tab; segmented.tsx correctly suppresses this
  via Radix's single-select semantics.
source_ranges:
  - src/components/fairway/app-shell/FairwayBottomNav.tsx:148-166
  - src/components/fairway/controls/segmented.tsx:291-308
proposed_fix: Guard the onClick with the already-computed `active` value.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-007
severity: P2
evidence_label: RISK
related_prior_ids: []
summary: >
  Document/image/PDF "Download" actions build a synthetic <a download> pointed
  at a cross-origin signed URL with no Content-Disposition:attachment; WebKit
  does not honor `download` cross-origin. Two sibling components in the same
  codebase already do this correctly via fetch->blob->objectURL.
source_ranges:
  - src/app/golf/actions/documents.ts:1099-1107
  - src/components/golf/documents/DocumentPreview.tsx:127-140
  - src/components/golf/documents/ImagePreview.tsx:60-70
  - src/components/golf/documents/PDFViewer.tsx:58-66
  - src/components/fairway/pages/recruiting/FairwayRecruitDocuments.tsx:160-172
  - src/components/golf/documents/TextPreview.tsx:120-138
  - src/components/fairway/pages/documents/FairwayDocuments.tsx:670-680
  - capacitor.config.ts:25
proposed_fix: >
  Reuse the existing fetch->blob->createObjectURL pattern from TextPreview.tsx /
  FairwayDocuments.tsx in the four broken call sites, or add
  `{ download: true }` to createSignedUrl.
owner_lane: shared change requested (documents feature owner, not A01)
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-008
severity: P3
evidence_label: RISK
related_prior_ids: [G07]
summary: >
  fwHapticSequence's delayed beats (setTimeout, no cancel handle) can fire after
  the triggering action is interrupted. Only live call site (golf-sign-in-form.tsx
  'commit') has a narrow, currently-unexploited race; 'reject'/'celebrate' have
  no live caller at all.
source_ranges:
  - src/lib/fairway/haptics.ts:143-157
  - src/components/auth/golf-sign-in-form.tsx:145-152
  - src/components/golf/PullToRefresh.tsx:150-160
proposed_fix: Return a cancel() handle from fwHapticSequence; call it on interruption.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}

id: A01-009
severity: P3
evidence_label: SOURCE
related_prior_ids: [G09]
summary: >
  capacitor.config.ts's Keyboard.scrollAssist/scrollPadding are not declared by
  the installed @capacitor/keyboard@8.0.5 plugin at all (verified in
  node_modules types) — dead config, not a native scroll-assist layer. This
  REFUTES G09's "duplicate resize" framing at this baseline: the JS-side
  --keyboard-height/scrollIntoView triad is the sole real mechanism, and it is
  already coordinated with data-fw-keyboard-aware opt-outs and covered by
  keyboard-inset.test.ts.
source_ranges:
  - capacitor.config.ts:62-68
  - src/components/providers/CapacitorProvider.tsx:125-192
  - src/app/globals.css:392-424
proposed_fix: >
  Remove scrollAssist/scrollPadding or comment them as historical no-ops;
  consider resize: 'none'/'body' instead of the also-no-op 'ionic' value.
verification: {unit: NOT_RUN, integrated: NOT_RUN, device: NOT_RUN}
```

### Verified PASS / infrastructure notes (not defects, recorded for coverage)

- **Keyboard-aware opt-out system is correctly designed.** `Sheet.tsx:203`,
  `ModalShell.tsx:306`, `AskSurface.tsx:132`, `CoachHelmDrawer.tsx:177`,
  `FairwayMessages.tsx:493` all carry `data-fw-keyboard-aware`, which
  `CapacitorProvider.tsx:159-168`'s global `keyboardWillShow` handler explicitly
  checks (`!active.closest('[data-fw-keyboard-aware]')`) before scrolling — verified
  by `src/components/fairway/overlays/keyboard-inset.test.ts`. No double-scroll found.
- **Preference gate for selection/scrub haptics is sound.** `selectionStart`/
  `selectionChanged`/`selectionEnd`/`triggerSelectionHaptic` in
  `src/lib/utils/capacitor.ts:107-144` have no callers outside `haptics.ts`
  (verified by repo-wide grep at this baseline), so the `areHapticsEnabled()` gates
  in `fwHaptic`/`fwScrub` (`haptics.ts:131-194`) fully cover them. This directly
  contradicts G07's "differing preference enforcement" framing for the
  selection/scrub path specifically — record it as refuted for that sub-claim,
  while A01-002/A01-004 confirm other parts of G07 remain live.
- **Native Core Haptics signature system (`HelmHapticsPlugin.swift`,
  `src/lib/native/helm-haptics.ts`, `src/lib/native/capabilities.ts`) is real,
  well-built, and deliberately not wired into any product flow yet** — the only
  caller is the dev/demo haptics page, matching its own documented
  "do not wire until owner sign-off" comment. Not a defect; listed as `NOT_RUN`/
  not-mounted in the coverage ledger, not `PASS`.
- **`@capacitor/share` is a declared dependency with zero imports anywhere in the
  app.** The one share affordance found (`LineupBuilder.tsx:155-157`, baseball
  scope) uses the raw Web Share API directly, which WKWebView supports natively.
  Not a defect — a cleanup note.
- **`fwHapticSequence`'s `reject` and `celebrate` patterns have no live product
  caller** at this baseline — only the dev/demo haptics picker invokes them.
  Dead code, not a live defect; listed separately in the coverage ledger.
- **Splash-screen timeout policy is already correctly designed.**
  `capacitor.config.ts:71-78`'s comment and `launchShowDuration: 10000` are
  explicitly documented as a ceiling/watchdog, not a target duration, and the
  real hide path (`hideSplashScreen()` in `CapacitorProvider.tsx:81-87`) fires
  after two `requestAnimationFrame`s post-mount. No safety-timeout-as-target
  anti-pattern found.
- **`allowNavigation`/native-photo-file-share handoffs**: no `@capacitor/camera`
  or `@capacitor/filesystem` usage exists anywhere in the app (grep-confirmed).
  The one verified-safe external-handoff path, `openExternalUrl` →
  `Browser.open()` (`capacitor.ts:42-52`), correctly routes through
  `SFSafariViewController`, which never touches the main WKWebView's `.url` and
  so never risks tripping the A01-001 classifier — used correctly by
  `CalendarSyncButton.tsx`, `DocumentPreview.tsx`'s "Open externally" action
  (distinct from its broken "Download" action, A01-007), and the announcement
  card components.

## Coverage ledger

| Area | Status |
| --- | --- |
| `ios/App/App/GolfBridgeViewController.swift` (cold-launch cache clear, background/opacity colors, URL classifier) | `FINDING:A01-001`, `FINDING:A01-003`, `FINDING:A01-005` |
| `ios/App/App/SceneDelegate.swift` (root VC lifecycle, foreground/background hooks, onNavigateAway) | `FINDING:A01-001`, `FINDING:A01-005` |
| `ios/App/App/HelmHapticsPlugin.swift` (native Core Haptics bridge) | `NOT_RUN:not mounted in any product flow at this baseline (dev/demo page only); infra verified sound` |
| `ios/App/App/Info.plist`, `App.entitlements`, `LaunchScreen.storyboard` | `FINDING:A01-003` (color mismatch); no `UIUserInterfaceStyle`/native-signing issue otherwise |
| `public/.well-known/apple-app-site-association` | `FINDING:A01-001` (baseball manifestation) |
| `capacitor.config.ts` (server/allowNavigation/ios/android/plugins) | `FINDING:A01-009` (dead keyboard keys); `PASS` on splash timeout policy; `RISK:A01-007` (allowNavigation boundary) |
| `src/components/providers/CapacitorProvider.tsx` | `PASS` (keyboard compensation, splash hide, theme observer, push-token flush all verified correct); contributes evidence to `A01-003`/`A01-009` |
| `src/lib/utils/capacitor.ts` | `PASS` (preference/native gating on all exported primitives); `FINDING:A01-004` (throttle not reached from here) |
| `src/lib/fairway/haptics.ts` | `FINDING:A01-002`, `FINDING:A01-004`, `FINDING:A01-008`; `PASS` on preference gating for selection/scrub |
| `src/lib/native/capabilities.ts` | `PASS` — well-built C01-shaped capability/build-gating system, no defect found |
| `src/lib/native/helm-haptics.ts` | `NOT_RUN:not mounted in any product flow at this baseline` |
| `src/components/fairway/controls/button.tsx` | `FINDING:A01-002` (auto-haptic contributor) |
| `src/components/fairway/feedback/ToastStack.tsx` | `FINDING:A01-002` (haptic contributor) |
| `src/components/fairway/app-shell/FairwayBottomNav.tsx` | `FINDING:A01-006`; shared with A02 per plan §3.3 |
| `src/components/fairway/controls/segmented.tsx` | `PASS` (same-value suppression verified via Radix semantics) |
| `src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx`, `FairwayTeamSettings.tsx` | `FINDING:A01-002` (haptic pileup, repeated pattern) |
| Keyboard-aware opt-out consumers: `Sheet.tsx`, `ModalShell.tsx`, `AskSurface.tsx`, `CoachHelmDrawer.tsx`, `FairwayMessages.tsx` (golf/shared scope) | `PASS` (verified against `keyboard-inset.test.ts`) |
| `src/app/globals.css` keyboard/safe-area rules | `PASS` (`--keyboard-height`, `body.keyboard-open`, `scroll-margin-*` all correctly wired to the single JS mechanism) |
| `src/components/auth/golf-sign-in-form.tsx` | `FINDING:A01-001` (welcome/admin redirect chain); `FINDING:A01-008` (commit-sequence timing, low risk) |
| `src/app/golf/(auth)/welcome/page.tsx` | `FINDING:A01-001` |
| `src/components/NativeRedirect.tsx`, `src/app/page.tsx` | `FINDING:A01-001` |
| `src/lib/golf/admin-redirect.ts`, `src/lib/utils/safe-redirect.ts` | `FINDING:A01-001` (web-side evidence) |
| `src/components/baseball/command-center/BaseballInviteButton.tsx` | `FINDING:A01-001` (baseball manifestation); baseball scope read for shared-infra reasons only, no proposal owned here |
| Document/file handoffs: `documents.ts`, `DocumentPreview.tsx`, `ImagePreview.tsx`, `PDFViewer.tsx`, `FairwayRecruitDocuments.tsx`, `TextPreview.tsx`, `FairwayDocuments.tsx` | `RISK:A01-007` (broken 4), `PASS` (correct 2) |
| `@capacitor/share` dependency | `NOT_RUN:unused dependency, no live consumer to test` |
| Physical haptic feel/quality, launch/foreground timing, actual overscroll/dark-mode flash, WebKit cross-origin download-attribute runtime behavior, cache-clear/load race timing under real network conditions | `NOT_RUN:no device/simulator available this phase` |

### Dead / non-mounted paths (excluded from coverage above)

- `src/lib/native/helm-haptics.ts` / `HelmHapticsPlugin.swift` — real, correct, not live.
- `fwHapticSequence`'s `reject`/`celebrate` patterns — defined, never called from product code.
- `@capacitor/share` — installed, never imported.

## Contracts requested

- **C05 (Viewport/overlay)**: needs a documented "native background/color owner"
  field alongside the existing keyboard/safe-area fields — A01-003 shows the
  native shell's own background color is currently outside any contract.
- **C06 (Feedback)**: needs the "one feedback owner per operation" rule made
  literal — currently three components (Button, handler, Toast) each believe
  they own the haptic for one outcome (A01-002). Recommend the contract specify
  that only the *result-reporting* layer (toast/outcome state) fires an outcome
  haptic; the *input-acknowledgment* layer (Button) is limited to a pre-result
  'light' tap only.
- **C01 (Release identity)**: A01-005's proposed version-aware cache-clear policy
  needs a stored "last known deployed SHA" field, which C01 is positioned to own.

## Shared changes requested

- **A02 (BottomNav owner per plan §3.3)**: apply the `active`-gated haptic fix in
  `FairwayBottomNav.tsx:166` (A01-006) — A01 supplies the haptic-contract
  reasoning, A02 owns the file.
- **Documents feature owner (not explicitly assigned in the Section 6 lane list)**:
  fix the four broken Download call sites in A01-007 by reusing the existing
  blob pattern from `TextPreview.tsx`/`FairwayDocuments.tsx`.
- **A03 (component craft)**: review every `triggerHaptic('success'|'error')` call
  site that immediately precedes a `fairwayToast` call of the matching kind
  (A01-002) — this pattern recurs beyond the two files cited here; a full sweep
  is a component-standardization task, not a native-bridge one.

## Open questions for the owner

- Is `/admin` genuinely still reachable from the native app in practice, or does
  some other guard (App Store review restrictions, a feature flag) prevent the
  super-admin account from ever using the native binary? If the account is
  web-only by policy, A01-001's admin manifestation is lower real-world
  frequency than its baseball-invite manifestation, but the code permits both
  and the fix is the same either way.
- Should `/baseball/*` universal links even be registered under GolfHelm's iOS
  app ID if BaseballHelm has no native app of its own in this repository? If a
  separate BaseballHelm app exists outside this repo with its own bundle ID,
  the AASA may need per-appID path scoping instead of one shared entry — that
  is a product/release decision, not a code fix A01 can make unilaterally.
- Is the `#EDE0C8` vs `#FFFEFA` splash/webview color mismatch (A01-003)
  intentional (e.g. deliberately meant to read as "kraft envelope opening to a
  brighter page") or an oversight? The design-tokens.css comment calling
  `#FFFEFA` "cold" suggests the latter, but this is a design call the owner
  should confirm before A03/A01 pick a single reconciled color.

## Messaging referrals

- `src/components/fairway/pages/messages/FairwayMessages.tsx:493` carries the
  `data-fw-keyboard-aware` opt-out and was read only to confirm the keyboard
  system's coordination (A01-009 supporting evidence). No messaging-specific
  defect was found or investigated; no proposal is made against it.
- `src/components/fairway/pages/messages/MessageComposer.tsx` and
  `MessageThreadPane.tsx` appeared in the initial repo-wide keyboard/safe-area
  grep but were not opened — out of scope per WORKER_BRIEF.md §5. Flagging only
  that they exist as keyboard-height consumers in case the messaging program's
  own audit has not already covered them.

## NOT_RUN ledger

| Check | Missing dependency | Next owner |
| --- | --- | --- |
| End-to-end reproduction of A01-001 (admin login bounce, baseball invite bounce) on a real device/simulator | iOS device or simulator with the built app, a super-admin test account, and a real/simulated Universal Link tap | A00/A12 device pass |
| Whether WKWebView's KVO on `.url` actually fires for a Next.js `router.replace` (History API) same-document navigation, confirming A01-001's final link | Device/simulator trace (Safari Web Inspector attached to the native WebView) | A00/A12 |
| Visible confirmation of the A01-003 dark-mode background flash / splash-to-content color seam | Device/simulator, dark-mode toggle, screen recording | A00/A12 device pass |
| Actual WebKit runtime behavior for a `download`-attribute click on a cross-origin URL inside this specific Capacitor bridge (A01-007) | Device/simulator with network inspector | A00/A12 |
| Physical haptic quality/timing for all haptic findings (A01-002, A01-004, A01-006, A01-008) | Physical iOS device, owner sign-off per plan §11.3/§13 | Owner + A12 |
| Actual cold-launch time cost of the disk/memory cache clear (A01-005) under realistic network conditions | Device + network profiling harness | A11 |
| Whether `/admin` is reachable from the native binary in production practice (frequency, not mechanism) | Production analytics or owner confirmation | A00/owner |

## Section 12 seed verification

- **G07** (multiple haptic paths, differing preference/cancel behavior, timed
  sequences): **partially still present, more precisely characterized.**
  Preference enforcement for selection/scrub is sound (no external callers of
  the raw selection primitives — refutes that sub-claim). The real, confirmed
  live issues are: (a) three-deep haptic stacking for one outcome (A01-002),
  (b) the rate limiter only covering a minority of call sites (A01-004),
  (c) same-value reselect firing a haptic in `FairwayBottomNav` (A01-006), and
  (d) an uncancellable delayed-sequence architecture with one narrow, currently
  unexploited live race (A01-008).
- **G09** (Ionic resize + manual compensation needing one verified geometry
  contract): **refuted as "duplicate"; a different, minor defect found instead.**
  There is no duplicate resize mechanism. `resize: 'ionic'` is a no-op (no
  `ion-app` in this non-Ionic app); `scrollAssist`/`scrollPadding` are not even
  declared by the installed plugin version (verified in `node_modules` types,
  not just docs) and are dead config; `resizeOnFullScreen` is Android-only. The
  JS-side `--keyboard-height`/`scrollIntoView` system is the sole real
  mechanism, is deliberately coordinated with `data-fw-keyboard-aware`
  opt-outs, and is covered by an existing test. See A01-009 for the (low
  severity) misleading-dead-config finding this verification produced instead.
- **G23** (native controller deletes disk/memory caches at view load; measure
  before changing policy): **still present, frequency and scope now precisely
  characterized.** Fires once per cold launch (root VC is created once per
  scene session in `SceneDelegate.swift`; foreground/background hooks are
  empty no-ops, so this is not a per-foreground cost). Clears only
  `WKWebsiteDataTypeDiskCache`/`MemoryCache` — cookies, LocalStorage,
  IndexedDB, and Service Worker registrations are untouched, so offline/durable
  data (e.g. the round-sync outbox) is safe. New evidence found beyond the
  seed: the clear is issued asynchronously *after* `super.viewDidLoad()` has
  already started the page load, so it may race the very load it targets
  (A01-005). Recommend a version-aware policy per the seed's own guidance, not
  removal of the safeguard.
- **G24** (substring navigation classifier plus native login reload callback):
  **still present, and materially worse than the seed's framing** — this audit
  found two concrete, currently-reachable same-origin destinations
  (`/admin`, `/baseball/join/<code>`) that the classifier misclassifies, not
  merely a theoretical risk (A01-001). The A08 half of this seed (native
  photo/file/share/map/auth handoffs) found no native Camera/Filesystem plugin
  usage in the app at all; the one verified external-handoff path
  (`openExternalUrl`/`Browser.open()`) correctly avoids the classifier
  entirely by never touching the main WebView's URL.
