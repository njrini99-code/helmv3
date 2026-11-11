# What the app can do, and what CoachHelm can do of it

Written before any task tool in this folder was built, so a reviewer can see the whole list first: every action a
coach or a player can take, the task tool that already performs it, what is proposed here, and what is left to the app
on purpose.

## How the list was made

Every exported `async function` in `src/app/golf/actions/**` and `src/app/actions/**` (618), less the admin, CRM and
demo files, less the reads (names beginning get, load, fetch, list, check and the like) and less the five baseball
message actions: **304 actions that change something.** The same function exported from two files is counted twice,
as it is two entry points. Each was set against the tools in `../tasks.ts` and `../readers-direct.ts` (TOOLS.md §3 is
TOOLS's own list of what is covered) and against the redesign's promises: `design-refresh/coachhelm/AGENT_KIT.md`,
`TASK_FIELDS.md` §4 ("Status of every flow") and the Ask and quick chat 05 to 08 files.

## Totals

| | Actions | |
|---|---|---|
| Found | 304 | |
| Already performed by a tool | 21 | The 20 task tools TOOLS built, plus `sendGolfPoll` through `draft_poll` (the coach sends it in Messages). Every flow in TASK_FIELDS §4 is among them. |
| Performed by the chat's own cards | 12 | Save draft, Undo, folders, the tone switch, the player's Request more: a button on a card calls the action; the model does not. |
| Built now | 6 | Two task tools (`send_event_reminder`, `record_attendance`, over four actions) and the two note tools (over two). |
| Left to the app on purpose | 83 | The never-list below. |
| A player's own action | 21 | Player Ask has no writes (owner's call, AGENT_KIT lane 4). |
| Not a request anyone makes | 42 | Read state, generation, caches, bookkeeping. |
| Left for later | 119 | Real gaps, in the order under "Left for later". |

## The test a new task tool must pass (the brief's, all three)

1. The redesign's documents promise it, or a coach would plainly ask for it by voice.
2. It wraps an existing server action, or the function that action calls, with that action's own validation and
   permissions. No new write path.
3. It is confirm-gated with a real preview: who is affected, by name and count; what they will see; when.

## Built now

| Tool | Wraps | Why it passes | The card shows |
|---|---|---|---|
| `send_event_reminder` | `sendEventReminderToPlayers(eventId, playerIds)` (`golf/actions/calendar-events.ts`) | "Remind everyone who hasn't replied about Saturday" is the plainest voice request the calendar has. Fairway's event detail has the button (`src/components/golf/calendar/EventDetailModal.tsx`); Clubhouse's Calendar does not call the action yet, so in Clubhouse this tool is the way to do it. The action checks the coach is on the event's team's staff and narrows the recipients to that team's active players itself. A repeat lands on the same notification rows (its own upsert key), so a retried commit cannot double-send. | The event; every recipient by name and the count; the reminder word for word (title and message, built with the same two functions the action uses); that it is an in-app notification and goes after the Undo window. |
| `record_attendance` | `markAttendance(eventId, playerId, mark)` (`golf/actions/attendance.ts`); `markNoShow` and `bulkCheckIn` are the same write | "Mark everyone here today except Eli" by voice, at the practice. The action authorises the coach for the event and requires each player to be an active member. It overwrites the mark, so a retry is the same rows. | The event; each player by name with the mark they will get and the mark they have now; the counts; "Nothing is sent to players." |
| `save_note`, `remove_note` (not tasks: `../context/notes.ts`) | `saveCoachFact`, `deleteCoachFact` (`golf/actions/coachhelm-ask.ts`) | The brief's item 3. A note is the coach's own and saves at once with a chip; the only removal any tool here performs is of the coach's own note, at their word. | A chip, not a card. |

Both task tools are for the three coach surfaces. Neither is offered to a player.

## Left to the app on purpose (never a tool, whatever a coach asks)

The model is told to say where the thing is done (`find_in_app` gives the place) and not to attempt it.

