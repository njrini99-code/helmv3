# P005 — Stats (player): design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): Coach - Stats.html, Coach - Stats - Mobile.html
          v1: Stats.html, stats.jsx, stats-game.jsx, stats-game.css, stats-sg.jsx, stats-sheet.jsx,
          screenshots stats-player-01..14 (the phone board "Player · approach" is in m-stats.jsx)
Date:     2026-09-29
Status:   approved (the phone design is the approval, D-22)
```

## Design objective

A player read like a head pro reads one: who they are and four numbers, then the game in five sections,
each leading with one sentence built from the numbers under it. Nothing is graded on a sample too small
to mean anything, and a figure the app cannot produce is a dash.

## Problems being solved

A coach who wants to know why a player's scores moved has to open rounds one by one; a player has no
single place that compares their game with a benchmark and shows what the coach asked them to work on.

## User goal

Read the player's weakest leg and act on it (a focus area), or, as a player, see where the game stands.

## Visual hierarchy

Hero (avatar, name, status, class and hometown, Message and Add focus area for a coach, four figures),
the tab strip with the window switch, then the open tab. Overview: five figure cards, the scoring chart
beside strokes gained by leg, and the comparison table. On the phone: who, three figures, Game detail as
chips (one section at a time), the scoring line, then Rounds and Development stacked, because a phone
has no tabs for them.

## Components

### Reused Clubhouse primitives

`Avatar`, `Button`, `Icon`, `EmptyState` (section and page, D-71), `InlineNotice`, `Modal` (a bottom
sheet on the phone), `Segmented`, `SectionBoundary`, `ScrollRegion`, `Toast`, `PhoneTop`,
`PhoneIconAction`, `useAction`, `useChPhone`, `useChReducedMotion`, `usePageCrumbs`.

### New Clubhouse components

`StatsPlayer` (the container: hero, tabs, Overview, the rounds table, Development), `FocusAreaSheet`,
`GameDetail` (the five sections), `StatsPlayerPhone` (with `ScoreLine`, shared with Team stats' phone
view), and the charts in `charts.tsx` (`FigureCards`, `FieldTable`, `LegRoute`, `ScoreBoardTrend`,
`YardagePage`, and the ladders and compares Game detail draws), which Team stats shares.

### Modified Clubhouse components

`charts.tsx` gains `SgBars` (the phone's legs and total), `SgChangeChip` (the change against the previous 10),
the `FieldTable`'s strokes gained rows and `FigureCards`' note and tone; `StatsPlayerPhone` a Strokes gained
panel; `GameDetail` takes the window's putt bands. Otherwise the foundation's v2 changes only (motion,
haptics, page empty state).

Parity pass (2026-09-30): `GameMore` (the five sections' More detail), `detail.tsx` (`Panel`, `Empty`, `Rule`,
`More`, `Tiles`, `DataTable`, `RoundLine`, `SectorGrid`) and `RoundsExtra` (the Rounds tab's line, bests and
comparison) are new; `FieldTable` gains group headings, a signed format and the floor note; `ScoreMix` the holes
behind each result. On the phone the Rounds panel gains the same three cards above the list, and each Game
detail section's More detail is a closed disclosure.

## Actions affected

The list is `config/clubhouse/pages/P005-stats-player.json` `actions`, and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

The tab underline slides to the new tab in the base step, 260ms (CH-5601) and the focus-area sheet
rises and fades in (CH-5602); a window change or paging to another player dims the page and marks it
busy (CH-5402). Nothing counts up and nothing staggers except the shell's first-paint reveal. All from
the v2 tokens (D-64).

## Haptic intent

v2 grammar (D-70): a selection tick for a tab, a window, paging players, a Game detail section
(CH-5701); the warning pattern when a focus area is proposed with no name (CH-5702); success when a
proposal lands or a link is copied; error when a save fails, a link cannot be shared, or a window change
is refused offline. Every other tap is silent.

## Desktop

The hero and four figures, then the tabs, with the window switch beside them. The layout follows the
container, not the viewport (`stats.css`): two-column rows stack below 1080px, several grids drop to two
columns below 900px, and the hero stacks with tighter padding below 720px. Game detail has a section nav
that scrolls to each section and follows the reader.

## Phone

Approved spec `docs/clubhouse/phone/stats-player.md`, built as `StatsPlayerPhone` below 820px: a coach's
top bar is Player stats with Team and Share, a player's is My stats with More; the header, three
figures (scoring average, strokes gained, form), Game detail's chips with the desktop's panels stacked
for the chosen section, the scoring line, five rounds then All N, and Development with Add focus area.
The coach comparison table and previous or next player are desktop only (Q-68). The phone is a
different structure, never the desktop shrunk.

## Accessibility

The sections are real tabs with selected state and their panels, a coach reads "Stats › name" in the top
bar, the strokes gained route is an image with every leg in words, the hero figures are a definition
list, the focus-area field is named "What to work on" with its help or error as its description, and the
rounds table is a named region that takes focus so the arrow keys scroll it. Axe runs at 1280 and 390
(`clubhouse:a11y`).

## Data assumptions

Only data the app has (the fidelity notes in PROGRESS.md, Q-68):

- The Tour average is shown only where `golf_pga_standards` has the metric (greens in regulation, the approach
  proximity and scrambling bands, the putting make-rate bands and a few scoring rates). The prototype's
  prediction card, its "vs tour" figures for stats other than strokes gained (which has a Tour baseline) and Tour marks for fairways and putts per round have no source and
  are left out.
- The scoring chart has no Season best marker and no par meta; both wait for season-best and course-par
  data per window.
- Strokes gained by leg is the design system's StrokesGainedRoute, and the Rounds count is its tab pill.
- On the phone, the board's trend phrase ("Down 1.2") is the signed change, labelled "Newer rounds".

### Strokes gained (2026-09-30)

- Every benchmark is the Tour's; there is no D1 benchmark anywhere in Clubhouse (Q-88). Stored strokes gained is measured against the Tour: every figure says "vs Tour"
  ("vs the women's Tour baseline" for a women's team; `lib/sg.ts`).
- The hero's SG / round and the phone's figure carry a change chip against the previous 10 rounds.
- The phone has a Strokes gained panel (four legs and the total, on a scale the data sets); the Rounds tab
  has each round's four legs; the comparison table leads with strokes gained (a coach sees the team's pooled
  mean; a player sees no teammate's numbers).
- The banner says when rounds exist but too few have shots (CH-5308).
- The make-rate curve uses the same putt bands as Team stats.

### Parity with the production page (2026-09-30)

The owner asked that the page show everything the production (Fairway) player stats page shows: "scrambling,
GIR, putting, all of it." PARITY.md is the row-by-row record (every production figure with its file and line,
and where Clubhouse shows it, or why it does not). The shape:

- **Every Game detail section keeps its lead sentence and four figures, and gains a line under them saying which
  rounds it counts** ("Last 10 rounds · 10 rounds, 18 holes only (9-hole rounds are left out)"), the matched
  panels, and a **More detail** disclosure (a native `details`: open on the desktop, closed on the phone, where
  the chips still show one section at a time) holding the rest of the area: scoring numbers, outcomes by par,
  by round type, streaks and the toughest holes; fairways by tee type and club, where tee shots finish and
  fairways by round; approach numbers, strokes to hole out, misses by distance, greens by round and where
  approaches finish; short-game numbers, strokes to hole out from around the green, up and down by where the
  green was missed and the finish after the chip; putting by distance (nine bands), the break matrix, misses by
  break, the practice target, the Tour table and putts by round.
- **Every figure counts the window's own 18-hole rounds** (the ones the Rounds table lists), by passing their ids
  to `getDetailedStats`, the putts, the holes, the approaches and the spray read, rather than a date preset that
  counted a different set and 9-hole rounds (Q-90 says 18-hole only for strokes gained; the same rule now holds
  for every figure on the page, and is said under each section). A window shows the newest 100 at most, and says
  so (CH-5319).
- **Proximity against the Tour is the Tour's basis**: every approach, hit or missed, lay-ups left out, a range
  needs 10 shots (production's `aggregateApproachBuckets`). The seven-band ladder counts hit greens only, which
  is not that basis, so it carries no Tour tick and says "when the green is hit". This corrects the earlier
  comparison, which set the green-hit finish against the Tour's every-approach average.
- **The nine putting bands** are cut as the calculator cuts them, (3, 5] and so on, from the window's putts with
  exact counts; the Tour publishes five averages, so 15 to 25 feet share one and 25 feet and beyond share one,
  and 0 to 3 feet has none. A band needs 10 putts to be graded.
- **The standing table** (Overview) is the production standing board in the window: rows under Strokes gained,
  Scoring, Driving, Approach, Short game, Putting, Course management and Pressure, each with the Tour's value
  where `golf_pga_standards` has one, a coach's team figure where the window's round cache has the column, and a
  player never sees a team figure (Q-91). A row under its floor says what it needs (CH-5318).
- **The Rounds tab** gains the score of every round in the window on a line, the personal bests with their
  course and date, and this window against the one before it (the latest 10 against the 10 before, Last 10 only;
  production compares the last N days with the N before, independent of any window). Each round names its type.
- **Not built, with reasons** (PARITY.md): the priorities and the putting cost line (they grade against
  `COLLEGE_BENCHMARKS`, Q-88), the putting sheet's D1 column and footnote (Q-88), the approach efficiency matrix's
  college shading and the short-game hand-picked bands (shown as values, ungraded), CoachHelm's patterns (P013),
  the spray scatter (production's dots are synthetic: counts are shown instead), a team percentile (production
  computes one and never shows it), and the round-scope picker (the shared round filter, the next phase).

## Existing backend capabilities used

`createFocusArea` (`src/app/golf/actions/development.ts`) to propose a focus area, and
`getDetailedStats` and `getSprayChartData` (`src/app/golf/actions/stats-data.ts`) for the shot-level detail,
which answer empty to anyone who is neither the player nor their coach. The pure production libraries
`aggregateApproachBuckets` (`lib/golf/leak-map-buckets.ts`), `rankHoleAnalyses` (`lib/golf/worst-hole-ranking.ts`)
and `roundTypeFromDb` are reused as they are. Everything else is read by `loadPlayerProfile` on the caller's own
database session. WIRING.md lists the tables.

## HELD requirements

### New features

None.

### New data/schema

None.

### Owner decisions

D-53 (`?tab=` opens a tab; Roster's All N), D-42 (gains green, losses amber), D-66 (My stats in the
player's More sheet), D-70 (haptics), D-71 (page empty states), Q-68 (phone gaps, built on the
recommendation).

## Explicit non-goals

The prediction card, "vs tour" figures, Tour marks with no source, a Season best marker on the scoring
chart, previous or next player and the comparison table on the phone. From the parity pass: a plotted
spray scatter, D1 or college benchmarks anywhere, a priorities list built on college benchmarks, and a team
percentile or rank (see PARITY.md for each reason).

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the session, the Supabase client, the server actions)
```
