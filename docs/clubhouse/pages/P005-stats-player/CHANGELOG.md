# P005 — Stats (player): changelog

## 2026-10-21 — Leg links open the right Game detail section on the phone

```text
Design package: none (review fix, PR #2281)
PR/commit:      claude/project-thread-d87uyy
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Fixed

- On the phone, `?tab=game#gm-approach` (and `#gm-short`, `#gm-putting`, `#gm-tee`,
  `#gm-scoring`) from the team grid's leg figures now opens that section of Game
  detail and scrolls to it. The phone draws only the section chosen in the chips
  (Scoring by default), so the scroll found nothing and gave up. Game detail reads
  the hash itself on the phone, and follows it if it changes while the page is open.
  A hash that names no section changes nothing. Desktop is unchanged.

## 2026-10-21 — Range in rounds, shared putt bands, old charts removed (stats visuals 7)

```text
Design package: none (stats visuals follow-ups; decision Q5 in the stats visuals
                log)
PR/commit:      claude/project-thread-d87uyy
Contract IDs:   none (wording: switch label, "vs previous N")
Actions:        none
Data impact:    none (Last 5 and Last 20 cut the same loaded rounds; putt bands
                cut at the same edges)
Held items:     none
```

### Changed

- The range switch reads Last 5, Last 10, Last 20, Season and Qualifiers (also
  in the filter sheet). Last 10 is the default and leaves the address as it was;
  Last 5 and Last 20 add `?last=5` or `?last=20`. "vs previous 10" becomes "vs
  previous N", and the basis line reads "Last 20 rounds" (a short window still
  says how many rounds qualify).
