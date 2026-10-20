# P002 — Home: changelog

## 2026-10-19 — Type, shape and touch in the page stylesheet

```text
Design package: none (complete-and-elevate plan, lane W4b: type, shape and touch in the page stylesheets)
PR/commit:      lane W4b commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (home.css)

- Fixed sizes that were left in pixels (the round-form and headline figures, the leg values, the day and since figures, the next-up label) now follow the iPhone's text size. The score tile, the chart axis and value labels keep their size on purpose.
- Radii on the 5, 7, 10, 14, 20 scale.
- The "no events" chip has a 44px reach on the phone; the Player home asks row and next-up card tint on hover; the form and spark figures use tabular numerals.

### Why

- Pixel font sizes did not follow Dynamic Type, radii were off the 5/7/10/14/20 scale, some phone controls were under 44px, some clickable things did not answer a pointer, and the font shorthand had dropped tabular figures from figures that sit in columns.

### Verification

- WebKit (headless) at 390 and 1280, light and dark: Rounds, a round, sign-up, sign-in, Home, a CoachHelm thread and Team Hub looked at after the change; the phone with `--ch-type-scale: 1.4` scales text with no sideways overflow (scrollWidth equals clientWidth). Touch reach was measured with `elementFromPoint` 21px beyond each short control; hover was measured by comparing computed styles under the pointer; figures were measured by computed `font-variant-numeric`. `npm run clubhouse:css`: its two findings are existing shadows in `auth.css` (lines 1809 and 1872).

## 2026-10-19 — Leaderboard fades its clipped edge

```text
Design package: none (complete-and-elevate plan, lane W4a: controls behave one way everywhere)
PR/commit:      lane W4a commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The leaderboard table, when it is wider than its column, fades only the edge that is hiding something (`data-start` / `data-end`); nothing fades at rest.

### Why

- The same control behaved differently from page to page: a save greyed its button out at 42%, five places drew their own spinner, icon-only buttons had no words on desktop and a scroller gave no sign there was more. They now come from the shared owners (`Button` busy, `Spinner`, `Tooltip`, `use-hscroll`).

### Verification

- Targeted tests for this page and `ui/__tests__/controls-consistency.test.tsx`; the busy ring was captured at 390 and 1280, light and dark, on `/clubhouse-preview/classes` (the same Button owner draws it here); tooltips and edge fades on the messages, roster and CoachHelm previews. Pages other than the one captured were checked in source only.

## 2026-10-19 — First-run Home draws the week; the latest round's long names stay on the card

```text
Design package: none (complete-and-elevate plan, lane L3: empty, first-run and failure states)
PR/commit:      lane L3 commits on agent/clubhouse-complete
Contract IDs:   CH-2302, CH-2304, CH-2305, CH-2307, CH-2308, CH-2312, CH-2313
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Coach and player first-run pages, the no-team pages, the leaderboard's empties and the latest-round empty draw the shape of what will fill them (time rows, portrait rows) under the sentence. The coach copy says the page fills itself from replies, posted rounds and the leaderboard.
- The latest round's player name ends in an ellipsis rather than pushing the score off the card (`.ch-h-round__name`).
- The compact in-card empties (Today, Later today, Up next) keep their one-line form.

### Why

- Every empty page was one template: a green tile, a headline, a sentence and a button in blank space. The waiting form draws the shape of what will fill the space (rules, rings, a baseline; no bars, no fake text) under one sentence that names what fills it and who does it, and a filter that hides everything is told apart from a first run, a lock and a failed read.

### Verification

- `states.test.tsx` (the waiting form, its four kinds, the danger tone unchanged) and this page's tests; captured at 390 and 1280, light and dark, before and after, on `/clubhouse-preview/home?state=empty` and `home-player?state=empty` (viewed as contact sheets and crops). The latest round's long-name ellipsis was checked on desktop with a name injected in the browser; Home was not captured at a width that forces the ellipsis.

## 2026-10-18 — Wave 10: the first run and the empty team

```text
Design package: none (wave-10 first-run review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-2302 CH-2304 CH-2305 CH-2308 CH-2312
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-10 first run)

- The coach's first run (CH-2308) rests on the people, not the calendar: no
  players and no rounds, events or not. Adding the first event no longer
  drops Invite players for the full page of empty blocks; the week sits above
  the first steps (the week pane on desktop, the week strip on the phone), and
  the body drops "and your first event" once there is one.
