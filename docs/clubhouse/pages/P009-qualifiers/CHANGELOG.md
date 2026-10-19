# P009 — Qualifiers: changelog

## 2026-10-19 — Qualifiers: eyebrow, step strip, tracking, leaderboard, print

```text
Design package: none (complete-and-elevate plan, lane L6b)
PR/commit:      see git log (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-19, L6b)

- The list's eyebrow is the page's name alone. The filter pills already carry the active and concluded counts, so the eyebrow no longer repeats them, and when the counts failed to load it no longer reads "— active · — concluded" (the failure notice says so).

## 2026-10-18 — Pickers and controls: start and end date

```text
Design package: none (complete-and-elevate plan, lane L2)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, L2 pickers and controls)

- The browser's own date and time inputs are gone. Start date and End date (optional, with Clear; it opens on the start and cannot be picked before it) shows the value as the app writes it ("Thu 15 Oct 2026", "3:30 PM") and opens a month (dates) or a list by the quarter hour (times): a popover under the field on desktop, a bottom sheet on the phone. On desktop the field stays typable ("10/15", "oct 15", "tomorrow", "fri"; "3p", "1530") and says "Try 10/15, oct 15 or tomorrow." when it can't read what was typed. Today carries a dot, the chosen day is the segmented control's lit chip, days outside the range are off, and arrows, PageUp and PageDown, Home and End and Enter work in the grid. The saved value is the same `yyyy-mm-dd` / `HH:mm` string as before.
- Create qualifier stays lit while it works (Button's `busy`: aria-busy and no second press) instead of going unlit like a button that is unavailable.

## 2026-10-18 — Wave 10: the lede and a form with nobody to enter

```text
Design package: none (wave-10 first-run review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-09305
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-10 first run)

- The coach's lede says what a qualifier is: "Rank players over counted
  rounds and pick who travels." (it said head-to-head; the format is
  aggregate stroke play). The skeleton reads the same sentence.
- A form with nobody on the roster says so first, over the form (CH-09305),
  with Invite players (Roster's invite sheet); Create (and the phone bar's)
  is off, and the Players head reads "Nobody to enter yet", not "0 of 0".
- With no qualifier at all, the list's eyebrow is the name alone, not "0
  active · 0 concluded"; the phone, whose bar names the page, has none.

## 2026-10-18 — Wave 7: player qualifiers

```text
Design package: none (wave-7 player journey review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    reads only (own selection rows, round courses)
Held items:     none
```

### Changed (2026-10-18, player qualifiers)

- A live qualifier's next round for the player is a link to round setup with
  the qualifier chosen (`?qualifier=`): the dashed tile on the detail reads
  "Play round 3" with the round's own course, and the list adds "Play round
  3 · Hope Valley CC" under the live card, outside its link (CH-09906). None
  once the qualifier is past its last day.
- The list's standings mark the player: their row is lighter, with "You".
- Once the coach confirms the squad, the player's line says "You made the
  squad · 4th · +6" or "You're 4th · +6 · not selected" (CH-09907), from
  their own selection row. A failed read keeps the plain standing (logged
  as `ownSelections`).
- Two rounds tied on the best total: only the first is "Best round".

## 2026-10-18 — Wave 6: qualifier form and selections

```text
Design package: none (wave-6 coach workflow review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave 6)

- Form placeholders no longer print like values: the full-contrast block
  keeps them on the lightest ink, and the samples read "e.g. Pinehurst
  qualifier", "e.g. Finley GC".
- "Optional" is the shared `.ch-field__opt` tag (controls.css); the page's
  own `.ch-qf-optional` and `.ch-qf-label` are gone.
- End date can't be set before the start date (`min`); the check stays.
- Paired short fields (start and end, squad and picks) stay two-up on a
  phone: `.ch-qf-2` columns are `minmax(140px, 1fr)`.
- Squad size help says the limit: "Players who make the trip, up to 12."
- A round with no course of its own and no qualifier course reads "Choose
  one, or set the qualifier's course above".
- Manage selections: the stage note counts down the picks left ("Choose 1
  more coach's pick, with a reason, …") and says a missing reason.

### Added (2026-10-18, wave 6)

- Players head: one "Select all" (every active player) or "Clear all" (keeps
  a player with a round in or a squad place).
- Manage selections: while a pick is open, each player in the rest of the
  field has Pick, which opens the pick dialog with them chosen.

### Verification (2026-10-18, wave 6)

- WebKit (Playwright, dev preview; 320, 390, 1280): the name placeholder is
  `rgb(85 82 75)` against the value's `rgb(20 20 18)`; start and end, squad
  and picks sit two-up at 390 and 1280 (the desktop Travel squad pair, which
  stacked before, now does too) and stack at 320 (a 280px column), with no
  sideways scroll; Pick on Eli Brandt opens the dialog with Eli chosen.

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

- "Creating…" / "Saving…" (CH-09404), "Closing…" (CH-09405),
  "Reopening…" (CH-09406), and "Starting…", "Saving…",
  "Removing…", "Confirming…" (CH-09408); "Refreshing…" on the
  sections' Refresh.

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

- Phone text in `qualifiers.css` (list, detail, form, selection, rounds)
  moves from fixed px to `calc(N * var(--ch-type-k))`. Positions, to-par
  plates, the facts figures, the numbered round and step discs and the round
  scorecard stay fixed.
- Phone, for a large Text Size: the form's course-per-round rows take 4px
  above and below and a course name takes a second line before its ellipsis;
  the selection steps wrap to a second row instead of running off the well.
  None of it moves at the default size.

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): every Qualifiers preview state is
  pixel-identical to before at the default size. At XXL this sheet's change
  takes unscaled text from 54 to 15 on `qualifiers`, 68 to 26 on `qualifier`,
  51 to 12 on `my-qualifiers` and 56 to 28 on `qualifier-new` (the rest: the
  fixed figures, and shared badges, buttons and field labels). At 1280 the
  steps stay on one row and the course rows 48px.

## 2026-10-18 — Wave 3 accessibility: standings positions at body contrast

```text
Design package: none (wave-3 accessibility review, items 7)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, a11y wave 3)

- The live board's position numbers take `--ch-ink-500` instead of
  `--ch-ink-400`: the phone rows measured 2.99:1 in light.
- Round-by-round's sideways scroll region is named "Round-by-round scores,
  scrolls sideways", so it no longer shares its section's landmark name.

### Verification (2026-10-18, a11y wave 3)

- WebKit (Playwright, dev preview, `qualifier?q=live`): the weakest position
  number 5.87:1 at 390 light (was 2.99), 7.0:1 dark (was 4.38); at 1280 6.44:1
  dark (was 4.03).
- axe-core on `qualifier?q=live`, 390 and 1280, light and dark:
  landmark-unique 2 to 0. `npm run test:file` on `qualifiers.test.tsx`.

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
  title holds still between tabs. The detail page takes the same gutter and top;
  its title sits under the back link.

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

## 2026-10-18 — Wave 3: Concluded throughout, Also active under the hero

```text
Design package: none (wave-3 design review, items 9)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, status word and section head)

- A finished qualifier's status reads "Concluded", the list's filter and
  section word, where its badge said "Completed" (`model.ts`).
- Under the Active hero, the section of the other active qualifiers is
  headed "Also active"; with no hero it stays "Upcoming and live"
  (`QualifiersList.tsx`).

### Verification (2026-10-18, status word and section head)

- `npm run test:file` on `qualifiers.test.tsx` and
  `qualifiers-premium.test.tsx`.

## 2026-10-18 — Polish: your place reads as the Hub says it

```text
Design package: none (wave-2 interaction review rows 8)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, interaction review)

- My qualifiers: "You're 3" reads "You're 3rd" and a tie "T4" reads
  "tied 4th", as the Team Hub's standings line does.

### Verification (2026-10-18, interaction review)

- WebKit (Playwright) checks: focused vs blurred and hovered vs resting
  computed styles and crops, `scratchpad/w2-interact/`.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on the five
  existing `shell.css` findings (lines 3742-3821), none in this change.

## 2026-10-18 — Polish: the phone skeleton draws two figures

```text
Design package: none (wave-2 states review row 5)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, loading)

