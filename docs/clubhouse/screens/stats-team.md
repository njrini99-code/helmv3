# Stats (team) checklist

Reference: design/handoff/Stats.html, stats.jsx, stats.css, stats-sg.jsx, screenshots/stats-team-01..05
Route: /golf/dashboard/stats (coach)   Surface tag: `stats.team.<figures|trend|legs|putting|bests|export>`
Window: `?window=last10|season|qualifiers` (last 10 per player by default)

## round filter (2026-09-30)

- [x] One filter (round type, holes, time with a custom date range, course, Only these / Exclude these) reads every figure on the page (the cards, trend, legs, grid, putting and the phone's lists), per player and pooled for the team, and each says which rounds it counts
- [x] It lives in the address (`window`, `type`, `holes`, `from`, `to`, `course`, `only`, `skip`); anything unusable is dropped and a round id is matched against the rounds already read for the viewer before any figure is computed
- [x] Active filters are removable chips with a one-tap Clear and a count line ("12 rounds: tournaments, Sep 1 to Sep 29")
- [x] The empty filter (CH-4313), fewer than three whole rounds (CH-4314), the sheet's range error (CH-4101), nothing to pick (CH-4315), a cut list (CH-4316), the season bests note (CH-4317), the per-18 note (CH-4318) and the hint for a team with only 9-hole rounds (CH-4319): each with a catalog code and a test
- [x] A filter change goes through the window switch's offline refusal and slow notice (CH-4901, CH-4902)
- [x] Phone: a Filter button and the chips under the window switch, and the standard bottom sheet (Done applies)
- [x] Tees and rating, event and home or away are not filters, each with its reason (P005 PARITY.md, "The round filter"); 9 or 18 holes is (owner, 2026-09-30)
- [x] Holes: 18 (default), 9 or Both; per-round figures per 18 holes with a nine-hole round counting as half, rates pooling the holes, floors in whole rounds, season bests 18-hole (P005 PARITY.md, "Nine- and eighteen-hole rounds"); tests for 9-only and Both, including strokes gained per 18
- [ ] Browser pass with a real account, desktop and phone (owner)

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
- [x] Partial failure: rounds, members, cache, putts and Tour benchmarks each carry their own flag and inline notice with Try again
- [x] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view
- [x] Not found and no access: a coach without a team gets the no-team state; players get their own profile instead (proved in stats-team.test, 40801 and 40802: the team is the session's, never the address's, and no team figure is read for a player)
- [x] Offline or slow network: the window switch says so instead of spinning forever (CH-4901 offline: nothing is requested and the switch stays put; CH-4902 slow: one notice after 5 seconds. Forced in stats-team.test and in the browser with Playwright offline and a held request)
- [x] User errors: export failure gives a specific toast, an error haptic and a Sentry event. The export writes a name that starts with = + - or @ as text (40501), so a spreadsheet never reads a player's name as a formula
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
- [x] Every failure path was forced once locally and seen in the console or Sentry (stats-team.test forces the rounds, roster, team, round cache, putts and Tour benchmark reads, each asserting its `chLogServer`, plus the five section crashes (high) and the export (low), each asserting its `chReport`. The preview's failed, partial, empty, crash and loading states were loaded in the browser with the console read. The crash state found that a section crash on the server render failed the whole page; each section now has a Suspense inside its boundary)

## phone-spec

- [ ] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop (open, phone design: `design/handoff/mobile/` has no Stats design; `docs/clubhouse/phone/stats-team.md` is a draft)
- [ ] The owner approved it (the file says `Status: approved`) (open, owner: the draft says `Status: draft (awaiting owner approval)`)

## phone

- [ ] Built at 390px and 430px, respecting the safe areas (open, phone design: waits for an approved phone spec)
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent (open, phone design: waits for an approved phone spec)
- [ ] Sheets are used instead of popovers, and they drag to dismiss (open, phone design: waits for an approved phone spec)
- [ ] The bottom tab bar and toasts don't overlap content (open, phone design: waits for an approved phone spec)
- [ ] Checked in the iOS app shell (Capacitor), with native haptics felt on a device (open, phone design: waits for an approved phone spec)

## motion
<!-- Rewritten for v2 motion (D-64) and v2 haptics (D-70) on 2026-09-29; earlier evidence was against the old timings, so every box starts again. -->
- [ ] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [ ] Haptics follow v2 (D-70): selection for tabs, segmented controls, switches and choices; light for primary buttons; success for Post, Save, Send, Share, Assign and Got it; warning for Remove, Delete, Discard and Dismiss; medium only for a sheet settling or a shot logged; error when an import or sync fails; every other tap silent

## accessibility

Verified by `stats-team.test.tsx` (CH-48xx) and `npm run clubhouse:a11y`; states catalogued in `docs/clubhouse/catalog/stats-team.md`.

- [x] Full keyboard path, with visible focus and no traps; Esc closes overlays. Tab reaches, in reading order: the window switch (arrows move it), Export, the measure switch, each player, each leg card (Enter/Space), each grid row and each season best, then leaves the page. Every stop has a ring; grid rows use an inset ring, because an outset one is clipped by the scroller. N/A for Esc: this page has no overlays
- [x] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] Charts have a text equivalent (aria-label or a view-as-table path)
- [x] Status changes are announced (aria-live) and errors use role=alert
- [x] Text contrast meets WCAG AA on every surface

## performance

- [x] No request waterfall on the server, with independent reads in parallel. `loadTeamStats` reads the team and roster together. The season's rounds need the roster's ids; the Tour benchmark read is already in flight beside them. The round cache, the putts and the benchmarks then load together, with each id chunk in parallel, and one cache read now serves the window, the previous window and the bests (it had been read twice)
- [x] Client JS is limited to the interactive islands, and animation code is loaded lazily. `StatsTeam` now renders on the server: the figures, putting and season bests are HTML. Only `StatsTeamIslands` ships as client code: the window switch and its busy state, Export, Try again, Show the season, and the trend, leg cards and grid, which share the focused player and leg. Team stats' own client code went from 17.7 to 11.8 KB minified (6.6 to 4.7 KB gzip); in the production build the route's client chunks are 5.2 KB smaller, and the Season bests copy and the putting rings are in no client chunk. The shell's animation features load in their own chunk after first paint (D-25; `domMax` since 314b03055, so layout slides run). The first-load JS with `domMax` is measured at the merge pass (D-27). Every capture at 924 and 1280px (sections, lens, focus, every state) is pixel-identical before and after
- [x] No layout shift after first paint (PerformanceObserver on the preview: CLS 0.0001 at 924px and 0 at 1280px on load. Choosing a lens, leg or player and scrolling adds only input-driven shifts. The route skeleton was sized to the loaded page: the header, first figure card and trend card now start at the same place at 924, 1100, 1280, 1400 and 1600px. At 1280px the trend card had dropped 40px when data landed. The phone width waits for the phone gate)

## verified

- [x] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md (open, owner: the live pass on a Vercel preview, Q-4; agents don't sign in)
- [ ] Owner review of the built screen (open, owner: the lead carries it; the player views start after it)
