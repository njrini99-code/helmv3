# Phone design: Stats (team)

<!-- clubhouse:release-audit:start -->
## Phone acceptance audit — 2026-10-06

Team Stats periods, comparisons, filters and focus-area sheets. Check
period-change layout stability, filter date controls, long course names and
empty/error/loading geometry.

See [current all-page evidence](../ALL_PAGE_AUDIT.md#p004-stats-team).
Existing checklist ticks and catalog identifiers retain their recorded scope.
Automated browser checks do not replace physical keyboard, gesture or
assistive-technology acceptance.
<!-- clubhouse:release-audit:end -->

Status: approved. The owner's v2 phone board is the spec (D-22): `design/handoff/Coach - Stats - Mobile.html` (board "Team stats"), `m-stats.jsx` `Team`, `m.css`. It replaces the earlier draft in this file. Built 2026-09-30 as `src/clubhouse/screens/stats/StatsTeamPhone.tsx`, placed by the page frame (`StatsTeamFrame`'s `phone`), so the loader, the window change and its notices are the desktop's. The iPhone pass is open.

## Layout

Direction A, "native analysis" (owner, 2026-10-08), with the kit interactions the owner picked: the board's pieces
recomposed as one hero figure and iOS inset groups. Same loader, window change, filter, notices and catalog.

| Piece | Built as |
| --- | --- |
| Top bar "Stats" | The tab root (Stats is a coach tab, D-66); the page adds nothing to the bar |
| "Varsity · 7 active · countable rounds", Team stats | `.ch-stm-head`: the context line in plain sentence case (never tracked), then the 34px large title the shell's bar takes once tucked |
| Window: Last 10, Season, Qualifiers, and the filter | The desktop `WindowSwitch` and the filter key on one row (F-42), through the frame's window change (CH-4901, CH-4902) |
| The hero | The scoring average at 64px, its change (green better, amber worse, none when it rounds to zero) and what the loader says it is against ("vs. previous 10"); a window with no comparison holds the line empty |
| Scoring trend | Directly under the hero: `TeamTrendChart` (Recharts, on its own chunk, never on desktop) on the team's last ten round days, lower scores higher, the mean dashed, the newest day marked; a finger on it reads a round day. The page holds the 340:120 box and the written reading (CH-4805) |
| The round | Greens, putts and scrambling as an inset group: value and change, with what each is read against where the data has one (the Tour's greens, 36 putts); the hole-coverage line under it |
| Strokes gained by leg | The chosen leg's team figure (Number Flow, rolling on a pick), then the four legs and the team total as rows with bars either side of zero on the data's own scale. The rows are the leg picker (Base UI `Tabs`, vertical): a wash slides to the chosen row. Team total is the window's mean, never the legs added up |
| Players, sorted by Avg or SG | Every player with a round: avatar, rounds, scoring average and strokes gained ("Early read" under three rounds). On SG the list ranks by the chosen leg and each value rolls to it; picking a leg moves the sort to SG (CH-4703) |
| Team putting | Make rate by distance in an inset group, the Tour's rate as a mark; a band under it with 10 or more putts is amber |

## Differences from the board (Q-68)

- **Handicap** in each player row: the team loader doesn't read handicaps, so the row shows rounds only. Adding it is one column on the roster read.
- **Season bests** and **Export** stay on desktop: the board has neither, and an export on a phone has nowhere useful to land.
- **Trend note**: the board's second sentence ("The last three rounds held under 73.6") is not generated; the reading says the change across the window.

## Round filter (owner's addition, 2026-09-30)

The approved board has no filter. A Filter button sits under the window switch with the active filters as removable chips
(a Clear, and "12 rounds: tournaments, Sep 1 to Sep 29" under them); it opens the shared bottom sheet: round type, time (the
windows or a From and To date), course, and Only these / Exclude these rounds, applied on Done; Holes (18 holes, 9 holes, Both)
sits between round type and time, and a note under the count line says nine-hole rounds count per 18 holes whenever they are in.
While a date range is on the window switch shows a selected Custom pill. A row opens the player with the filter kept.
States CH-4101, CH-4313 to CH-4319.

## States

The failed reads are the desktop's (CH-4201, CH-4202, CH-4203). No rounds in the window: CH-4301 with Show the season (CH-4302 for qualifiers). A leg chart with nothing: CH-4303. No players: CH-4305. No putts: CH-4306. Each section crashes on its own (CH-4204 to CH-4207).

## Gestures and haptics

A selection tick on a window, sort or leg change (CH-4701, CH-4703); a leg picked while the sort is Avg moves it to SG with no second tick. The leg wash slides on the base ease-out and Number Flow rolls on base; reduced motion and Animations off move both at once. Rows press with the shared press. Reduced motion turns the press off.
