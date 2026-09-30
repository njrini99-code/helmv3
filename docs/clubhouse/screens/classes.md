# Classes checklist

Reference: `design/handoff/Player - Classes.html`, `Player - Classes - Mobile.html` (`classes.jsx`, `classes.css`, `gh-states.jsx`); spec `docs/clubhouse/phone/classes.md`
Route: `/golf/dashboard/classes` (player)   Surface tag: `classes` (Sentry `surface=classes.<section>`)

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a gap (`phone/classes.md` "Board to data" and "Differences from the board")
- [x] Every control is mapped to an existing server action or the RLS-scoped write the current page uses: Add, Edit and Import write `golf_player_classes` then `syncClassToCalendar`; Remove is `removeClassFromCalendar` then delete; the reader is `extractClassesFromScheduleImage` or `parseScheduleText`. No new action and no migration
- [ ] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md (the gaps are written in `phone/classes.md`; the tracker entry is the lead's)

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used (`.ch-cl-*` over `--ch-*`), and `clubhouse:check` is clean
- [x] Numbers are tabular (`.ch-num` on the credits, the week, the times and the counts), with `—` and plain words for no data ("Instructor not listed", "Not set", "No time")
- [x] Red appears only on Remove class (`.ch-cl-danger`) and invalid fields; an overlap with the team or another class is amber, never red
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref` ("Open team settings" on the no-team page); every other control opens a sheet or writes
- [ ] A narrow canvas (container below 1000px and 640px) reflows without horizontal page scroll

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (the classes and the team's events for the week are read in parallel)
- [x] Reads go through the RLS-scoped client and writes through the browser client under the same policies; the calendar sync and removal are the current server actions, unchanged
- [x] Every Supabase call reads `error` (`classes.error`, `week.error` are separate; a failed read is never an empty page); both lists are limited to 500
- [x] Null, zero and "no fixed meeting" render differently: an online class, times with no days, a class from another term, and a class with no term are each drawn as what they are
- [x] Dates and times are resolved in the team's timezone on the server (`todayIso`, the week, the events), with no hydration mismatch; the class's own wall-clock times go to the sync with the caller's zone, as the current importer does
- [x] Unit tests cover the loader's derivations and the write shapes (`classes.test › Classes loader`, `Classes live writes`)

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands (CH-12401); a schedule being read (CH-12402); a class going on the calendar (CH-12403)
- [x] Empty (first run): says what will appear here and the two next steps (CH-12301); no team (CH-12305)
- [x] Empty (filtered or no results): N/A, there is no search or filter; nothing overlaps this week is its own state (CH-12302)
- [x] Partial failure: the classes and the team's events each have their own flag and notice with Try again; the rest of the page still works (CH-12201, CH-12202)
- [x] Crash containment: the overview, the deck and the side column are each wrapped in a `SectionBoundary` with a surface tag (CH-12203)
- [ ] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [ ] Not found and no access: plain words and a way back
- [x] Offline or slow network: a write says so instead of spinning (CH-1903, CH-1902); a screenshot read says so and offers the paste (CH-12901, CH-12902)
- [x] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event (CH-12001 to CH-12004); Retry finishes the job, and a failed sync's Retry never saves the class again
- [x] Forms: every rule shows beside its field, and the first field that needs it takes focus (CH-12101 to CH-12114)
- [x] Destructive actions: a confirm step (CH-12501), and a question before a form with changes is thrown away (CH-12502)
- [x] N/A: nothing is optimistic; a class joins the list when the server has stored it

## error-tracking
- [x] Server read failures are logged with `chLogServer('classes', '<read>')` (`classes`, `events`)
- [ ] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (open, add, import, and every action by name through `useAction`)
- [x] No `catch` swallows an error without reporting or handling it on screen (a failed read shows its error view; a thrown sync or removal is reported with `chReport` and shown)
- [ ] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` names the owner's mobile design in `design/handoff/` and maps each screen to components (`phone/classes.md` names `Player - Classes - Mobile.html`)
- [x] It says `Status: approved`

## phone
- [ ] Built at 390px and 430px, respecting the safe areas
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent
- [ ] Sheets are used instead of popovers, and they drag to dismiss
- [ ] The bottom tab bar and toasts don't overlap content
- [ ] Checked on a real iPhone through `npm run ios:dev` (docs/clubhouse/MOBILE.md): keyboard, swipe-back with a sheet open, haptics felt

## motion
- [ ] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [x] Haptics follow v2 (D-70): selection for opening a class, choosing a day and the file or paste switch (CH-12701, CH-12703, CH-12705); warning before the remove question and on Discard (CH-12702); success and error through `useAction`; an error when a file can't be read; every other tap silent

## accessibility
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [ ] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] Charts have a text equivalent: the term overview is one labelled region and its drawing is hidden (CH-12803); the card's week strip is hidden and the button says the same in words (CH-12802)
- [x] Status changes are announced (aria-live) and errors use role=alert (CH-12403, CH-12402, CH-12804)
- [ ] Text contrast meets WCAG AA on every surface

## performance
- [x] No request waterfall on the server, with independent reads in parallel
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily
- [ ] No layout shift after first paint

## verified
- [ ] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real player account, logged in PROGRESS.md
- [ ] Owner review of the built screen
