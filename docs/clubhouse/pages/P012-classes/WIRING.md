# P012 — Classes: wiring map

## Entry point

```text
Route:                   /golf/dashboard/classes
Page:                    src/app/golf/(dashboard)/dashboard/classes/page.tsx (force-dynamic; a player with the Clubhouse on
                         -> ClubhouseClassesRoute, everyone else -> LegacyClassesPage)
Clubhouse route adapter: src/clubhouse/routes/classes.tsx ClubhouseClassesRoute (session, team; no player profile -> nothing;
                         no team, or a team where the member is not a player -> the no-team page, CH-12305)
Server loader:           src/clubhouse/data/classes.ts loadClasses (one read for the player), with its pure steps in
                         classes-shape.ts; each failed read logs through chLogServer('classes', …) and is flagged, never
                         thrown. The loader throws only when it can find no academic term for the day
Screen:                  src/clubhouse/screens/classes/Classes.tsx (the live wrapper) -> ClassesView.tsx -> parts.tsx,
                         ClassForm.tsx, ClassDetail.tsx and ImportSchedule.tsx
Skeleton:                src/clubhouse/screens/classes/ClassesSkeleton.tsx (CH-12401), from classes/loading.tsx through the
                         shell's role (a player in the shell; Fairway's skeleton for anyone else)
Route error:             src/app/golf/(dashboard)/dashboard/classes/error.tsx (the shared RouteErrorBoundary)
Legacy page:             src/app/golf/(dashboard)/dashboard/classes/LegacyClassesPage.tsx (the current page, unchanged)
```

## End-to-end graph

```text
UI (ClassCard, AddTile, the header's Import schedule and Add class, ClassForm, ClassDetail, ImportSchedule, the remove question, SyncStatus)
↓
Action (a handler in ClassesView: save.run, remove.run, doImport.run, or syncClasses; the import's reader runs in ImportSchedule itself)
↓
Client controller: useAction (offline refusal CH-1903, slow notice CH-1902, chReport + error toast with Retry + haptic).
                   Every follow-up (the list, the open sheet, the calendar flags, the imported view) is INSIDE the action
                   function, so Retry does it too. A save does not wait for the calendar: it starts the sync (its own
                   useAction) and returns.
↓
Writes: ChClassesWrites, createLiveClassesWrites (writes.ts), one method per write: save, remove, sync, importRows, read
↓
Data actions: golf_player_classes through the RLS-scoped browser client; src/app/golf/actions/calendar-sync.ts
              (syncClassToCalendar, removeClassFromCalendar); src/app/golf/actions/schedule-image.ts
↓
Data: golf_player_classes, golf_events (the class events, tagged [class:<id>])
↓
Contract outcomes: CONTRACT.md (Bridge IDs 12ccii, catalog CH-12xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/classes.test.tsx
```

## Actions

