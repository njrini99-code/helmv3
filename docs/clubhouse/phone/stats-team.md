# Phone design: Stats (team)

Status: approved. The owner's v2 phone board is the spec (D-22): `design/handoff/Coach - Stats - Mobile.html` (board "Team stats"), `m-stats.jsx` `Team`, `m.css`. It replaces the earlier draft in this file. Built 2026-09-30 as `src/clubhouse/screens/stats/StatsTeamPhone.tsx`, placed by the page frame (`StatsTeamFrame`'s `phone`), so the loader, the window change and its notices are the desktop's. The iPhone pass is open.

## Layout

| Board piece | Built as |
| --- | --- |
| Top bar "Stats" | The tab root (Stats is a coach tab, D-66); the page adds nothing to the bar |
| "Varsity · N active · countable rounds", Team stats | `.ch-stm-head`: the team, the active count, and the h1 |
| Window: Last 10, Season, Qualifiers | The desktop `WindowSwitch`, through the frame's window change (offline refusal CH-4901, slow notice CH-4902) |
| Four figures with changes | Scoring avg, GIR, Putts, Scrambling from the loader's figures; the change is green when better and amber when worse (D-42) |
| Scoring trend with a dashed mean | `ScoreLine` on the team's weekly scoring average, with the first and last week and a one-line reading |
| Strokes gained vs D1, by leg | Bars either side of zero from the loader's `legTotals` (the team's strokes gained per round by leg over the window) against the baseline the loader names, with one sentence on which legs lose strokes |
| Players, sorted by Avg or SG | Every player with a round: avatar, rounds, scoring average, strokes gained ("Early read" under three rounds); a row opens their stats |
| Team putting | Make rate by distance with the D1 mark; a band under D1 with 10 or more putts is amber; the desktop's putting note |

## Differences from the board (Q-68)

- **Handicap** in each player row: the team loader doesn't read handicaps, so the row shows rounds only. Adding it is one column on the roster read.
- **Season bests** and **Export** stay on desktop: the board has neither, and an export on a phone has nowhere useful to land.
- **Trend note**: the board's second sentence ("The last three rounds held under 73.6") is not generated; the reading says the change across the window.

## States

The failed reads are the desktop's (CH-4201, CH-4202, CH-4203). No rounds in the window: CH-4301 with Show the season (CH-4302 for qualifiers). A leg chart with nothing: CH-4303. No players: CH-4305. No putts: CH-4306. Each section crashes on its own (CH-4204 to CH-4207).

## Gestures and haptics

A selection tick on a window or sort change (CH-4701, CH-4703). Rows press with the shared press. Reduced motion turns the press off.