- Phone qualifier skeleton (CH-09402): two figures (Rounds in, Spots) as the
  page has since 2026-10-16; a third wrapped to a second row of the two
  columns (`QualifiersSkeleton.tsx`).

### Verification (2026-10-18, loading)

- WebKit (Playwright, dev server, preview fixtures) at 390: the figures 88px
  tall as loaded (was 151) and the leaderboard at 370 vs 370 (was 432).
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint.

## 2026-10-18 — Polish: whole names in the ellipsis, the ledger at 821–1000px

```text
Design package: none (wave-2 states review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, states review)

- Phone leaderboard: the name clips on its own span, so a long name ends in
  an ellipsis instead of being cut mid-letter by the flex row; "You" stays
  whole (`QualifierDetailPhone.tsx`, `qualifiers.css`).
- Desktop list on a canvas of 800px or less (821–1040px windows): a ledger
  row puts the name and status across the row with its link at the end, and
  the dates under them, where three columns left the name 93px.
- The list's notice ends "Try again; the error has been reported.".

### Verification (2026-10-18, states review)

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on five
  `shell.css` findings from commit 3730926bb, none in this change.
- WebKit (Playwright, dev preview): the list at 821, 900, 1000, 1024, 1100
  and 1280px; every title on one line, two columns up to 1024px, three from
  1100px. A 44-letter name on the phone board ends in an ellipsis on its
  span.

## 2026-10-17 — Polish: score column, dark board words, ranges

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (Clubhouse polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Selection rows: the score holds a "+10" width, right-aligned, so the rounds
  column before it stays put for −3, E or +10 (`qualifiers.css`).
- Dark mode: the board's status words ("Qualifying", "Bubble") and the Live
  stamp stay words; the dark tone fills had drawn a tight box behind them
  (`qualifiers.css`).
- A range outside this year says its year once: "Sep 22 – Oct 1, 2026", not
  "Sep 22, 2026 – Oct 1, 2026"; across a new year both dates keep theirs
  (`model.ts` `rangeLabel`).
- Tabular figures come back on 31 rules in `qualifiers.css` whose `font` shorthand
  reset `.ch-num` (counts, times, scores and facts in rows); display
  numerals keep their proportional figures.

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` reports five findings,
  all in `shell.css`, which this change does not touch. The WebKit pass is
  the coordinator's.

## 2026-10-17 — Standings checked against production

Parity pass on the standings (which rounds count, the score, ties, the cut, the
lifecycle) against what production serves: Fairway's live leaderboard
(`FairwayQualifierLeaderboard` with `useQualifierRealtime`), the selection
workspace its confirm commits from (`loadQualifyingWorkspace`), the unused
`getQualifierLeaderboard` action and `get_qualifier_leaderboard` function. The
board already counted the workspace's rounds in the workspace's order with its
tie at the cut; two Clubhouse differences are fixed
(`screens/qualifiers/model.ts`):

- **The Bubble is inside the squad.** `buildBoard` marked the first player out
  as Bubble too (`i <= squad`), drawn below the board's own travel cut, and with
  no coach's picks at all, when there is no place to contend for. It is now the
  places below the line on score down to the squad size, as Fairway's tiers and
  DESIGN.md have it. In production data this moved one row on five qualifiers
  (3cf7f129, b7fdd787, 8fe2c339, ec46521b, 86dad12b) from Bubble to out.
- **A round with no stored round number counts.** It was drawn as round 1 and
  then dropped as a second round 1 when the player had one; the workspace counts
  it. No production round lacks a number today. The round-by-round grid and the
  rounds panel still draw one round per number, so such a round would be in the
  total but not in its own column.

The board's round shaping moved into `model.ts` (`roundOfRow`, `countsOnBoard`)
and the loader reads `status` and `is_test` with each round and holds the same
rule after the query, so the tests run the loader's own shaping.

Kept, where production's live leaderboard is wrong (raised as questions;
WIRING.md "Standings parity"): it numbers ties 1, T2 and marks a tie on to par
alone, puts one of two players level at the cut in by stored order, counts test
rounds and a completed round with no total (as 0 strokes), falls back to the
stored entry aggregate, and averages 9-hole rounds with 18-hole ones. The
Bubble's ⌈rounds ÷ 2⌉ minimum (P009-C2) is the owner's and stays.

Tests: `standings-parity.test.tsx` (new, beside the Fairway leaderboard because
Clubhouse code may not import Fairway: the three real pipelines over one fake
database, 18 cases), and the `qualifiers.test.tsx` standings case, whose fourth
player of a squad of three is now out. A read-only run over every production
qualifier matched the workspace on all 19 qualifiers Clubhouse shows (score,
order, cut) before and after; the 3 test qualifiers are not shown. No visual
check is recorded.

## 2026-10-17 — Qualifier writes checked against production

Parity pass on the write paths (create, edit, close and reopen, the squad
selection) against Fairway's create, edit and CoachHelm qualifying workspace.
Every Clubhouse write calls the same shared action with the same arguments, so
the server's revalidation, notifications, logging and entry rows are the same;
no server action changed. Two Clubhouse differences are fixed:

- **A retired entry deadline no longer blocks an edit** (`QualifierForm.tsx`,
  `keptDeadline`). The form has no deadline field (2026-10-16), but an older
  qualifier can carry one, and both the form (CH-09104) and
  `updateGolfQualifierDetails` refuse a deadline after the start. Moving the
  start date before a stored deadline failed on a field the coach could not see.
  The stored deadline now rides along while it still fits and is cleared (sent
  as null) once the new start passes it; create sends none, as before.
- **Every refusal of the selection service has its own words** (`writes.ts`,
  `selectionReason`). A tie at the cut on Confirm read "Choose every pick, each
  with a reason", and the tie-place, scored-round and pick-slot refusals were
  unmapped or read as a roster problem. Each is mapped from the service's exact
  sentence; a workspace that would not read now says to try again instead of
  "may have been deleted".

Checked and unchanged (the full table is in the PR): D-61's squad and entrant
edits stay held behind the flag and the coach dashboard role before any read;
Close is offered at any stage, while Fairway only shows Conclude once the squad
is confirmed; no recorded decision covers this, so it is left as built and
raised as an open question; the squad cap of 12 is the database's (Fairway's
field allows 50 and fails at the database).

Tests: `qualifier-write-parity.test.tsx` (new: payloads of every live write,
each service refusal, the deadline), and two `qualifiers.test.tsx` assertions
that pinned the old wording. Not checked in a browser.

## 2026-10-17 — A coach on /my-qualifiers goes to Qualifiers

