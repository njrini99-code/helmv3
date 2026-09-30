# P011 — Rounds: wiring map

## Entry points

The library and the review are routed. Setup and the shot screen are reached only through the dev preview
until the engine move (ROUNDS_PLAN step 4).

```text
LIBRARY (routed)
Route:                   /golf/dashboard/rounds
Page:                    src/app/golf/(dashboard)/dashboard/rounds/page.tsx (a player with golf_clubhouse_ui on -> Clubhouse,
                         everyone else -> Fairway; force-dynamic)
Clubhouse route adapter: src/clubhouse/routes/rounds.tsx ClubhouseRoundsRoute (session; a coach renders nothing; the
                         team only sets today's time zone)
Server loader:           src/clubhouse/data/rounds.ts loadRoundsLibrary (pure steps in data/rounds-shape.ts; each failed
                         read logs through chLogServer('rounds', …) and never throws)
Screen:                  src/clubhouse/screens/rounds/RoundsLibrary.tsx -> parts.tsx (UnfinishedCard, SeasonCard, Ribbon, RoundRow)
Skeleton:                src/clubhouse/screens/rounds/RoundsSkeleton.tsx (CH-11401), from rounds/loading.tsx through ClubhouseSwitch
Route error:             rounds/error.tsx (the shared Fairway RouteErrorBoundary; there is no Clubhouse error view yet)

REVIEW (routed)
Route:                   /golf/dashboard/rounds/[id]
Page:                    src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx (after the uuid check and the session:
                         a coach or a player with the flag on for their role -> Clubhouse, else Fairway)
Clubhouse route adapter: src/clubhouse/routes/round-review.tsx ClubhouseRoundReviewRoute (viewer: a player who is not a coach,
                         or the coach's active team; no viewer is the same "not here" page; a round in progress redirects
                         to /rounds/continue/[id]; CH-11307 is the not-here page)
Server loader:           src/clubhouse/data/round-review.ts loadRoundReview (pure steps in data/round-review-shape.ts; logs
                         through chLogServer('rounds.review', …))
Screen:                  src/clubhouse/screens/rounds/RoundReview.tsx (ReviewNine, HoleCard) and ReviewLoadFailed.tsx (CH-11206)
Skeleton:                none of its own: rounds/[id]/loading.tsx is Fairway's (110206)
Route error:             rounds/[id]/error.tsx (the shared Fairway RouteErrorBoundary)

SETUP (preview only)
Not routed. Preview:     /clubhouse-preview/setup -> src/clubhouse/preview/PreviewSetup.tsx (fake ports; Start opens the tracking preview)
Screen:                  src/clubhouse/screens/rounds/setup/RoundSetup.tsx -> CoursePicker.tsx, AddCourseSheet.tsx, HoleConfig.tsx
Contract:                setup/shape.ts ChSetupPorts { listCourses, listTees, teeHoles, start } and ChSetupForm

SHOT SCREEN (preview only)
Not routed. Preview:     /clubhouse-preview/track -> src/clubhouse/preview/PreviewTracking.tsx (the stand-in round screen:
                         moves to the next hole once a hole saves, owns Exit, the scorecard, Round complete and Submitting)
Screen:                  src/clubhouse/screens/rounds/track/RoundTracking.tsx -> ShotEntry.tsx, HoleReview.tsx, parts.tsx, sheets.tsx
Round's own sheets:      track/round-sheets.tsx (ExitSheet, ScorecardSheet, RoundCompleteSheet, SubmitOverlay), driven by props
Logic:                   src/hooks/golf/use-shot-tracking.ts useShotTracking(props, ports), shared with the Fairway screen
                         (FairwayShotTracking); rules in src/lib/golf/shot-entry-rules.ts
```

## End-to-end graph