- **Deleting anything**: every `delete*`, `remove*`, `softDelete*`, `archive*`, `unsave*`, `detach*` and `untrack*`
  action: events (the permanent delete), messages, documents and their versions, tasks and templates, announcements,
  recruits and their documents, trips and expenses, focus areas, courses and tees, drills, plans, groups, shots,
  calendar feeds, team breaks, blocked time, tournaments.
- **Removing or deactivating a person**: `removePlayerFromTeam`, `updatePlayerStatus`, `removeGolfGroupMember`.
- **Roles, permissions and membership**: everything in `teams.ts` (join requests, staff invites, assistant coaches,
  join codes, creating or renaming a team).
- **Accounts, sign-in, onboarding, consent**: `auth.ts`, `onboarding.ts`, notification preferences, device tokens, a
  player's live-sharing choices.
- **Sending anything outside the team**: `invitePlayerToTeam`, `emailPlayerInvites`, the calendar feed links.
- **Settings that change what every figure means**: the strokes-gained baseline, CoachHelm's priorities, team settings.
- **Anything a player could use to see or change another player's data**: no player tool writes at all.

## Left for later, in order

1. **Move or edit an event** (`updateGolfEvent`). The next one to build. A change of time or place tells every invitee
   of an event with replies on, and that notice's words are made by a private formatter in `lib/calendar/rsvp.ts`
   (`notifyEventUpdate`). Export that formatter first, so the card's "they will see" and the notice are one function
   and cannot drift; then the tool is `plan` (read the event and its `updated_at`), `commit` (the action with
   `expectedUpdatedAt`, which already refuses a stale card).
2. **Cancel an event** (`deleteGolfEvent`, the default soft cancellation). Owner's call first: the action is the app's
   Delete button, it tells every invitee in-app and by e-mail, and the never-list says no deleting. The row is kept, so
   it can be argued either way; it is not built until the owner says which.
3. **A reminder on a task** (`setTaskReminder`): ask/06 `f_task.brief` asks "When should I remind them?" and
   `create_task` does not set it. TOOLS owns `create_task`; this is a field for that tool, not a new one.
4. **Signals: handled, dismissed** (`acknowledgeInsight`, `dismissInsight`, `reviewSignal`, `dismissSignal`,
   patterns). Small, and plain on the CoachHelm board. The permission check is an exported function
   (`verifyInsightAccess`, `src/lib/auth/verify-player-access.ts`), so `plan` can make the action's own check. Not
   built now for one reason: each action also writes a row with `recordInsightAction` (the coach acknowledged or
   dismissed), and whether the player's own CoachHelm page shows that row was not established. The card's "what the
   player sees" line must be true before this ships.
5. **Qualifier after creation** (entrants, courses, squad size, open and close) and **selection** (coach picks, ties,
   confirm). Selection decides who travels and tells the team: its own card, and an owner call.
