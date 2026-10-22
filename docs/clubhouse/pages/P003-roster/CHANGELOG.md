# P003 — Roster: changelog

## 2026-10-21 — Phone Roster figures no longer roll

```text
Design package: none (owner rule: no digit rolling)
PR/commit:      see git log (claude/clubhouse-no-digit-rolling)
Contract IDs:   CH-3604
Actions:        none
Data impact:    none
Held items:     none
```

Owner rule, already applied on Qualifiers: numbers render directly, with no
count-up and no digits rolling. Each phone row's trailing figure (the scoring
average, or strokes gained a round under SG) was a Number Flow numeral. It is
now plain tabular text that takes a chosen sort's figure at once, with a true
minus and a dash for no data. Rows still slide to their new places on a chosen
sort. The text-first swap (`useArrivalPainted`, `.ch-rsm-flowtext`) and
`figureParts` went with Number Flow. Replays 1bff7a784 and c2710104e onto
main.

## 2026-10-22 — The availability word is parsed in one place

```text
Design package: none (coach dashboard parity)
PR/commit:      claude/coach-parity-availability
Contract IDs:   none
Actions:        none
Data impact:    none (same read, same values)
Held items:     none
```

### Changed

- `ChAvailability` and its parsing moved to `data/availability.ts` so Home and
  Calendar read the same word the roster does; the roster behaves as before.

## 2026-10-21 — CoachHelm block and strokes by leg (spec D build B)

```text
Design package: none (spec D, Game Fingerprint and roster detail bridges)
PR/commit:      parity/bridges (not pushed)
Contract IDs:   CH-3212 (new)
Actions:        none
Data impact:    reads only: golf_coach_insights (visible rows, no exposure),
                golf_teams, golf_pga_standards, golf_rounds; no new column
Held items:     none
```

### Changed

- The player panel has a CoachHelm section after Development: "3 costing
  strokes · 1 working" and View insights to the coach's Deep dive of the
  player, "No reads yet" with none, dashes and "Didn’t load. Refresh to try
  again." when the counts did not load (CH-3212), nothing with CoachHelm off.
  The phone profile has the same as a panel after Recent rounds.
- Under the figures, one caption names the strokes-gained leg that loses the
  most ("Loses most putting, −1.1 a round") or, with none losing, where the
  player gains most.
- The panel's Development counts link to the player's Development tab.

### Why

- Spec D: Fairway's roster detail page is covered by the panel, the coach's
  player pages and Stats, except for what CoachHelm reads in the player's
  rounds and the strokes-by-leg summary. The counts are `countReads`, so the
  roster, the Board and the Game profile never disagree.

### Verification

- `roster-peek-reads.test.tsx`, `roster.test.tsx` › CH-3212, `alias.test.ts`;
  VERIFY.md 2026-10-21.

## 2026-10-21 — Availability is the word only: the note is pulled

```text
Design package: spec C, coach parity; code review follow-up
PR/commit:      see git log (parity/roster-settings)
Contract IDs:   CH-3010 (30621) and CH-3102 (30503) retired, never shipped;
                30502, CH-3009, CH-3809 text
Actions:        setPlayerAvailability (no note; refuses one)
Data impact:    reads and writes golf_team_members.availability and
                availability_updated_at only. availability_note is never read
                or written.
Held items:     a coach-only store for the note (needs a migration; see
                docs/clubhouse/held/data/roster-availability.md)
```

### Changed

- The availability note is gone: no note field, counter or blur save in the
  panel or phone profile, no "Add a note" on the success toast (the shared
  `doneAction` in `useAction` is reverted), and no "Availability note" column
  in the export. The list, faces, phone row, panel and profile show the word
  alone ("Injured", "Away").
- `loadRoster` no longer selects `availability_note` and `ChRosterPlayer` has
  no `availabilityNote`; `setPlayerAvailability` takes no note and refuses one
  with "Availability notes are not saved", writing nothing.
- The caption stays: "Shows on your roster only. It never changes their team
  access; Mark inactive does." It is about the word, which is all there is.

### Why

- `golf_team_members_select_v5` lets every teammate read every column of their
  team's rows through the API, so a note ("Only coaches see this") would have
  reached players. Fixing that needs a migration, which is frozen.

### Verification

- `roster.test.tsx`: the panel has no note field, the toast has no action, the
  export has no note column, the loader's select never names
  `availability_note`, and no roster source mentions it;
  `set-player-availability.test.ts`: a note is refused and nothing is written.

## 2026-10-21 — Availability on the coach's roster; the desk view prints

```text
Design package: spec C, coach parity
                (coach-parity/spec-C-roster-availability-settings.md)
PR/commit:      see git log (parity/roster-settings)
Contract IDs:   30203 (CH-3405), 30503 (CH-3102), 30620 (CH-3009),
                30621 (CH-3010), 31809 (CH-3809) new; 30502 text
Actions:        setPlayerAvailability (new,
                src/app/golf/actions/team-management.ts)
Data impact:    reads and writes golf_team_members.availability,
                availability_note, availability_updated_at (already live; no
                migration). Write policy golf_team_members_update_coach.
Held items:     none
```

### Changed

- Availability (Available, Injured, Away) is whether a player can play. It is
  display only and never changes team access (Mark inactive does); the two
  never share a phrase.
