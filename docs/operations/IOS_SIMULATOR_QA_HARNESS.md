# iOS Simulator QA Harness

> Added 2026-08-26 during the iOS premium update. How agent sessions and
> humans drive authed QA of the Capacitor shell in the iOS Simulator.

## Test accounts

QA fixture credentials live in `.env.local` (gitignored) under the same
variables the Playwright harness reads (`e2e/fixtures/golf-auth.ts`):

```text
GOLFHELM_PLAYER_EMAIL / GOLFHELM_PLAYER_PASSWORD
GOLFHELM_COACH_EMAIL  / GOLFHELM_COACH_PASSWORD
```

They are owner-provided QA fixtures on the Demo University Golf team. Never
commit them, never print them into logs or docs.

## Web-layer authed QA (preferred for breadth)

Playwright with the worker fixtures against production renders the exact
content the shell shows:

```bash
set -a; source .env.local; set +a
PLAYWRIGHT_BASE_URL=https://www.helmsportslabs.com npx playwright test <spec>
```

App Store screenshots use `e2e/appstore-screenshots.spec.ts` at 440×956@3x
(= 1320×2868 px, the accepted 6.9" size).

## Native-shell authed QA (for safe areas, status bar, haptics, push)

1. Build + install: `xcodebuild -project ios/App/App.xcodeproj -scheme App
   -configuration Debug -destination 'generic/platform=iOS Simulator' build`,
   then `xcrun simctl install <udid> "<DerivedData>/…/Helm Sports Labs.app"`.
2. Log in ONCE per device through the login form using the fixture
   credentials (simulator HID input driven by the QA tooling, or by hand).
   The WKWebView session persists across relaunches AND reinstalls (the
   shell's cache clear touches disk/memory cache only, never cookies), so
   this is a per-device one-time step.
3. Known session origins: the session is scoped to `www.helmsportslabs.com`.
   Pointing `capacitor.config.ts` at localhost for dev does NOT reuse it —
   and the shell's navigation allowlist sends non-helm origins to Safari by
   design; don't weaken `allowNavigation` for QA.
4. Useful simctl verbs: `io <udid> screenshot`, `ui <udid> appearance
   dark|light`, `openurl <udid> <universal-link>`, `push <udid>
   com.helmsportslabs.golfhelm payload.json`, `bootstatus <udid> -b`.

## Durable follow-up (P2)

Add an XCUITest target with a `LoginRobot` that reads the same env vars, so
native authed QA runs headless in CI (CircleCI `ios` workflow) instead of
via HID scripting. Tracked in the premium audit's P2 list.