- CH-2308's secondary is "New event", the verb used everywhere else.
- CH-2304 has Invite players (Roster's invite sheet) as a safety net, and its
  copy is true: "Share your team code from Roster; players appear here as
  they join." (players who use the code or link join right away).
- A coach with players and no round reads it once: the leaderboard's CH-2305
  ("No 18-hole rounds posted yet this season.", the latest round's wording
  with the length kept, since both read 18-hole rounds only) carries it, and
  the latest round's pane steps aside, the week taking the sheet
  (`.ch-h-sheet.is-solo`). Desktop only; the phone has no leaderboard.
- A player with the team's events but no round (CH-2312) keeps the head with
  Start a round, Up next and the week, and one "Welcome to the team" with Add
  classes stands in for Your latest round, Scoring and Your game, which said
  "No rounds posted yet" three ways (desktop and phone). The page empty state
  stays for a player with nothing on the calendar.
- Preview: `home?state=eventsonly`, `home?state=norounds` and
  `home-player?state=norounds`.

## 2026-10-18 — Wave 8: premium details on Home

```text
Design package: none (wave-7 premium details review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    reads only (the week's event types, already read)
Held items:     none
```

### Changed (2026-10-18, premium details)

- A competition day in the week strips (desktop, coach phone, player phone)
  carries its event type's own calendar icon (`TYPE_ICON`): Target for a
  qualifier, Trophy for a tournament. It was a Trophy on the coach phone and
  a Flag (Practice's icon) elsewhere. Week days carry `competitionType`; a
  tournament outranks a qualifier on the same day.
- Dark: the coins in the coach phone's Next up card keep the day's neutral,
  so they no longer sink into the night green.
- The team scoring figure (phone 56px, desktop 64px) sets its decimal point
  in `.ch-num__pt` (`ui/point-span.tsx`, 0.06em each side) and the phone's
  tracks at -0.035em, so "73.4" no longer reads "734".
- Desktop, light: the New event key's "N" chip inherits the primary
  button's ivory chip (the green-on-green override is gone).
- Dark phone Home: theme-color and the html background take the hero bar's
  own colour (`--ch-frame`), not green-800 under a darker bar.
- A press on the coach phone's Next up card deepens its green (opacity of a
  layer under the words), as the player's Up next does.
- The player's "Open recap" / "My stats" link ends on the card's edge
  (`.ch-btn--flush-end`).

## 2026-10-18 — Wave 7: player Home privacy, replies and coach asks

```text
Design package: none (wave-7 player journey review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    reads only (own attendance rows, Team Hub's player reads)
Held items:     works before and after 20261017102000 (HELD.md)
```

### Fixed (2026-10-18, meeting privacy)

- Decision B: a player's week (day counts, agenda, Today, Up next) holds a
  meeting only when they are on its invite list (their own attendance row,
  read before and after migration 20261017102000). Up next moves on to the
  next event they can see. When their own replies don't load, D2-8 decides
  from the counts; when that fails too, no meeting is shown (fail closed;
  `home.ownReplies` and `home.meetingInvites` are logged).

### Changed (2026-10-18, player Home)

- "From your coach" under the hero: replies owed, posts to acknowledge and
  tasks due within a week, counted as Team Hub lists them; it opens Team Hub
  and hides when nothing waits or a read fails (`loadPlayerAsks`).
- Up next says "You're going" or "Reply needed" from the player's own reply.
- "Start a round" replaces "Post a round"; "Your latest round" replaces "My
  latest round"; a clean sweep reads "Your last ten rounds were all 71 or
  better."
- Preview: the player and coach weeks' weekdays are their dates' own (Wed 14
  Oct; the Pinehurst qualifier is Friday 16).
- P002 CONTRACT, PAGE, DESIGN and the bridge contracts say "Start a round"
  and "Your latest round".

## 2026-10-18 — Wave 5: Start a round icons

```text
Design package: none (wave-5 first-use and round-flow review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Start a round)

- The player's first-run Home (CH-2312) draws a flag over "Welcome to the
  team" and a plus on Start a round, as Rounds does.

## 2026-10-18 — Wave 5: pending labels end in “…”

```text
Design package: none (wave-5 feedback review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, pending labels)

- A section's Try again reads "Trying again…" while it runs (CH-2402).

## 2026-10-18 — Wave 4: phone text follows Dynamic Type

```text
Design package: none (wave-4 Dynamic Type pass)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Dynamic Type)

- Phone text in `home.css` (coach and player Home: greeting, day card, Later
  today, form labels, week strip, latest rounds, Your game) moves from fixed
  px to `calc(N * var(--ch-type-k))`, so it grows with the iPhone's Text Size
  (to XXL). The figures stay fixed on purpose: the form figure and its delta,
  the form strip values, the score tiles (46px), the countdown digits, the
  game figures, the chart's axis and value text. Desktop-only rules are
  untouched.
- Phone Latest rounds: the dot between course and date is drawn by the
  stylesheet (`.ch-hm-rd__when::before`), not the date's text. Above the
  default Text Size the course takes its own line in full and the date the
  line under it, without the dot; at the default the row draws as before (one
  line, the course gives way with an ellipsis).

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): every Home preview state is
  pixel-identical to before at the default size. At `--ch-type-scale` 1.353
  (XXL) this sheet's change takes unscaled text from 81 to 21 elements on
  `home` and 196 to 113 on `home-player` (the rest: the fixed figures above,
  the scorecard grid, and shared avatars, bell and buttons); no horizontal
  overflow, no overlaps. Latest rounds at XXL: "Oakmont CC" in full, "Sun 12
  Oct" under it (it was "Oakm… · Sun 12 Oct"); the default and 1.059 draw no
  clipped course.

## 2026-10-18 — Wave 3 accessibility: day card focus rings

```text
Design package: none (wave-3 accessibility review, items 2)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, a11y wave 3)

- Phone: the day card's open link and its two actions draw their own ivory
  focus rings on the green. The shared `.ch-root :focus-visible` ring used to
  win over them (same weight, loaded later) and drew a 2px green ring on green
  (1.55:1); the rules now carry `.ch-root`, so the ivory rings (10.5–11:1)
  show.

### Verification (2026-10-18, a11y wave 3)

- WebKit (Playwright, dev preview, 390, light and dark): keyboard focus on the
  day card's link draws the inset ivory ring and no outline; on an action an
  ivory 2px outline, 11.0:1 light and 10.5:1 dark (was 1.55 and 5.28).

## 2026-10-18 — Wave 3: the head on the shared line

```text
Design package: none (wave-3 design review, items 5)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, page-head line)

- On desktop the page head sits on the shared line: the main takes
  `--ch-page-gutter` (40px) at its sides and `--ch-page-head-top` (34px) above
  the head (tokens.css), and keeps its own max width, so at 1280 and below the
  title holds still between tabs. Home's date line is 4px shorter than the
  eyebrow, so its top adds 4px (the loaded, loading and first-run heads alike).

### Verification (2026-10-18, page-head line)

- WebKit (Playwright, dev preview): every full-head tab title (Home, Hub, Stats,
  Calendar, Settings, Qualifiers, Rounds, Classes, CoachHelm) at y 156 (156.9 on
  Rounds) at 1280 and 1440, and at x 284 at 1280; at 1440 a page narrower than
  the canvas still centres (Home x 320, Settings 340, CoachHelm 290). Loading
  states keep the loaded head line. At 1024 the same line holds where a page's
  narrow layout does not take over (Settings keeps its 16px); at 390 every main
  keeps its phone padding.
- `clubhouse:check`, `typecheck:fast` and eslint pass. `clubhouse:css` exits 1
  on five `shell.css` findings (lines 3743 to 3822) from earlier work, none in
  this change.

## 2026-10-18 — Wave 3: a readable chosen window, one word for replies

```text
Design package: none (wave-3 design review, items 1, 3, 12)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, scoring switch and reply counts)

- Player Home phone, Scoring: the chosen window ("Last 10") keeps the
  switch's own ivory ink on the green chip; the quieter ink-600 now applies
  only to the options off the chip (`home.css`).
- An agenda row that asks for replies reads "5 of 6 going", as the day card
  does, where it said "confirmed" (`model.ts` `confirmedLine`).
- The latest round's flag (desktop and phone) is drawn at the Clubhouse
  stroke through `Icon` (`LatestRound.tsx`, `PlayerHomePhone.tsx`).

### Verification (2026-10-18, scoring switch and reply counts)

