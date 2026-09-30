# P003 — Roster: wiring map

## Entry point

```text
Route:                   /golf/dashboard/roster
Page:                    src/app/golf/(dashboard)/dashboard/roster/page.tsx (a coach with golf_clubhouse_ui on -> ClubhouseRosterRoute, else Fairway)
Clubhouse route adapter: src/clubhouse/routes/roster.tsx (session, then the active team through resolveClubhouseTeam;
                         a player session gets nothing, 30801; no team -> RosterNoTeam, CH-3306)
Server loader:           src/clubhouse/data/roster.ts loadRoster (team, members and join requests in one parallel round, then rounds,
                         focus areas, goals and this coach's notes in a second; each failed read logs through chLogServer('roster', …)
                         and never throws)
Screen:                  src/clubhouse/screens/roster/Roster.tsx (live container) -> RosterList + RosterPeek (desktop)
                         | RosterPhone (useChPhone, 820px)
Skeleton:                src/clubhouse/screens/roster/RosterSkeleton.tsx (CH-3401), from roster/loading.tsx through ClubhouseSwitch
Route error view:        roster/error.tsx (RouteErrorBoundary)
```

## End-to-end graph

```text
UI (RosterList, RosterPeek, RosterRequests, InviteModal | RosterPhone, RosterProfile, RequestsSheet, PlayerActions)
↓
Action (useAction 'roster.<name>' in Roster.tsx, useJoinRequests.ts and RosterPeek.tsx; exportCsv and useCopyText are local)
↓
Client controller: useAction (offline refusal CH-1903, slow notice CH-1902, chReport + error toast + haptic, Retry).
                   What a change does on screen happens inside the action, so the toast's Retry finishes the job (31403).
↓
Server actions: src/app/golf/actions/roster.ts, teams.ts, v3/intent.ts
↓
Data: golf_team_members, golf_team_join_requests, golf_coach_player_intent (and a notification for the player)
↓
Revalidation: each write calls revalidatePath('/golf/dashboard/roster'); the page that comes back replaces the screen's copy (30303)
↓
Contract outcomes: CONTRACT.md (Bridge IDs 3ccii, catalog CH-3xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/roster.test.tsx (63 cases)
```

## Actions

