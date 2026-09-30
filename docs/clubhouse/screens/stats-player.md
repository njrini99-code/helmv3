# Stats (player) checklist

Reference: design/handoff/Stats.html, stats.jsx, stats-game.jsx, stats-game.css, stats-sheet.jsx, screenshots/stats-player-01..14
Route: /golf/dashboard/stats?player=<id> (coach) and /golf/dashboard/stats (player, own profile)
Surface tag: `stats.player.<overview|game|rounds|development|focus>`

Player permissions: a player always sees their own profile (`?player` is ignored), compared against the Tour only,
with no team figures, no roster pager and no focus-area editor. Reads go through the same RLS-scoped client
and `getDetailedStats` access gate the current app uses.

Shared changes from the Team stats pass that already reach this view (start the player pass from them):
- Yardage-page notes sit 10px under their chart, as in the design system (`.ch-yb .ch-yb__note`; the base reset had removed the margin). 1e598e651
- Card and yardage-page headings are ink-900 (`--ch-text-primary`) instead of the app's global heading colour. 1e598e651
- `loadRoundCache` (stats-common) reads its id chunks in parallel. 1e598e651
- `StatsSkeleton`, this view's loading state too, has line and card heights sized to the loaded Team stats, not to this profile. f4a4df5bc
- `SectionBoundary` wraps each section in a `Suspense`, so a section that crashes on the server render no longer fails the page (D-24). cee2c2024
- The shell loads `domMax` lazily, so `layoutId` slides now run: the tab and window switch pills slide (220ms), unless motion is reduced (D-25). 576a6331c, 314b03055

## parity (2026-09-30, `docs/clubhouse/pages/P005-stats-player/PARITY.md`)
- [x] Every production player-stats figure is shown, or named with a reason ("not shown because"); the Tour is the only benchmark (Q-88)
- [x] Every section says which rounds it counts (the window's own 18-hole rounds) and every shot-level figure reads exactly those rounds
- [x] Every new panel has an empty or low-sample state with a catalog code and a test (CH-5209 to CH-5212, CH-5311 to CH-5319)
- [x] A player's view shows no team figure on any new row (Q-91)
- [x] Native-feel and axe scans of the new sections at 390, 430 and 1280px (`native.mjs` and `a11y.mjs` on stats-player, exit 0; see VERIFY.md)

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md
- [x] Every control is mapped to an existing server action (`createFocusArea`), or to a migration that has to be written (never applied by an agent)
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md

## desktop
- [x] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [x] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [x] Red appears only for under par, birdies and the pin flag; gains are green and losses amber
- [x] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead
- [x] A narrow canvas (container below 860px) reflows without horizontal page scroll

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data
- [x] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked
- [x] Null, zero and "early read" render differently, and windows and samples are stated
- [x] Round dates are calendar dates (UTC noon, no zone shift); weeks start Monday
- [x] Unit tests cover the window math, weighted rates, tour choice and week bucketing (`logic.test.ts`, "stats windows")
- [x] `?tab=overview|game|rounds|dev` opens that tab, and anything else opens Overview (D-53).
  - Roster's "All N" links to `window=season&tab=rounds`, whose count matches Roster's.
  - Evidence: `stats-player.test.tsx` › "Stats player · opened from a link" (2 tests), commit 041ef83ee.
  - No new state, so no catalog row.

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): no rounds yet says what will appear and the one next step
- [x] Early read: under three rounds, form and trends say "early read" instead of grading
- [x] Partial failure: rounds, shot detail and development each carry their own flag and inline notice with Try again; shot detail that comes back empty while rounds exist counts as a failure, not as empty
- [x] Crash containment: every tab panel is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view
- [x] Not found and no access: a player id not on the coach's team gets a "not on your team" state with a way back; a player can't view anyone else; a failed membership read raises the route error view, never "no team". Proved in stats-player.test (50803, 50804, 50611): the player's own id is always used, ?player= is never read for a player, an id that isn't shaped like one makes no read, a pending or removed member isn't on the team, and a failed player or membership read throws (it used to render "not on your team")
- [x] Offline or slow network: the window switch and focus-area save say so instead of spinning forever (CH-5901 offline: nothing is requested and the switch stays put; CH-5902 slow: one notice after 5 seconds; the focus-area save is the shell's CH-1903 and CH-1902 through `useAction`. Forced in stats-player.test, desktop and phone; not forced in a browser)
- [x] User errors: adding a focus area goes through `useAction`, with a specific failure message, an error haptic and a Sentry event
- [x] Forms: the focus-area sheet validates before submit, keeps input on failure and disables while pending
- [x] N/A: no destructive actions on this screen
- [x] N/A: no optimistic updates on this screen

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (open, filter, submit)
- [x] No `catch` swallows an error without reporting or handling it on screen
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry (open, merge pass: forced in stats-player.test, which asserts each read's `chLogServer` name, each tab crash's `chReport` and the focus-area failure's; not yet seen in the console or Sentry)

## phone-spec
- [ ] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop
- [ ] The owner approved it (the file says `Status: approved`)

## phone
- [ ] Built at 390px and 430px, respecting the safe areas
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent
- [ ] Sheets are used instead of popovers, and they drag to dismiss
- [ ] The bottom tab bar and toasts don't overlap content
- [ ] Checked in the iOS app shell (Capacitor), with native haptics felt on a device

## motion
<!-- Rewritten for v2 motion (D-64) and v2 haptics (D-70) on 2026-09-29; earlier evidence was against the old timings, so every box starts again. -->
- [ ] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [ ] Haptics follow v2 (D-70): selection for tabs, segmented controls, switches and choices; light for primary buttons; success for Post, Save, Send, Share, Assign and Got it; warning for Remove, Delete, Discard and Dismiss; medium only for a sheet settling or a shot logged; error when an import or sync fails; every other tap silent

## accessibility
Verified by `stats-player.test.tsx` (CH-58xx) and `npm run clubhouse:a11y`; states catalogued in `docs/clubhouse/catalog/stats-player.md`.
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [x] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] Charts have a text equivalent (aria-label or a view-as-table path)
- [x] Status changes are announced (aria-live) and errors use role=alert
- [x] Text contrast meets WCAG AA on every surface

## performance
- [ ] No request waterfall on the server, with independent reads in parallel
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily
- [ ] No layout shift after first paint

## verified
- [ ] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md
- [ ] Owner review of the built screen