Readiness audit (2026-10-17): "My qualifiers" is a player's screen, and a coach
on `/golf/dashboard/my-qualifiers` stood on "not rebuilt". The page now sends a
coach to Qualifiers (`redirectToClubhouse`) and the address is on the frame's
aliased list. A player's My qualifiers is unchanged (checked in Chrome). Test:
`alias-frame.test.ts`.

## 2026-10-16 — Qualifiers: separate sheets, the active one in focus, full contrast

Owner, 2026-10-16: "better separation between qualifiers listed", "more contrast
on this page", "more focal on active qualifiers", "way more contrast on this
page". Three commits, all in `qualifiers.css` unless noted. No visual check is
recorded for any of them.

- **The desktop list** (above 820px): each qualifier is its own raised sheet on
  the parchment with a gap between, in place of the ruled ledger seams. Titles,
  the lines under them, the facts and the intro step up to full ink (the facts'
  icons are green), and the filter pills take ink when idle and the shared green
  chip when chosen (docs/clubhouse/CHANGELOG.md). The phone's list is unchanged.
- **The active qualifier is the list's focus** (`QualifiersList.tsx`): it sits
  under its own "Active" heading on a raised sheet with a green edge; concluded
  qualifiers are quieter (secondary heading, lighter sheets). The board in the
  active qualifier read "Leaders", which did not say it belonged to that
  qualifier; it reads "Standings · top N" now (`qualifiers.test.tsx` follows).
- **Full contrast in light mode**: the page takes a page-scoped step up. Text is
  one grade darker, and rules and borders use the Increase Contrast values
  (`.ch-qf` re-points `--ch-text-*`, `--ch-border-*` and the ledger rules). On a
  qualifier's own desktop page the facts, the leaderboard and the side sections
  sit on bright sheets. Dark mode is unchanged.

## 2026-10-16 — Thru as dots; qualifiers have no entry deadline

Owner, 2026-10-16.

- **Thru is a row of dots** (`ThruDots` in `parts.tsx`, desktop and phone
  leaderboards): one per scheduled round, green for each one played, centred,
  labelled "2 of 3 rounds" for VoiceOver. A qualifier of more than eight rounds
  keeps the figure ("2/9"), since a longer row of dots is not countable at a
  glance.
- **No entry deadline.** The owner says qualifiers have none. The fact is gone
  from the desktop facts (five left) and the phone's facts (two, now a
  two-column grid), and the field and its skeleton from the create and edit
  form. A stored deadline is left as it is, the database is untouched, and the
  CH-09104 check ("The entry deadline has to be on or before the start date.")
  and its catalog row stay, though the form can no longer set a value for it to
  refuse. CONTRACT 90102 and 91901 and the phone notes now count the remaining
  facts.
- **A player's rounds beside the leaderboard** (desktop only,
  `QualifierDetail.tsx`, `PlayerRounds`): a side panel on the scoreboard green,
  "Your rounds" or "{name}’s rounds", with the total to par large and one tile
  per round (course, date, score and plate). The best round is marked and an
  unplayed round is dashed. It follows the leaderboard row a coach opens,
  otherwise the viewer's own; a player sees only their own. It reads
  `board.rows[].rounds`, so there is no new read and no migration. The open row
  now lives in a small `useSyncExternalStore` store: lifting it into the page's
  state re-rendered the page and stalled the streamed sections (CH-09410). Its
  boundary is **CH-09223** (the commit named it CH-09216, which is already the
  qualifier form's boundary, so it was renumbered, on the phone too; the
  existing crash test now names it). Qualifiers vitest passed in the main
  session; no visual check is recorded for this panel.
- **A round opens in place** (`RoundsShowcase.tsx`, which now holds
  `PlayerRounds`, `RoundVisual`, `FieldStrip` and the open-row store): a round
  tile is a button that opens its detail under it. The round's rank in the field
  comes first, with every score as an anonymous dot on one line, this round lit
  and the average a tick. When the round has holes, a hole-by-hole shape against
  par is drawn as SVG, with the nines as score marks and counts by kind. A link
  goes to the whole round, `/golf/dashboard/rounds/<id>`. No new read.
- **The phone**: a player's own rounds are shown above the board, between the
  facts and the leaderboard (a coach opens anyone's from their row, which opens
  a sheet as before), inside the same boundary, CH-09223. The phone list takes
  the separate sheets and the green filter chip too. Checked by the main session
  in Chrome at 1567 and 420px wide; Qualifiers vitest passed; not checked on a
  device.
- **The ink ramp** in the page's contrast block is darker too, 700 down to 300
  (the same step CoachHelm and Ask took, see P013), so copy that names a mid ink
  directly reads darker.

## 2026-10-14 — A round with no tees says so

Course per round showed a blank beside a round whose tees and par were not set.
It reads "Tees not set", as the qualifier form does.

## 2026-10-12 — A section root on the phone (no "‹ More")

The phone shell's section strip replaced the tab bar and the More sheet
(docs/clubhouse/phone/section-strip.md). Qualifiers's phone top bar no longer
draws a "‹ More" back link: its title is a start title (`PhoneTop start`),
which the shell turns into the section switcher. The page's action, where it
has one, is unchanged. Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-12 — setup edits follow the dashboard role

The HELD squad-size and entrants actions open only when the gate is on for the
coach and the
dashboard layout's role (`getGolfDashboardRole`) is the coach's; with the flag
off they still
refuse before any read, and `verifyTeamAccess` still decides who may edit.

## 2026-10-10 — The leaderboard set as a tournament sheet

Owner direction (2026-10-10): the qualifier page is a leaderboard and should
read like one, in dark ink on the ivory page. A green panel
was tried and rejected as decoration. Presentation only, coach, player and
phone; rows, order, trays and states are unchanged.

- **Typography carries it:** a heavy rule over the title, no avatars, no plates,
  one hairline a row. To par is the loudest figure on the
  row (red under par); the position sits quiet beside the name; the leader is
  set bold; rows past the travel cut are set in the quiet ink.
- **Status is a word in its own ink**, not a pill: green for qualifying,
  gold-brown for the bubble.
- **The field's spread** is ink on the ivory (green coins qualify, a ring for
  the bubble, a dashed cut), no stage panel.

## 2026-10-10 — The field on one number line

Presentation only. Above the leaderboard (coach and player, once three players
have a round in): each player is a coin at their total
to par on a deep-green line (lower, better, on the left), the even-par line, and
a gold cut between the last player who qualifies on
score and the next. A coin's colour is its leaderboard state; a pointer reads
the name, place and score. It is drawn from the board's
own rows and top-score count, and the leaderboard under it stays the keyboard
and screen-reader route.

## 2026-10-08 — the rank slide runs on the smooth spring

- P009-B1: the moved rows' slide read `--ch-dur-spring-smooth` and
  `--ch-ease-spring-smooth` on view-transition pseudos that hang off `<html>`,
  where those tokens are not defined, so it ran on the browser's default timing.
  It now reads the `<html>`-scoped `--ch-dur-vt-push` and `--ch-ease-vt-push`,
  the same smooth spring (462ms) the phone push uses.
  `--ch-ease-spring-smooth` on view-transition pseudos that hang off `<html>`,
  where those tokens are not defined, so it ran on the browser's default timing.
  It now reads the `<html>`-scoped `--ch-dur-vt-push` and `--ch-ease-vt-push`,
  the same smooth spring (462ms) the phone push uses.

