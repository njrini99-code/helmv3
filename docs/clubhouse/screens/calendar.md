# Calendar checklist

Reference: design/handoff/Calendar.html, cal-views.jsx, cal-inspector.jsx, cal-editor.jsx, cal.css, screenshots/calendar-01..12
Route: /golf/dashboard/calendar (coach and player) · `?view=day|week|month|agenda&date=YYYY-MM-DD&event=<id>`
Surface tag: `calendar.<view|panel|detail|attendance|subscribe|saveEvent|cancelEvent|rsvp|createFeed>`

Player permissions: players see team events and reply to the ones they're invited to (`respondToEvent`),
see only their own classes (the `attributeClassEvents` rule, enforced in the loader), and get no editor,
attendance, people filter or overlap review. Coaches see every rostered player's classes.

Server actions reused unchanged: `createGolfEvent`, `updateGolfEvent`, `deleteGolfEvent` (soft cancel),
`createRecurringEvent`, `editRecurringEvent`, `deleteRecurringEvent`, `respondToEvent`, `getAttendanceReport`,
`markAttendance`, `getCalendarFeeds`, `createCalendarFeed`.

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
- [x] Times are resolved in the team's timezone on the server; all-day rows keep their stored date; writes send the team zone's offset for that date, so a DST change can't shift an event
- [x] Unit tests cover week and month math, time labels, lanes, overlap detection and open times (`logic.test.ts`, "calendar model")
- [x] Link seed from Roster's Plan 1:1 (D-52):
  - `?new=1&with=<playerId>` opens the editor as a meeting with only that player invited.
  - A player the Calendar doesn't list means nobody is invited, never the team.
  - Plain `?new=1` still invites everyone.
  - Evidence: `calendar.test.tsx` › "Calendar · seeds from other pages" (3 tests), commit 88a36e2d4.
  - No new state, so no catalog row.

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): an empty range still draws the grid, and the panel says there's nothing on the calendar today
- [x] Empty (filtered or no results): the people filter says whose schedule is shown and offers Clear; the agenda says the range is empty for those players
- [x] Partial failure: events, replies and classes each carry their own flag; a failed events read never draws an empty calendar
- [x] Crash containment: the view and the panel are each wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view
- [x] Not found and no access: no team has its own state; a deep link to an event outside the range says it may have moved
- [x] Offline or slow network: the action says so instead of spinning forever
- [x] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event
- [x] Forms: the editor validates title and time before submit, keeps every field on failure and disables while pending
- [x] Destructive actions: cancelling asks first (with series scope), and it's a soft cancel that keeps replies and attendance
- [x] Optimistic updates roll back on failure and tell the coach (a player's reply reverts if it doesn't send)

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (navigate, submit, save attendance, keep overlap)
- [x] No `catch` swallows an error without reporting or handling it on screen
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry (the preview forces the events, replies, classes and attendance failures; the mutations still need a forced failure)

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop (the v2 board, mapped piece by piece, 2026-09-30)
- [x] The owner approved it (the file says `Status: approved`; the owner's v2 phone board is the spec, D-22)

## phone
<!-- Built 2026-09-30 (CalendarPhone): tests at the phone width; not yet in a browser at 390/430 or on an iPhone. -->
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
Verified by `calendar.test.tsx` (CH-68xx) and `npm run clubhouse:a11y`; states catalogued in `docs/clubhouse/catalog/calendar.md`.
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [x] Landmarks, headings in order, table roles, and labels on icon buttons
- [ ] Charts have a text equivalent (aria-label or a view-as-table path)
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