- The Rounds tab's "Against the one before" says the cut in force ("Latest 20
  rounds and the 20 before them", "against the 20 before"), not a fixed 10
  (fixer, PR #2257).
- Putting by distance counts its six and nine bands from `lib/golf/putt-make.ts`
  (the cut the calculator, the leak map and CoachHelm share). Band edges and
  counts are unchanged.
- Removed the unused `LegRoute` (strokes gained by leg, the old route drawing)
  and the other dead chart code listed on the team page entry.

### Known limit

- Every Last N reads the same rolling year as Last 10 (Q-122). Last 20 and the
  20 before it need forty rounds in the last twelve months; a player with fewer
  gets a shorter previous stretch, and none under 23 ("Comparing starts at 23
  rounds"). The read is not widened for Last 20.

## 2026-10-20 — No visible change (stats visuals 5)

```text
Design package: none (stats visuals plan, piece 5; the entry is in P004)
PR/commit:      uncommitted (local/stats-pr5-rank)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Nothing on the player page. `stats.css`, which this page shares with the
  team page, gained the `.ch-sv-tr` block for the team's ranked dot plot.

## 2026-10-20 — Scoring mix bar (stats visuals 6)

```text
Design package: none (stats visuals plan, spec 4.4, decision Q11)
PR/commit:      uncommitted (local/stats-pr6-mix)
Contract IDs:   none
Actions:        none
Data impact:    profile gains extra.triplePlus (from the existing hole read)
Held items:     none
```

### Changed (2026-10-20, stats visuals)

- One scoring mix everywhere: `ScoreMixBar` replaces the Overview's "Every
  hole, by result" bar (`ch-zmix`), Game detail's "What an average round looks
  like" (`ScoreMix`, desktop and phone) and the three bars in Outcomes by par
  (More detail). A 100% bar with par in the middle: going out from it, birdie
  then eagle or better to the left (under par), bogey then double or worse to
  the right (over par), with "Under par" and "Over par" under the bar.
- Each segment at least about 30px wide prints its share; every share is in
  the key (with the rate a round on the main mix). Shares are whole percents
  that add up to 100 (largest remainder; a result with holes that rounds to
  none reads "<1%"). The preview's birdies read 10%, not 11% (10.6% exact).
- A pointer, a tap or the arrow keys read a result above the bar: "Double
  or worse · 12 of 180 holes · 7% · 1.2 a round · 3 triple or worse". A tap
  or a key pins it; only a pin or a key is announced. The key entries pin
  too, so a sliver (one eagle) is reachable on the phone.
- A result with no holes draws nothing; the main key reads it as 0%, each
  par's key leaves it out. Under 30 holes the mix is muted with "Early read ·
  N holes". The phone's key is a short table, one result a row.
- Palette as before (red under par; ivory, gray and ink over), with no literal
  colors: eagle is the new `--ch-score-eagle-fill` token (light and dark),
  birdie `--ch-chart-flag`, par `--ch-ivory-300`, bogey `--ch-ink-500`, double
  `--ch-score-double`. Bogey stays gray, not amber (Q11).
- Data: the profile carries `extra.triplePlus`, counted from the hole read
  the loader already makes (same rounds as the detail read); null when that
  read failed. No query, table or migration change.

## 2026-10-20 — Putting by distance (stats visuals 4)

```text
Design package: none (stats-display-spec.md section 4.3, decision Q9)
PR/commit:      uncommitted (local/stats-pr4-putt)
Contract IDs:   none
Actions:        none
Data impact:    none (same putt rows; no query, table or migration change)
Held items:     none
```

### Changed (2026-10-20, stats visuals)

- Make rate by distance is one component, `PuttBands`, on the desktop Overview
  (zone 6), the desktop Game detail putting section and the phone's Game detail.
  It replaces the two `MakeCurve` copies (Overview and `charts.tsx`) and the
  phone's `MakeRows`.
- Six bands in the Tour's cut (0–3, 3–5, 5–10, 10–15, 15–25, 25+ ft) on equal
  spacing, and the chart says the spacing is equal and not to scale. The
  nine-band breakdown (15–20 ft up to 35+ ft) stays in the putting table under
  More. Each band is a dot on a 0 to 100% axis with a thin Wilson 95% whisker
  (named once, "Likely range (95%)", in the key), its rate and "made/tried"
  under it, and the Tour's thin line behind the dots where the Tour publishes a
  value (none inside 3 feet).
- A band of 10 to 29 putts is a hollow early read and is not graded against the
  Tour; under 10 it draws no dot and says "Needs 10 putts in the band" ("Needs
  10 putts" in the phone's narrow column). From 30 putts a band grades by its
  dot, green at or above the Tour and amber below; the whisker never grades.
- A pointer over a band, a tap, or the arrow keys read it in the line above the
  chart ("5–10 ft · 20 of 51 made, 39% · likely range 27% to 53% · Tour 62%"); a
  tap or a key pins it and a screen reader hears it then, never on hover. The
  chart is a focusable group.
- The putt-read failure notes are unchanged (CH-5211 in Game detail, "The putt
  read failed, so the curve stops at 20 feet." on the Overview). Without the
  putt read, Game detail still falls back to the calculator's five bands to 20
  feet, drawing each rate as kept and printing its count ("33 putts").
- The panel and zone notes describe the new chart; the old `.ch-mk` styles are
  gone.

## 2026-10-20 — The trend of rounds is a dot per round (visuals 3)

```text
Design package: none (stats visuals plan, decisions Q1 Q2 Q8 Q12 Q13)
PR/commit:      uncommitted (local/stats-pr3-trend)
Contract IDs:   none
Actions:        none
Data impact:    none (no query, table or migration changes)
Held items:     none
```

### Changed (2026-10-20, stats visuals)

- The phone's Scoring trend, and a new Round by round chart in the desktop
  Overview (under Scoring and under Strokes gained), draw every round as a dot,
  a trailing five-round average through them from the third round (no line
  before it, a gap rather than a bridge), and a par line for scores or a zero
  line (the Tour) for strokes gained. Scores plot with the better ones higher;
  the chart prints its real ticks and says "↑ Lower is better". A nine-hole
  round is doubled, as everywhere on the page, and the readout says so.
- A mouse over the plot, a finger dragged sideways (after about 8 px and mostly
  sideways, so a vertical swipe still scrolls the page), or the arrow keys read
  a round in the line above: "Sep 23 · Lonnie Poole GC · 73, +1 · 5-round
  average 74.2". A tap, a key, or the end of a drag pins it, with a vertical
  guide and a larger dot; a second tap on it, Esc, or a press outside lets go. A
  pinned round offers "Open round" (44px) where the round review is rebuilt for
  the viewer, and none where it is not; the line is announced only for a pin or
  a key, never for a hover.
- A thin sample is an early read, not a smaller chart: under five scores (eight
  rounds of shots for strokes gained) the dots are hollow and the note says
  "Early read · N rounds". Strokes gained by round needs three rounds with
  shots; under that the panel says "Needs 3 rounds with shots. N so far." One
  scored round says so and keeps the chart's frame.
- The phone gains a Strokes gained by round panel under Scoring trend when the
  window has rounds with shots. The old `ScoreLine` (still used only by tests)
  and `ScoreBoardTrend` are no longer drawn by any screen.
- `useChartPin` gains `area`, the pointer behavior for a chart drawn as one
  surface, with an `inset` for the axis labels (shared piece, see the shared
  changelog).

## 2026-10-20 — Honest deltas (stats visuals 2)

```text
Design package: none (stats visuals plan, section 4.6 and 7; decision Q4)
PR/commit:      uncommitted (local/stats-pr2-deltas)
Contract IDs:   none
Actions:        none
Data impact:    none (no query, table or migration changes)
Held items:     none
```

### Changed

- The strokes gained chip on the hero (desktop) and on the phone Overview is
  green or amber only when the change against the previous 10 is larger than
  one standard error of the difference. Otherwise the signed number stays, in
  neutral ink, with "No clear change vs previous 10". A clear change reads
  "Better than previous 10" or "Worse than previous 10", never "Improving".
  The phone chip names its subject: "SG a round · No clear change vs previous
  10". The standard error is the player's own spread from five rounds, else
  the pooled 3.8, over whole rounds (a nine-hole round is half).
- Overview, Where the strokes go: the change line reads "+0.6 · No clear
  change vs previous 10" in place of "Up 0.6 on the previous 10".
- The SG gauge (was a fixed ±3) and the Overview strokes gained track (was
  −3 to +1) take their ends from the data through `sgScale`, always with zero
  inside. On the preview player the track runs −1 to +1.
- Tracks that were always green now follow the data: fairways, greens and
  scrambling against the team or Tour, penalties amber only above the bench,
  and a track with nothing to compare against is neutral grey.
- Phone scoring trend: the form line is green or amber only past one
  standard error, and "No clear change" sits above the halves line otherwise.
- Phone Game detail now gets the holes filter (it always read "18 holes
  only"), with a regression test.
- The rate gauges are neutral with no reference.

## 2026-10-20 — Strokes gained by leg says how sure it is (visuals 1)

```text
Design package: none (stats visuals plan, decisions Q2 Q3 Q7 Q12 Q13)
PR/commit:      uncommitted (claude/stats-visuals-ofvosr)
Contract IDs:   none
Actions:        none
Data impact:    none (no query, table or migration changes)
Held items:     none
```

### Changed (2026-10-20, stats visuals)

- Strokes gained by leg is interactive on desktop (Overview, Where the strokes
  go) and on the phone (the Strokes gained panel). A pointer over a leg, a tap,
  or the arrow keys read it in a line above the bars: "Approach · −1.2 a round ·
  10 rounds · likely range −1.5 to −0.9 · Team −0.7" (the team only for a
  coach). A tap or a key pins the leg (a ring on desktop, a wash on the phone),
  a second tap, Esc or a press outside lets go. A screen reader hears a pinned
  leg or a key step, never a hover. The chart is now a focusable group, not a
  flat image.
- Every bar carries a thin whisker of one standard error, the "likely range". It
  uses the player's own round-to-round spread once they have five rounds in the
  window, else the pooled spread of production players (3.8 strokes gained). The
  bars keep their scale (the widest value or team mark, rounded up); a whisker
  the rail cuts off draws no cap at that end and the readout carries the number.
- A thin sample is muted, never hidden and never shrunk. Off the tee, approach
  and the total show from 3 rounds and are early reads until 8; around the green
  and putting show from 5 and are early reads until 15. An early read is a
  hollow bar with no gain or loss color, its figure in neutral ink, and a note
  under the bars names which legs are early. A leg under its show floor draws no
  bar and says "Needs 5 rounds" where the bar would be. On the 10-round preview
  player, around the green and putting read as early reads.
- The phone's rows are 44px tap targets, and the panel's note counts only the
  legs it is showing.
- New shared pieces: `lib/stats-signal.ts` (floors, standard error, the tone of
  a change, Wilson intervals, a trailing mean, ties in a ranking: the later
  pieces use them) and `lib/use-chart-pin.ts` (the hover, pin and key behavior
  every stats chart will share). `SgBars` moved from `charts.tsx` to its own
  client file, `SgBars.tsx`; `screens/stats/leg-rows.ts` builds the rows for
  both screens.

## 2026-10-19 — Player stats: bests two by two, the class year on its own line

```text
Design package: none (owner: a visual pass on Stats and CoachHelm)
PR/commit:      see git log (agent/clubhouse-stats-coachhelm-visuals)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Four personal-best tiles are two by two. Auto-fit drew three across and
  left Fewest putts alone on a row (Rounds tab, desktop).
- Phone header: the class year has its own line. Beside the season count
  the line always broke after it, leaving "Sophomore ·" alone.

### Verified

WebKit at 390 and 1280; no sideways scroll at 834 to 1440 (default, early
and self).

## 2026-10-19 — Stats you can read like a scorecard (L6a)

```text
Design package: none (complete-and-elevate plan, lane L6a)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-19, L6a)

- The Rounds table fits its canvas at 1024, 1100, 1280 and 1440 (it was 1040px wide and scrolled sideways at 1280). The columns size to the room, and where the canvas is under 820px GIR and putts, both on Game detail, step out before anything scrolls. A long course keeps one line with an ellipsis (the full name on hover) and its round type beside it; the figures stay right-aligned in tabular numerals, and a row lifts on hover where hover exists.
- Putting rings: the five distance labels are upright, the band on the left and its make rate right-aligned, and every leader starts on one ray from the cup and steps down with its label, so no two cross and none runs through another label.
- The Par swatch in the scoring key has a hairline ring, so parchment on parchment reads as a swatch.
- Game detail opens with every More detail collapsed (it opened expanded on desktop). A figure with no data no longer carries its caption underneath ("Tour 62%", "18 approaches" under an em dash).
- Empty panels are the shared compact empty state, not a bare sentence: the five Game detail panels with nothing logged (drives, missed greens, missed putts, long first putts, putts with a break), the scoring-trend scoreboard and the form chart with no rounds, and the proximity bands that need more shots (now a title, with the bands and their counts as its sentence). A title carries no full stop.
- One number voice: percentages are whole numbers everywhere on the page (the Tour column of the putting table, Best GIR and the share of holes that are doubles or worse used to carry a decimal), through the new `formatPct`; the scoring average's to par is `formatToPar` (E for even, a true minus) and the chart ticks use `formatSigned`, not hand-built signs.
- The scoring form ribbon reads like a scorecard: a finger or pointer dragged across it, or the arrow keys (Home, End and Escape too) once it has focus, snaps to the nearest round and reads that round's date, course and score with to par in the ribbon's own header line, in place of its note, with the round's column lifted; a polite live region says the same. A vertical swipe still scrolls the page. Nothing animates, so reduced motion needs no swap.
- Print: a stats page prints as plain pages. The shell's chrome and the page's own controls (tabs, filter, window switch, back link, actions) are gone; the page is white and light even from dark mode; a head line gives GolfHelm, the subject (the player here; the team and season on the team page) and the day it was printed; rows, cards and sections are not cut across sheets; rules and fills keep their ink. The page keeps its desktop view on paper instead of flipping to the phone view at paper width, and the shell's skip link is not printed.

## 2026-10-18 — Pickers and controls: filter date range, saving

```text
Design package: none (complete-and-elevate plan, lane L2)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, L2 pickers and controls)

- The browser's own date and time inputs are gone. The filter's From and To (each with Clear; To opens on From) shows the value as the app writes it ("Thu 15 Oct 2026", "3:30 PM") and opens a month (dates) or a list by the quarter hour (times): a popover under the field on desktop, a bottom sheet on the phone. On desktop the field stays typable ("10/15", "oct 15", "tomorrow", "fri"; "3p", "1530") and says "Try 10/15, oct 15 or tomorrow." when it can't read what was typed. Today carries a dot, the chosen day is the segmented control's lit chip, days outside the range are off, and arrows, PageUp and PageDown, Home and End and Enter work in the grid. The saved value is the same `yyyy-mm-dd` / `HH:mm` string as before.

## 2026-10-18 — Wave 10: an early read in plain words

```text
Design package: none (wave-10 first-run review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-5309 CH-5313
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-10 early read)

- Desktop: with no strokes gained yet, chapter 1 says it in one line
  (CH-5309, the phone's line) instead of a big dash and four leg rows of
  dashes under the early-read notice.
- The Rounds tab's Last 10 reason (CH-5313) reads "Comparing starts at 13
  rounds: the newest 10 against at least 3 before them."

## 2026-10-18 — Wave 8: premium details, Filter on the column edge

```text
Design package: none (wave-7 premium details review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, premium details)

- Desktop: Filter's icon starts on the column's edge
  (`.ch-btn--flush-start`); the phone filter bar is unchanged.
- Phone: the note under a panel ("2 legs are losing strokes…") is the
  secondary ink, not green (green is gains only).
- Phone header: each part of "Sophomore · 21 rounds this season · 3.9 hcp"
  keeps to one line and the dot stays at a line's end.
- Phone header: the ringed coin is inset by its 4px ring to the column edge.
- Phone: the filter button matches the window switch's 40px track and radius.

## 2026-10-18 — Wave 7: player stats trend

```text
Design package: none (wave-7 player journey review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, phone scoring trend)

- The phone hero's Scoring trend reads "2.1 higher", "2.1 lower" or "level",
  over "Newest 5 vs first 5" (the halves the change compares), in place of
  "up 2.1 · Newer rounds".

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

- "Adding…" (CH-5401) and "Accepting…" / "Declining…" (CH-5404)
  while those writes run.

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

- `stats.css`: the player page's phone text (the profile head, the game
  sections' heads, notes, labels and captions, the round list) is set in
  `calc(N * var(--ch-type-k))`, so it follows the iPhone's Text Size up to
  XXL. The game section's label and scope keep 13.5/19 and 13/18 at the
  default size.
- Left fixed on purpose: the figures (`28px/32px` value), the comparison
  table, the chart text and the rank numerals.
- At XXL (390 wide) the unscaled text drops from 177 to 103; the rest is
  the shared shell and the figures. At the default size every value is the
  same pixel.

### Verification (2026-10-18, Dynamic Type)

- WebKit (Playwright, dev preview, 390): the scale 1 screenshot is
  pixel-identical to before; at XXL no overflow and no visible overlap (the
  detector's new pairs sit in panels that are not shown).
- `npm run test:file` on `stats-parity.test.tsx` (the type contract now reads
  the Dynamic Type steps).

## 2026-10-18 — Wave 3 accessibility: tab targets, birdie digits

```text
Design package: none (wave-3 accessibility review, items 16, 18)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, a11y wave 3)

