# P005 — Stats (player): wiring map

## Entry point

```text
Route:                   /golf/dashboard/stats?player=<golf_players.id> (coach) and /golf/dashboard/stats (player)
Page:                    src/app/golf/(dashboard)/dashboard/stats/page.tsx (isClubhouseFor -> Clubhouse, else Fairway)
Clubhouse route adapter: src/clubhouse/routes/stats.tsx ClubhouseStatsRoute (session, resolveClubhouseTeam;
                         no team -> StatsNoTeam, CH-4309; a player -> loadPlayerProfile as viewer player for
                         their own id; a coach with ?player= -> loadPlayerProfile as viewer coach, or NotOnTeam,
                         CH-5306, when the loader finds nobody or the id is not shaped like one)
Server loader:           src/clubhouse/data/stats-player.ts loadPlayerProfile (with data/stats-common.ts and
                         data/season.ts; a failed rounds, shot detail, benchmark, focus area or goal read logs
                         through chLogServer('stats', …) and never throws; a failed player or membership read
                         throws, so the route error view shows)
Screen:                  src/clubhouse/screens/stats/StatsPlayer.tsx (client; rendered on the server as desktop)
                         -> GameDetail.tsx | StatsPlayerPhone.tsx (useChPhone, 820px)
Skeleton:                src/clubhouse/screens/stats/StatsSkeleton.tsx (CH-4401), Team stats' shape
Route error:             stats/error.tsx (RouteErrorBoundary, the shell's route error view)
```

## End-to-end graph

```text
UI (StatsPlayer: hero, tabs, window switch, Overview, Game detail, Rounds, Development, FocusAreaSheet;
    StatsPlayerPhone)
↓
Action (changeWindow, tab change, Previous / Next, Message, Add focus area, Share, Try again)
↓
Client controller: changeWindow (offline refusal CH-5901, slow notice CH-5902, busy CH-5402, chTrail) with
                   router.push inside useTransition; useAction('stats.addFocusArea') for the write
                   (offline refusal CH-1903, slow notice CH-1902, error toast, haptic, chReport)
↓
Server: stats/page.tsx -> ClubhouseStatsRoute -> loadPlayerProfile (one pass, RLS-scoped client)
        and the server action createFocusArea (coach only)
↓
Data: golf_teams, golf_players, golf_team_members, golf_rounds, golf_round_stats_cache, golf_pga_standards,
      golf_player_focus_areas, golf_goals, and shot-level stats through getDetailedStats
↓
Contract outcomes: CONTRACT.md (Bridge IDs 5ccii, catalog CH-5xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/stats-player.test.tsx
```

## Actions

Each action's record is in `config/clubhouse/pages/P005-stats-player.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. The window switch has the page's own
offline and slow rows (50701, 50702; CH-5901, CH-5902); adding a focus area is refused offline by the
shell (10703).
The tab strip, the Game detail chips and the phone's All N rounds are local state and have no action record.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P005-CHANGE-WINDOW | The Last 10, Season, Qualifiers switch (desktop and phone) | `changeWindow` in `StatsPlayer` | `loadPlayerProfile` (the server render the new address triggers) | the tables above | address 50102 · busy 50302 · offline 50701 · slow 50702 |
| ACT-P005-PAGE-PLAYERS | Previous player, Next player (coach) | a link from `href` (keeps the window) | `loadPlayerProfile` | the tables above | ready 50103 · busy 50302 · not on the team 50804 |
| ACT-P005-MESSAGE-PLAYER | Message (coach; the phone header icon) | a link to `/golf/dashboard/messages?player=<id>` | none (Messages opens the thread) | none | 50104 |
| ACT-P005-SCHEDULE-PLAYER | Schedule 1:1 (coach, desktop hero) | a link to `/golf/dashboard/calendar?new=1&with=<id>` (D-52) | none (Calendar opens its editor) | none | Calendar 60103 |
| ACT-P005-ADD-FOCUS-AREA | Add focus area, Propose focus area (coach) | `submit` in `FocusAreaSheet` → `save.run` | `createFocusArea` (`actions/development.ts`) | golf_player_focus_areas | name 50501 · lands 50901 · fails 50601 · adding 50301 · text kept 51201 · page read again 51501 · coach only 50806 · offline 10703 |
| ACT-P005-SHARE-PLAYER | Share (coach, phone) | `share` in `StatsPlayerPhone` | none (`navigator.share`, else the clipboard) | none | fails 50610 |
| ACT-P005-RETRY-READ | Try again on a failed-read notice | `router.refresh` | `loadPlayerProfile` | the tables above | recovery 51401 · rounds 50602 · shot detail 50603 · development 50604 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/stats/StatsPlayer.tsx` | The container: hero, tabs, window switch, `Overview`, `RoundsTable`, `Development`, `FocusAreaSheet`, `formNote` | 50101 to 50104, 50301, 50302, 50401 to 50405, 50501, 50601 to 50608, 51601, 51602, 51701, 51702, CH-5901, CH-5902 |
| `screens/stats/GameDetail.tsx` | Game detail's five sections (chips on the phone) | 51701 |
| `screens/stats/StatsPlayerPhone.tsx` | The phone profile: header, three figures, chips, scoring line, rounds, development, Share | 50610, 51901, 51807 |
| `screens/stats/charts.tsx` | `FigureCards`, `FieldTable`, `LegRoute`, `ScoreBoardTrend`, `YardagePage`, the ladders and compares (shared with Team stats) | 51803 |
| `screens/stats/StatsSkeleton.tsx` | The route skeleton (shared with Team stats) | CH-4401 |
| `routes/stats.tsx` | `ClubhouseStatsRoute`, `NotOnTeam`, `StatsNoTeam` | 50801, 50802, 50803, 50804, CH-4309 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `isOffline`, `CH_SLOW_SAVE_AFTER`) | Clubhouse | `FocusAreaSheet`, `changeWindow` |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`), `reduced-motion.ts`, `haptics.ts`, `track.ts` | Clubhouse | throughout |
| `src/clubhouse/shell/crumbs.tsx` (`usePageCrumbs`), `shell/phone-chrome.tsx` (`PhoneTop`, `useBackFromMore`) | Clubhouse | `StatsPlayer`, `StatsPlayerPhone` |
| `next/navigation` `useRouter`, React `useTransition` | framework | `StatsPlayer` |

