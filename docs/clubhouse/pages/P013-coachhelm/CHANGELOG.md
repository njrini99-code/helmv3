# P013 — CoachHelm: changelog

## 2026-10-20 — Deep dive: each read opens with What, Why, Next and When

```text
Design package: CoachHelm supercharge, Slice 0 (the Read, output only)
PR/commit:      see git log (claude/coachhelm-read-lines)
Contract IDs:   130716 (CH-13982: coach only now), CH-13903 (When line)
Actions:        none
Data impact:    none (no new read, no engine or generator change)
Held items:     none
```

### Changed

- The player's Deep dive opens each read with four lines under its title
  (`data/coachhelm-read-shape.ts`, drawn by `Read` in `views/DeepDive.tsx`):
  What (the metric, the value and its sample, the comparison by name, strokes
  a round only when the row estimates them, the confidence word), Why (a cause
  seen in the shots, marked "Measured in your shots", with its counts; else
  "Not traced yet: the record does not say why."), Next (the drill, or the
  row's own action, or "No drill assigned." for the generators' placeholder)
  and When ("Through" the newest round in the read, and "Out of date: ..."
  when a newer round is not in it).
- A player never sees an inferred cause (the owner's default for supercharge
  open question 3, "hide"): no cause sentence and no "Likely, not measured"
  marker on the Why line or in "Why CoachHelm thinks so"; the Why line reads
  "Not traced yet". A coach's rendering (`toChDeepInsight(..., say, 'coach')`)
  keeps "Likely, not measured" and the cause. The role is the viewer the loader
  already maps the card for. The generators' stock reason "sample adequate"
  is no longer drawn; the drivers and their counts still are.
- Folded, not repeated: the lede under the title (it is the start of the full
  write-up now), the out-of-date note under the title (the When line), the
  cause and its marker in "Why CoachHelm thinks so" (the Why line; the section
  keeps the drivers, the reason and the write-up), the "This week" block (the
  Next line) and the stroke sentence under the measured number (the What
  line, said once).
- New styles under `.ch-hd-read` in `coachhelm-dive.css`, `--ch-*` tokens only.

### Why

- Supercharge Slice 0: one read is one claim in four fixed lines, from fields
  that exist today. A zero or unestimated stroke figure is never said, a
  benchmark always has a name, and a cause the row does not state is "not
  traced yet", never made up. After PR #2213 the generators' placeholder cause
  maps to no diagnosis, so those rows read "Not traced yet".

### Verification

- `coachhelm-read.test.ts` (new): a real cause, no cause, the placeholder
  action, zero and unestimated strokes, a measured `sg_baseline` figure, an
  out-of-date row, the same numbers in the coach's and the player's voice, and
  an inferred cause hidden from the player but shown to a coach (an observed
  one shown to both). `coachhelm-dive.test.tsx` updated on purpose for the
  folded parts and the hidden hypothesis.
- Looked at on a phone (390 px) and a desktop width with the preview
  fixtures (`?state=many|stale|zero`). On a phone the four lines sit in the
  green dossier head, so they take its on-green inks there
  (`--ch-on-green-ink*`); the first pass used the card inks and was too
  dark to read.

## 2026-10-20 — The Deep dive stops drawing the placeholder cause

```text
Design package: none (CoachHelm supercharge, Slice 0a; recommendation in /mnt/project-files/coachhelm/supercharge)
PR/commit:      see git log (claude/project-thread-hrav6r)
Contract IDs:   CH-13982 (the diagnosis block; no id added)
Actions:        none
Data impact:    none (read-only; no stored row changes)
Held items:     none
```

### Changed

- `data/coachhelm-dive-shape.ts` `diagnosisFor`: a diagnosis whose cause is
  the generators' placeholder ("<metric> is off its benchmark. Likely cause
  inferred from the aggregate, not a measured shot sequence", written by
  `buildDiagnosis` on every single-metric v3 row) is no diagnosis. The
  "Likely, not measured" box, its cause line, its "sample adequate" reason
  and the driver the evidence block already shows are not drawn for it. A
  measured or hand-written cause draws exactly as before.
- The placeholder test is `src/lib/coachhelm/reads/placeholder-cause.ts`,
  shared and pure.

### Why

- A read-only production count on 2026-10-20 found the placeholder on 545 of
  the 710 visible v3 reads (77%), in two spellings: 314 rows with a full
  stop and 441 older rows with a dash and a lower-case "likely" (both
  counts include archived rows). Printed as a diagnosis it taught coaches
  to skip the why line, and a Deep dive section headed "Why CoachHelm
  thinks so" held only that sentence.

### Verification

- `placeholder-cause.test.ts` (both production spellings) and
  `coachhelm-dive.test.tsx` (a placeholder row gets no diagnosis; the blank,
  observed and hypothesis cases are unchanged). No screenshot: the card loses one block and no layout rule
  changed.

## 2026-10-19 — CoachHelm on an iPad: the views head, the Ask cards and the evidence side sheet

```text
Design package: none (complete-and-elevate plan, lane W4c)
PR/commit:      see git log (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Tablet tier (821 to 1180px, end blocks of `coachhelm.css` and `coachhelm-ask.css`): a player's views head puts the view switch under the sentence when the page holds under 781px, where the sentence had a 56px column and ran a word to a line.
- Ask: the "Since you were last here" cards take as many columns as fit (three at 1180, one at 834), their title no longer wraps to three lines, the chats panel is 216px on a canvas under 781px, and the evidence panel lays over the conversation as a side sheet there instead of taking a third column.

### Why

- The canvas is 618px at 834 with the sidebar open; Ask gave the conversation 338px and the cards 70px each.

### Verification

- WebKit, touch: 834 and 1024 before and after looked at (profile, ask home, ask answer, ask with evidence); the rules sit in a `screen and (821px to 1180px)` media query.

## 2026-10-19 — Type, shape and touch in the page stylesheet

```text
Design package: none (complete-and-elevate plan, lane W4b: type, shape and touch in the page stylesheets)
PR/commit:      lane W4b commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (coachhelm.css, coachhelm-ask.css, coachhelm-dive.css, coachhelm-profile.css, coachhelm-standing.css, coachhelm-thread.css, coachhelm-views.css)