Each action's record is in `config/clubhouse/pages/P012-classes.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before anything
is sent (the shell's 10703, CH-1903; 120703). Every failure toast carries Retry, which runs the whole action
again (121401).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P012-SAVE-CLASS | Add class or Save changes in the form (Enter in a field saves too) | `ClassForm` `submit` → `onSave` → `save.run` (`saveAction`) | `writes.save`: an insert under the row id the sheet made, or an update by id and player, on golf_player_classes; then the save starts the calendar sync without waiting | golf_player_classes | rules 120501 to 120507 · done 120901 · refused 120601 · text kept 121201 · same row after a lost answer 121404 · hidden update 120609 · Retry 121401 |
| ACT-P012-SYNC-CALENDAR | Started by a save or an import; Retry sync in the header and in a class's sheet; the toast's Retry | `syncClasses` → `sync.run` (`syncAction`), one call per class | `writes.sync` → `syncClassToCalendar`, or `removeClassFromCalendar` for a class with no start or no end time | golf_events (tagged [class:<id>]) | adding 120203 · not on the calendar 120602 · not waited on 121501 · from its term 121502 · no time 121503 · wrote nothing 120610 · stored start 121402 · flag held for the visit 121504 |
| ACT-P012-REMOVE-CLASS | Remove class in the question (opened from a class's sheet, with the warning haptic first) | `removeAction` → `remove.run` | `writes.remove`: `removeClassFromCalendar(id)` first, then the delete by id and player, only if the calendar removal worked | golf_events, golf_player_classes | question 121101 · done 120901 · refused 120603 · the class leaves the list only when both landed · Retry 121401 |
| ACT-P012-IMPORT-SCHEDULE | Import N classes in the review | `ImportSchedule` `onImport` → `doImport.run` (`importAction`) | `writes.importRows`: reads the classes already there, skips what matches, one insert of the rest; then starts the sync per class from its own start (`syncStartFor`) | golf_player_classes | refused 120604 · skipped 120515 · all there 120406 · result 120902 · starts 121502 · text kept 121201 · Retry 121401 |
| ACT-P012-READ-SCHEDULE | Read schedule (pasted text), a chosen or dropped file | `ImportSchedule` `run` (its own state, not `useAction`; a late answer after the sheet closes is dropped) | `readScheduleLive`: `parseScheduleText` for pasted text, TXT and PDF text (PDF.js in the browser), `extractClassesFromScheduleImage` for a screenshot | nothing is saved by a read | nothing pasted 120510 · file 120511 120512 · reader 120513 120514 120608 · reading 120202 · offline 120701 · slow 120702 |
| ACT-P012-TRY-AGAIN | Try again on the classes' notice and on the team events' notice | `InlineNotice` → `router.refresh` | the server route, read again | (every read) | 120605 · 120606 · recovery 121403 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/classes/Classes.tsx` | The live wrapper: server data and the live writes | — |
| `screens/classes/ClassesView.tsx` | The container: header, first run, the failed-read notice, overview, deck, side column, every sheet, the calendar flags and every action | CH-12201, CH-12301, CH-12203, CH-12501, 120407 |
| `screens/classes/parts.tsx` | `TermBar`, `ClassCard`, `AddTile`, `OverlapsCard`, `CoachNote`, `SyncStatus` | CH-12202, CH-12302, CH-12303, CH-12304, CH-12403, CH-12601, CH-12701, CH-12801 to CH-12803 |
| `screens/classes/ClassForm.tsx` | Add and edit, and the discard question | CH-12101 to CH-12109, CH-12502, CH-12703, CH-12804 |
| `screens/classes/ClassDetail.tsx` | One class: when, where, its next meetings, Edit and Remove | CH-12702, 120103, 121503 |
| `screens/classes/ImportSchedule.tsx` | The import's steps (pick, reading, review, error, imported) and `ImportedView` | CH-12110 to CH-12114, CH-12204, CH-12307, CH-12402, CH-12705, CH-12805, CH-12901, CH-12902, 120902 |
| `screens/classes/import-read.ts` | The reader: `screenFile`, `classifyReadError`, `readScheduleLive` | CH-12111 to CH-12113 |
| `screens/classes/writes.ts` | The writes interface and `createLiveClassesWrites`; `newClassId`; preview and tests pass their own set | — |
| `screens/classes/ClassesSkeleton.tsx` | Route skeleton | CH-12401 |
| `screens/classes/ClassesNoTeam.tsx` | A player on no team (a server component) | CH-12305 |
| `routes/classes.tsx` | Route adapter | CH-12305 |
| `data/classes.ts`, `data/classes-shape.ts` | The loader and its pure steps: term, week, overlaps, the draft's checks, `syncStartFor`, `importKey` | CH-12201, CH-12202, 122101 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`, `friendlyReason`) | Clubhouse | ClassesView (save, remove, import, sync) |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | ClassesView, Modal |
| `src/clubhouse/shell/phone-chrome.tsx` (`PhoneTop`, `useBackFromMore`) | Clubhouse | ClassesView |
| `src/clubhouse/lib/haptics.ts`, `track.ts` | Clubhouse | throughout |

There are no realtime hooks: the page is read once on the server.

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| syncClassToCalendar | actions/calendar-sync.ts | Existing (shared with the Fairway Classes page) | a diff-upsert of the class's weekly meetings on the team calendar, over the class's term window or from `semesterStartDate`; it deletes occurrences it no longer generates |
| removeClassFromCalendar | actions/calendar-sync.ts | Existing (shared) | deletes the events tagged with the class |
| extractClassesFromScheduleImage | actions/schedule-image.ts | Existing (the current importer's reader) | reads a screenshot with the vision model |
| parseScheduleText, generateClassColor | lib/utils/schedule-parser | Existing helpers | pasted, TXT and PDF text; the stored color |
| inferTermForImport, parseSemesterDates | lib/golf/semester | Existing helpers | the term in progress and every term's window |
| isClassEvent | lib/calendar/class-events | Existing helper | keeps a class meeting out of the team's week |
| homeClock | src/clubhouse/data/home.ts | Clubhouse (Home's) | the team's zone |

## Data resources

### DATA-CLASSES

```text
Tables:   golf_player_classes (id, class_name stored as "CODE - Name", instructor, days, start_time, end_time,
          building, room, credits, color, notes, semester, created_at; player_id and team_id on insert),
          golf_events (the team's non-class events for the week, read, cancelled ones dropped in the shape step;
          the class events the sync writes), golf_team_settings (timezone); the server actions also read
          golf_players and golf_team_members
RPCs:     none
Storage:  none by this page (a screenshot goes to the vision action in slices)
Realtime: none
Cache:    none; the page is force-dynamic, and a change that lands updates the list in place without reading again
RLS:      the RLS-scoped client for the reads and the three direct writes: the baseline policies let only the owning
          player insert, update or delete a class, and let its player and an active coach of the team read it; the
          server actions check the caller first (120803)
Read path:  the loader, on the server, in one pass (122101); both lists are limited to 500
Write path: the browser client to golf_player_classes, and the server actions above, through writes.ts
```

## Held dependencies

None. Delete all, the board's grade, next deadline and Share with coach, and a sync status column each need an
owner decision or new data (Q-75); none is written.

## Impact notes

- `syncClassToCalendar` and `removeClassFromCalendar` are shared with the Fairway Classes page and the calendar:
  a change there changes both UIs. The remove order (calendar first, then the row) is the current page's.
- Every follow-up to a write lives inside its `useAction` function. Anything added after `await x.run()` in a
  handler is skipped when the toast's Retry lands (121401).
- A save passes no start on purpose: the sync deletes the occurrences it no longer generates, so a start of next
  Monday would drop the meetings already held. An import's start is next Monday only where `syncStartFor` says the
  sync's window for it is the class's own term (the sync re-derives another term when a start leaves a label with
  under 21 days, `lib/golf/semester.ts`); if `parseSemesterDates` changes, `syncStartFor` must follow (121502).
- The row id is made by the page (`newClassId`) and travels with the insert; `golf_player_classes` has no
  uniqueness beyond its id, which is why a duplicate-key answer on it means "already stored" (121404).
- The calendar flags and each class's stored start are held in the page, not in a column: a reload forgets which
  classes failed to sync (121504), and an edit of an imported class syncs the whole term, past meetings included.