## 2026-10-08 — The live card's leaders are rows, not a board

Owner direction (2026-10-08): the card is no longer the default unit of layout
on the phone. Phone only; the desktop
hero keeps its scoreboard.

- **One green card, nothing nested:** the live qualifier stays the list's one
  feature card, and its three leaders are
  plain aligned rows on its green (position with its movement, name, to par)
  between faint seams. The to-par figures
  are bare tabular numerals instead of hung plates: under par in the board's
  lifted red (the same value as the board's
  to-par text, 4.5:1 on the feature green), even and over par in the on-green
  ink.
- **Loading matches:** the phone skeleton's to-par placeholder is a numeral's
  size (28 x 17) instead of a plate's.
- The filter pills, the search and the Ledger rows below are unchanged.

## 2026-10-08 — Premium pass: honest Live, standings on plates, rows that move only on a change, pace beside the total

Owner-approved items P009-A1, B1, B2 and C2
(docs/clubhouse/PREMIUM_PASS_AUDIT.md), with findings D1–D5, D10, D11 and D14:

- **Honest Live (B2, D1):** `useLiveStandings` returns the realtime feed's state
  (`feedReduce`). The board's chip reads "Live · updated 4:12 PM" only while the
  channel is SUBSCRIBED; on CHANNEL_ERROR, TIMED_OUT or CLOSED, or after the tab
  was hidden 5 minutes or more, it reads "Paused · standings from 4:12 PM" with
  Refresh, which re-reads the page and reopens a dropped channel. A channel
  error is still reported. The dot stays static (D-33). The time is stamped
  after hydration, by the chip alone.
- **Ended (D3):** a live qualifier past its end date reads "Ended · n rounds
  outstanding" in its status pill (list hero and cards, detail, phone), never
  Live. The loader stamps `today` as the date at UTC−12 (`endDayFor`), so a
  qualifier ends only once its last day is over everywhere; a fixture or test
  without `today` is not reconciled.
- **Plates (A1):** to par sits on a fixed-aspect ivory plate (condensed cell
  numeral; red only under par) on the desktop board, the phone rows and the
  list's live card; ties read "T3" with a raised T; movement since the previous
  round ("▲2", "▼1") is computed against the board with the latest round number
  left out (`ChQRow.move`). Nothing animates in. The phone board is one 56pt row
  a player under a header drawn once (D4).
