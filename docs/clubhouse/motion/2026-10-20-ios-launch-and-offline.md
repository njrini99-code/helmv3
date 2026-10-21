# Motion report: iOS offline cold start and launch colour, 2026-10-20

<!-- markdownlint-disable MD013 -->

Simulator evidence, not a real iPhone. Evidence files stay out of git, in
`~/worktrees/helmv3/clubhouse-mac-gates/.helm/scratch/ios/` (names below).

## Environment

| | |
| --- | --- |
| Commit | `6f8be2302` (origin/main), plus local-only test patches (see Method) |
| Build | Debug build for the Simulator, `xcodebuild`, never committed |
| Device | Simulator, iPhone 18 Pro, iOS 27.0 (UDID 11F1F1B0-0321-43E0-8097-090F5E688450) |
| Viewport | 1206 x 2622 px recording |
| Network | origin `http://localhost:3299`, a Node server that accepts a TCP connection and resets it (`refuser.mjs`), standing in for an unreachable origin |
| Power | Simulator, not applicable |
| Data | none, the app never reaches a Helm page |

## Instruments

| Instrument | State | Used for |
| --- | --- | --- |
| Safari MCP | not used | the app is a native shell, not a Safari tab |
| Web Inspector Timelines | not used | `webContentsDebuggingEnabled` is false in the shipped config |
| Simulator | used | the app, `simctl io recordVideo`, `simctl spawn log stream` |
| Real iPhone + Animation Hitches | not used | NOT VERIFIED on device |
| Playwright WebKit | not used | |
| ffmpeg | used | frame extraction, per-frame edge colour at 30 fps |

## Scenario

1. Cold launch with the origin unreachable. Count every observed navigation of the WKWebView (`[helm-nav]` NSLog added by a local patch) and every connection the app makes to the origin, over 35 s.
2. Same launch on a control build where `GolfBridgeViewController.isBundledPage` is forced to `false` (the behaviour before D-78).
3. Recovery: the origin refuses for 12 s, then serves `/golf/dashboard`. The bundled `offline.html` retries.
4. Launch colour, light and dark appearance: sample a 16 px patch at the left edge, mid height, of every frame of the launch recording.

## Before (control, `isBundledPage` returns false)

35 s, one launch:

- 1598 `NAVIGATE-AWAY fired` lines, 4793 navigation lines, 6513 origin connections. A reload loop: `offline.html` is treated as leaving golf, the SceneDelegate reloads the sign-in, that fails, the error page loads again.
- Files: `control-nav.log`, `control-refuser.log`, `control.mp4`, `xcodebuild-control.log`.

An earlier run of the same control by the previous worker, same method, counted 677 and 2741 over the same window; the counts differ run to run, the loop is the finding.

## Findings

| # | Error | Effect | Confidence | Fix |
| --- | --- | --- | --- | --- |
| 1 | None in the shipped code: the D-78 guard holds | | Simulator only | none |
| 2 | In the Simulator the splash stays up about 12 s over the offline page, and `offline.html` appears under the fading splash (frame 14.4 s in `fixed.mp4`) | an offline cold start shows the splash, not the offline page, for the first seconds | low: the refuser resets the connection and retries 5 times in 8 s, real airplane mode fails faster. Re-measure on a device | check `SplashScreen` `launchShowDuration` and `launchAutoHide` in `capacitor.config.ts` against the time to the first error page |
| 3 | Between tapping the icon and the launch screen the Simulator shows about 1.4 s of pure black (2.37 s to 3.77 s in `fixed.mp4`, `fixed-dark.mp4`) | none by itself, same in light and dark | low: a Debug build with `.debug.dylib` on a machine with load average above 30 | none, re-check on a device |

Root cause for the fix: `isBundledPage` returns true for `capacitor://` and `file://`, and `offline.html` on localhost, so the URL observer returns before the navigate-away branch.

## Fix

None made here. The code on main already contains the fix.

## After (fixed build, current main)

| Measure | Control | Fixed |
| --- | --- | --- |
| Navigations in 35 s | 4793 | 1 (`capacitor://localhost/offline.html bundled=1`) |
| `NAVIGATE-AWAY` | 1598 | 0 |
| Origin connections | 6513 | 5, all in the first 8.4 s, none after |

Files: `fixed-nav.log`, `fixed-refuser.log`, `fixed.mp4`.

Recovery (`recover-origin.log`, `recover-nav.log`, `recover.mp4`, `recover-final.png`): the origin served again at 12.3 s; the page retried and the WebView went to `http://localhost:3299/golf/dashboard` at 22 s, no navigate-away, the page rendered. Caveat: `offline.html`'s retry is hard coded to the production URL, so for this run only the built copy's `offline.html` had that URL swapped for the local origin and the retry timer set to 22 s (the app's native code was unchanged). The shipped retry to production was not exercised, to avoid a request to production.

Launch colour (`fixed.mp4`, `fixed-dark.mp4`, sampled at 30 fps):

| Appearance | Launch screen | WebView / offline page | Token |
| --- | --- | --- | --- |
| Light | `#F1E5D1` | `#F1E5D1`, no step | `--fw-color-canvas` `#F2E6D2` (one level of video encode drift) |
| Dark | settles at `#0C0F0C` | no step | `#0D0F0D` |

The colour fades from black to the canvas in about 0.3 s once the launch screen draws, then stays constant through the splash and the offline page, in both appearances. No white or off-colour flash. The first Clubhouse paint was not measured here: it needs a signed-in cold launch against a Clubhouse origin (not done in this run).

## Verdict

Offline cold start: PASS in the Simulator (no reload loop, recovers when the origin returns, with the retry URL swapped). Launch colour: PASS in the Simulator for the launch screen to offline page path, light and dark. NOT VERIFIED: a real iPhone, a signed-in cold launch to the first Clubhouse paint, the production retry URL, and a real no-network launch (airplane mode).

Method for repeating it: `.helm/scratch/ios/build-variant.sh <control|fixed> <port>` patches the native files temporarily (local origin, `NSLog`, Package.swift path to the shared `node_modules`), builds with `xcodebuild`, then reverts them; `run-offline.sh <label> <derivedData> <seconds>` launches against the refuser and records. Nothing from those patches is committed.