- The profile's tabs set `aria-controls` only on the tab whose panel is drawn;
  the others pointed at panels that were not in the page.
- Dark: the score mix's birdie segment and key print their figures in the
  page's near-black, not white, on the salmon flag (2.53:1 to 7.27:1).

### Verification (2026-10-18, a11y wave 3)

- `npm run test:file` on `stats-player.test.tsx`.
- WebKit (Playwright, dev preview, 1280 dark): `.ch-zmix .is-birdie` 7.27:1;
  light unchanged at 6.02:1.

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

- The profile takes the Stats main's shared gutter and head top (`stats.css`,
  design #5): the back link and hero start 40px in from the frame, the name at x
  384 beside the photo.

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

## 2026-10-18 — Wave 3: the actions keep one row, ranges typeset

```text
Design package: none (wave-3 design review, items 4, 6, 7)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, hero actions and zone ranges)

- At 1280 and wider the hero's three actions (Message, Schedule 1:1, Add
  focus area) sit on one row: the hero's column gap is 16px (was 22px) and
  the action buttons take 12px side padding (was 14px). Add focus area
  wrapped to a row of its own at 1280 (`stats.css`).
- Approach ranges read "50–125 yds", "125–175 yds" and "175+ yds" on screen
  (en dash, yds); the bucket labels stay the lookup keys in
  `leak-map-buckets.ts` (`OverviewZones.tsx`).
- The strokes gained track's note gives its range with true signs ("−3 to
  +1"), where the low end had a hyphen-minus (`OverviewZones.tsx`).

### Verification (2026-10-18, hero actions and zone ranges)

- WebKit, the three actions' tops: 280, 280, 280 at 1280 (the row ends 10px
  inside its 384px column) and at 1440; the name stays one line.
- `npm run test:file` on `stats-parity.test.tsx` and `stats-player.test.tsx`.

## 2026-10-18 — Polish: the profile skeleton takes the wide layout

```text
Design package: none (wave-2 states review row 2)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, loading)

- At 1280 and wider the profile's skeleton (CH-5403, aria-busy) takes the
  loaded page's layout too, the four figures beside the name: the rules in
  `stats.css` key on `.ch-st:is(.is-desk, [aria-busy='true'])`.
- The strokes gained figure's change line keeps its loaded width (about
  140px), so a coach's three actions wrap to two rows beside it as they do
  when the page lands (`StatsSkeleton.tsx`).

### Verification (2026-10-18, loading)

- WebKit (Playwright, dev server, preview fixtures), tabs top skeleton vs
  loaded: 1280 422 vs 422 (was 568 vs 422); 1440 378 vs 378; 1100 568 vs
  568.
- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint.

## 2026-10-17 — Polish: the trend names scoring; vs previous 10

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone figures: the third figure's label is "Scoring trend", so an amber "up
  2.1" reads as scores rising rather than as a gain. The review asked for the
  value to read "Scoring up 2.1"; at 390px that cell measures roughly 106px on
  the review's screenshot (an estimate) and "Scoring down 1.4" would likely
  wrap, so the word went on the label
  (`StatsPlayerPhone.tsx`).
- "vs. previous 10" reads "vs previous 10", as Home says it (the shared
  `data/stats-common.ts`).
- Tabular figures restored (review row 18) in the shared `stats.css`, as the
  P004 entry lists; the player's figures, ladders and round rows included.

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `clubhouse:css`, `typecheck:fast` and eslint. The WebKit pass is the
  coordinator's.

## 2026-10-17 — Figures checked against production on the same rounds; putts with none recorded fixed