- **Rows that move only on a change (B1):** when a refresh changes the ranked
  order (`rankOrderChanged`), each moved row slides to its new place inside
  React's `<ViewTransition>` (class `ch-rank`, the smooth spring). No digit
  rolling or count-ups (owner override of the spec's NumberFlow). Skipped with
  reduced motion or Animations off, within 300ms of a scroll, with a scorecard
  tray, sheet or dialog open (`useRankSlide`).
- **Pace (C2, D2):** the desktop board adds Thru and Avg; a ranked row with
  fewer rounds in than the most anyone has carries "1 of 3 rounds"; Bubble needs
  at least half the scheduled rounds in, rounded up (`bubbleMinRounds`: 2 of 3),
  and the caption says so. The ranking rule is unchanged.
- **Findings:** the Refresh and the desktop scorecards chevron are 44pt to a
  finger, as is Choose a player on the phone (D5; the pills and the phone action
  row already were); the form's description help reads "format and stakes" and a
  round with no course of its own names the qualifier's course (D10); list dates
  drop the year inside the current year (D11); the "Active" section is "Upcoming
  and live" (D14).
- Preview: `/clubhouse-preview/qualifier?q=live&state=paused | ended | reorder`
  (reorder refreshes to three more signed rounds after 2s).
- Tests: `src/clubhouse/__tests__/qualifiers-premium.test.tsx`.

## 2026-10-08 — States: a failed read keeps the head; one save failure, said once

From the states audit (2026-10-08, findings c14 and b8) and the lead's
decision on the save failure, desktop and phone:

- **The list didn't load (CH-09201, CH-09222):** the head stays, Create
  qualifier with it, and its counts read "— active · — concluded": never a
  zero, and on the phone never a blank eyebrow line.
- **A new or edited qualifier whose roster didn't load (CH-09208):** the
  notice, with Try again, now sits over the form under its head, where it
  explains why Create is off, instead of far down in Players. Players keeps
  the title alone, marking the gap.
- **A save the server refused (CH-09902, CH-09002):** told once, by the notice
  over the form, with the error haptic; it comes into view if Save was pressed
  further down. The toast that said the same words at the same moment is gone.
  A save whose request itself failed has no notice to tell it, so its toast and
  Retry stay.
- **The squad readout** wraps whole segments with a dot only between two on
  one line, so a narrow column never ends a line on "·".
- **Titles:** state titles have no trailing full stop in the source either.
- **Phone eyebrows** are 12px, the phone text floor (F09) and the kit's
  PageIntro eyebrow; the skeletons hold the new line.

## 2026-10-08 — Phone: the Mobile clubhouse pass

The phone Qualifiers follows the Coach Home board (round 3, "fewer
containers, one feature card"), carried to every phone screen (owner: "phone
too cardy"):

- **Heads:** the list, the form and Manage selections open on the engraved
  double rule, the eyebrow tracked in the board's brown, the title in the bold
  condensed sans (no serif, no regular-weight display titles). A qualifier's
  name is the same sans at 28px, under its status and dates.
- **The list:** the live qualifier is the screen's one green feature card: its
  status chip, name and dates in ivory, the three leaders as rows on the green
  (no green board inside a card), the player's own standing in gilt and the
  link at the card's foot. A press darkens it under a shade (CH-09601). Active
  and Concluded open under the double rule, their qualifiers rows on seams
  that tint under the finger. No match for the filters is centred with no box.
  The search keeps the kit's field, 36px drawn with a 44px reach.
- **A qualifier:** the three figures between two hairlines (the Ledger's figure
  row, each still drawn); the closed note flush between seams; the
  leaderboard, the squad, Course per round and Scoring rules each flush under
  the double rule. A leaderboard row sits on a seam and tints under the
  finger; its rounds, average and total are plain figures under the name, not
  a grey well. The viewer's own row keeps its tint.
- **The rounds sheet:** the chosen round's chip takes the raised face, which
  now fades in as the old one's fades out (CH-09603); a chip tints under the
  finger.
- **The form and Manage selections:** each fieldset and each list is a section
  flush under the double rule; the fields, the squad readout, the one-round
  note, the steps and the keys keep their material. A player in the form and
  a pick's player tint under the finger (CH-09601).
- **Loading:** the list and a qualifier draw the phone's own shape at the
  loaded lines' heights, so nothing moves when they land (a coach's list and
  qualifier, a player's list and /my-qualifiers, measured in WebKit at 390 and
  430: 0px). The list's lede is the reader's own
  sentence drawn as a bar under each of its lines, so it wraps where the
  page's does at any width, for a coach, a player and /my-qualifiers alike;
  Create qualifier is held only for a coach; then the live
  qualifier's place (its status, name, dates, three leaders and their
  caption, a player's standing and the link) and Active and Concluded under
  the double rule with their rows. A qualifier's skeleton holds the status
  and dates, the name, the entrants line, the coach's two actions, the three
  figures and the leaderboard rows, instead of the desktop's. The form drops
  the way back the phone never shows and draws its lede and each help line as
  its own sentence, then Basics, Schedule, and Course and rules down to its
  rounds and course (all a tall phone shows first); the parts below stay
  placeholders. Manage selections draws its note as the standings stage's
  sentence, the places on score and the rest of the field at four rows each,
  the picks and the foot's one key, and its steps no longer run past the
  screen. On the preview data both measure 0px at 375, 390 and 430 for
  everything on the first screen; real lists, picks or a later stage can
  still shift what sits below the note. The sentences come from model.ts
  (`FORM_LEDE`, `FORM_HELP`, `stageNoteText`), so the page and its skeleton
  can't drift apart. Each skeleton sentence is `aria-hidden` itself, so a
  screen reader hears only "Loading".
- **A qualifier's head and leaderboard:** the Live badge is centred on the
  leaderboard's heading, as on the board, so a live leaderboard's head is as
  tall as any other. Manage selections and Edit stay 36px drawn, with a 44px
  reach for the finger.

Desktop is unchanged: every new rule sits in the phone block, and the
skeleton's phone parts are hidden there. 1440 captures before and after differ
only where shared pieces changed in the same pass (the failed-read notice, the
skeleton's tone and ruled blocks) and in the form's dates, which follow the
day.

## 2026-10-08 — Server-action imports follow the golf.ts split

```text
PR/commit:      #2176, agent/phase-7
Design package: none
Contract IDs:   none changed
Data impact:    none
Held items:     none
```

The screen's imports and test mocks now point at the files that own the server
actions (qualifier-actions.ts) after `golf.ts`, `insights.ts` and
`admin-data.ts` were split by domain. No behavior change.

## 2026-10-07 — Presses answer; a row's scorecards drop into place

Pressing a status pill, a card or the live hero now answers with a deeper tint
over the press beat, never a scale: a pill darkens, a Ledger row takes the row
press tint, the desktop hero's title deepens to forest and the phone's live card
darkens its face (CH-09601). Opening a leaderboard row turns one chevron (base)
instead of swapping two icons, and the scorecards drop 6px into place as they
fade in (base) at their final values; closing is instant (CH-09602). A
leaderboard row presses with the row press tint. The list rows' hover tint now
eases (quick).

## 2026-10-07 — The Ledger: flush sections, sub-screens on the framed head

On desktop the Qualifiers pages sit on the ivory canvas instead of in cards
(owner: "flush, not so card heavy"). Phone layouts are unchanged.

- **List:** the live qualifier leaves its card and sits on the canvas beside its
  green leaders board, which stays. Its name is in the heavy sans and turns
  green on hover. Active and Concluded take a section heading over an engraved
  rule, and a row's hover tint reaches past the section's edge so its text stays
  on it. The head's eyebrow is engraved and its counts no longer gap, and the
  double rule under the head is one. On a narrow canvas the board moves under
  the qualifier instead of squeezing its name and dates. A player's row keeps
  its link at the right of the first line, with their standing under the row.
- **A qualifier, the form and Manage selections** take the framed page head
  (`data-canopy`, `data-canopy-head`): the shared `BackLink` above it, an
  engraved eyebrow, the heavy sans title, the sentence and the actions. A
  qualifier's status in its eyebrow is an engraved tag. The form's way back is a
  link now; with unsaved changes it still asks first (CH-09502).
- **Sections:** the leaderboard, round-by-round, Selections, Course per round,
  Scoring rules, the form's fieldsets and Manage selections' lists lose their
  cards: a heading over an engraved rule, the content flush. The two tables are
  flush, with a seam under each row and no header band, and round-by-round
  scrolls sideways when it is wider than its column. The facts lose the rule
  above them; the head's rule serves. A coach's pick no longer stretches its
  avatar and Pick badge across the row (desktop; the phone still does).
- **Kept their material:** the green leaders board, an opened row's scorecard
  tray, the form's fields, the one-round check and the squad readout, the steps
  strip, the notes and the status chips.
- **Loading skeletons:** `QualifierDetailSkeleton`, `QualifierFormSkeleton` and
  `QualifierSelectionSkeleton` take the same data attributes and hold the framed
  head line by line; their sections are flat, a heading placeholder over the
  rule. The list's head holds 170.6px.

  Measured in WebKit through `?state=loading` at 1440, 1300 and 1100: the heads
  of the list, a qualifier, new and edit don't move, nor do the tools, facts and
  form under them. Manage selections has no loading preview; its markup, drawn
  in place of the loaded page, holds through the lists' top at 1440 and 1300 (at
  1100 the note's sentence wraps, which the skeleton can't know). On the phone
  every skeleton bar is where it was.

## 2026-10-07 — Desktop facts drawn on the stat line; panel titles serif; the qualifier loads in place

- **Desktop facts:** the six facts leave their card and sit on the stat line,
  between gilt rules and divided by seams. Rounds submitted and Spots are drawn
  as on the phone, with the bar and seats shared as `.ch-qf-bar` and
  `.ch-qf-seats`.
- **Panel titles:** Leaderboard, Selections and Course per round use the display
  serif.
- **Loading skeleton** (`QualifierDetailSkeleton`): it now holds the loaded
  layout.
  - The head holds the eyebrow, the serif name, the sentence at its measure and,
    for a coach only, the three actions (`SkeletonCoachActions`).
  - The facts hold their four lines.

  Measured in WebKit through `?state=loading`: the head, facts and body tops
  don't move at 1440, 1300 and 1100. At 1000 a long description can wrap to a
  second line, which the skeleton can't know.

## 2026-10-07 — Phone facts drawn on the stat line

On the phone qualifier page, the three facts were bare numbers in a card. They
now sit on the stat line, between gilt rules and divided by seams, and two of
them are drawn:

- **Rounds in:** a bar of the rounds posted against the rounds due.
- **Spots:** the squad's seats. Seats won on score are filled green; the coach's
  picks are open gilt rings.

The deadline stays a date.

## 2026-10-07 — Phone qualifier name in the serif

On the phone qualifier page, the qualifier's name now uses the display serif at
32px, as the list's names do. Its digits stay in the sans (`SerifText`).

## 2026-10-07 — Digits in serif titles

Data-fed serif titles set their digits in the sans (shared `SerifText`; see the
cross-page log), so a name or title with figures reads cleanly.

## 2026-10-07 — Leaders on the scoreboard, ledger lists, serif titles

The live qualifier's leaders sit on the green scoreboard, a tournament board,
with ivory names, red under par and the top-score line in mint. Active and
concluded qualifiers are no longer grids of cards: each is a ledger row on the
page between gilt rules, separated by seams, with a tinted hover. The page title
and the live qualifier's name are set in the display serif.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

## 2026-10-06 — Course-picker loading accessibility

Course and tee loading containers now use status semantics, making their
accessible labels valid while the popup is waiting. Catalog IDs and course
selection behavior are unchanged. See [popup evidence](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 12 mapped
actions and 10 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p009-qualifiers). Approved handoffs and
contract IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-02 — Independent qualifier write verification

```text
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Design package: none; test structure only
Contract IDs:   91501, assertions unchanged
Actions:        none
Data impact:    none; no product code change
Held items:     CI rerun
```

CI timed out after 5,023ms while one test drove all eight qualifier write
scenarios through both success and refusal. The same aggregate test passed
locally in 2,076ms. Each scenario now has its own named parameterized test and
normal cleanup, retaining every refresh and navigation assertion and the
default timeout. No coverage was removed and no timeout was raised.

The full Qualifiers suite passed with one worker: 164 tests, 19.88s overall
(18.71s of test execution). The slowest new 91501 case was 347ms. The existing
streaming test emitted an unawaited-act warning; it still passed. CI remains
the check for behavior under the shared runner's load.

## 2026-10-02 — Shiro fix: leaderboard identity can wrap

```text
PR/commit:      codex/clubhouse-design-fidelity (working tree after cca081cff)
Design package: Coach home dashboard redesign (6), mobile boards
Contract IDs:   none changed
Actions:        none
Data impact:    none; CSS only
Held items:     physical iPhone Safari verification
```

Shiro fix mode found that the phone live leaderboard forced names onto one line
in fixed 32px rows. Full names now wrap, and rows grow instead of hiding part of
the identity. The inset leaderboard well and raised qualifier card retain their
depth.

In an interactive WebKit page, the controlled long-name probe measured 36.4px of
text in a 44.4px row at 375/390/430px, with no horizontal document overflow.
Active and All filtering both worked. The populated preview captures are logged
below. A development HMR ChunkLoadError occurred during rebuild; a fresh page
loaded with no console errors and passed the filter check.

## 2026-10-01 — Layered mobile cards and readable metadata

```text
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Design package: Coach home dashboard redesign (6), mobile boards
Contract IDs:   none changed
Actions:        none
Data impact:    none; layout and material only
Held items:     real iPhone Safari device verification
```

The mobile live qualifier and list cards use the shared sheet gradient.
Dates/course metadata use a 14px line with room to wrap, leaderboard rows gain
vertical spacing and list cards gain separation. Status counts, scores and
recorded-round totals are unchanged.

Verified in Playwright WebKit with iPhone 13 emulation at 375, 390 and 430px:
the document stays within the viewport and Instrument Sans is loaded. Before and
after captures at 390px are logged in VERIFY.md. This verifies layout, not
physical iPhone scrolling performance or live database data.

## 2026-10-01 — Owner rules for page states (P009)

Owner, 2026-10-01: never an empty or a zero for a failed or unfinished read;
loading, refreshing, empty, failed, stale and pending are different states;
the last choice wins; qualifier context and standings first, the breakdowns
stream; Back restores the list's filters and scroll. Standard:
`docs/clubhouse/PAGE_PERFORMANCE.md`. Rule 8 was first built here with its own
address and scroll code, then moved onto the shell's mechanism (the lead's
direction, same day): see "Filter, search and Back" below.