- Figures and labels still in pixels (the dive hero and measure values, the standing "you" figures, the focus and bars values, the thread's bar and rank values) follow the iPhone's text size. The thread's chart axis and reference labels keep theirs (SVG text).
- Radii on the 5, 7, 10, 14, 20 scale.
- The phone's chat header keys, history keys and rows, question pills, composer chips, the thread's copy key, pills, chips and the "View as table" toggle reach 44px; the toggle, the work row, "Why we think this", the profile measure disclosure and the ask finder link have a hover state.
- The thread's bar and rank values, and the profile's measure, standing and score figures, use tabular numerals.

### Why

- Pixel font sizes did not follow Dynamic Type, radii were off the 5/7/10/14/20 scale, some phone controls were under 44px, some clickable things did not answer a pointer, and the font shorthand had dropped tabular figures from figures that sit in columns.

### Verification

- WebKit (headless) at 390 and 1280, light and dark: Rounds, a round, sign-up, sign-in, Home, a CoachHelm thread and Team Hub looked at after the change; the phone with `--ch-type-scale: 1.4` scales text with no sideways overflow (scrollWidth equals clientWidth). Touch reach was measured with `elementFromPoint` 21px beyond each short control; hover was measured by comparing computed styles under the pointer; figures were measured by computed `font-variant-numeric`. `npm run clubhouse:css`: its two findings are existing shadows in `auth.css` (lines 1809 and 1872).

## 2026-10-19 — In-flight actions are busy; one spinner; icon buttons have tooltips; chip and player rows fade a clipped edge

```text
Design package: none (complete-and-elevate plan, lane W4a: controls behave one way everywhere)
PR/commit:      lane W4a commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Accept, Decline, Assign as focus, Dismiss, Undo and a chat action's Confirm are busy while they run; only the one pressed shows the ring and its neighbours stay disabled.
- The thread's working step draws the shared `Spinner`.
- Chats, New chat, Add to your question, Send, Stop, Mention, Copy and Close evidence show their name on hover and focus.
- The phone's view chips and the player list fade only the clipped edge.

### Why

- The same control behaved differently from page to page: a save greyed its button out at 42%, five places drew their own spinner, icon-only buttons had no words on desktop and a scroller gave no sign there was more. They now come from the shared owners (`Button` busy, `Spinner`, `Tooltip`, `use-hscroll`).

### Verification

- Targeted tests for this page and `ui/__tests__/controls-consistency.test.tsx`; the busy ring was captured at 390 and 1280, light and dark, on `/clubhouse-preview/classes` (the same Button owner draws it here); tooltips and edge fades on the messages, roster and CoachHelm previews. Pages other than the one captured were checked in source only.

## 2026-10-19 — Off, empty and first-run CoachHelm told apart; Deep dive empties join the shared state

```text
Design package: none (complete-and-elevate plan, lane L3: empty, first-run and failure states)
PR/commit:      lane L3 commits on agent/clubhouse-complete
Contract IDs:   CH-13301, CH-13302, CH-13304, CH-13305, CH-13306, CH-13307, CH-13360, CH-13370, CH-13382, CH-13383, CH-13384
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- CoachHelm turned off for a player, or off for everyone for a coach, is the restricted state: a lock and who can change it, with no action that would fail. A coach's own switch-off keeps Open CoachHelm settings.
- First-run boards, Game profile and Standing draw rows under the sentence; the coach's board draws portrait rows.
- Deep dive's three "nothing here" cards (no trend, no rounds listed, no plan) use the shared compact state; `.ch-hd-none` is gone.
- The player's phone eyebrow (`.ch-hl-role`) no longer carries 0.14em tracking.

### Why

- Every empty page was one template: a green tile, a headline, a sentence and a button in blank space. The waiting form draws the shape of what will fill the space (rules, rings, a baseline; no bars, no fake text) under one sentence that names what fills it and who does it, and a filter that hides everything is told apart from a first run, a lock and a failed read.

### Verification

- `states.test.tsx` (the waiting form, its four kinds, the danger tone unchanged) and this page's tests; captured at 390 and 1280, light and dark, before and after, on `/clubhouse-preview/coachhelm?state=empty` and `coachhelm-player?state=empty`. `coachhelm-player?state=off` (the restricted state) was captured after only, phone, light. The Deep dive empties have unit tests but no capture.

## 2026-10-18 — Wave 10: inviting from an empty CoachHelm

```text
Design package: none (wave-10 first-run review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-13301 CH-13307 CH-13321 CH-13360
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-10 first run)

- No players (CH-13307, and Ask's CH-13321): Invite players (UserPlus,
  Roster's invite sheet) replaces Open roster, as Home has. CH-13307's body
  no longer repeats the lede: "Invite your players. Each one’s insights show
  up here once they post rounds."
- An empty Game profile (CH-13360) lists its measures as the compact locked
  tiles the loaded view uses, not seven full cards.
- The player's Start a round uses Plus, as Home and Rounds do (Board, Game
  profile, Standing, Deep dive).
- A player with no round reads the lede "One thing to work on each week, from
  the rounds you post." (it claimed rounds already posted).

## 2026-10-18 — Wave 7: player CoachHelm

```text
Design package: none (wave-7 player journey review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    reads only (the miner's floor and window, the proposing coach)
Held items:     none
```

### Changed (2026-10-18, player CoachHelm)

- Decision C: Decline is held under a toast with Undo (CH-13912) and
  written when the toast goes, or at once when the page is left; Undo
  writes nothing. The declined row offers "Tell coach why", which opens
  Messages to the coach who proposed it. A failed write puts Accept and
  Decline back with CH-13005.
- The empty board says how many rounds are still to come ("Post 2 more
  rounds and CoachHelm starts reading your game."), counted as the pattern
  miner counts them: its floor (the coach's `min_rounds_for_signal`, never
  under the miner's minimum) less the countable rounds in its window.
- No "Player" eyebrow over a player's CoachHelm or its views (skeletons
  match); the coach keeps "Coach".
- "What is working is listed below" on the phone; "beside this" stays on
  the desktop, where it is.

## 2026-10-18 — Wave 6: honest projections, units and words

```text
Design package: none (wave-6 CoachHelm review, review6-ch)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    reads 6 more stats-cache columns; focus areas save the
                typeset title
Held items:     Priority vs "Worth closing"; Standing hero "0 of 19 stats"
```

### Changed (2026-10-18, wave 6)

- Standing: "Most to gain" and the headline never lead with Strokes gained:
  total (the sum of the rows). A putt band and sand scrambling are sized by
  the player's own attempts a round from `golf_player_stats_cache`, as their
  insight cards are; without attempts, a part of the game is capped at what
  its strokes-gained category is behind (3–5 ft no longer reads 1.7 strokes
  while all of putting is 0.63). The early notice names the team floor only
  when a row is short of teammates. Dates and dots no longer break a line.
- Profile: driver usage and miss side are never a strength or a watch-out.
- Board and Deep dive: "What’s working" headings, "Needs work" on the tile,
  and a bare number says what it counts ("gap", "a round", "made").
  Distances keep their unit on the line ("4–6 ft"). The slope read says
  "from 4–6 ft", drops its "(n=…)" aside and labels its chart "Make rate,
  downhill vs level, same distance" (stored rows refresh on the next
  generator run; until then the page drops their "(n=…)" aside). A
  proposal says `From the read “…”`. A focus area is saved with the
  typeset title.
- Coach board: players with no insights are named; the pulse says "scoring
  worse over their last three rounds" with "+2.1 strokes".
- Ask: the trend averages a rate by its sample and names its player; the
  table column is "Rate". The action card says "On confirm:", "Sent:",
  "Notifies:" or "Nothing was sent." by its state. The rate-limit notice
  reads "Too many questions in a row." Below 1440px, opening the evidence
  moves the chats aside without changing the kept choice.

### Verification (2026-10-18, wave 6)

- Updated and new cases in `coachhelm-standing`, `coachhelm-thread`,
  `coachhelm-thread-ui`, `coachhelm`, `coachhelm-audit`, `coachhelm-dive`,
  `coachhelm-profile`; engine: `genome-ui`, `putt-slope-bias`,
  `program-pulse-movement` (new).

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

- "Assigning…", "Dismissing…", "Undoing…" (CH-13403) and
  "Accepting…" / "Declining…" (CH-13404) while those writes run.

## 2026-10-18 — Wave 4: the Ask box fits again under Dynamic Type

```text
Design package: none (wave-4 Dynamic Type brief)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Ask box fit)

- The Ask composer's text box (`Composer.tsx`) measures again when its text
  wraps differently with no new text: when the iPhone's Text Size lands on
  `<html>` after the box first measured (the shell writes it in a later
  layout effect), and when the box's width changes. At XXL the two-line hint
  was cut in half; it now shows whole. Nothing changes at the default size.

### Verification (2026-10-18, Ask box fit)

- `composer-autosize.test.tsx` (new): a Text Size write re-measures, other
  style writes on `<html>` don't, a new width re-measures and the height it
  set does not, and the observers stop on unmount.
- WebKit 390 (`coachhelm-ask`): scale-1 screenshot identical to before; at
  XXL the hint shows on three lines in a 104px box.

## 2026-10-18 — Wave 4: Dynamic Type for the phone's text

```text
Design package: none (wave-4 Dynamic Type brief)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Dynamic Type)

- `coachhelm.css`, `coachhelm-ask.css`, `coachhelm-thread.css`,
  `coachhelm-views.css`, `coachhelm-profile.css`, `coachhelm-standing.css`,
  `coachhelm-dive.css`: the phone's text (board, pulse, focus cards, Ask,
  the thread, history, the view chips, Game profile, Standing, Deep dive) is
  set in `calc(N * var(--ch-type-k))`, so it follows the iPhone's Text Size
  up to XXL. The composer stays 16px on the phone: `globals.css`'s iOS zoom
  floor outranks its rule (which keeps a 16px `max()` floor of its own).
- Left fixed on purpose: figures and values (the measure figures, standing
  values, dive values), chart axis text and the thread's data table.
- At XXL (390 wide) the unscaled text drops from 46 to 14 (board), 40 to 7
  (player), 11 to 2 (Ask), 112 to 11 (Game profile), 278 to 68 (Standing),
  41 to 9 (Deep dive). The rest is the shared shell and the figures. At the
  default size every value is the same pixel.

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): scale 1 screenshots of the board,
  player, Ask and the three views are pixel-identical to before; at XXL no
  overflow or visible overlap, also in an answered thread, an action, a
  receipt, the evidence sheet and the history drawer.

## 2026-10-18 — Wave 3 accessibility: Ask accents, view chips

```text
Design package: none (wave-3 accessibility review, items 8, 17)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, a11y wave 3)

- Ask: the accent words (the find cards' category and question, the history
  and head accent buttons, the state link, a set chip) take `--ch-green-600`,
  not the fill colour `--ch-accent`. Light is unchanged; dark reads 7.99:1
  (was 3.06).
- Player CoachHelm, phone: the view chips mark the shown view with
  `aria-current` instead of a pressed toggle.

### Verification (2026-10-18, a11y wave 3)

- `npm run test:file` on `coachhelm-views.test.tsx` (asserts `aria-current`).
- WebKit (Playwright, dev preview, 1280): Ask's weakest accent word 7.99:1
  dark, 6.66:1 light (unchanged).

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
  title holds still between tabs. The role line is 4px shorter than the eyebrow,
  so the top adds 4px; on the light sheet its 12px inset comes off the top.

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

## 2026-10-18 — Wave 3: the pulse says replied

```text
Design package: none (wave-3 design review, items 3)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, RSVP pulse wording)

- The program pulse's RSVP item reads "2 players haven’t replied to Team
  dinner" over "4 of 6 replied", in the words Home and the calendar use for
  replies, where it said "have not responded for" and "responded"
  (`src/lib/coachhelm/v3/chat/program-pulse.ts`, shared with Fairway's
  ProgramOpening; preview fixture and tests follow).

### Verification (2026-10-18, RSVP pulse wording)

- New `program-pulse-rsvp.test.ts` runs the pulse over events and replies
  and checks both forms ("2 players haven’t", "1 player hasn’t") and "N of M
  replied". `npm run test:file` on it, the CoachHelm tests and the other
  `program-pulse-*` tests.

## 2026-10-18 — Polish: typeset insight text; Ask hovers; chip @ on Escape

```text
Design package: none (wave-2 interaction review rows 6, 11, 12, 17)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, interaction review)

- Insight text spoken for a viewer is typeset: curly apostrophes and
  quotes, and an en dash in number ranges ("4–6 ft"). Text with no viewer is
  left as stored. A focus area's saved description is the typeset text.
- Ask: New chat, the + key and the Players/Any dates chips have desktop
  hovers; history rows draw their focus ring inside the scroller.
- Ask: Escape on a picker the Players chip (or the `@` key) opened takes
  back the `@` it added; an `@` the coach typed, or the Add player
  starter's, stays.

### Verification (2026-10-18, interaction review)

- WebKit (Playwright) checks: focused vs blurred and hovered vs resting
  computed styles and crops, `scratchpad/w2-interact/`.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on the five
  existing `shell.css` findings (lines 3742-3821), none in this change.

## 2026-10-18 — Polish: history titles end in a clean ellipsis

