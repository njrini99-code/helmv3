# Foundation checklist

Reference: design/handoff/README.md (Shell), sidebar.css, depth.css, design-system/
Route: (shell, tokens, primitives)   Surface tag: `shell`

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md (next event: golf_events; Roster badge: pending golf_team_join_requests; Messages badge: the notification badge bundle)
- [x] N/A: the shell has no mutations (navigation only)
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [ ] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [ ] Red appears only for under par and the pin flag; gains are green and losses amber
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead
- [ ] A narrow canvas (container below 860px) reflows without horizontal page scroll

## wired
- [ ] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall)
- [ ] Reads go through the RLS-scoped client, with no service role for a user's own data
- [ ] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked
- [ ] Null, zero and "early read" render differently, and windows and samples are stated
- [ ] Dates and times are resolved in the team's timezone on the server, with no hydration mismatch
- [ ] Unit tests cover the loader's derivations

## states
- [ ] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [ ] Empty (first run): says what will appear here and the one next step
- [ ] Empty (filtered or no results): distinct from first run, and offers to clear filters
- [ ] Partial failure: each section has its own failure flag and shows an inline notice with Try again; the rest of the page still works
- [ ] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [ ] Not found and no access: plain words and a way back
- [ ] Offline or slow network: the action says so instead of spinning forever
- [ ] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event
- [ ] Forms: inline field messages, focus moves to the first invalid field, and double submit is prevented
- [ ] Destructive actions: a confirm step or Undo
- [ ] Optimistic updates roll back on failure and tell the coach

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [ ] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [ ] Key intents leave a `chTrail` breadcrumb (open, filter, submit)
- [ ] No `catch` swallows an error without reporting or handling it on screen
- [ ] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` is written as an intentional native design, not a shrunk desktop (`phone/foundation.md` maps `design/handoff/mobile/m-shell.jsx`, `m.css` and `qual-mobile.css`: top bar, tab bar, More, sheets, safe areas, keyboard, gestures and haptics, and colour tokens. Rendered at 390 × 844 on 2026-09-29, captures `messages-00..22` and `messages-90`)
- [x] The owner approved it (the file says `Status: approved`). The handoff in `design/handoff/mobile/` is the approval (D-22)
- [x] Every design/data gap is answered as an owner decision in `PROGRESS.md` (`MOBILE.md` step 1). Q-40 to Q-47 were answered by the owner on 2026-09-29, recorded as D-40 to D-43.

## phone
- [ ] Built at 390px and 430px, respecting the safe areas
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent
- [ ] Sheets are used instead of popovers, and they drag to dismiss
- [ ] The bottom tab bar and toasts don't overlap content
- [ ] Checked in the iOS app shell (Capacitor), with native haptics felt on a device

## motion
- [ ] Transitions use only 90, 150, 220 and 360ms with the Clubhouse ease
- [ ] Press scales to 0.985 on every tappable surface
- [ ] No count-ups and no entrance staggers; data is final on mount
- [x] Reduced motion is honoured through `useChReducedMotion`
- [ ] Haptics: select for tabs, pagers and chips; press for primary buttons; commit, success and error for outcomes

## accessibility
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [ ] Landmarks, headings in order, table roles, and labels on icon buttons
- [ ] Charts have a text equivalent (aria-label or a view-as-table path)
- [ ] Status changes are announced (aria-live) and errors use role=alert
- [ ] Text contrast meets WCAG AA on every surface

## performance
- [ ] No request waterfall on the server, with independent reads in parallel
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily
- [ ] No layout shift after first paint

## verified
- [ ] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md
- [ ] Owner review of the built screen