```text
PR/commit:      agent/swap-audit: cb1739fe9, 6dcbae1ff, dadc1f8e2, 112afa945,
                75df19425, 8d9d48f86, 43d50e341, 461d7cb1f (the rule 8 rework,
                adds screens/qualifiers/return-state.ts), and the review fixes
                commit after it
Design package: none (no new visual; placeholders reuse the page's classes)
Contract IDs:   CH-09220, CH-09221, CH-09222, CH-09409, CH-09410, CH-09904,
                CH-09905 (new); CH-09202, CH-09205, CH-09206, CH-09207,
                CH-09208, CH-09306, CH-09406, CH-09408 (reworded)
Actions:        none new; the tie row has its own action (qualifiers.chooseTie)
Data impact:    none: no write, no cache, no new table, no 'use server' file.
                The detail's reads are the same; the courses, tees and
                scorecards no longer hold up the first paint
Held items:     none
```

- **False empties (rule 1).** `/my-qualifiers` says its entries failed
  (CH-09222, with Try again) instead of "You aren't entered in any
  qualifiers", and its head carries no "0 active · 0 concluded". The hero says
  nothing about where a player stands when the standings did not load (it said
  "You aren't entered" or "no rounds in yet"). The coach's pick notes that
  did not load are named (CH-09221) instead of reading as "no notes". A
  confirmed squad whose entries did not load is the squad's notice (CH-09207),
  not a row of "A player". The form carries no "0 of 0 active players
  entered" while the roster failed. Every Try again on these pages goes
  through `useRefresh` ("Trying again", a second tap ignored).
- **Refresh failed, old data kept (rule 2).** A live `router.refresh` whose
  entries or rounds read fails keeps the last good standings of the same
  qualifier, with the courses and cards that came with them, and says "These
  standings may be out of date" with Try again (CH-09220), on desktop and phone
  (`useLastGood`). A recovered read clears it, another qualifier never
  inherits the rows, and a first load that fails is still CH-09203 or CH-09204.
- **Races (rule 4).** The course picker drops a slower answer for an earlier
  course, so the tees under a course's name are that course's. Manage
  selections no longer copies candidates from props into state: a landed write
  is laid over the server's read until the read shows it, or a second read has
  come in, so a refresh started before the write cannot undo it. Giving a place
  at a tied cut waits on that player's row only (its own action and "Saving"),
  and counts the give in flight against the places left. On the phone, Reopen
  keeps its sheet up while the server answers and says "Reopening" there.
- **Small.** Manage selections has its own skeleton (CH-09409): it drew the
  qualifier's facts and leaderboard. Creating or saving a qualifier replaces
  the form instead of pushing it, so Back from the qualifier does not return
  to a spent form (a Create there would make a second qualifier).
- **Streaming (rule 6).** `loadQualifierDetail` returns the core (the
  qualifier, its entries, rounds, squad and pick notes: what the standings,
  facts and squad need) after two waves, and `secondary`, a promise that never
  rejects: the round courses with their tees and pars, and the scorecards. The
  tees start when the round courses are in and the scorecards when the rounds
  are, not after the whole core; the privacy filter on scorecards is the same
  expression as before. The route passes the core as `data` and the promise as
  `secondary`; the Par fact, Course per round, an opened row's cards, the
  phone's round sheet and the round-by-round column titles read it through
  `Streamed` (`use()` inside its own `Suspense`) with a placeholder of the
  final size (CH-09410). A failed read, or a stream cut off in the browser, is
  that section's own notice (CH-09205, CH-09206), never an empty. This
  supersedes the earlier "left" note about the scorecards. A live refresh
  (`router.refresh`) is a transition, so the page on screen stays whole until
  the new render, streamed part included, has landed: the placeholders are the
  first load's and are never drawn over standings. The unit test renders new
  standings with a part that has not landed, which a transition would not
  show, so it does not prove the production behavior. No keyed Suspense or
  `useDeferredValue` was added: a new round paired with an old holes map would
  draw a false "No hole-by-hole card".
- **Filter, search and Back (rule 8).** The list's filter and search use the
  shell's `useChSessionState` (this tab, per page and team, never restored
  while the page hydrates), so they come back when the list is opened again,
  and not for another team or for /my-qualifiers (CH-09904). Nothing is
  written to the address, and the list keeps no scroll of its own: RouteFrame
  records each page's scroll per page and team and restores it on Back or
  Forward (CH-09905). What these screens add is a real Back. A qualifier
  opened from the list leaves a note in `sessionStorage`
  (`screens/qualifiers/return-state.ts`, the pattern of the Rounds library).
  The qualifier reads the note once, as it mounts, and spends it; its Back
  (desktop link, phone top bar, the not-found page) then steps back in
  history, otherwise it goes to the list's address. Manage selections does the
  same toward the qualifier (its link leaves the note) and hands the list's
  note back to the qualifier as it steps back, so the qualifier's Back is
  still a step to the list. A note is written by a plain click only, and a
  second tap on Back within a second is the first one's, so it cannot step
  back twice past the list.