The profile's figures were run beside production's on the same round ids:
`getDetailedStats` (the Fairway player page's calculator), the Fairway Team
stats page's row for the player, and the Standing strip
(`stats-production-parity.test.ts`; fixtures always, every production player's
rows in the opt-in read-only pass, 187 player windows, 2026-10-17).

- **Putts and 3-putts per round leave out a round with no putt recorded**
  (`stats-player.ts`, `perPutts`, with `cachedPutts` in `stats-common.ts`), for
  the player and the team column, and the Rounds tab shows no putts figure for
  it instead of 0. Production writes 0 putts for such a round and its calculator
  counts only holes with a putt. No production round is like that today, so no
  number moved.
- **Matched with no change (0 differences at the shown precision):** fairways,
  greens, putts, 3-putts, scrambling, sand saves, penalties, par 3/4/5 scoring,
  birdies, pars and bogeys a round, putts per green, rounds counted, and strokes
  gained and its legs against the Team stats page's stored values.
- **Differ on purpose (unchanged):** a round posted as a total only counts in
  the scoring average, to par and best round (Q-123: 15, 15 and 2 of 187 pairs,
  7 players, up to 1.03 strokes); strokes gained waits for three whole rounds
  (25 pairs where production shows a value).
- **Production's Standing strip is a different basis, not a window of this
  page:** it reads every completed round, test rounds included, and the pressure
  gap and opening hole only the last 90 days; strokes gained averages nine- and
  eighteen-hole rounds per round; its 175+ yd proximity drops every par-5
  approach that misses the green as a lay-up, where production's own leak map
  (and this page, which uses its aggregator and read) drops only long leaves.
  Against the profile over the whole career: 20 of 49 strokes gained, 6 of 11
  pressure gap, 4 of 33 opening hole and 50 of 57 proximity 175+ pairs differ.
  The HELD OD-01 chain adds the test-round filter; none of it changes the 90-day
  window or the lay-up rule.
- **Production rounds twice:** the calculator rounds rates to 0.1 and the
  Fairway page then shows a whole percent, so 61.46% shows as 62% there and 61%
  here (fairways 14, greens 5, scrambling 11, sand saves 2 of about 187 pairs).
  Clubhouse rounds once; left as it is.

## 2026-10-16 — Game detail: the section bar scrolls with the page; the summary sticks below the top bar

Desktop My stats (`stats.css`). The section bar (`.ch-gd__nav`) is no longer
sticky: the owner said a bar riding over the sections "looks bad". Its glass and
its opaque fallbacks (P005-D5, below) are gone with it. A section's summary
(`.ch-gm__id`) used to stick at 24px, behind the top bar; it now sticks at the
top bar's height plus 24px. Measured by the main session in Chrome at 1567px:
the top bar's bottom at 64px, and the summaries of Strokes gained, Scoring and
Approach stick at 88px, 24px below it; a short section (Off the tee, Short game,
Putting) pushes its summary up as the section ends; the section bar is
`position: static`. Not checked in Safari.

## 2026-10-16 — Shared change in StatsTeamPhone

`StatsTeamPhone.tsx` is named by this page too; the player's page is unchanged.
See P004's entry (rolling figures are text until a hand is on the legs).

## 2026-10-16 — A switch to My stats on the phone renders the first screen, then the rest

Game detail and everything under it (the trend, the rounds, development) start
below the first screen (game detail at 876px of 852). On a page reached by
navigating they now render a frame after the first one is painted
(`useArrivalPainted`); a hard load hydrates everything at once, and a link to
the rounds still scrolls to them. Worst frame of a switch to the player's My
stats (WebKit, production build, phone, three runs each): 72–79ms rendering
everything, 49–57ms with the lower sections a frame later. All eight sections
are in place after a switch, and hard loads have no errors.

## 2026-10-14 — The phone header says its count is the season's

The phone player header read "5 rounds" over a Last 10 window that counts "10
countable rounds". It now reads "5 rounds this season", as the desktop's
Rounds figure does.

## 2026-10-14 — Shared Stats islands: the phone window switch

- The team page's phone window switch moved into `PhoneWindowSwitch`
  (StatsTeamIslands, shared with this page's files); nothing on the player page
  changes. See P004's entry.

## 2026-10-12 — A section root on the phone (no "‹ More")

The phone shell's section strip replaced the tab bar and the More sheet
(docs/clubhouse/phone/section-strip.md). My stats's phone top bar no longer
draws a "‹ More" back link: its title is a start title (`PhoneTop start`),
which the shell turns into the section switcher. The page's action, where it
has one, is unchanged. Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-11 — The micro motion moves on transform

Presentation only. The track fills, the missed-green funnel bars and the
development rail now draw by transform (scale or slide)
and their ticks and the rail's dot move by `translate` in container units, so a
window or filter change glides without relayout; the
scoring mix gives each result its share by flex-grow (it was a width). The
strokes-gained leg bars stay sized inline and no longer
glide (their width is what the strokes-gained tests read). Depth on the gain and
loss bars and the stage is from the shared elevation
tokens (`docs/clubhouse/CHANGELOG.md`). No data, copy or accessible name
changed.

## 2026-10-10 — Zones on the shared Zone, and micro motion

Presentation only; see the shared entry in `docs/clubhouse/CHANGELOG.md`. The
zones now come from `ui/Zone.tsx` (the reading sits in a
plate with a gradient figure and a gold-ringed number, as on the round review).
Bars, tracks and focus rails glide to a new value when
the window or filter changes; rows warm under the pointer; the Overview is
memoised.

## 2026-10-09 — Seven zones: Overview, Game detail, Rounds and Development

```text
Design package: owner direction "it's not separated very well or organized, and there needs to be visuals that make sense for each stat", then "yes this all looks good, get it done"
PR/commit: agent/clubhouse-premium-backlog
Contract IDs: CH-5204, CH-5213, CH-5305, CH-5308, CH-5310, CH-5318 (no new codes)
Actions: none changed
Data impact: none (no migration). Every figure is read from the profile the page already loads.
Held items: none
```

### Changed (desktop Overview)

- The Overview is seven zones, each a band set off by a gold rule with an
  alternating tint: strokes gained, scoring,
  off the tee, approach, short game, putting, and the last rounds. On the left,
  what the stat is in a sentence and one
  large reading with the team's (coach) or the Tour's (player) figure beside it;
  on the right, the picture that fits it.
  The comparison table, its axis column and the figure tape are no longer on the
  player Overview.
- Strokes gained: the four legs as bars from one zero (each with the shots it
  counts and, for a coach, the team's
  mark), and the total against the team and the Tour on one rail.
- Scoring: every hole by result as one stacked bar with the per-round counts,
  and each par's average to par against
  the Tour's on a dot plot.
- Off the tee: where tee shots finish (left, fairway, right, and the misses
  whose side was not logged) as a strip,
  penalty strokes against the Tour's, and fairways by par 4 and par 5.
- Approach: a green with its four edges thickened by where missed approaches
  finish, and how close approaches finish
  by range on one scale with the Tour's tick. A range under its sample floor
  says what it needs (CH-5318).
- Short game: greens missed to saves and bunker shots to sand saves, as a funnel
  with counts.
- Putting: the make rate by distance as a curve against the Tour's, the gap
  between shaded, with putt counts and the
  Tour's rate under each distance.
- The last rounds: the scoring-form ribbon, unchanged, as the seventh zone.
- Game detail, Rounds and Development take the same zone style on desktop. Game
  detail: each of the five areas is a band
  with what it is and its four figures on the left (held in view while the right
  scrolls) and every panel and the More
  detail disclosure on the right, flush with hairlines instead of cards; nothing
  was dropped (scrambling, greens by
  distance and lie, proximity, misses, putting by break and the rest are where
  they were). Rounds: score by round with the
  personal bests, this window against the one before with the scoring change as
  the reading, and the rounds table in a
  full-width zone that fits without sideways scrolling. Development: each focus
  area and goal is a track from where it
  started to its target with the current value on it and the share of the way.
  The phone keeps its stacked layouts.
- The comparison table's axis column (a mark per row against the team and Tour)
  is removed; the table itself is no
  longer on the player pages.
- When some rounds were posted as a total only, one line above the zones says
  how many rounds the hole stats read
  and that the scoring average counts all of them.

## 2026-10-09 — Overview: the scoring form ribbon and the figure tape

```text
Design package: owner direction "premium sleek, trend first" carried from Team stats, then "I don't want the big thing on the player profile page, go a different direction"
PR/commit: agent/clubhouse-premium-backlog
Contract IDs: CH-5204, CH-5213, CH-5305, CH-5308, CH-5310 (no new codes)
Actions: none changed
Data impact: none to the schema (no migration). Each round in the profile now carries its own fairways, greens and scrambling percentages, read from the round cache the loader already holds.
Held items: none
```

### Changed (desktop Overview, ribbon and tape)

- No big panel. The scoring trend is a flush ribbon under a gold rule: one
  column a recent round, a bar from the
  player's own average (green rising when the round beat it, gold hanging when
  it did not, all on one scale), the
  score at its tip, the date and to-par under it, the newest column marked. The
  head says the form change in a
  sentence (the newer half of the rounds against the older) with the average,
  the team's (coach), and the best round.
- The five figures (fairways, greens, putts, scrambling, best round) follow as
  the same tape Team stats uses: value,
  change against the team (coach) or the Tour (player), a weekly line from the
  rounds, and a ring with the reference's
  mark (or the best round's distance from par). The player page's own figure
  cards are no longer used.
- Wide canvases (1280px and up) set the four hero figures beside the name
  instead of under it, so the Overview opens
  in view. The figures still show on every tab.
- Strokes gained by leg is four aligned bars from one zero line (green right for
  a gain, gold left for a loss, all on one
  scale), each leg with a line on which shots it counts (off the tee: tee shots
  on par 4s and 5s; approach: full shots
  from over 30 yards and par-3 tee shots; around the green: within 30 yards;
  putting: every shot on the green) and, for
  a coach, the team's mark on the same rail. It replaces the small
  stepping-stone graphic.
- The comparison table ("vs. team" for a coach, "vs. the Tour" for a player)
  gains an axis on every row that has a
  reference: the player's mark, the team's tick and the Tour's tick, with a bar
  from the reference to the player that is
  green when they are better and gold when not, in the stat's own direction
  (fewer putts, a lower score). The axis is
  the data's own range with room either side and never narrower than a fixed
  minimum, so two close values sit close;
  a rate stays inside 0 to 100 and strokes gained is centred on zero.
- Game detail's "Doubles or worse" now says its share of holes beside the Tour's
  share of holes (it set a per-round
  count against a share of holes before).
- The loading skeleton draws the ribbon and the tape.

## 2026-10-08 — Premium pass: one round set, one chart, one surface, the best card

Approved by the owner on 2026-10-08 (P005-A2, C2; findings D1, D2, D5 to D8,
D12, D13).

- **One round set (D2).** The hero, Game detail and the charts read the same
  rounds: Game detail's scoring average is always the window's posted totals
  (`perEighteen`), and the preview's Last 10 reads 73.6 everywhere.
- **One chart and one axis on the phone (D1).** Scoring trend draws every round
  in the window; Score by round is desktop only. Score charts put lower scores
  higher and say "Lower is better"; the mean label moves off any value label
  (`meanLabelSpot`).
- **One surface in Game detail (A2).** On desktop each section is the one card;
  its tiles and par tiles sit between hairlines with soft rules, no boxes
  inside. The sticky section bar is opaque without backdrop-filter or under
  Reduce Transparency (D5).
- **The personal-best card (C2).** Personal bests offer "Share best score": a
  dated card (the score, to par when it is the same round, the course, the date,
  "Attested by Coach `<surname>`" for the team's primary coach, so a shared card
  doesn't point to the school; owner, 2026-10-08), drawn on a canvas and handed
  to the share sheet, or downloaded where there is none (CH-5810, CH-5005). It
  never shows a school or team name, and a coach's card names the player by
  first name and last initial. The loader reads the attesting coach from
  `golf_team_coach_staff` and `golf_coaches`; a failed read drops the line.
- **Findings.** One h1 on the phone (the bar's title is plain text) and the
  overview's section titles are h2 (D7); Development rows show units (D8,
  fixture metric ids); the phone's change chip says "SG a round" (D6); "holes"
  and "Par 4s: 65%" (D12); the loading preview is the phone's own (D13).

## 2026-10-08 — Security: Add focus area trusts only the session

`createFocusArea` (shared with Fairway) no longer trusts the browser. The coach
on the new row is always the signed-in coach; a `coach_id` the page sends is
ignored. The roster check now always runs: the coach's active team is resolved
(a staffed team counts without an organisation), and a coach with no team, or
a player without an active membership on that team, is refused before anything
is written. A linked insight (`from_insight_id`) must be about that player, on
that team or none, and the shared demo account is refused (`demoSafe`). The
Add focus area sheet keeps its calls and its error copy. Tests:
`src/test/golf/actions/development.team-id.test.ts` (spoofed coach id, no
team, no organisation, not on the team, linked insight, demo, happy path).
Still open: the row-level security insert policy does not pin `coach_id` to
the caller, and a coach with no staff rows falls back to their organisation's
team.

## 2026-10-08 — Copy: typographic apostrophes

A player's stats write their apostrophes as ’ on desktop and the phone: the
failed reads (CH-5201 to CH-5203, CH-5209 to CH-5213), the focus area's and
the share's failures (CH-5001, CH-5002), the offline refusals (CH-5901, and
CH-1903's "you’re offline", which the shared action hook now writes), the share
key's name, the early-read line, the trend's strokes gained note and Game
detail's panel notes. The catalog quotes them as shown.

## 2026-10-08 — phone: every tap answers

Measured in WebKit as an iPhone at 390 wide (touch, no hover): the Message key
in the head, All N rounds and Game detail's "How this is measured" now answer a
press (a tint a beat after the finger lands, CH-1606; the key and the button
shrink as every button does), with no tap flash. The window switch glides and
lands in one frame with reduced motion; the phone skeleton still measures
identical to the loaded page. Game detail's section chips (the shared pill) and
the shared switch's other options answer with the shared press tint (CH-1617,
controls.css; measured the same way).

## 2026-10-08 — phone: Mobile clubhouse pass

A player's stats on the phone follow the Coach Home "Mobile clubhouse pass"
board (round 3). The page is the parchment sheet with no white cards:

- the head opens under the engraved double rule: the avatar in the Ledger's
  ring beside the name in the bold condensed sans (it was a regular-weight
  display title);
- the three figures sit between hairlines as the Ledger's figure row;
- Strokes gained, Scoring trend, Score by round, Personal bests, This window
  against the one before, Rounds and Development are sections flush under
  their double rules, each caption under its title;
- Game detail's chips open the section under its double rule; the chosen
  section, its figures and its panels are flush on the sheet, divided by soft
  rules (its panels had sat on a grey band). Personal bests, the scoring by
  par, the outcomes by par and the More detail tiles lose their boxes and read
  two by two between hairlines;
- the rounds and the development lists are rows on seams;
- a filter that matches nothing is the empty state alone on the sheet.

Fixed on the phone: a ranked hole's figure (Toughest holes) sat on a third row
under its rank; it is back at the right of its name. Band rows ("10–15 ft")
read on one line. Desktop is unchanged.

## 2026-10-07 — Add focus area's sheet is on the record

No visible change. CH-5602 now describes the shared Modal's entrance as it runs
(a 6px rise from 98% on desktop, a rise from the bottom edge on the phone,
instant with reduced motion or Animations off) and is referenced at
`FocusAreaSheet`.

## 2026-10-07 — Tabs answer on the press

The underline and the selected tab move as soon as you press. The panel, the
heavy part, renders just behind them (`useDeferredValue`): in a WebKit dev
build the underline starts at 24ms instead of 95ms. The panel then swaps
through the shared `Swap` (CH-5603): the new panel fades in with a 6px rise
while the old one fades out, hidden from assistive tech. With reduced motion
the swap is instant, and it never runs on first paint.

Changing the window (Last 10, Season, Qualifiers) now moves the figures too
(CH-5604): each figure that changed crossfades to its new value, where it
used to jump. Nothing counts up.

## 2026-10-07 — The profile takes the page head

On desktop, the profile's striped banner card is now the framed page head:

- **Back row:** "Team stats" and the player pager sit above the double hairline.
- **Identity:** an 84px avatar sits beside the status tag, then the name in
  the head's heavy sans, the class and hometown line, and the actions.
- **Figures:** the four figures sit on the canvas under a soft rule.

The yardage cards (Scoring, Strokes gained by leg, "vs. team") lose their card
and sit as Ledger sections, with 40px between them. The loading skeleton opts
into the same head and holds it line for line: the hero and the tabs measured
0px of shift in WebKit at 1440 and 1100. The phone is unchanged.

## 2026-10-07 — Chart card titles in the serif

The yardage cards' titles (`YardagePage`: Scoring, Strokes gained by leg, Team
putting, and "Jonah vs. team") were a 15px semibold sans next to serif panel
titles. They now use the display serif (`--ch-type-serif-s`), with any digits in
the sans (`SerifText`).

## 2026-10-07 — Phone overview on the stat line

The phone overview's three figures were bare numbers inside one white sheet.
They now sit on the stat line with no surface, as on Team stats, and carry a row
of gauges:

- the scoring average from par, per 18 holes over the window's rounds that
  record par;
- strokes gained from the Tour's zero;
- no gauge under the trend, which is already words.

The phone skeleton holds the gauge row (39px).

## 2026-10-07 — The profile holds still while it loads

The profile's loading skeleton now matches the loaded page from the hero down
through the figures:

- **Figure row:** the skeleton now holds the overview's five figures. Both the
  skeleton and the loaded cards keep the measured row height
  (`.ch-fg--profile`): 169px, or 194px in the middle band where a label wraps.
- **Name:** the name line takes the serif title's 48px.
- **Window switch:** it has its loaded width (216px) and its 8px foot.
- **Strokes gained change:** the words stay on one line. On a 680–770px canvas
  they used to wrap and grow the hero by 24px.

Measured in WebKit through the new preview state
`/clubhouse-preview/player?state=loading`, at 1440, 1300, 1180, 1050, 1000, 900
and 840: the hero, tabs, filter bar and figure row don't move between loading
and loaded. This closes the gap noted in the entry below.

## 2026-10-07 — Overview figures drawn against their reference

The overview's five figures carry the same gauges as Team stats, each against
the reference its words name. Fairways, greens and scrambling sit on a 0–100
track with the team's mark for a coach, or the Tour's mark for a player (none
when the tour is unknown). Putts are drawn against 36, and the best round
against par. Not measured for load shift: the profile skeleton
(`StatsProfileSkeleton`) has never held the figure row (it goes from the filter
bar to a chart placeholder), and the preview has no profile loading state. That
gap predates this change and is still open.

## 2026-10-07 — Scoring line mean label off the line

The phone scoring line (shared with Team stats) places its "Mean" label in a
corner clear of the line, with a halo.

## 2026-10-07 — Loss amber and miss map contrast

The loss amber is darker everywhere (4.5:1 on the darker page tone and in
wells), and the miss map's counts hold 5:1 on the heaviest fill.
`clubhouse:a11y` is clean on the phone stats panels.

## 2026-10-07 — Hero figures on the hero

The profile hero's four figures (Scoring avg, Handicap, SG / round, Rounds) no
longer sit on a card inside the hero. They run in one row across the hero's
foot, under a seam, divided by seams, at every width.

## 2026-10-07 — Figures as a stat line, serif titles

The figure row uses the shared stat line (no cards; seams between gilt rules;
see P004). The player's name and the section titles, on the phone and desktop,
are set in the display serif.

## 2026-10-06 — Smooth scroll and materials

In-page jumps on the phone view ease through the shared smooth scroll helper and
stay instant with reduced motion.

## 2026-10-06 — Premium interaction corrections

```text
PR/commit:      #2155, codex/clubhouse-smoothness-audit
Design package: existing Clubhouse focus and motion owners
Contract IDs:   existing keyboard and reduced-motion behavior
Data impact:    none
Held items:     physical iPhone and complete manual release acceptance
```

Desktop Game detail section navigation observes both OS reduced motion and
the live Clubhouse Animations preference. The selected section and phone
selection/persistence contracts remain unchanged.

See [premium audit](../../PREMIUM_AUDIT.md) for focused evidence and limits.

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

StatsPlayer and the shared segmented indicator use zero-duration motion
when disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 6 mapped
actions and 4 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p005-stats-player). Approved handoffs and
contract IDs are preserved; runtime gaps stay explicit.
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

