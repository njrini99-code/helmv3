# P002 — Home: wiring map

## Entry point

```text
Route:                   /golf/dashboard
Page:                    src/app/golf/(dashboard)/dashboard/page.tsx (isClubhouseFor -> Clubhouse, else Fairway).
                         There is no route adapter in src/clubhouse/routes/: the page branches on the session itself.
Coach:                   flag on -> no team: CoachHomeNoTeam (CH-2307); else loadCoachHome -> CoachHome
Player:                  player profile and flag on -> resolveClubhouseTeam (src/clubhouse/routes/team.ts);
                         no team: PlayerHomeNoTeam (CH-2313); else loadPlayerHome -> PlayerHome
Server loaders:          src/clubhouse/data/home.ts loadCoachHome (and the shared homeClock, loadHomeWeek,
                         latestWithHoles); src/clubhouse/data/player-home.ts loadPlayerHome
                         (each failed read logs through chLogServer('home', …) and never throws)
Screens:                 CoachHome.tsx -> HomeActions, Week, LatestRound, Leaderboard | HomePhone.tsx (useChPhone, 820px)
                         PlayerHome.tsx -> Week, LatestRound (mine), PlayerGame | PlayerHomePhone.tsx
Skeleton:                src/clubhouse/screens/home/HomeSkeleton.tsx (CH-2401), used by dashboard/loading.tsx through
                         ClubhouseSwitch (the same skeleton for both roles and widths)
```

## End-to-end graph

```text
UI (CoachHome / HomePhone, PlayerHome / PlayerHomePhone, Week, LatestRound, Leaderboard, PlayerGame, Countdown)
↓
Action (a link, the latest-round pager, the Scoring window, the N key, Try again: Home has no write)
↓
Client controller: none for data (no client fetch); useNow and Countdown keep the clock; RefreshNotice -> router.refresh
↓
Server: the dashboard page (session, flag, team) -> loadCoachHome | loadPlayerHome (the signed-in user's own client)
↓
Data: golf_team_settings, golf_team_members, golf_players, golf_teams, golf_coaches, golf_conversations, golf_events,
      golf_event_attendance, golf_rounds, golf_holes, golf_round_stats_cache, golf_pga_standards
↓
Contract outcomes: CONTRACT.md (Bridge IDs 2ccii, catalog CH-2xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/home.test.tsx (the route, Coach Home, the coach loader), player-home.test.tsx (Player Home,
       its loader, the countdown)
```

## Actions