- **Second review (same day).** An independent read of all the commits found
  two things to fix and some to tidy, each checked against the code first.
  (1) A failed refresh over a good board with no round in yet drew "Awaiting
  first round" with no notice, before the stale notice was reached: both
  screens now draw CH-09220 above it. (2) The Manage selections workspace
  loader (`lib/coachhelm/v3/qualifying/loader.ts`, shared with the Fairway
  workspace page and the tie and confirm writes) did not read the picks or the
  reasons error. A failed picks read came back as "nobody is selected", so
  `chooseTiePlace` counted `tie.chosen` as 0 and could give a place twice, and
  `confirmSelection` could rewrite a coach's pick as a top-score place. A
  failed qualifier, picks, reasons or rounds read now returns null. The callers
  were checked: the Fairway page shows not-found (as it already did for a
  failed qualifier or rounds read), the Clubhouse loader answers CH-09218, and
  both writes answer "workspace not loadable" and write nothing. (3) CH-09218's
  copy no longer says "Nothing has changed": the page also follows a pick or a
  confirm that was saved. (4) A Back note carries the time of the click and is
  ignored and dropped after ten seconds, so a navigation that never opened its
  page cannot send a later visit back. (5) Tidy: `return-state.ts` is marked
  `'use client'` (it exports a hook); a change the server already shows now
  clears an older opposite edit of the same fields in Manage selections, so a
  take-back is not masked by the give before it.
  Decision, left as it was: the detail's "last good" test (`board` loaded)
  ignores the picks and the notes reads, so a refresh whose picks read fails
  shows the squad card's own notice (CH-09207) rather than a stale squad. That
  notice is honest and the standings, which the stale rule protects, are
  unaffected.
- **Review.** An independent read of the first six commits found the phone
  scroll, a return mark that never expired, the unguarded per-key history
  writes and an edit that could linger over a server change. The first three
  went away with the rework above, which removed the list's own address
  writes, scroll keep and restore, and return mark; the edit fix stays
  (`43d50e341`).
- **Checked.** `qualifiers.test.tsx`, `qualifiers-reads.test.ts` and
  `qualifiers-hydration.test.tsx`, 181 cases, and
  `src/test/coachhelm/v3` (the loader's failed reads and the writes behind it,
  1456 cases in the folder). The tests for the tees race, the
  selection overlay, the tie row, the phone sheet and the Back notes were each
  seen to fail with their fix taken out (the filter and the search as plain
  state, the note and its plain-click guard, the step back, a note matching
  any qualifier, a note that is not spent, the double tap, the hand back to the
  list, strict mode's second run, the list scrolling or writing the address
  itself; the second review's fixes the same way).
- **Test assertions changed by design.** The detail loader's holes, courses
  and logs are read from `await result.secondary` (90806, 92101, 92301); the
  detail depth test in `qualifiers-reads.test` now asserts two waves for the
  core and that the tees and scorecards do not delay it; the create, save,
  retry and offline write scenarios assert `router.replace` for create and save
  (and that `push` is not called), `push` stays for confirm. The rework removed
  the tests of the list's own mechanism (the address, the scroll keep and
  restore, the return mark, the remembered list address) and added tests for
  the shell's: the filter and search coming back for the same team and not
  another, the Back notes, and the list inside RouteFrame. The streaming
  refresh test was only retitled to say what it shows (new standings and a part
  that has not landed), not changed.
- **Left.** (1) Rule 2's "updating mark" on a live refresh is not drawn: a
  refresh is a transition, so the page stays whole until the new render lands
  and then changes in one commit; a unit test cannot see a transition's
  pending state, so a badge for it would be untested. (2) A refresh therefore
  commits when its courses and cards have streamed in too (as before the
  split, but now only the refresh waits, not the first paint). (3) The Back
  note is spent at the qualifier's first mount, so any later page for the same
  qualifier that the list did not open (the edit form's save, Confirm squad, a
  Forward, a reopen from Home) goes to the list's address, a new visit: the
  filter and search come back, the place does not. The note is a hint, not a
  look at the history: it cannot see that the entry before the qualifier is
  the list, only that the list's click was followed by this qualifier opening.
  The sidebar's link to the list keeps the filter through session state. (4)
  Saving an edit replaces the form with the qualifier it was opened from, so
  the browser's own Back from there reads the same qualifier once (the Back
  control goes to the list's address). (5) Confirming a squad still pushes the
  qualifier, so the browser's own Back lands on the confirmed Manage
  selections page (the Back control goes to the list's address). (6) Not seen
  in a browser: the frame's scroll restore under the real view transition, the
  step back in the App Router, the streamed placeholders' final sizes (no
  layout shift measured), and the phone sheet. No `next build` was run (no
  `'use server'` file changed); a Flight promise prop into `use()` is
  exercised only through unit tests.

## 2026-10-01 — Page performance: the detail and the form read in fewer passes

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate." Standard: `docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit: b4842d7de
Design package: none
Contract IDs:   none changed
Data impact:    none; no write, no cache, no new read
Held items:     none
```

- **Detail.** The qualifier detail went from four serial waves to three
  (`qualifiers-reads.test`): the qualifier, then its entries, rounds, round
  courses and squad together, then the tees and the scorecards together. The
  tees used to be read before the scorecards, one after the other.
- **Form.** Editing went from four to three: the roster is read beside the
  qualifier instead of before it. Creating is one read, as it was; the list is
  two, as it was.
- **Left.** The qualifier is still read before its parts, not beside them: a
  read of another team's qualifier would start three reads that are then
  thrown away, which is not worth one round trip. Manage selections reads the
  qualifier's team and then the workspace for the same reason (a missing
  qualifier and a failed read are told apart by the first). The scorecards
  could stream behind their own boundary, but their read is no longer the
  longest on the page; revisit with measured numbers.
- **Switching and prefetching.** The list, the detail and Manage selections
  have no client-side view switch (filters and search are on the page's own
  data), and every link into them is a `<Link>`, so Next prefetches each one up
  to its `loading.tsx`. A fuller prefetch is not used: it would show a
  qualifier's standings up to five minutes old after a round is submitted.

## 2026-10-01 — A tie at the cut waits for the coach (Q-114)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (a panel in the Manage selections grammar;
                Fairway gets a Give place button)
Contract IDs:   CH-09010, CH-09318 (new)
Actions:        qualifiers.chooseTie → chooseQualifierTiePlace (new);
                confirm refuses an unsettled tie
Data impact:    a place given at the cut is a top_score selection written
                before confirm; no schema change
Held items:     none
```

- **Issue.** Players level on to par and strokes at the last place on score
  were split by name order on the board, in selection and at confirm.
- **Fix.** Everyone level with the last place and the next player is "Tie at
  cut". The players clearly above keep their places; the coach gives the
  places left (and can take one back) before confirming, and confirm waits
  until they are all given. The board shows "Tie at cut"; Fairway's workspace
  gets the same Give place button so a tie never blocks it.
- **Checked.** `qualifying.test.ts` (the board and workspace agree, clean
  cuts are not ties); `selection-guards.test.ts` (confirm waits, places only
  to tied players, never beyond, taken back); `qualifiers.test.tsx` 109/109.