- Row menu (kebab, right-click and a face's menu, one list): after the links,
  the two states the player is not in (Bandage, Plane, CircleCheck), then Mark
  inactive or active and Remove. No confirm; the word shows at once and goes
  back if the save fails, and the toast's Retry finishes it (CH-3009). From the
  menu the success toast offers "Add a note", which opens the panel with the
  note focused (`useAction` copy gains `doneAction`, shared change).
- List: the line under the name leads with "Injured · wrist", the word in
  secondary ink, the full line in its title; the Status column is unchanged.
  Faces: the note slot reads the line in plain ink in place of a Needs a look
  reason. Head: "8 players · 7 active · 1 injured · 1 away." Phone: the row's
  line ("Junior · Injured · …") and the kicker ("Varsity · 7 active · 1
  injured · 1 away").
- Panel and phone profile: the identity line adds the word; a new Availability
  section (Segmented, "Availability for {name}") between Development and the
  coach's note, with a note for injured or away (280 characters, saves on blur,
  "Only coaches see this.", counter in the last 40, CH-3102, CH-3010),
  "Updated 3 days ago", and the caption "Shows on your roster only. It never
  changes their team access; Mark inactive does." The ⋯ sheet is unchanged.
- Needs a look leaves out a player who is out (`attentionFor`); rankings, the
  strip and the team average are unchanged. CSV: Availability and Availability
  note after Status, the note written as text (30502).
- No new colour: red stays under par, and the word carries the meaning
  (CH-3809).
- Players see none of it in v1 (`loadPlayerRoster` still reads `player_id`).
- Print (`roster.css`): the desk view printed from a desktop shows (the phone
  breakpoint hid it), fits the sheet without the actions column or avatars,
  takes an ink head rule with "GolfHelm", and keeps a face or row whole. A
  portrait letter sheet is under 820px, so the browser re-renders the phone
  layout and that sheet prints as before; landscape prints the desk table.
- Preview: `/clubhouse-preview/roster?state=availability` (Ava injured, Luca
  away).

### Why

- Coach parity: coaches needed to mark who is hurt or travelling without
  taking away their team access.

### Verification

- `roster.test.tsx` (new describe "availability", 10 tests, and 2 phone
  tests), `roster-context-menu.test.tsx` (right-click equals kebab for an
  injured player), `set-player-availability.test.ts` (8, the action's checks).
- Screenshots (Chromium, preview fixtures, 1280 and 390): see VERIFY.md
  Screenshots. No before shots: the surfaces are new. Not checked in WebKit,
  on a phone or with VoiceOver.

## 2026-10-21 — The spread dots start in place

```text
Design package: none (motion decision Q-153, three votes, 3 to 0)
PR/commit:      claude/clubhouse-no-first-paint-draw-ins
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

The coins on Where the team sits no longer glide out from the team line when
the chart scrolls into view. They sit at their score at first paint
(`RosterSpread.tsx`; Q-153). A coin still glides if the data moves it. Motion
report 2026-10-20-roster.md box 3.

## 2026-10-20 — The bell's join-request link lands on the requests on desktop

```text
Design package: none (2026-10-17 audit, STATUS.md page readiness:
                "roster?tab=requests from the join-request notification is
                ignored")
PR/commit:      claude/clubhouse-edgecases
Contract IDs:   30102 (DEEP_LINK_OPENS_PROFILE) text
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Desktop: `?tab=requests` (the bell's join-request notice,
  `createTeamJoinRequest`) takes focus to the join requests card under the
  header, scrolling it into view if needed, and the param is dropped so a reload
  or Back shows the roster as it is (`Roster.tsx`; the card takes a ref and
  `tabIndex={-1}` in `RosterRequests.tsx`). With no request waiting there is no
  card and nothing moves. The card is a reading destination: no focus ring is
  drawn for it (`roster.css`), as for headings.
- The phone already opened the requests sheet (#2201); the desktop handler reads
  the media query, not the first render's guess, so it never spends a phone's
  param. A stale phone-layout hint mounts the phone copy first (which spends
  the param in its own effect) and corrects a render later, so the desktop
  screen reads the param while rendering and focuses the card once the layout
  is desktop and the card is mounted (review of #2220).

### Why

- The 2026-10-17 audit listed the link as ignored. The phone was fixed on #2201;
  desktop still left `?tab=requests` in the address and did nothing with it.

### Verification

- `src/clubhouse/screens/roster/__tests__/roster-requests-link.test.tsx` (new,
  4; 3 failed before the change): focus on the card and the param dropped,
  another param kept, no card and no focus with no request waiting, nothing
  without the param. `wiring-p003-roster.test.tsx` (the phone sheet) and
  `roster-context-menu.test.tsx` pass.
- No before or after screenshots: nothing is drawn differently (focus moves, and
  no ring is drawn). Not checked in a browser or with VoiceOver.

## 2026-10-19 — Where the team sits glides again

```text
Design package: none (CI: clubhouse:css no-layout-motion)
PR/commit:      #2210
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The spread's coins and team line move by `translate` again (the W4c
  pass had moved them by `left`, which lays out every frame). The iPad
  sideways scroll that change fixed is fixed instead by the panel
  clipping sideways overflow (`.ch-rs-sp`, `overflow-x: clip`).

## 2026-10-19 — Roster on an iPad: the team spread follows a window that shrinks

```text
Design package: none (complete-and-elevate plan, lane W4c)
PR/commit:      see git log (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The coins and the team line on "Where the team sits" are placed with `left` in percent of their row instead of `translate` in container units. At rest the page is the same (a sub-pixel difference at most). WebKit kept the old width in the canvas's scrollable overflow when the window shrank, so an iPad turned from landscape to portrait scrolled the whole page sideways until a reload.
- Tablet tier (821 to 1180px, end block of `roster.css`): on a plot under 561px the coins are a sixth smaller so neighbours in the same lane no longer overlap.

### Why

- A plot of 494px (portrait, sidebar open) puts 6.5% of the axis at 32px, under the 38px coin. The lane rule is in RosterSpread.tsx and is reported, not changed.

### Verification

- WebKit, touch: 1180 then 834 (open and folded) now reads scrollWidth = clientWidth (it read 807 over 618 before); the spread at 1280 differs from before by under 6% on 103 pixels of anti-aliasing; 834 before and after looked at.

## 2026-10-19 — Type, shape and touch in the page stylesheet

```text
Design package: none (complete-and-elevate plan, lane W4b: type, shape and touch in the page stylesheets)
PR/commit:      lane W4b commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (roster.css)

- Radii on the 5, 7, 10, 14, 20 scale; the request count and span figures use tabular numerals. The avatar monograms keep their fixed size.

### Why

- Pixel font sizes did not follow Dynamic Type, radii were off the 5/7/10/14/20 scale, some phone controls were under 44px, some clickable things did not answer a pointer, and the font shorthand had dropped tabular figures from figures that sit in columns.

### Verification

- WebKit (headless) at 390 and 1280, light and dark: Rounds, a round, sign-up, sign-in, Home, a CoachHelm thread and Team Hub looked at after the change; the phone with `--ch-type-scale: 1.4` scales text with no sideways overflow (scrollWidth equals clientWidth). Touch reach was measured with `elementFromPoint` 21px beyond each short control; hover was measured by comparing computed styles under the pointer; figures were measured by computed `font-variant-numeric`. `npm run clubhouse:css`: its two findings are existing shadows in `auth.css` (lines 1809 and 1872).

## 2026-10-19 — In-flight saves are busy; icon buttons have tooltips; the list fades its clipped edge

```text
Design package: none (complete-and-elevate plan, lane W4a: controls behave one way everywhere)
PR/commit:      lane W4a commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Mark inactive or active, Remove player and Approve all keep their colour and show the ring over the label while they run (`Button` busy), instead of fading to disabled. Their neighbour (Cancel, a row's Decline) stays disabled.
- The layout toggle and each row's actions button show their name on hover and keyboard focus (the same words as the accessible name).
- The roster and team tables fade only the clipped edge when they scroll sideways.

### Why

- The same control behaved differently from page to page: a save greyed its button out at 42%, five places drew their own spinner, icon-only buttons had no words on desktop and a scroller gave no sign there was more. They now come from the shared owners (`Button` busy, `Spinner`, `Tooltip`, `use-hscroll`).

### Verification

- Targeted tests for this page and `ui/__tests__/controls-consistency.test.tsx`; the busy ring was captured at 390 and 1280, light and dark, on `/clubhouse-preview/classes` (the same Button owner draws it here); tooltips and edge fades on the messages, roster and CoachHelm previews. Pages other than the one captured were checked in source only.

## 2026-10-19 — Roster prints one clean sheet

```text
Design package: none (complete-and-elevate plan, lane L6b: the coach's desk prints)
PR/commit:      see git log (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Print (print rules only, `roster.css`): the roster prints as one sheet of the list in ink on white whatever the theme, with "GolfHelm" at the right of the head under the team and the count. The sort, the join-request banner, the invite action and the portraits stay off the paper, the ledger rules are kept (`print-color-adjust: exact`) and a row never splits across pages. A letter sheet is narrower than the phone breakpoint, so the page prints in its phone layout; the rows are buttons and the app-wide print sheet hides buttons, so the rows are put back in print. The desktop layout's rows, head and chrome are set the same way for when print keeps the screen layout.

## 2026-10-19 — Empty roster draws the shape of the list; a search with no match says what it searched

```text
Design package: none (complete-and-elevate plan, lane L3: empty, first-run and failure states)
PR/commit:      lane L3 commits on agent/clubhouse-complete
Contract IDs:   CH-3301, CH-3302, CH-3303, CH-3306, CH-3307, CH-3308
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- No players yet: the sentence takes the first row's place and a portrait ring and a ruled row are drawn under it. The copy says who fills it (players, with the team code or invite link). The same for a player's roster (CH-3307) and the no-team pages.
- No match for a search, or an Active or Inactive filter that hides everyone, is the filtered state: it names what it searched ("Search matches player names", "Only inactive players are in view") with Show everyone as the one way out. It no longer sits in a card.
- A long name in a roster card wraps to two lines and ends in an ellipsis instead of widening the card.
- `.ch-rs-empty` is gone.

### Why

- Every empty page was one template: a green tile, a headline, a sentence and a button in blank space. The waiting form draws the shape of what will fill the space (rules, rings, a baseline; no bars, no fake text) under one sentence that names what fills it and who does it, and a filter that hides everything is told apart from a first run, a lock and a failed read.

### Verification

- `states.test.tsx` (the waiting form, its four kinds, the danger tone unchanged) and this page's tests; captured at 390 and 1280, light and dark, before and after, on `/clubhouse-preview/roster?state=empty` and `roster-player?state=empty`. The search no-match state was captured after only (desktop, a typed miss, light and dark), and the two-line name clamp was checked on the populated roster with a long name injected in the browser (desktop; phone has no card view).

## 2026-10-19 — Right-click menu on a player; the roster feeds the command palette

```text
Design package: none (complete-and-elevate plan, lane L1, desktop command layer)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none (no new read: the palette lists what the page already loaded)
Held items:     none
```

### Changed

- Right-click (or Shift F10) on a player's card or table row opens the same menu as the row's Actions button: View insights,
  View stats, Message, Mark inactive or active, Remove from team, with the same handlers and confirmations. Desktop only.
- The loaded players are handed to the command palette, so Cmd K finds a player by name and opens their stats.

### Why

- The kebab is only on the table; the card view had no way to the same actions.

### Verification

- `screens/roster/__tests__/roster-context-menu.test.tsx`; captured on `/clubhouse-preview/roster`, light and dark.

## 2026-10-18 — Wave 10: the empty team and one name for the code

```text
Design package: none (wave-10 first-run review, rows 5, 15, 19; A, B, C)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-3309 (new), CH-3006, CH-3207, CH-3301, CH-3304, CH-3307
Actions:        none
Data impact:    none
Held items:     whether code and link joins should need approval (owner)
```

### Changed (2026-10-18, wave-10 first run)

- One name for each thing: "team code" (what the player types) and
  "invite link". The invite sheet, the toasts (CH-3006), CH-3207 and CH-3304
  no longer say "join code".
- The coach copy says what the app does (decision A, copy only). Sign-up with
  the team code and the invite link join at once (`golf_join_team_with_code`
  inserts an active member), so CH-3301 reads "Players who sign up with your
  team code or open your invite link join right away. You can remove anyone
  here." The invite sheet says only players already on GolfHelm who enter the
  code in Settings send a request; the link's help says opening it joins.
- Invite sheet: the link field drops the scheme and clips from its start, so
  the code at the end stays in view; Copy and Share still send the full URL.
- An empty roster's head shows the team and season only: no "0 players ·
  0 active." (desktop) or "· 0 active" (phone kicker). The player's view drops
  "0 players" the same way (decision B).
- Phone: the top bar's invite icon is hidden while nobody is on the roster
  and the empty state carries Invite players; it stays when the read failed
  (decision C).
- Player view: CH-3307 says teammates join with the team code. A roster of
  one, the player alone on a new team (CH-3309), shows their row and "You’re
  the first one here. Teammates show up as they join." with no search, layout
  or sort control.

## 2026-10-18 — Wave 8: premium details

```text
Design package: none (wave-7 premium review, items 10, 16)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-7 premium)

- Phone rows: the class year stays plain and only the note takes its tone
  ("Sophomore" in ink, "Scoring up 2.1" in amber), `RosterPhone.tsx`.
- Phone rows: the ringed coin is inset by its 3px ring, so the ring meets the
  column's 20px edge (`roster.css`); the skeleton's coin is inset the same.

## 2026-10-18 — Wave 7: player Roster coaches

```text
Design package: none (wave-7 player journey review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    reads only (team coaching staff)
Held items:     none
```

### Changed (2026-10-18, player Roster)

- Decision D: a player's Roster opens with the team's coaches (name and
  role, head coach first) as plain text, above the players (CH-3808). A
  failed staff read leaves the group out and is logged (`playerCoaches`).
- Handicaps go through one rule everywhere (`displayHandicap`: the index
  when set, else the handicap).

## 2026-10-18 — Wave 5: pending labels and the remove question

```text
Design package: none (wave-5 feedback review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, roster)

- "Removing…" (CH-3402), "Approving…" (CH-3403) and "Saving…"
  (CH-3404) while those writes run.
- Remove player? (CH-3501): the safe choice reads "Keep Theo" (the
  player's first name), not "Cancel".

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

- Phone text in `roster.css` (list, join requests, invite code, the player
  sheet, the teammate list) moves from fixed px to
  `calc(N * var(--ch-type-k))`. Each row's figure, the sheet's figures and
  rounds, the request count and the banner's count pill stay fixed.

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): every Roster preview state is
  pixel-identical to before at the default size. At XXL this sheet's change
  takes unscaled text from 43 to 21 on `roster` and 37 to 19 on
  `roster-player` (row figures, and shared avatars and segments); rows wrap
  their meta lines, no overflow.

## 2026-10-18 — Wave 3: the shared gutter

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
  title holds still between tabs. The tight head keeps its tight top; its title
  is at y 133.5. The no-team page takes the same frame.

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

## 2026-10-18 — Polish: no white band on dark roster tiles

```text
Design package: none (wave-2 interaction review rows 2)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, interaction review)

- Desktop roster tiles start their gradient and lit top edge from
  `--ch-ivory-0` and `--ch-light-rim`, so the dark theme loses the white band.

### Verification (2026-10-18, interaction review)

- WebKit (Playwright) checks: focused vs blurred and hovered vs resting
  computed styles and crops, `scratchpad/w2-interact/`.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on the five
  existing `shell.css` findings (lines 3742-3821), none in this change.

## 2026-10-18 — Polish: the skeleton draws the actions and the spread

```text
Design package: none (wave-2 states review row 4)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, loading)

- Desktop skeleton (CH-3401): the head draws Export and Invite players at
  their loaded widths, and Where the team sits is drawn in its own frame (the
  heading's two lines and a one-lane plot) before the toolbar
  (`RosterSkeleton.tsx`).
- Join requests and Needs a look are drawn only when there are some, so the
  skeleton leaves them out; with the preview's two requests and three
  players to look at, the toolbar still lands 282px lower when they come.

### Verification (2026-10-18, loading)

- WebKit (Playwright, dev server, preview fixtures) at 1280: the head and its
  actions match (108 and 190); the toolbar 536 vs 818 (was 298 vs 818), the
  whole remainder being the requests and Needs a look.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint.

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

- No team (CH-3306, CH-3308): the page empty offers "Open team settings"; a
  coach goes to Team, a player to Golf profile (CH-8302).
- The roster, team and pending-request notices (desktop and phone) end "Try
  again; the error has been reported.", the majority sentence.

### Verification (2026-10-18, states review)

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on five
  `shell.css` findings from commit 3730926bb, none in this change.

## 2026-10-17 — Polish: steady figure column, one primary

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (Clubhouse polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone rows: each row's figure and its caption draw tabular figures again
  (the `font` shorthand had reset `.ch-num`), and the caption holds a "10.2
  hcp" width, so the sparkline column no longer drifts row to row
  (`roster.css`).
- Desktop join requests: each row's Approve is secondary, as on the phone (P003
  #5), so Invite players stays the screen's one primary
  (`RosterRequests.tsx`).
- Tabular figures come back on 18 rules in `roster.css` whose `font` shorthand
  reset `.ch-num` (counts, times, scores and facts in rows); display
  numerals keep their proportional figures.

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` reports five findings,
  all in `shell.css`, which this change does not touch. The WebKit pass is
  the coordinator's.

## 2026-10-17 — Wiring checked against production

Every Roster control and read was checked end to end against Fairway's roster
and the server actions (`removePlayerFromTeam`, `updatePlayerStatus`,
`acceptJoinRequest`, `rejectJoinRequest`, `setIntent`, `getTeamJoinRequests`):
arguments, role and team guards (all resolve the coach's cookie-aware active
team, as `resolveClubhouseTeam` does), revalidation, and every link target for
the role that sees it. Four differences fixed:

- **The screen follows the resolved role** (`routes/roster.tsx`). The route
  took the coach branch whenever a coach row existed, so a user whose player
  profile is the onboarded one (the dashboard draws them as a player) got the
  coach's "You aren’t on a team yet" instead of their team's roster. It now
  branches on the team `resolveClubhouseTeam` returns, and the no-team page
  speaks to the dashboard role. No production user is in that state today
  (read-only count, 2026-10-17).
- **The bell's join-request link opens the requests** (`RosterPhone.tsx`).
  `createTeamJoinRequest` writes `/golf/dashboard/roster?tab=requests`; the
  phone now opens the requests sheet once when a request is waiting and drops
  the param (desktop already shows the card at the top). Fairway ignores the
  param.
- **Open focus areas count `in_progress` too** (`data/roster.ts`), as Fairway's
  roster does; the column has no CHECK on status. No production row is
  `in_progress` today, so nothing on screen changes yet.

- **Home's first-run Invite players opens the invite sheet** (`Roster.tsx`).
  Roster reads `?invite=1` once, on desktop and the phone, opens the invite
  sheet and drops the param; closing the sheet spends it (a module flag holds
  it across the remount that dropping the param can cause, as `?player=` does).
  A player's roster and the no-team page are other screens and ignore it.

Checked and unchanged: approve, decline and Approve all pass the request id
only (Fairway's shape; no decline reason, which Fairway does not send either);
remove and Mark active/inactive pass the player id; the note sends trimmed
text or null to `setIntent` (Fairway's trimming); the server's refusals reach
the toast through `friendlyReason`; the writes' `revalidatePath` brings the new
player in (Fairway calls `router.refresh()` for the same effect). Links:
View insights (`coachhelm?player=`), View stats and the face (`stats?player=`),
Message (`messages?player=`), Plan (`calendar?new=1&with=`), All rounds
(`stats?player=&window=season&tab=rounds`), Open team settings
(`settings?section=team`) and the invite link (`/golf/join/<code>`) all
resolve for a coach and carry params the target reads. No realtime: Fairway
has none on the roster either.

### Verification

- `npx vitest run src/clubhouse/__tests__/wiring-p003-roster.test.tsx` and the
  existing Roster tests (see the report for exit codes).

## 2026-10-17 — A link to a player opens their profile on the phone every time

Found by the first dark-mode accessibility scan (2026-10-17). On the phone a
`?player=` link opens that player's profile once and drops the param, but
dropping it changes the address under the route, and a remount then found no
param and showed the list: the profile never opened (reproduced in Chromium
after earlier tabs had warmed the dev server; the trace showed the param
stripped and no push of the profile). The linked player is now held until the
profile is on screen, so a remount still opens it. Reproduced and fixed with
the same tab sequence the scan uses; Roster tests pass (103) and the dark scan
of every Roster state passes (15).

## 2026-10-16 — Sort, filter and layout use the shared green chip

The Roster's chosen sort, filter and grid or list toggle take the lit green chip
every switcher draws (`roster.css`); the page's own green rules are removed.
Shared detail: docs/clubhouse/CHANGELOG.md.

## 2026-10-16 — Roster's figures are text until a hand is on the sort (phone)

Replaces the earlier entry that made them text for the first frame only: a frame
after the paint the numerals still mounted inside the switch. The figures in
`RosterPhoneList` are now the same text Number Flow draws until pointerdown or
focus lands on the sort, the only control that rolls them (`RosterPhone`);
pointerdown comes before the click, so the first sort still rolls. The text and
Number Flow match to the pixel, so nothing moves when they swap.
`useArrivalPainted` is no longer used here.

## 2026-10-16 — A switch to Roster on the phone draws its figures as text first

Each row's figure is a Number Flow numeral (it rolls when the coach picks a
sort), and mounting a list of them was about 20ms of a switch to Roster's long
frame (WebKit, production build, phone: 57–67ms with them, 37–52ms without). The
figures are now plain text for the page's first frame and become Number Flow
once it is painted (`useArrivalPainted`); a hard load hydrates with Number Flow
as before. The text is laid out as Number Flow lays out the same figure, and the
two captures match to the pixel, so nothing moves when they swap. A sort still
rolls. Worst frame of a switch to Roster: 56–67ms before, 44–53ms after.

## 2026-10-15 — Ink that holds at night

Dark mode: the Active filter, the sort switch's selected segment, the request
heads, codes and the selected face's name; the team-average chip keeps dark ink
on its gold in both themes now take `--ch-on-fill-*` / `--ch-forest-*` ink,
which match the day's palette in light and stay light at night (they went dark
on dark). Light is unchanged. Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-12 — A section root on the phone (no "‹ More")

The phone shell's section strip replaced the tab bar and the More sheet
(docs/clubhouse/phone/section-strip.md). Roster's phone top bar no longer
draws a "‹ More" back link: its title is a start title (`PhoneTop start`),
which the shell turns into the section switcher. The page's action, where it
has one, is unchanged. Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-12 — Mark a player inactive or active

```text
Design package: none (the remove confirm's Modal and menu; no owner board)
PR/commit: agent/clubhouse-release-features
Contract IDs: 31102, 30202, 30619 (CH-3502, CH-3404, CH-3008)
Actions: ACT-P003-CHANGE-STATUS
Data impact: none (existing updatePlayerStatus on golf_team_members.status)
Held items: none
```

### Changed

- The coach's row menu and the phone profile's ⋯ sheet offer "Mark inactive"
  (or "Mark active" for an inactive player) above Remove from team. It asks
  first (`StatusConfirm`), not as a destructive action, and saves through
  `useAction('roster.changeStatus')` → `updatePlayerStatus`; the player moves
  to that filter, and the open phone profile reads the new status.
- `updatePlayerStatus` resolves the coach's active team with the same
  resolver and active-team cookie as the Clubhouse roster route.

### Why

- Owner decision: rebuild the dropped Fairway "Change status"
  (`FairwayPlayerActionsMenu`).

### Verification (2026-10-12)

- roster.test (CH-3502, CH-3404, CH-3008, CH-1903, the phone ⋯ sheet). Not
  observed in a browser or on a device; no screenshots.

## 2026-10-10 — Where the team sits

Presentation only. A new block between "Needs a look" and the toolbar (desktop):
every ranked player is a coin on one scoring axis
(lower is better) under a gold team-average line, with their average and first
name; coins that would touch take another lane, and
the first time it is seen they glide from the team line to their place. It is
drawn from the roster's own standings (a player under
the early floor is not on it) and is a pointer shortcut to the faces below,
which stay the keyboard and screen-reader route. The
team average is now memoised on the active players.

## 2026-10-08 — a player opens their profile; raised player tiles; green chosen chips

Owner review (not yet signed off):

- **Click goes to the profile:** on desktop a click on a player's face (cards)
  or
  name (list) goes to that player's profile,
  `/golf/dashboard/stats?player=<id>`,
  through `openProfile` in `Roster.tsx` (`router.push`, with the select haptic).
  Where that page isn't rebuilt it opens the peek, as before. The peek
  (`RosterPeek`) now opens only from a Needs a look chip. The face and name
  buttons are named "... Open profile" and no longer carry `aria-expanded`. The
  phone is unchanged.
- **Depth and contrast:** on desktop each player is a raised tile
  (`roster.css`, `.ch-rs[data-canopy] .ch-rs-face`): 16px between tiles, a 22px
  radius, a lit white-to-ivory gradient, a gold 1px ring, a gold inset frame 7px
  inside the edge (`::before`), layered shadows, and a hover lift of 8px with a
  stronger gold ring. The open player is green-50 with a 2px green ring and a
  stronger gold frame. Names are ink-950 and the meta line secondary ink.
- **Green chips:** the chosen sort (Avg score, Handicap, Rounds, Name), the
  Active, Inactive and All pills, and the grid and list toggle are green with
  ivory ink (`.ch-rs .ch-seg__pill`, `.ch-pill[aria-pressed]`,
  `.ch-rs-vt__b[aria-pressed]`).
- **Tests:** `roster.test.tsx` treats the stats profile as not rebuilt except in
  the phone block, so the peek tests keep driving the panel; a new case forces
  the
  face and name clicks to `router.push` and the chip to open the peek.

## 2026-10-08 — The phone sort runs on TanStack Table; rows slide and figures roll on a new sort

Adopting the installed kits (`@tanstack/react-table` 9, `@number-flow/react`
0.6). Phone only; the desktop roster is
unchanged. Not yet reviewed by the owner.

- **Sorting model:** the phone list's Avg / SG / Name order comes from TanStack
  Table's sorting model, headless
  (`useRosterSort`, `screens/roster/sort.ts`), with the same rules written out
  as the columns' sort functions: Avg
  lowest first, SG highest first, Name by last name (D-59), a missing figure
  last, ties in the loader's order. The rows
  keep their markup and look.
- **Reorder (CH-3604):** choosing a sort slides each moved row to its new place
  on the smooth spring inside React's
  `<ViewTransition>` (class `ch-rsm-reorder`, the pattern the qualifier board
  uses for P009-B1). Only a chosen sort
  moves rows or rolls figures; a refresh takes its new figures at once and
  leaves the rows where they are. Reduced
  motion and Animations off reorder at once.
- **Rolling figure:** each row's trailing figure is one Number Flow numeral that
  stays across sorts, so Avg to SG
  rolls 74.1 to −0.9 instead of swapping it (base duration on the v2 ease-out,
  `CH_DUR`). The sign is drawn as text in
  front of the digits (`figureParts`), so a loss reads with a true minus and a
  figure that rounds to zero is an
  unsigned 0.0; no data stays a dash and does not roll. Nothing counts up on
  first paint. Its spoken value equals the
  figure as written, and the row's own label is unchanged.
- **Haptic:** the selection tick on a sort change is still the segmented
  control's one tick (CH-3701), not doubled.
- Tests: `src/clubhouse/__tests__/roster-sort.test.tsx`.

## 2026-10-08 — Join requests as a row, the sheet without wells

Owner direction (2026-10-08): the card is no longer the default unit of layout
on the phone. Phone only (the phone
roster is its own component); the desktop roster is unchanged.

- **Join requests** is one flat row at the top of the list instead of a green
  feature card: the count in a green badge
  in the avatars' column, "Join requests" lined up with the players' names, the
  names under it, a chevron. It sits
  between hairlines on the gutter and tints under the finger like a player row
  (CH-3602). Its accessible name reads
  "2 join requests, Grace Liu and Owen Park".
- **The requests sheet:** each request's handicap is a figure at the end of its
  row, not a well, and the team code is
  a plain row between hairlines with Copy at its end.

## 2026-10-08 — The phone list shows the figure it is sorted by

From the native-feel audit (P1-3). Not yet reviewed by the owner.

- **Sorted by SG**, each phone row's trailing column shows strokes gained per
  round (`+0.8`, `−1.2`, `—` when there is none) over "SG / rd", with gains in
  green and losses in amber. The row's VoiceOver label reads the same figure.
  Sorted by Avg or Name, the column keeps the average and handicap; under Name,
  the name already leads the row (`RosterPhoneRow`'s `sort` prop).

## 2026-10-08 — Premium pass: ranks, one material, the lit ledger, the peek

Approved by the owner on 2026-10-08 (P003-A1, A3, C1; findings #1 to #17).

- **Ranks from the active roster (#2, #3).** A card's place ("4th of 7") and the
  team strip rank the active players with an average and at least three rounds
  (`rosterStandings`), never the rows a search or filter left: searching "Jo"
  keeps Jonah's place, and All doesn't rank inactive players. Under three rounds
  the card says "Needs 1 more" instead of a place.
- **One material (#1).** The player's Roster and the no-team page take the
  coach's canopy (`data-canopy`, `data-canopy-head`); the no-team page has a
  hidden h1.
- **Less chrome (A3).** The seven-coin initials stack above the title is gone on
  desktop, and the phone loses the double rule above the kicker, which is no
  longer tracked (#9). The status dot shows only under All, where it tells
  players apart (owner); under Active or Inactive every dot was the same.
- **The ledger in the light (A1).** The faces' hairlines carry a 1px rim of the
  shell's light on their sun-facing side, and the open player's ring catches a
  gilt crescent on the lit side. The peek's leading hairline takes the rim too.
  Nothing on a figure is lit, and dark, Increase Contrast and noon draw no rim.
- **The player peek (C1).** A hold on a phone row, or a rest on a desktop
  Needs-a-look chip, shows the shell's `PlayerPeek` from what the roster holds
  (`rosterPeek`: the newest round, the average, the form, the warning).
- **Findings.** The desktop panel sticks under the top bar and scrolls inside
  itself (#4); the phone requests sheet has one primary, Approve all (#5);
  without season stats the sort falls back to Name and offers no Avg or SG (#7);
  a failed team read says "your team" mid-sentence (#8); a chip only opens its
  player (#11); "a round" hides when SG is missing (#12); cards and names are
  `aria-expanded` with a short label (#13); the phone profile has one secondary
  style (#15).

## 2026-10-08 — Copy: typographic apostrophes

Roster writes its apostrophes as ’ on desktop and the phone, as Home, Stats and
Calendar do: the no-team page (CH-3306 for a coach, CH-3308 for a player), the
failed reads (CH-3201 to CH-3203, CH-3207, CH-3210), and the failures of a
removal, an approval or decline, a note, the export and a copy (CH-3001 to
CH-3007), so an offline refusal reads "Couldn’t approve Grace Liu: you’re
offline" (CH-1903) with one kind of mark. The catalog quotes them as shown, and
copy-apostrophes.test now covers the page.

## 2026-10-08 — States: one notice when two reads fail; titles without a full stop

From the states audit (2026-10-08, findings c15 and b8), desktop and phone:

- **Two failed reads, one notice (CH-1209):** when the roster and join
  requests (or the season stats) both fail, the page says so once under its
  head, "Some of this page didn't load", with one Try again that asks the
  server again (`PageRefreshNotice`). Each failed part keeps its title alone
  in its place, marking the gap, with no second alert or button. One failed
  read keeps its own notice, as before.
- **Titles:** the desktop head reads "Your players", and the state titles
  ("The roster didn't load", "Join requests didn't load", "Season stats didn't
  load", the join code's) have no trailing full stop in the source either.
- **Phone eyebrow:** the team and count are 12px, the phone text floor (F09)
  and the kit's PageIntro eyebrow; the skeleton holds the new line (WebKit 390
  and 430: no movement). The title was already the 600 sans at 31px.

## 2026-10-08 — Phone: the Mobile clubhouse pass

The phone Roster follows the Coach Home board (round 3, "fewer containers, one
feature card"), carried to every phone screen (owner: "phone too cardy"):

- **Head:** the page opens on the engraved double rule, the team and count as
  the tracked eyebrow and Roster in the bold condensed sans (no serif).
- **Join requests** are the screen's one green feature card: a gilt coin, the
  count and the names in ivory. A press darkens it under a shade for the press
  beat; it never scales (CH-3602).
- **Players:** no white card. The list hangs from a hairline under the sort,
  one row per seam, and a press tints the row 12px past its text (CH-3602).
  Inactive opens under the double rule with its heading. Avatars sit on the
  parchment with a champagne ring.
- **Profile (pushed):** the player at the top, the three figures between two
  hairlines (the Ledger's figure row), then Scoring trend, Recent rounds,
  About and the coach's note, each flush under the double rule. About's facts
  are rows on seams, not a box. The All link keeps its 44px reach over the
  first round.
- **Sheets:** each join request is a row on a seam inside the sheet, not a card
  inside a card. The ⋯ sheet's actions are rows on seams that tint under the
  finger. The team code keeps its well.
- **States:** the empty and no-team pages stay centred on the parchment; the
  failed reads are notices flush under the head. Loading draws the phone page
  on its own classes (the double rule, the eyebrow, the title, the sort and
  the rows), so nothing moves when it lands (WebKit 390 and 430). Join
  requests are the exception: the skeleton can't know of them, so when some
  are waiting their card arrives above the list and moves it down by the
  card's height (99px); most days there are none.
- The player's phone roster takes the same head and rows.

Desktop is unchanged: every new rule sits in the phone block, and the
skeleton's phone parts are hidden there (1440 captures before and after
match).

## 2026-10-07 — Team view and List view settle in

Toggling Team view and List view now settles the new layout in with a 6px rise
(base) while the old one fades out (quick), hidden from assistive tech (CH-3603,
the shared `Swap`). It runs only on the coach's own toggle: the kept layout
coming back as the page opens draws in place. A face or a list row's name
presses with the row press tint (`--ch-ledger-row-press`) over the press beat,
never a scale (CH-3602). New test: roster.test › CH-3603.

## 2026-10-07 — Roster on the Ledger

On desktop, Roster now sits on the canvas instead of in cards (owner: "flush,
not so card heavy"):

- **Join requests:** the request count is the section heading, set over an
  engraved rule, with each request as a row below it and hairlines between rows.
- **Players:** the toolbar heads the players with an engraved rule. The faces
  hang from that rule on a ruled page: hairlines between cells, and no card,
  lift or shadow. A hover or press now tints the cell instead of lifting a card
  (CH-3602). The open player's cell takes a green tint and its coin a green
  ring. The figures sit in the cell, not in a well.
- **Table:** the header well is now a quiet label row. Rows have seams and sit
  on the canvas.
- **Player panel:** a column beside the players behind a hairline, or under them
  behind a rule once they stack. Its sections sit under rules, without the
  tinted band or the facts box.
- **Head:** the old champagne border that doubled the page head's rule is gone.
  With nobody active, the empty avatar row no longer indents the team line.

The loading screen draws the same ruled faces and holds the head at 186px
(WebKit, 1440 and 1100), so the head doesn't move when the page lands. Avatars,
chips, controls and the note field keep their material. The phone and the
player's roster are unchanged.

With a player open beside the list view's table, the table drops its form
column (the panel draws that player's form), so Rounds and the row menu fit
without a sideways scroll. The column returns once the panel stacks under the
table.

## 2026-10-07 — The header's team row restored

The card team strip from earlier tonight reused the class `.ch-rs-team`, which
already names the header's avatar row ("Varsity · Fall 2026"). The strip's 10px
height and tint landed on the header: the avatars overlapped the team name over
a grey bar, for coach and player. The strip is now `.ch-rs-strip`, and the
header is back to its own row. No other class added tonight exists on `main`;
`ch-rd-season` is reused on purpose within its own component.

## 2026-10-07 — Phone title in the serif

The phone Roster title was a 28px semibold sans. It now uses the display serif
at 34px, matching every other phone page title.

## 2026-10-07 — Drawn card figures, serif title

The coach's player cards no longer end in a pill of three bare numbers (owner:
no bare numbers). The figures are drawn:

- **Scoring:** the season average with the player's place (for example "1st of
  7") and a strip showing every teammate's average, with this player's dot lit
  in the field green.
- **Strokes gained:** the figure per round with a bar running from a zero tick,
  green for gained and amber for lost.
- **Handicap:** reads as a labelled line.

The card is a solid reading sheet, and "Your players." is set in the display
serif. The player's own roster keeps handicap only, as before.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

<!-- clubhouse:release-audit:start -->

## 2026-10-06 — Smoothness repair

RosterPeek uses zero-duration transitions when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 14 mapped
actions and 8 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p003-roster). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

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

## 2026-10-02 — Keep the player when opening desktop Messages

```text
Design package: existing P003/P007 player-to-message flow
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none added
Actions:        existing Message link in the desktop player panel and row menu
Data impact:    none; existing Messages ?player= resolution
Held items:     real-account thread resolution, delivery and physical Safari
```

Desktop Message links now include the selected player's encoded ID instead of
opening the general inbox. This aligns the player panel and list-row menu with
the phone profile and P007's existing deep-link contract. Different selected
players and keyboard activation are covered by two focused regressions;
the complete scoped Roster suite passed 68/68. See VERIFY.md for the local
WebKit observation and its limits.

## 2026-10-02 — Intuitive improvement: consistent profile context

```text
Design package: owner's mobile boards; Intuitive Software Design IMPROVE mode
PR/commit:      codex/clubhouse-design-fidelity (working tree after cca081c)
Contract IDs:   none changed
Actions:        existing event reply, acknowledgment and task state; none added
Data impact:    no endpoint or schema changes; local fixtures and mocked writes for verification
Held items:     intended-user validation, physical Safari and real-account read-back
```

Profile gutters, section gaps and figure lighting now match the parent roster at
phone widths. The existing player name, Roster back action, scoring evidence and
Message/Plan 1:1 actions remain intact. WebKit exercised the fixture
row-to-profile path; delivery, meeting creation and private-note persistence
were not exercised.

Evidence and practical limits: `VERIFY.md` and the scoped intuitive
secondary-screen report.

## 2026-10-02 — Roster: room for complete player status

```text
Design package: design/handoff/ (owner's mobile boards and depth.css)
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none changed
Actions:        none changed
Data impact:    none
Held items:     physical iPhone Safari and signed-in production data verification
```

The phone roster now uses the shared sheet gradient and layered lighting. Rows
have a 72px minimum with room for wrapping status text; long attention notes
remain visible instead of ending in an ellipsis. Content and skeleton gutters
use the same 16px rhythm.

Verification: WebKit iPhone 13 populated layouts at 375, 390 and 430, plus
empty/failed states at 390. Before/after screenshots and practical limits are
recorded in VERIFY.md.

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — The saved-view effect lists its setter (CI lint ratchet)

```text
PR/commit:      agent/swap-audit (PR #2111 CI fix)
Design package: none
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

- **Issue.** CI's lint ratchet failed by one `react-hooks/exhaustive-deps`
  warning: the effect in `Roster.tsx` that restores the faces/list view from
  local storage called `setView` but had an empty dependency list.
- **Fix.** `[setView]`. `setView` is the `useState` setter that
  `useChSessionState` returns, and React keeps a setter's identity stable, so
  the effect still runs once on mount. Nothing a coach sees changes, so there's
  no screenshot.
- **Checked.** eslint on the file is clean; the warning total is back to the
  baseline of 59.

## 2026-10-01 — The player's Roster, read-only (owner, Q-130)

```text
PR/commit:      agent/swap-audit: 0672d5738
Design package: design/handoff/ (v2): Coach - Roster.html and Coach - Roster - Mobile.html, as the owner asked
                ("the same thing as coach except they can't click"); no player board exists
Contract IDs:   30804, 30805, 30806, 30617, 30618, 30407, 30408, 31807 (catalog CH-3210, CH-3211, CH-3307, CH-3308,
                CH-3807); 30801's meaning updated
Actions:        ACT-P003-PLAYER-VIEW, ACT-P003-PLAYER-TRY-AGAIN
Data impact:    none (two RLS-scoped reads, golf_teams and the team's active golf_team_members with golf_players, on
                tables a player already reads; no schema change)
Held items:     none
```

- **Issue.** With Clubhouse on, a player on `/roster` got the not-rebuilt
  notice.
- **Fix.** A player gets the coach's layout as plain text (`TeamRoster`,
  `TeamRosterPhone`): name, class year and handicap of the active members, no
  scores, notes, requests, invite, export or player panel, and no card or row is
  a link
  or a button (CH-3807). A separate loader (`data/roster-player.ts`) reads only
  the team's name and season and the active members. `/roster/[id]` goes to the
  list
  for a player. Roster is a sidebar entry under Team for a player and a row in
  the
  phone More sheet. Catalog CH-3210, CH-3211, CH-3307, CH-3308, CH-3807;
  contracts
  30804 to 30806; 30801's meaning now says the coach's roster is a coach's.
- **Checked.** roster-player.test 19/19, with the loader's selects, tables and
  filters asserted and 2 of 2 mutations caught (an extra column, a button around
  a
  name); five existing assertions that a player gets NotRebuilt on `/roster`, or
  that the player sidebar has no Team section, were changed on purpose; the
  Clubhouse suite 2515/2515; `clubhouse:check` clean; a browser pass at 1280 and
  390 (cards, list, phone rows). Not exercised: a signed-in player against the
  database (the loader is tested over a fake client).

## 2026-09-30 — Schedule 1:1 on desktop (Clickables gap 4); View insights in the row menu (Clickables gap 16)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Schedule 1:1 on desktop (Clickables gap 4)

- **Issue.** The desktop Roster panel had no way to plan a 1:1, which the phone
  had.
- **Fix.** Schedule 1:1 opens Calendar's editor with only that player invited
  (`calendar?new=1&with=<id>`, D-52).
- **Checked.** roster + stats-player 124/124, 2 of 2 mutations caught.

### View insights in the row menu (Clickables gap 16)

- **Issue.** The List view's row menu had no way to CoachHelm's read of a
  player.
- **Fix.** The menu starts with View insights, which opens CoachHelm on that
  player (an id not on the board opens the most pressing player).
- **Checked.** roster + coachhelm 178/178, 2 of 2 mutations caught.

## 2026-09-30 — V2 page docs (copied from Messages); eight fixes found while writing them

```text
Contract IDs:   30406 (new: CH-3306, no team) and 22 behaviour contracts without a code (30101 to 32401), all with a test
Actions:        12 (ACT-P003-*)
Data impact:    none
Held items:     roster-availability (data)
```

### Changed (2026-09-30 V2 page docs)

- The six page docs, the manifest's actions, and the 22 behaviour contracts
  (core view, deep link, refresh, safe export, offline, the coach-only gate,
  private notes, refused changes, success, note kept, layout kept, note reads
  back, optimistic decisions, Approve all retry, Try again, toast Retry,
  Remove's warning, note on leaving the field, the loader, failures reported,
  the tests).
- A route adapter, `src/clubhouse/routes/roster.tsx`, so the role check, the
  team and the no-team state have a seam a test can reach. The page calls it for
  a coach with the flag on.
- The catalog gains CH-3306, and `docs/clubhouse/screens/roster.md` now says the
  loader reads in two parallel rounds.

### Fixed

- The toast's Retry did not finish the change on screen. It re-ran only the
  server call, so a retried removal left the player listed and the dialog open,
  a retried approval put the request back in the list (and Approve then failed
  as already processed), and a retried note save left the note marked unsaved.
  What a change does on screen now happens inside its action.
- Try again after a failed read still showed "No players yet": the screen kept
  the players and requests from its first render and ignored the page the server
  sent back. By the same code an approved player would not appear until a
  reload. The list now follows the server's page, with only the changes made
  since laid on top.
- A saved note read back as the old text when the player was opened again.
  Saving now updates the roster the screen holds.
- Remove player fired no warning haptic (D-70 and the phone spec both ask for
  one). It does now.
- A coach with no team saw Home's empty state, whose text is about Home. Roster
  has its own (CH-3306).
- On desktop, pressing Approve on a second request while the first was still
  being decided did nothing and said nothing. Every Approve and Decline now
  waits until the decision in flight has answered, as on the phone.
- The CSV export wrote a player's name as typed. A name that starts with `=`,
  `+`, `-` or `@` (or a tab or a return) could be read by a spreadsheet as a
  formula; it is now written as text.
- Esc inside the Remove or Invite dialog also closed the player panel behind it.
  It now closes only the dialog.

### Why (2026-09-30 V2 page docs)

- D-62 and D-69: every page gets the Messages contract, and writing the contract
  against the code found these five places where the code did not keep it.

### Verification (2026-09-30 V2 page docs)

- `npx vitest run src/clubhouse` 536/536; each new test fails with the code it
  guards broken (VERIFY.md).
- `npx eslint` and `npm run -s typecheck:fast` exit 0.

## 2026-09-29 — Phone build, v2 motion, haptics and page empty state

- The phone list, pushed profile, join requests sheet and ⋯ sheet on the
  approved design (D-50 to D-59), Approve all (D-55), the Calendar 1:1 seed
  (D-52) and the Stats `tab` parameter (D-53).
- v2 motion (D-64), v2 haptics (D-70) and the page empty state for "No players
  yet" (D-71); Roster moved under More on the phone (D-66).

## 2026-09-29 — Desktop build

- Desktop Roster on the Clubhouse loader, with the join requests, Needs a look,
  cards and list, the player panel, the coach's note, Export and Invite, and the
  full state catalog (CH-30xx to CH-38xx).