There are no realtime hooks: the page is read once per render, and again after a write or Try again.

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| loadPlayerProfile | `src/clubhouse/data/stats-player.ts` | Existing | the profile, in the coach or player view |
| createFocusArea | `src/app/golf/actions/development.ts` | Existing | a coach proposes a focus area (status proposed) |
| getDetailedStats | `src/app/golf/actions/stats-data.ts` | Existing | shot-level detail; answers empty unless the caller is the player or their coach |
| loadSeasonRounds, summarizePlayer | `src/clubhouse/data/season.ts` | Existing (shared with Home, Roster, Team stats) | the season's countable rounds |
| roundsInWindow, loadRoundCache, loadTourBenchmarks, parseWindow, windowFilter | `src/clubhouse/data/stats-common.ts` | Existing (shared with Team stats) | windows, per-round figures, Tour benchmarks |
| resolveClubhouseTeam | `src/clubhouse/routes/team.ts` | Existing | the caller's own team |

## Data resources

### DATA-PLAYER-PROFILE

```text
Tables:   golf_teams (gender), golf_players (id, names, graduation_year, hometown, state, handicap),
          golf_team_members (the roster check: this team, this player, active or inactive; for a coach also
          the active team), golf_rounds (the player's season, and for a coach the active team's),
          golf_round_stats_cache, golf_pga_standards, golf_shots (putt distance and result, for the make-rate
          bands), golf_player_focus_areas (active and proposed, 20),
          golf_goals (20); shot-level tables through getDetailedStats
RPCs:     none from this page (getDetailedStats checks access through the verify_coach_owns_player RPC)
Storage:  none
Realtime: none
Cache:    none; the page is read again after a write and on Try again
RLS:      the caller's own database session for every read but the shot-level detail, which getDetailedStats
          authorises itself and then reads on the service role
Read path:  loadPlayerProfile on the server, one pass
Write path: createFocusArea (a coach's insert into golf_player_focus_areas, status proposed)
```

## Held dependencies

None.

## Impact notes

- `charts.tsx`, `WindowSwitch.tsx`, `ScoreLine` (in `StatsTeamPhone.tsx`) and `StatsSkeleton` are shared with
  Team stats (P004): a change there changes both pages.
- `createFocusArea` is shared with the Fairway development screens. Found and not fixed: it stores the coach
  id the browser sends (`coach_id`) instead of the caller's own, and skips its roster check when the coach has
  no organisation or no active team (row-level security remains). Fix it in the action, not here.
- The Message link and the "All N" link from Roster (`window=season&tab=rounds`) are addresses other pages
  build; a change to `?player=`, `?tab=` or `?window=` breaks them (D-53, Messages' 70102).
- `loadPlayerProfile` throws on a failed player or membership read: the stats route has no catch, so the
  route error view is what shows.
- Strokes gained (2026-09-30): `loadPlayerProfile` adds `tour`, `sgChange`, `puttBands` (via `loadPutts` and
  `bandPutts` in `stats-common.ts`, shared with Team stats), each round's `sgLegs` and the strokes gained rows
  of `comparisons` (`sg: true`; a player's `team` is always null). `lib/sg.ts` holds the baseline label, the bar
  scale and the tint. No new table or column.
