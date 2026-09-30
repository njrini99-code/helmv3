# Team Hub checklist

Reference: `design/handoff/Coach - Team Hub.html`, `Player - Team Hub.html`, `Coach and Player - Team Hub - Mobile.html` (`hub.jsx`, `hub.css`); spec `docs/clubhouse/phone/team-hub.md`
Route: `/golf/dashboard/team-hub`   Surface tag: `hub` (Sentry `surface=hub.<section>`)

## spec
- [ ] Desktop reference files and screenshots are named above
- [ ] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md
- [ ] Every control is mapped to an existing server action, or to a migration that has to be written (never applied by an agent)
- [ ] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [ ] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [ ] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [ ] Red appears only for under par and the pin flag; gains are green and losses amber
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [ ] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead
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
- [ ] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [ ] Not found and no access: plain words and a way back
- [ ] Offline or slow network: the action says so instead of spinning forever
- [ ] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event
- [ ] Forms: inline field messages, focus moves to the first invalid field, and double submit is prevented
- [ ] Destructive actions: a confirm step or Undo
- [ ] Optimistic updates roll back on failure and tell the coach

## error-tracking
- [ ] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [ ] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [ ] Key intents leave a `chTrail` breadcrumb (open, filter, submit)
- [ ] No `catch` swallows an error without reporting or handling it on screen
- [ ] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry

## phone-spec
- [ ] `docs/clubhouse/phone/<slug>.md` names the owner's mobile design in `design/handoff/mobile/` (or is a draft the owner approved), and maps each screen to components
- [ ] It says `Status: approved`

## phone
- [ ] Built at 390px and 430px, respecting the safe areas
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent
- [ ] Sheets are used instead of popovers, and they drag to dismiss
- [ ] The bottom tab bar and toasts don't overlap content
- [ ] Checked on a real iPhone through `npm run ios:dev` (docs/clubhouse/MOBILE.md): keyboard, swipe-back with a sheet open, haptics felt

## motion
<!-- Rewritten for v2 motion (D-64) and v2 haptics (D-70) on 2026-09-29; earlier evidence was against the old timings, so every box starts again. -->
- [ ] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [ ] Haptics follow v2 (D-70): selection for tabs, segmented controls, switches and choices; light for primary buttons; success for Post, Save, Send, Share, Assign and Got it; warning for Remove, Delete, Discard and Dismiss; medium only for a sheet settling or a shot logged; error when an import or sync fails; every other tap silent

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
