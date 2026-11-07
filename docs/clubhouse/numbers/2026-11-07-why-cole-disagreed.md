# Why one player had three strokes-gained numbers (2026-11-07)

Traced on staging against Cole Bennett's rows. Each number is reproduced from
his rounds by hand, so these are causes, not guesses.

| Screen | Showed | Helper | Window | Round filter | Rounds behind it |
| --- | --- | --- | --- | --- | --- |
| His Home | −8.1 (tee −1.4, app −4.4) | `summarizePlayer` | Season, from Aug 1 | His own rows, practice out | 11 with shots |
| Stats, Last 10 | −7.3 | `summarizeWindow` | Newest 10 | His own rows, practice out | 8 with shots of 10 |
| Coach Team view (QA build) | +0.5 (tee +2.5, app +1.9) | `figureOver` | Season | Coach-visible rows, practice in | 3 Aug 2 practice rounds |

Baseline is not a cause: all three read the stored `strokes_gained_*` columns.

## Three separate causes

1. **Three windows.** Home was the season, Stats the newest ten, Team view the
   season as a coach could see it. Now `lastTenRounds` in `figure-window.ts`.
2. **Three filters and three calculations.** The QA build's Team view kept
   practice. Now `roundsForFigures` everywhere and `sgOver` in `stats-weight.ts`.
3. **Two sets of rows, which is why coach screens stop at Sep 26.** It is not a
   `round_type` filter. 17 of Cole's completed rounds, the three Oct 21
   Springfield tournaments among them, carry `team_id` `59527e92…`. No team with
   that id exists on staging, and he is the only player with rows stamped with
   it. RLS (`golf_rounds_select`) lets a player read his own rows whatever their
   stamp, but lets a coach read only rows stamped with the coach's team. So Cole
   sees 37 rounds and his coach sees 20.

Cause 3 is a staging data problem, so no code change can make the coach see
those rows short of widening the policy, which is a migration.

## Also found

- **Cole and Jackson's identical Stats rows.** The seed gave them the same
  strokes-gained values round for round (−11.9, −14.04, −2.9…), with Jackson's
  scores one apart. It is data, not a shared-row bug in Stats.
- **Stale `in_progress` rounds.** They count for nothing on any screen:
  `loadSeasonRounds` reads `completed` only, and `roundsForFigures` now refuses
  any other status. They stay in the player's own Unfinished list, and the
  sidebar's Resume card already ignores stale ones.