## 2026-10-02 — Stable phone overview across periods

The measured Season switch removed 47px of overview caption height, while
Qualifiers inserted an early-read card above the figures. The player overview
now puts its sample caveat or comparison in a full-width metadata footer inside
the same layered card. The exact early and no-shots text, codes and note role
remain; the early caveat still applies to averages and trends as well as SG.
All values, labels, benchmark and team comparisons remain visible.

The footer and figure captions retain a compact footprint across periods,
growing naturally for longer text. Empty and populated SG panels share a
minimum height based on the measured populated panel. No thresholds, loader,
data or backend behavior changed. The player suite passed 71/71 with one
worker, including caveat, sufficient-evidence and failed-read transitions.

At 320px the three player figures stay across, rather than inheriting the
team's two-column layout and leaving a vacant fourth cell. A four-line
metadata footprint holds the exact early caveat without a period jump;
the final overview is 204.969px tall instead of the intermediate 299.750px.
The loading shape now reuses the overview/footer and Trend value geometry.
Its real player-RSC handoff remains unmeasured; the structural regression
and settled width checks are recorded separately in VERIFY.md.

## 2026-10-02 — Phone stats filter date fields reach 44px

```text
Design package: owner's mobile boards; shared Stats filter sheet
PR/commit:      codex/clubhouse-design-fidelity (working tree after 83b9990)
Contract IDs:   none changed
Actions:        existing filter choices only
Data impact:    no endpoint or schema changes
Held items:     physical iPhone Safari and native date-picker validation
```

