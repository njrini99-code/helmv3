# P010 — Team Hub: wiring map

## Entry point

```text
Route:                   /golf/dashboard/team-hub
Page:                    src/app/golf/(dashboard)/dashboard/team-hub/page.tsx (isClubhouseFor -> Clubhouse, else Fairway)
Clubhouse route adapter: src/clubhouse/routes/hub.tsx ClubhouseHubRoute (session, team; no team -> the no-team page, CH-10309)
Server loader:           src/clubhouse/data/hub.ts loadTeamHub (one read for either role; each failed read logs through
                         chLogServer('hub', …) and never throws)
Screen:                  src/clubhouse/screens/hub/TeamHub.tsx (the container) -> parts.tsx (the cards) and sheets.tsx (the forms)
Skeleton:                src/clubhouse/screens/hub/HubSkeleton.tsx (CH-10405), from team-hub/loading.tsx through ClubhouseSwitch
Route error:             src/app/golf/(dashboard)/dashboard/team-hub/error.tsx (the shared RouteErrorBoundary)
```

## End-to-end graph

```text
UI (Rsvps, Announcement, Tasks, Documents, NewAnnouncementLine; ComposeSheet, TripSheet, AssignSheet, ConfirmDelete)
↓
Action (an onX handler in TeamHub, or the sheet's own submit: each calls run() on a useAction and does nothing after it)
↓
Client controller: useAction (offline refusal CH-1903, slow notice CH-1902, chReport + error toast with Retry + haptic).
                   Every follow-up (the optimistic tick and its undo, the open tab, closing and clearing a sheet,
                   router.refresh, the deleted row) is INSIDE the action function, so Retry does it too.
↓
Writes: LIVE_HUB_WRITES (writes.ts), one method per server action
↓
Server actions: src/app/golf/actions/golf.ts, communication.ts, tasks.ts, documents.ts, announcements.ts, travel.ts
↓
Data: golf_event_attendance, golf_announcement_acknowledgements, golf_task_assignments, golf_documents (+ storage documents),
      golf_announcements (+ recipients), golf_travel_itineraries, golf_tasks
↓
Contract outcomes: CONTRACT.md (Bridge IDs 10ccii, catalog CH-10xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/hub.test.tsx
```

## Actions

Each action's record is in `config/clubhouse/pages/P010-hub.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before
anything is sent (the shell's 10703, CH-1903; 100701). Every failure toast carries Retry, which runs the
whole action again (101401).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P010-REPLY | Going, Maybe, Can't in RSVPs (player) | `onReply` → `reply.run` | `writes.reply` → `respondToEvent` | golf_event_attendance | done 100901 · refused 100601 · optimistic 101301 · Retry 101401 · closed events not offered 100803 |
| ACT-P010-ACKNOWLEDGE | Got it on a post (player) | `onAck` → `ack.run` | `writes.acknowledge` → `acknowledgeAnnouncement` | golf_announcement_acknowledgements | refused 100602 · optimistic 101301 · no toast on success (100901) |
| ACT-P010-COMPLETE-TASK | A task's box (player) | `onToggle` → `complete.run` | `writes.completeTask` → `completeTask` | golf_task_assignments | done 100901 · refused 100603 · optimistic 101301 |
| ACT-P010-OPEN-FILE | A file row in Documents | `onOpen` → `open.run` | `writes.openDocument` → `getPreviewUrl` | golf_documents, storage documents | refused 100604 · opens in a tab of its own, closed again on a failure |
| ACT-P010-POST-ANNOUNCEMENT | Post in New announcement (coach) | `ComposeSheet` `submit` → `post.run` | `writes.postAnnouncement` → `createEnrichedAnnouncement` | golf_announcements, golf_announcement_recipients | fields 100501 · 100502 · sending 100202 · done 100901 · refused 100605 · text kept 101201 · page reads again 101501 |
| ACT-P010-PLAN-TRIP | Save trip in Plan a trip (coach) | `TripSheet` `submit` → `plan.run` | `writes.planTrip` → `createGolfTravelItinerary` | golf_travel_itineraries | fields 100503 to 100506 · saving 100203 · done 100901 · refused 100606 · text kept 101201 · reads again 101501 |
| ACT-P010-ASSIGN-TASK | Assign in Assign a task (coach) | `AssignSheet` `submit` → `give.run` | `writes.assignTask` → `createTask` | golf_tasks, golf_task_assignments | fields 100507 · 100508 · assigning 100204 · done 100901 · refused 100607 · text kept 101201 · reads again 101501 |
| ACT-P010-UPLOAD-FILE | The drop zone and its file picker (coach) | `onUpload` → `upload.run` (once per file) | `writes.uploadDocument` → `uploadGolfDocument`, then `createGolfDocument` (into the Team folder, visible to players) | storage documents, golf_documents | uploading 100201 · done 100901 · refused 100608, per file · reads again 101501 |
| ACT-P010-DELETE | Delete in the confirm dialog (coach) | `onConfirmDelete` → `remove.run` | `writes.deleteAnnouncement` → `deleteAnnouncement`, `writes.deleteTask` → `deleteTask`, `writes.deleteDocument` → `deleteGolfDocument` | golf_announcements, golf_tasks, golf_documents | confirm 101101 · 101102 · 101103 · done 100901 · refused 100609 · row leaves on success only · reads again 101501 |
| ACT-P010-TRY-AGAIN | Try again on a failed-read notice | `RefreshNotice` → `router.refresh` | the server route, read again | (every read) | recovery 101402 · failed notices 100610 to 100616 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/hub/TeamHub.tsx` | The container: header, tabs, the empty page, the optimistic state and every action | 100101, 100102, 100410, CH-10305, CH-10306, every toast |
| `screens/hub/parts.tsx` | `Rsvps`, `Announcement`, `TripPass`, `Updates`, `Tasks`, `Documents`, `NewAnnouncementLine` | 101xx empties and 102xx notices, CH-10401 |
| `screens/hub/sheets.tsx` | `ComposeSheet`, `TripSheet`, `AssignSheet` (each with its own action), `ConfirmDelete` | 101xx validation, CH-10402 to CH-10404, CH-10501 to CH-10503 |
| `screens/hub/writes.ts` | The writes interface and `LIVE_HUB_WRITES`; preview and tests pass their own set | — |
| `screens/hub/HubSkeleton.tsx` | Route skeleton | CH-10405 |
| `routes/hub.tsx` | Route adapter and the no-team page | CH-10309 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`) | Clubhouse | TeamHub, the three sheets |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | TeamHub, Modal |
| `src/clubhouse/shell/phone-chrome.tsx` (`PhoneTop`, `useBackFromMore`) | Clubhouse | TeamHub |
| `src/clubhouse/lib/haptics.ts`, `track.ts` | Clubhouse | throughout |

