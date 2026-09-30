# P004 — Stats (team): wiring map

## Entry point

```text
Route:                   /golf/dashboard/stats (coach) and the old address /golf/dashboard/stats/team
Pages:                   src/app/golf/(dashboard)/dashboard/stats/page.tsx (isClubhouseFor -> Clubhouse, else Fairway)
                         src/app/golf/(dashboard)/dashboard/stats/team/page.tsx (a non-coach is sent to /stats;
                         isClubhouseFor('coach') -> the same route with no parameters, else Fairway)
Address:                 the round filter: window, type, holes, from, to, course (repeated), only, skip (see P005's WIRING);
                         the old address /stats/team carries none
Clubhouse route adapter: src/clubhouse/routes/stats.tsx ClubhouseStatsRoute (session, resolveClubhouseTeam;
                         no team -> StatsNoTeam, CH-4309; a player -> their profile, P005; a coach with no
                         ?player= -> StatsTeam)
Server loader:           src/clubhouse/data/stats-team.ts loadTeamStats (with data/stats-common.ts and
                         data/season.ts; each failed read logs through chLogServer('stats', …) and never throws)
Screen:                  src/clubhouse/screens/stats/StatsTeam.tsx (server) -> StatsTeamIslands.tsx (client
                         islands) | StatsTeamPhone.tsx (useChPhone, 820px)
Skeleton:                src/clubhouse/screens/stats/StatsSkeleton.tsx (CH-4401), shown by both loading.tsx files
                         through ClubhouseSwitch
Route error:             both error.tsx files (RouteErrorBoundary, the shell's route error view)
```

## End-to-end graph

```text
UI (StatsTeam on the server; the islands: switch, Export, Try again, trend, legs, grid; StatsTeamPhone)
↓
Action (go(window), exportCsv, RetryNotice, a player link)
↓
Client controller: StatsTeamFrame (offline refusal CH-4901, slow notice CH-4902, busy CH-4402, chTrail),
                   router.push / router.refresh inside useTransition
↓
Server render: stats/page.tsx -> ClubhouseStatsRoute -> loadTeamStats (one pass, RLS-scoped client)
↓
Data: golf_teams, golf_team_members, golf_players, golf_rounds, golf_round_stats_cache, golf_shots,
      golf_pga_standards
↓
Contract outcomes: CONTRACT.md (Bridge IDs 4ccii, catalog CH-4xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/stats-team.test.tsx
```

## Actions

Each action's record is in `config/clubhouse/pages/P004-stats-team.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Team stats writes nothing to the server:
its actions change what is on screen or download a file. Choosing a leg, focusing a player, the Strokes
gained and Scoring lens, and the phone's Avg and SG sort are local state and have no action record.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P004-CHANGE-WINDOW | The Last 10, Season, Qualifiers switch (desktop and phone) | `go` in `StatsTeamFrame` | `loadTeamStats` (the server render the new address triggers) | the tables above | address 40102 · busy 40301 · offline 40701 · slow 40702 |
| ACT-P004-SHOW-SEASON | Show the season, in an empty window | `ShowSeason` → `go('season')` | `loadTeamStats` | the tables above | empty 40401, 40402 · busy 40301 · offline 40701 |
| ACT-P004-EXPORT | Export | `exportCsv` in `TeamHeadActions` | none (a Blob and a download) | none | names as text 40501 · lands 40901 · blocked 40601 |
| ACT-P004-OPEN-PLAYER | A grid row, a Season best, a phone row | a link from `teamPlayerHref` (keeps the window) | `loadPlayerProfile` (P005) | golf_players, golf_team_members | the coach's own team 40802 |
| ACT-P004-RETRY-READ | Try again on a failed-read notice | `RetryNotice` → `router.refresh` | `loadTeamStats` | the tables above | recovery 41401 · rounds 40602, round figures 40603, putts 40604 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/stats/StatsTeam.tsx` | The server-rendered page: header, notices, the empty card, figures, putting, season bests | 40101, 40401, 40402, 40407, 40602 to 40604, 40605, 40608, 40609 |
| `screens/stats/StatsTeamIslands.tsx` | The client islands: `StatsTeamFrame` (window and filter changes: the offline refusal, the slow notice, the new address), `TeamHeadActions`, `ShowSeason`, `TeamFilter`, `TeamFilterEmpty`, `RetryNotice`, `TeamCharts` (trend, leg cards, grid) | 40301, 40403 to 40405, 40408, 40601, 40606, 40607, 40701, 40702, 41601, 41602 |
| `screens/stats/StatsTeamPhone.tsx` | The phone view and `ScoreLine` (also used by the player's phone profile) | 41901, 41805 |
| `screens/stats/StatsSkeleton.tsx` | The route skeleton (shared with the profile) | 40201 |
| `screens/stats/WindowSwitch.tsx` | The switch (with a Custom pill while a date range is on), the words for each window and `changeWords` | 40701, 40702 |
| `screens/stats/StatsFilter.tsx` | The round filter: Filter button, chips, count line, the per-18 note, the sheet (with Holes), `FilterEmpty`, `EarlyRead`, `NineHint` (shared with the profile) | CH-4101, CH-4313 to CH-4319 |
| `screens/stats/charts.tsx` | `FigureCards`, `YardagePage`, `PuttingRings` (shared with the profile) | 41803 |
| `screens/stats/links.ts`, `legs.ts`, `notes.ts` | The player link, the leg order for client code, the putting note | none |
| `routes/stats.tsx` | `ClubhouseStatsRoute`, `StatsNoTeam`, `NotOnTeam` | 40409, 40801, 40802 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | `StatsTeamFrame` |
| `src/clubhouse/lib/haptics.ts`, `track.ts` (`chReport`, `chTrail`), `use-action.ts` (`isOffline`, `CH_SLOW_SAVE_AFTER` only) | Clubhouse | the islands |
| `next/navigation` `useRouter`, React `useTransition` | framework | `StatsTeamFrame`, `RetryNotice` |

There are no realtime hooks and no shared UI hooks: the page is read once per render.

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| loadTeamStats, loadPutts, seasonBests | `src/clubhouse/data/stats-team.ts` | Existing | the team's figures, trend, grid, putting and bests |
| loadSeasonRounds, summarizePlayer | `src/clubhouse/data/season.ts` | Existing (shared with Home and Roster) | the season's countable rounds |
| roundsInWindow, previousWindow, loadRoundCache, loadTourBenchmarks, parseWindow | `src/clubhouse/data/stats-common.ts` | Existing (shared with the profile) | windows, per-round figures, Tour benchmarks |
| resolveClubhouseTeam | `src/clubhouse/routes/team.ts` | Existing | the caller's own team |

No server action is called from this page.

## Data resources

### DATA-TEAM-STATS

```text
Tables:   golf_teams (name, gender), golf_team_members (status active, joined to golf_players),
          golf_players (id, first_name, last_name), golf_rounds (completed, not test, countable, this
          season), golf_round_stats_cache, golf_shots (putt_distance_feet, putt_made), golf_pga_standards
