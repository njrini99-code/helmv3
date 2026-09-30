# Stats (team) checklist

Reference: design/handoff/Stats.html, stats.jsx, stats.css, stats-sg.jsx, screenshots/stats-team-01..05
Route: /golf/dashboard/stats (coach)   Surface tag: `stats.team.<figures|trend|legs|putting|bests|export>`
Window: `?window=last10|season|qualifiers` (last 10 per player by default)

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md
- [x] Every control is mapped to an existing server action, or to a migration that has to be written (never applied by an agent)
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md

## desktop
- [x] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [x] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [x] Red appears only for under par and the pin flag; gains are green and losses amber
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
- [x] Empty (first run): no rounds yet says stats fill in as players post countable rounds; no team has its own state
- [x] Empty (window): a window with no rounds (for example no qualifiers yet) says why and offers the season
- [x] Partial failure: rounds, members, cache, putts and D1 each carry their own flag and inline notice with Try again
- [x] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view
- [x] Not found and no access: a coach without a team gets the no-team state; players get their own profile instead
- [x] Offline or slow network: the window switch says so instead of spinning forever (CH-4901 offline: nothing is requested and the switch stays put; CH-4902 slow: one notice after 5 seconds. Forced in stats-team.test and in the browser with Playwright offline and a held request)
- [x] User errors: export failure gives a specific toast, an error haptic and a Sentry event
- [x] The old address `/stats/team` renders this page in place for coaches, with this page's skeleton, and sends players to their own stats (D-23)
- [x] N/A: no forms on this screen
- [x] N/A: no destructive actions on this screen
- [x] N/A: no optimistic updates on this screen

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (open, filter, submit)
- [x] No `catch` swallows an error without reporting or handling it on screen
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [x] Every failure path was forced once locally and seen in the console or Sentry (stats-team.test forces the rounds, roster, team, round cache, putts and D1 reads, each asserting its `chLogServer`, plus the five section crashes (high) and the export (low), each asserting its `chReport`. The preview's failed, partial, empty, crash and loading states were loaded in the browser with the console read. The crash state found that a section crash on the server render failed the whole page; each section now has a Suspense inside its boundary)

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
- [x] Reduced motion is honoured through `useChReducedMotion` (tab and sheet transitions checked with the OS setting on). With Playwright `reducedMotion: reduce`, every Stats transition (page dim, leg cards, trend lines, grid rows, the switches) drops from 150 and 90ms to 0.01ms (the app-wide rule in globals.css), and toasts go through the hook. This page has no sheets
- [x] Haptics: select for tabs, pagers and chips; press for primary buttons; commit, success and error for outcomes

## accessibility
Verified by `stats-team.test.tsx` (CH-48xx) and `npm run clubhouse:a11y`; states catalogued in `docs/clubhouse/catalog/stats-team.md`.
- [x] Full keyboard path, with visible focus and no traps; Esc closes overlays. Tab reaches, in reading order: the window switch (arrows move it), Export, the measure switch, each player, each leg card (Enter/Space), each grid row and each season best, then leaves the page. Every stop has a ring; grid rows use an inset ring, because an outset one is clipped by the scroller. N/A for Esc: this page has no overlays
- [x] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] Charts have a text equivalent (aria-label or a view-as-table path)
- [x] Status changes are announced (aria-live) and errors use role=alert
- [x] Text contrast meets WCAG AA on every surface

## performance
- [x] No request waterfall on the server, with independent reads in parallel. `loadTeamStats` reads the team and roster together. The season's rounds need the roster's ids; the D1 read is already in flight beside them. The round cache, the putts and D1 then load together, with each id chunk in parallel, and one cache read now serves the window, the previous window and the bests (it had been read twice)
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily (open: `StatsTeam` is one client tree, so the figures, putting and bests ship as client code although they are static; and the shell loads framer's `domAnimation` eagerly, not through a dynamic import)
- [x] No layout shift after first paint (PerformanceObserver on the preview: CLS 0.0001 at 924px and 0 at 1280px on load. Choosing a lens, leg or player and scrolling adds only input-driven shifts. The route skeleton was sized to the loaded page: the header, first figure card and trend card now start at the same place at 924, 1100, 1280, 1400 and 1600px. At 1280px the trend card had dropped 40px when data landed. The phone width waits for the phone gate)

## verified
- [x] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md
- [ ] Owner review of the built screen
