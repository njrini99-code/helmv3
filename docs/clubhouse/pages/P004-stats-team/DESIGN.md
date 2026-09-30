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
  team), not the handoff's "vs. D1"; the subtitle says so. D1 is shown only where
  `golf_pga_standards` has the metric: greens in regulation and putting make rates.
- The putting rings use the D1 seed's bands (0 to 3, 3 to 5, 5 to 10, 10 to 15, 15 to 25 feet); putts
  of 25 feet and longer are read but not drawn and not counted in the meta.
- The Scoring lens has no Season best marker, because the chart shows at most the last ten weeks.
- A player's row counts their rounds in the window, not the season.
- Not shown, no source: the prototype's prediction card and its "vs. tour" figures; birdies per round
  and overall scrambling have no D1 metric. The phone's player rows carry no handicap (the team
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
- Stored strokes gained has no D1 value (`golf_pga_standards` has none); it is always labelled against the Tour.

## Explicit non-goals

The team stat sheet (the owner removed it), the prediction card, "vs. tour" figures for anything but strokes gained (which is stored against the Tour), a Season best
marker on the Scoring lens, handicap on the phone rows, Season bests and Export on the phone.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the session, the Supabase client, the round rules)
```
