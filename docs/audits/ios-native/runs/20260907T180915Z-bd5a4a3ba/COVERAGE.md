# Journey coverage

`layer` — B = WebKit browser, N = native simulator, P = physical iPhone.
A `B` result never satisfies an `N` or `P` requirement.

| journey | layer | device | settings | role | shellBuild | webRevision | result | evidence | blockingReason | findings |
|---|---|---|---|---|---|---|---|---|---|---|
| J01 cold launch | N | iPhone 17 sim, iOS 26.5 | light, default text | coach (pre-existing session) | 2.0 (10) | unverified | PASS | `native/j01-run2/*.png` | — | F-BRAND-01 |
| J01 background→foreground | N/P | — | — | — | — | — | NOT_RUN | — | Warm-resume needs a process-preserving background, which `simctl launch` does not model; the honest check is on a device | — |
| J02 sign in | B | WebKit iPhone 13 | light + dark + reduced-motion | signed out | n/a | live | PASS (render + axe, post-settle) | `webkit/results.json` | Submission deliberately not exercised; 12 contrast nodes axe cannot sample | F-CONTRAST-01 (retracted) |
| J02 autofill, expired session, deep-link returnTo | P | — | — | — | — | — | NOT_RUN | — | Needs a physical device and a fixture account | — |
| J03 tab navigation, scroll restoration, unsaved-work guard | N | — | — | — | — | — | BLOCKED | `native/snapshot-dashboard.txt` | UI automation cannot select any element — see F-A11Y-NATIVE-01. Manual driving is possible but was not run | F-A11Y-NATIVE-01 |
| J04 sheets: drag, cancel, dismiss, reopen | N/P | — | — | — | — | — | NOT_RUN | — | Same selector blocker; the drag/interrupt half needs a finger regardless | — |
| J05 messages composer + keyboard | N/P | — | — | — | — | — | BLOCKED | — | Read-only authorization only; no test send | F-KBD-AUTOFOCUS-01 (source-level) |
| J06 shot entry | N/P | — | — | — | — | — | BLOCKED | — | Creates round data on production | — |
| J07 hole completion, induced failure, retry | N | — | — | — | — | — | BLOCKED | — | Requires writing and then deliberately failing a save against production | — |
| J08 draft durability, offline, process termination | N/P | — | — | — | — | — | BLOCKED | — | Requires a draft, which requires a write | — |
| J09 universal links, notification entry | N/P | — | — | — | — | — | NOT_RUN | — | Notification entry needs a designated test device | — |
| J10 inputs, validation, destructive confirm | B/N/P | — | — | — | — | — | NOT_RUN | — | Partially reachable read-only; not attempted this run | — |
| J11 VoiceOver, Dynamic Type, contrast | B | WebKit iPhone 13 | light + dark | signed out | n/a | live | PARTIAL | `webkit/axe-by-project.json` | VoiceOver and Dynamic Type are device-only | F-A11Y-NATIVE-01 |
| J12 transition/repeat-input performance | N | iPhone 17 sim | light | coach | 2.0 (10) | unverified | PARTIAL | `native/j01-run2/*.png` | Only launch timing was measured, on a simulator, n=2 | — |

## What the launch measurement actually says

Two runs on one simulator, screenshots at 0.2s intervals, change detected by
frame-size delta:

- flat splash from ~t+0.2s to ~t+2.6s
- first partial paint t+2.8s
- full paint t+3.0s
- settled t+5.2s

This is a simulator on host wifi against production, with the WKWebView disk and
memory cache cleared at launch by `GolfBridgeViewController` but DNS and TLS
warm. It is a usable baseline for comparing future runs on the same setup. It is
**not** a device number and n=2 is far too few for a percentile — §9's own rule
is 30 comparable trials before a p95 is discussed.

An earlier first attempt at this measurement was discarded: the sleep targets
were computed against a timestamp captured in a previous shell invocation, so
every screenshot fired at once and the whole series showed the same frame. The
numbers above come from a rerun with launch and capture inside a single process.
