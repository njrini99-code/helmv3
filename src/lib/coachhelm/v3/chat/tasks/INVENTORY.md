# What the app can do, and what CoachHelm can do of it

First written before any task tool in this folder was built, so a reviewer could see the whole list first; kept up to
date as tools are added. Every action a coach or a player can take, the task tool that performs it, and what is left
to the app on purpose.

## How the list was made

Every exported `async function` in `src/app/golf/actions/**` and `src/app/actions/**` (618), less the admin, CRM and
demo files, less the reads (names beginning get, load, fetch, list, check and the like) and less the five baseball
message actions: **304 actions that change something.** The same function exported from two files is counted twice,
as it is two entry points. Each was set against the tools in `../tasks.ts`, `../readers-direct.ts` and this folder
(TOOLS.md §3 is TOOLS's own list) and against the redesign's promises: `design-refresh/coachhelm/AGENT_KIT.md`,
`TASK_FIELDS.md` §4 ("Status of every flow") and the Ask and quick chat 05 to 08 files.

## Totals

| | Actions | |
|---|---|---|
| Found | 304 | |
| Performed by a tool TOOLS built | 21 | The 20 task tools in `../tasks.ts`, plus `sendGolfPoll` through `draft_poll` (the coach sends it in Messages). Every flow in TASK_FIELDS §4 is among them. |
| Performed by a tool in this folder | 21 | Twelve task tools over nineteen actions, and the two note tools over two. |
| Performed by the chat's own cards | 12 | Save draft, Undo, folders, the tone switch, the player's Request more: a button on a card calls the action; the model does not. |
| Left to the app on purpose | 83 | The never-list below. |
| A player's own action | 21 | Player Ask has no writes (owner's call, AGENT_KIT lane 4). |
| Not a request anyone makes | 42 | Read state, generation, caches, bookkeeping. |
| Left for later | 104 | Below, in order, each with its reason. |

## The test a task tool must pass (the brief's, all three)

1. The redesign's documents promise it, or a coach would plainly ask for it by voice.
2. It wraps an existing server action, or the function that action calls, with that action's own validation and
   permissions. No new write path.
3. It is confirm-gated with a real preview: who is affected, by name and count; what they will see; when. Where
   something is sent, the card shows who gets it and the words they get.

## The tools in this folder

All are for the three coach surfaces and none is offered to a player. Each `plan` writes nothing and makes the
action's own permission check first; each `commit` is the app's action, and a write that reported a failure is looked
for before a receipt says nothing was saved (`kit.ts`, `settle`). `list.ts` is their one fixed order.