6. **Goals and focus areas after creation** (pause, resume, progress, complete, outcome).
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
| `deleteGolfEvent` | `golf/actions/calendar-events.ts` | none yet | Cancel an event (soft: the row stays, every invitee is told in-app and by e-mail). A coach will ask for it by voice. Owner call first: it is the app’s Delete button and cannot be un-told. |
| `deleteGolfEventPermanently` | `golf/actions/calendar-events.ts` | none, on purpose | deletes or removes something |
| `respondToEvent` | `golf/actions/calendar-events.ts` | none: a player’s own action | a player’s own reply |
| `sendEventReminderToPlayers` | `golf/actions/calendar-events.ts` | **built now** | send_event_reminder |
| `updateGolfEvent` | `golf/actions/calendar-events.ts` | none yet | Move or edit an event. Next to build. Needs the update notice word for word, and its wording lives in a private formatter in lib/calendar/rsvp.ts (notifyEventUpdate); export it first so the card and the notice cannot drift. |
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
| `completeFocusArea` | `golf/actions/development.ts` | none yet | Close a focus area. Needs the outcome fields the app asks for. |
| `createFocusArea` | `golf/actions/development.ts` | tool exists | create_focus_area |
| `createFocusAreaFromInsight` | `golf/actions/development.ts` | none yet | A focus area from a signal: create_focus_area already takes from_insight_id. |
| `createFocusAreaFromInsightV2` | `golf/actions/development.ts` | none yet | A focus area from a signal: create_focus_area already takes from_insight_id. |
| `createFocusAreaFromReview` | `golf/actions/development.ts` | none yet | A focus area from a round review. |
| `createPlayerFocusArea` | `golf/actions/development.ts` | none yet | A focus area a player proposes for themself (player write). |
| `declineFocusArea` | `golf/actions/development.ts` | none: a player’s own action | a player’s own answer |
| `deleteFocusArea` | `golf/actions/development.ts` | none, on purpose | deletes or removes something |
| `reactivateFocusArea` | `golf/actions/development.ts` | none yet | Reopen a focus area. |
| `recordFocusAreaOutcome` | `golf/actions/development.ts` | none yet | Record how a focus area ended. |
| `updateFocusArea` | `golf/actions/development.ts` | none yet | Edit a focus area. |
| `updateFocusAreaProgress` | `golf/actions/development.ts` | none yet | Log progress on a focus area. |
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
| `acknowledgeInsight` | `golf/actions/insights-feed.ts` | none yet | Mark a signal handled. Plain on the CoachHelm board; small. |
| `dismissInsight` | `golf/actions/insights-feed.ts` | none yet | Dismiss a signal. |
| `generateTeamInsights` | `golf/actions/insights-feed.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `rateInsight` | `golf/actions/insights-feed.ts` | none yet | Rate a signal. |
| `reactivateInsight` | `golf/actions/insights-feed.ts` | none yet | Bring a signal back. |
| `generatePlayerInsight` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `generatePracticeRecommendations` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `generateRoundReview` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `recordInteraction` | `golf/actions/insights-player-analysis.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `verifyPlayerAccessForInsights` | `golf/actions/insights-shared.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `acknowledgeInsight` | `golf/actions/intelligence-dashboard.ts` | none yet | Mark a signal handled. Plain on the CoachHelm board; small. |
| `dismissInsight` | `golf/actions/intelligence-dashboard.ts` | none yet | Dismiss a signal. |
| `generateTeamCorrelations` | `golf/actions/intelligence-dashboard.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `deleteGolfMessageAttachment` | `golf/actions/message-attachments.ts` | none, on purpose | deletes or removes something |
| `sendGolfMessageWithAttachments` | `golf/actions/message-attachments.ts` | none yet | A message with files; the chat has no files to attach. |
| `setGolfConversationMute` | `golf/actions/message-mute.ts` | none, on purpose | the coach’s own notification choice |
| `closeGolfPoll` | `golf/actions/message-polls.ts` | none yet | Close a poll. Small; needs a poll reader to find it. |
| `sendGolfPoll` | `golf/actions/message-polls.ts` | tool exists | draft_poll (hands the poll to Messages; the coach sends) |
| `completeCoachOnboarding` | `golf/actions/onboarding.ts` | none, on purpose | onboarding |
| `completePlayerOnboarding` | `golf/actions/onboarding.ts` | none, on purpose | onboarding |
| `ensurePlayerRecord` | `golf/actions/onboarding.ts` | none, on purpose | onboarding |
| `dismissPattern` | `golf/actions/pattern-management.ts` | none yet | Dismiss a team pattern. |
| `markPatternAddressed` | `golf/actions/pattern-management.ts` | none yet | Mark a pattern addressed. |
| `reopenPattern` | `golf/actions/pattern-management.ts` | none yet | Reopen a pattern. |
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
| `takeDownPracticePlan` | `golf/actions/practice-publish.ts` | none yet | Take a published plan down (players are told once). |
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
| `dismissSignal` | `golf/actions/signal-groups.ts` | none yet | Dismiss a signal. |
| `reviewSignal` | `golf/actions/signal-groups.ts` | none yet | Mark a signal reviewed. |
| `verifyPlayerAccess` | `golf/actions/stats-data.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markStatsStaleAction` | `golf/actions/stats.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `onRoundCompleteAction` | `golf/actions/stats.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `refreshStatsCacheAction` | `golf/actions/stats.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `markReminderSent` | `golf/actions/task-reminders.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `processReminders` | `golf/actions/task-reminders.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `setTaskReminder` | `golf/actions/task-reminders.ts` | none yet | A reminder on a task (ask/06 f_task.brief asks "When should I remind them?"; create_task does not set it yet). |
| `clearTaskReminder` | `golf/actions/tasks.ts` | none yet | Clear a task reminder. |
| `completeTask` | `golf/actions/tasks.ts` | none: a player’s own action | a player ticks their own task |
| `createRecurringTask` | `golf/actions/tasks.ts` | none yet | A repeating task. |
| `createTask` | `golf/actions/tasks.ts` | tool exists | create_task |
| `createTaskFromTemplate` | `golf/actions/tasks.ts` | none yet | A task from a template. |
| `createTaskTemplate` | `golf/actions/tasks.ts` | none yet | Save a task template. |
| `deleteTask` | `golf/actions/tasks.ts` | none, on purpose | deletes or removes something |
| `deleteTaskTemplate` | `golf/actions/tasks.ts` | none, on purpose | deletes or removes something |
| `seedDefaultTemplates` | `golf/actions/tasks.ts` | none yet | Seeds task templates. |
| `setTaskReminder` | `golf/actions/tasks.ts` | none yet | A reminder on a task (ask/06 f_task.brief asks "When should I remind them?"; create_task does not set it yet). |
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
| `abandonGoal` | `golf/actions/v3/goals.ts` | none yet | Abandon a goal. |
| `acceptGoalSuggestion` | `golf/actions/v3/goals.ts` | none yet | Accept a suggested goal. |
| `createGoal` | `golf/actions/v3/goals.ts` | tool exists | create_goal |
| `createTeamGoal` | `golf/actions/v3/goals.ts` | none yet | A team goal. |
| `dismissGoalSuggestion` | `golf/actions/v3/goals.ts` | none yet | Dismiss a suggested goal. |
| `pauseGoal` | `golf/actions/v3/goals.ts` | none yet | Pause a goal. |
| `resumeGoal` | `golf/actions/v3/goals.ts` | none yet | Resume a goal. |
| `bulkSetIntent` | `golf/actions/v3/intent.ts` | none yet | CoachHelm intent for players. |
| `setIntent` | `golf/actions/v3/intent.ts` | none yet | CoachHelm intent for a player. |
| `generateHeroNarrative` | `golf/actions/v3/llm.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `setAllChannels` | `golf/actions/v3/notification-prefs.ts` | none, on purpose | account settings |
| `setCategoryChannel` | `golf/actions/v3/notification-prefs.ts` | none, on purpose | account settings |
| `setQuietMode` | `golf/actions/v3/notification-prefs.ts` | none, on purpose | account settings |
| `generatePracticeRx` | `golf/actions/v3/practice-rx.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
| `advanceSelectionState` | `golf/actions/v3/qualifying.ts` | none yet | Qualifier selection: it decides who travels, so it wants its own card and an owner call. |
| `chooseQualifierTiePlace` | `golf/actions/v3/qualifying.ts` | none yet | Qualifier selection (tie). |
| `confirmQualifierSelection` | `golf/actions/v3/qualifying.ts` | none yet | Qualifier selection: tells the team who made it. |
| `removeQualifierCoachPick` | `golf/actions/v3/qualifying.ts` | none yet | Qualifier selection (coach pick). |
| `setQualifierCoachPick` | `golf/actions/v3/qualifying.ts` | none yet | Qualifier selection (coach pick). |
| `generateTeamPracticeRx` | `golf/actions/v3/team-practice-rx.ts` | none: not a request | bookkeeping the app does by itself (read state, generation, caches); nobody asks for it |
