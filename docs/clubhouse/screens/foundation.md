# Foundation checklist

Reference: design/handoff/README.md (Shell), sidebar.css, depth.css, design-system/
Route: (shell, tokens, primitives)   Surface tag: `shell`

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md (next event: golf_events; Roster badge: pending golf_team_join_requests; Messages badge: the notification badge bundle)
- [x] Every control is mapped to an existing server action: the bell's Mark all read (`markAllNotificationsRead`) and mark one read (`markNotificationRead`); everything else is navigation
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth) (open: the next agent with a server slot, capturing the shell side by side with `design/handoff/screenshots` at 924px and 1280px; never done)
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [x] Numbers are tabular, with a true minus, `E` for even and `—` for no data (every count and time in the shell carries `.ch-num`: the bell count and times, tab and More badges, sidebar counts, the next-event line. The shell shows no scores, so minus, `E` and `—` don't arise)
- [x] Red appears only for under par, the pin flag and destructive actions (D-42); gains are green and losses amber (`clubhouse:check` refuses a red token outside an under-par, flag, danger or error context, `scripts/clubhouse/check.mjs`; exit 0 on 2026-09-29)
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object (the strings are listed in `catalog/shell.md` and are sentence case; the voice is the owner's call. Open: the owner, at review)
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead
- [ ] A narrow canvas (container below 860px) reflows without horizontal page scroll (the 390px and 430px captures show none, but `scrollWidth` was never measured between 820px and 924px. Open: the next agent with a server slot)

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall) (`loadClubhouseShell` reads the next event, the join-request count and the timezone in one `Promise.all`, then the one event's RSVPs; the bell's list loads when it opens, by design, and the badge counts come from the existing badge provider)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data (`createClient` from `@/lib/supabase/server` in `src/clubhouse/data/shell.ts`)
- [x] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked (all four reads check `error`; the RSVP read is one event's invitees, capped at 1,000 with the reason in a comment; no `.in()`)
- [x] Null, zero and "early read" render differently, and windows and samples are stated (a failed join-request read is `null` and hides the badge instead of saying 0, CH-1208; RSVPs are `null` with no invitees or a failed read; no windows or samples in the shell)
- [x] Dates and times are resolved in the team's timezone on the server, with no hydration mismatch (`describeEvent` formats with the team's `golf_team_settings.timezone` on the server and passes strings)
- [ ] Unit tests cover the loader's derivations (CH-1207, CH-1208 and CH-1304 cover failure, null versus zero, and the RSVP count; "Today / Tomorrow / In N days" and the team-timezone date aren't asserted. Open: the next agent, a loader test)