| Tool | Wraps | The card shows | Who is told |
|---|---|---|---|
| `send_event_reminder` | `sendEventReminderToPlayers` (`golf/actions/calendar-events.ts`). Fairway's event detail has the button (`src/components/golf/calendar/EventDetailModal.tsx`); Clubhouse's Calendar does not call the action yet, so there this tool is the way to do it. | The event, every recipient by name and the count, who cannot get it (no account), the reminder's title and message word for word. | The chosen players, in the app. `commit` sends nothing if the event changed after the card. |
| `record_attendance` | `markAttendance` (`golf/actions/attendance.ts`); `markNoShow` and `bulkCheckIn` are the same write. | The event, each player with the mark they will get and any mark it replaces. | Nobody. |
| `update_event` | `updateGolfEvent`, with the version the card read (`expectedUpdatedAt`), in the shape the Calendar's own move sends (`screens/calendar/move-write.ts`). One date: for a series this is the Calendar's "this date only". The Practice builder moves a practice through the same action, so this is also "reschedule a practice". | Before and after (day, time, length kept, place, title), and the series note. | The invited players, only when the event asks for replies (the app's rule): by name, with the notice's title and message word for word. |
| `cancel_event` | `deleteGolfEvent` with no options: the soft cancellation. The row and every reply are kept and the Calendar can restore it. The `hard` option (the row delete) is never passed, and a test holds that. | What happens to the event, the reason, the series note. | When the event asks for replies: the invited players, and the whole active team unless it is a meeting or its invites were sent (the app's rule), by name, with the in-app notice and the e-mail word for word. Otherwise nobody, and the card says so. |
| `set_focus_area_status` | `completeFocusArea`, `reactivateFocusArea` (`golf/actions/development.ts`), after `verifyPlayerAccess`. | Player, focus area, status before and after. | Nobody; the card says it shows on the player's development page. |
| `set_goal_state` | `pauseGoal`, `resumeGoal`, `abandonGoal` (`golf/actions/v3/goals.ts`), after `verifyPlayerAccess`. | Player, goal, state before and after, the reason kept on a close. | Nobody; the card says what changes among the player's goals. |
| `mark_signal_handled` | `acknowledgeInsight` (`golf/actions/insights-feed.ts`), after `verifyInsightAccess`. | The signal and whom it is about. | Nobody; the card says the signal will read "Acknowledged" on the player's own CoachHelm page. Established from the code: the player's board and Deep dive are built by `toChInsight`, which sets `acknowledged` from the row's status, and `stanceOf` draws the word. A test pins those lines. |
| `dismiss_signal` | `dismissInsight` (`golf/actions/insights-feed.ts`), after `verifyInsightAccess`. The row is kept. | The signal and whom it is about. | Nobody; the card says the signal also disappears from the player's own CoachHelm page. Established from the code: the app has one visibility rule for signals (`lib/coachhelm/v3/insight-visibility.ts`), which drops a dismissed one for every reader, and the player's page reads through it. A test pins those lines. After the Undo window nothing brings it back: the app's restore (`reactivateInsight`) is called only by the Undo beside a signal dismissed on the CoachHelm board in that visit, and the card says so. |
| `log_focus_progress` | `updateFocusAreaProgress` (`golf/actions/development.ts`), after `verifyPlayerAccess`. A note alone keeps the value. | Player, focus area, value before and after, the target, the note word for word, and whether the app measures this value from rounds (it then writes the value itself and can replace a typed one). | Nobody; the card says the player sees the value on their own page and that an entry's note is saved but not drawn by the focus area card. |
| `record_focus_outcome` | `recordFocusAreaOutcome` (`golf/actions/development.ts`), after `verifyPlayerAccess`. It completes the focus area and credits the signal it came from. Refused once an outcome is recorded, as the app's card hides the choice then. | Player, focus area, the outcome in the Deep dive's words, that it completes the focus area, and whether a signal is credited. | Nobody; the card says the focus area shows as completed and the signal can read the outcome on the player's own CoachHelm page. If the signal half fails the receipt is `partial` and confirming again finishes it. |
| `set_qualifier_coach_pick` | `setQualifierCoachPick` (`golf/actions/v3/qualifying.ts`), after `verifyTeamAccess`. No score or standing changes. | Qualifier, player, pick places used, the coach's reason and that only coaches read it. | Nobody. The card says what players can see: nothing until the selection is confirmed, or the pick on the board at once when it already is (`clubhouse/data/qualifiers.ts` reads selections only in state `selected`). |
| `set_task_reminder` | `setTaskReminder` (`golf/actions/tasks.ts`), after the staff check the action makes. It queues the in-app reminder only. | The task, the time (reminders go out hourly), any reminder it replaces. | Everyone the task is assigned to who has an account, finished or not, and the coach who assigned it, at that time: by name, with the reminder's title and body word for word (traced through `task-reminders.ts` and pinned by a test). |
| `save_note`, `remove_note` (`../context/notes.ts`; not tasks) | `saveCoachFact`, `deleteCoachFact` (`golf/actions/coachhelm-ask.ts`) | A chip, not a card: a note is the coach's own and saves at once. | Nobody; players never see notes. |

## Left to the app on purpose (never a tool, whatever a coach asks)

The model is told to say where the thing is done (`find_in_app` gives the place) and not to attempt it.

- **Deleting anything**: every `delete*`, `remove*`, `softDelete*`, `archive*`, `unsave*`, `detach*` and `untrack*`
  action: the permanent event delete, the series deletes ("this and following", "all": `deleteRecurringEvent` removes
  rows), messages, documents and their versions, tasks and templates, announcements, recruits and their documents,
  trips and expenses, focus areas, courses and tees, drills, plans, groups, shots, calendar feeds, team breaks, blocked
  time, tournaments.
- **Removing or deactivating a person**: `removePlayerFromTeam`, `updatePlayerStatus`, `removeGolfGroupMember`.
- **Roles, permissions and membership**: everything in `teams.ts` (join requests, staff invites, assistant coaches,
  join codes, creating or renaming a team).
- **Accounts, sign-in, onboarding, consent**: `auth.ts`, `onboarding.ts`, notification preferences, device tokens, a
  player's live-sharing choices.
- **Sending anything outside the team**: `invitePlayerToTeam`, `emailPlayerInvites`, the calendar feed links.
- **Settings that change what every figure means**: the strokes-gained baseline, CoachHelm's priorities, team settings.
- **Anything a player could use to see or change another player's data**: no player tool writes at all.

## App gaps: three things a coach asks for that the app itself cannot do

These are gaps in the app, not in the chat. Each needs a server action the app does not have; the chat adds no write
path of its own, so none of them is a tool until the action exists. The list is written to be handed to the owner.

| A coach asks | The missing action | What exists today |
| --- | --- | --- |
| "Change that task: new title, new due date, give it to Avery instead" | **A coach's update of a task**: title, description, due date and assignees of an existing `golf_tasks` row, with the assignment rows added and removed to match and the people affected told. | `src/app/golf/actions/tasks.ts` exports `createTask`, `createRecurringTask`, `deleteTask`, `setTaskReminder`, `clearTaskReminder` and the template actions. Nothing updates a task. |
| "Mark Avery's task done" / "reopen it" | **A coach's completion of a task for a named player**, and its undo. | `completeTask` and `uncompleteTask` (the same file) resolve the caller as a player and change that player's own assignment. A coach calling either is refused with "Player not found". |
| "Move Eli to group 2 in Thursday's practice" | **A change to the groups of a published practice plan** that leaves the rest of the plan alone and tells the players whose group changed. | Groups live inside the plan's body. `savePracticePlan` (`src/app/golf/actions/practice-plans.ts`) saves the whole body from the builder; there is no action for one player's group, and a whole-body save from the chat could overwrite an edit made in the builder. |

The chat has no tool for any of the three, so it can offer no card for them. `find_in_app` can name the screen
where the nearest thing lives (Team Hub Tasks, the practice builder), and `set_task_reminder` covers the one change
to an existing task the app does have.

## Left for later, in order

Room in the cached prefix was the limit while these were built (Ask stood at 20,915 of a 21,000 ceiling, which is
why every description here is one or two sentences); the ceiling is being raised to 26,000 on the lead's decision, so
the reasons below are the real ones.

1. **Clear a task's reminder** (`clearTaskReminder`): it deletes the queued reminder rows, so it stays with the
   app; `set_task_reminder` can move one.
2. **Team patterns**: traced, and there is nothing to build. What the chat calls a team pattern (`get_coachhelm`,
   part `patterns`) is worked out at read time from the signals several players share (`computeTeamPatterns`); it is
   not a row, so it has no state to dismiss or mark. `dismissPattern`, `markPatternAddressed` and `reopenPattern`
   act on something else: a stored pattern of the older engine (`golf_patterns_v2`, one player each), shown on the
   older triage desk. No chat read returns one, so the chat never has one to name, and reading them into the chat
   would put the older engine's output back in front of a coach, which is the owner's call, not a tool's.
3. **Qualifier selection beyond a pick**: confirm (`confirmQualifierSelection` tells the team, and its notice is
   composed by the selection service at confirm time, so the card cannot show the words first), a place at a tied cut
   (`chooseQualifierTiePlace`), taking a pick back, opening and closing (`advanceSelectionState`,
   `updateQualifierStatus`), and setup after creation (entrants, courses, squad size).
4. **Take a published plan down** (`takeDownPracticePlan`): who is told comes back from the take-down RPC only after
   it has run, so the card cannot name them first.
5. **A repeating series as a series** (`editRecurringEvent`, "this and following"): needs the scope on the card.
6. **Focus areas and goals, the rest**: edit a focus area (`updateFocusArea`: title, target, dates; wants the
   before and after on the card), its criteria and practice log, a team goal, and accepting or dismissing a
   suggested goal (needs a reader of suggestions). Progress and outcome are built.
7. **Recruits** (`updateRecruit`): needs a recruit reader first; recruits are outside every read tool on purpose.
8. **Messages** (new group thread, add a member, close a poll, edit a message), **trips** (edit; expenses and budget
   are money and want an owner call), **practice library** (groups, templates, drill edits), **round reviews**
   (feedback, share, publish), **round type** (it moves a round in and out of the averages), **documents from a
   file** (the chat has no file), **course library**.
9. **Tournaments** (14 actions): behind `golf_tournaments_v1`; `set_lineup` and `lock_lineup` exist.

## Every action

| Action | Where it lives | Tool | Which tool, or why none |
|---|---|---|---|
| `addGolfGroupMember` | `actions/messages.ts` | none yet | Add someone to a thread. |
| `createConversation` | `actions/messages.ts` | none, on purpose | other sports’ or the generic messages action |
| `createGolfConversation` | `actions/messages.ts` | none yet | Start a new group thread. |
| `createGolfTeamBroadcast` | `actions/messages.ts` | none yet | A broadcast thread: create_team_announcement is the team-wide send. |
| `deleteGolfMessage` | `actions/messages.ts` | none, on purpose | deletes or removes something |
| `deleteMessage` | `actions/messages.ts` | none, on purpose | deletes or removes something |
| `leaveGolfGroup` | `actions/messages.ts` | none, on purpose | deletes or removes something |
| `markGolfMessagesAsRead` | `actions/messages.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markMessagesAsRead` | `actions/messages.ts` | none, on purpose | read state |
| `removeGolfGroupMember` | `actions/messages.ts` | none, on purpose | deletes or removes something |
| `sendGolfMessage` | `actions/messages.ts` | tool exists | send_message (quick chat); draft_message (Ask) |
| `sendMessage` | `actions/messages.ts` | none, on purpose | other sports’ or the generic messages action |
| `updateGolfMessage` | `actions/messages.ts` | none yet | Edit a sent message. |
| `updateMessage` | `actions/messages.ts` | none, on purpose | other sports’ or the generic messages action |
| `updateNotificationPreferences` | `actions/notification-preferences.ts` | none, on purpose | account settings |
| `generateAlerts` | `golf/actions/alerts.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `completeAnnouncementTask` | `golf/actions/announcements.ts` | none yet | An announcement’s task. |
| `createEnrichedAnnouncement` | `golf/actions/announcements.ts` | tool exists | create_team_announcement |
| `deleteAnnouncement` | `golf/actions/announcements.ts` | none, on purpose | deletes or removes something |
| `updateAnnouncement` | `golf/actions/announcements.ts` | none yet | Edit a sent announcement. Rare by voice; needs the diff on the card. |
| `bulkCheckIn` | `golf/actions/attendance.ts` | **built now** | record_attendance (the same write) |
| `markAttendance` | `golf/actions/attendance.ts` | **built now** | record_attendance |
| `markNoShow` | `golf/actions/attendance.ts` | **built now** | record_attendance (the same write) |
| `updateAttendanceNote` | `golf/actions/attendance.ts` | none yet | A note on one attendance row; record_attendance sets the mark. |
| `loginAction` | `golf/actions/auth.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `requestPasswordResetAction` | `golf/actions/auth.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `signupAction` | `golf/actions/auth.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `signupWithStaffInviteAction` | `golf/actions/auth.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `addCoachBlockedTime` | `golf/actions/calendar-blocked-time.ts` | tool exists | add_blocked_time |
| `deleteCoachBlockedTime` | `golf/actions/calendar-blocked-time.ts` | none, on purpose | deletes or removes something |
| `updateCoachBlockedTime` | `golf/actions/calendar-blocked-time.ts` | none yet | Edit blocked time. |
| `createGolfEvent` | `golf/actions/calendar-events.ts` | tool exists | create_event |
| `deleteGolfEvent` | `golf/actions/calendar-events.ts` | **built now** | cancel_event (the soft cancellation only; never the `hard` option) |
| `deleteGolfEventPermanently` | `golf/actions/calendar-events.ts` | none, on purpose | deletes or removes something |
| `respondToEvent` | `golf/actions/calendar-events.ts` | none: a player’s own action | a player’s own reply |
| `sendEventReminderToPlayers` | `golf/actions/calendar-events.ts` | **built now** | send_event_reminder |
| `updateGolfEvent` | `golf/actions/calendar-events.ts` | **built now** | update_event (one date; the Calendar’s own path for "this date only") |
| `createCalendarFeed` | `golf/actions/calendar-feeds.ts` | none, on purpose | a secret link that leaves the app |
| `deleteCalendarFeed` | `golf/actions/calendar-feeds.ts` | none, on purpose | deletes or removes something |
| `regenerateCalendarFeed` | `golf/actions/calendar-feeds.ts` | none, on purpose | a secret link that leaves the app |
| `regenerateCalendarFeedToken` | `golf/actions/calendar-feeds.ts` | none, on purpose | a secret link that leaves the app |
| `markAllNotificationsRead` | `golf/actions/calendar-notifications.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markNotificationRead` | `golf/actions/calendar-notifications.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `removeClassFromCalendar` | `golf/actions/calendar-sync.ts` | none: a player’s own action | a player’s classes |
| `syncClassToCalendar` | `golf/actions/calendar-sync.ts` | none: a player’s own action | a player’s classes |
| `addTeamBreak` | `golf/actions/class-status.ts` | tool exists | add_team_break |
| `releaseMyHeldPushes` | `golf/actions/class-status.ts` | none: a player’s own action | a player’s own notifications |
| `removeTeamBreak` | `golf/actions/class-status.ts` | none, on purpose | deletes or removes something |
| `saveTeamTerm` | `golf/actions/class-status.ts` | tool exists | save_team_term |
| `askArtifactFolders` | `golf/actions/coachhelm-ask-artifacts.ts` | the chat’s own card | the artifact card’s folder list |
| `saveAskArtifact` | `golf/actions/coachhelm-ask-artifacts.ts` | the chat’s own card | the artifact card’s Save draft |
| `undoAskArtifact` | `golf/actions/coachhelm-ask-artifacts.ts` | the chat’s own card | the artifact card’s Undo |
| `requestAskCredits` | `golf/actions/coachhelm-ask-credits.ts` | the chat’s own card | the player’s Request more card |
| `undoAskCredits` | `golf/actions/coachhelm-ask-credits.ts` | the chat’s own card | the player’s Request more card |
| `deleteCoachFact` | `golf/actions/coachhelm-ask.ts` | **built now** | remove_note (the coach’s own note) |
| `saveCoachFact` | `golf/actions/coachhelm-ask.ts` | **built now** | save_note (saves at once; a note, not a task) |
| `setChatTone` | `golf/actions/coachhelm-ask.ts` | the chat’s own card | the tone switch in Ask |
| `recordCoachHelmCorrection` | `golf/actions/coachhelm-corrections.ts` | the chat’s own card | the answer’s own feedback control |
| `setPlanFormat` | `golf/actions/coachhelm-plan-format.ts` | the chat’s own card | the plan-format card |
| `undoPlanFormat` | `golf/actions/coachhelm-plan-format.ts` | the chat’s own card | the plan-format card |
| `postPracticePlanToChat` | `golf/actions/coachhelm-practice-plans.ts` | the chat’s own card | publish_practice_plan posts it |
| `savePracticePlanDraft` | `golf/actions/coachhelm-practice-plans.ts` | the chat’s own card | the plan card’s Save |
| `undoPracticePlanDraft` | `golf/actions/coachhelm-practice-plans.ts` | the chat’s own card | the plan card’s Undo |
| `revalidateCoachingPhilosophyPaths` | `golf/actions/coaching-philosophy.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `saveCoachingPhilosophy` | `golf/actions/coaching-philosophy.ts` | none, on purpose | team settings: how CoachHelm weighs things |
| `acknowledgeAnnouncement` | `golf/actions/communication.ts` | none: a player’s own action | a player’s own acknowledgement |
| `hideGolfConversation` | `golf/actions/conversation-hide.ts` | none, on purpose | hides a thread |
| `contributeCourseFromRound` | `golf/actions/course-library.ts` | none yet | Course library. |
| `createCourse` | `golf/actions/course-library.ts` | none yet | Course library. |
| `createTee` | `golf/actions/course-library.ts` | none yet | Course library. |
| `removeCourseImage` | `golf/actions/course-library.ts` | none, on purpose | deletes or removes something |
| `restoreCourse` | `golf/actions/course-library.ts` | none yet | Course library. |
| `restoreTee` | `golf/actions/course-library.ts` | none yet | Course library. |
| `saveTeamCourse` | `golf/actions/course-library.ts` | none yet | Course library. |
| `setCourseImageUrl` | `golf/actions/course-library.ts` | none yet | Course library. |
| `setTeamCourseDefaultTee` | `golf/actions/course-library.ts` | none yet | Course library. |
| `setTeamCoursePinned` | `golf/actions/course-library.ts` | none yet | Course library. |
| `softDeleteCourse` | `golf/actions/course-library.ts` | none, on purpose | deletes or removes something |
| `softDeleteTee` | `golf/actions/course-library.ts` | none, on purpose | deletes or removes something |
| `unsaveTeamCourse` | `golf/actions/course-library.ts` | none, on purpose | deletes or removes something |
| `updateCourse` | `golf/actions/course-library.ts` | none yet | Course library. |
| `updateTee` | `golf/actions/course-library.ts` | none yet | Course library. |
| `acceptFocusArea` | `golf/actions/development.ts` | none: a player’s own action | a player’s own answer |
| `completeFocusArea` | `golf/actions/development.ts` | **built now** | set_focus_area_status |
| `createFocusArea` | `golf/actions/development.ts` | tool exists | create_focus_area |
| `createFocusAreaFromInsight` | `golf/actions/development.ts` | none yet | A focus area from a signal: create_focus_area already takes from_insight_id. |
| `createFocusAreaFromInsightV2` | `golf/actions/development.ts` | none yet | A focus area from a signal: create_focus_area already takes from_insight_id. |
| `createFocusAreaFromReview` | `golf/actions/development.ts` | none yet | A focus area from a round review. |
| `createPlayerFocusArea` | `golf/actions/development.ts` | none yet | A focus area a player proposes for themself (player write). |
| `declineFocusArea` | `golf/actions/development.ts` | none: a player’s own action | a player’s own answer |
| `deleteFocusArea` | `golf/actions/development.ts` | none, on purpose | deletes or removes something |
| `reactivateFocusArea` | `golf/actions/development.ts` | **built now** | set_focus_area_status |
| `recordFocusAreaOutcome` | `golf/actions/development.ts` | **built now** | record_focus_outcome |
| `updateFocusArea` | `golf/actions/development.ts` | none yet | Edit a focus area. |
| `updateFocusAreaProgress` | `golf/actions/development.ts` | **built now** | log_focus_progress |
| `createDocument` | `golf/actions/documents.ts` | none yet | A document from a file; the chat has no file. publish_artifact covers text. |
| `createGolfDocument` | `golf/actions/documents.ts` | none yet | A document from a file. |
| `deleteDocument` | `golf/actions/documents.ts` | none, on purpose | deletes or removes something |
| `deleteGolfDocument` | `golf/actions/documents.ts` | none, on purpose | deletes or removes something |
| `deleteVersion` | `golf/actions/documents.ts` | none, on purpose | deletes or removes something |
| `prepareGolfDocumentUpload` | `golf/actions/documents.ts` | none yet | A file upload. |
| `revertToVersion` | `golf/actions/documents.ts` | none yet | Document versions. |
| `saveTextDocument` | `golf/actions/documents.ts` | tool exists | publish_artifact |
| `updateDocument` | `golf/actions/documents.ts` | none yet | Rename or move a document. |
| `updateGolfDocument` | `golf/actions/documents.ts` | none yet | Rename or move a document. |
| `uploadGolfDocument` | `golf/actions/documents.ts` | none yet | A file upload. |
| `uploadNewVersion` | `golf/actions/documents.ts` | none yet | A file upload. |
| `recordDrillAddedToPlan` | `golf/actions/drills.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `recordDrillView` | `golf/actions/drills.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `attachDocumentToEvent` | `golf/actions/event-documents.ts` | none yet | Attach a document to an event. |
| `detachDocumentFromEvent` | `golf/actions/event-documents.ts` | none, on purpose | deletes or removes something |
| `addFocusAreaCriterion` | `golf/actions/focus-area-practice-log.ts` | none yet | Focus area criteria. |
| `logFocusAreaPracticeSession` | `golf/actions/focus-area-practice-log.ts` | none yet | Log practice against a focus area. |
| `setFocusAreaCriterionMet` | `golf/actions/focus-area-practice-log.ts` | none yet | Focus area criteria. |
| `createSafeFlightRecorder` | `golf/actions/golf-action-shared.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `qualifierTeamIdFor` | `golf/actions/golf-action-shared.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `roundWasDiscarded` | `golf/actions/golf-action-shared.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markCelebrationShown` | `golf/actions/insight-celebration.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `refreshPlayerAnalysisAsCoach` | `golf/actions/insights-coachhelm.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `refreshTeamAnalysisAsCoach` | `golf/actions/insights-coachhelm.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `updateTeamCoachHelmSettings` | `golf/actions/insights-coachhelm.ts` | none, on purpose | team settings |
| `acknowledgeInsight` | `golf/actions/insights-feed.ts` | **built now** | mark_signal_handled |
| `dismissInsight` | `golf/actions/insights-feed.ts` | **built now** | dismiss_signal |
| `generateTeamInsights` | `golf/actions/insights-feed.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `rateInsight` | `golf/actions/insights-feed.ts` | none yet | Rate a signal. |
| `reactivateInsight` | `golf/actions/insights-feed.ts` | none yet | Bring a signal back. |
| `generatePlayerInsight` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `generatePracticeRecommendations` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `generateRoundReview` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `recordInteraction` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `verifyPlayerAccessForInsights` | `golf/actions/insights-shared.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `acknowledgeInsight` | `golf/actions/intelligence-dashboard.ts` | none yet | The older entry point to the same change; mark_signal_handled uses the one in insights-feed.ts. |
| `dismissInsight` | `golf/actions/intelligence-dashboard.ts` | none yet | The older entry point to the same change; dismiss_signal uses the one in insights-feed.ts. |
| `generateTeamCorrelations` | `golf/actions/intelligence-dashboard.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `deleteGolfMessageAttachment` | `golf/actions/message-attachments.ts` | none, on purpose | deletes or removes something |
| `sendGolfMessageWithAttachments` | `golf/actions/message-attachments.ts` | none yet | A message with files; the chat has no files to attach. |
| `setGolfConversationMute` | `golf/actions/message-mute.ts` | none, on purpose | the coach’s own notification choice |
| `closeGolfPoll` | `golf/actions/message-polls.ts` | none yet | Close a poll. Small; needs a poll reader to find it. |
| `sendGolfPoll` | `golf/actions/message-polls.ts` | tool exists | draft_poll (hands the poll to Messages; the coach sends) |
| `completeCoachOnboarding` | `golf/actions/onboarding.ts` | none, on purpose | onboarding |
| `completePlayerOnboarding` | `golf/actions/onboarding.ts` | none, on purpose | onboarding |
| `ensurePlayerRecord` | `golf/actions/onboarding.ts` | none, on purpose | onboarding |
| `dismissPattern` | `golf/actions/pattern-management.ts` | none yet | A stored pattern of the older engine (`golf_patterns_v2`), not a team pattern. No chat read returns one, so the chat has no pattern to name; see “Left for later”. |
| `markPatternAddressed` | `golf/actions/pattern-management.ts` | none yet | A stored pattern of the older engine (`golf_patterns_v2`), not a team pattern. No chat read returns one, so the chat has no pattern to name; see “Left for later”. |
| `reopenPattern` | `golf/actions/pattern-management.ts` | none yet | A stored pattern of the older engine (`golf_patterns_v2`), not a team pattern. No chat read returns one, so the chat has no pattern to name; see “Left for later”. |
| `rateInsightAsPlayer` | `golf/actions/player-feedback.ts` | none: a player’s own action | a player’s own rating |
| `markAnnouncementsSeen` | `golf/actions/player-notifications.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markTravelSeen` | `golf/actions/player-notifications.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `archiveTeamDrill` | `golf/actions/practice-library.ts` | none, on purpose | deletes or removes something |
| `copyLibraryDrill` | `golf/actions/practice-library.ts` | none yet | Copy a library drill to the team bank. |
| `createTeamDrill` | `golf/actions/practice-library.ts` | tool exists | create_drill |
| `deletePracticeGroup` | `golf/actions/practice-library.ts` | none, on purpose | deletes or removes something |
| `deletePracticeTemplate` | `golf/actions/practice-library.ts` | none, on purpose | deletes or removes something |
| `renamePracticeTemplate` | `golf/actions/practice-library.ts` | none yet | Rename a template. |
| `savePracticeGroup` | `golf/actions/practice-library.ts` | none yet | Save a practice group. |
| `savePracticeTemplate` | `golf/actions/practice-library.ts` | none yet | Save a plan as a template. |
| `updateTeamDrill` | `golf/actions/practice-library.ts` | none yet | Edit a drill. |
| `copyPlanBody` | `golf/actions/practice-plans.ts` | none yet | Copy a plan. |
| `deletePracticePlan` | `golf/actions/practice-plans.ts` | none, on purpose | deletes or removes something |
| `recordPracticePlanOpen` | `golf/actions/practice-plans.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `savePracticePlan` | `golf/actions/practice-plans.ts` | none yet | The practice builder’s own save; drafts are saved from the plan card. |
| `publishPracticePlan` | `golf/actions/practice-publish.ts` | tool exists | publish_practice_plan |
| `takeDownPracticePlan` | `golf/actions/practice-publish.ts` | none yet | Take a published plan down. Not built: who is told comes back from the take-down RPC only after it has run, so the card cannot name them first. |
| `registerDeviceToken` | `golf/actions/push-notifications.ts` | none, on purpose | the device’s own registration |
| `unregisterDeviceToken` | `golf/actions/push-notifications.ts` | none, on purpose | the device’s own registration |
| `createGolfQualifier` | `golf/actions/qualifier-actions.ts` | tool exists | create_qualifier |
| `setQualifierRoundCourses` | `golf/actions/qualifier-actions.ts` | none yet | Qualifier setup after creation. |
| `updateGolfQualifierDetails` | `golf/actions/qualifier-actions.ts` | none yet | Edit a qualifier. |
| `updateQualifierStatus` | `golf/actions/qualifier-actions.ts` | none yet | Open or close a qualifier. |
| `setQualifierEntrants` | `golf/actions/qualifier-setup.ts` | none yet | Qualifier setup after creation. |
| `setQualifierSquadSize` | `golf/actions/qualifier-setup.ts` | none yet | Qualifier setup after creation. |
| `completeRecruitDocumentUpload` | `golf/actions/recruit-documents.ts` | none yet | A file upload. |
| `deleteRecruitDocument` | `golf/actions/recruit-documents.ts` | none, on purpose | deletes or removes something |
| `prepareRecruitDocumentUpload` | `golf/actions/recruit-documents.ts` | none yet | A file upload. |
| `createRecruit` | `golf/actions/recruiting.ts` | tool exists | create_recruit |
| `deleteRecruit` | `golf/actions/recruiting.ts` | none, on purpose | deletes or removes something |
| `updateRecruit` | `golf/actions/recruiting.ts` | none yet | Move a recruit’s stage or edit their details. Plain by voice ("move Sam to offered"); needs a recruit reader first (recruits are outside every read tool on purpose). |
| `createAcademicExclusion` | `golf/actions/recurring-events.ts` | none yet | An academic exclusion on a series. |
| `createRecurringEvent` | `golf/actions/recurring-events.ts` | tool exists | create_recurring_practice |
| `deleteAcademicExclusion` | `golf/actions/recurring-events.ts` | none, on purpose | deletes or removes something |
| `deleteRecurringEvent` | `golf/actions/recurring-events.ts` | none, on purpose | deletes or removes something |
| `editRecurringEvent` | `golf/actions/recurring-events.ts` | none yet | Edit a repeating series ("this and following"). After update_event; the scope choice needs its own card. |
| `removePlayerFromTeam` | `golf/actions/roster.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `saveRoundCoachNote` | `golf/actions/round-coach-note.ts` | tool exists | add_round_note |
| `clearRoundDraft` | `golf/actions/round-drafts.ts` | none: a player’s own action | entering a round |
| `saveRoundDraft` | `golf/actions/round-drafts.ts` | none: a player’s own action | entering a round |
| `setLivePrefs` | `golf/actions/round-live.ts` | none, on purpose | a player’s consent to be watched live |
| `setLiveShare` | `golf/actions/round-live.ts` | none, on purpose | a player’s consent to be watched live |
| `setNextLiveShare` | `golf/actions/round-live.ts` | none, on purpose | a player’s consent to be watched live |
| `deleteInProgressRound` | `golf/actions/round-partial.ts` | none, on purpose | deletes or removes something |
| `savePartialRound` | `golf/actions/round-partial.ts` | none: a player’s own action | entering a round |
| `generateRoundRecap` | `golf/actions/round-recap.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `generateAndStoreRoundReview` | `golf/actions/round-review-system.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `shareRoundReviewWithCoach` | `golf/actions/round-review-system.ts` | none: a player’s own action | a player’s own choice to share |
| `acknowledgeReview` | `golf/actions/round-reviews.ts` | none: a player’s own action | a player’s own acknowledgement |
| `addPlayerFeedback` | `golf/actions/round-reviews.ts` | none: a player’s own action | a player’s own feedback |
| `annotateReview` | `golf/actions/round-reviews.ts` | none yet | Annotate a round review. |
| `generateRoundReview` | `golf/actions/round-reviews.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markReviewAsViewed` | `golf/actions/round-reviews.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markReviewViewedByCoach` | `golf/actions/round-reviews.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markReviewViewedByPlayer` | `golf/actions/round-reviews.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `publishReview` | `golf/actions/round-reviews.ts` | none yet | Publish a round review to the player. |
| `retryReviewGeneration` | `golf/actions/round-reviews.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `saveCoachFeedback` | `golf/actions/round-reviews.ts` | none yet | Coach feedback on a round review: add_round_note covers the note on a round. |
| `shareReviewWithPlayer` | `golf/actions/round-reviews.ts` | none yet | Share a round review with the player. |
| `submitGolfRoundComprehensive` | `golf/actions/round-submit.ts` | none: a player’s own action | entering a round |
| `updateRoundType` | `golf/actions/round-type.ts` | none yet | Change a round’s type (it moves the round in and out of averages: wants a preview of the figures that move). |
| `savePlayerCourse` | `golf/actions/saved-courses.ts` | none: a player’s own action | a player’s saved courses |
| `touchSavedCourse` | `golf/actions/saved-courses.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `extractClassesFromScheduleImage` | `golf/actions/schedule-image.ts` | none: a player’s own action | a player’s classes |
| `deleteShot` | `golf/actions/shot-actions.ts` | none, on purpose | deletes or removes something |
| `updateShot` | `golf/actions/shot-actions.ts` | none: a player’s own action | editing their own round |
| `dismissSignal` | `golf/actions/signal-groups.ts` | **built now** | dismiss_signal (for an insight it is the same write) |
| `reviewSignal` | `golf/actions/signal-groups.ts` | **built now** | mark_signal_handled (for an insight it is the same write) |
| `verifyPlayerAccess` | `golf/actions/stats-data.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markStatsStaleAction` | `golf/actions/stats.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `onRoundCompleteAction` | `golf/actions/stats.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `refreshStatsCacheAction` | `golf/actions/stats.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markReminderSent` | `golf/actions/task-reminders.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `processReminders` | `golf/actions/task-reminders.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `setTaskReminder` | `golf/actions/task-reminders.ts` | none yet | A second entry point that can queue e-mail and push reminders; set_task_reminder uses the one in tasks.ts, which queues the in-app reminder only. |
| `clearTaskReminder` | `golf/actions/tasks.ts` | none yet | Clear a task reminder. |
| `completeTask` | `golf/actions/tasks.ts` | none: a player’s own action | a player ticks their own task |
| `createRecurringTask` | `golf/actions/tasks.ts` | none yet | A repeating task. |
| `createTask` | `golf/actions/tasks.ts` | tool exists | create_task |
| `createTaskFromTemplate` | `golf/actions/tasks.ts` | none yet | A task from a template. |
| `createTaskTemplate` | `golf/actions/tasks.ts` | none yet | Save a task template. |
| `deleteTask` | `golf/actions/tasks.ts` | none, on purpose | deletes or removes something |
| `deleteTaskTemplate` | `golf/actions/tasks.ts` | none, on purpose | deletes or removes something |
| `seedDefaultTemplates` | `golf/actions/tasks.ts` | none yet | Seeds task templates. |
| `setTaskReminder` | `golf/actions/tasks.ts` | **built now** | set_task_reminder |
| `uncompleteTask` | `golf/actions/tasks.ts` | none: a player’s own action | a player unticks their own task |
| `updateTaskTemplate` | `golf/actions/tasks.ts` | none yet | Edit a task template. |
| `createAnnouncement` | `golf/actions/team-management.ts` | none yet | The older announcement action; create_team_announcement wraps the current one. |
| `emailPlayerInvites` | `golf/actions/team-management.ts` | none, on purpose | accounts; sends outside the team |
| `invitePlayerToTeam` | `golf/actions/team-management.ts` | none, on purpose | accounts; sends outside the team |
| `setPlayerAvailability` | `golf/actions/team-management.ts` | none, on purpose | a player’s own status, set by the player |
| `setPlayerAvailabilityCoachNote` | `golf/actions/team-management.ts` | tool exists | set_availability_note |
| `updatePlayerStatus` | `golf/actions/team-management.ts` | none, on purpose | deactivating a person |
| `setTeamSgBaseline` | `golf/actions/team-sg-baseline.ts` | none, on purpose | team settings: it changes every strokes-gained figure |
| `clearActiveTeam` | `golf/actions/team-switcher.ts` | none, on purpose | which team the coach is signed into |
| `setActiveTeam` | `golf/actions/team-switcher.ts` | none, on purpose | which team the coach is signed into |
| `acceptJoinRequest` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `addSecondTeam` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `approvePendingAssistantCoach` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `createStaffInvite` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `createTeam` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `createTeamJoinRequest` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `declinePendingAssistantCoach` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `joinGolfTeam` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `processGolfTeamInvitation` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `redeemStaffInvite` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `regenerateJoinCode` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `rejectJoinRequest` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `updateTeam` | `golf/actions/teams.ts` | none, on purpose | accounts, sign-in, roles, join requests or removing a person |
| `createTournamentFromCalendar` | `golf/actions/tournaments-calendar.ts` | none yet | Flag golf_tournaments_v1. |
| `setTournamentCancelled` | `golf/actions/tournaments-calendar.ts` | none yet | Flag golf_tournaments_v1. |
| `untrackTournament` | `golf/actions/tournaments-calendar.ts` | none, on purpose | deletes or removes something |
| `updateTournamentRound` | `golf/actions/tournaments-calendar.ts` | none yet | Flag golf_tournaments_v1. |
| `saveTournamentHole` | `golf/actions/tournaments-holes.ts` | none yet | Flag golf_tournaments_v1. |
| `saveTournamentReflection` | `golf/actions/tournaments-player.ts` | none: a player’s own action | a player’s own reflection |
| `createTournament` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `deleteTournament` | `golf/actions/tournaments.ts` | none, on purpose | deletes or removes something |
| `dismissTournamentLink` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `enterTournamentScore` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `linkTournamentRound` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `lockTournamentLineup` | `golf/actions/tournaments.ts` | tool exists | lock_lineup (flag) |
| `markTournament` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `publishTournamentLineup` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1; tells the team the lineup. |
| `saveTournamentReview` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `setTournamentEntries` | `golf/actions/tournaments.ts` | tool exists | set_lineup (flag) |
| `setTournamentRoundStatus` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `substituteTournamentPlayer` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `updateTournament` | `golf/actions/tournaments.ts` | none yet | Flag golf_tournaments_v1. |
| `createGolfTravelItinerary` | `golf/actions/travel.ts` | tool exists | create_trip |
| `createTravelExpense` | `golf/actions/travel.ts` | none yet | Log a trip expense (money: owner call). |
| `deleteGolfTravelItinerary` | `golf/actions/travel.ts` | none, on purpose | deletes or removes something |
| `deleteTravelExpense` | `golf/actions/travel.ts` | none, on purpose | deletes or removes something |
| `setBudget` | `golf/actions/travel.ts` | none yet | Set a travel budget (money: owner call). |
| `updateGolfTravelItinerary` | `golf/actions/travel.ts` | none yet | Edit a trip. |
| `updateTravelExpense` | `golf/actions/travel.ts` | none yet | Edit a trip expense (money: owner call). |
| `uploadExpenseReceipt` | `golf/actions/travel.ts` | none yet | A file upload; not a chat action. |
| `markAllNotificationsRead` | `golf/actions/unified-notifications.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markNotificationRead` | `golf/actions/unified-notifications.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `abandonGoal` | `golf/actions/v3/goals.ts` | **built now** | set_goal_state |
| `acceptGoalSuggestion` | `golf/actions/v3/goals.ts` | none yet | Accept a suggested goal. |
| `createGoal` | `golf/actions/v3/goals.ts` | tool exists | create_goal |
| `createTeamGoal` | `golf/actions/v3/goals.ts` | none yet | A team goal. |
| `dismissGoalSuggestion` | `golf/actions/v3/goals.ts` | none yet | Dismiss a suggested goal. |
| `pauseGoal` | `golf/actions/v3/goals.ts` | **built now** | set_goal_state |
| `resumeGoal` | `golf/actions/v3/goals.ts` | **built now** | set_goal_state |
| `bulkSetIntent` | `golf/actions/v3/intent.ts` | none yet | CoachHelm intent for players. |
| `setIntent` | `golf/actions/v3/intent.ts` | none yet | CoachHelm intent for a player. |
| `generateHeroNarrative` | `golf/actions/v3/llm.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `setAllChannels` | `golf/actions/v3/notification-prefs.ts` | none, on purpose | account settings |
| `setCategoryChannel` | `golf/actions/v3/notification-prefs.ts` | none, on purpose | account settings |
| `setQuietMode` | `golf/actions/v3/notification-prefs.ts` | none, on purpose | account settings |
| `generatePracticeRx` | `golf/actions/v3/practice-rx.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `advanceSelectionState` | `golf/actions/v3/qualifying.ts` | none yet | Qualifier selection: it decides who travels, so it wants its own card and an owner call. |
| `chooseQualifierTiePlace` | `golf/actions/v3/qualifying.ts` | none yet | Qualifier selection (tie). |
| `confirmQualifierSelection` | `golf/actions/v3/qualifying.ts` | none yet | Confirms the squad and tells the team. Not built: the notice is composed by the selection service at confirm time, so the card cannot show its words first. |
| `removeQualifierCoachPick` | `golf/actions/v3/qualifying.ts` | none yet | Takes a pick back. Left to the Qualifiers screen for now: it removes a selection row. |
| `setQualifierCoachPick` | `golf/actions/v3/qualifying.ts` | **built now** | set_qualifier_coach_pick |
| `generateTeamPracticeRx` | `golf/actions/v3/team-practice-rx.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