- WebKit at 390, the chosen segment's ink against the chip's gradient where
  the text sits (25 to 75% down): light 6.8:1 or more, dark 4.8:1 or more
  (the chip's top edge is 4.4:1 in dark, above the text).
- `npm run test:file` on the Home, Player Home, logic and attendance tests.
- The catalog rows (CH-2209, CH-1304), the contract and Bridge 20804
  (`config/clubhouse/bridge-contracts.json`, then `registry.mjs sync`) say
  "going" too.

## 2026-10-18 — Polish: Home loads in the reader's shape, names on one line

```text
Design package: none (wave-2 states review rows 1, 6, 7, 10, 13)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, loading and long names)

- Desktop skeleton (CH-2401): a coach's head is followed by the team scoring
  form's band on its green stage (bars only; the plot is left empty), so the
  sheet lands where its bars were. A player's head drops the coach's brief
  (`SkeletonDeskHead.tsx`, `home.css`).
- Phone skeleton: the coach's Up next card is the day card's 238px, with bars
  for the invitees and the action, and the first section sits 12px under the
  hero, as loaded (`SkeletonPhoneHero.tsx`, `home.css`).
- Phone Latest rounds: a long name keeps to one line with an ellipsis instead
  of wrapping to three lines, and the course gives way to the date: a long
  course ends in an ellipsis and the date keeps its place (`HomePhone.tsx`).
- Desktop leaderboard: a name keeps to one line. On the narrowest desktop
  canvas (a window just over 820px) the board drops its Last 7 rounds drawing,
  so the name and form line fit where they wrapped to three lines.

### Verification (2026-10-18, loading and long names)

- WebKit (Playwright, dev server, preview fixtures), skeleton top against
  loaded top: coach sheet at 1280 497 vs 499 (was 303 vs 499); player sheet
  at 1280 254 vs 256 (was 303 vs 256); phone Up next 238 vs 238 tall (was
  172) and the first section 516 vs 517 (coach) and 444 vs 445 (player).
- Leaderboard rows are 64px at 821, 900 and 1000 with the preview's names and
  with long ones (the preview's names made 81-99px rows at 821 before); phone
  Latest rounds rows are 70px with long names.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on five
  `shell.css` findings (lines 3742-3821), none in this change.

## 2026-10-18 — Polish: a way out of no team, one notice sentence

```text
Design package: none (wave-2 states review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, states review)

- No team (CH-2307, CH-2313): the page empty offers "Open team settings", as
  Classes and Recruiting do. A coach goes to Team, a player to Golf profile,
  where joining a team lives (CH-8302).
- The leaderboard and latest round notices end "Try again; the error has been
  reported.", the sentence every other notice uses.

### Verification (2026-10-18, states review)

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on five
  `shell.css` findings from commit 3730926bb, none in this change.

## 2026-10-17 — Polish: a countdown in two units, greens in points, no seam

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Player Home's countdown shows its two largest units, the leading one never
  zero-padded: "1d 18h" a day or more out, "18h 02m" inside a day, and the
  seconds only inside the last hour ("4m 09s"), where it was "01d 18h 02m 00s"
  for an event days away (owner item E). The timer's name follows: "Starts in
  1 day and 18 hours" (`Countdown.tsx`, the well's two columns in `home.css`).
- Coach Home's form strip: the greens change reads "+3 pts" beside "61%", as
  it is a change in percentage points (`TeamForm.tsx`, `HomePhone.tsx`).
- Phone: Home paints no flat fill of its own, so the canvas's parchment and
  light carry to the tab bar and a short page (a failed load) has no seam
  where its content ends (`home.css`).
- Tabular figures restored (review row 18): 39 rules in `home.css` that set
  `font` on a figure (`.ch-num` or inside one: week days, agenda times,
  leaderboard, rail, form strip, countdown, player figures) now set
  `font-variant-numeric: tabular-nums` after it, since the shorthand reset what
  `.ch-num` gives. Hero numerals of 40px and over keep proportional figures.

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `clubhouse:css`, `typecheck:fast` and eslint. The WebKit pass is the
  coordinator's.

## 2026-10-17 — Wiring checked against production

One change: the coach first run's Invite players (desktop and phone) links
`/golf/dashboard/roster?invite=1`, so it opens Roster's invite sheet instead of
only the Roster page (`CoachHome.tsx`, `HomeFirstRun`; P003 reads the param).

Home has no write, so the pass checked every link and both loaders. Every link
resolves for the role that sees it and carries params its target reads: Calendar
`?new=1` (with `&type=` from the phone's quick chips), `?date=&event=` and
`?view=day&date=` (`parseView`, `parseNewType`, `parseDate`); Messages
`?conversation=` (the team chat), `?player=`, `?user=` (Message coach, a coach
in the Messages directory) and the prefill key (Nudge, Message invitees); Stats
`?player=`; the round review `/rounds/<id>` (coach and player patterns in
`nav.ts`); `/rounds/new`, Classes and Roster through `rebuiltHref` for the right
role. Loaders against Fairway's `dashboard-data.ts`: rounds are `is_test =
false`, `status = completed` with a total (same); events are team events without
classes (same) and also drop cancelled events, which Fairway's Home (both roles,
`dashboard-data.ts`) still shows (Clubhouse is right; left as a Fairway
question); the roster is active members (same); a meeting with no invitees stays
off a player's Home, as on the player's Calendar. No realtime on either side.

## 2026-10-17 — A player's Home reads reply counts, not teammates' replies

```text
Design package: none (no visible change)
PR/commit:      uncommitted (owner-flagged attendance RLS, docs/clubhouse/STATUS.md)
Contract IDs:   none new (D2-8 and the agenda lines unchanged)
Actions:        ACT-P002-OPEN-PLAYER-HOME
Data impact:    reads golf_event_attendance_counts (held migration 20261017102000)
Held items:     supabase/migrations/20261017102000_golf_event_attendance_players_own_rows.sql (HELD.md)
```

### Changed

- `loadHomeWeek` (`data/home.ts`) takes `viewer: 'player'` from player Home
  (`data/player-home.ts`): the week's "N players", "N of M confirmed" and the
  phone cards come from `golf_event_attendance_counts` instead of every
  invitee's row, so no teammate's id or reply reaches the player's page (the
  rows' path carried every invitee's id in `inviteeIds` until player-home
  stripped it). The lines render exactly as before. Coach Home keeps the rows.
- `ChHomeEvent.invitedCount` (new, optional): how many are invited. Player
  Home's D2-8 rule (a meeting with no invitees is the coach's own) reads it, so
  a meeting that invites only teammates still shows.
- `inviteDetail` and `confirmedLine` (`screens/home/model.ts`) also take a
  count; a count reads like a list the player is given no names for.
- Until the migration is applied the function answers PGRST202 / 42883 and the
  rows are read as before. Any other failure drops the counts (never
  "0 players"), logged as `attendance`, and never hides a meeting.

### Why

- Migration 20261017102000 narrows `golf_event_attendance` so a player reads
  only their own row. This closes the VERIFY note that players can read
  teammates' replies through the API once the migration is applied.

### Verification

- `npm run test:file -- src/clubhouse/__tests__/attendance-counts.test.ts`
  (same agenda as the rows' path, no attendance read, no teammate id in the
  payload, D2-8 with counts, fallback, failure, coach) plus the existing Home
  suites. No screenshots: nothing visible changed.

## 2026-10-17 — "Today" turns at the team's midnight

```text
Design package: none (no visible change to the design)
PR/commit:      uncommitted (owner request "fix whatever needs it")
Contract IDs:   none new (20301's prose in CONTRACT 03)
Actions:        ACT-P002-OPEN-COACH-HOME, ACT-P002-OPEN-PLAYER-HOME
Data impact:    none (the loaders return the team clock they already read)
Held items:     none
```

### Changed (2026-10-17)

- Both Homes carry the team clock they were read on (`clock: { tz, day }`, from
  `homeClock`). `useHomeDayRollover` compares the team-local date now with that
  day, in the team's zone (the device's only when a page has no clock), and
  reads the page again when it has turned: at the team's next midnight, and
  when the page comes back into view (visibilitychange, focus, pageshow), at
  most three times for one new day if the server still answers with the old
  one. The date line, greeting, week strip, Today and the day card no longer
  keep yesterday on a page left open overnight. A frozen preview clock never
  rolls.
- "Today", "Tomorrow" and the weekday already compared both dates on the
  team's clock (2026-10-02); now covered by a test across zones.
- VERIFY: the `golf_event_attendance` read question answered (players can read
  teammates' replies through the API; Home shows counts only), and the
  skeleton gap corrected (the phone skeleton is phone-shaped and role-aware
  since 2026-10-08; the desktop one is still the coach's shape). CONTRACT 02
  and 20301 follow.

### Verification (2026-10-17)

- `npm run test:file -- src/clubhouse/__tests__/home-day-rollover.test.tsx
  src/clubhouse/__tests__/home.test.tsx
  src/clubhouse/__tests__/player-home.test.tsx`; the rollover file also under
  `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`. No screenshots: nothing
  visible changed and the dev server was not run.

## 2026-10-16 — The phone's game switch takes the shared green chip

The chosen segment of the phone's game switch (`.ch-ph-game`) is the lit green
chip every switcher draws now, on this switch's tighter corner, instead of a
quiet raised ivory one (`home.css`). Shared detail: docs/clubhouse/CHANGELOG.md.

## 2026-10-14 — The desktop head stacks on a narrow canvas

- **A narrow canvas stacks the head** (home.css, `@container (max-width:
  640px)`): in a small window, iPad split view or a phone turned sideways the
  greeting sat in a 91px column beside its two buttons ("Welcome / back, /
  Nick."). Under 640px of canvas the head is one column, the actions under the
  brief, and the loading head stacks the same way so nothing jumps when the page
  lands. Checked in the iPhone 17 Pro Simulator in landscape.

## 2026-10-12 — Home follows the dashboard layout's role

- Clubhouse Home is drawn for the role the dashboard layout draws its shell
  with (`getGolfDashboardRole`): a user with an onboarded player profile and a
  coach profile never finished gets player Home, not coach Home. Fairway's
  dashboard is unchanged (a coach row still draws the coach dashboard there).

## 2026-10-10 — RSVP only when the coach requires it

- The day card and phone Up next show a going count, "haven't replied" and
  Nudge only for an event that requires an RSVP; otherwise "N invited" and
  Message. A later competition's line reads "N of M confirmed" only with RSVP
  on, else its place (`data/home.ts`, `HomePhone.tsx`).

## 2026-10-10 — The team's form on the coach's desktop Home

Presentation only. A deep-green band between the head and the week: the team's
scoring average with its change against the previous ten,
the team's average on each of its last round days as a line (drawn once, left to
right, the first time it is seen), and the week's
rounds, greens and putts. It reads `data.phone.form` as it is (the figures the
phone strip and Team stats already use) and is absent
when that read failed.

## 2026-10-08 — the cardless pass: Since you last looked

On the phone, "Since you last looked" is a list, not a sideways rail of filled
tiles. Each change is a Ledger row
(`LedgerRow`) between soft seams: the figure (a posted score with its to-par in
the under-par red, or the new
replies) stands in the lead, 68px wide, so the titles start where Later today's
titles do, and a posted round
carries its course and day under the name. The rows take Later today's sizes
and, like Home's other lists, show no
chevron. The single green Up next card is unchanged; the desktop does not draw
this section.

## 2026-10-08 — the player peek (P003-C1)

The shared PlayerPeek: the phone's Latest rounds rows peek at the player on a
hold, from the board's row when the player has one, else from the round
(`roundPeek`). No new reads.

## 2026-10-08 — premium pass: findings D3, D4, D5

- D3: a leaderboard row is a table row (a `div` with `role="row"`). The player's
  name is the link to their stats, and its `::after` covers the row, so the
  whole row still opens it. The row draws the focus ring
  (`:has(:focus-visible)`), and assistive tech now hears a row with a link in
  it, not a row that is a link.
- D4: players on the same season average, to the tenth, share a place with a T,
  and the next place counts them all: 1, T2, T2, 4 (`leaderPlaces`). An early
  read has no place yet ("—"); the loader already sorts early reads last.
- D5: on the phone, a part that didn't load keeps its section and the same head
  as the others (Up next, Team scoring, Latest rounds: a title over the rule),
  at one rhythm. Up next's failed section keeps 18px below the page notice.
- D8: the phone date line is no longer tracked: 13px, weight 500, 0.01em, the
  values P001 D5 sets for the shell's eyebrow. D2 was already fixed: the stack
  overlaps by 4px (aesthetic audit H-1), so no initials are clipped.
- Not changed: D6. With the Day card the coach's desktop columns end about 90px
  apart in the preview, not 300px. P002-A1, the alternative fix, is on the
  not-building list.

## 2026-10-08 — premium pass: the sunset on the day's rail

"Later today" carries today's sunset at the team's place (the global light's
`sunTimes` and `useLightPlace`) while it is still ahead, with when the light
turns golden; a champagne mark on the rail and a sunset glyph. Nothing after
sunset.

## 2026-10-08 — premium pass: trend sparkline in the phone's Latest rounds (P002-C2)

Each latest round on the coach's phone carries its player's last rounds as a
64x18 bare FormLine between the player and the score (from the leaderboard rows
Home already loads; three rounds or more). It is decorative beside the figures
(the trend itself lives in Stats), and absent when the leaderboard read failed.

## 2026-10-08 — premium pass: the coach's phone Home is the day (concept board 1)

The coach's phone Home opens on one living green card for the next thing that
matters (`screens/home/DayCard.tsx`, owner-approved phone concept board 1, "The
day, not a dashboard"); desktop keeps its dashboard, and the player's phone
keeps Up next.

- The card holds the event under way ("Now · until 5:00 PM") or next ("Next up ·
  3:30 PM") with its time chip, the invitees (28px coins that no longer clip
  their initials, P002 D2) and "5 of 6 going · Eli hasn't replied". Once today's
  events are over and rounds came in today, it becomes the day's recap, each
  round opening its card. A live round has no read on Home yet, so that phase
  isn't drawn.
- Actions are the coach's and prefill Messages only (D2-7): Nudge the people who
  haven't replied, or Message the invitees when everyone has. Directions is a
  plain Apple Maps link, only for competitions and travel with a place (no maps
  API, D1-2).
- "Later today" replaces Today when the day has events: the rest of today on the
  same rail (the card's event and what is over left out), then the week's next
  competition. A slot is ready for the sunset row from the global light.
- "Since you last looked": chips for rounds posted since this device last showed
  Home and for new replies to the card's event, kept on the device only; nothing
  on a first visit.
- The loader adds `awaiting` (who hasn't replied, id and name) and `inviteeIds`
  to the coach's events, null when replies didn't load; the player's Home strips
  both. Latest rounds carry their `date`.
- The gap under the hero is one 34px step (P002 D7).

## 2026-10-08 — premium pass: the brief loses the AI glyph (D1)

The phone hero's brief is deterministic (`homeSubline`), so it no longer wears
the Sparkles glyph that reads as model output; the line stands alone. The owner
declined the "Why this line" sheet (P002-C1: "Take this out").

## 2026-10-08 — Copy: typographic apostrophes

Home writes its apostrophes as ’ on desktop and the phone: the no-team pages
(CH-2307, CH-2313), the empty leaderboard (CH-2304), the phone's hole-by-hole
lines (CH-2203, CH-2303) and its empty week (CH-2309), "Theo’s stats", the
scorecard's name, the team scoring chart's label and the coach brief's line
("Eli hasn’t posted a round in 9 days"). The catalog quotes them as shown.

## 2026-10-08 — Coach Home on the phone: the board as drawn; coach and player match

The coach's phone Home now matches its "Mobile v2" board where the port had
drifted, and the coach's and the player's share one set of rules:

- section titles (Today, This week, Latest rounds) are the Ledger's phone
  heading, the bold condensed sans in forest ink; they were the old 17px black,
  because the board styled h3s and the page's titles are h2s;
- This week draws today as the solid green key and a competition day as a soft
  green tint with its trophy; the board's rules put the classes on the key,
  the strip puts them on the day, so they never applied;
- Today's rows and the latest rounds sit on the section's edge (the time at the
  edge, as the board sets it) between soft seams, and tint on press;
- the sheet is the canvas' own parchment, so a short page has no seam where
  the darker sheet used to end;
- the week's notice sits on the sheet under the greeting, outside the green
  card (as the player's), and the coach's first run opens on the page intro;
- every control answers a press (CH-1606): Up next deepens, the week's keys
  and rows tint, the quick event types shrink, Add event darkens, Calendar and
  Team stats dim;
- the date is the page intro's 12px eyebrow (the phone text floor) on both
  roles, 10px above the greeting as the kit's PageIntro sets it.

The skeleton's phone hero and the date's new line move together: skeleton to
page stays within half a pixel for both roles. On desktop, the leaderboard's
notice now sits 18px under its head's rule (it touched it). Measured in WebKit
as an iPhone at 390 wide.

## 2026-10-08 — Player Home on the phone: every tap answers; the skeleton is the reader's own

Measured in WebKit as an iPhone at 390 wide (touch, no hover), every control on
the player's phone Home now answers a press, with no tap flash:

- Up next deepens its green (a large card answers with a tint, never a scale,
  CH-1606); a day in the week strip tints its key, today's green key deepens;
- Today's rows, the latest round's pager and its keys tint a beat after the
  finger lands (the CH-1606 delay, so a scroll that starts on them never
  flashes), and the pager's keys shrink as every button does;
- the Scoring window switch glides (36 frames over about 300ms) and lands in
  one frame with reduced motion.

The route skeleton's phone hero follows the shell's role (SkeletonPhoneHero):
the player's has no brief, its Up next card sits under the greeting with the two
keys under it, and the coach's draws the brief as three lines over the coach's
shorter card. Skeleton to page now moves nothing by more than half a pixel for
either role (it was 61px for the player's card and 20px for the coach's).

## 2026-10-08 — Home's states: one notice for several failed reads, and the framed first run

Fixes from the states audit, on desktop and the phone, for both roles:

- when two or more of Home's reads fail, the page says so once, under the head
  (CH-1209): "Some of this page didn’t load", naming the parts ("This week’s
  schedule, recent rounds and the leaderboard didn’t load"), with one Try
  again. Each failed part keeps only its notice's title under its heading, with
  no button of its own. One failed read keeps its own notice and Try again, as
  before. The player's latest round and scoring read the same rounds, so the
  notice names them by their sections ("your latest round and your scoring");
- on the coach's phone the week's notice (CH-2201) is out of the green Up next
  card, on the sheet under the greeting, as on the player's;
- the first-run pages (CH-2308, CH-2312) open under the loaded page's framed
  head on desktop (the double rule, the engraved date, the greeting in forest
  ink, set where the loaded Home sets them), and the coach's phone first run
  opens on the Ledger's page intro, as the player's does;
- the notices' titles end without a full stop and use the curly apostrophe of
  the page notice beside them.

New tests: home.test › CH-1209 (several and one), the phone's CH-1209 and
CH-2201 outside the card, CH-2308's framed head; player-home.test › CH-1209 on
desktop and the phone.

## 2026-10-08 — Player Home on the phone: the Mobile clubhouse pass

The player's phone Home follows the same board as the coach's (round 3, "fewer
containers, one feature card"), carried to `m-player-home.jsx`:

- the page is the chassis' parchment sheet from the greeting to the tab bar;
- Up next with its countdown stays the one green feature card; Message coach
  and Post a round under it are the shared buttons, Post a round the primary;
- This week, My latest round, Scoring and Your game sit flush under engraved
  double rules, their titles in the bold condensed sans. No white cards: the
  latest round's GIR, putts and SG are the Ledger's figure row between
  hairlines, Scoring's four figures sit two by two between hairlines, and the
  four parts of the game are divided by soft rules. The scorecard keeps its
  green board and the window picker its well;
- the week strip draws today as the solid green key and a competition day as
  a soft green tint with its flag, as the board does; Today's rows sit on the
  section's edge and tint on press;
- the first-run page opens on the Ledger's page intro (the date under the
  double rule, the greeting in the bold sans).

Fixed: when the week didn't load (CH-2201) its notice sat inside the green
card and took the card's ivory ink, so its words were invisible; it now sits
on the sheet. Home's phone skeleton (CH-2401, shared with the coach) draws the
new page: the parchment, the date and greeting lines, the brief's lines, the
green card and the first section under its rule, its hero held at 386px
between the coach's (388) and the player's (382), so the first section lands
within 3px. Desktop is unchanged.

## 2026-10-08 — Coach Home on the phone: the Mobile clubhouse pass

Phone Home now follows the owner's "Coach - Home - Mobile v2" board
(`m-clubhouse.css`, ported in order so its third round wins):

- the green chassis bar over the parchment sheet;
- the greeting in the bold 31px sans in forest ink, with the brief under it;
- Up next as the screen's one green feature card;
- Today, the team's scoring, This week and Latest rounds flush under engraved
  double rules, with rows on seams instead of white cards.

The board's own hero drew the bar and the sheet's lip; in the app the shell's
phone chassis draws both, so the hero here is the sheet itself.

## 2026-10-07 — A leaderboard row answers the press

On desktop a leaderboard row keeps its Ledger tint and sliding chevron on hover,
and a press now deepens the tint (`--ch-ledger-row-press`) and nudges the
chevron 2px on over the press beat, easing back over quick. Before, the press
tint was masked by the hover rule. The row never lifts or scales; CH-2602 now
says so and is referenced in `Leaderboard.tsx`. CH-2601's reduced-motion wording
is corrected: paging is instant, not a fade. Frame-sampled in WebKit at 1440
(tint 180ms, chevron 260ms).

## 2026-10-07 — Home on the Ledger

On desktop, the week and the latest round no longer share a lit sheet. They sit
on the canvas, split by a soft hairline column. The leaderboard is rows on the
canvas, aligned to the head's edge, with soft seams and a quiet hover tint. Its
heading sits over the engraved rule. The section headings ("This week", "Latest
round", "Leaderboard") are in the heavy sans. The scorecard keeps its green
board, and the week strip keeps its well. On the player's Home, Scoring runs on
from the week with no card, at the head's edge. "Your game" is four figures on
the canvas divided by soft rules, not four cards, and the up-next board keeps
its green. The phone is unchanged.

## 2026-10-07 — Home in the framed page head

Desktop Home's greeting block is the framed page head instead of the green
canopy: the date as an engraved line, "Good morning" as the heavy sans title in
forest ink, the brief, and the actions on the right. The loading screen draws
the same head line for line (183px at 1440).

## 2026-10-07 — Loading holds the loaded page

Desktop Home loading draws on the canopy, with the title block in the loaded
grid: the actions sit beside the brief and the serif greeting's line is 71px.
The sheet panes hold 623px. Measured in WebKit at 1440: the title, sheet and
leaderboard tops don't move when the page lands.

## 2026-10-07 — Figures drawn, not stated

Owner: no bare numbers. Each Scoring figure is now drawn against a reference
that is real:

- **Average:** the current window's average beside the previous window's, as two
  marks on one track.
- **Strokes gained:** a bar from a zero tick.
- **Under par:** one mark per round, red under par and pale green at par.

The latest round's GIR, Putts and SG (desktop and phone) carry small drawings
(`RoundViz.tsx`): greens hit out of those played, putts against two on every
green (36), and strokes gained from zero. Each drawing sits in its caption's dd,
so every figure stays one dt with its value and caption dd pair.

## 2026-10-07 — Home on the canopy

Desktop Home moves from the green band card onto the shared canopy: a serif
greeting, the brief in larger type, and the actions set level with the brief.
Section titles (This week, Latest round, Leaderboard, Scoring, Your game) and
the phone hero greeting are set in the display serif.

## 2026-10-06 — Desktop hero band, leaderboard and scoreboard

Desktop Home, coach and player, verified in Safari 27 at 1440×1000.

- **Hero band:** the page opens on a deep green band, the desktop twin of the
  phone hero. It has ivory type, a mint date, on-dark actions set at the right
  and a faint drifting contour pattern; the drift is off with reduced motion or
  Animations off. The week sheet follows the band and is never tucked under it.
- **Recent rounds (coach):** the latest-round pane closes with Recent rounds, a
  picker over the same rounds as the pager, so the pane no longer ends in empty
  space.
- **Leaderboard:** now one reading sheet:
  - a quiet column-label row instead of a header well, and seams between
    players;
  - podium position keys, with the leader's in green, and a state dot before
    each form word;
  - the season average as each row's figure;
  - a tinted hover with a sliding chevron instead of a card-in-card hover.
- **Scorecards:** both the desktop and the phone scorecard use the new green
  scoreboard.
- **Contrast:** stronger text in the week strip and scorecard.

## 2026-10-06 — Premium materials pass

Player Home premium pass (owner, Safari 27 desktop and iPhone emulation). The
CoachHelm brief line is removed. Up next opens the latest-round pane, and the
week, latest round and Scoring join in one surface with engraved seams. The
today key in the desktop week strip is a frosted, higher-contrast key. "By part
of the game" becomes "Your game" with more space above it; the legs drop their
icon tiles and show a full-width trend line with an Improving/Steady/Slipping
caption. Score marks, the countdown well, hero actions and the scorecard well
use the shared materials. All Home radii are on the scale.

## 2026-10-06 — Owner rejects excessive card depth

The owner described the large stacked shadows as looking poor and artificially
styled. The shared depth ladder now uses quiet contact shadows for reading
cards, shallow controls, a small floating lift and stronger separation only for
menus/sheets. Settings form groups have no drop shadow. Home and Recruiting
card overrides use the same reading token, including Home’s hero and nested
next-event card. Broad 44/52px reading-card shadows
and stacked bubble shadows are removed. Existing layout, colors, typography,
focus indication and data behavior remain intact. This updates the October 2
depth direction; earlier audit entries below record that prior review.

Before/after normal-content captures are in page VERIFY logs. Physical-device
and owner visual acceptance remain open in [POPUP_AUDIT](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

LatestRound passes the reduced preference through chSwap, eliminating the
retained fade when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 13 mapped
actions and 2 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p002-home). Approved handoffs and contract IDs
are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — Partial data keeps its meaning

The Codebase Design plugin review found relative day labels using the viewer's
clock, partial invitee identities paired with a complete Going count, and
missing sand/par data converted into confident figures. Home now uses its team
timezone, suppresses an unresolvable paired attendance count, and includes only
recorded par/sand values in those figures. A common par line requires all shown
rounds to agree. Known names and available totals remain visible.

Verification: 132 targeted data/consumer tests pass with one worker, including
traveling timezones, unresolved identities and missing par/sand values. These
are mocked-read tests; no migration or customer-data repair was performed.

## 2026-10-01 — Safari Home and truthful event timing

Branch: `codex/clubhouse-design-fidelity`. Owner approved showing dates for
all-day events instead of a midnight countdown. Both player layouts follow that
rule; timed countdowns reserve their four wells before hydration and use roomier
padding. Shared surface depth and the compact header mark follow the supplied
mobile boards.

Data repairs: Home now uses Calendar's literal all-day dates and inclusive
spans, retains events active today, includes multi-day events starting before
this week, and reads every event page instead of silently stopping at 500.
Neutral strokes gained no longer produce a false loss claim. No event writes or
schema changes. Regression coverage is in `home-data-completeness.test.ts`,
`home-reads.test.ts` and `player-home.test.tsx`. Synthetic WebKit and local
mocked reads verify these contracts; no customer database was touched.

## 2026-10-01 — Aesthetic audit: the stacked coins clear their initials, the latest round's stats follow its scorecard

```text
PR/commit:      agent/swap-audit (#2111): 4e01c43d8
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** (1) The phone's avatar stack overlapped 7px, so the last stroke of
  four coach initials ran under the next coin (measured 1.6 to 3.3px; "TM" read
  "TN"). (2) The latest round's stats row was pinned to the sheet's bottom,
  171px (coach) and 234px (player) under the scorecard at 1440x1000, 38% and 46%
  of the column, because the week beside it runs longer.
- **Fix.** `home.css`: the stack overlaps 4px; `.ch-h-round__foot` has
  `margin-top: 4px` instead of `auto`.
- **Not done, on purpose.** The space under the stats is still there (it moved
  to the bottom of the sheet); filling it is new content. The conflict triangle
  on the timeline is icon-only (Q-150). The "Latest round" move is design
  judgment and one rule to revert.
- **Contrast pass (`d4367ee`).** The week strip's weekday labels measured 4.1:1
  (UX360 sampled 3.7:1): `.ch-h-day__d` uses secondary ink. The segmented Last 5
  and Last 20 labels take the shared fix below.
- **Verification.** Before and after at 375, 390, 430 and 1440, coach and
  player; the geometry report shows "initials under next coin: TM, SA, AL, JO"
  before and none after. Not tested: a real iPhone.

## 2026-10-01 — Page performance: Home reads in fewer round trips, and its skeleton is the page's height

```text
PR/commit:      agent/swap-audit (7dd8bb3d2, 19a20054b)
Design package: none (no visual change once loaded)
Contract IDs:   none new (CH-2401 behaviour unchanged)
Actions:        none
Data impact:    none; same figures, same reads, in fewer round trips (`loadCoachHome`, `loadPlayerHome`)
Held items:     none
```

- **Issue.** The coach's Home read in four round trips, five when the week's
  events have replies to read: the team's timezone, then the roster, the chat
  and the week's events, then the replies, then the season's rounds (which
  waited for the whole week), then the newest rounds' holes. The player's took
  three. The route skeleton's head was 69 px against 189 loaded (it had no
  sentence and no actions), its sheet 209 against 423, so the leaderboard
  landed 334 px lower than it was drawn.
- **Fix.** The timezone, the roster, the chat and the week's events start
  together (the events are asked for over one window wide enough for any
  timezone and cut to the week in code); the replies start as soon as the
  events are back and the season's rounds as soon as the roster's ids are, so a
  coach's Home is three round trips and a player's two (`home-reads.test.ts`
  pins both, and that the events are read once). The skeleton's head is its
  four lines (date, greeting, two-line sentence, the two actions), its sheet
  panes the loaded height and the leaderboard's heading its two lines and
  button: measured against the loaded page, the head, the sheet and the
  leaderboard's top land within 1 px (the head was 120 px short and the
  leaderboard landed 362 px lower than drawn). A tap on the leaderboard or the
  next-event card shows the page's hairline while the page loads
  (`LinkPending`).
- **Not done, on purpose.** Nothing is cached across requests or users. The
  route skeleton serves both roles and draws the coach's sheet, so a player's
  loaded sheet is 128 px taller than it. The phone's skeleton hero is 22 px
  (coach) or 36 px (player) taller than the loaded one (the lead's design,
  measured, not changed). A tap into Home shows its page no earlier than about
  350 ms whatever the server time, because React holds a Suspense reveal
  until 300 ms after the skeleton committed; that is the shell's
  (PROGRESS.md, "Stats and home").
- **Checked.** `home-reads.test.ts`, `home.test.tsx`, `player-home.test.tsx`,
  `player-home-phone.test.tsx`, `stats-geometry.test.tsx` (the skeleton's head);
  measured with `npm run clubhouse:perf` (PROGRESS.md, "Page performance
  (2026-10-01)": cold server time 172 to 148 ms coach, 129 to 116 player at
  1280 on build `082214d1d`, inside the player's spread; 6 to 4 and 6 to 5
  round trips on a cold load on `169f17833`).

## 2026-10-01 — "vs. previous 10" compares the same players (Q-112)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (no visual change)
Contract IDs:   none new
Actions:        none
Data impact:    none; `teamForm` (scoring, greens, putts)
Held items:     none
```

- **Issue.** The team's change pooled every player's newest ten against the
  previous ten of only the players who had one, so a player with no earlier
  rounds moved the trend by joining.
- **Fix.** Each change compares the window's rounds of the players who also
  have a previous ten against that ten; the figure itself still reads the
  whole window (owner, 2026-10-01).
- **Checked.** `home.test.tsx` (the §10-1 case now reads 0, not +3.3).

## 2026-10-01 — The coach's team line is a day a point; a change of "0.0" is plain on both Homes

```text
PR/commit:      agent/swap-audit
Data impact:    none
```

- **Issue.** The coach phone's team scoring line drew a five-round moving
  average over every round in the window (about seventy points) and read as
  noise. A change that rounds to zero ("0.0" putts) was painted amber, and a
  strokes gained of "0.0" green, on both Homes.
- **Fix.** `teamForm` draws the team's average on each of its last ten round
  days (as Stats' scoring trend does), so the line has at most ten points. One
  `changeTone` (`lib/format`) paints a change or a signed figure green or amber
  only when it does not round to zero at the places it is shown with; the coach
  strip, the player's scoring figures, the leg pills (a plain pill at "0.0"),
  the latest round's SG and the desktop leaderboard and latest round use it.
- **Checked.** home.test (the daily line, the zero tones) and
  player-home-phone.test; the real coach Home at 390px.

## 2026-10-01 — The player's phone to the board: spacing, the scoring card, Today

```text
PR/commit:      agent/swap-audit
Data impact:    none
```

- **Issue.** The owner: the phone looked the same, with plain numbers and no
  spacing. The hero's brief sat hard against Up next and the greeting against
  the date: base.css zeroes every heading's and paragraph's margin, a
  one-class rule loses that, and a two-selector rule only ties it, so the
  order the stylesheets loaded in decided. Scoring and the parts of the game
  carried the desktop's in-card 20px title and caption, the window picker was
  a small desktop chip whose own labels were greyed by the caption rule, Today
  was a full section with a Calendar link and dimmed rows, the chart repeated
  one date under rounds posted on the same day, crammed ten ticks into the
  axis, and marked no round under par when the window mixed pars.
- **Fix.** Margins now carry enough specificity to win in any order. Scoring
  and By part of the game have their 17px title and one-line meta above the
  card; the card opens on the full-width Last 5 / 10 / 20 picker (all three,
  as the board does), then the line, the four 26px figures (11.5px captions,
  italic green note). Today is a label inside This week with Now / Next on
  the row and past rows in full ink. The chart labels each date once,
  keeps about six whole-stroke ticks, and marks a round against its own par.
  Up next reads "Up next · Qualifier" and a competition day draws a flag.
  The latest round's figures take the board's ruled strip.
- **Checked.** player-home-phone.test (18 cases: the axis and tick helpers, the
  change tones, the picker, Today's marks, the margin rules), player-home.test
  and the clubhouse suite; the preview route and the demo player compared
  with the board at 390px, section by section.

## 2026-09-30 — The Tour is the only benchmark (Q-88): no D1 anywhere

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player Home's four parts of the game drew a D1 mark and "D1 60"
  under each bar.
- **Fix.** The mark is the Tour's average from
  `golf_pga_standards.pga_tour_value` for the team's own tour ("Tour 66"); a
  stat the tour has no value for (fairways, scrambling overall, putts per round)
  still draws no mark. `ChPlayerLeg.d1` is `bench`, `d1Error` is `benchError`,
  and the read is logged as `tourBenchmarks`.
- **Checked.** strokes-gained.test and player-home.test; a mutation back to "D1"
  is caught.

## 2026-09-30 — The player's strokes gained says vs Tour, not vs D1

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player Home said "Per round vs D1" and "strokes gained vs D1".
  Stored strokes gained is measured against the Tour; there is no D1 value
  (Q-88). The figure is the season's, and the legs' header said "Last 10
  rounds".
- **Fix.** "Season, per round vs Tour" and "Last 10 rounds · strokes gained this
  season vs Tour · D1 marks the stats" (the women's Tour baseline for a women's
  team; `ChPlayerHome.tour`).
- **Checked.** strokes-gained.test (2 cases), mutations caught for the label.

## 2026-09-30 — Latest round opens its review (Clickables); Latest rounds links to Team stats (Clickables gap 6)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Latest round opens its review (Clickables)

- **Issue.** Home's latest round linked to Stats, though the round review now
  exists.
- **Fix.** Open recap (desktop), Round recap (coach phone) and the player's
  phone card open the round's review, falling back to Stats when the review is
  not rebuilt for the viewer.
- **Checked.** home and player-home 94/94, 3 of 4 mutations caught (the fourth
  is equivalent today).

### Latest rounds links to Team stats (Clickables gap 6)

- **Issue.** The coach phone Home's Latest rounds header had no way on (the
  board's "All").
- **Fix.** It links to Team stats, only when rounds are listed (a coach has no
  rounds library, Q-79).
- **Checked.** home 58/58, 2 of 2 mutations caught.

## 2026-09-30 — Page docs; every contract proven by a test; two fixes

```text
Design package: design/handoff/ v2 (Coach - Home, Player - Home, and their phone boards)
PR/commit:      agent/clubhouse (this commit)
Contract IDs:   20101 to 22401 (60 on this page: 42 from the catalog, 18 new behaviour contracts without a code)
Actions:        13 (ACT-P002-*)
Data impact:    none
Held items:     none
```

### Changed (2026-09-30)

- The six page docs, the manifest's roles (coach and player), design files,
  tests and 13 actions, and the 18 behaviour contracts (the two Homes opening,
  links out, the clock, an unknown timezone, which Home a role gets, the team
  from the session, the player's own rounds only, a player's week naming no one,
  Message coach finding the coach, each role's own controls, Try again, the
  haptic grammar, the countdown's timer, the phone Home, loaders that never
  throw, failures reported, the tests).
- `home.test.tsx` now renders the real dashboard page for both roles (only the
  session, the flag and the request-scoped team resolvers are faked) and
  `player-home.test.tsx` covers what the player's loader reads and whom it
  names. Existing tests carry the new IDs in their titles; no assertion was
  weakened.
- The catalog and checklist headers name both roles.

### Fixed

- A stored team timezone that is not a real zone threw a `RangeError` in
  `homeClock` and failed the whole page. It now reads as Eastern, like a missing
  one, and is logged as `clubhouse.home.timezone` (20618). The test failed
  before the fix.
- The player's countdown was named "Starts in 1 days" for a screen reader. It
  now says "1 day" (21807). The expected string in the existing test changed to
  match, on purpose.

### Why (2026-09-30)

- D-62 and D-69: every page copies the Messages gold standard and answers every
  category, and Permission has to be real now that Home serves two roles from
  one address.

### Verification (2026-09-30)

- `npx vitest run` on `home.test.tsx` and `player-home.test.tsx` 90/90; `npm run
  -s typecheck:fast` exit 0; `npx eslint` on the changed files exit 0; 57
  mutation checks, each failing the test that guards it (VERIFY.md).

## 2026-09-30 — Message coach finds the team's creating coach

```text
PR/commit: c7810ccf4
Contract IDs: 20805 (documented here)
```

### Changed (2026-09-30, 2)

- `golf_teams.created_by` is a `golf_coaches.id`, not a user id (true of all ten
  live teams), so the lookup always fell back to whichever coach of the
  organisation came first. `coachFor` now matches it against `golf_coaches.id`
  and returns that coach's `user_id`.
- A loader test that a player's week names no teammates, only a count.

## 2026-09-30 — Player Home

```text
PR/commit: 4c7b2e8fc
Contract IDs: CH-2215 to CH-2217, CH-2310 to CH-2313 (new catalog rows); CH-2309 extended
```

### Changed (2026-09-30, 3)

- `PlayerHome`, `PlayerHomePhone`, `PlayerGame` and `Countdown`, from
  `loadPlayerHome`, on the owner's `Player - Home.html` and `Player - Home -
  Mobile.html` (spec `phone/home-player.md`). The player's own rounds only; the
  week through `loadHomeWeek`, now shared with Coach Home along with `homeClock`
  and `latestWithHoles`.
- Message coach opens the coach's thread through a new Messages deep link,
  `?user=` (CH-7001). `/golf/dashboard` is now rebuilt for players.
- Gaps against the boards logged as Q-69.

## 2026-09-30 — v2 phone and first-run page

### Changed (2026-09-30, 4)

- `HomePhone` on the owner's v2 phone board (spec `phone/home.md`): the hero, Up
  next, Today, the team's scoring form, This week and Latest rounds, each round
  opening its card in a sheet. The loader gains `phone`. New catalog rows
  CH-2211 to CH-2214, CH-2308 and CH-2309; gaps logged as Q-66.
- The v2 first-run page empty state on desktop and phone (CH-2308, D-71).

## 2026-09-29 — Fidelity pass and desktop build

### Changed (2026-09-29)

- Coach Home on `Coach Home v3`: the week and the latest round in one sheet, the
  leaderboard, and the full state catalog (CH-22xx to CH-28xx). The fidelity
  pass (D-17) added the brief under the greeting, Message team and New event
  (D-4), the agenda's invitee details and "5 of 6 confirmed", "No rounds 9
  days", the Full roster arrow and the player stats link, compared side by side
  at 1280px.