## states
- [x] Loading: N/A for the frame, which renders with final data on first paint; each page brings its own route skeleton, and the bell's list has skeleton rows (CH-1401)
- [x] Empty (first run): the bell says "You're all caught up." and what shows up there (CH-1302); nothing scheduled leaves out the next-event card (CH-1304)
- [x] Empty (filtered or no results): the bell's filter says "Nothing of this kind." with Show all (CH-1303)
- [x] Partial failure: the bell's list fails on its own with Try again (CH-1201); the sidebar's card and the Roster badge hide instead, by design, so a decoration never shows a failure (CH-1207, CH-1208); the page still works
- [ ] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag (part done: since D-24, cee2c2024, the primitive contains a crash on the server render as well as in the browser, on every page; two server-render tests fail without it, and `stats?state=crash` went from 500 to 200. Still open: the shell's own parts (the bell, the sidebar's card, the top bar, the offline banner and the tab bar) aren't wrapped, so a crash in them reaches the route error view. Open: the next agent)
- [x] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [x] Not found and no access: plain words and a way back (the shell's case is a page that isn't rebuilt: "Rounds hasn't been rebuilt yet." with a way back, CH-1301; each page owns its own not-found)
- [x] Offline or slow network: the action says so instead of spinning forever (CH-1901, CH-1902, CH-1903, CH-1905)
- [ ] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event (Mark all read does, CH-1001; marking one notification read as it opens is fire-and-forget: reported at low severity, not shown. Open: the owner, whether a failed mark-read should say anything)
- [x] Forms: N/A, the shell has no forms
- [x] Destructive actions: N/A, the shell has none
- [ ] Optimistic updates roll back on failure and tell the coach (Mark all read rolls back and says so, CH-1001; mark one read doesn't roll back. Open: the owner, the same decision as above)

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>` (`chReport` adds both tags to every event, `src/clubhouse/lib/track.ts`; the bell reports as `shell.bell`)
- [x] Key intents leave a `chTrail` breadcrumb (open, filter, submit) (opening the bell and a notification, going offline and back, and every `useAction` run)
- [x] No `catch` swallows an error without reporting or handling it on screen (the bell's catches report; `haptics.ts` drops a failed haptic on purpose, since a haptic is best effort and never shows)
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful (`useAction` and the bell report handled failures as low, `SectionBoundary` reports crashes as high; a thrown action is medium)
- [ ] Every failure path was forced once locally and seen in the console or Sentry (the tests force each one, and the preview forces the bell's with `?bell=failed`; seeing them arrive in Sentry needs a live session. Open: the merge pass)

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop (`phone/foundation.md` maps `design/handoff/mobile/m-shell.jsx`, `m.css` and `qual-mobile.css`: top bar, tab bar, More, sheets, safe areas, keyboard, gestures and haptics, and colour tokens. Rendered at 390 × 844 on 2026-09-29, captures `messages-00..22` and `messages-90`)
- [x] The owner approved it (the file says `Status: approved`). The handoff in `design/handoff/mobile/` is the approval (D-22)
- [x] Every design/data gap is answered as an owner decision in `PROGRESS.md` (`MOBILE.md` step 1). Q-40 to Q-47 were answered by the owner on 2026-09-29, recorded as D-40 to D-43.

## phone
- [x] Built at 390px and 430px, respecting the safe areas (the phone top bar, ivory tab bar with role sets and the More badge, More sheet, pushed screens and neutral avatars from `phone/foundation.md`, D-40 to D-43; the top bar pads by `safe-area-inset-top`, and the tab bar, sheets and composers by `safe-area-inset-bottom`. Captures of every preview page at both widths: scratchpad `phone-shell/built-{390,430}-*`. Tests CH-1808, CH-1809, CH-1810, CH-1906)
- [x] Touch targets are at least 44px, and hover-only affordances have a tap equivalent (a hit-test probe at 390px (every control drawn under 44px must take a tap 21px from its centre) over the More sheet, top bar, tab bar and pushed screens: 0 misses on 2026-09-29. Controls drawn smaller keep the design's size and carry a 44px hit area. Home's own 36px header buttons belong to Home's phone gate)
- [x] Sheets are used instead of popovers, and they drag to dismiss (the More sheet, the bell (a sheet on the phone since CH-1811) and every `Modal` sheet follow the finger and close past 80px, CH-1611 and CH-1811 in shell.test. At 390px with real touch input the More and Modal sheets followed a drag, sprang back and closed, scratchpad `phone-shell/drag-390-*`; the bell sheet with a list, empty and failed: `phone-shell/bell-after-390*`. `clubhouse:a11y shell` exit 0, 5 pages, the bell sheet open at 390)
- [x] The bottom tab bar and toasts don't overlap content (a list scrolled to its end clears the tab bar, capture `built-390-02-inbox-scrolled`; toasts sit above the tab bar, and above the composer on a pushed screen, `shell.css` `.ch-toasts` phone rules)
- [ ] Checked in the iOS app shell (Capacitor), with native haptics felt on a device (open: the owner, on a device through `npm run ios:dev`)

## motion
- [x] Transitions use only 90, 150, 220 and 360ms with the Clubhouse ease (`clubhouse:check` refuses a literal duration in CSS and a JS duration off `CH_DUR`; exit 0 on 2026-09-29)
- [ ] Press scales to 0.985 on every tappable surface (tabs, nav items, the next-event card, More rows, bell rows, phone bar links and buttons do; the round Close coins on the More and bell sheets don't. Open: the next agent)
- [x] No count-ups and no entrance staggers; data is final on mount (`clubhouse:check` refuses both)
- [x] Reduced motion is honoured through `useChReducedMotion`
- [x] Haptics: select for tabs, pagers and chips; press for primary buttons; commit, success and error for outcomes (CH-1701 to CH-1706; primary `Button`s press by default; a sheet dragged shut presses, CH-1611)

## accessibility
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays (the skip link, the More and bell sheets' Tab trap and Esc are tested, CH-1801, CH-1802, CH-1811; a full keyboard walk at 1280px and 390px isn't done. Open: the next agent with a server slot)
- [x] Landmarks, headings in order, table roles, and labels on icon buttons (CH-1803, CH-1810; every icon button is named; `clubhouse:a11y` checks names and landmarks)
- [x] Charts have a text equivalent: N/A, the shell has no charts
- [x] Status changes are announced (aria-live) and errors use role=alert (CH-1804)
- [x] Text contrast meets WCAG AA on every surface (`clubhouse:a11y` with contrast: exit 0, 111 pages on 2026-09-29, and the shell again with the bell sheet open, 5 pages)

## performance
- [x] No request waterfall on the server, with independent reads in parallel (the three independent reads run in one `Promise.all`; only the RSVP read waits, on the event it needs)
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily (part done: since D-25 the motion features load through `@/lib/motion/load-features` in their own chunk after first paint, `domMax` since 314b03055, kept in the merge of the phone foundation. Still open: the whole shell is one client tree, and the first-load JS is measured at the merge pass, D-27)
- [ ] No layout shift after first paint (not measured. Open: the merge pass, with the build)

## verified
- [x] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log (PROGRESS log, 2026-09-29: typecheck 0, eslint 0 errors, `clubhouse:check` 0, `npx vitest run src/clubhouse` 295/295, then `test:file` shell 33/33 after the sheet and bell work. The full suite and build run again at merge)
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md (the preview was checked at 390px, 430px and 1280px; no real account yet. Open: the owner or the merge pass, signed in as a real coach)
- [ ] Owner review of the built screen (open: the owner)
