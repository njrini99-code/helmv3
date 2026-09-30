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

None for this page beyond the foundation's v2 changes (motion, haptics, page empty state).

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

- D1 is shown only where `golf_pga_standards` has the metric (greens in regulation, the approach
  proximity and scrambling bands, the putting make-rate bands and a few scoring rates). The prototype's
  prediction card, its "vs tour" figures and D1 marks for fairways and putts per round have no source and
  are left out.
- The scoring chart has no Season best marker and no par meta; both wait for season-best and course-par
  data per window.
- Strokes gained by leg is the design system's StrokesGainedRoute, and the Rounds count is its tab pill.
- On the phone, the board's trend phrase ("Down 1.2") is the signed change, labelled "Newer rounds".

## Existing backend capabilities used

`createFocusArea` (`src/app/golf/actions/development.ts`) to propose a focus area, and
`getDetailedStats` (`src/app/golf/actions/stats-data.ts`) for the shot-level detail, which answers empty
to anyone who is neither the player nor their coach. Everything else is read by `loadPlayerProfile` on
the caller's own database session. WIRING.md lists the tables.

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

The prediction card, "vs tour" figures, D1 marks with no source, a Season best marker on the scoring
chart, previous or next player and the comparison table on the phone.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the session, the Supabase client, the server actions)
```
