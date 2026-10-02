# P001 — Shell: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md` (row
"Foundation"); the per-gate checklist is `docs/clubhouse/screens/foundation.md`.

## Current verification status

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

## Open verification gaps

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
