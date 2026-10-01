# P011 — Rounds: wiring map

## Entry points

The library, the review and round entry (setup, then the shot screen) are routed, each behind `golf_clubhouse_ui`
for the player. Round entry runs over the round engine in `src/lib/golf/round-session/` (#2104), the same hooks the
Fairway clients use; the dev preview is unchanged.

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

NEW ROUND (routed, player)
Route:                   /golf/dashboard/rounds/new
Page:                    src/app/golf/(dashboard)/dashboard/rounds/new/page.tsx (after the player check: isClubhouseFor('player') ->
                         Clubhouse, else Fairway's NewRoundClient; a coach keeps the legacy message)
Clubhouse route adapter: src/clubhouse/routes/round-new.tsx ClubhouseNewRoundRoute({ playerId })
Round screen:            src/clubhouse/screens/rounds/entry/NewRound.tsx (useNewRoundSession over setup, then RoundRuntime)
Skeleton:                RoundEntrySkeleton (CH-11407) from rounds/new/loading.tsx through ClubhouseSwitch
Preview:                 /clubhouse-preview/setup -> PreviewSetup.tsx (fake ports), /clubhouse-preview/entry (the round-entry states)

CONTINUE (routed, player)
Route:                   /golf/dashboard/rounds/continue/[id] (the brief's "/rounds/[id]/continue"; /rounds/[id] redirects here for a
                         round still in progress, 110109)
Page:                    src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx (loads the round once, then
                         isClubhouseFor('player') -> Clubhouse with the loaded round, else the Fairway client with its round-type editor)
Clubhouse route adapter: src/clubhouse/routes/round-continue.tsx ClubhouseContinueRoundRoute(props)
Round screen:            src/clubhouse/screens/rounds/entry/ContinueRound.tsx (useContinueRoundSession, then RoundRuntime)
Skeleton:                RoundEntrySkeleton (CH-11407) from rounds/continue/[id]/loading.tsx
Route error:             both routes' error.tsx are the shared Fairway RouteErrorBoundary

SETUP (inside NewRound)
Screen:                  src/clubhouse/screens/rounds/setup/RoundSetup.tsx -> CoursePicker.tsx, AddCourseSheet.tsx, HoleConfig.tsx
Contract:                setup/shape.ts ChSetupPorts { listCourses, listTees, teeHoles, start } and ChSetupForm; start returns
                         ChStartResult (ok, or a failure with kind 'handled' | 'final', a code, a retry label)
Reads:                   entry/setup-reads.ts (listCoursesRead: recent, then team, then the library, deduped; listTeesRead;
                         teeHolesRead; loadSetupQualifiers, 6 s cap) and toStartForm (the engine's NewRoundStartForm)
Refusals:                entry/setup-reads.ts startRefusal maps every NewRoundStartResult failure to a state

SHOT SCREEN AND THE ROUND'S OWN SHEETS (inside both routes)
Screen:                  src/clubhouse/screens/rounds/track/RoundTracking.tsx -> ShotEntry.tsx, HoleReview.tsx, parts.tsx, sheets.tsx
Round's own sheets:      track/round-sheets.tsx (ExitSheet, ScorecardSheet, RoundCompleteSheet, SubmitOverlay), driven by props
Runtime:                 entry/RoundRuntime.tsx RoundRuntime({ session, capture, routes, errorsHeld }): draws the shot screen and
                         every sheet from one normalised ChRoundSession (entry/session.ts) that both engines map into, and owns
                         the actions' useAction instances and their in-flight guards
Ports:                   entry/ports.ts useRoundPorts (the engine's showToast -> Clubhouse toasts, no-op nav and haptics) and
                         capture(run) (runs an engine handler and keeps what it throws or toasts for the action to draw once)
Recovery:                entry/RoundRuntime.tsx RecoveryHost (RecoveryDialog), InProgressConflictDialog (new round only)
Qualifier round number:  entry/QualifierRoundSheet.tsx (Continue's Submit opens it when the round is a qualifier)
Logic:                   src/hooks/golf/use-shot-tracking.ts useShotTracking(props, ports), shared with the Fairway screen
                         (FairwayShotTracking); rules in src/lib/golf/shot-entry-rules.ts
Dev preview:             /clubhouse-preview/track -> PreviewTracking.tsx (the stand-in round screen)
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

Round entry (Start, Save for later, Discard, Change to practice, Submit) has the same shape over the engine:

```text
UI (RoundSetup's Start; RoundRuntime's Exit sheet, closed-qualifier sheet, Round complete and Submitting)
↓
Client controller: a useAction per action (rounds.start, rounds.saveForLater, rounds.discardRound, rounds.saveAsPractice):
                   offline refusal, slow notice, chReport, toast with Retry and the error haptic. Each holds its own in-flight
                   ref and reads the latest engine through a ref (111404), because a toast's Retry runs a closure made earlier
↓
Engine: src/lib/golf/round-session/ (#2104). New: useNewRoundSession({ playerId, ports, routes, logSource }) -> start(form),
        handleSaveForLater, handleDeleteRound, handleSaveAsPractice, the conflict handlers, recovery. Continue:
        useContinueRoundSession(props, { showToast }) -> the same handlers, requestRoundSubmission
↓
Server actions: savePartialRound, deleteInProgressRound, updateRoundType, submitGolfRoundComprehensive, the start guards
                (qualifier checks, the in-progress and duplicate-completed-round reads)
↓
Data: golf_rounds, golf_holes, golf_shots, the device's emergency copy
↓
Contract outcomes: CONTRACT.md · catalog CH-11007, CH-11010 to CH-11012, CH-11014 to CH-11016, CH-11514, CH-11518, CH-11519,
                   CH-11902, CH-11903 to CH-11910
↓
Tests: src/clubhouse/__tests__/round-entry-wiring.test.tsx (the real new-round engine), round-entry-continue.test.tsx (the real
       continue engine), round-entry-routes.test.tsx (nav, the pages' flag gate, the loading switch, useAction options, the
       setup reads and the notices), round-entry.test.tsx (the state components)
```

## Actions

Seven actions are registered in `config/clubhouse/pages/P011-rounds.json` (`actions`): the library's two, and the
five a routed round-entry control reaches. The whole list is readable in
`docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, an action is refused before anything is sent (the shell's
10703, CH-1903; 110702, reserved, no test). The failure toast carries Retry, which runs the whole action again (111401);
a Retry in round entry runs it against the round as it is now (111404).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P011-DISCARD | The trash button on the round card and on each "more unfinished" row, then Discard round in the question | `askDiscard` (warning haptic first, CH-11701) -> `confirmDiscard` -> `discard.run` | `discardRound` -> `writes.discard` -> `deleteInProgressRound`, then `clearEmergencySave` | golf_rounds (holes and shots cascade), the device's emergency copy | question 111101 · done 110901 · refused 110601 · waits for the server 111301 · Retry 111401 · server gate 110804 (read, not run) |
| ACT-P011-TRY-AGAIN | Try again on a failed-read notice: the library's posted rounds and in-progress check, the review's card, shots and round | `refresh` -> `router.refresh` | the server route, read again | (every read) | notices 110602 · 110603 · 110605 · 110606 · 110607 · recovery 111402 |

| ACT-P011-START | Start round in setup | `start.run(form)` (useAction `rounds.start`) -> `ports.start(form)` -> `latest.current.start(toStartForm(form))` | the new-round engine's `start(form)` (`use-new-round-session.ts`); its refusals come back as `startRefusal` states | golf_rounds, the player's saved courses | refused CH-11007 · Retry 111404 · blocked 110510 · offline 10703 · conflict CH-11514 · qualifier open CH-11907 · closed CH-11014 · unverified CH-11015 · duplicate CH-11016 |
| ACT-P011-SAVE-FOR-LATER | Save for later in the Exit sheet and the closed-qualifier sheet | `save.run` (useAction `rounds.saveForLater`) -> `handleSaveForLater` / `handleSubmitSaveAndExit` | `savePartialRound` | golf_rounds, golf_holes, golf_shots, the device's emergency copy | failed CH-11010 · Retry 111404 · offline 10703 |
| ACT-P011-DISCARD-ROUND | Discard round in the Exit sheet (asks again) and the closed-qualifier sheet | `discard.run` (useAction `rounds.discardRound`) -> `handleDeleteRound` / `handleSubmitDiscard` | `deleteInProgressRound` | golf_rounds (holes and shots cascade), the device's emergency copy | asks CH-11507 · failed CH-11006 (inline in Exit) or CH-11011 (toast, sheet closed) · Retry 111404 |
| ACT-P011-SAVE-AS-PRACTICE | Change to practice on a closed qualifier | `practice.run` (useAction `rounds.saveAsPractice`) -> `handleSaveAsPractice` | `updateRoundType` | golf_rounds (round_type, qualifier link) | failed CH-11012 (inline) · Retry 111404 |
| ACT-P011-SUBMIT-ROUND | Submit on Round complete, and Retry on the Submitting overlay | `RoundCompleteSheet` onSubmit -> `handleRoundSubmit` (new) / `requestRoundSubmission` (continue, which asks the qualifier round number first) | `submitGolfRoundComprehensive` | golf_rounds, golf_holes, golf_shots, the player stats cache | posted 110902 · failed CH-11005 · Try again 111403 · slow CH-11909 · saved on the device CH-11905 |

### Controls inside round entry (not registered)

These run through ports, the engine's shared hook or the round screen's props. They keep the contracts they had in
the preview; the round screen now supplies the ports.

| Control | Component | Handler -> what it calls | Contracts |
| --- | --- | --- | --- |
| Browse courses, a course, a tee | `CoursePicker` | `useRead` -> `ports.listCourses()`, `ports.listTees(courseId)` (setup-reads: recent, team, then the library; `listCoursesStrict`); only the latest answer of a read is kept | library CH-11510 · loading CH-11403, CH-11404 · didn't load CH-11209, CH-11208 · no tees CH-11311 · empty CH-11310 · stale read 111503 |
| Picking tees (the scorecard) | `RoundSetup` | `loadHoles` -> `ports.teeHoles(teeId)`, then `HoleConfig` edits stay in the form | loading CH-11405 · didn't load CH-11210 · edits counted 110103 · the nine 110111 |
| Add a course | `AddCourseSheet` | local until Start: `onDone(pick, holes, count, saveCourse)`; the course is the round's own (Q-72h) | CH-11511 · checks CH-11108 · start form 110110 |
| Play an open qualifier | `RoundSetup` | `playQualifier` sets the type, the course, the tees and the round; `preselectQualifierId` does the same when the engine names a qualifier round in progress | 110113 · none open CH-11312 · didn't load CH-11211 · closed 110805 |
| Recovery | `RecoveryHost` (`RecoveryDialog`) | Restore (guarded by an in-flight ref), or Discard shots after a question, through the engine's recovery state | CH-11512 · CH-11513 |
| A round already in progress | `InProgressConflictDialog` (new round only) | Continue that round, or Start a new round after a discard question (`handleConflictResume`, `handleConfirmDiscard`, `handleStartNewRound`) | CH-11514 · CH-11007 (a failed Start a new round) |
| Reload | `ReloadBanner` (and the conflict toast) | the engine's conflict message -> CH-11902 with Reload | CH-11902 |
| Next shot, Hole out | `ShotEntry` | `onNextShot` -> `useShotTracking.handleNextShot`; a holed-out hole calls `onHoleComplete(holeIndex, stats)`, which must resolve true only once the hole is durably saved | hint CH-11101 · warning and block CH-11102, CH-11103 · limit CH-11106 · saving CH-11402 · didn't save CH-11003 · Try again 111403 |
| Undo last shot | `UndoConfirm` (in `ShotEntry`, `HoleReview`) | `dispatch(SHOW_UNDO_CONFIRM)` -> `handleUndoLastShot` (`useUndoManager`) -> `deleteShot` | CH-11502 · failed CH-11002 |
| Penalty | `PenaltySheet` | `handleAddPenalty` -> `confirmPenalty` (`usePenaltyHandler`) | CH-11503 |
| Change or delete a shot | `EditShotSheet` | `handleEditShot` -> `handleSaveEditedShot` (`updateShot`), `handleDeleteShot` (`deleteShot`) | CH-11505 · failed CH-11004 · rules CH-11105 |
| Go to another hole | `TrackStrip`, `HoleReview` | `handleNavigateToHole`; a picked-but-unrecorded result asks first (`UnsavedSheet`) | CH-11504 · CH-11805 |
| Exit | `ExitSheet` (round's own) | Keep playing closes it; Save for later and Discard round are the registered actions above | CH-11506 |
| Scorecard | `ScorecardSheet` (round's own) | opens from the top bar (`onOpenScorecard`) | CH-11509 · region 111810 |
| Round complete | `RoundCompleteSheet` (round's own) | opens when every hole is in; closed, a note over the shot screen opens it again; Submit is the registered action | CH-11508 · CH-11910 |
| Submitting | `SubmitOverlay` (round's own) | saving, failed (Try again, Go back) and, after 15 s, the slow line with a link to Rounds | CH-11603 · CH-11909 · Try again 111403 |
| Qualifier round number (Continue) | `QualifierRoundSheet` | Submit on a qualifier round asks which round number first; none left gives the saved-card line | CH-11518 · CH-11519 |
| Engine notices | `noticeToast` (ports.ts) | the engine's own `showToast` messages become Clubhouse toasts: saving slow, backup degraded, saved on this device, practice saved | CH-11903 to CH-11906 · CH-11908 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/rounds/RoundsLibrary.tsx` | The library container: header, the two cards, more unfinished rounds, tools, the book, the discard question | 110101 · CH-11301, CH-11303 · CH-11201 · CH-11501 |
| `screens/rounds/parts.tsx` | `UnfinishedCard`, `SeasonCard`, `Ribbon`, `RoundRow`, `TeeSwatch`, `TypePill` | CH-11202, CH-11302, CH-11304 · CH-11802, CH-11803, CH-11801 |
| `screens/rounds/writes.ts` | The writes interface and `LIVE_ROUNDS_WRITES`; preview and tests pass their own set | (none) |
| `screens/rounds/RoundsSkeleton.tsx` | Route skeletons: the library's, and `RoundEntrySkeleton` for round entry | CH-11401 · CH-11407 |
| `screens/rounds/RoundReview.tsx` | The review: hero, figures, card, hole card, distribution, recap, notes | 110102 · CH-11204, CH-11205, CH-11305, CH-11306 · CH-11804 |
| `screens/rounds/ReviewLoadFailed.tsx` | The round itself did not load | CH-11206 |
| `routes/rounds.tsx`, `routes/round-review.tsx` | Route adapters (and the not-here page, CH-11307) | 110801 · 110802 |
| `routes/round-new.tsx`, `routes/round-continue.tsx` | Round-entry route adapters: hand the page's loaded data to `NewRound` / `ContinueRound` | 110114 |
| `screens/rounds/setup/*` | Setup, the picker, Add a course, the scorecard, and the neutral contract (`shape.ts`: `ChStartResult`) | 110103 · CH-11309, CH-11007, CH-11109, CH-11510, CH-11511 |
| `screens/rounds/track/*` | The shot screen, its entry, review, sheets and the round's own sheets | 110104 · CH-11101 to CH-11106, CH-11207, CH-11901 |
| `screens/rounds/entry/NewRound.tsx`, `ContinueRound.tsx` | The two round screens: an engine hook, its ports, the session mapped to `ChRoundSession`, then setup or `RoundRuntime` | 110103 · 110104 · CH-11907 · CH-11514 |
| `screens/rounds/entry/RoundRuntime.tsx` | The shot screen and every round sheet over one session; the four entry actions; `RecoveryHost` | 111404 · CH-11010 to CH-11012 · CH-11909 · CH-11910 |
| `screens/rounds/entry/ports.ts`, `session.ts`, `setup-reads.ts` | Engine ports, the normalised session, the setup's reads and `startRefusal` | CH-11014 to CH-11016 · CH-11902 · CH-11903 to CH-11908 |
| `screens/rounds/entry/QualifierRoundSheet.tsx` | The qualifier round number question on Continue's Submit | CH-11518 · CH-11519 |
| `screens/rounds/entry/{RecoveryDialog,InProgressConflictDialog,ReloadBanner,SaveAsPracticeSheet,failures,parts,labels}` | The entry states (Q-81), built earlier and now rendered by the round screens | CH-11512 to CH-11514 · CH-11012 · CH-11902 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`, `isOffline`; options `quiet`, `retry: false \| label`, `offline`; its in-flight gate is a ref) | Clubhouse | RoundsLibrary (`rounds.discard`), RoundSetup (`rounds.start`), RoundRuntime (`rounds.saveForLater`, `rounds.discardRound`, `rounds.saveAsPractice`), HoleReview |
| `src/lib/golf/round-session/` (`useNewRoundSession`, `useContinueRoundSession`) | Shared with the Fairway clients (#2104; not edited here) | NewRound, ContinueRound |
| `src/clubhouse/screens/rounds/entry/ports.ts` (`useRoundPorts`) | Clubhouse | NewRound, ContinueRound |
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
| listCoursesStrict, getRecentlyPlayedCourses, getTeamSavedCourses, getCourseDetail, getTeeWithHoles | actions/course-library.ts | Existing (supplied to setup as ports by `setup-reads.ts`) | the course picker |
| getNextQualifierRoundNumber and the qualifier reads | actions/ (the ones the legacy setup used) | Existing | the setup's open qualifiers (`loadSetupQualifiers`) and Continue's round-number question |
| savePartialRound, updateRoundType, submitGolfRoundComprehensive | actions/golf.ts, actions/round-type.ts | Existing | Save for later, Change to practice and Submit, through the engine |
| the round's start, checkpoints, autosave, discard-from-Exit and submit | src/lib/golf/round-session/ (`useNewRoundSession`, `useContinueRoundSession`) | Existing (moved from the legacy clients in #2104) | reach the screens as `ChSetupPorts.start` and the round screen's session |
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
- The round engine (`src/lib/golf/round-session/`, #2104) is shared with the Fairway clients and pinned by source-text
  tests (`new-round-client.*.test.ts`, `continue-round-client.*.test.ts`): Clubhouse reads its returned state and
  calls its handlers, and never edits it. A change to an engine handler's contract (what it throws, what it toasts,
  what it returns) changes both UIs; the wiring depends on `start(form)`'s failure reasons, `handleSaveForLater`
  throwing, `handleDeleteRound` and `handleSaveAsPractice` setting `error`, and the two engines wording the conflict
  message differently (`isRoundConflictMessage` matches both).
- The two round screens share one `RoundRuntime`; a change to a sheet or an action is a change to both routes.
- `useAction`'s `quiet`, `retry` and `offline` options are new and shared with the other Clubhouse screens; their defaults
  are unchanged. Its gate against a second run is now a ref, not the render's `pending`, so a Retry or a quick second call
  that reaches a `run` from an earlier render is judged on the action's real state (111404); every screen gets this.
- Both routes call `resolveClubhouseTeam`, which throws when a player's team membership read fails (the route
  error view, never "no team"). The library needs the team only for the time zone of "today", but a failed
  membership read still fails the whole library.
- A coach sees a review only for a player on the coach's active team (the team cookie), so a coach with two teams
  sees the other team's players' rounds as "not here" until they switch.
- A Clubhouse player can now review, discard, start and continue rounds (`/rounds/new` and `/rounds/continue/[id]`
  are in the shell's rebuilt list for a player, so New round, Start a round, Continue and Submit draw everywhere they
  link: the library, Home, CoachHelm). A coach's are still not drawn. Flag off, all of it stays Fairway's.
- `/rounds/recover` is rebuilt for a player (swap audit F-02; it was Fairway's until then). A submit that could not
  reach the server leaves the round on the device and opens it, `?from=submit` (CH-11905, CH-11911, `ENGINE_ROUTES` in
  `entry/routes.ts`), where Restore, Retry sync and Discard work on the rounds the device holds (CH-11017 to CH-11019,
  CH-11520). The Library does not link to it. Fairway's recovery is ported, not moved: `FairwayRecoverRound`'s tests
  pin its source, so the two share the lower layers (`round-missing-recovery`, the emergency save, the stores) and
  not the scan, which is duplicated until Fairway is retired.
- Continue's page skips the Fairway round-type editor and its qualifier reads for a Clubhouse player, so a
  round's type cannot be retyped mid-round there; Change to practice on a closed qualifier is the one retype
  (also proposed as a question).
- The entry routes' `error.tsx` files are still the shared Fairway `RouteErrorBoundary`.
- Strokes gained on the review (2026-09-30): `loadRoundReview` also selects the round's five
  `strokes_gained_*` columns and reads `golf_teams.gender` for the viewer's team (a player viewer carries an
  optional `teamId` from the route); `toReview` shapes `strokesGained` and `tour`. No new table or column.
