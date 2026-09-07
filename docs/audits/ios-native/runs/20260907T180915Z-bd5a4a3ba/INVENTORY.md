# Inventory — what was established before any finding was written

## Identities

| Identity | Value | How established |
|---|---|---|
| Checkout | `agent/ios-native-experience-audit` @ `bd5a4a3ba20d`, clean | fresh worktree via `scripts/new-worktree.sh --keep` |
| Shell source | same commit | the binary was built from this checkout |
| Binary | `com.helmsportslabs.golfhelm` 2.0 (10), Release, product name **`Helm Sports Labs.app`** | `PlistBuddy` on the built bundle |
| Web revision | **unknown** | `capacitor.config.ts` pins the shell to `https://www.helmsportslabs.com/golf/dashboard`; no deployment evidence was available |
| Backend | production, no staging copy | the config's hardcoded origin |
| Device | iPhone 17 simulator, iOS 26.5 | `simctl list devices available` |
| Account | coach, "Demo University Golf" | a session already present in the simulator's WebView data store |

The web revision matters and is genuinely unknown. The session-start hook
reported 18 commits merged to `main` but not yet in production, so the app the
shell rendered is some older revision than `bd5a4a3ba20d`. Every web-layer
finding here therefore describes **what is live**, which is the right target for
an experience audit but is not the same thing as what is in `main`.

## The runbook's own error, corrected

Section 7.3 hardcodes `App.app` as the build product. The actual product is
`Helm Sports Labs.app`; `test -d` on the documented path fails silently and
`PlistBuddy` then cheerfully offers to create the missing plist rather than
erroring. Anyone following that section literally gets four "Does Not Exist"
lines and no artifact. The path must come from the build, not from the document.

## Feature classification

| Native feature | Classification | Basis |
|---|---|---|
| Portrait lock | present, runtime-verified | compiled `Info.plist` |
| Dark/Tinted app icon | present, runtime-verified | compiled `Assets.car` via `assetutil` |
| Splash + hide-on-ready | present, runtime-verified | cold-launch frame series |
| WKWebView cache clear scoped to disk/memory | present, not runtime-verified | source only; the persisting session is consistent with it |
| Haptics preference gate | present, not runtime-verified | a simulator cannot render haptics |
| Push registration park-then-flush | present, not runtime-verified | needs a device and a designated test account |
| Universal links | present, not runtime-verified | not exercised this run |
| Keyboard `--keyboard-height` contract | present, not runtime-verified | the contract test is a unit test; no device check |
| Native accessibility projection | **absent at the automation layer** | see F-A11Y-NATIVE-01 |
| Native UI test target | absent | no XCTest/XCUITest target under `ios/` |

## Scanner scope truth

HIG Doctor 2.0.3 scanned 3258 code + 23 style files and reported 959 concerns.
Filtered to what the iPhone shell can actually render — `src/app/golf/**`,
`src/components/{fairway,golf,ui,providers,icons}/**`, `src/styles/**`,
`src/app/globals.css`, and the Swift shell — 344 remain. The rest are in
`landing/`, `tools/`, `public/`, and BaseballHelm surfaces.

Of the 195 scoped `web/svg-without-a11y` "critical" hits, 128 are in
`src/components/icons/index.tsx`, where every icon spreads `{...p}` and callers
pass `aria-hidden` at the usage site. The scanner cannot see the caller, so
those are false positives by construction. The remaining 67 are inline `<svg>`
at call sites and need per-site review; a sample (`golf/(auth)/login/page.tsx:117`)
sits inside a link that already carries `aria-label="Back to home"`, so the
unlabelled child is inert rather than harmful.

**No count in this document should be read as a defect count.** The single
scoped rule that produced a real, actionable finding was `web/auto-focus`.