```text
UI (RoundsLibrary: the trash buttons and the discard question; Try again on a notice; RoundReview: the hole picker and
    the steppers)
↓
Action (askDiscard, then confirmDiscard: each calls discard.run on a useAction and does nothing after it; Try again
        is router.refresh)
↓
Client controller: useAction (offline refusal CH-1903, slow notice CH-1902, chReport + error toast with Retry + haptic).
                   The follow-up (the card leaving, the question closing) is INSIDE discardRound, so Retry does it too.
↓
Writes: LIVE_ROUNDS_WRITES (writes.ts): discard -> deleteInProgressRound, then clearEmergencySave(roundId, playerId) when it worked
↓
Server action: src/app/golf/actions/golf.ts deleteInProgressRound (checks the caller, deletes by round, player and
               in-progress status)
↓
Data: golf_rounds (its holes and shots cascade), and the device's emergency copy
↓
Contract outcomes: CONTRACT.md (Bridge IDs 11ccii, catalog CH-11xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/rounds.test.tsx, round-review.test.tsx, round-setup.test.tsx, round-tracking.test.tsx,
       src/lib/golf/__tests__/shot-entry-rules.test.ts
```

## Actions

Two actions are registered in `config/clubhouse/pages/P011-rounds.json` (`actions`): the ones a routed control
reaches today. The whole list is readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, Discard
is refused before anything is sent (the shell's 10703, CH-1903; 110702, reserved, no test). The failure toast
carries Retry, which runs the whole action again (111401).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P011-DISCARD | The trash button on the round card and on each "more unfinished" row, then Discard round in the question | `askDiscard` (warning haptic first, CH-11701) -> `confirmDiscard` -> `discard.run` | `discardRound` -> `writes.discard` -> `deleteInProgressRound`, then `clearEmergencySave` | golf_rounds (holes and shots cascade), the device's emergency copy | question 111101 · done 110901 · refused 110601 · waits for the server 111301 · Retry 111401 · server gate 110804 (read, not run) |
| ACT-P011-TRY-AGAIN | Try again on a failed-read notice: the library's posted rounds and in-progress check, the review's card, shots and round | `refresh` -> `router.refresh` | the server route, read again | (every read) | notices 110602 · 110603 · 110605 · 110606 · 110607 · recovery 111402 |

### Preview-only controls (not registered)

These run through ports, the engine's shared hook or the round screen's props, so they have no service of their
own until the engine move. They are listed so the move keeps their contract.

| Control | Component | Handler -> what it calls | Contracts |
| --- | --- | --- | --- |
| Browse courses, a course, a tee | `CoursePicker` | `useRead` -> `ports.listCourses()`, `ports.listTees(courseId)`; only the latest answer of a read is kept | library CH-11510 · loading CH-11403, CH-11404 · didn't load CH-11209, CH-11208 · no tees CH-11311 · empty CH-11310 · stale read 111503 |
| Picking tees (the scorecard) | `RoundSetup` | `loadHoles` -> `ports.teeHoles(teeId)`, then `HoleConfig` edits stay in the form | loading CH-11405 · didn't load CH-11210 · edits counted 110103 · the nine 110111 |
| Add a course | `AddCourseSheet` | local until Start: `onDone(pick, holes, count, saveCourse)`; the course is the round's own (Q-72h) | CH-11511 · checks CH-11108 · start form 110110 |
| Play an open qualifier | `RoundSetup` | `playQualifier` sets the type, the course, the tees and the round | 110113 · none open CH-11312 · didn't load CH-11211 · closed 110805 |
| Start round | `RoundSetup` | `start.run(form)` (useAction `rounds.start`) -> `ports.start(form)`; `onStarted(roundId)` runs inside the action | blocked 110510 · date CH-11109 · yardage CH-11107 · refused CH-11007 · Retry 111401 · form kept 111201 |
| Next shot, Hole out | `ShotEntry` | `onNextShot` -> `useShotTracking.handleNextShot`; a holed-out hole calls `onHoleComplete(holeIndex, stats)`, which must resolve true only once the hole is durably saved | hint CH-11101 · warning and block CH-11102, CH-11103 · limit CH-11106 · saving CH-11402 · didn't save CH-11003 · Try again 111403 |
| Undo last shot | `UndoConfirm` (in `ShotEntry`, `HoleReview`) | `dispatch(SHOW_UNDO_CONFIRM)` -> `handleUndoLastShot` (`useUndoManager`) -> `deleteShot` | CH-11502 · failed CH-11002 |
| Penalty | `PenaltySheet` | `handleAddPenalty` -> `confirmPenalty` (`usePenaltyHandler`) | CH-11503 |
| Change or delete a shot | `EditShotSheet` | `handleEditShot` -> `handleSaveEditedShot` (`updateShot`), `handleDeleteShot` (`deleteShot`) | CH-11505 · failed CH-11004 · rules CH-11105 |
| Go to another hole | `TrackStrip`, `HoleReview` | `handleNavigateToHole`; a picked-but-unrecorded result asks first (`UnsavedSheet`) | CH-11504 · CH-11805 |
| Exit, Save for later, Discard round | `ExitSheet` (round's own) | `onSave`, `onKeep`, `onDiscard` (props; a discard asks again) | CH-11506 · CH-11507 · failed CH-11006 |
| Scorecard | `ScorecardSheet` (round's own) | opens from the top bar (`onOpenScorecard`) | CH-11509 · region 111810 |
| Round complete, Submit | `RoundCompleteSheet`, `SubmitOverlay` (round's own) | `onSubmit`, `onRetry` (props) | CH-11508 · CH-11603 · failed CH-11005 · Try again 111403 · posted 110902 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/rounds/RoundsLibrary.tsx` | The library container: header, the two cards, more unfinished rounds, tools, the book, the discard question | 110101 · CH-11301, CH-11303 · CH-11201 · CH-11501 |
| `screens/rounds/parts.tsx` | `UnfinishedCard`, `SeasonCard`, `Ribbon`, `RoundRow`, `TeeSwatch`, `TypePill` | CH-11202, CH-11302, CH-11304 · CH-11802, CH-11803, CH-11801 |
| `screens/rounds/writes.ts` | The writes interface and `LIVE_ROUNDS_WRITES`; preview and tests pass their own set | (none) |
| `screens/rounds/RoundsSkeleton.tsx` | Route skeleton | CH-11401 |
| `screens/rounds/RoundReview.tsx` | The review: hero, figures, card, hole card, distribution, recap, notes | 110102 · CH-11204, CH-11205, CH-11305, CH-11306 · CH-11804 |
| `screens/rounds/ReviewLoadFailed.tsx` | The round itself did not load | CH-11206 |
| `routes/rounds.tsx`, `routes/round-review.tsx` | Route adapters (and the not-here page, CH-11307) | 110801 · 110802 |
| `screens/rounds/setup/*` | Setup, the picker, Add a course, the scorecard, and the neutral contract | 110103 · CH-11309, CH-11007, CH-11109, CH-11510, CH-11511 |
| `screens/rounds/track/*` | The shot screen, its entry, review, sheets and the round's own sheets | 110104 · CH-11101 to CH-11106, CH-11207, CH-11901 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`, `isOffline`) | Clubhouse | RoundsLibrary (`rounds.discard`), RoundSetup (`rounds.start`), HoleReview |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`), `shell/phone-chrome.tsx` (`PhoneTop`, `usePhoneTabsHidden`) | Clubhouse | the library, the review, setup, the shot screen |
| `src/clubhouse/lib/haptics.ts`, `track.ts`, `reduced-motion.ts` | Clubhouse | throughout |
| `src/hooks/golf/use-shot-tracking.ts` (`useShotTracking`, `ShotTrackingPorts`) with `use-shot-state-machine.ts`, `use-edit-shot-modal.ts`, `use-undo-manager.ts`, `use-penalty-handler.ts` and `use-distance-units.ts` | Shared (the Fairway screen runs the same) | RoundTracking, ShotEntry |

There are no realtime hooks: the library and the review are read once on the server per visit.

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| deleteInProgressRound | actions/golf.ts | Existing (the legacy library's and continue-round's Discard) | Discard: deletes by round, player and in-progress status |
| clearEmergencySave | src/lib/utils/emergency-save.ts | Existing | drops the device's copy after a discard that worked |
| updateShot, deleteShot | actions/golf.ts | Existing (through `useShotTracking`) | change, delete and undo a shot |
| listCourses, getRecentlyPlayedCourses, getTeamSavedCourses, getCourseDetail, getTeeWithHoles | actions/course-library.ts | Existing (supplied to setup as ports when the round screen moves) | the course picker |
| the round's start, checkpoints, autosave, discard-from-Exit and submit | rounds/new/new-round-client.tsx, rounds/continue/[id]/continue-round-client.tsx | Existing, legacy engine (moves to `src/lib/golf/round-session/` in ROUNDS_PLAN step 4) | reach the screens as `ChSetupPorts.start` and the shot screen's props |
| isCountableRound, withCanonicalRoundTotal | src/lib/golf/round-countable.ts, src/lib/golf/round-total.ts | Existing (shared with Home and Stats) | what counts and the one total |

## Data resources

### DATA-ROUNDS

```text
Tables:   golf_rounds, golf_holes, golf_shots, golf_course_tees (tee yards), golf_team_members (a coach's access),
          golf_players (a coach's view of the name), golf_team_settings (the time zone, through homeClock);
          setup's course library through actions/course-library.ts
RPCs:     none read by the loaders (the engine's submit, submit_round_atomic, is behind the ports)
Storage:  none
Realtime: none
Cache:    none in the loaders; the page is force-dynamic; deleteInProgressRound revalidates /golf/dashboard/rounds
RLS:      the RLS-scoped client throughout; the loaders also filter by the player, and the actions check the caller first
Read path:  the loaders, on the server, in rounds (112101): the library's for one player; the review's for the player or a
            coach of the player's team (110802)
Write path: deleteInProgressRound through writes.ts; the shot screen's writes through useShotTracking and the engine
```

## Held dependencies

None. A coach's note on a round and the recap's Focus and Keep each need data or a decision the owner has not
approved (Q-72f).

## Impact notes

- `deleteInProgressRound` is shared with Fairway's library and continue-round: a change there changes both UIs.
- `useShotTracking` and `shot-entry-rules` are shared with the Fairway shot screen (the parity tests
  `FairwayShotTracking.ready-state-parity.test.ts` and `.stale-checkpoint.test.ts` guard the move): a change
  to either changes both screens.
- The engine move (step 4) must keep `ChSetupPorts` and the shot screen's props as they are. `persistRoundStart`
  reads the setup from state today; the port takes the whole form, `start(form)`.
- Both routes call `resolveClubhouseTeam`, which throws when a player's team membership read fails (the route
  error view, never "no team"). The library needs the team only for the time zone of "today", but a failed
  membership read still fails the whole library.
- A coach sees a review only for a player on the coach's active team (the team cookie), so a coach with two teams
  sees the other team's players' rounds as "not here" until they switch.
- A Clubhouse player can review and discard rounds but cannot start or continue one (`/rounds/new` and
  `/rounds/continue/[id]` are not rebuilt: the shell draws its not-rebuilt notice), so turning the flag on for
  players before the engine move would take away their way to start a round (an owner decision, not made here).
- Strokes gained on the review (2026-09-30): `loadRoundReview` also selects the round's five
  `strokes_gained_*` columns and reads `golf_teams.gender` for the viewer's team (a player viewer carries an
  optional `teamId` from the route); `toReview` shapes `strokesGained` and `tour`. No new table or column.