Each action's record is in `config/clubhouse/pages/P002-home.json` (`actions`), and the whole list is readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Home has no write, so no action goes through `useAction` and none has an offline refusal of its own (the shell's Try again offline is 10704).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P002-OPEN-COACH-HOME | Opening `/golf/dashboard` as a coach | `GolfDashboardPage` (coach branch) | `loadCoachHome` | the coach's team, see Data | ready 20101 · loading 20201 · role 20801 · team 20802 · no team 20407 · first run 20408 · week fails 20601 · timezone 20618 |
| ACT-P002-OPEN-PLAYER-HOME | Opening `/golf/dashboard` as a player | `GolfDashboardPage` (player branch) | `loadPlayerHome` | the player's own rounds and the team's week | ready 20102 · loading 20201 · role 20801 · team 20802 · no team 20413 · first run 20412 · own rounds 20803 · names 20804 · rounds fail 20615 · scrambling 20616 |
| ACT-P002-MESSAGE-TEAM | Message team (coach header) | link built in `HomeActions` | the team chat id from `loadCoachHome` | golf_conversations | links 20103 · chat does not load 20608 |
| ACT-P002-NEW-EVENT | New event, or N (coach header) | `HomeActions` (link and key handler) | none | none | links 20103 · N 21801 · light tap 21702, 21703 |
| ACT-P002-QUICK-ADD-EVENT | Quick event types, Add event, Plan (coach phone) | links in `NoEvents` and `Today` | none | none | links 20103 · nothing ahead 20409 · taps 21703 |
| ACT-P002-OPEN-EVENT | Up next, a Today row | `UpNext`, `Today` | none | none | links 20103 · clock 20301 · breadcrumb 22301 |
| ACT-P002-OPEN-WEEK-DAY | A day in the week strip (phone) | `WeekStrip` | none | none | links 20103 · read as words 21802 |
| ACT-P002-PAGE-ROUNDS | Previous, Next round | `step` in `LatestRound`; the pager in `PlayerHomePhone` | none | none | tick 21701, 21703 · position announced 21804 |
| ACT-P002-OPEN-ROUND | A latest round (coach phone) | `RoundSheet` via `Rounds` | none | none | links 20103 · tick 21703 · breadcrumb 22301 · posted as a total 20403 · holes fail 20603 |
| ACT-P002-OPEN-PLAYER-STATS | A leaderboard row, the latest round's stats link (coach) | links in `Leaderboard.Row` and `LatestRound` | none | none | links 20103 · hover and press 21602 |
| ACT-P002-MESSAGE-COACH | Message coach (player) | link built by `messageCoachHref` | `coachFor` (in `loadPlayerHome`) | golf_teams, golf_coaches | coach found 20805 · links 20103 · tap 21703 · Messages side 70801 (CH-7001) |
| ACT-P002-CHOOSE-SCORING-WINDOW | Rounds shown: Last 5, 10, 20 (player) | `Segmented` in `Scoring` | none | none | tick 21703 · too few rounds 20410 |
| ACT-P002-TRY-AGAIN | Try again on a notice | `RefreshNotice` -> `router.refresh` | none | none | 21402 · pending 21401 · offline 10704 · week fails 20601 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/home/CoachHome.tsx` | Coach Home: header, sheet, leaderboard; the phone switch; `HomeFirstRun`, `CoachHomeNoTeam` | 20101, 20407, 20408, 20605 to 20607 |
| `screens/home/HomeActions.tsx` | Message team, New event, the N key | 20103, 21801, 21702 |
| `screens/home/Week.tsx` | This week: the days and the agenda (shared by both roles; `between` holds the player's Up next) | 20401, 20601, 20609 |
| `screens/home/LatestRound.tsx` | The latest round, paged (shared; `mine` for the player) | 20402, 20403, 20602, 20603, 21701 |
| `screens/home/Leaderboard.tsx` | Season leaderboard | 20404 to 20406, 20604, 20607 |
| `screens/home/HomePhone.tsx` | Coach phone Home: hero, Up next, Today, Form, WeekStrip, Rounds, RoundSheet (`UpNext`, `Today`, `WeekStrip` are shared with the player's phone) | 20409, 20611 to 20614, 21901 |
| `screens/home/PlayerHome.tsx` | Player Home: header, sheet with Up next (`DeskNext`), Scoring and parts of the game; `PlayerFirstRun`, `PlayerHomeNoTeam` | 20102, 20412, 20413, 20805 |
| `screens/home/PlayerHomePhone.tsx` | Player phone Home, with the paged `Latest` | 20409, 20615, 21901 |
| `screens/home/PlayerGame.tsx` | Scoring (chart, four figures, a sentence) and By part of the game | 20410, 20411, 20615 to 20617 |
| `screens/home/Countdown.tsx` | The player's countdown | 20301, 21807 |
| `screens/home/HomeSkeleton.tsx` | Route skeleton | 20201 |
| `screens/home/model.ts`, `player-links.ts` | Derived copy (the brief, agenda details); Message coach, Post a round, My stats links | 20103, 20805 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | CoachHome, PlayerHome |
| `src/clubhouse/lib/use-now.ts` (`useNow`, once a minute) | Clubhouse | HomePhone, PlayerHomePhone, PlayerHome (`DeskNext`) |
| `src/clubhouse/shell/phone-chrome.tsx` (`usePhoneHero`) | Clubhouse shell | HomePhone, PlayerHomePhone |
| `src/clubhouse/lib/reduced-motion.ts`, `motion.ts` (`chSwap`), `haptics.ts`, `track.ts` | Clubhouse | LatestRound, the phone screens |

## Services / server actions

Home calls no server action. The loaders are the services.

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| loadCoachHome | data/home.ts | New (Clubhouse) | Coach Home in one server pass |
| loadPlayerHome, coachFor | data/player-home.ts | New (Clubhouse) | Player Home in one server pass; the coach Message coach names |
| homeClock, loadHomeWeek, latestWithHoles | data/home.ts | New (Clubhouse) | The timezone, greeting and date; the week; the latest rounds with their holes. Shared by both loaders |
| loadSeasonRounds, summarizePlayer, isFull18 | data/season.ts | New (Clubhouse) | Season rounds and the derived figures, shared with Roster and Stats |
| loadRoundCache, loadD1, tourForGender | data/stats-common.ts | New (Clubhouse) | Per-round aggregates and D1 benchmarks, shared with Stats |
| resolveClubhouseTeam | routes/team.ts | New (Clubhouse) | The player's team, throwing when the membership read fails |

## Data resources

### DATA-COACH-HOME

```text
Tables:   golf_team_settings (timezone), golf_team_members joined to golf_players (the roster), golf_conversations
          (the team chat), golf_events and golf_event_attendance (the week), golf_rounds (the season), golf_holes
RPCs:     none
Storage:  none
Realtime: none
Cache:    none; the page is force-dynamic
RLS:      the signed-in user's own client; policies were not re-read for this pass
Read path:  loadCoachHome, on the server, for the coach's active team
Write path: none
```

### DATA-PLAYER-HOME

```text
Tables:   golf_team_settings, golf_events and golf_event_attendance (the team's week, without names), golf_rounds
          filtered to the player's id, golf_players (their own row), golf_teams (gender, creator, organisation),
          golf_holes and golf_round_stats_cache (their own rounds), golf_pga_standards (D1 benchmarks),
          golf_coaches (the organisation's coaches, for Message coach)
RPCs:     none
Storage:  none
Realtime: none
Cache:    none
RLS:      the signed-in user's own client; no roster table is read (20803)
Read path:  loadPlayerHome, on the server, for the player's active membership team
Write path: none
```

## Held dependencies

None.

## Impact notes

- `homeClock`, `loadHomeWeek` and `latestWithHoles` serve both roles. A change to them changes Coach Home and Player Home together; `loadPlayerHome` passes `loadHomeWeek` no names, and that argument is the player's privacy (20804).
- `page.tsx` also renders the Fairway dashboards; only its two Clubhouse branches belong to Home, and the Fairway branches must keep working while the flag is off (20801).
- Home imports the event type label and icon from Calendar's screens (`calendar/model`, `calendar/views`) and `formatHcp` from Roster's (`roster/format`); `ui/Nine` is shared with Qualifiers.
- Message coach depends on Messages accepting `?user=` (Messages.tsx, CH-7001). If that deep link changes, `messageCoachHref` (`player-links.ts`) changes with it.
- `golf_teams.created_by` is a `golf_coaches.id`, not a user id (true of all ten live teams, per the fix on 2026-09-30); `coachFor` matches it against `golf_coaches.id` and returns that coach's `user_id`.
- The desktop markup is what the server renders on every width; the phone Home replaces it at hydration (CSS hides the desktop markup at 820px and below until then).