The phone From and To fields now have a 44px minimum height, up from 38px.
Desktop retains its 38px fields. Existing 30/34/36px drawn buttons already
have 44px effective targets through the shared pseudo element; WebKit hit
checks confirmed those extensions and non-overlapping adjacent targets.

## 2026-10-02 — Intuitive improvement: easier phone filter activation

```text
Design package: owner's mobile boards; Intuitive Software Design IMPROVE mode
PR/commit:      codex/clubhouse-design-fidelity (working tree after cca081c)
Contract IDs:   none changed
Actions:        existing event reply, acknowledgment and task state; none added
Data impact:    no endpoint or schema changes; local fixtures and mocked writes for verification
Held items:     intended-user validation, physical Safari and real-account read-back
```

The shared phone stats control now gives the player profile an explicit 44×44px
filter target. Existing early-read, missing-data and window comparison copy is
unchanged. WebKit verified the target and captured the coach profile at 390.

Evidence and practical limits: `VERIFY.md` and the scoped intuitive
secondary-screen report.

## 2026-10-02 — Player stats: layered panels and less compressed captions

```text
Design package: design/handoff/ (owner's mobile boards and depth.css)
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none changed
Actions:        none changed
Data impact:    none
Held items:     physical iPhone Safari and signed-in production data verification
```

The phone profile uses the shared sheet gradient and shadows for overview,
strokes gained and game-detail panels, with 16px section spacing. Figure
captions have more leading and flexible labels. Data sources, scope, comparison
captions and early-read states are unchanged.

Verification: WebKit iPhone 13 populated layouts at 375, 390 and 430, plus
empty/failed states at 390. Before/after screenshots and practical limits are
recorded in VERIFY.md.

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — iPhone brief: Game detail on the phone, the approach section first

```text
PR/commit:      agent/swap-audit
Design package: none (the owner's iPhone brief; the phone board is unchanged where it is silent)
Contract IDs:   none new
Actions:        none
Data impact:    none; no calculation changed (the labels, the layout and what a missing figure says)
Held items:     none
```

- **Issue.** The phone's Approach section read as a wall of one size: the value
  (20px) sat beside a label and a scope of 12px, the Tour mark was a second
  line of the same weight, the seven-band chart was cramped (its labels wrapped
  in two lines), five italic paragraphs (552 characters over 15 lines)
  explained method before the player had seen a number, "Last 10 rounds · 3
  rounds, 18 holes only" did not say that only three rounds existed, and a
  figure with nothing behind it was a dash.
- **Fix.** The value is 28px and 600; its label is 13.5px and its scope 13px,
  in secondary ink (computed in Chromium at 390px: value 20 to 28px, label 12
  to 13.5px, scope 12 to 13px). The Tour mark is that same quiet scope line.
  The three distance charts (greens hit by distance, proximity against the
  Tour, finish when the green is hit) are rows on a phone: the band, a bar, the
  exact value and, where the source keeps it, the shots ("55 shots"); a band
  with no shots reads "No shots", not 0%, a 100% bar fills its track, and a
  band under the Tour's floor reads "Needs 10" with its shots (CH-5316 sits on
  the rows). Every panel note is one short plain line and its method is behind
  a closed "How this is measured"; so is the longer account of which rounds a
  section counts (the line above it is short: 259 characters over 8 lines, none
  italic, three disclosures). "Last 10 rounds" with three behind it reads "3
  rounds qualify, 18 holes only". A figure with nothing behind it says why ("No
  approach shots", "No putts tracked"). A player reading their own stats reads
  "You hit" on a screen as on the phone (the verb agrees; it already did on the
  phone, and a coach reads "Jonah hits").
- **Not done, on purpose.** The GIR and finish bands carry no shot count: the
  calculator keeps only the percentage per band (`girPct50_75`, ...), so those
  rows show the value without an n; exposing the counts is a change to the
  shared calculator, which this pass did not make. The "200+" row reads the
  200 to 225 band (or 225+ when that is empty), not both together. A band with
  one shot reads 100%: a window of three 100% bands is small samples (the
  percentage has no floor), not a fault; a floor like the putting bands' 10 is
  an owner decision. "More detail" stays closed on the phone and holds tables
  the section above does not repeat (the by-lie and by-distance tables, the
  tiles and the per-round lines).
- **Checked.** `stats-parity.test.tsx` (the phone's approach section: rows,
  "No shots", the full-scale bar, "Needs 10", the closed disclosure, the honest
  sample line, "You hit", the reasons for a dash, and the stylesheet's type
  contract); `stats-player.test.tsx`; a static render of the section in
  Chromium at 390px before and after (page height 2004 to 2232px, the cost of
  rows for columns).

## 2026-10-01 — Page performance: two round trips for a player, three for a coach, a hero that holds its shape

```text
PR/commit:      agent/swap-audit (09870b6d6, 26cf82b2c, 2b3e64862, 169f17833, 9000315b7, 6e78c0dc3)
Design package: none (no new element)
Contract IDs:   none new (CH-5402, CH-5403 behaviour unchanged)
Actions:        none changed; `getDetailedStats` and `getSprayChartData` run in the stats context (below)
Data impact:    none; same figures, same reads, in fewer round trips (`loadPlayerProfile`)
Held items:     none
```

- **Issue.** The profile read in three round trips plus a chain inside the
  shot-level actions (each of `getDetailedStats` and `getSprayChartData` asked
  the auth server who is signed in and then checked access to the player: two
  sign-in reads and two access checks for one answer), and its shot reads paged
  a thousand rows at a time in sequence. Choosing a window moved the page: the
  hero's strokes gained figure gained a change line (27 px) in Last 10 and lost
  it in Season. The route skeleton's hero was 34 px short.
- **Fix.** The player, team, membership, rounds, focus areas, goals and the
  access check start together; the shot-level reads begin once membership is
  confirmed (a player not on the team reads no shot and gets the not-found
  page). A player's profile is two round trips and a coach's three (the third
  is a small read of the teammates' round figures for the comparison column,
  which nothing waits on). The two actions run in the page's own stats context,
  built only from the request's signed-in user and `verifyPlayerAccess` for
  this player; a degraded session, a denied or failed check, or no user leaves
  each action to check for itself, as before. The shot reads page in growing
  batches (2, 4, 8 at a time after the first). The strokes gained figure keeps
  its change line in every window (empty when there is no change), and the
  skeleton's hero has it too. A tab's count is two digits wide at least, so the
  Development tab no longer slides 7 px when a window's round count goes from
  one digit to two. A coach's skeleton draws the way back and the three actions
  (hero 349 px like the page, was 307), a player's hero matches to the pixel
  (314). On the phone a one-round trend keeps its chart frame, an empty strokes
  gained panel the height of the bars, and the skeleton is in the loaded order
  (header, window and filter row, figures) and as tall as the loaded blocks.
- **Not done, on purpose.** No cross-request cache and no prefetch of other
  windows. The phone's strokes gained caption drops its change chip when a
  window has no change (F-54), so the strip is 78 px instead of 125 and the page
  moves; held blank it would undo F-54's "its own short line" (owner decision).
  A window with a different amount of data (one round, no shots, no earlier
  window) has panels of different heights by content, and an early-read note
  appears above them; those are not held.
- **Checked.** `stats-reads.test.ts` (waves for a player and a coach, no access,
  a degraded session, a profile not on the team reads no shots, a failed
  teammates read), `stats-player.test.tsx`, `stats-parity.test.tsx`,
  `stats-geometry.test.tsx`; measured with `npm run clubhouse:perf`
  (PROGRESS.md, "Page performance (2026-10-01)"). Reads on a cold load, coach
  44 to 38 over 5 to 4 round trips, player 33 to 28 over 5 (build `169f17833`);
  server time at 1280 (build `082214d1d`, whose long-read paging asked for a
  row count first: a profile's reads stay under 1000 rows on the seed, so the
  later paging rule changes none of these reads), coach 272 to 188 ms cold and
  186 to 123 on the Season window, player 221 to 132 ms cold and 178 to 125 on
  Season. The hero, tabs, filter row and
  panel land within 0 px of the skeleton (the coach's hero was 34 to 103 px
  off). Raw layout shift on a switch at 1280 is 0.000 to 0.012 (was 0.006 to
  0.013); at 390 it is unchanged (0.036 to 0.093: the figure strip and the
  strokes gained card change height, the owner decisions above).