RPCs:     none
Storage:  none
Realtime: none
Cache:    none; the page is read again on each window change and Try again
RLS:      the caller's own database session throughout; no service role
Read path:  loadTeamStats on the server, one pass (team and roster together, the rounds, then the round
            figures, putts and Tour benchmarks together)
Write path: none
```

## Held dependencies

None.

## Impact notes

- The round filter (2026-09-30): `loadTeamStats` takes `filter` (the window alone when absent) and returns `filter` and
  `filterOptions`; every `roundsInWindow` / `previousWindow` call became `roundsInFilter` / `previousInFilter` /
  `earlierInFilter`. A custom range before the season widens the rounds read (`loadSince`); the season bests and the
  cache and putt reads are arranged so that only the bests stay season-only. `data/stats-filter.ts` is pure and shared
  with the profile (P005).
- Holes (2026-09-30): the filter carries `holes` (18, 9 or all). `data/stats-weight.ts` (pure; shared with the profile) holds
  the weights: `weightedMean`, `effectiveRounds`, `effectiveCount`, `summarizeWindow`. `loadTeamStats` takes every per-round
  mean through `weightedMean`, reads the round cache for every loaded round of either length, returns `roundsEffective`
  (the early read's whole rounds), and keeps the season bests to 18-hole season rounds. The grid's `total` and `change` use
  whole-round floors. No new table or column.

- `charts.tsx`, `WindowSwitch.tsx`, `notes.ts`, `ScoreLine` and `StatsSkeleton` are shared with the player
  profile (P005): a change there changes both pages.
- `season.ts` is shared with Home and Roster (their averages and form read the same rounds), and
  `stats-common.ts` with the profile. `parseWindow` is read by the route for both pages.
- The window is the address: `/golf/dashboard/stats?window=season`. Last 10 is the bare address, so a link
  copied from Team stats stays short.
- A grid row, a Season best and a phone row link to `/golf/dashboard/stats?player=<golf_players.id>` and keep
  the window; what happens there is P005's contract.
- Strokes gained (2026-09-30): `loadTeamStats` adds `tour`, `sgChange`, `sgRounds`, `team.sgMean`/`scoreMean` and
  each player's `sgMean`/`scoreMean`, and a first figure ("Team SG per round") in `figures`; the shared
  baseline label, bar scale and tint are `src/clubhouse/lib/sg.ts`. `loadPutts`, the putting bands and
  `sgChange` moved to `stats-common.ts` so the player profile reads the same bands. No new table or column.