## 2026-10-01 — Picks need a scored round; an honest confirm toast (Q-115, Q-116)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   CH-09009 (new); CH-09008 done copy now "Squad confirmed · N
                players"
Actions:        qualifiers.confirmSquad (unchanged call); setCoachPick refuses a
                player with no scored round
Data impact:    none; confirm returns whether the players were told
Held items:     none
```

- **Q-115.** The server refuses a coach pick for an entrant with no scored
  round (completed, not a test, with a total), as the pick sheet offers.
- **Q-116.** The confirm toast reads "Squad confirmed · N players"; when
  telling the players fails, an error toast says so (CH-09009).
- **Checked.** `qualifiers.test.tsx` 108/108; `selection-guards.test.ts` 7/7.

## 2026-10-01 — Selection ranks from the rounds, as the board does; the board's unknown-round rules; test qualifiers stay hidden (swap audit §11 reconciliation, Q-134)

```text
PR/commit:      agent/swap-audit (#2111): 802bcfbad, f55938c4b, 2e6c15651
Design package: none (no visual change)
Contract IDs:   none new
Actions:        none
Data impact:    loadQualifyingWorkspace reads the qualifier's completed,
                non-test rounds; updateQualifierEntryStats skips test rounds.
                Production: 30 entry aggregates rewritten from their rounds
                (owner-approved; 0 of 136 now disagree)
Held items:     none
```

- **Issue.** The board ranked from rounds and selection (and confirm) from
  the entry's stored aggregate, which was stale on a live qualifier (3 rounds
  played, 2 stored), so the two could rank a player differently.
- **Fix.** Selection and confirm rank from the same rounds as the board. Both
  treat a round with a total but no to-par as unknown (not even), count a
  second round in one round slot once, and a link to a test qualifier (detail
  or edit) is not found, as in the list.
- **Checked.** The SQL oracle matched the board on all 7 Demo entrants;
  `qualifiers.test.tsx` 107/107; `qualifying-loader-rounds.test.ts` (3 fail
  on the old loader); qualifying suites 143/143.

## 2026-09-30 — Manage selections has its own error and loading states (swap audit F-18)

```text
PR/commit:      agent/clubhouse (release train #2110)
Design package: none (swap audit fix, no visual change)
Contract IDs:   none
Actions:        none
Data impact:    `qualifiers/[id]/selection/error.tsx` and `loading.tsx` (new). No schema change.
Held items:     none
```

- **Issue.** The selection route had no error boundary or loading skeleton of
  its own (the route-state guard failed in `test:all`).
- **Fix.** `RouteErrorBoundary` for the route, and the Clubhouse qualifier
  skeleton while it loads (nothing outside Clubhouse, where the address
  redirects).
- **Checked.** `route-state-boundaries.test.ts` 5/5.

## 2026-09-30 — V2 page docs (contracts proven by tests); Retry now finishes the job

```text
Design package: design/handoff/ v2 (Coach - Qualifiers.html, Coach - Qualifiers - Mobile.html)
PR/commit:      agent/clubhouse (working tree, not yet committed)
Contract IDs:   90101 to 92401 (122 on this page: 77 from the catalog, 45 new behaviour contracts without a code)
Actions:        12 (ACT-P009-*)
Data impact:    none
Held items:     qualifier-squad-and-entrants (feature), qualifier-db-hardening (data)
```

### Changed

- The six page docs, the manifest's actions (12, each mapped to its component,
  handler, server action, tables and
  contracts), `status.contract` complete and `docs` current, and the manifest's
  `/qualifiers/[id]/selection` route.
- 45 behaviour contracts for what the catalog does not number: the core views
  and addresses (90101 to 90107), the
  live refresh (90304), the edit form's locks (90513, 90514), offline refusal of
  all eight writes (90702), the
  permission rules (90803 to 90812), success (90901, 90902), state kept (91202
  to 91204), no optimistic writes
  (91301), Retry and Try again (91401, 91402), the re-read after a write
  (91501), field alerts (91804), the phone
  views (91901 to 91904), keyboard (92001 to 92003), one-pass reads and the
  debounce (92101, 92102), reporting
  (92301 to 92304) and the tests (92401). They are in a sidecar until the
  registry sync merges them into
  `bridge-contracts.json`.
- Category 08 (permission) is real: the coach-only addresses, what a player
  sees, the loaders' team ownership, the
  server gates behind each write, and what a refusal says. The open RLS gap (a
  player's database access to
  teammates' holes and, until D-35 is applied, to pick reasons) is stated in the
  contract.
- The catalog rows CH-09309, CH-09310 and CH-09311 (no team, not found, coach
  only) are now forced by tests, not
  marked preview.
- Tests: `qualifiers.test.tsx` 65 → 104; new `qualifying-coach-gate.test.ts` (6,
  90810); `qualifier-setup.test.ts`
  and `golf-qualifier-manual-close.test.ts` gain Bridge IDs (90811, 92302) and a
  test (90812). Every hand contract
  is named by its Bridge ID in a test title; nothing was weakened or removed.
- `docs/clubhouse/screens/qualifiers.md`: the live-updates row now describes the
  hook that was built (one channel,
  `golf_rounds`), not the three-table channel the first plan named.

### Fixed

- Retry on a failure toast re-ran only the write. Closing the question, changing
  the status pill, opening the new
  qualifier and reading the page again lived in the button, so a retry that
  landed left the page as it was. The
  follow-up now lives inside each action (Close, Reopen, Create, Save, Start
  selecting, Save pick, Remove pick,
  Confirm squad). One test drives all eight and fails with the fix taken out
  (checked).
- The phone's closed note for a coach now carries the rule the desktop and the
  catalog state (players cannot enter or
  submit rounds in a closed qualifier, including rounds already started;
  CH-09901).

### Why

- D-62: Messages is the gold standard the other pages copy. D-69: every category
  answered.

### Verification

- The four Qualifiers test files, 130 of 130. 73 deliberate breaks of the
  guarded code, all caught, all restored.
  `npm run -s typecheck:fast` and eslint on the changed files clean (VERIFY.md).
- Not run in this pass: `clubhouse:check`, `docs:check`, the build, a browser or
  the iPhone.

## 2026-09-30 — v2 phone and Manage selections

- The phone: list under a "‹ More" top bar, `QualifierDetailPhone`, the player
  rounds sheet, the form with Cancel and
  Create in the top bar, and Manage selections (`/qualifiers/[id]/selection`,
  coach only, Q-65) on the live
  selection actions. New catalog rows CH-09005 to CH-09008, CH-09111, CH-09112,
  CH-09218, CH-09219, CH-09315,
  CH-09316, CH-09408, CH-09503 to CH-09505, CH-09703 and CH-09903 (PROGRESS.md).

## 2026-09-29 — Desktop build

- Coach and player list, detail, create and edit on the existing qualifier
  server actions (D-30), the v2 motion and
  haptics (D-64, D-70), and the D-61 gate on the squad-size and entrants
  actions.

## 2026-10-02 — visual review search hint

Shortened the list search placeholder to “Search qualifiers” so it fits the
375px phone field. Search matching and the accessible label remain unchanged.
Fresh WebKit captures at 375/390/430px pass document bounds; local evidence is
`/tmp/helm-clubhouse-visual-secondary/qualifiers-search-fixed-<width>.png`.
