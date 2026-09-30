# P004 — Stats (team): design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): Coach - Stats.html, Coach - Stats - Mobile.html
          v1: Stats.html, stats.jsx, stats.css, stats-sg.jsx, screenshots stats-team-01..05
          (the phone board "Team stats" is in m-stats.jsx)
Date:     2026-09-29
Status:   approved (the phone design is the approval, D-22; the copy choices are D-26)
```

## Design objective

A calm read of the team's season on the depth vocabulary: the trend is the headline, the legs say
where the strokes go, and the grid says who. Every figure states its window and its sample, and a
number the app cannot produce is a dash, never an invention.

## Problems being solved

Team numbers kept in a spreadsheet after each event: a coach cannot see the trend, cannot tell
whether a good week was luck, and cannot find the leg that costs the team the most.

## User goal

Read the team's direction, find the leg to work on, and open the player who loses the most in it.

## Visual hierarchy

Header (team, active players, window switch, Export), five figure cards, the trend (strokes gained or
scoring, with a player list beside it), the four leg cards, the player grid, then Team putting and
Season bests side by side. On the phone: four figures, the scoring line, strokes gained by leg as
bars, the players as rows, and Team putting.

## Components

### Reused Clubhouse primitives

`Avatar`, `Button`, `Icon`, `EmptyState` (section and page, D-71), `InlineNotice`, `Segmented`,
`SectionBoundary`, `Skeleton`, `Toast`, `useChPhone`, `useChPress`, `useChReducedMotion`.

### New Clubhouse components

`StatsTeam` (the server-rendered page: figures, putting, season bests), `StatsTeamFrame`,
`TeamHeadActions`, `TeamCharts`, `ShowSeason` and `RetryNotice` (the client islands in
`StatsTeamIslands.tsx`), `StatsTeamPhone` (with `ScoreLine`), `StatsSkeleton`, `WindowSwitch`, and the
charts in `charts.tsx` (`FigureCards`, `YardagePage`, `PuttingRings`), which the player profile shares.

### Modified Clubhouse components

None for this page beyond the foundation's v2 changes (motion, haptics, page empty state).

## Actions affected

The list is `config/clubhouse/pages/P004-stats-team.json` `actions`, and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

Changing the window dims the page to 60% for the quick step (180ms) and marks it busy until the new
window lands (CH-4402); focusing a player brings their line forward in green while the others fade
back (CH-4601), and choosing a leg takes the green ring and highlights its grid column (CH-4602).
Nothing counts up and nothing staggers except the shell's first-paint reveal. All from the v2 tokens
(D-64).

## Haptic intent

v2 grammar (D-70): a selection tick for choosing a window, a lens, a leg, a player, or a sort
(CH-4701, CH-4703); success when an export lands and error when it is blocked (CH-4702) or a window
change is refused offline (CH-4901). Every other tap is silent.

## Desktop

Five figure cards, the trend and the leg cards full width, the grid, then putting and bests in two
columns. The layout follows the container, not the viewport (`stats.css`): the two-column row stacks
below 1080px, the figure cards go to two columns below 900px, and the padding tightens below 720px.
The page never scrolls sideways.

## Phone

Approved spec `docs/clubhouse/phone/stats-team.md`, built as `StatsTeamPhone` below 820px: the
window switch, four figures with their change (green when better, amber when worse, D-42), the
scoring line with its mean, strokes gained by leg as bars either side of zero, the players sorted by
Avg or SG (a row opens their profile), and Team putting. Season bests and Export stay on desktop
(Q-68). The phone is a different structure, never the desktop shrunk.

## Accessibility

The trend chart is an image with a written summary and the player list beside it is its values as
buttons, the strokes gained grid is a table with a header for every value, loss amber on a tinted cell
is darkened to hold 4.5:1, and the phone's scoring line reads as one sentence. Axe runs at 1280 and
390 (`clubhouse:a11y`).

## Data assumptions

Only data the app has, stated where the design differs (D-26, Q-68, and the fidelity line in
PROGRESS.md):

- The strokes gained line is measured against the tour baseline (the women's baseline for a women's
  team), not the handoff's "vs. D1" (there is no D1 benchmark: Q-88); the subtitle says so. The Tour average is shown only where
  `golf_pga_standards` has the metric: greens in regulation and putting make rates.
- The putting rings use the Tour benchmark's bands (0 to 3, 3 to 5, 5 to 10, 10 to 15, 15 to 25 feet); putts
  of 25 feet and longer are read but not drawn and not counted in the meta.
- The Scoring lens has no Season best marker, because the chart shows at most the last ten weeks.
- A player's row counts their rounds in the window, not the season.
- Not shown, no source: the prototype's prediction card and its "vs. tour" figures; birdies per round
  and overall scrambling have no Tour metric. The phone's player rows carry no handicap (the team
  loader does not read it).

## Existing backend capabilities used

The RLS-scoped Supabase client only, read on the server in one pass by `loadTeamStats`: no server
action, no service role. WIRING.md lists the tables.

## HELD requirements

### New features

None.

### New data/schema

None.

### Owner decisions

D-23 (the old address renders this page in place), D-24 (a crash on the server render stays in its
section), D-25 (animation features load lazily), D-26 (four copy choices kept), D-66 (Stats is a coach
tab), D-70 (haptics), D-71 (page empty state), Q-68 (phone gaps, built on the recommendation).

## Strokes gained (2026-09-30)

- The figure row leads with **Team SG per round**: the window's mean per round, signed, with a change chip
  against the previous 10 and "vs Tour" under it (a women's team: "vs the women's Tour baseline"). Six
  cards in six columns; the skeleton draws six.
- Every strokes gained headline is the window's mean, not the latest week: the four leg cards, the team
  and player figures beside the trend. The trend's dashed line and the chart are weekly; the caption says
  the names show the window average.
- Bars (the phone's legs and total, the grid's tint) are scaled to the data: the largest value shown, rounded
  up to a whole stroke, at least 1, symmetric about zero. Gains green, losses amber.
- The notes read a change as a change ("up about 1.0 a round since Aug 30").
- Every benchmark is the Tour's (`golf_pga_standards.pga_tour_value`, the LPGA row for a women's team); there is no D1 benchmark anywhere in Clubhouse (Q-88). Stored strokes gained is measured against the Tour and is always labelled so.

## Round filter (2026-09-30, phase 3)

One filter for every figure, shared with the player profile (P005) and kept in the address, so a link, a refresh and the pager all keep it
(`?window=`, `type=`, `holes=`, `from=` and `to=`, `course=` repeated, `only=` or `skip=`; defaults are left out). PARITY.md (P005),
"The round filter", has the order rounds are selected in, the dimensions and what was left out with the counts.

- **Holes (owner, 2026-09-30: "make it 9 or 18"; Q-94 superseded).** The filter's Holes control reads 18 holes (the default),
  9 holes or Both. Every figure follows it, by one method (PARITY.md, "Nine- and eighteen-hole rounds": per-round figures per 18 holes, a nine-hole round counting as half, rates pooling the holes, floors in whole rounds). Here: Scoring average, putts and birdies a
  round, Team SG per round, the legs, the weekly lines and each player's average and strokes gained are per 18 holes;
  greens, scrambling and the putting rings pool the holes and shots. A player's strokes gained needs three whole rounds
  with shots, the grid's change four, the previous 10 three, and an early read counts whole rounds too (four 9-hole rounds
  are two). Season bests stay 18-hole season rounds. "Last 10" under Both is each player's ten newest rounds of either
  length. A note under the count line says so whenever nine-hole rounds are in (CH-4318).
- **What it reads.** Every figure: the six cards and their changes, the trend, the leg cards, the grid, the putting
  rings, the phone's players and putting. The filter applies to each player on their own rounds ("Last 10" is each
  player's ten newest matching rounds) and to the team's figures pooled from them; "vs. previous 10" is the ten matching
  rounds before, for a range or picked rounds there is none. Season bests stays the whole season's and says so while a
  filter is on (CH-4317).
- **The control.** As on the profile: a Filter button with the count of filters on, removable chips, Clear, the count
  line ("12 rounds: tournaments, Sep 1 to Sep 29") and the sheet. "Pick rounds" lists every player's rounds (newest 200,
  with the player named) and "Only these" / "Exclude these" choose among the ones matching the other choices.
- **Links and export.** A grid row, a Season best and a phone row open the player's profile with the filter kept. The
  CSV is named for the filter ("varsity-stats-last10-filtered.csv").
- **States.** No round matches: "No rounds match these filters" with Clear filters (CH-4313), in place of the first-run
  page and of CH-4301 / CH-4302; fewer than three whole rounds: an early-read note above the figures (CH-4314); the sheet's
  range error (CH-4101), nothing to pick from (CH-4315), a list cut at 200 (CH-4316); nine-hole rounds in: the per-18 note
  (CH-4318); no 18-hole round but 9-hole ones posted: where they are (CH-4319), above CH-4301. D-71's first-run page is for
  no round of either length, so a team with only 9-hole rounds this season gets CH-4301 and the hint, not "No stats yet".
- **Phone.** As on the profile: the bar under the window switch, the standard bottom sheet (the approved phone board has
  no filter; this is the owner's addition).

## Explicit non-goals

The team stat sheet (the owner removed it), the prediction card, "vs. tour" figures for anything but strokes gained (which is stored against the Tour), a Season best
marker on the Scoring lens, handicap on the phone rows, Season bests and Export on the phone.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the session, the Supabase client, the round rules)
```
