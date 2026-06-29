# Agent 3: team-shared features — DONE

Investigation methodology: read each action file + route page; cross-checked schema in `supabase/migrations/` and generated types in `src/lib/types/database.ts`; grepped for realtime channels.

## Per-surface verdict

- **Calendar & Events: WIRED.** Server fetch real `golf_events` rows (`src/app/golf/(dashboard)/dashboard/calendar/page.tsx:69-77`), realtime subscription on `calendar-events` channel (`src/components/golf/calendar/PremiumCalendarClient.tsx:342-356`), full CRUD on events in `src/app/golf/actions/golf.ts` (createEvent ~L1820, updateEvent L2076-2134, RSVP L2614-2652). Recurring events also wired (`src/app/golf/actions/recurring-events.ts`).

- **Roster: PARTIAL.** Read works (`src/app/golf/(dashboard)/dashboard/roster/page.tsx:321`, server fetches via `golf_team_members`). Removal works (`src/app/golf/actions/roster.ts:52-108`). **Email invitations are stubbed** — `invitePlayerToTeam` accepts an `_email` parameter but only generates/returns the team `join_code`; no email is ever sent (`src/app/golf/actions/golf.ts:2493-2552`, comment: "reserved for future email invitations"). No `addPlayer`/`updatePlayer` mutation in `roster.ts`.

- **Messaging: WIRED.** Full realtime via `useGolfMessages` (`src/hooks/golf/use-golf-messages.ts:132-227`) — INSERT/UPDATE on `golf_messages` + read receipts on `golf_conversation_participants` + typing broadcast. Conversation list also realtime (lines 707-735). Send/edit/soft-delete CRUD all real (`src/app/actions/messages.ts:42-170, 711-862`). Push + email + in-app notifications fan out (`src/app/actions/messages.ts:371-452`). Team broadcast (group chat) works (`src/app/actions/messages.ts:478-616`). Search works (lines 923-1083).

- **Announcements: PARTIAL.** Create with linked tasks/documents/recipients works (`src/app/golf/actions/announcements.ts:86-260`). Read with meta (acknowledgements, completion) works (lines 277-460). Delete works (lines 722-764). **No `updateAnnouncement` action** — once posted, an announcement cannot be edited (only deleted). No realtime — list relies on `revalidate=120` (`src/app/golf/(dashboard)/dashboard/announcements/page.tsx:18`).

- **Tasks: WIRED.** Full create/delete/complete/uncomplete (`src/app/golf/actions/tasks.ts:389-595`). Realtime via `useTaskRealtime` (`src/hooks/golf/use-task-realtime.ts:223-241`). Templates have full CRUD (lines 760-1024). **No `updateTask` action** — coaches cannot edit a task's title/description/due-date after creation. Reminders work (`setTaskReminder` L597, `clearTaskReminder` L672).

- **Documents: WIRED.** Supabase Storage bucket `documents` (private) with signed URLs (`src/app/golf/actions/documents.ts:638-714`). Full CRUD: createDocument L165, updateDocument L241, deleteDocument L298, version history with revert/compare (L443-635), uploadNewVersion L351, getTextFileContent L953. Player visibility flag (`is_public`) gate-keeps player view (`src/app/golf/(dashboard)/dashboard/documents/page.tsx:96-98`). No realtime; uses `revalidate=300`.

- **Travel: WIRED.** Real `golf_travel_itineraries` query (`src/app/golf/(dashboard)/dashboard/travel/page.tsx:50-55`). Full itinerary CRUD (`src/app/golf/actions/travel.ts:120, 202, 315`), expense CRUD with receipt upload (L464-784), CSV export (L786), budgets (L869-919). **Hardcoded nulls**: `check_in_date`/`check_out_date` set to `null` because columns don't exist in DB (`src/app/golf/(dashboard)/dashboard/travel/page.tsx:73-74` "Not in database schema").

- **Qualifiers (view): WIRED.** Real query of `golf_qualifiers` filtered by team (`src/app/golf/(dashboard)/dashboard/qualifiers/page.tsx:49-55`). Full detail/entry/scoring lives in `golf.ts`.

- **Team Info: WIRED.** Coach view shows team settings via `TeamSettingsClient`; player view aggregates teammates, announcements, tasks (`src/app/golf/(dashboard)/dashboard/team/page.tsx:91-188`). Team CRUD in `teams.ts` (`createTeam` L299, `updateTeam` L378, `regenerateJoinCode` L451, join-request workflow L528-1015).

## Top wiring gaps (ranked)

1. **[BLOCKER] `src/app/golf/actions/attendance.ts:102, 161` — `checkInPlayer`/`bulkCheckIn` write `responded_at` column that does NOT exist in production.** Generated types (`src/lib/types/database.ts:6755-6791`) show actual columns are `checked_in`, `checked_in_at`, `notes`, `notified_at`, `rsvp_at`. Coach check-in upserts likely silently drop the `responded_at` payload (or fail under strict mode), and `getAttendanceReport` returns `responded_at` (line 44, 293) which is always null. Fix: replace `responded_at` writes with `rsvp_at` (or `checked_in_at` for actual check-in), and read those instead.

2. **[BLOCKER] `src/app/golf/actions/attendance.ts:395-404` — `verifyQRCodeCheckIn` is a stub that always returns error.** Comment admits the schema lacks a `qr_token` column. Any QR-based check-in UI is dead.

3. **[MAJOR] `src/app/golf/actions/announcements.ts` — no `updateAnnouncement` action.** Coaches can create or delete an announcement but cannot edit it (no UI affordance either). Fix: add an update action mirroring the delete authorization flow.

4. **[MAJOR] `src/app/golf/actions/tasks.ts` — no `updateTask` action.** A coach cannot fix a typo, change due date, or reassign a task; only delete and recreate. Fix: add an update action with same coach/team-scoped auth as `createTask`.

5. **[MAJOR] `src/app/golf/actions/golf.ts:2493-2552` — `invitePlayerToTeam` ignores the `_email` parameter.** UI implies email invitation but only the join code link is returned. Fix: integrate Resend (already used elsewhere — see `RESEND_SETUP.md`) to send the invite link by email.

6. **[MAJOR] `src/app/golf/actions/attendance.ts:261-307` — `getAttendanceReport` does not aggregate (TODO at line 272).** Coach view only sees per-row records; no headcount summary. Combined with #1, the coach attendance dashboard is effectively blank.

7. **[MINOR] `src/app/golf/actions/attendance.ts:320-381` — `getPlayerAttendanceStats` aggregates in JS** because `golf_player_attendance_stats` view doesn't exist (TODO L317). Works but won't scale.

8. **[MINOR] `src/app/golf/(dashboard)/dashboard/travel/page.tsx:73-74` — `check_in_date` / `check_out_date` hardcoded to null.** Travel client likely renders empty fields. Either remove from UI or add columns.

9. **[MINOR] Announcements + Documents + Travel + Roster have no realtime channels.** Mutations rely on `revalidatePath` + page-level `revalidate` cache. Coaches and players will not see each other's edits without a refresh. Lower urgency since these aren't conversational.

## Summary

Messaging and Calendar are production-ready (full CRUD + realtime). Tasks and Documents are solid except for missing `updateTask` and lack of edit on announcements. Travel and Team Info are wired end-to-end. The biggest red flag is **Attendance**: column-name drift between `attendance.ts` (uses `responded_at`) and the live schema (uses `rsvp_at`/`checked_in_at`) means coach check-in is broken, and QR check-in is an explicit stub. Roster invitations are still join-code-only despite an email parameter that suggests otherwise.
