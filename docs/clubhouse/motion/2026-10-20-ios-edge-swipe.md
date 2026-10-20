# Motion report: iOS edge swipe on pushed Clubhouse screens (PR #2217), 2026-10-20

Simulator evidence, not a real iPhone. The branch is `claude/clubhouse-edge-swipe` at `59901807a`, checked out in `~/worktrees/helmv3/clubhouse-edge-swipe-ios`. Evidence stays out of git, in `~/worktrees/helmv3/clubhouse-mac-gates/.helm/scratch/ios/` (`b-log.txt`, `b-edge.mp4`, `b-drag-tiles.png`, `b-67-8.png`, `b-9-10.png`, `flows/b-*.yaml`, `xcodebuild-edge.log`).

## Environment

| | |
| --- | --- |
| Commit | `59901807a` (PR #2217, on origin/main `6f8be2302`), plus local-only test patches (below), never committed |
| Build | Debug build for the Simulator (`xcodebuild`), web side `next dev` (Turbopack) from a `git archive` of the branch at `http://localhost:3200`, local Supabase, seeded coach |
| Device | Simulator, iPhone 18 Pro, iOS 27.0 (UDID 11F1F1B0-0321-43E0-8097-090F5E688450); not a real iPhone |
| Touch | Maestro 2.11 (XCTest driver), `swipe` from 1% of the width; the iOS Simulator control tool was not approved for taps |
| Power / network | Mac on mains, localhost |
| Data | seeded team "Perf University Golf", coach "Dana" |

Local-only patches (applied for the build, reverted afterwards): a Simulator origin in `capacitor.config.json` and `SceneDelegate.swift`, `NSLog("[helm-nav] ...")` and `NSLog("[helm-swipe] native=... tracking=... overlay=... web=...")` after `applySwipeBack()`, and an env-driven sign-in hook. The branch's own Swift is otherwise as pushed.

## Instruments

| Instrument | State | Used for |
| --- | --- | --- |
| Safari MCP / Web Inspector | not used | `webContentsDebuggingEnabled` is false, so `window.__helmNativeSwipe` was read from the Swift log instead of the page |
| Simulator | used | the app, `simctl io recordVideo`, `simctl spawn log stream` |
| Maestro | used | taps and edge swipes |
| Real iPhone | not used | NOT VERIFIED |

## Scenario

Sign in as the seeded coach, open Roster, tap a player (a pushed profile with a chevron Back), then: a slow short edge swipe (1% to 18% in 1.2 s, released before the 35% mark), a fast edge swipe (1% to 75% in 0.5 s), open the Invite players sheet and edge swipe with it open, close it, and edge swipe on the root list.

## Results

| Check (from the PR body) | Result | Evidence |
| --- | --- | --- |
| The Swift compiles | PASS | `xcodebuild` BUILD SUCCEEDED, no errors and no warnings from `GolfBridgeViewController.swift` (`xcodebuild-edge.log`); no fix needed on the branch |
| A pushed screen claims the web swipe | PASS | tapping a player logged `[helm-swipe] native=0 tracking=0 overlay=0 web=1` |
| The swipe drags only the page layer; the status area and the green frame stay fixed | PASS (by frames) | `b-drag-tiles.png`, 10 frames of the fast swipe: the pushed screen slides right with its own top bar while the Roster list moves in beneath it on the parallax; the dark green status area and frame do not move. This is not WKWebView's snapshot of the whole web view |
| Cancel (released before the commit mark) | PASS | after the 18% swipe the profile is still up (`b-67-8.png`, middle), no state change in the log |
| Commit pops the screen | PASS | the 75% swipe returned to the Roster list (`b-67-8.png`, right); the claim was released: `native=1 ... web=0` |
| An open sheet blocks both | PASS | with Invite players open: `native=0 overlay=1`; the edge swipe changed nothing on screen (`b-9-10.png`) and logged nothing; closing it logged `native=1 overlay=0` |
| Root pages keep the native back swipe | NOT VERIFIED (state only) | on the root Roster list the log reads `native=1 web=0`, so `allowsBackForwardNavigationGestures` is on, but the Maestro swipe (from 0% and 1%) did not navigate: XCTest's synthetic touch did not start WKWebView's system edge gesture here, so the native animation itself was not seen |
| No gesture on `/golf/dashboard/rounds/new` | NOT VERIFIED | needs a player login (a coach has no "Start a round"); the relaunch as the seeded player stayed signed in as the coach |
| Cold start or reload on a deep link re-claims through `__helmWebSwipeResync` | NOT VERIFIED | not run |
| Leaving `/golf/` turns the native back swipe on | NOT VERIFIED | not run |
| `offline.html` unchanged; an old build against this web code behaves as today | NOT VERIFIED | not run here; the offline loop was verified separately in `2026-10-20-ios-launch-and-offline.md` on main |

## Findings

None against the branch. The Back label the flow looked for was not found by text (the pushed top bar reads "Roster"), which is a test-flow detail, not an app finding.

## Fix

None made.

## After

Not applicable.

## Verdict

PASS for the six checks the Simulator could drive (compile, claim, page-layer-only drag, cancel, commit, sheet block). NOT VERIFIED: the native back gesture on root pages (state logged, gesture not triggerable by synthetic touch), the tracking route, deep-link re-claim, leaving `/golf/`, and anything on a real iPhone. Checklist left for the owner on a real iPhone or by hand in the Simulator: root-page swipe still plays WKWebView's own back; no swipe on a round being tracked; a deep link into a pushed screen swipes back correctly after a cold start.