There are no realtime hooks: the page is read once on the server.

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| respondToEvent | actions/golf.ts | Existing (Calendar's reply) | a player's reply |
| acknowledgeAnnouncement | actions/communication.ts | Existing | Got it |
| completeTask, createTask, deleteTask | actions/tasks.ts | Existing | a player's check, a coach's assign and delete |
| getPreviewUrl, uploadGolfDocument, createGolfDocument, deleteGolfDocument, getDocuments | actions/documents.ts | Existing | the files |
| createEnrichedAnnouncement, deleteAnnouncement, getAnnouncementsWithMeta | actions/announcements.ts | Existing | a coach's posts and their receipts |
| createGolfTravelItinerary | actions/travel.ts | Existing | Plan a trip |
| getPlayerHubSummaryData | actions/player-hub-data.ts | Existing (the player hub's aggregate) | a player's events, trips, tasks and posts |
| getPlayerHubAnnouncements | actions/player-notifications.ts | Existing | a player's posts when the aggregate fails |
| getUnifiedNotifications | actions/unified-notifications.ts | Existing (the bell's feed) | Updates |

## Data resources

### DATA-HUB

```text
Tables:   golf_teams, golf_team_settings (timezone), golf_team_members and golf_players (names), golf_documents,
          golf_announcements with their recipients, acknowledgements and documents, golf_event_attendance, golf_events,
          golf_travel_itineraries, golf_tasks, golf_task_assignments, golf_coaches (authors), the bell's notifications
RPCs:     get_player_hub_events, get_player_hub_announcements (through the player aggregate)
Storage:  documents (private, a signed link per file)
Realtime: none
Cache:    none; a change that lands reads the page again (router.refresh)
RLS:      the RLS-scoped client throughout; the server actions check the caller first
Read path:  the loader, on the server, in rounds (102101); a player's are their own (100802)
Write path: the server actions above, through writes.ts
```

## Held dependencies

None. The design's Pin to the top, Schedule and Mandatory each need data or an action change the owner
has not approved (Q-70, Q-71).

## Impact notes

- `respondToEvent`, `acknowledgeAnnouncement`, `completeTask`, `createTask` and the document actions are
  shared with Fairway's Calendar, Team Hub and coach pages: a change there changes both UIs.
- `getPlayerHubSummaryData` is the player hub's own aggregate; the loader relies on its shape, and on it
  throwing when the events, travel or tasks read fails (the loader catches that and flags those three
  sections).
- The announcements a coach posts go to the coach's active team as the server action resolves it
  (`resolveCoachTeamIdWithCookie`), while this page's team comes from `resolveClubhouseTeam`; both read the
  active-team cookie, and nothing here proves they can never differ.
- Every follow-up to a write lives inside its `useAction` function. Anything added after `await x.run()` in
  a handler is skipped when the toast's Retry lands (101401).
