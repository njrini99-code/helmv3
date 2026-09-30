# Stats (player) checklist

Reference: design/handoff/Stats.html, stats.jsx, stats-game.jsx, stats-game.css, stats-sheet.jsx, screenshots/stats-player-01..14
Route: /golf/dashboard/stats?player=<id> (coach) and /golf/dashboard/stats (player, own profile)
Surface tag: `stats.player.<overview|game|rounds|development|focus>`

Player permissions: a player always sees their own profile (`?player` is ignored), compared against D1 only,
with no team figures, no roster pager and no focus-area editor. Reads go through the same RLS-scoped client
and `getDetailedStats` access gate the current app uses.

Shared changes from the Team stats pass that already reach this view (start the player pass from them):
- Yardage-page notes sit 10px under their chart, as in the design system (`.ch-yb .ch-yb__note`; the base reset had removed the margin). 1e598e651
- Card and yardage-page headings are ink-900 (`--ch-text-primary`) instead of the app's global heading colour. 1e598e651
- `loadRoundCache` (stats-common) reads its id chunks in parallel. 1e598e651
- `StatsSkeleton`, this view's loading state too, has line and card heights sized to the loaded Team stats, not to this profile. f4a4df5bc
- `SectionBoundary` wraps each section in a `Suspense`, so a section that crashes on the server render no longer fails the page (D-24). cee2c2024
- The shell loads `domMax` lazily, so `layoutId` slides now run: the tab and window switch pills slide (220ms), unless motion is reduced (D-25). 576a6331c, 314b03055

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

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): no rounds yet says what will appear and the one next step
- [x] Early read: under three rounds, form and trends say "early read" instead of grading
- [x] Partial failure: rounds, shot detail and development each carry their own flag and inline notice with Try again; shot detail that comes back empty while rounds exist counts as a failure, not as empty
- [x] Crash containment: every tab panel is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view
- [x] Not found and no access: a player id not on the coach's team gets a "not on your team" state with a way back; a player can't view anyone else; a failed membership read raises the route error view, never "no team"
- [ ] Offline or slow network: the window switch and focus-area save say so instead of spinning forever
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
- [ ] Every failure path was forced once locally and seen in the console or Sentry

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
- [x] Transitions use only 90, 150, 220 and 360ms with the Clubhouse ease
- [x] Press scales to 0.985 on every tappable surface
- [x] No count-ups and no entrance staggers; data is final on mount
- [ ] Reduced motion is honoured through `useChReducedMotion` (tab and sheet transitions checked with the OS setting on)
- [x] Haptics: select for tabs, pagers and chips; press for primary buttons; commit, success and error for outcomes

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
