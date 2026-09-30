# Home checklist

Reference: design/handoff/Coach Home v3.html, coach-home-v3.jsx, screenshots/home-01-top.jpg, home-02-leaderboard.jpg
Route: /golf/dashboard (coach and player)   Surface tag: `home.<week|latestRound|leaderboard|upNext|today|form|game>`
Player Home: design/handoff/Player - Home.html, player-home.jsx, Player - Home - Mobile.html (phone spec `phone/home-player.md`)

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md
- [x] N/A: Home has no mutations; "Message team" and "New event" are links (D-4, revised)
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [x] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [x] Red appears only for under par and the pin flag; gains are green and losses amber
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead
- [ ] A narrow canvas (container below 860px) reflows without horizontal page scroll

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data
- [x] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked
- [x] Null, zero and "early read" render differently, and windows and samples are stated
- [ ] Dates and times are resolved in the team's timezone on the server, with no hydration mismatch
- [x] Unit tests cover the loader's derivations (subline, invitee details, quiet days: `src/clubhouse/__tests__/logic.test.ts`)

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): says what will appear here and the one next step
- [x] N/A: Home has no filters
- [x] Partial failure: each section has its own failure flag and shows an inline notice with Try again; the rest of the page still works
- [x] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [ ] Not found and no access: plain words and a way back
- [x] N/A: Home has no client actions; the route error view covers a failed load
- [x] N/A: Home has no mutations
- [x] N/A: Home has no forms
- [x] N/A: Home has no destructive actions
- [x] N/A: Home has no optimistic updates

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [ ] Key intents leave a `chTrail` breadcrumb (open, filter, submit)
- [x] No `catch` swallows an error without reporting or handling it on screen
- [ ] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop (the v2 board, mapped piece by piece, 2026-09-30)
- [x] The owner approved it (the file says `Status: approved`; the owner's v2 phone board is the spec, D-22)

## phone
<!-- Built 2026-09-30 (HomePhone): tests at the phone width; not yet in a browser at 390/430 or on an iPhone. -->
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
Verified by `home.test.tsx` (CH-28xx) and `npm run clubhouse:a11y`; states catalogued in `docs/clubhouse/catalog/home.md`.
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
