# P001 — Shell: verification

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

Shared Menu, TeamSwitch, OfflineBanner and Toast now use zero-duration
transitions when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## Current release evidence — 2026-10-06

Navigation crossfade, Back/Forward scroll restoration, Bell, More and team
switch.

Nested overlays must retain scroll and restore focus; check keyboard dismissal
and VoiceOver isolation.

Fresh WebKit 26.6: `/clubhouse-preview/settings` at
375, 430 and 1280px; zero Axe A/AA violations and no horizontal document
overflow in these three fixture renders. The 430px full-page screenshot
was inspected and recorded below. This does not exercise every popup.
Clubhouse runtime suites: 117 files / 3,092 tests pass on this branch.
External action suites listed in WIRING are outside that count.

Additional WebKit base check: 320px also fits without horizontal overflow
and reports zero Axe violations. The state/opener inventory completes 5
cases for this page at applicable 1280/390px widths with zero Axe
violations or document overflow.

Current browser/test results: [all-page
audit](../../ALL_PAGE_AUDIT.md#p001-shell). Current status remains partial.
Physical Safari/iPhone, VoiceOver and durable authenticated writes remain
separate acceptance checks. Earlier verification status and gap sections below
are historical observations; use the current audit for release scope.
<!-- clubhouse:release-audit:end -->

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md` (row
"Foundation"); the per-gate checklist is `docs/clubhouse/screens/foundation.md`.

## 2026-10-19 — Phone shell gestures (lane L10)

Observed in headless WebKit (Playwright), 390x844 at 2x, light and dark, on the dev server, with touch events scripted from the page
(`touchstart` at x 8, then `touchmove`s, then `touchend`): `/clubhouse-preview/roster` (coach, profile pushed),
`/clubhouse-preview/messages` (thread, then its details), `/clubhouse-preview/qualifier`. Screenshots are in the table below.

- Edge swipe, roster profile. Mid drag the screen sat at the finger (offset 92px at x 100) and the page, bar included, was drawn
  back and dimmed under it; past the mark (x 190) the same. Letting go at 52px after a pause sprang back: the screen's inline
  `translate` was cleared and the page's parts returned to drawn back (-12.8vw at an offset of 182px, -24vw at rest). Letting go past the mark
  popped it: per-frame samples of the screen's left edge, the bar's and the page's after release: 182, 257, 298, 327, 370, 385, 388,
  390 px over about 430ms, with the bar and the page returning in step (-50 to 0 and -30 to 20 px, no gap opened between the edges),
  then the screen was gone, `.ch-pscreen` count 0, the URL unchanged, no part left with a translate.
- A thread under its details (Messages): the thread beneath moved with the drag (its own translate 46px at an offset of 192px over its
  -24% transform); on release the thread's left edge went -47.5, -24.3, -14.3, -8.3, -4.8 ... 0 over about 420ms, and the sampler found no frame
  where it moved left beyond one 0.1px step at rest, for a drag release and for a fast flick (the positions are from before the screen beneath
  was given the plain smooth spring for its translate; the two runs after it found the same: no step back beyond that 0.1px).
- Vertical-first travel, a start outside the left 20px, a start under an open dialog, on a round route and in the iOS app without the
  native flag: covered by `shell/__tests__/edge-swipe.test.tsx` and `phone-shell-gestures.test.tsx` (jsdom), not by a capture.
- Dock kept over a push: with `?round=1` the Resume round accessory is in the dock at the page and stays visible (dock not `hidden`,
  its page slot `display: none`) while the profile is pushed, once `shell/Dock.tsx` reads `dockKept`; the screen stops at 73px of
  padding above it, and after Back the dock is still shown. The screenshots marked `dock-forced-visible` were taken earlier with
  `hidden` cleared by hand, before that edit; same layout. A fresh capture without forcing was read but not filed.
- Stand-in action, `/clubhouse-preview/qualifier` (coach): the server's first paint has the Qualifier actions key at the same place
  (x 338, 44px wide) as the page's own bar after hydration. The bar's centred title "Qualifier" is hidden (opacity 0) in the server's
  first paint and visible after: the server draws the desktop markup, whose `.ch-qf-head h1` matches the large-title hide rule
  (shell.css), and the phone markup that replaces it does not. Not changed here.
- Messages' "New message": before hydration the shell's root bar draws the title and the bell at x 16 and x 338 (44px); after it the page's bar has
  the title at x 16 and the New message key in the slot at x 338. The geometry holds; the glyph changes from the bell to the key. Not
  changed here (TopBar, not this lane's file).
- Not observed: a physical iPhone (Safari's own edge swipe against this one, haptics, VoiceOver after a swipe pop), the iOS app
  (the native flag does not exist yet), the idle prefetch in a production build (Next prefetches only there; the ordering and the cap
  are in `phone-prefetch-sweep.test.tsx` against a mocked router).
- Targeted tests: `npx vitest run src/clubhouse/shell/__tests__/` 6 files, 75 tests pass (exit 0); the 37 test files that import
  PhoneScreen, phone-chrome or the prefetch hook, 1,642 tests pass (exit 0); `npx eslint` on the changed files exit 0; `npm run typecheck`
  reports one error, in `shell/command/__tests__/command-layer.test.tsx` (lane L1), none in this lane's files;
  `npm run clubhouse:check` exit 0.

## 2026-10-02 — Request-lifetime slow feedback

- Focused verification: 21 unique cases pass, exit 0. These are 11 cases in
  `toast-timers.test.tsx` and 10 selected CH-1902 / CH-4902 / CH-5902 cases
  across `shell`, `stats-team`, `stats-player`, `messages` and `settings`
  tests. Other page cases were not run in this focused selection.
- Toast cases verify visible-notice abort, timer/listener cleanup on timeout,
  eviction, scope change and unmount, and the unchanged 4-second confirmation
  and 8-second error durations. Scheduling still uses the 5-second threshold.
- Delayed feedback ends on settlement, replacement, unmount or team-scope
  change. Stale ShowToast and scheduling callbacks cannot revive a prior
  scope, including A → B → A returns. New-scope layout-effect registrations
  retain their timers/listeners through old-scope passive cleanup.
- Page/action cases verify settled and replaced Stats feedback, Settings
  notification and CoachHelm saves, shared-action success feedback, and a
  Messages mute failure whose error remains after its slow notice disappears.
  Writes, queues, busy guards, refusal/retry and quiet success remain intact.
- Scoped ESLint for 13 changed source/test files and the final two-file Toast
  scope repair passed, exit 0. Diff check passed, exit 0. This entry claims no
  subsequent optimized-build, browser, physical-device or production result.

## Historical verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (draft PR #2102)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | see CHANGELOG for the latest run |
| Lint | `npx eslint <changed files>` | see CHANGELOG |
| Clubhouse check (registry and contract) | `npm run -s clubhouse:check` | see CHANGELOG |
| Knowledge check | `npm run -s docs:check` | see CHANGELOG |
| Build | `NODE_OPTIONS=--max-old-space-size=8192 npm run build` | exit 0 on 2c5cf01b6 (before the v2 motion and navigation) |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/shell.test.tsx` | every shell catalog row of kinds 0 to 5; 1611, 1701 to 1703, 1801 to 1811, 1906; the hand contracts 10102, 10301, 10802, 10901, 11301, 11401, 11402, 11901, 12301 | pass (2026-09-30) |
| `src/clubhouse/__tests__/gate.test.ts` | 10801 | pass (2026-09-30) |
| `src/clubhouse/__tests__/motion.test.tsx`, `native.test.tsx` | 11606, 11608 and the native bridge | pass |
| `scripts/clubhouse/__tests__/check.test.mjs` | 12401 | pass |

Mutation checks (2026-09-30): with Mark all read's rollback removed, 11301
fails; with the frame ignoring the viewer's role, 10102/10802 fails. Both were
restored.

## Visual verification

### Desktop

```text
Viewport:  1280px (dev server on :3100, node Playwright script)
Reference: design/handoff/gh-nav.js, sidebar.css
Result:    the v2 navigation, the reveal, the skeleton delay and reduced motion checked 2026-09-29 (PROGRESS log)
```

### Phone

```text
Viewport:     390 × 844
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    docs/clubhouse/phone/foundation.md
Result:       tab bars per role and the More sheet checked 2026-09-29; the iPhone pass is open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Bell loading, empty, filtered, failed | 10201, 10402, 10403, 10602 | tests; `/clubhouse-preview` bell states | as catalogued |
| Mark all read fails | 10601, 11301 | test | toast with Retry; rows put back |
| Route errors | 10603 to 10607 | tests (all five kinds); `/clubhouse-preview/home?state=error` (the unknown kind) | each view with its own words |
| Offline | 10701, 10703, 10704 | tests | banner; nothing sent; Try again says offline |
| Slow save | 10702 | test (fake timers) | "Still saving…" once |
| Not rebuilt / role | 10401, 10802 | tests | the notice, never the page |
| Sidebar reads fail | 10608, 10609 | tests (loader against a fake client) | card and badge hide; logged |

Not forced against a live session: a real chunk-load after a deploy, and a real
5xx.

## Accessibility

```text
Keyboard:       Skip to content (11801); the More sheet and the phone bell keep Tab inside and return focus (11802, 11811).
VoiceOver:      not tried on a device.
Focus:          pushed screens take focus on their title (11809).
Reduced motion: sheets don't drag; the press, reveal, skeleton fade and shimmer are off (tests and browser check).
Contrast:       clubhouse:a11y ran before the v2 changes; the rerun is open.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: the shell's three reads run in parallel; the attendance read follows only when there is an event
Animation:         v2 tokens only; the animation features load after first paint (D-25)
Notes:             LCP and INP come only from sampled Sentry tracing (12101)
```

## The push ask in the app (2026-10-16, CH-1910, blocker 12)

- Tests: `src/clubhouse/shell/__tests__/push-ask.test.tsx` (12: the settle wait, the quiet routes and a navigation
  restarting the wait, a sheet open or a field focused holding it, the role's copy, Turn on with iOS allowing and not
  allowing, the sheet waiting while iOS's prompt is up, Not now and every other close kept and never asked again, once
  a launch) and `src/lib/utils/__tests__/native-push-permission.test.ts` (the shared read never prompts).
- Browser: the preview draws the sheet open with `&ask=push` (`/clubhouse-preview/home-player?ask=push`,
  `/clubhouse-preview/home?ask=push`). The before capture is filed below; the after captures were not taken: from about
  18:30 on 2026-10-16 no headless browser would launch on this machine (WebKit aborted at start, Chromium failed its
  Mach bootstrap check-in), so the sheet has not been looked at in a browser.
- Not verified: on a device. The device pass should start the app signed in on a fresh install, wait on Home, see the
  ask once, answer Turn on and see iOS's prompt, then confirm a test push arrives; and on a second install answer Not
  now and confirm it never comes back.

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by `npm run
clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is
before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |
| `P001__filter-body__coach__375__overlay-lifecycle__after__72fa726.png` | after | 72fa726 | filter-body (coach), 375px, overlay-lifecycle |
| `P001__filter-body__coach__375__overlay-lifecycle__before__72fa726.png` | before | 72fa726 | filter-body (coach), 375px, overlay-lifecycle |
| `P001__more-stable__coach__390__overlay-lifecycle__evidence__72fa726.png` | evidence | 72fa726 | more-stable (coach), 390px, overlay-lifecycle |
| `P001__nested-details__coach__390__overlay-lifecycle__evidence__72fa726.png` | evidence | 72fa726 | nested-details (coach), 390px, overlay-lifecycle |
| `P001__filter-sheet__coach__1440__keyboard-viewport__after__c1e81e0.png` | after | c1e81e0 | filter-sheet (coach), 1440px, keyboard-viewport; /clubhouse-preview/stats |
| `P001__release-audit__coach__430x844__ready__evidence__8ee4060.png` | evidence | 8ee4060 | release-audit (coach), 430x844px, ready |
| `P001__more__coach__390x844__reduced-motion__before__ee0bab8.png` | before | ee0bab8 | more (coach), 390x844px, reduced-motion |
| `P001__more__coach__390x844__reduced-motion__after__ee0bab8.png` | after | ee0bab8 | more (coach), 390x844px, reduced-motion |
| `P001__modal-stress__coach__320x568__popup-audit__after__43a146a.png` | after | 43a146a | modal-stress (coach), 320x568px, popup-audit; local synthetic preview; 43a146a plus working-tree popup and depth repairs |
| `P001__modal-stress__coach__320x568__popup-audit__before__43a146a.png` | before | 43a146a | modal-stress (coach), 320x568px, popup-audit; local synthetic preview; 43a146a baseline |
| `P001__premium-audit__coach__1280__case-001-chromium-normal__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (coach), 1280px, case-001-chromium-normal; /clubhouse-preview/settings; synthetic preview |
| `P001__premium-audit__coach__390__case-001-chromium-normal__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (coach), 390px, case-001-chromium-normal; /clubhouse-preview/settings; synthetic preview |
| `P001__hero-bell__coach__390__home__after__d22efe2.png` | after | d22efe2 | hero-bell (coach), 390px, home |
| `P001__hero-bell__coach__390__home__before__96dcb84.png` | before | 96dcb84 | hero-bell (coach), 390px, home |
| `P001__pushed-bar__coach__390__roster-loading__after__d22efe2.png` | after | d22efe2 | pushed-bar (coach), 390px, roster-loading |
| `P001__pushed-bar__coach__390__roster-loading__before__96dcb84.png` | before | 96dcb84 | pushed-bar (coach), 390px, roster-loading |
| `P001__pushed-screen-bar__coach__390__recruiting-detail__after__d22efe2.png` | after | d22efe2 | pushed-screen-bar (coach), 390px, recruiting-detail |
| `P001__pushed-screen-bar__coach__390__recruiting-detail__before__96dcb84.png` | before | 96dcb84 | pushed-screen-bar (coach), 390px, recruiting-detail |
| `P001__segmented-press__coach__390__held__evidence__d22efe2.png` | evidence | d22efe2 | segmented-press (coach), 390px, held |
| `P001__sheet-close__coach__390__title-only__after__d22efe2.png` | after | d22efe2 | sheet-close (coach), 390px, title-only |
| `P001__sheet-close__coach__390__title-only__before__96dcb84.png` | before | 96dcb84 | sheet-close (coach), 390px, title-only |
| `P001__form-bar__coach__390x844__qualifier-new-loading__after__834fa2c.png` | after | 834fa2c | form-bar (coach), 390x844px, qualifier-new-loading; clubhouse-preview |
| `P001__form-bar__coach__390x844__qualifier-new-loading__before__4141d68.png` | before | 4141d68 | form-bar (coach), 390x844px, qualifier-new-loading; clubhouse-preview |
| `P001__hero-bell__coach__390__keyboard-focus__evidence__c1af28d.png` | evidence | c1af28d | hero-bell (coach), 390px, keyboard-focus; clubhouse-preview |
| `P001__pushed-profile__coach__390x844__at-rest__before__a438a92.png` | before | a438a92 | pushed-profile (coach), 390x844px, at-rest |
| `P001__pushed-profile__coach__390x844__dock-kept-dock-forced-visible__evidence__a438a92.png` | evidence | a438a92 | pushed-profile (coach), 390x844px, dock-kept-dock-forced-visible |
| `P001__pushed-profile__coach__390x844__dock-kept-dock-forced-visible-dark__evidence__a438a92.png` | evidence | a438a92 | pushed-profile (coach), 390x844px, dock-kept-dock-forced-visible-dark |
| `P001__pushed-profile__coach__390x844__edge-swipe-commit-140ms__after__a438a92.png` | after | a438a92 | pushed-profile (coach), 390x844px, edge-swipe-commit-140ms |
| `P001__pushed-profile__coach__390x844__edge-swipe-commit-140ms-dark__after__a438a92.png` | after | a438a92 | pushed-profile (coach), 390x844px, edge-swipe-commit-140ms-dark |
| `P001__pushed-profile__coach__390x844__edge-swipe-mid-drag__after__a438a92.png` | after | a438a92 | pushed-profile (coach), 390x844px, edge-swipe-mid-drag |
| `P001__pushed-profile__coach__390x844__edge-swipe-past-mark__after__a438a92.png` | after | a438a92 | pushed-profile (coach), 390x844px, edge-swipe-past-mark |
| `P001__pushed-profile__coach__390x844__edge-swipe-past-mark-dark__after__a438a92.png` | after | a438a92 | pushed-profile (coach), 390x844px, edge-swipe-past-mark-dark |
| `P001__pushed-profile__coach__390x844__edge-swipe-spring-back-80ms__after__a438a92.png` | after | a438a92 | pushed-profile (coach), 390x844px, edge-swipe-spring-back-80ms |
| `P001__qualifier-bar__coach__390x844__page-own-bar__after__a438a92.png` | after | a438a92 | qualifier-bar (coach), 390x844px, page-own-bar |
| `P001__qualifier-bar__coach__390x844__page-own-bar-dark__after__a438a92.png` | after | a438a92 | qualifier-bar (coach), 390x844px, page-own-bar-dark |
| `P001__qualifier-bar__coach__390x844__stand-in-server-first-paint__evidence__a438a92.png` | evidence | a438a92 | qualifier-bar (coach), 390x844px, stand-in-server-first-paint |
| `P001__qualifier-bar__coach__390x844__stand-in-server-first-paint-dark__evidence__a438a92.png` | evidence | a438a92 | qualifier-bar (coach), 390x844px, stand-in-server-first-paint-dark |
| `P001__thread-details__coach__390x844__edge-swipe-nested-mid-drag__after__a438a92.png` | after | a438a92 | thread-details (coach), 390x844px, edge-swipe-nested-mid-drag |
| `P001__push-ask__player__390__home-settled__before__22e5426.png` | before | 22e5426 | Player home at 390 (WebKit, preview), 4s after load: Clubhouse has no push ask (the current app's is not mounted here) |

## Historical verification gaps

- The iPhone pass (owner).
- `clubhouse:a11y` rerun after the v2 changes.
- The route boundary's automatic retry is tested only through the view (11401),
  not the boundary.
- A Clubhouse-side detector for rage, dead and slow clicks does not exist (12201
  to 12203).

## 2026-10-02 — Overlay scroll, focus and gesture lifecycle

- `vitest run overlay-scroll.test.tsx shell.test.tsx --maxWorkers=1`:59 pass,
  exit 0. Seven focused regressions cover nested lock counts, exact
  styles/canvas
  restoration, route changes, unmount release, distinct dialog titles, canceled
  and competing pointers, paused flick speed, and rapid close/reopen.
- Scoped ESLint on the helper, drag, Modal, PhoneScreen, TabBar, Bell and test:
  exit 0. Root owns combined typecheck/build. Shared primitives are reported as
  semantically unmapped; existing P 001 manifest governs them.
- Fresh WebKit 375/390/430: More opens over a page scrolled 300px. Its content
  marker stays exactly −250px before/open/PageDown/during 60ms exit/after close;
  final window scroll restores 300px. Stats Filter keeps its page marker 50px,
  scrolls its own long body, and holds native dialog+lock until exit completes.
- Fresh WebKit 375/390/430: Message modal over a thread, then Details over that
  thread. Closing either child retains the thread's lock. Details fills each
  viewport, underlying thread is inert, final Back releases the last lock.
  All document widths equal viewport widths. More receives focus after close.
- Actual pointer flow exposed the stale-speed defect: move 35px, pause 350ms,
  release wrongly dismissed. Final run springs back and keeps More open;
  a subsequent 120px drag dismisses and returns focus to More. No extra
  animation delay: the fix stops counting an old move as a current flick.
- Reduced-motion WebKit: More opens at transform:none and is removed with the
  lock released within 50ms after Close. The native modal reduced-motion branch
  skips its exit animation.
- Evidence JSON/captures: `/tmp/helm-clubhouse-overlay-stability/`. The
  screenshot
  table logs actual filed images; still images do not prove frame pacing.
- Setup limitations: mobile WebKit does not support mouse.wheel; native PageDown
  and real pointer mouse events exercise scrolling and gesture ownership.
  Message actions is screen-reader-only and was activated with focus+Enter.
  One first messages load timed out under development compilation and succeeded
  after DOMContentLoaded/settling. No physical Safari FPS, edge gesture,
  keyboard
  or production persistence claim; no production writes.

## 2026-10-02 — Custom native overlay lifetime

- Before captures in `/tmp/helm-clubhouse-custom-overlays/`: Settings Profile
  and
  Recruiting Add opened without a body scroll lock. A real History pointer drag
  moved left 35px, paused 350ms, and wrongly dismissed on release.
- Shared lifetime now retains the last open content and lock through
  transform/opacity
  exit, cancels superseded completions, restores focus with `preventScroll`,
  and closes before releasing the lock on unmount. Dirty/busy guards are
  preserved.
- Final scoped runs cover 351 tests: Settings, Recruiting, Ask, shell, overlay
  scroll and seven new custom lifecycle regressions. The old Ask pointer fixture
  now identifies its primary pointer; its original assertions/timeouts remain.
  Final Ask rerun:54 pass, exit0. Final helper/scroll rerun after releasing
  retained
  subtree references:14 pass, exit0. Scoped ESLint and diff check: exit0.
- New shared/helper and Settings/History files are semantically unmapped and
  reported
  to the coordinator; existing page manifests govern them. Recruiting maps to
  `memory/features/recruiting.md`, updated with the client lifecycle contract.
- Fresh WebKit 375/390/430: Settings/Recruiting form tops54px, keyboard-visible
  bottom544px at844px height with a synthetic300px keyboard. Before, both tops
  were−246px and their headers were offscreen. Settings cards retain full row
  heights in the scrolling body; Full name input307–339px and header85–129px.
  Recruiting body scroll reaches Stage/Notes while Cancel/Add remain accessible.
- Nested Settings discard prompt fits341.625–544px; closing it retains the
  parent's lock. Both native dialogs/content remain during60ms exit; completing
  all closes releases the final lock. Existing dirty/busy policy is unchanged.
- History settled frames explicitly await entry animations: left0, width322.5px
  at375 or330px at390/430, height544px above the synthetic keyboard. A35px left
  drag held350ms stays open;120px closes with lock held through exit. Earlier
  mid-entry captures were superseded after manual review, not accepted as final.
- Keyboard Enter→Esc returns focus to Profile, Add prospect and Chats at every
  tested width. Shared Modal at1440 retains its lock/content through60ms exit;
  reduced-motion Recruiting releases the lock within50ms, without an exit slide.
- Fresh shared Modal on Stats at375/390/430 over scroll300px: marker−250px
  before,
  open, PageDown,60ms exit and after. Final scroll restores300px. Short
  Recruiting
  fixtures have no300px scroll range, so their scroll-zero checks are not
  presented
  as long-page preservation evidence.
- Final evidence: `final-matrix.json`, `focus-final.json`, `settled-final.json`,
  `stats-scroll-final.json` and manually reviewed PNGs in
  `/tmp/helm-clubhouse-custom-overlays/`; conventional captures logged above.
  Browser session `overlay-audit` closed. Local ENOSPC/old-session timeouts were
  resolved before final proof; development/HMR timings are not product timings.
  No production/customer writes or physical-iPhone keyboard, edge-gesture or
  frame-pacing claim. Root owns combined typecheck/build/release verification.

## Repair verification — 2026-10-06

Shared motion and thread regressions pass within the 3,100-test Clubhouse/
appearance run; full typecheck and mapped travel checks pass. See the global
[repair acceptance](../../SMOOTHNESS_AUDIT.md#repair-acceptance--2026-10-06)
for timing, screenshots and the physical-device limits.

## Premium audit matrix — 2026-10-06

5 synthetic captures are recorded for this page family. The table above
keeps representative viewport/browser evidence; the complete state/opener
ledger and review limitations are in the
[premium audit](../../PREMIUM_AUDIT.md) and its machine evidence file.
Captured states are not all visually approved.

## 2026-10-08 — The approved motion set (CH-1618 to CH-1622, CH-1709, CH-1909)

Browser observations only: WebKit through Playwright at 390 by 844 with touch,
and 1440 for the desktop canvas, sampled once a frame against the dev server.
Nothing here was seen on an iPhone.

- CH-1618: on Messages, Roster and Recruiting the bars, the tab bar and the
  list draw back to −94px as the screen lands, within a pixel of 0.24 times its
  travel on every frame, the scrim on the same curve. A pop at about 160ms
  reverses both from there. A Back with `hasUAVisualTransition` (patched in)
  clears the screen, the page and the scrim in one frame. Details over a thread
  draws the thread back and veils it. A sheet opened from a pushed screen keeps
  its place (left 0, no moved ancestor). Reduced motion and Animations off hold
  the page still. Scrolled 300px, the top bar stays at the top (before: −300px).
- CH-1619: a page replacing Roster's route skeleton after a navigation went
  from opacity 0 to 1 in about 100ms; none on a first paint or with reduced
  motion.
- CH-1620: held, the thumb grew from 19 to 22.8px wide from its resting edge
  (27 to 32.4px in Settings) and settled round on release; none with reduced
  motion or Animations off.
- CH-1621: synthetic fractional wheel steps eased; whole-pixel steps passed
  through untouched, and stopped a glide where it was.
- CH-1622, CH-1709, CH-1909: simulated touches with the app's body class: a
  220px pull reached 108px, turned the spinner at 64px, sent one refresh, held
  at 52px and sprang home once the read landed. Short, upward and Safari pulls
  did nothing.

Open on a device: the WebView's own bounce under a pull, the medium tap, the
edge-swipe Back, a real trackpad and mouse, and a live route's `loading.tsx`.