Each action's record is in `config/clubhouse/pages/P003-roster.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before
anything is sent (30701, the shell's 10703, CH-1903).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P003-REMOVE-PLAYER | Row menu › Remove from team; phone ⋯ › Remove from team; then Remove player | `remove.run` (Roster) | `removePlayerFromTeam` | golf_team_members | confirm 31101 · warning 31704 · in flight 30301 · lands 30901 · fails 30601 · refused 30803 · Retry 31403 |
| ACT-P003-APPROVE-REQUEST | Approve (desktop card; phone sheet) | `jr.decide(request, true)` | `acceptJoinRequest` | golf_team_join_requests, golf_team_members, notifications | optimistic 31301 · lands 30901 · fails 30602 · refused 30803 · Retry 31403 |
| ACT-P003-DECLINE-REQUEST | Decline (desktop card; phone sheet) | `jr.decide(request, false)` | `rejectJoinRequest` | golf_team_join_requests, notifications | optimistic 31301 · lands 30901 · fails 30603 · refused 30803 · Retry 31403 |
| ACT-P003-APPROVE-ALL | Phone sheet › Approve all | `jr.approveAll` | `acceptJoinRequest`, one at a time (D-55) | golf_team_join_requests, golf_team_members, notifications | in flight 30302 · lands 30901 · some fail 30607 · Retry re-runs the failures 31401 |
| ACT-P003-SAVE-NOTE | The note field, on leaving it | `save.run` (CoachNote) | `setIntent` | golf_coach_player_intent | limit 30501 · locked 30616 · kept on failure 31201 · trimmed 32001 · lands 30901 · fails 30604 · refused 30803 · reads back 31203 · Retry 31403 |
| ACT-P003-EXPORT-CSV | Export (desktop) | `exportCsv` | — (a download from the rows on screen) | — | names written as text 30502 · lands 31702 · blocked 30605 |
| ACT-P003-COPY-JOIN-CODE | Copy (Invite sheet, empty state, phone requests sheet) | `copy` (`useCopyText`) | clipboard | — | lands 31703 · fails 30606 · no code 30404 · code didn't load 30614 |
| ACT-P003-SHARE-INVITE | Share (Invite sheet) | `share` (InviteModal) | `navigator.share`, then copy | — | fails 30606 |
| ACT-P003-OPEN-PLAYER | A card, a table row, a Needs a look chip; phone row | `select`, `openPlayer` | — (already loaded) | — | ready 30101 · link 30102 · no rounds 30405 · counts didn't load 30615 · tick 31701 |
| ACT-P003-FILTER-PLAYERS | Search, the status pills, the sort | `setQ`, `setShow`, `setSort` | — | — | nobody matches 30402 · nobody in the filter 30403 · tick 31701 |
| ACT-P003-CHANGE-LAYOUT | The cards or list toggle (desktop) | `changeView` | — (stored on the device) | — | kept 31202 · tick 31701 · table roles 31801 |
| ACT-P003-TRY-AGAIN | Try again on the roster, stats, requests or join code notice | `router.refresh` | — (the page is read again) | — | follows the refresh 30303 · whole page 31402 · roster 30608 · stats 30609 · requests 30610 |

Links out are plain links through `rebuiltHref`, so a destination that is not rebuilt for the role is not offered:

| Link | From | To |
| --- | --- | --- |
| View stats | row menu, phone ⋯ sheet | `stats?player=<id>` |
| Open full profile | desktop panel | `stats?player=<id>` |
| All N | phone profile | `stats?player=<id>&window=season&tab=rounds` (D-53) |
| Message | desktop panel and row menu; phone profile | `messages` (desktop); `messages?player=<id>` (phone) |
| Plan 1:1 | phone profile | `calendar?new=1&with=<id>` (D-52) |
| Open team settings | Invite sheet, when the team has no join code | `settings?section=team` |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `routes/roster.tsx` | The route adapter: coach check, active team, loader | 30801, CH-3306 |
| `screens/roster/Roster.tsx` | The container: `players`, Remove, Export, filters, layout, Invite, the phone switch, the section boundaries; also `RosterList` (cards or table) and `InviteModal` | 30101, 30303, 30401 to 30404, 30502, 30601, 30605, 30606, 30608, 30609, 30611 to 30614, 31101, 31202, 31704 |
| `screens/roster/RosterPeek.tsx` | The desktop panel and `CoachNote` (shared with the phone profile) | 30405, 30501, 30604, 30615, 30616, 31201, 31203, 32001 |
| `screens/roster/RosterRequests.tsx` | The desktop join requests card | 30610, 31301 |
| `screens/roster/useJoinRequests.ts` | The requests, optimistic; Approve and Decline; Approve all | 30302, 30602, 30603, 30607, 31301, 31401, 31403 |
| `screens/roster/RosterPhone.tsx` | The phone list, banner, requests sheet and ⋯ sheet | 30102, 30302, 30401, 30608 to 30610, 31901 |
| `screens/roster/RosterProfile.tsx` | The phone's pushed profile | 30405, 30609, 31203 |
| `screens/roster/RosterSkeleton.tsx` | Route skeleton | 30201 |
| `screens/roster/RosterNoTeam.tsx` | No team | CH-3306 |
| `screens/roster/useCopyText.ts`, `format.ts` | Copy with a toast; handicap and row-note formatting | 30606, 31703 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`) | Clubhouse | Roster.tsx, useJoinRequests.ts, RosterPeek.tsx |
| `src/clubhouse/screens/roster/useJoinRequests.ts` | Clubhouse | Roster.tsx, RosterRequests.tsx, RosterPhone.tsx |
| `src/clubhouse/screens/roster/useCopyText.ts` | Clubhouse | Roster.tsx, RosterPhone.tsx |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | Roster.tsx |
| `src/clubhouse/shell/phone-chrome.tsx` (`PhoneTop`, `useBackFromMore`, `usePhoneStackHistory`) | Clubhouse | RosterPhone.tsx |
| `src/clubhouse/lib/haptics.ts`, `track.ts`, `motion.ts`, `reduced-motion.ts`, `format.ts` | Clubhouse | throughout |

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| removePlayerFromTeam | actions/roster.ts | Existing | end a membership (the account and stats stay) |
| getTeamJoinRequests, acceptJoinRequest, rejectJoinRequest | actions/teams.ts | Existing | the pending requests and the two decisions |
| setIntent | actions/v3/intent.ts | Existing | the coach's note (`notes` on golf_coach_player_intent) |
| loadRoster | src/clubhouse/data/roster.ts | New (Clubhouse only) | one server read for the whole page |
| loadSeasonRounds | src/clubhouse/data/season.ts | Shared by Clubhouse pages | the season's countable rounds, 1 August to 31 July |

## Data resources

### DATA-ROSTER

```text
Tables:   golf_teams (name, join_code, season), golf_team_members (status, jersey_number, joined_at) with golf_players
          (name, class year, hometown, high school, handicap), golf_rounds (the season's countable rounds),
          golf_player_focus_areas (active), golf_goals (active)
RPCs:     none
Storage:  none
Realtime: none
Cache:    none of its own; the page is read per request, and each write revalidates /golf/dashboard/roster
RLS:      the reads use the RLS-scoped server client; the actions check the coach and the coach's team first
Read path:  loadRoster (server), one pass in two parallel rounds
Write path: removePlayerFromTeam
```

### DATA-JOIN-REQUESTS

```text
Tables:   golf_team_join_requests, golf_team_members, notifications
Read path:  getTeamJoinRequests (pending requests of the coach's team)
Write path: acceptJoinRequest (adds the player as active, marks the request approved), rejectJoinRequest (marks it rejected).
            Both write the player's notification with the admin client, server side, because a coach cannot write another user's row.
```

### DATA-NOTES

```text
Tables:   golf_coach_player_intent (coach_id, player_id, notes)
Read path:  loadNotes in loadRoster, filtered by coach_id (30802)
Write path: setIntent (an upsert on coach_id and player_id, after verifyPlayerAccess)
```

## Held dependencies

- `docs/clubhouse/held/data/roster-availability.md` (the migration is written and held; nothing reads or writes the columns)

## Impact notes

- `removePlayerFromTeam`, the join request actions and `setIntent` are shared with Fairway. A change to what they return or refuse changes both UIs. Roster shows the server's `error` when it is one short sentence, and its own hint otherwise.
- `useAction` re-runs only the action function on Retry. Anything the screen must do after a success therefore lives inside the action (31403).
- `data.players` and `data.requests` are the server's. The screen holds only what it changed since the page arrived, and a new page replaces it (30303).
- The sidebar's join requests count is the shell's own read (10609 when it fails). Roster does not update it. Not verified: whether it refreshes after an approval.
- `/golf/dashboard/roster/[id]` is Fairway's player page. It is not rebuilt, and inside the Clubhouse frame it shows the not-rebuilt notice.
