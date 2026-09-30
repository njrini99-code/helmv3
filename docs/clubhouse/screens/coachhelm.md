# CoachHelm checklist

Reference: `design/handoff/Player - CoachHelm.html`, `Coach - CoachHelm.html`, `Coach and Player - CoachHelm - Mobile.html` (`helm3.jsx`, `helm3.css`, `coachhelm2.css`); spec `docs/clubhouse/phone/coachhelm.md`
Route: `/golf/dashboard/coachhelm` (coach and player)   Surface tag: `coachhelm` (Sentry `surface=coachhelm.<section>`)

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a gap (`phone/coachhelm.md` "Board to data" and "Differences from the board")
- [x] Every control is mapped to an existing server action: Assign as focus is `createFocusAreaFromInsightV2`, Dismiss is `dismissInsight`, Undo is `reactivateInsight`; the player's Accept is `acceptFocusArea` and Decline `declineFocusArea` (Q-77). Share with the player has no action and is not drawn. No new action and no migration
- [ ] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md (the gaps are written in `phone/coachhelm.md`; the tracker entry is the lead's)

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used (`.ch-hl-*` over `--ch-*`), and `clubhouse:check` is clean
- [x] Numbers are tabular (`.ch-num` on the values, samples and counts), with a true minus and `—` for no data (`formatComparison`)
- [x] Red appears nowhere on this page: a high-priority finding and a weak bar are amber and a strength is green (D-42)
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref` (Open roster, View roster, Open CoachHelm settings, Start a round; coachhelm.test proves both ways)
- [ ] A narrow canvas (container below 900px and 640px) reflows without horizontal page scroll

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data; a coach reads only the active players of the team the shell resolved
- [x] Every Supabase call reads `error`; the visible-insights and rounds reads paginate (`fetchAllRowsResult`), and the rest are small by nature (a team's roster, the ids of at most 30 insights); the player's feedback read is one unpaginated read; a failed read is never an empty page (the two delivery actions answer an empty list on failure, so the loader checks the insights table itself)
- [x] Null, zero and "early read" render differently: a lifetime value says "All rounds", a sample says what it counts, the read is a word, a count with no comparison draws no gauge
- [x] N/A: no date or time is drawn from this page's own data; windows are counted in days, and the pulse's dates are the pulse's own text
- [x] Unit tests cover the loaders' derivations and the mapping from generator output (`coachhelm.test › Generator output to the board`, `CoachHelm loaders`)

## states
- [x] Loading: a route skeleton per role, shaped like the page, so nothing shifts when data lands (CH-13401, CH-13402)
- [x] Empty (first run): says what will appear here and the one next step (CH-13301, CH-13302, CH-13306, CH-13307, CH-13308)
- [x] Empty (filtered or no results): N/A, there is no search or filter; only strengths (CH-13303) and nothing flagged in the pulse (CH-13309) are their own states
- [x] Partial failure: the player's insights, the coach's players and the pulse each have their own flag and notice with Try again; the rest of the page still works (CH-13201, CH-13202, CH-13203)
- [x] Crash containment: the focus, the side lists, the pulse and the players are each wrapped in a `SectionBoundary` with a surface tag (CH-13204)
- [ ] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [ ] Not found and no access: plain words and a way back
- [x] Offline or slow network: a write says so instead of spinning (CH-1903, CH-1902, from `useAction`; the offline refusal is tested here)
- [x] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event (CH-13001 to CH-13003); Retry finishes the job, the chip and the notice included
- [x] N/A: CoachHelm has no forms
- [x] Destructive actions: Dismiss is undoable, so it keeps Undo in place instead of asking (CH-13901)
- [x] N/A: nothing is optimistic; the chip, the dismissed notice and the restored card wait for the server

## error-tracking
- [x] Server read failures are logged with `chLogServer('coachhelm', '<read>')` (`gate`, `feed`, `visible`, `dismissed`, `rounds`, `drills`, `assigned`, `roster`, `players`, `heads`)
- [ ] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (every action by name through `useAction`)
- [x] No `catch` swallows an error without reporting or handling it on screen (a failed read is logged and shows its error view)
- [ ] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [ ] Every failure path was forced once locally and seen in the console or Sentry

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` names the owner's mobile design in `design/handoff/` and maps each screen to components (`phone/coachhelm.md` names `Coach and Player - CoachHelm - Mobile.html`)
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
- [x] Haptics follow v2 (D-70): selection for picking a player or an insight (CH-13701); light for Assign as focus, and success or error through `useAction` (CH-13702); warning before Dismiss (CH-13703); every other tap silent

## accessibility
- [ ] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [ ] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] Charts have a text equivalent: the gauge's track is hidden and its legend says every number in words (CH-13802); the bars carry their values as text
- [ ] Status changes are announced (aria-live) and errors use role=alert
- [ ] Text contrast meets WCAG AA on every surface

## performance
- [x] No request waterfall on the server beyond what depends on the last read: the coach's gate, roster, then the pulse, the visible insights and the top insights together, then the drills and the focus areas together; the player's gate, feed, then the drills
- [ ] Client JS is limited to the interactive islands, and animation code is loaded lazily
- [ ] No layout shift after first paint

## verified
- [ ] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md
- [ ] Owner review of the built screen
