# Agent C: small majors — DONE

## Fixes

### MAJOR 8 (my-development progress UI)
- Created `src/app/golf/(dashboard)/dashboard/my-development/LogProgressButton.tsx` (new client component, 137 lines).
  - Renders a "Log progress" pill button.
  - Tap opens a `BottomSheet` modal with: read-only current value, numeric input for new value, optional progress note (textarea), and a Save/Cancel pair.
  - Submit calls `updateFocusAreaProgress(focusAreaId, parsedNumber)` from `@/app/golf/actions/development` and `router.refresh()` on success.
  - The action's existing signature is `(id, currentValue: number)` — only 2 args — so the note is collected for UX (with a hint that it isn't yet persisted) but not sent to the server. A comment in the file flags this for the day the action grows a `note` parameter into `progress_notes` jsonb.
- Wired the button into `src/app/golf/(dashboard)/dashboard/my-development/page.tsx`:
  - Added import at line 22.
  - Replaced the standalone "Started …" date paragraph (was lines ~265-274) with a footer row containing the date plus the `<LogProgressButton …>` for each active focus area card (now lines ~266-285). Buttons appear only on active/in-progress areas (completed-areas section unchanged).

### MAJOR 10 (updateAnnouncement)
- Added `updateAnnouncement(announcementId, partial)` to `src/app/golf/actions/announcements.ts` (lines ~722-810, immediately above `deleteAnnouncement`).
  - Accepts `partial: { title?, body?, urgency? }`; only sets the keys that are explicitly passed.
  - Auth: mirrors `createEnrichedAnnouncement` — fetches user, looks up their `golf_coaches` row, derives `teamId` via `getCoachTeamId(coach.organization_id)`, and verifies the announcement's `team_id` matches before any update.
  - Validates lengths (title 1..200, body 1..10000) and urgency enum to mirror the create-side `createAnnouncementSchema`.
  - Returns `{ success: false, error: 'No fields to update' }` when called with an empty `partial`.
  - Calls `revalidatePath('/golf/dashboard/announcements')` and `updateTag(CACHE_TAGS.DASHBOARD)` on success.

### MAJOR 11 (updateTask)
- Added `updateTask(taskId, partial)` to `src/app/golf/actions/tasks.ts` (lines ~516-621, immediately above `deleteTask`).
  - Accepts `partial: { title?, description?, due_date?, priority? }`.
  - Auth gate mirrors `createTask` exactly: fetches user, requires a `golf_coaches` row, requires `coach.organization_id`, fetches the target `golf_tasks` row, then verifies the task's `team_id` belongs to a `golf_teams` row in the coach's organization. Same error strings as createTask for consistency.
  - Builds the update payload from the partial (only writes provided keys); always sets `updated_at`. Returns success no-op if no real fields were passed.
  - Calls `revalidatePath('/golf/dashboard/tasks')` and `updateTag(CACHE_TAGS.DASHBOARD)`.

### MAJOR 12 (alerts.ts)
- KEPT the file. Reason: `generateAlerts` (line 325 in alerts.ts) has TWO live consumers:
  - `src/app/golf/(dashboard)/dashboard/alerts/page.tsx:40,176`
  - `src/components/golf/coachhelm/alerts/CoachAlertCenter.tsx:33,84`
  Deleting `alerts.ts` would break both pages. The other six exports (`getCoachAlerts`, `getAlertCounts`, `dismissAlert`, `acknowledgeAlert`, `dismissAllAlerts`, `acknowledgeAllAlerts`) have NO callers anywhere in `src/`.
- Added a TODO block at the top of `src/app/golf/actions/alerts.ts` (lines 4-22 of the new file) listing all confirmed `generateAlerts` consumers and explicitly enumerating the 6 orphan exports plus their line ranges, so the next cleanup pass can remove them safely.

## Verification
- `npx tsc --noEmit` — clean for all modified files (`actions/announcements.ts`, `actions/tasks.ts`, `actions/alerts.ts`, `my-development/page.tsx`, `my-development/LogProgressButton.tsx`). The only output errors are pre-existing in the unrelated `helm-vid/` sibling project and one stale `.next/types/validator.ts` reference to `api/golf/rounds/generate-review/route.js` — none touch this agent's files.
- `npx eslint` on the same five files — clean (no warnings, no errors).
- `npx vitest run src/test/golf/actions/development.test.ts` — 3/3 pass (existing `createFocusAreaFromInsight` and `updateFocusAreaProgress` tests still green; ownership-guard semantics untouched).
- No tests existed for tasks.ts / announcements.ts / alerts.ts, so nothing else to regress.