## 2026-10-01 — Phone to the board; smooth window changes (F-54, F-55)

```text
PR/commit:      agent/swap-audit
Contract IDs:   CH-5402 (behaviour refined, row unchanged)
Data impact:    none
```

- **Fix.** Changing the window no longer flashes twice and jumps: a live page
  that goes busy keeps its content (the skeleton fade-in applied to it too), and
  the first-paint reveal plays once per page instead of again when the busy
  state ends. The window switch moves on the tap; only the figures dim, and the
  header and switch stay crisp.
- **Fix (phone).** The board's figure strip, panel titles, green notes and bar
  colours; captions no longer drawn at figure size; a change that rounds to zero
  is neutral.

## 2026-09-30 — Last 10 across seasons; total-only rounds count (Q-122, Q-123)

```text
PR/commit:      agent/swap-audit
Contract IDs:   none new (the contract's intro states the rule)
Data impact:    none (reads only; no migration)
```

- **Issue.** Last 10 stopped at the season start, so a player's earlier rounds
  never showed in it or in "vs. previous 10"; a round posted as a total only was
  in no figure.
- **Fix.** Last 10 and its previous ten read across seasons (rolling 12 months).
  A total-only round counts in the scoring average, to par, trend, form, score
  line, personal best score, the pressure gap and the Rounds table, and in no
  hole-level figure. The shot read, the round cache and the putts are given only
  the rounds with their holes, so a window of totals only is "No shot-by-shot
  rounds" (CH-5301), never "didn't load" (CH-5202). The Overview figure cards,
  every Game detail section and the Rounds tab's comparison say how many rounds
  the hole stats cover. Game detail's scoring average is restated over all the
  window's rounds, so it is the headline's.
- **Checked.** Tests for the cross-season Last 10 and previous 10, the loader
  keeping and refusing the right rounds, the shot read's round list, the
  captions on desktop and phone.

## 2026-09-30 — Round filter with a Holes control: any stretch of rounds, 9 or 18 holes, every figure per 18 (owner: "make it 9 or 18")

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-5102, CH-5320 to CH-5324; CH-5305, CH-5308, CH-5313 change their words)
Data impact:    none (reads only; no migration)
```

- **Issue.** The page read only its three fixed windows, so a coach could not
  look at tournaments alone, a stretch of dates, a course or chosen rounds, and
  the 36 nine-hole rounds (5% of countable rounds) were left out with no way to
  see them (Q-90, Q-94). The owner asked for one filter on both Stats pages and
  then said "make it 9 or 18".
- **Fix.** One filter, kept in the address and shared with Team stats: round
  type, **holes** (18 holes by default, 9 holes, Both), time (the three windows
  or a From and To date, which may reach before this season), course, and Only
  these / Exclude these rounds; removable chips, Clear, a count line and a sheet
  (Done applies), desktop and phone. Every figure follows it. Per-round figures
  are per 18 holes (a nine-hole round counts as half: a 38 is a 76); rates pool
  the holes and shots; floors count whole rounds; personal bests list each
  length apart; a note says so whenever nine-hole rounds are in. The shared
  calculator is not edited: a thin adapter restates its per-round counts,
  average to par and scoring by round type when a nine-hole round is in.
  PARITY.md has the method ("Nine- and eighteen-hole rounds").
- **Also.** With no 18-hole round but 9-hole ones in the window, the page says
  where they are (CH-5324). A player's filter only ever reads their own rounds
  (Q-91; tested). SG4 and PT12 now read "waiting on the shared Tour fix (Q-93)",
  and the figures that move with that fix are listed.
- **Not built.** Tees and rating, event, home or away (no usable column; counts
  and reasons in PARITY.md).
- **Checked.** 135 new tests and 389 in the Stats set (9-only and Both cases,
  strokes gained per 18, the floors, the address, every state by its code);
  mutations of the filter (72) and of Holes (95), one equivalent survivor; axe
  (50 pages) and native-feel at 390 and 430px clean.

## 2026-09-30 — Parity with the production player stats page: every production figure is shown, or named with a reason (PARITY.md)

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-5209 to CH-5212, CH-5311 to CH-5319)
Data impact:    none (reads only: golf_holes and two golf_shots reads for the window's rounds, one getSprayChartData call; no migration)
```

- **Issue.** The owner: "scrambling, GIR, putting, all of it needs to be in
  there." Clubhouse showed four figures and two or three visuals per area; the
  production page shows the rest of each area (score mix counts, outcomes by
  par, round types, streaks, toughest holes, fairways by tee type, tee miss by
  club, where tee shots and approaches finish, GIR by par, strokes to hole out,
  misses by distance, chip proximity, up and down by miss direction, nine
  putting bands with their leave and efficiency, the break matrix, misses by
  break, the practice target, the Tour table, personal bests, this window
  against the one before, the standing strips). Under it all, Game detail's
  shot-level figures and the headline figures counted different rounds: a date
  preset (9-hole rounds included, not bounded to the season) against the 18-hole
  window.
- **Fix.** PARITY.md lists every production figure with its file and line and
  where Clubhouse shows it (shown, added, or not shown because). Each Game
  detail section gains a line saying which rounds it counts and a More detail
  disclosure (open on the desktop, closed on the phone) with the area's
  remaining figures; the Rounds tab gains the score of every round on a line,
  the personal bests and this window against the one before; the Overview table
  becomes the standing board (rows grouped, the Tour's value where there is one,
  a coach's team figure where the window's round cache has it, a floor note
  under a row with no sample); each round names its type. Every shot-level
  figure is read for exactly the window's own 18-hole rounds (their ids go to
  `getDetailedStats`, the putts, the holes, the approaches and the spray read).
- **Two corrections on the way.** Approach proximity is graded against the Tour
  on the Tour's basis (every approach, hit or missed, lay-ups left out, 10 shots
  a range); the old comparison set the green-hit finish against it, which
  flattered a player who misses greens, so the seven-band ladder keeps its
  values and loses its Tour tick. Putt bands are cut as the calculator cuts
  them, (3, 5], where they were [3, 5) (a putt of exactly 3 or 5 feet is
  common); Team stats' bands move with them.