```text
Design package: none (wave-2 states review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, states review)

- Ask's history rows are blocks centred by their line height, not flex rows,
  so a long title ends in an ellipsis instead of being cut mid-letter
  (`coachhelm-ask.css`, the drawer's 44px rows too).

### Verification (2026-10-18, states review)

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on five
  `shell.css` findings from commit 3730926bb, none in this change.
- WebKit (Playwright, dev preview, 1280px): a 72-letter history title is
  a 36px block row ending in an ellipsis.

## 2026-10-17 — Polish: tabular figures in rows

```text
Design package: none (polish review row 18; no new pattern)
PR/commit:      uncommitted (Clubhouse polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Tabular figures come back on 2 rules in `coachhelm.css` whose `font` shorthand
  reset `.ch-num` (the row figures and the player chips).

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check` and
  `typecheck:fast` pass. The WebKit pass is the coordinator's.

## 2026-10-17 — Wiring checked against production; moved links open their Clubhouse screen

```text
Design package: none (links only; no visual change)
PR/commit:      uncommitted (Clubhouse wiring pass, P001-P015 remaining screens)
Contract IDs:   none new
Actions:        none changed (ACT-P013-* checked)
Data impact:    none
Held items:     none
```

### Changed

- **Ask's receipt chips and pulse findings link where production's do**
  (`data/coachhelm-chat-links.ts` `askLinkHref`, used by `chat/ActionCard.tsx`
  `AskReceiptCard` and by `loadAskCoachHelm`'s findings). The chat engine
  (`lib/coachhelm/v3/chat`) writes Fairway addresses: `/golf/dashboard/tasks`
  ("1 task"), `/announcements`, `/intelligence?view=players|signals` ("Open
  development"). Those screens moved in Clubhouse, so `rebuiltHref` answered
  null and the chip or link was drawn as plain text, where production links it.
  They now open the screen the address's own alias redirect opens for a coach,
  in one step: Team Hub's Tasks (`?task=` carried), Team Hub's Announcements,
  the CoachHelm board (`?player=` carried, `?view=chat` to Ask). Anything else
  is still a link only when it is rebuilt for a coach.
- **The Game profile's "What CoachHelm sees" rows are a client link**
  (`views/Profile.tsx`). They were a plain `<a>`, so opening a read in Deep dive
  reloaded the whole app (shell, session, fonts); every other link between the
  views is a `next/link`.
- **The route follows the dashboard role, not "has a coach row"**
  (`routes/coachhelm.tsx`, `ClubhouseCoachHelmRoute`). A user whose onboarded
  profile is the player one, with an unfinished coach profile beside it, is
  drawn as a player by the layout, but took the coach branch here and got the
  coach's "You aren't on a team yet" (CH-13308) instead of their own CoachHelm.
  The coach branch now runs only when `pickGolfDashboardRole` (the role
  `resolveClubhouseTeam` and the layout use) is the coach; the player branch
  needs no team, as before. Same rule as `routes/roster.tsx`.

### Checked, no change

- Assign as focus, Dismiss and Undo call `createFocusAreaFromInsightV2`,
  `dismissInsight` and `reactivateInsight` (`actions/insights-feed.ts`, the same
  module Fairway's Game fingerprint imports) with the insight's own title,
  description, area type, metric and current value; `verifyPlayerAccess` /
  `verifyInsightAccess` admit a coach of the player's team. Accept and Decline
  call `acceptFocusArea` / `declineFocusArea` on the player's own proposed row,
  as Stats Development does.
- Ask uses production's own `useCoachHelmChat` (the same `POST
  /api/coachhelm/v3/chat/stream` body: messages, conversation id, turn key;
  approvals resubmit through the hook). The conversation list and a thread read
  the same columns and order as `listConversations` / `listMessages` (RLS:
  `coach_id = current_coach_id()`).
- The loaders' filters match production's: the coach's roster is the team's
  `status = 'active'` members (as `getCoachChatContext`); round reads are
  `is_test = false`, `status = 'completed'`.
- `?view=development` (77 of production's 228 `dev_plan_assigned` notifications,
  every one to a player) redirects to Stats' Development tab
  (`/golf/dashboard/stats?tab=dev`), which `StatsPlayer` opens; the other 151
  open the player's board. No realtime on this page.

### Verification

- `npx vitest run src/clubhouse/__tests__/wiring-p013-links.test.tsx`,
  `wiring-p013-route.test.tsx` and the existing CoachHelm tests touching the
  changed files (results in the session report). The engine guard reads every
  `href:` the chat engine writes and asserts each opens a Clubhouse screen.

## 2026-10-16 — The Game profile reads what CoachHelm says; Standing is greener and organized

Owner, 2026-10-16: base the profile on actual CoachHelm output ("make it based
on actual CoachHelm output"). The genome alone read 3 rounds (the last 90 days,
countable rounds only) while the Board's insights read 23.

- **The profile leads with CoachHelm's insights** (`Profile.tsx`,
  `coachhelm-profile.ts`). `loadPlayerProfile` now also calls
  `loadPlayerCoachHelm`, the Board's own ranked read for the player, and carries
  it as `ChProfile.sees`. On the green board the top insight is the headline
  with its lede, sample, window and date, then **Costing you** and **Working**
  (up to four each), every row opening its evidence in Deep dive. Insights that
  are out of date are left off, and the text is the engine's, nothing written
  for the page. The genome follows as a quieter section, "The shape of your
  game". The intro line now reads "What CoachHelm reads in your rounds, and the
  shape of your game."
- **The insights not loading** is its own notice, CH-13261 ("What CoachHelm sees
  didn’t load", with Try again), never "nothing to say"; the measures stay. A
  new screen test and a loader test cover it, and CH-13261 is in the catalog.
- **The genome's section is organized and greener** (`coachhelm-profile.css`):
  how many measures are read is a row of dots, the measures split into "With a
  read" and "Still filling in" (green-tinted tiles that each say what they still
  need), and a measure with no stance draws on green. Inside a green board the
  ledger heading ink resets to the board's.
- **Standing is greener and organized** (`Standing.tsx`,
  `coachhelm-standing.css`): the headline and Most to gain sit on the green
  board; each group's head carries its tally against the Tour ("n ahead, n
  behind") over a green rule; a stat ahead of the Tour sits on a faint green
  wash. The data is unchanged (`golf_player_standing`, the nightly read).

- **Standing's bars show the gap** (`Standing.tsx`, `coachhelm-standing.css`): a
  new `.ch-hs-tr__gap` fills the space from the Tour's mark to the player's,
  green when ahead and amber when behind. The track is green-tinted and the
  marker solid. The Game profile's scales get the same track, a full-strength
  fill and a solid marker (`coachhelm-profile.css`).
- **Deep dive at more contrast** (`DeepDive.tsx`, `coachhelm-dive.css`): the
  hero is a green board (`ch-scoreboard`), the rail a bright panel with the open
  read lit green, the heads field green, and the gauge track green-tinted. The
  open read no longer has a green side bar (see the shared entry).

Checked: the vitest above; the Standing and profile tests (64) and the CoachHelm
tests passed in the main session. No visual check is recorded for these commits,
and no migration is involved.

## 2026-10-16 — CoachHelm and Ask at full contrast; CoachHelm on a bright sheet

Owner, 2026-10-16: "more contrast on this and the other ones", "coachhelm
contrast is the same". In light mode only (`coachhelm.css` `.ch-hl`,
`coachhelm-ask.css` `.ch-ask`; dark mode is unchanged):

- Both screens take the page-scoped contrast step the Qualifiers page took: text
  one grade darker (secondary copy reads as primary, tertiary as secondary), and
  the Increase Contrast rules and borders.
- The whole ink ramp is darker, 700 down to 300, so copy that names a mid ink
  directly (a locked measure, a quiet caption) is darker as well. The same ramp
  change is in Qualifiers' block (P009).
- On the desktop (above 820px), CoachHelm sits on one bright surface sheet over
  the parchment, on 24px corners, so its copy reads on a white ground. The phone
  is unchanged.

Checked by the main session in Chrome on Board, Game profile, Standing and Deep
dive; Ask and the phone were not reported as checked, and nothing was checked in
Safari.

## 2026-10-16 — The other views are fetched whole once the page is idle

The view strip never prefetched, so on the desktop every switch between Board,
Ask and the rest waited on the server for the whole page (owner, desktop
Safari). `useViewSwitch` takes the list of views (`CoachBoard`, `PlayerBoard`
and `views/Frame.tsx` pass theirs; the player's is `PLAYER_HELM_VIEWS`) and
fetches the others whole once the page is idle, as the phone's tabs are
(`use-prefetch-tabs`). Data Saver and offline skip it. No visible change.

## 2026-10-16 — The phone Evidence sheet slides out; ivory ink holds at night

- **Evidence on the phone (audit A-18):** the sheet stays mounted after its
  first opening and keeps the evidence it showed, so closing it slides it out
  instead of making it vanish (`Ask.tsx`, `AskEvidencePanel` takes `open`).
- **Dark mode:** ivory ink on a green fill in the profile, the thread and the
  views uses the `--ch-on-fill-*` tokens, which stay light at night (the shared
  2026-10-15 ink entry).

## 2026-10-15 — Ask's suggestion cards are plain data

No visible change. The phone's Ask suggestion cards built their second line
with a function handed from the server to the client Ask Home, which made the
RSC render throw "Functions cannot be passed directly to Client Components"
(Sentry JAVASCRIPT-NEXTJS-158). `sub` is now a string with a `{team}` token,
filled on the client by `askSuggestionSub`; the cards read the same.

## 2026-10-13 — The History drawer slides on the shared spring, over the shared backdrop

The phone's History drawer slides in and out on the smooth spring instead of the
260ms ease-out, and its backdrop
fades in on the shared `--ch-scrim` instead of appearing at 0.45 (dark 0.6).
Shared change:
docs/clubhouse/CHANGELOG.md (popups).

## 2026-10-12 — /intelligence keeps the player and Ask

- The old `/golf/dashboard/intelligence` address (coach insight pushes, CRM
  demo invites) keeps `?player=<id>` when it moves to CoachHelm, and
  `view=chat` opens Ask (`view=ask`); other views are dropped. The page's role
  is the dashboard layout's (`getGolfDashboardRole`).

## 2026-10-10 — The desktop board in the phone's lit-card language

Presentation only. The focus's claim is the page's one lit green card at the
head of the focus column (the phone's card, now one shared
block so the two cannot drift), with its evidence as one reading, a large figure
over a gradient track, under it; bars and the
confidence meter take gradient fills; section heads take a short gold lead; the
chosen player gets a green rail. "Decision first,
pulse second" stays not built (the owner declined it).

## 2026-10-08 — Ask: the @ picker is cmdk, and offers the stats

```text
Design package: none; no owner board draws the picker (phone spec note in docs/clubhouse/phone/coachhelm.md)
Contract IDs:   CH-13821 (catalog row widened: stats, docked list, Tab, the select haptic)
Data impact:    none; the stats are the agent's metric catalog (metrics-catalog.ts), no new read
Held items:     before and after screenshots (no dev server in this pass)
```

- **One picker, phone and desktop:** typing `@` (or the `@` key, the Players
  chip, the Add player starter) opens a
  cmdk list of the roster and, under it, the stats CoachHelm can read (the
  agent's own metric catalog, so a stat the
  coach names is one the model can measure). Both narrow as the coach types;
  `@gir` and `@sg` find a metric by its short
  name. A player or stat already in the question is not offered again.
- **The phone's sheet is gone:** on the phone the list docks above the composer,
  about four and a half 44px rows tall
  and never more than two fifths of the space the keyboard leaves. The text box
  keeps the focus throughout (the `@` key
  and a row press never take it), so the keyboard stays up; the composer's
  keyboard-height layout is untouched.
- **Keys:** the arrows move and wrap, Enter and Tab pick, Esc closes;
  Shift+Enter is still a new line, and a closed
  picker never takes a key. VoiceOver hears cmdk's listbox through the box's
  `aria-controls` and
  `aria-activedescendant`, the two groups by their headings, and a fragment that
  matches nothing as one dimmed row.
- **Never clipped:** the composer measures the room between its box and the
  nearest edge that would cut the list off
  (a clipping ancestor such as the Ask sheet's panel, or the visible viewport
  above the keyboard) and the CSS caps the
  list to the smaller of that and its own height (296px, the phone's 212px).
- **Without a roster:** a host that loads no roster passes `roster={false}` (the
  shell's Ask sheet does); its picker
  offers the stats alone, named "Mention a stat", with no Players group and no
  "No active players" that is not true of
  the team. A fragment no stat matches is one dimmed row, "No stat by that
  name".
- **Look:** rows are 44px everywhere (were 38px on the desktop): a player's
  initials coin or a stat's chart coin, then
  the name. The list floats on the overlay elevation with a 180ms fade and rise,
  none under reduced motion or with
  Animations off. A pick ticks the select haptic.

## 2026-10-08 — the cardless pass: Ask on the phone

Phone only; the desktop is unchanged.

- **New chat:** the opener and the questions sit together at the foot of the
  screen, just above the composer,
  instead of a centered greeting over an empty page with a sideways rail of
  outlined 164px cards at the bottom. The
  opener is left-aligned (28px), and the three questions are action rows between
  the Ledger's soft seams, their
  words in the green ink as an iPhone action row's are, a 60px row with a
  full-width tap area and a press tint, no
  chevron (a row asks; it does not go somewhere).
- **Evidence:** the figure stays the one object. Its metric tiles are no longer
  cards inside it but its rows: the
  label at the left with the sample under it, the value at the right, parted by
  the figure's hairline and closed by
  one above and below. The Evidence sheet draws the same rows, and its trend
  sits on the sheet under a hairline
  instead of in a ringed card. The scrolling table keeps its card.
- **Action card:** the notes (who is told, and the impact) are lines under the
  facts' hairline, not filled boxes
  inside the card; the impact's icon keeps the warning ink.
- **Loading:** the phone skeleton draws the new chat's shape (the opener's
  lines, three rows, the composer) at the
  foot of the screen, not the desktop's centered block.

## 2026-10-08 — The green card is where the light lands (P013-A3)

Approved by the owner on 2026-10-08. On the phone the focus's claim, the page's
one green card, takes the only light-aimed rim: a 1px rim of the shell's light
on its sun-facing top and side, a darker hairline opposite. Its "Worth closing"
stance is gilt that catches the light on its sun side. Nothing else on the page
gains depth, no figure is lit, nothing moves, and the rim goes under Increase
Contrast.

## 2026-10-08 — Premium pass findings (D3 to D13)

The premium audit's CoachHelm findings, checked in WebKit at 1440x900 and
390x844, light and dark. A1 (decision above the pulse) is not built: the owner
said no.

- **Ask trend (D3):** the chart is drawn at its measured width (ResizeObserver),
  so a viewBox unit is a pixel and its axis type is 10.5px on the desktop and
  12px on the phone, not about 20px scaled up. The reference label takes the
  first place clear of the line (above or below the dashed line, at the right
  or the left); when none is clear it is a key under the chart. The Deep dive
  and the evidence panel draw the same trend.
- **Standing (D4):** the hero leads with the most to gain and gives one count,
  against the Tour's denominator; strokes gained is named against the Tour, as
  Stats says it (Q-88), never "field average".
- **Game profile fixture (D5):** scrambling is 35%, "Reliable", the live
  dimension's own label. "Mixed" under Strong is the live persona's call
  (driver usage peaks at a 60% mix in `normalize.ts`), not the fixture's.
- **Deep dive (D6, D13):** the full write-up drops the sentence that repeats
  the drill "This week" draws; the diagnosis lines end with a full stop; the
  hero says "In your plan" overlaps the two lists. Even ("E") is ink on the
  plain plate, not mint.
- **Ask fixture (D7):** the slope bars are Uphill 76%, Level 81%, Downhill 58%,
  as the board's level 81% says; the ranking's footer counts what its rows list
  (24 attempts, not the first row's 9), asserted in the tests.
- **One h1 (D8):** on the phone the page's large "CoachHelm" is text (the top
  bar has the h1) and still labels the main landmark; every skeleton has a
  hidden h1; Standing's rows are h3 under their group's h2.
- **Reach (D9):** the Ask step toggle and the ranked list's name links have a
  44px hit area.
- **One primary (D10):** with more than one proposal each Accept is secondary.
- **Card in card (D11):** the Ask ranking and tables inside a figure are rows on
  rules in the figure's one card.
- **Coach board (D12):** a player with no open signal shows no count (it was
  "0"); generator labels are sentence case ("Penalties per round"); the gauge
  legend keeps the spaces round its dot.

## 2026-10-08 — States and native feel

The states audit's CoachHelm findings and the owner's native-feel pass, verified
in WebKit at 390x844 with touch.

- **Coach board, players and no signal yet (CH-13306):** it was the page's empty
  medallion under the pulse, its View roster below the fold on the desktop and
  the phone. The pulse is on the page, so it is now the players' section with
  nothing in it: "Your players" under its rule, the empty line and View roster
  under it, in view.
- **Ask:** the canvas is the Ledger's (it was the near-white surface). A
  conversation that is not available (CH-13320) is the page's empty state, calm
  on the canvas, not a boxed tan card, and still an alert. A program that did
  not load (CH-13221) and a conversation whose messages did not read (CH-13224)
  stand where the welcome would be, centred in the column on the desktop, not at
  the top of a blank page. The thread fades into the dock with a wash, not a
  shadow.
- **Told once:** when two or more of a read's parts did not load (its category
  trends, its rounds, its focus areas and goals), the read says so once under
  its head with one Try again (CH-1209) and each part keeps its title in place;
  Standing's scoring average and team's Tour the same. One failed part keeps its
  own notice.
- **Standing:** the headline closes without a full stop. With the scoring
  average failed, the headline stays: it compares the stats with the Tour and
  the team, which loaded, and the notice says the comparisons are not affected.
- **Press:** Why we think this and How it is measured deepen to the row press
  tint; the composer's add and mention keys compress like every key
  (`data-ch-press`).
- **Loading:** the phone skeletons hold the loaded geometry, measured at 390:
  the player's two-line intro, the claim's card per role, the views' cards and
  the Deep dive's three-line brief, so nothing moves when the page lands. The
  pulse still grows past its three reserved rows when it has more (CH-13405).
- **Loading at every phone width:** the Game profile's and Standing's cards in
  waiting follow the loaded card as the phone widens and its lines wrap fewer
  (they were 48 and 64px too tall at 430), on the CoachHelm container's width.
  Measured in WebKit from 355 to 445px; within 0.2px at 390 and 430.
- **Ask, the program did not load (CH-13221):** the page failure (CH-1211),
  drawn as the route error is (a brick medallion, the title, Try again first),
  where it was a notice.
- **Ask, Show and Hide chats (CH-13620):** the rail's column switches at once;
  it no longer animates the grid's columns (layout never animates). Shown, the
  rail fades in over base while its content slides 12px in from the edge, inside
  the rail's own clip; hidden, it goes at once. Reduced motion and Animations
  off show it at once. The phone's drawer is unchanged.
- **Copy:** the page's words take the curly apostrophe, as the shell's offline
  line now does: the coach's no-team page (CH-13308, "You aren’t on a team
  yet"), Ask's send while offline (CH-13920, "Couldn’t send: you’re offline"),
  "Couldn’t copy" (CH-13051), the evidence control's "See Jonah’s numbers" and
  "See Jonah’s stats", and Ask's suggestions ("What’s on this week?", "who’s
  improving this month", "what’s coming up"). A failed answer's offline line
  (CH-1905) is the shared one (`OFFLINE_LINE`) instead of its own copy, contract
  130702 quotes the curly line, and the copy-apostrophes guard covers CoachHelm.
  Ask's failure sentences (`coachhelm-chat-error.ts`, identical to PR #2105
  until it lands) and the server's note for a rejected turn (CH-13252) are shown
  as the server words them.

## 2026-10-08 — Phone: Mobile clubhouse pass

The owner's phone review ("phone too cardy, too vibe coded"; the Coach Home
"Mobile clubhouse pass" board, round 3: "fewer containers, one feature card"),
carried to every CoachHelm phone screen. Phone only: each new rule sits inside
`@media (max-width: 820px)`, and on desktop the focus's new wrapper draws
nothing (`display: contents`).

- **Title:** "CoachHelm" was a 400-weight display title on the phone. The header
  is now the Ledger's intro under the engraved double rule: the role as the
  tracked brown eyebrow, CoachHelm in the 600 sans at 31px, the live line.
- **No stacked cards:** the program pulse, Proposed for you, Also worth knowing
  and Working are sections flush on the parchment, each heading under the double
  rule, their rows between soft seams (the pulse's glyphs are flat keys). The
  one green card is the focus's claim (category, stance, claim, first sentence);
  its evidence, the week's drill and Why we think this follow flush under it,
  set off by rules. Before, the focus was a white card holding the evidence's
  card and the drill's well. A dismissed insight is a row between rules.
- **Views:** the Game profile, Standing and the Deep dive open on their one
  green feature card (the persona with Strong and Worth watching; where you
  stand with Most to gain in champagne; what CoachHelm has found with its three
  counts as a figure line), and every measure, group of stats and list of reads
  is a section of rows. A read's pushed screen opens on its own feature card and
  its parts follow flush. This fixes the Game profile's figure beside a strength
  (62%), which was ivory on a white card on the phone. When a whole view is
  empty (Standing's first run, CH-13370; the Deep dive's, CH-13380 and CH-13381)
  the phone draws the page's empty state, centred on the parchment like the
  Board's first run; the Game profile's first run keeps its line, since what it
  will read follows it.
- **Chips:** the player chips and the view chips are drawn with a hairline (the
  chosen one green), not lifted plates, and take the page's 20px edge.
- **Ask:** the bar's title ("CoachHelm", or the chat's name) was dark ink on the
  green bar and could not be read; it is ivory. The page sits on the parchment,
  its suggestions are hairline chips, and the no-rounds note is a line. A failed
  answer (CH-13251) is a flush notice like the page's others: the danger rule at
  its left, the message in the danger ink, no pink fill, Try again under the
  words.
- **Loading:** the board's and the views' skeletons draw the phone's shapes (the
  intro's lines at their loaded heights, the pulse's head and reserved rows, the
  chips, the feature card's place, sections of rows).

Kept as material: the view switch, the chips, the bars and the gauge, the pills,
the buttons, the thread, the composer, the notices and the sheets. No motion,
copy, behaviour or catalog code changed.

## 2026-10-08 — Server-action imports follow the golf.ts split

```text
PR/commit:      #2176, agent/phase-7
Design package: none
Contract IDs:   none changed
Data impact:    none
Held items:     none
```

The screen's imports and test mocks now point at the files that own the server
actions (insights-feed.ts) after `golf.ts`, `insights.ts` and `admin-data.ts`
were split by domain. No behavior change.

## 2026-10-07 — Rows answer the press

On desktop an insight row or a player in By player now deepens to the row press
tint over the press beat, as the deep dive's list, read and plan rows do
(CH-13602, now referenced in `InsightRow`). The contract no longer says the
Assigned chip rises under reduced motion: it appears at once, as the catalog
says.

## 2026-10-07 — The Ledger: the board and the views on the canvas

On desktop CoachHelm's reading cards now sit on the framed canvas, under
headings and engraved rules. Phone is unchanged.

- **Board:** the program pulse is a section under its heading and rule. The
  first row of each column sits on the rule, the rows are split by soft seams,
  and its notice and quiet line clear the rule as a row does. By player (or the
  player's other reads) and the focus are two columns whose heads share one
  ruled line. A chosen player is a soft green tint, not a lifted plate, and
  the tint hangs 12px past the column so the avatars align with it. The
  evidence is part of the focus, set off by one soft rule; the week's drill
  keeps its well. A dismissed insight is said on the focus column's head line,
  with Undo, instead of on a card. Proposed for you is a section whose note
  carries the rule.
- **Game profile:** the shape of the game is a section: label and window over
  the rule, the headline, then Strong and Worth watching as two columns split
  by a soft rule. Every measure is one ruled table: columns split by a soft
  rule and rows by soft seams, with no card or stance wash per measure (the
  stance stays in the word, the tag and the scale). Keep reading is the
  table's last cell.
- **Standing:** the label and window head the section; the headline sits
  beside Most to gain, a column split off by a soft rule. Each group of stats
  is a section under its heading and rule.
- **Deep dive:** the three counts are one figure line split by soft rules.
  The list of reads and the open read are two columns whose heads share a
  ruled line; the read's parts follow on soft rules, and the plan is rows, as
  the rounds are.
- **Fixes:** the Game profile's figure beside a strength (for example 62%) was
  ivory on ivory and could not be read on desktop. The Development link beside
  the views was the old green canopy's mint, barely visible on the ivory head;
  it is the ghost button's green.
- **Loading:** every skeleton flattens the same way and draws the rules where
  the page does. Measured in WebKit at 1440 (the board also at 1000), the head
  and section tops don't move when the page lands: the pulse section is 236.8px
  (a 22.8px heading, 12px to its rule, and a 202px reserve on the canvas), the
  Game profile's hero 221px, Standing's 282px and the Deep dive's 156px.
  Standing's and the Deep dive's two-line head is held at 183px (the skeleton
  held 159px before, a 24px shift), and the Game profile's hero no longer
  shifts by 31px.

## 2026-10-07 — The pulse's held space says something

The program pulse holds three rows of space so nothing below moves when it
streams in. With four items or fewer that left an empty band in the card. When
every read the pulse is made from came in (no gaps), the foot of that space now
says "Nothing else is flagged across the program", with a check, over a
hairline. When a read failed it stays silent: the existing CH-13206 notice says
what wasn't checked, never "nothing is flagged". The card keeps its height.

## 2026-10-07 — Digits in serif titles

Data-fed serif titles set their digits in the sans (shared `SerifText`; see the
cross-page log), so a name or title with figures reads cleanly.

## 2026-10-07 — Loading holds the loaded page

The pulse keeps its reserved height (CH-13405) whether the rows, a notice or the
skeleton are in it. Desktop loading draws on the canopy with the view strip
level with the title, as the page does, and holds the measured heights: a 194px
title block and a 258px pulse. Measured in WebKit at 1440 and 1000, coach and
player views: the header, pulse and grid tops don't move when the page lands.

## 2026-10-07 — Views on ivory, serif headlines

Game profile, Standing and Deep dive no longer open on dark green summary
panels. They are ivory reading sheets whose headlines are set in the display
serif in the field green, with the key figures in green italic (for example "0
of 19"). Their inner panels are soft wells, and warning figures use the warning
ink.

Other details on the board:

- The week's drill is a recessed ivory panel ruled in green, not a green block.
- The Development link reads on the canopy.
- The Ask question is set in the serif, without the mockup's spark tile (owner:
  no stock AI marks).
- The phone eyebrow returns to green on ivory; mint is used on the canopy only.

## 2026-10-07 — Large-title header on the canopy

CoachHelm opens on the canopy:

- **Header:** the role as a mint eyebrow, then a serif CoachHelm title and the
  live line. On desktop the view switch (Board/Ask, or the player's views) sits
  level with the title instead of on its own row.
- **Program pulse:** a serif title, seams between rows and round raised icon
  keys. Its reserved height applies only while the pulse is streaming, so a
  short pulse no longer leaves empty space.
- **Focus card:** the insight title is set in the display serif.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

## 2026-10-06 — Mention picker accessibility

The desktop Ask mention list gives the option role to each clickable row,
without a nested interactive button under another option. The text field
identifies the active option while arrow keys move through the roster.
Mention insertion and sending remain unchanged. Verified with the existing
mention interaction tests and the popup browser audit on PR #2155.
Physical VoiceOver acceptance remains open.

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

Streaming follow-scroll is scheduled once per browser frame and canceled
when superseded. It rechecks reader position and scrolls instantly. Sending
uses instant scrolling with reduced motion and smooth scrolling otherwise.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 4 mapped
actions and 8 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p013-coachhelm). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
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

## 2026-10-02 — History drawer uses stable modal and pointer lifetimes

```text
PR/commit:      codex/clubhouse-design-fidelity (pending)
Design package: approved boards; bars and dismissal policy unchanged
Contract IDs:   CH-13621, CH-13822
Data impact:    none; client dialog/scroll/focus/gesture lifecycle only
Held items:     physical iPhone keyboard and gesture validation
```

History now shares the native dialog lifetime and the directional drag helper.
Only the initiating primary pointer owns the drag; pointer cancellation/unmount
removes listeners. A short left drag held still before release springs back
instead of reusing old flick velocity. Closing retains the drawer and page lock
through its transform exit.

When the keyboard is open, the History drawer uses the available height so its
searchable history stays above it.

Targeted checks: 351 tests pass across the final focused runs; scoped ESLint and
diff check exit 0. Runtime evidence is recorded in this page's VERIFY entry.

## 2026-10-01 — Layered board cards on the phone

```text
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Design package: Coach home dashboard redesign (6), mobile boards
Contract IDs:   none changed
Actions:        none
Data impact:    none; layout and material only
Held items:     real iPhone Safari device verification
```

The focus, program pulse and proposal cards use the shared layered sheet
surface. The program pulse gains a little breathing room around its evidence.
Existing evidence summaries and the horizontal player selector retain their
behavior.

Verified in Playwright WebKit with iPhone 13 emulation at 375, 390 and 430px:
the document stays within the viewport and Instrument Sans is loaded. Before and
after captures at 390px are logged in VERIFY.md. This verifies layout, not
physical iPhone scrolling performance or live database data.

## 2026-10-01 — Aesthetic audit: a two-line metric label takes caption leading

```text
PR/commit:      agent/swap-audit (#2111): 6f5f08123
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** The evidence chart's metric label ran at line-height 1.0; on a
  phone it wraps ("Downhill penalty vs level putts (distance-controlled)", 286px
  at 390px) and the two lines touched.
- **Fix.** `coachhelm.css`: `.ch-hl-ev__l` is 12.5px at 1.3. Nothing in
  `src/lib/coachhelm` or any data path changed.
- **Not done, on purpose.** The Program pulse card keeps its reserved height (a
  performance rule: nothing below moves when the rows land); the three
  filter-chip languages are Q-148.
- **Contrast pass (`d4367ee`).** The Board and Ask switch and the player views'
  labels were 4.1:1 on the well (shared `.ch-seg__b`, secondary ink now).
- **Verification.** Before and after at 375, 390, 430 and 1440, coach and
  player. `coachhelm-views.test.tsx` 22 of 22.

## 2026-10-01 — The CoachHelm gate reads in two round trips

The gate (`src/lib/coachhelm/v2/gate.ts`) stood in front of every CoachHelm
view and read in turn: the coach row, the coach's settings, the staffed
teams, then each team's settings. It is shared with Fairway, the chat route
and the actions, so its answer must not change.

```text
PR/commit:      agent/swap-audit (its own commit: "coachhelm gate: the reads
                that do not depend on each other start together")
Contract IDs:   none changed
Data impact:    none; the same tables, the same filters, read-only
Held items:     none
```

- **What changed.** The row, the settings and the staffed teams (a player's row
  and memberships) start together; every team's settings come in one read
  (`.in('team_id', ids)`; `team_id` is unique on
  `golf_team_coachhelm_settings`). A coach gate is two round trips, not four; a
  closed gate with three teams was six reads in turn and is four reads in two.
- **The answer is the same.** `gate-batching.test.ts` runs the batched gate
  and `gate-serial.reference.ts` (a frozen copy of the serial one) over the
  same fake database in every combination of each read's outcome (the row
  found, missing or failed; the settings enabled, off, off with no reason,
  missing or failed; no teams, a failed staff read, or one to three teams each
  enabled, off, off with no reason, null, missing or failed): over 1,000
  worlds, equal in every one. It also states the rules outright: a failed row
  is never enabled (LIVE-17), a missing row is the enabled default, a coach
  who switched it off is off before any team is looked at, a gate is off only
  when every team is, and it names the first reason given.
- **A read nobody needed is dropped unseen.** The settings of a coach whose
  row is missing are started anyway; their result, or their failure, is
  ignored, and a rejection nobody awaits is handled (a test pins it).
- **Left as it is, and worth a decision.** A failed read of a team's settings
  reads as "enabled" (`error || !data` is null, and null is the enabled
  default), in the serial version and in this one. Only the coach or player
  row fails closed. A batch that fails answers the same for every team it
  covered as each failed single read did, so the answer cannot differ by
  one team succeeding and another failing; it can differ from the serial
  version only on a transient failure that hit the batch and would have
  missed every single read, which the rule above already treats as enabled.
  Whether a failed team read should close the gate is the owner's call: it is
  a product and safety decision, not changed here.

## 2026-10-01 — Owner rules: a failed read is never an empty page

Owner, 2026-10-01: never show 0 strokes, "No rounds yet", "no insights" or an
empty table while loading or after a failed read; separate first load, refresh,
empty, error and a refresh that failed over old data; a stale response never
wins; the board frame and the top card first, the rest streams; a back
navigation returns to what the list showed. Standard:
`docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit (phase commits, see the list below)
Design package: none (notices reuse InlineNotice; no new surface)
Contract IDs:   CH-13206, CH-13207, CH-13208, CH-13226, CH-13272 (new);
                CH-13221, 13223, 13309, 13322, 13325 reworded
Actions:        none
Data impact:    none; no write, no cache, no new table. The reads are the
                ones the page already made; each now says when it failed
Held items:     none
```

### Phase 1: false empties and silent degrades

- **Ask roster.** `loadActiveRoster` swallowed a failed membership read and
  answered `[]`, which Ask drew as "Add players". `loadActiveRosterResult`
  says it failed, the chat context carries `roster_failed` (absent when the
  read landed, so Fairway is unchanged), and the loader answers the context
  failing (CH-13221, Try again). An empty roster that read is still the
  first-run page.
- **Program pulse.** Supabase answers a failed read as `{ error }` and does not
  throw, so `safeRows` and `safeCount` read it as no rows: a failed rounds read
  became "N players have no recorded rounds", "Nothing to report yet" and an
  empty opener list. `ProgramPulse.failed` now names the reads that failed
  (absent when none did; `items` and the counts are what they were, Fairway
  reads them). The Clubhouse layer drops an item made from a failed read,
  says what is missing (CH-13206 on the board, CH-13226 on Ask) and says
  "Nothing is flagged" (CH-13309, CH-13325) and "Nothing to report yet"
  (CH-13322) only when every read landed. A rounds read that failed leaves the
  coverage line and the counts behind the openers unused ("Brief me" still
  shows). The phone Ask Home, which draws no findings, now says when the pulse
  did not load (CH-13223).
- **Pulse over a roster that did not read.** The pulse resolves its own chat
  context, and when the membership read fails that context's roster is empty:
  `getProgramPulse` answers an empty program with no `failed`, which the board
  drew as "Nothing is flagged" (CH-13309). `pulseOf` now reads the
  request-cached context beside the pulse and answers the pulse not loading
  (CH-13203, logged as `pulse`) when `roster_failed` is set. A roster that read
  and is empty is unchanged, and so is what Fairway's callers get.
- **Dead retry.** Ask copied the chats list into state once; History's Try
  again re-ran the server render, but the key did not change and the copy was
  never replaced, so "your chats didn't load" stayed up. The list is now the
  server's, read each render; a chat started in this visit is kept beside it
  until the server's list holds it.
- **Reads beside the top card** (`ChBoardMissing`, present only when one
  failed) are each a decision, in the table below and the notes after it.

| Read | On failure we show | Before |
| --- | --- | --- |
| Drills | CH-13208, drill text missing | a short card |
| Assigned | coach CH-13207, no Assign | Assign offered |
| Declined | coach CH-13207, no Assign | Propose again hid |
| Newest round | CH-13208 and CH-13207 | a clean board |
| Tour values | CH-13208, comparison gone | "no comparison" |
| Deep dive team | CH-13208 on the page | ignored |
| Standing cohort | CH-13272 over the rows | men's Tour, as fact |

- **Why, per read.** Drills: the name and length stay, the text is said to
  be missing, and nothing else depends on it. Assigned and declined: "nothing
  is assigned" is not what a failed read says, so neither Assign nor Propose
  again is offered and neither claim is made (Dismiss stays: it depends on
  neither); the player's board and the Deep dive have no Assign, so they say
  it as CH-13208. Newest round: a clean board and the open-signal counts were
  drawn over reads that may be stale; CH-13906 already withholds Assign for a
  stale read, and an unknown one is held back the same way. Tour values or
  the team they come from: the card keeps what it has, says the comparison is
  unavailable, and a strength may read as a finding without it, which the
  notice says.
- **Tour read.** `loadTourBenchmarks` (Stats, not this page's) logs a failed
  read and answers the same empty map as a tour with no rows, so the Tour's
  values are read in `coachhelm.ts` with their error.
- **Standing cohort.** It is probed beside the standing read
  (`loadPlayerStandingMap` resolves it inside and cannot say it fell back, and
  `standing/loader.ts` is not this page's): the two lookups can disagree on a
  transient failure, so the probe catches a failing lookup and is not a proof
  of the one the map used. The men's fallback stays for the generators and
  the nightly job, now marked `failed`.
- **Tests.** `coachhelm-failed-reads.test.tsx` fails each read through
  `supabase-fake` (the assigned read alone, the declined read alone, and so
  on) and asserts the failure copy, never the empty or zero copy, and never
  Assign; `program-pulse-failed-reads.test.ts`, `chat-roster-failed.test.ts`,
  `player-cohort-failed.test.ts` and `coachhelm-ask-races.test.tsx` (the retry)
  cover the library and the Ask frame.

### Phase 2: pending scope and races

- **Pending is one player's.** The write hooks are hook-wide (`useAction`'s
  in-flight guard is one ref), so while Jonah's Assign ran, Eli's card read
  "Assigning" too. The player a write is for is now set inside the action
  (so a toast's Retry sets it too) and only that card says "Assigning",
  "Dismissing" or "Undoing" (CH-13403). Another card, opened meanwhile, shows
  its own button as it is, disabled: one write is in flight at a time, and a
  tap on it would be dropped as busy. Proposal rows were already per row.
  Changed by design: the CH-13403 catalog row says so; no assertion changed
  (the existing tests check the card the write is for).
- **Retries.** Every Try again on these pages is `RefreshNotice`
  (`useRefresh`): it says "Trying again", is disabled while it runs and
  ignores a second tap. No screen calls `router.refresh()` bare any more
  (`coachhelm-retry.test.tsx` renders each failed state and retries it, and
  greps the screens). The `onRetry` props that carried it through Proposals,
  History, the Ask home and the Deep dive's parts are gone.
- **New chat during a send.** New chat (all three entry points: the panel,
  the phone's header, the thread) now stops a reply that is on its way first,
  and the id that arrives late for the chat that was left is not adopted: the
  frame keeps which send is waiting for its chat's id, and an id for any other
  does not move the address, retitle the new chat or list anything. A chat
  left by opening another is the same (the replaced frame ignores it).
  Residual, in code this page does not own: the hook's own `conversationId`
  can still take a late id after `newConversation()`, so a question asked in
  the new chat would go to the abandoned one. The stop makes this window the
  few microtasks between the header arriving and the click; it is not closed
  from this side without editing `components/golf/coachhelm/**`.
- **A name over another's card.** The coach board and the player board kept
  the picked player or read by id and fell back to the first player or the
  default focus when it left the data after a refresh, in silence. They keep
  the name too, and say so (CH-13908, CH-13909).
- **Rapid switching.** `view-switch-boundary.test.tsx` taps Board, Game
  profile, Standing and Deep dive through the real tabs and `useViewSwitch`:
  the tabs follow the last tap, the view on screen stays busy, an earlier
  choice that lands late changes nothing, and a tap back to the view on screen
  sends the page back to it.
- **Left alone.** History is not team-scoped (a coach on two teams sees both
  teams' chats): a documented product question, unchanged.

### Phase 3: the board and the top card first, the pulse streams

- **The pulse.** It was a chain of seven reads that only the pulse card used,
  yet the loader awaited it before it answered, and before every early return.
  `loadCoachCoachHelm` now hands it over still on its way
  (`ChCoachHelmData.pulse` is a `ChPulse` or a `Promise<ChPulseResult>`: `ok`
  with the pulse, or `failed`; it never rejects, `handled`, and a read that
  threw is logged and drawn as the pulse not loading, CH-13203).
  `CoachBoard` reads it with `use()` in the card's own `<Suspense>`; the board
  waits for seven reads in a row (the gate, then four) instead of ten
  (`coachhelm-reads.test`). The early returns (a roster or players that did
  not read) hand it over too, so a failure notice no longer waits for it.
- **A card that holds its place** (CH-13405). The slot under "Program pulse"
  keeps the height of three rows, whether the skeleton, the rows or a notice
  are in it, so nothing below moves when the pulse lands: zero shift for the
  desktop's six items in two columns. Cost, for the owner: a pulse of one or
  two items sits in a card with room under it, and a phone's single column
  past three rows grows the card, which is the one case that shifts.
  Moving the card under the top card would end the shift for good; it is a
  change to the board's order and is not done here.
- **Never a false empty while it loads.** The skeleton is not "Nothing is
  flagged"; that line (CH-13309) is only for a pulse whose reads all landed.
- **Exposure.** The delivery actions (`getTopInsightsForPlayers`,
  `getInsightsForPlayer`) record what they return as shown. The pulse was
  never one of them and starts after the gate as before. A render test counts
  calls: once per render, after the gate answered, none for a board that is
  off, and the pulse landing adds none (`coachhelm-streaming.test`).
- **Not done, and why.** Player Proposals: its read is in the same wave as the
  top card's other reads (drills, assigned, newest round), so streaming it
  saves no depth, and it draws above the focus card, so a late arrival would
  push the card down. Ask: the pulse feeds the new-chat page's greeting, the
  pills, the coverage line and the findings, and the chats list is one wave
  beside the thread; splitting them would reshape `ChAskData` and its
  fixtures for no depth won, so it is left as it is.
- **Assertions changed by design.** `coachhelm-reads.test`: the board's depth
  10 became 7 (the pulse is no longer waited for) and the pulse's hops are
  excluded from the count; `coachhelm.test` reads the pulse the loader hands
  over by awaiting it (`pulseLanded`) in three assertions (the same rows and
  flags as before).

### Phase 4: Back returns to what the coach or player had picked

- **Kept for the tab, never written to the address.** The coach's board keeps
  the player picked, the player's board the read picked and the Deep dive the
  read open, each in the shell's `useChSessionState` (tab scoped, keyed by
  route and team, so Back, or another view and back, returns to it). The
  screens do not touch the address or the history at all. The first version of
  this phase (`4bf4c16f9`) wrote the pick to `?player=` and `?insight=` with
  `history.replaceState(window.history.state, ...)`; a review found it wrong
  and this follow-up replaces it. Next's patched `replaceState` skips its
  router sync when it is handed an entry's own `__NA` state (`app-router.js`),
  so the router's canonical URL never learned the parameter: the next
  `router.refresh()` (every Try again) or revalidating action (Assign,
  Dismiss, Undo, Accept, Decline) navigates to the old canonical URL, which
  resets the address and can push a second history entry. `url-state.ts` is
  deleted.
- **`?player=` and `?insight=` are read-only inputs.** They arrive as the
  props the route makes from them (`initialPlayer`, `initialId`). One named on
  arrival wins over a kept pick, as a link from Roster must, and it is looked
  up every render, not once: a first load that failed or came back empty,
  then answered by Try again, still opens on the player or read named. With
  none named the kept pick returns. A pick by hand stands until the server
  hands down a different value (a new link is a new opening). A value that is
  not on the page is ignored. The route hands `?insight=` to the Deep dive
  only (the player's Board no longer takes it), so a view switch, whose tab
  links carry none, cannot open the next view on the last view's read.
  Known: Back to an entry that was opened with `?player=Eli` reopens Eli, not
  a later pick by hand, because a link and a Back cannot be told apart.
- **Hydration.** Every view sits in the route's one Suspense, so a hard reload
  can hydrate one after `RouteFrame` has marked the app running, which is
  when `useChSessionState` reads storage: a kept pick would be drawn over
  server markup made from the default (a hydration error, reproduced in
  `coachhelm-return-state.test`). The three views mask the kept value with
  `useHydrated` (`useSyncExternalStore`: the default during the hydration
  pass, the kept value in the render React does straight after, and from the
  first render on a client navigation, so nothing flashes). The hook itself
  is the shell's and has the same hole for every other page that uses it.
- **The phone's pushed read.** A kept read that was open comes back open (the
  pushed screen); the screen's own back closes it and forgets it. Known: a
  return after leaving from inside the open read pushes a second history entry
  (`usePhoneStackHistory` starts at zero and the entry it restored already
  stands for the screen), so one more Back is needed; that is the shell
  hook's, not changed here.
- **Ask.** The unsent message is kept in this tab per team, coach and chat
  (the new chat is its own), cleared by a send or an emptied box, and moved to
  the chat's own id when the new chat gets one (`chat/drafts.ts`, precedent
  `messages/drafts.ts`). New chat leaves the chat it was typed in with its own
  draft and the box shows the new chat's: the text is not carried across (the
  box used to keep it). The History search and the chats panel are kept the
  same way (`useAskKept`). All three are restored in an effect after mount,
  never during the render, for the hydration reason above. The phone's chats
  drawer is a modal and is not kept.
- **Known limit, Ask's `?c=`.** Ask names a new chat in the address with the
  same `replaceState` call (`chat/Ask.tsx`, CH-13922, which predates these
  rules), so it has the same router blind spot: a `router.refresh()` (the Try
  again of History or Home) or a revalidating action after a chat was started
  can reset the address to the one Next knows and may push a second entry. Not
  changed here.
- **Scroll is the shell's.** `RouteFrame` records `#ch-canvas` and the window
  per route and team and restores them on Back or Forward (the lead's, commit
  e9b833761), so this page adds no scroll code: a second restore would race
  the shell's. Not covered by it: the Ask thread's own scroller and the
  Deep dive's phone screen scroller.
- **Assertions changed by design.** None remain from this phase: the address
  resets it first added to `coachhelm.test`, `coachhelm-dive.test` and
  `coachhelm-selection.test` are taken out again, as nothing writes the
  address now. `coachhelm-return-state.test` is rewritten for the session
  state (it passed for the wrong reason before: it read back the address the
  screen had just written, and a remount at the same address stood for Back).
- **Not verified in a browser.** Next's `replaceState` behaviour was read in
  `node_modules/next/dist/client/components/app-router.js` (Next 16.3.6), and
  the screens no longer rely on it; Back, a hard reload with a kept pick and
  the phone's pushed read were exercised in jsdom only.

## 2026-10-01 — Page performance: reads in parallel, a view switch that keeps the view

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate." Standard: `docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit: 81ce79e83 (reads), ae0e78355 (view switch
                and route), plus the skeleton strip and these docs
Design package: none
Contract IDs:   none changed (no state added or removed)
Data impact:    none; no write, no cache, no new read
Held items:     none
```

- **Reads.** The coach's board went from 13 serial waves to 10
  (`coachhelm-reads.test`, each wave a round trip): once the gate has answered,
  the program pulse (a chain of seven) and the team's Tour start beside the
  roster and are waited for last, and the follow-up reads do not wait for
  them. The Deep dive went from 10 to 5: the team, the plans and the category
  reads start with the feed instead of after it.
- **Never early.** The delivery actions record every insight they return as
  shown, so the feed and the top insights are still read once, after the gate,
  and a board that is off reads nothing else (both pinned).
- **One Suspense.** Board, Ask, Game profile, Standing and Deep dive are one
  async view inside one `<Suspense>` that is not keyed by view. The old key
  drew the next view's skeleton over the view on screen, after waiting for the
  CoachHelm gate to show even that. Now a switch keeps the view on screen,
  dimmed and not tappable, and replaces it once; the skeleton is for a hard
  load, and is the one the address names (the route's `loading.tsx` cannot see
  `?view=`). The gate is read inside the boundary.
- **The strip.** The tap moves it at once (`useViewSwitch`, the F-55 pattern:
  `useTransition`, the target held until the server answers, `aria-busy` on
  the page) and the header stays crisp. Choosing a saved chat in Ask is the
  same switch: its row takes the selected look at once (a click for a new tab
  is still the link), the conversation dims and the list of chats stays
  crisp, until the thread lands. The route skeletons now draw the strip's
  place and height (38px desktop, 44px phone); before, it arrived with the
  page and pushed everything under it down.
- **Not cached, not prefetched.** A server cache here cannot be shown
  correct: the delivery actions write as they read, the reads go through the
  signed-in user's own session, the standing is rewritten by a nightly job
  that has no tag to invalidate, and the writes that change a board (Assign,
  Dismiss, a regenerated insight, a round submit) are spread over both UIs.
  Prefetching a view would run those loaders and count insights nobody saw, so
  the strip prefetches nothing: Next's own prefetch stops at the loading
  boundary, which this page is already inside.
- **Left, for a decision.** (1) The CoachHelm gate is three to four reads in a
  row (`lib/coachhelm/v2/gate.ts`, shared with Fairway), a third of the
  board's remaining depth; it can read the coach and their settings together
  and every team's settings in one query, with the same answers. (2) The pulse
  could stream behind its own boundary, but its height is one line or up to
  three rows, so a skeleton cannot match it and the board below would move;
  that needs a reserved height or a new place on the page. (3) Ask reads the
  pulse (twelve reads in a row) only to draw its new-chat page, and "New chat"
  after opening a thread needs it, so it cannot simply be skipped.

## 2026-10-01 — Assign starts from the player's value; a decline shows; only drawn cards count

Swap audit CH13-22, CH13-23, CH13-21 and CH13-8.

```text
PR/commit:      agent/swap-audit (#2111): 39270df3b, 22a26ff00, 5107895ee
Design package: none
Contract IDs:   CH-13907 (new)
Actions:        createFocusAreaFromInsightV2 takes currentValue;
                getInsightsForPlayer takes `drawn`
Data impact:    a new focus area made from a card carries its starting
                value; exposure rows only for drawn cards
Held items:     Q-124 (test rounds in the stored cache)
```

- **Starting value.** Assign as focus sends the player's value for the
  metric now; the focus starts there (owner: starting value only, no target).
- **Declined.** When the player declined a focus made from the top card and
  none stands now, the button reads Propose again and a note says the player
  declined it (CH-13907).
- **Shown.** The player board and Deep dive record exposure only for the
  cards they draw; a card that states no finding is no longer counted.
- **Round sets.** Every live card names its window and sample (CH13-9);
  nothing new to build for CH13-8.
- **Checked.** CoachHelm suites 555/555; `insight-delivery-drawn-exposure`
  2/2; `development.team-id` for the server half.

## 2026-10-01 — The player's Game profile, Standing and Deep dive (F-04, Q-76)

Owner, 2026-10-01: "coachhelm for player you can build but be detailed."

```text
PR/commit:      agent/swap-audit (#2111): 28f83d3a8 (Game profile and the
                sub-navigation), a657a7d15 (Standing), 438781162 (Deep dive),
                c34d3046c (contrast and tap-area fixes, docs), adc9c8320 (what a
                gap is closed to; movement units)
Design package: none (no owner board for these views; the phone layouts are a
                draft built on the phone grammar, DESIGN.md)
Contract IDs:   30 new Bridge IDs, all CH-13xxx: CH-13260, 13270, 13271,
                13280 to 13283 (didn't load); 13360, 13361, 13370 to 13373,
                13380 to 13384 (empty, early, partial); 13460, 13470, 13480
                (loading); 13780 (haptic); 13860, 13880, 13890
                (accessibility); 13930, 13931 (sub-navigation); 13980 to 13982
                (the pushed read, ?insight=, a hypothesis). CH-13304 widened to
                every view. CH-1301 (not rebuilt) is no longer said by this page;
                130104 reworded
Actions:        none: the three views are reads, with no write path
Data impact:    none (reads of golf_player_genome, golf_player_standing,
                golf_player_stats_cache, the delivery feed, golf_rounds,
                golf_player_focus_areas and golf_goals; WIRING.md
                DATA-COACHHELM-VIEWS)
Held items:     none
```

- **Sub-navigation.** Board, Game profile, Standing and Deep dive are one
  radiogroup of views of the page on desktop and a row of chips on the phone,
  with a link out to Stats' Development. Each view is a real address
  (`?view=profile`, `standing`, `deep-dive`) behind the board's own switch:
  off is the board's page, and a gate lookup that failed is the view's
  did-not-load, never "off". `VIEWS_NOT_REBUILT` and its not-rebuilt page are
  gone from this route.
- **Game profile.** The genome as the shape of their game in words, then the
  seven measures, each on its own scale with its value, what it means, the
  confidence word and how it is measured. No radar and no 0 to 100 score; a
  value at the bound of its scale says it is a bound; a measure with too few
  rounds is locked, never estimated.
- **Standing.** Every tracked stat against the Tour (the LPGA's for a women's
  team) and the team, with the percentile in words, what closing the gap is
  worth in strokes a round (the shared counterfactual, five-round floor) and the
  three biggest. A comparison that cannot be made says why and is a dash.
- **Deep dive.** Every insight the Board draws, in full: what was measured, how
  it has moved, the rounds behind it, why (a cause is "Measured in your shots"
  or "Likely, not measured"), this week's drill and the focus area or goal it
  belongs to. A list beside the read on desktop; on the phone a pushed screen
  that the iOS back swipe pops. `?insight=<id>` opens on a read of the
  player's own.
- **Honest failures.** A failed read is never an empty page. The Deep dive's
  rounds, plans and category trends each fail on their own, in place, with Try
  again, and "In your plan" is a dash while plans did not load.
- **Checked** at `adc9c8320`. `coachhelm-dive.test.tsx` 65/65; every
  `coachhelm*.test.ts(x)` 13 files, 552/552 (exit 0); `npm run typecheck:fast`
  exit 0; `npx eslint` on the changed files exit 0; `npm run clubhouse:check`
  exit 0 (15 pages, 1351 Bridge IDs). An axe scan (WCAG 2.2 AA, with contrast)
  of the previews at 1280px and 390px over 11 Deep dive, 4 Game profile and 5
  Standing states, and the Deep dive's open phone read: no violations. It found
  and fixed amber text at 4.47:1 on the phone's darker ivory (now
  `--ch-chart-loss-on-tint`) and the chip row clipping its own tap area to 42px.
- **Not done.** The pages were not read against a live player session (the
  previews and the loader tests with fakes); no device pass or VoiceOver;
  `npm run build` not run (no `'use server'` file changed); the Fairway Deep
  dive's shot-analysis and what-if content and the Game profile's fingerprint,
  composite and trend cards are not rebuilt (DESIGN.md non-goals).

## 2026-10-01 — Undo keeps an acknowledgement; Assign tells the player

Swap audit CH13-14 and CH13-24.

```text
PR/commit:      agent/swap-audit (#2111): 024a7669a, f0c107d34
Design package: none
Contract IDs:   none new (CH-13003 Undo, CH-13001 Assign unchanged)
Actions:        reactivateInsight gains `undoing` ('dismiss' from Clubhouse);
                createFocusAreaFromInsight(V2) notify the player
Data impact:    none
Held items:     none
```

- **Undo.** Undoing a dismissal returns an acknowledged insight to
  "acknowledged" with its stamp; before, it came back active and unread.
- **Assign.** Assign as focus sends the player the "New focus area" notice
  and email, as a coach's proposal from Development always did. The link is
  Clubhouse's when the player's team is on Clubhouse (allowlist by the
  player's team, not the coach's session: `isClubhouseForTeam`).
- **Checked.** `reactivate-insight.test.ts` 3/3; `development.team-id.test.ts`;
  `gate-allowlist.test.ts` 6/6; `coachhelm.test.tsx`.

## 2026-10-01 — Development links open Stats; the Ask stream respects the gate; the program pulse counts total-only rounds (§14 D4, CH13-20, F-58)

```text
PR/commit:      agent/swap-audit (#2111): 5c4a9c33a, ffc5861cf, c7e24b4f9
Design package: none
Contract IDs:   none new (CH-1301 narrowed to profile, standing, deep dive)
Actions:        none
Data impact:    none; 114 Demo insight rows regenerated 2026-10-01
                (owner-approved, Q-125)
Held items:     the cache migrations (Q-124) still count test rounds; regenerate
                again after they are applied
```

- **Development.** `?view=development` (30 unread dev-plan notifications and
  their pushes) redirects to Stats → Development instead of the not-rebuilt
  placeholder.
- **Ask.** The chat stream endpoint returns 403 when CoachHelm is off for the
  team, not only the Ask tab.
- **Pulse.** The program pulse dates the team's latest round by the score
  rule (Q-123), so a team posting qualifiers as totals no longer reads "no
  rounds in 60 days".
- **Checked.** `coachhelm.test.tsx` 144/144; route tests; F-58 test.

## 2026-10-01 — Swap audit section 13: the card, its voice, its age

```text
PR/commit:   agent/swap-audit
Catalog:     CH-13903 to CH-13906 (new); CH-13302, CH-13305, CH-13806,
             CH-13901, CH-13923 (reworded)
Data impact: none written. One new bounded read of the player's completed
             rounds (golf_rounds, failure logged). Focus-area creators
             write team_id (new rows only; no backfill)
```

- **CH13-5.** The player's board read their proposals by
  `team_id = their team`, and Fairway's Add focus area and Ask CoachHelm
  wrote `team_id` null, so those proposals never reached them. The read
  is now `team_id is null or = their team`, and `createFocusArea`,
  `createPlayerFocusArea` and the legacy `createFocusAreaFromInsight`
  write the team. Rows already on file with null are readable now; none
  is backfilled (an owner follow-up).
- **CH13-7.** The "New focus area" bell row and email linked
  `/my-development`, which Clubhouse answers "not rebuilt yet". With
  Clubhouse on they link Stats, Development tab.
- **CH13-4.** "77 open signals across 7 players" counted every visible
  row. The header counts players with an open signal; a strength, a card
  that states no finding and an out-of-date read are not open signals,
  and the floor of one is gone. Ask's findings drop the pulse's own
  "N open signals" item for the same reason.
- **CH13-11.** "No clear preference", "no directional bias", "Driver is
  performing" and the collapsed par card are notes: no Assign or
  Dismiss on the coach's board, no number, absent from the player's.
- **CH13-12.** A strength is better than the comparison the card draws
  (the Tour where the generator carried a college cohort), and
  `deriveTone` no longer reads a missing comparison as zero.
- **CH13-13.** The coach's board names the player; the player's board
  drops the coach's "have the player". A focus area made from the board
  is saved in the insight's own words, which the player reads.
- **CH13-16.** An assigned or acknowledged finding wears Assigned or
  Acknowledged, not a fresh Priority.
- **CH13-10, CH13-9.** The read says Solid, Early or Thin; the sample
  uses the generator's own unit; each card says "As of".
- **CH13-20.** `?view=ask` and the Board and Ask strip respect the
  CoachHelm switch like the board.
- **CH13-3.** A read older than the player's newest completed round is
  marked Out of date (not hidden, nothing written), does not lead, is not
  counted and cannot be assigned.
- **Left.** The chat stream API has no CoachHelm gate of its own; the null
  `team_id` proposals already on file are not backfilled.

## 2026-09-30 — Accept and Decline on the player's board, and the Tour in place of the college cohort (Q-77, Q-88)

```text
PR/commit:      agent/clubhouse
Catalog:        CH-13004, CH-13005, CH-13205, CH-13404, CH-13704, CH-13807,
                CH-13902 (new); CH-13204, CH-13601, CH-13802 (reworded)
Data impact:    none written. New reads: the player's own proposed
                golf_player_focus_areas, the team's gender (golf_teams), and
                golf_pga_standards (reference data, readable by any signed-in
                user). No migration
```

### Accept and Decline on the player's board (Q-77)

- **Issue.** A coach's Assign as focus makes a proposal the player accepts, but
  the only Clubhouse screen with Accept and Decline was Stats Development; a
  player on CoachHelm, where the coach's assignment is most likely to be talked
  about, had no way to answer it.
- **Fix.** The player's board has a "Proposed for you" card above the focus:
  each focus area the coach proposed (the player's own `proposed` rows on their
  active team, newest first, with the insight it came from when that insight is
  on the page) with Accept and Decline, over the same `acceptFocusArea` and
  `declineFocusArea`. The answer confirms itself in place ("Started · title",
  "Declined · title"), a failure says what failed with Retry and keeps both
  buttons (CH-13004, CH-13005), a read that failed is its own notice rather than
  "nothing proposed" (CH-13205), and the coach's board never has either button.
  Stats' `ProposalAnswer` is not reused (its toast numbers and style are
  Stats'); the row is this page's own over the same actions.
- **Checked.** coachhelm.test 142/142; typecheck:fast clean for these files;
  eslint 0; 17 mutations of Accept, Decline, the proposals read, the notice and
  the preview's writes each fail a test.

### The Tour in place of "College cohort avg" (Q-88)

- **Issue.** Two generators (course-mgmt.ts and pressure-gap.ts) write a college
  comparison ("College cohort avg 0.6", value from
  `golf_player_standing.level_avg`), drawn as the gauge's comparison with the
  Tour beside it, and the reasoning quoted it ("College players in our data
  average ~0.6"). The owner's rule is the Tour, never a college benchmark.
- **Fix.** A college comparison (`cohort_avg`, or a division average) is drawn
  as the Tour's value for the metric from `golf_pga_standards.pga_tour_value`
  ("Tour 0.3"), for the team's own tour (the LPGA's for a women's team, "LPGA
  Tour 0.4"); the generator's own Tour tick beside it is the same number, so it
  is drawn once. Where the tour has no value for the metric, or the team's tour
  is not known, there is no comparison and no gauge (the sample and window still
  show), and the "College players in our data average" sentence is left out of
  the reasoning. Whether an insight is working is still the generator's call
  (its priority is anchored to its own comparison); only what is drawn moved.
- **Checked.** coachhelm.test 142/142 (the men's and women's tour, a missing
  value, an unknown team, a failed team read and a failed standards read, in
  both loaders); 9 mutations (the college source, the fallback to the college
  number, the LPGA label, the doubled Tour tick, the prose sentence and its
  specificity, the coach's and the player's tour) each fail a test; two more
  that changed nothing showed a redundant guard, which was removed.
- **Left, for the shared generators.** The generators' other college wording (a
  cold-start "top college teams stay under 0.5", "college typical is 2-5", and
  the women's-college "estimated target" comparisons on approach, putting and
  sand saves) and a women's team's cold-start "PGA Tour avg" (the men's value)
  are not this page's to reword; a women's cold-start Tour tick is the men's
  until the generators are moved (Q-93).

## 2026-09-30 — Phone tap targets

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player rows in the phone list were 38px tall.
- **Fix.** They are at least 44 tall (`coachhelm.css`).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px.

## 2026-09-30 — Assign as focus on a strength (Clickables gap 12)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Assign as focus on a strength (Clickables gap 12)

- **Issue.** Assign was hidden on a strength, though the board draws it on
  Theo's card; contract 130806 had been written from the code, not the board.
- **Fix.** CoachHelm offers Assign as focus on a strength (a keep-doing focus);
  130806 is reworded (Q-80, kept by the owner).
- **Checked.** coachhelm 112/112; the old hide fails the reworded test.

## 2026-09-30 — CoachHelm for coach and player, and the V2 page docs

```text
Design package: design/handoff/ v2 (Coach - CoachHelm.html, Player -
                CoachHelm.html, the Mobile board)
PR/commit:      agent/clubhouse, 8476314a7 (the build); the docs were written
                afterwards and not yet committed
Contract IDs:   130101 to 132301 (28 hand contracts, all reserved; 18 covered by
                a test, 8 partly, 2 not), plus the catalog's 32 (CH-13xxx,
                Bridge IDs 130201 to 131806)
Actions:        4 (ACT-P013-*)
Data impact:    none (reads through the delivery actions and existing tables;
                the three writes are the Fairway Brief's)
Held items:     none
```

### Changed (2026-09-30)

- The page: one route, `/golf/dashboard/coachhelm`, is the coach's board
  (program pulse, By player, the chosen player's focus with Assign as focus,
  Dismiss and Undo) and the player's board (one focus, Also worth knowing,
  Working, no write), desktop and phone, behind `golf_clubhouse_ui`. The
  loaders, the catalog (13xxx) and the phone spec came with it.
- The six page docs, the manifest's actions (`status.docs` current,
  `status.contract` complete) and the hand contracts: core view, the focus and
  the player order, the generator-only rule, the route skeleton, failed reads
  never drawn as empty, a failed gate lookup, offline, the role's controls, each
  side's own reads, the server actions as the gate (reserved: read, not run),
  the flag, when Assign is offered, success, the proposal, the existing-focus
  outcome, state kept, Retry, Try again, Undo, freshness, axe (reserved: not a
  unit test), the phone layout, the loader's rounds and observability.
- **The Fairway drills.** `?view=development`, `profile` and `standing` (where
  /my-development, /my-game-profile, /my-standing and the focus-area cards send
  people) show the shell's "not rebuilt yet" page (CH-1301) instead of the
  one-focus board, which they used to land on as if it were the view they asked
  for. `?view=insights` stays the board. The guard is `VIEWS_NOT_REBUILT` in
  `routes/coachhelm.tsx`, and the page passes `?view=` to the route (Q-76).

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour
  named, and every bug class the earlier passes found looked for here: a failed
  read shown as empty, a Retry that skips its follow-ups, a control drawn for
  the wrong role.
- Q-76 (open): falling through to the Fairway page for those views was rejected
  because it would draw Fairway inside the Clubhouse frame; rebuilding
  Development first, then Profile and Standing, is recommended.
- Q-77 (open): a coach's Assign as focus makes a proposal the player accepts.
  Accept and Decline are built on the player's side in Stats Development
  (CH-5003, CH-5004, CH-5404); this board still has none.

### Found, not fixed

- A coach's gate lookup failure draws "Nothing is flagged in the pulse right
  now." beside the roster notice: the loader returns an empty pulse with no
  error (130608).
- `?view=deep-dive`, a Fairway view, draws the board and not the not-rebuilt
  page (130104).
- `docs/clubhouse/phone/coachhelm.md`, "Open questions for the owner", predates
  the `?view=` guard and the Stats Accept and Decline.

### Verification (2026-09-30)

- See VERIFY.md.
