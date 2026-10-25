# P016 — Live rounds: wiring map

## Entry point

```text
Route:                   /golf/dashboard/live
Page:                    src/app/golf/(dashboard)/dashboard/live/page.tsx (force-dynamic; a coach with Clubhouse on ->
                         ClubhouseLiveRoute, every other case renders FeatureUnavailable in place; layout.tsx sends a
                         player Home)
Clubhouse route adapter: src/clubhouse/routes/live.tsx ClubhouseLiveRoute (session, team, the query's scope)
Server loader:           src/clubhouse/data/live-rounds.ts loadLiveRounds, loadEventScope, loadOwnLiveRound; each failed read
                         logs through chLogServer('live', …) and is flagged (`error`), never shown as nobody out
Shared reads:            src/clubhouse/live/live-queries.ts fetchLiveSnapshot, run on the server for the first paint and in
                         the browser for the 20 second poll (the viewer's own session and RLS both times)
Home:                    src/app/golf/(dashboard)/dashboard/page.tsx loads the snapshot beside loadCoachHome (Promise.all);
                         CoachHome and HomePhone mount LiveNowCard
```

## Data

| Read | Table | Notes |
| --- | --- | --- |
| The live row | `golf_round_live` (held migration 1) | absent until applied: `42P01` or `PGRST205` means the v0 poll is used |
| v0 poll | `golf_rounds` with `golf_holes(...)` and `draft_data->holes`, `draft_data->startHole` | qualifier and tournament rounds only; practice needs the sharing control |
| Names | `golf_player_profiles` (function) | the one read a teammate may use for another player |
| Tracked tournament rounds | `golf_tournament_player_rounds`, `golf_tournament_rounds`, `golf_tournaments` | absent until the tournaments migration: nothing is tracked then |
| Event scope | `golf_events` | `?event=` narrows by the event's day (team zone) and course |

Nothing here writes. The save path (`save_partial_round_atomic`, `round-partial.ts`, `RoundTracking.tsx`, `draft_data`)
is not changed.

## Tests

Listed in the manifest. The words are pinned by `src/clubhouse/__tests__/live-rounds-copy.test.ts`.