- **Not built.** Priorities and the putting cost line (they grade against
  `COLLEGE_BENCHMARKS`), the putting sheet's D1 column (Q-88), college shading
  and hand-picked bands (values shown, ungraded), CoachHelm's patterns (P013), a
  plotted spray (production's dots are synthetic: counts shown), a team
  percentile (computed, never shown), the round-scope picker (next: the shared
  round filter).
- **Checked.** stats-parity.test (44 cases: the figures from rounds, holes and
  shots, the reads and their failures, every More detail panel, each new state
  by its code, the Rounds tab, the standing table, no D1 or college, the phone);
  33 mutations, 32 caught (the one left is a second guard behind a first, so
  each alone survives by design: a player's team pool is cut by `teamWin` and
  again by `teamRate`).

## 2026-09-30 — The Tour is the only benchmark (Q-88): no D1 anywhere

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (CH-5208's words change; its number doesn't)
Data impact:    none (reads the existing `pga_tour_value` column; no migration)
```

- **Issue.** The comparison table read "You vs. D1" with a D1 column, Game
  detail's figures, proximity ticks, scrambling and sand-save rows, par tiles
  and the make-rate curve all graded against D1, and the notes said "the biggest
  gap to D1" and "the D1 rate is".
- **Fix.** Every benchmark is the Tour's (`ChPlayerProfile.bench`, from
  `loadTourBenchmarks`; the team's own tour only). The table reads "You vs. the
  Tour" with a Tour column; Game detail says "Tour 66%", "the Tour average for
  that range", "The Tour rate is 35%". A metric the tour has no value for shows
  nothing. Home's leg marks say "Tour 66%" too (see the Home changelog).
- **Checked.** strokes-gained.test (no profile tab, for a coach or a player, and
  no phone section chip renders D1, a division or college; the Tour's values for
  the team's tour only); mutations caught for each label and for the loader's
  column and fallback.

## 2026-09-30 — Strokes gained on the player profile: legs and total on the phone, legs in the Rounds table, comparison rows, change chips, and a banner that counts rounds with shots

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-5308, CH-5309, CH-5310)
Data impact:    none (reads only; no migration)
```

### The baseline is the Tour, and every figure says so

- **Issue.** The phone's SG / round figure said "vs D1" and the desktop hero
  only "Per round"; there is no D1 strokes gained (Q-88).
- **Fix.** The hero reads "Per round vs Tour", the phone "vs Tour", the leg card
  and the comparison table "strokes gained vs Tour" (the women's Tour baseline
  for a women's team), all from `sgBaseline`. The profile loader returns `tour`.
- **Checked.** strokes-gained.test; mutations caught for both labels.

### Phone: strokes gained by leg and in total, and on every round (CH-5309)

- **Issue.** The phone profile showed only one SG number; the four legs were
  desktop-only and its rounds list had no strokes gained.
- **Fix.** A Strokes gained panel after the figures: the four legs and the
  total, the window's mean, bars on the data's own scale, a note on which legs
  lose strokes. Each round in the list carries its strokes gained (a dash when
  it has none). Nothing yet reads "No strokes gained in this window." (CH-5309).
- **Checked.** strokes-gained.test; mutations caught: the total dropped, the
  round's SG dropped.

### Desktop Rounds tab: each round's four legs next to its total

- **Issue.** The table had the total only.
- **Fix.** SG total plus SG off the tee, approach, around green and putting,
  each signed and green or amber (`ChProfileRound.sgLegs`).
- **Checked.** strokes-gained.test; mutation caught (legs removed).

### The comparison table has strokes gained (coach: against the team)

- **Issue.** The table had scoring, fairways, greens, putts and scrambling only.
- **Fix.** SG total and the four legs lead it. For a coach the team column is
  the pooled mean per round of the active team over the same window (three
  rounds with shots needed). A player's own table shows their figure against the
  Tour with no team and no D1 (there is none): the profile's rule is that a
  player is never compared with teammates (P005 PAGE.md), so the team reference
  asked for on a player's own view is not built (proposed Q-91).
- **Checked.** strokes-gained.test; a mutation that lets a player's view pool
  teammates' rounds is caught.

### Change against the previous 10 (CH-5310)

- **Issue.** Nothing said whether strokes gained was rising or falling.
- **Fix.** A chip under the hero's SG / round (and the phone figure): green up,
  amber down, grey flat, with "vs. previous 10". With nothing to compare it says
  "No earlier rounds", or "Too few earlier rounds with shots" for one or two;
  Season and Qualifiers claim nothing.
- **Checked.** strokes-gained.test (loader: a delta, none, too few, season);
  mutations caught (chip removed, previous window ignored).

### The early-read banner counts rounds with shots (CH-5308)

- **Issue.** The banner keyed on the 18-hole round count, so a player with three
  rounds but fewer than three with shots saw a silent dash.
- **Fix.** Fewer than three rounds keeps CH-5305; three or more rounds with
  fewer than three with shots shows CH-5308: "Strokes gained needs three rounds
  posted with shots. Jonah has 1 of 5 rounds with shots in this window…", on
  desktop and the phone.
- **Checked.** strokes-gained.test; mutations caught on both views.

### Make rate by distance reaches 25+ feet

- **Issue.** The curve stopped at 20 feet because the shot stats have rates past
  20 feet but no counts.
- **Fix.** The curve draws the window's putts in the bands Team stats grades (0
  to 3, 3 to 5, 5 to 10, 10 to 15, 15 to 25, 25+), counted exactly from
  `golf_shots` (`loadPutts`, shared with Team stats) with each band's D1 mark
  from the same distances. Its note says the counts are putts logged with a
  distance (the Putting section's own total counts every putt). If that read
  fails, or there are no putts, it falls back to the old five bands.
- **Checked.** strokes-gained.test (loader bands and the failed read; the
  curve's label); mutation caught.

### Bars scaled to the data

- **Issue.** The leg route clamped at ±1.4.
- **Fix.** It scales to the largest leg, rounded up to a whole stroke, at least
  1 (`sgScale`).
- **Checked.** strokes-gained.test (a −2.6 leg is 2.6 of 3 of the half height);
  mutations caught.

## 2026-09-30 — Schedule 1:1 in the hero (Clickables gap 4)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Schedule 1:1 in the hero (Clickables gap 4)

- **Issue.** A coach on a player's Stats profile had no way to plan a 1:1.
- **Fix.** Schedule 1:1 opens Calendar's editor with only that player invited
  (D-52).
- **Checked.** roster + stats-player 124/124, 2 of 2 mutations caught.

## 2026-09-30 — Tabs from the keyboard; a one-round trend; the profile skeleton

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new
Data impact:    none
```

### Fixed (with a test that fails without the fix)

- **The profile tabs had no arrow keys.** They are now one Tab stop, and the
  arrows (wrapping), Home and End move between them and select, as in the
  Segmented control (52001, reworded).
- **One round, no trend.** The phone's Scoring trend vanished under two rounds.
  With one it now says so: "One round so far: 74 on Oct 3. The trend draws from
  the second." With none it stays out.
- **A profile loaded behind the team board.** The route drew the team page's
  skeleton for a player's own stats and for a coach's `?player=`. It now draws
  the profile's shape (CH-5403): the shell's role reaches route files through
  `ClubhouseMarker`.

## 2026-09-30 — Page docs, permission proven, six bugs fixed

```text
Contract IDs:   19 new behaviour contracts: 50101, 50102, 50103, 50104, 50611, 50803, 50804, 50805, 50806,
                50901, 51201, 51202, 51401, 51501, 51901, 52001, 52101, 52301, 52401 (each named by a test
                title); two new catalog rows, CH-5901 and CH-5902 (Bridge IDs 50701 and 50702, category 07)
Actions:        6 (ACT-P005-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and CONTRACT.md answering all 25
  categories, with Permission (08) written from the route, the loader and the
  actions rather than assumed: a player opens only their own stats, a coach the
  team and any player on it.
- Fixed, each with a test that fails without the fix:
  - A failed player or membership read showed "That player isn't on your team"
    (CH-5306). The loader now throws, so the route error view offers Try again
    (50611).
  - A pending or removed team member opened as Active. The membership read now
    takes active and inactive rows only, as Roster does (50804).
  - A coach's Message opened the bare inbox. It opens the direct thread with
    that player, on desktop and on the phone (50104), as the phone spec and
    Messages' deep link (70102) say.
  - Changing the window while offline was not refused, so the request was
    attempted and the page could stay dimmed and busy, and a slow change never
    said so. It now behaves as on Team stats: refused with nothing requested
    (CH-5901), one notice after 5 seconds (CH-5902).
  - A `?player=` that was not shaped like an id reached the database, which
    rejects it, and the failed read was shown as "not on your team". The route
    now answers it as not on your team without a read (50804).
  - If the team's own row failed to load, the profile graded a women's team
    against the men's D1 averages. Its tour is now unknown and no benchmark is
    claimed (CH-5208), as Team stats does (CH-4210).
- Tests: 25 added (the route's permission and address, the loader on a fake
  Supabase client, the focus area landing, the keyboard, the offline and slow
  window changes, the busy state) and eight retitled to carry the IDs they
  prove; the meta test 52401 keeps the file honest. Each new test was
  mutation-checked.
- The catalog gains the 59xx rows, states the true empty and permission answers
  (CH-5306, CH-5307, CH-5208), and CH-5208 and CH-5402 now name tests (they said
  existing and preview).
- The checklist's Offline or slow network box is ticked, with its evidence.

### Found and not fixed

- `createFocusArea` (shared action, `actions/development.ts`): stores the
  `coach_id` the browser sends instead of the caller's own, and skips its roster
  check when the coach has no organisation or no active team (row-level security
  remains the lock). Fixed 2026-10-08, see the entry at the top.
- The profile has no profile-shaped loading state: `stats/loading.tsx` cannot
  read the address, so it draws Team stats' shape, and a profile's taller hero
  moves it.
- Profile tabs are not arrow-key navigable (each is one Tab stop).
- The phone profile's scoring trend draws nothing with fewer than two rounds,
  and says nothing.
- A coach's Back to Team and the Previous and Next links do not check for
  offline the way the window switch now does.
- v2 draws Stats with no rounds ever as a whole-page empty, "No stats yet"
  (D-71); not built, owner decision.

### Verification

- `npx vitest run src/clubhouse/__tests__/stats-player.test.tsx` 53/53; `npm run
  -s typecheck:fast` exit 0; eslint exit 0 on the changed files. Not run in this
  pass: clubhouse:check, docs:check, build, a11y.

## 2026-09-30 — v2 phone built

- `StatsPlayerPhone`, inside `StatsPlayer` so the loader, the window change, the
  Add focus area sheet and the catalog are the desktop's: a coach's Player stats
  with Team and Share, or a player's My stats with More; three figures; Game
  detail's five sections as chips, one at a time; the scoring line; Rounds
  (five, then All N) and Development. New catalog rows CH-5002 and CH-5807; the
  gaps against the board are Q-68. Nine tests, each mutation-checked.

## 2026-09-29 — Fidelity pass and `?tab=`

- Strokes gained by leg is the design system's StrokesGainedRoute, the Rounds
  count its tab pill, and a coach reads "Stats › name" in the top bar.
  `?tab=overview|game|rounds|dev` opens that tab, and Roster's "All N" opens
  `window=season&tab=rounds` (D-53).

## 2026-09-29 — Desktop build

- The profile on the RLS-scoped client in one server pass, the same page for a
  coach and, with the permissions a player already has, for a player; the
  focus-area sheet on `createFocusArea`; and the state catalog CH-50xx to
  CH-58xx.
