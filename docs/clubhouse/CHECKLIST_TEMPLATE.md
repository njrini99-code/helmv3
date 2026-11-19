# <Screen> checklist

Copy this file to `docs/clubhouse/screens/<slug>.md`, where `<slug>` is the
tracker's screen name in lowercase with hyphens. Each `##` section is one
tracker gate. `npm run clubhouse:check` fails when a gate is marked `done` in
`PROGRESS.md` while its section still has an unchecked box. When an item
truly doesn't apply, check it and say why: `- [x] N/A: no mutations on this
screen`.

Reference: <handoff file and screenshots>
Route: <route>   Surface tag: `<screen>` (Sentry `surface=<screen>.<section>`)

## spec

- [ ] Desktop reference files and screenshots are named above
- [ ] Every figure on the screen is mapped to a table and column, or logged as a
  data gap in PROGRESS.md
- [ ] Every control is mapped to an existing server action, or to a migration
  that has to be written (never applied by an agent)
- [ ] Differences between the README and the screenshots are resolved as
  decisions in PROGRESS.md

## desktop

- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type,
  radius, depth)
- [ ] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [ ] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [ ] Red appears only for under par and the pin flag; gains are green and
  losses amber
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb
  plus an object
- [ ] Controls that point at an unbuilt screen are hidden via `rebuiltHref`,
  never dead
- [ ] A narrow canvas (container below 860px) reflows without horizontal page
  scroll

## wired

- [ ] Everything is read server-side in one pass, so final data is on first
  paint (no client fetch waterfall)
- [ ] Reads go through the RLS-scoped client, with no service role for a user's
  own data
- [ ] Every Supabase call reads `error`; lists over 1,000 rows paginate, and
  `.in()` is chunked
- [ ] Null, zero and "early read" render differently, and windows and samples
  are stated
- [ ] Dates and times are resolved in the team's timezone on the server, with no
  hydration mismatch
- [ ] Unit tests cover the loader's derivations

## states

- [ ] Loading: a static route skeleton shaped like the page, so nothing shifts
  when data lands; every wait goes through `useBusy` (nothing for 150 ms, the
  skeleton held 300 ms, a 180 ms fade)
- [ ] Empty (first run): says what will appear here and the one next step
- [ ] Empty (filtered or no results): distinct from first run, and offers to
  clear filters
- [ ] Partial failure: each section has its own failure flag and shows an inline
  notice with Try again; the rest of the page still works
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
- [ ] Transitions use only the vocabulary (MOTION-AND-VISUAL 3.2): press 110,
  quick 180, base 260, release 280, marks 360, reveal 520 ms, `--ch-ease-ios`
  and `--ch-ease-out`, no retiring token
- [ ] Press (3.8): a press waits 50 ms and shows at least 110 ms; a button or
  chip goes to scale 0.97 over 110 ms on ease-out and back over 280 ms on the
  iOS curve with no overshoot (`useChPress`), and nothing scales twice; a row,
  option or menu item takes the wash `--ch-sel` instead, and a desk row's hover
  is the same wash, at once
- [ ] First paint: content is visible at once (the reveal and every stagger are retired, Q-139); no count-ups; charts and graphics are drawn in place, with no wipe, rise or glide when they scroll into view (a changed value may still move), except a bar chart's first view in a session, whose bars grow once from their origin over 360 ms (3.7); a refresh never animates
- [ ] A phone page change with motion on starts no view transition: a section
  switch (tab bar, sidebar) and any other swap show the new page or its
  skeleton's frame in the first frame (its blocks after 150 ms), and a drill-in
  pushes and Back pops on the live page over 520 ms on the one curve
  (`--ch-ease-ios`, a 30% parallax under a 0.075 black dim), the page pushed
  in taking no taps until it lands, and a figure the row marks `data-ch-share`
  travels into the same figure on that page over the push (a shared element on
  the Web Animations API, never a view transition); the desktop
  crossfades with no gap (120 ms out and 180 ms in together, owner decision 3),
  Back and Forward included,
  and only a crossfade holds the route skeleton back 150 ms, so a quick load
  never shows one; Reduce Motion crossfades over 180 ms; skeletons are static,
  with no shimmer or pulse, and the one loop is the working indicator, only
  while work runs; a dragged sheet settles on the script smooth spring (462 ms),
  and CSS has no spring durations: a one-shot entry rides the iOS curve on a
  D-64 beat; the Stats busy dim holds off 150 ms and then holds 300 ms, as
  Ask's chat switch does (`--ch-dur-busy-delay`); a CoachHelm view switch shows
  the next view's skeleton instead, its blocks after 150 ms, held 300 ms
- [ ] Reduce Motion (3.11) turns travel into a 180 ms fade and stills the
  working indicator; Animations off removes every motion (`useChReducedMotion`)
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
